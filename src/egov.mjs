import { id, sha256, NAMESPACE } from './identity.mjs';

export const METHOD = 'egov-structure-v0.1';
export const PDL = 'https://www.digital.go.jp/resources/open_data/public_data_license_v1.0';
export const TEXT_METHOD = 'egov-descendant-strings-v1';
const provisionTags = /^(Article|Paragraph|Item|Subitem[0-9]+)$/;

export function textOf(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return (value.children ?? []).map(textOf).join('');
}

export function atPointer(value, pointer) {
  if (pointer === '') return value;
  if (!pointer.startsWith('/')) throw new Error('Invalid JSON Pointer');
  return pointer.slice(1).split('/').reduce((v, key) => v?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], value);
}

export function buildGraph(inputs, asOf) {
  if (!inputs.length) throw new Error('At least one article response is required');
  const graph = {
    schema_version: 'law-graph.v0',
    namespace: NAMESPACE,
    laws: [], law_revisions: [], provisions: [], provision_versions: [],
    concepts: [], sources: [], source_versions: [], evidence_refs: [],
    relations: [], observations: [], coverage: []
  };
  const unique = new Map();
  const artifacts = new Map();
  let revisionKey;
  const locators = [];
  function add(collection, record) {
    const old = unique.get(record.id);
    if (old && sha256(old) !== sha256(record)) throw new Error('Conflicting ID: ' + record.id);
    if (!old) { unique.set(record.id, record); graph[collection].push(record); }
    return record.id;
  }
  function relation(type, from, to, evidenceId, targetRef = null) {
    add('relations', {
      id: id('relation', METHOD, type, from, to, evidenceId, targetRef),
      type, from_id: from, to_id: to, target_ref: targetRef,
      basis: 'explicit_text', method: METHOD,
      resolution: to ? 'resolved' : 'unresolved', review: 'unreviewed',
      evidence_ref_ids: [evidenceId]
    });
  }
  for (const input of inputs) {
    const { payload, request_url: requestUrl, observed_at: observedAt } = input;
    const law = payload.law_info;
    const rev = payload.revision_info;
    const article = payload.law_full_text;
    if (!law?.law_id || !rev?.law_revision_id || article?.tag !== 'Article' || !article.attr?.Num) {
      throw new Error('Expected an e-Gov main-provision Article response');
    }
    if (rev.current_revision_status !== 'CurrentEnforced' || !rev.amendment_enforcement_date ||
        rev.amendment_enforcement_date > asOf) {
      throw new Error('Initial importer accepts current enforced revisions only');
    }
    if (!observedAt || new Date(observedAt).toString() === 'Invalid Date') throw new Error('Invalid observed_at');
    if (new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(observedAt)) !== asOf) {
      throw new Error('as_of must match the observation day in Asia/Tokyo');
    }
    const request = new URL(requestUrl);
    if (request.origin !== 'https://laws.e-gov.go.jp' || !request.pathname.startsWith('/api/2/law_data/')) {
      throw new Error('Expected an official e-Gov law_data URL');
    }
    const selection = 'LawBody-MainProvision-Article_' + article.attr.Num;
    if (request.searchParams.get('elm') !== selection) throw new Error('Selection does not match returned article');
    const requestedId = decodeURIComponent(request.pathname.split('/').at(-1));
    if (![law.law_id, rev.law_revision_id].includes(requestedId)) throw new Error('Requested law/revision mismatch');
    if (revisionKey && revisionKey !== rev.law_revision_id) throw new Error('Mixed revisions; retry with one pinned revision');
    revisionKey = rev.law_revision_id;
    const lawId = add('laws', { id: id('law', 'JP', 'egov-law-id', law.law_id), jurisdiction: 'JP', upstream_law_id: law.law_id });
    const revisionId = add('law_revisions', {
      id: id('law-revision', lawId, rev.law_revision_id),
      law_id: lawId, upstream_revision_id: rev.law_revision_id, title: rev.law_title,
      effective_from: rev.amendment_enforcement_date
    });
    const sourceId = add('sources', {
      id: id('source', 'egov', law.law_id), provider: 'egov',
      upstream_ids: { law_id: law.law_id },
      url: 'https://laws.e-gov.go.jp/law/' + law.law_id,
      license: 'CC-BY-4.0', source_terms: PDL
    });
    const hash = sha256(payload);
    const versionId = id('source-version', sourceId, rev.law_revision_id, selection, 'application/json', hash);
    const artifactPath = 'sources/' + versionId + '.json';
    add('source_versions', {
      id: versionId, source_id: sourceId, upstream_revision_id: rev.law_revision_id,
      selection, content_type: 'application/json', content_sha256: hash,
      canonicalization: 'sorted-json-v1', artifact_path: artifactPath,
      retrieval_url: requestUrl
    });
    artifacts.set(artifactPath, payload);
    graph.observations.push({ source_version_id: versionId, observed_at: observedAt, request_url: requestUrl });
    function walk(node, pointer, parentId, parentLocator) {
      if (typeof node !== 'object' || !node) return;
      let nextParent = parentId;
      let nextLocator = parentLocator;
      if (provisionTags.test(node.tag)) {
        if (!node.attr?.Num) throw new Error('Missing provision number');
        const locator = parentLocator + '/' + node.tag.toLowerCase() + ':' + node.attr.Num;
        const text = textOf(node);
        const evidenceId = add('evidence_refs', {
          id: id('evidence-ref', versionId, pointer, TEXT_METHOD),
          source_version_id: versionId, locator: pointer,
          extraction_method: TEXT_METHOD, text_sha256: sha256(text)
        });
        const provisionId = add('provisions', {
          id: id('provision', lawId, revisionId, locator),
          law_id: lawId, anchor_revision_id: revisionId, anchor_locator: locator
        });
        const provisionVersionId = add('provision_versions', {
          id: id('provision-version', provisionId, revisionId),
          provision_id: provisionId, law_revision_id: revisionId,
          locator, level: node.tag, text,
          evidence_ref_ids: [evidenceId], text_sha256: sha256(text)
        });
        relation('contains', parentId ?? revisionId, provisionVersionId, evidenceId);
        const ownSentence = (node.children ?? []).filter(c => c?.tag === 'ParagraphSentence').map(textOf).join('');
        if (node.tag === 'Paragraph') {
          for (const match of ownSentence.matchAll(/この法律において「([^「」]+)」とは、/gu)) {
            const label = match[1];
            const conceptId = add('concepts', {
              id: id('concept', lawId, label), law_id: lawId, label, aliases: []
            });
            relation('defines', provisionVersionId, conceptId, evidenceId);
          }
          if (ownSentence.includes('政令で定める')) {
            relation('delegates_to', provisionVersionId, null, evidenceId,
              { raw: '政令で定める', expected_kind: 'CabinetOrder' });
          }
        }
        locators.push(locator);
        nextParent = provisionVersionId;
        nextLocator = locator;
      }
      for (const [index, child] of (node.children ?? []).entries()) {
        walk(child, pointer + '/children/' + index, nextParent, nextLocator);
      }
    }
    walk(article, '/law_full_text', null, 'main');
  }
  const lawRevision = graph.law_revisions[0];
  graph.coverage.push({
    law_id: lawRevision.law_id, law_revision_id: lawRevision.id,
    as_of: asOf, status: 'partial', locators: [...new Set(locators)].sort(),
    relation_types: ['contains', 'defines', 'delegates_to'],
    extractor: METHOD,
    limits: [
      'Selected main-provision articles only; no historical or future coverage.',
      'Definitions match only the literal この法律において「…」とは、 pattern.',
      'Cabinet Order phrases are unresolved candidates; no target is inferred.',
      'No comprehensive citations, exceptions, or legal applicability analysis.'
    ]
  });
  for (const collection of Object.values(graph)) if (Array.isArray(collection)) {
    collection.sort((a, b) => (a.id ?? a.source_version_id ?? '').localeCompare(b.id ?? b.source_version_id ?? ''));
  }
  return { graph, artifacts };
}

import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { canonical, id, sha256 } from './identity.mjs';
import { atPointer, textOf, TEXT_METHOD, METHOD, PDL } from './egov.mjs';
import { validateAssertion } from './assertions.mjs';

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(JSON.parse(readFileSync(new URL('../schemas/graph.schema.json', import.meta.url), 'utf8')));
const collections = ['laws', 'law_revisions', 'provisions', 'provision_versions', 'concepts', 'sources', 'source_versions', 'evidence_refs', 'relations', 'intents', 'authorities'];

export function validateGraph(graph, readArtifact) {
  if (!validateSchema(graph)) throw new Error('Schema: ' + ajv.errorsText(validateSchema.errors));
  const maps = Object.fromEntries(collections.map(k => [k, new Map((graph[k] ?? []).map(x => [x.id, x]))]));
  const all = new Map();
  function check(condition, message) { if (!condition) throw new Error(message); }
  function get(kind, key) {
    const found = maps[kind].get(key);
    check(found, 'Missing ' + kind + ': ' + key);
    return found;
  }
  function identity(record, expected) { check(record.id === expected, 'Identity mismatch: ' + record.id); }
  for (const kind of collections) for (const record of graph[kind] ?? []) {
    check(!all.has(record.id), 'Duplicate ID: ' + record.id);
    all.set(record.id, { ...record, kind });
  }
  check(graph.laws.length > 0 && graph.provision_versions.length > 0 && graph.coverage.length > 0, 'Empty corpus');
  for (const law of graph.laws) identity(law, id('law', law.jurisdiction, 'egov-law-id', law.upstream_law_id));
  for (const rev of graph.law_revisions) {
    const law = get('laws', rev.law_id);
    identity(rev, id('law-revision', law.id, rev.upstream_revision_id));
  }
  for (const source of graph.sources) {
    identity(source, id('source', source.provider, source.upstream_ids.law_id));
    check(source.url === 'https://laws.e-gov.go.jp/law/' + source.upstream_ids.law_id, 'Source URL mismatch');
    check(source.source_terms === PDL, 'Source terms mismatch');
  }
  const payloads = new Map();
  for (const version of graph.source_versions) {
    const source = get('sources', version.source_id);
    identity(version, id('source-version', source.id, version.upstream_revision_id, version.selection, version.content_type, version.content_sha256));
    check(version.artifact_path === 'sources/' + version.id + '.json', 'Artifact path mismatch');
    const payload = readArtifact(version.artifact_path);
    check(sha256(payload) === version.content_sha256, 'Source artifact hash mismatch: ' + version.id);
    check(payload.law_info?.law_id === source.upstream_ids.law_id &&
      payload.revision_info?.law_revision_id === version.upstream_revision_id, 'Source upstream ID mismatch');
    check(payload.revision_info.current_revision_status === 'CurrentEnforced', 'Source revision is not current-enforced');
    const url = new URL(version.retrieval_url);
    check(url.origin === 'https://laws.e-gov.go.jp' &&
      url.pathname.startsWith('/api/2/law_data/') &&
      [source.upstream_ids.law_id, version.upstream_revision_id].includes(decodeURIComponent(url.pathname.split('/').at(-1))) &&
      url.searchParams.get('elm') === version.selection, 'Source request mismatch');
    check(payload.law_full_text?.tag === 'Article' &&
      version.selection === 'LawBody-MainProvision-Article_' + payload.law_full_text.attr?.Num, 'Source selection mismatch');
    payloads.set(version.id, payload);
  }
  for (const evidence of graph.evidence_refs) {
    get('source_versions', evidence.source_version_id);
    identity(evidence, id('evidence-ref', evidence.source_version_id, evidence.locator, TEXT_METHOD));
    const node = atPointer(payloads.get(evidence.source_version_id), evidence.locator);
    check(node && sha256(textOf(node)) === evidence.text_sha256, 'Evidence text hash mismatch: ' + evidence.id);
  }
  for (const provision of graph.provisions) {
    get('laws', provision.law_id);
    check(get('law_revisions', provision.anchor_revision_id).law_id === provision.law_id, 'Provision anchor law mismatch');
    identity(provision, id('provision', provision.law_id, provision.anchor_revision_id, provision.anchor_locator));
  }
  for (const version of graph.provision_versions) {
    const provision = get('provisions', version.provision_id);
    const rev = get('law_revisions', version.law_revision_id);
    check(provision.law_id === rev.law_id, 'Provision/revision law mismatch');
    identity(version, id('provision-version', provision.id, rev.id));
    check(sha256(version.text) === version.text_sha256, 'Provision text hash mismatch');
    for (const key of version.evidence_ref_ids) {
      const evidence = get('evidence_refs', key);
      const sourceVersion = get('source_versions', evidence.source_version_id);
      const source = get('sources', sourceVersion.source_id);
      const payload = payloads.get(sourceVersion.id);
      const node = atPointer(payload, evidence.locator);
      check(evidence.text_sha256 === version.text_sha256 && textOf(node) === version.text, 'Provision/evidence text mismatch');
      check(node.tag === version.level && sourceVersion.upstream_revision_id === rev.upstream_revision_id &&
        source.upstream_ids.law_id === get('laws', rev.law_id).upstream_law_id, 'Provision evidence identity mismatch');
      const selected = payload.law_full_text;
      let expectedLocator = 'main/article:' + selected.attr.Num;
      let cursor = selected;
      const steps = evidence.locator.split('/').slice(2);
      for (let i = 0; i < steps.length; i += 2) {
        cursor = cursor.children[Number(steps[i + 1])];
        if (/^(Article|Paragraph|Item|Subitem[0-9]+)$/.test(cursor.tag)) expectedLocator += '/' + cursor.tag.toLowerCase() + ':' + cursor.attr.Num;
      }
      check(version.locator === expectedLocator && provision.anchor_locator === version.locator, 'Provision locator mismatch');
      check(payload.revision_info.amendment_enforcement_date === rev.effective_from, 'Revision effective date mismatch');
    }
  }
  for (const concept of graph.concepts) {
    get('laws', concept.law_id);
    identity(concept, id('concept', concept.law_id, concept.label));
  }
  for (const intent of graph.intents ?? []) identity(intent, id('intent', intent.slug));
  for (const authority of graph.authorities ?? []) identity(authority, id('authority', authority.jurisdiction, authority.label));
  for (const relation of graph.relations) {
    const from = all.get(relation.from_id);
    const to = relation.to_id ? all.get(relation.to_id) : null;
    check(from && (!relation.to_id || to), 'Dangling relation endpoint');
    if (relation.method !== METHOD) {
      validateAssertion(relation, { all, get, check });
      continue;
    }
    identity(relation, id('relation', METHOD, relation.type, relation.from_id, relation.to_id, relation.evidence_ref_ids[0], relation.target_ref));
    check(relation.evidence_ref_ids.length === 1, 'v0 relations require one exact evidence reference');
    const evidence = get('evidence_refs', relation.evidence_ref_ids[0]);
    const evidenceText = textOf(atPointer(payloads.get(evidence.source_version_id), evidence.locator));
    if (relation.type === 'contains') {
      check(to?.kind === 'provision_versions' && relation.resolution === 'resolved' && relation.target_ref === null, 'Invalid containment target');
      check(to.evidence_ref_ids.includes(evidence.id), 'Containment evidence mismatch');
      check((from.kind === 'law_revisions' && to.law_revision_id === from.id && to.level === 'Article') ||
        (from.kind === 'provision_versions' && from.law_revision_id === to.law_revision_id &&
          to.locator.slice(0, to.locator.lastIndexOf('/')) === from.locator), 'Invalid containment hierarchy');
    } else {
      check(from.kind === 'provision_versions' && from.level === 'Paragraph' && from.evidence_ref_ids.includes(evidence.id), 'Relation evidence mismatch');
      if (relation.type === 'defines') {
        check(to?.kind === 'concepts' && relation.resolution === 'resolved' && relation.target_ref === null &&
          to.law_id === get('law_revisions', from.law_revision_id).law_id &&
          evidenceText.includes('この法律において「' + to.label + '」とは、'), 'Definition is not supported by evidence');
      } else {
        check(relation.to_id === null && relation.resolution === 'unresolved' &&
          relation.target_ref?.raw === '政令で定める' && evidenceText.includes('政令で定める'), 'Delegation must remain an evidenced unresolved candidate');
      }
    }
  }
  check(graph.observations.length > 0, 'Missing source observations');
  for (const observation of graph.observations) {
    const version = get('source_versions', observation.source_version_id);
    check(observation.request_url === version.retrieval_url, 'Observation request mismatch');
  }
  for (const coverage of graph.coverage) {
    const rev = get('law_revisions', coverage.law_revision_id);
    check(coverage.law_id === rev.law_id && coverage.as_of >= rev.effective_from, 'Coverage revision mismatch');
    const versions = graph.provision_versions.filter(x => x.law_revision_id === rev.id);
    check(canonical([...coverage.locators].sort()) === canonical(versions.map(x => x.locator).sort()), 'Coverage locator mismatch');
    check(canonical([...coverage.relation_types].sort()) === canonical(['contains', 'defines', 'delegates_to']), 'Coverage relation types mismatch');
    const sourceIds = new Set(versions.flatMap(x => x.evidence_ref_ids).map(key => get('evidence_refs', key).source_version_id));
    for (const key of sourceIds) {
      const observations = graph.observations.filter(x => x.source_version_id === key);
      check(observations.some(x => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(x.observed_at)) === coverage.as_of),
        'Coverage has no observation on its declared day');
    }
  }
  check(graph.provision_versions.every(v => graph.coverage.some(c => c.law_revision_id === v.law_revision_id)), 'Uncovered provision');
  return { valid: true, records: all.size, relations: graph.relations.length, source_versions: graph.source_versions.length };
}

export function loadGraph(file, dataRoot) {
  const root = realpathSync(dataRoot);
  const graph = JSON.parse(readFileSync(file, 'utf8'));
  validateGraph(graph, path => {
    const full = realpathSync(resolve(root, path));
    if (!full.startsWith(root + sep)) throw new Error('Artifact escapes the data directory');
    return JSON.parse(readFileSync(full, 'utf8'));
  });
  return graph;
}

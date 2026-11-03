import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { id, sha256, snapshotId } from './identity.mjs';

export const DEFAULT_CASE_GRAPH = new URL('../data/cases/', import.meta.url);
const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);
const schema = JSON.parse(readFileSync(new URL('../schemas/cases.schema.json', import.meta.url), 'utf8'));
const validSchema = ajv.compile(schema);
const collections = ['topics', 'issues', 'cases', 'claims', 'sources', 'source_versions', 'evidence_refs', 'relations', 'reviews'];

export function validateCaseGraph(graph) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  check(validSchema(graph), 'Case schema: ' + ajv.errorsText(validSchema.errors));
  const all = new Map();
  for (const collection of collections) for (const record of graph[collection]) {
    check(!all.has(record.id), 'Duplicate case-graph ID: ' + record.id);
    all.set(record.id, { record, collection });
  }
  function get(key, collection) {
    const found = all.get(key);
    check(found && (!collection || found.collection === collection), 'Missing/wrong case-graph reference: ' + key);
    return found.record;
  }
  function identity(record, expected) { check(record.id === expected, 'Case identity mismatch: ' + record.id); }
  function publicUrl(value) {
    const u = new URL(value);
    check(u.protocol === 'https:' && !u.username && !u.password && !u.port, 'Expected public HTTPS source URL');
    check(!/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(u.hostname) &&
      !u.hostname.startsWith('[') && !u.hostname.endsWith('.local') && u.hostname.includes('.'), 'Private source host');
    check(![...u.searchParams.keys()].some(k => /token|secret|password|signature|api.?key|authorization|code/i.test(k)), 'Credential-bearing source URL');
  }
  for (const topic of graph.topics) identity(topic, id('topic', 'JP', topic.key));
  for (const issue of graph.issues) identity(issue, id('issue', 'JP', issue.key));
  for (const source of graph.sources) {
    identity(source, id('source', source.provider, source.document_key));
    publicUrl(source.url);
    const host=new URL(source.url).hostname;
    if (source.kind==='judgment') check(host==='courts.go.jp'||host.endsWith('.courts.go.jp'),'Judicial primary source must use an official courts domain');
    if (['administrative_publication','regulatory_guidance'].includes(source.kind)) check(host.endsWith('.go.jp')||host.endsWith('.lg.jp'),'Agency primary source must use a Japanese government domain');
  }
  for (const version of graph.source_versions) {
    get(version.source_id, 'sources');
    identity(version, id('source-version', version.source_id, null, 'full_document', version.content_type, version.content_sha256));
  }
  for (const evidence of graph.evidence_refs) {
    const version = get(evidence.source_version_id, 'source_versions');
    identity(evidence, id('evidence-ref', version.id, evidence.locator, 'document-locator-v1'));
    check((version.content_type === 'application/pdf' && evidence.locator.kind === 'pdf_pages' && evidence.locator.pages.length > 0) ||
      (version.content_type === 'text/html' && evidence.locator.kind === 'html_section' && evidence.locator.pages.length === 0), 'Locator/media mismatch');
  }
  function sourceKinds(evidenceIds) {
    return evidenceIds.map(key => get(get(get(key, 'evidence_refs').source_version_id, 'source_versions').source_id, 'sources').kind);
  }
  for (const entry of graph.cases) {
    identity(entry, id('case', entry.jurisdiction, entry.key));
    const kinds = sourceKinds(entry.evidence_ref_ids);
    if (entry.kind === 'judgment') {
      check(kinds.length>0 && kinds.every(k=>k==='judgment') && entry.docket_number, 'Judgment needs judicial evidence and docket');
    } else if (entry.kind === 'administrative_action') {
      check(kinds.length>0 && kinds.every(k=>k==='administrative_publication'), 'Administrative case needs agency evidence');
    } else check(kinds.length>0 && kinds.every(k=>k==='business_publication'), 'Business example needs business-publication evidence');
    for (const key of entry.claim_ids) check(get(key, 'claims').case_id === entry.id, 'Claim/case mismatch');
  }
  for (const claim of graph.claims) {
    const entry = get(claim.case_id, 'cases');
    identity(claim, id('case-claim', entry.id, claim.kind, claim.text, claim.evidence_ref_ids));
    check(entry.claim_ids.includes(claim.id), 'Orphan case claim');
    const kinds = sourceKinds(claim.evidence_ref_ids);
    const caseSources=new Set(entry.evidence_ref_ids.map(key=>get(key,'evidence_refs').source_version_id));
    check(claim.evidence_ref_ids.every(key=>caseSources.has(get(key,'evidence_refs').source_version_id)),'Claim evidence is not from its case source versions');
    if (claim.kind === 'court_finding') check(entry.kind === 'judgment' && kinds.every(k => k === 'judgment'), 'Court finding needs a judgment source');
    if (claim.kind === 'regulator_finding') check(entry.kind === 'administrative_action' && kinds.every(k => k === 'administrative_publication'), 'Regulator finding needs agency source');
    if (claim.kind === 'party_allegation') check(entry.kind === 'judgment', 'Party allegation needs a judicial case');
  }
  for (const relation of graph.relations) {
    const from = all.get(relation.from_id);
    const to = all.get(relation.to_id);
    check(from && to, 'Dangling case relation');
    identity(relation, id('case-relation', relation.type, relation.from_id, relation.to_id, relation.evidence_ref_ids, relation.material_differences));
    sourceKinds(relation.evidence_ref_ids);
    if (relation.type === 'raises') {
      check(from.collection === 'topics' && to.collection === 'issues', 'Invalid topic/issue relation');
    } else {
      check(from.collection === 'issues' && relation.evidence_ref_ids.length > 0, 'Issue evidence is required');
      if (relation.type === 'illustrated_by') {
        check(to.collection === 'cases', 'Issue illustration must target a case');
        check(relation.evidence_ref_ids.every(key => to.record.evidence_ref_ids.includes(key) ||
          to.record.claim_ids.some(c => get(c, 'claims').evidence_ref_ids.includes(key))), 'Case relation evidence is unrelated to its case');
      } else {
        check(to.collection === 'sources' && ['regulatory_guidance', 'industry_guideline'].includes(to.record.kind), 'Guidance relation cannot target a judgment or a business example');
        check(relation.evidence_ref_ids.every(key => get(get(key, 'evidence_refs').source_version_id, 'source_versions').source_id === to.record.id), 'Guidance evidence/source mismatch');
      }
    }
  }
  for (const observation of graph.observations) {
    const version = get(observation.source_version_id, 'source_versions');
    publicUrl(observation.request_url);
    check(observation.request_url === get(version.source_id, 'sources').url, 'Case observation URL mismatch');
  }
  for (const version of graph.source_versions) check(graph.observations.some(o => o.source_version_id === version.id), 'Unobserved case source version');
  check(graph.coverage.length > 0, 'Missing case coverage');
  for (const coverage of graph.coverage) {
    for (const key of coverage.topic_ids) get(key, 'topics');
    for (const key of coverage.case_ids) get(key, 'cases');
    check(graph.observations.some(o => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo'}).format(new Date(o.observed_at)) === coverage.observed_on), 'Coverage observation day mismatch');
  }
  check(graph.cases.every(c => graph.coverage.some(x => x.case_ids.includes(c.id))), 'Case missing from coverage');
  const seenReviews = new Set();
  for (const review of graph.reviews) {
    const subject = get(review.subject_id);
    check(all.get(subject.id).collection !== 'reviews', 'Invalid review subject');
    const {id: reviewId, ...content} = review;
    identity(review, id('case-review', content));
    if (review.supersedes_id) {
      check(seenReviews.has(review.supersedes_id), 'Review supersession must refer to an earlier record');
      const previous = get(review.supersedes_id, 'reviews');
      check(previous.subject_id === review.subject_id && previous.scope === review.scope && previous.recorded_at <= review.recorded_at, 'Invalid review supersession');
    }
    seenReviews.add(reviewId);
  }
  return { valid: true, topics: graph.topics.length, issues: graph.issues.length, cases: graph.cases.length,
    sources: graph.sources.length, claims: graph.claims.length, relations: graph.relations.length, review_records: graph.reviews.length,
    stale_review_records:graph.reviews.filter(r=>sha256(get(r.subject_id))!==r.subject_sha256).length };
}

export function loadCaseGraph(file = DEFAULT_CASE_GRAPH) {
  if (statSync(file).isDirectory()) {
    const files = [];
    function walk(dir) {
      for (const entry of readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
        const path = join(dir,entry.name);
        if (entry.isSymbolicLink()) throw new Error('Case corpus cannot contain symbolic links');
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.case-graph.json')) files.push(path);
      }
    }
    walk(file instanceof URL ? fileURLToPath(file) : file);
    if (!files.length) throw new Error('No case-graph files found');
    return mergeCaseGraphs(files.map(path=>loadCaseGraph(path)));
  }
  const graph = JSON.parse(readFileSync(file, 'utf8'));
  validateCaseGraph(graph);
  return graph;
}

export function mergeCaseGraphs(graphs) {
  const merged = {schema_version:'law-graph.cases.v0'};
  for (const key of [...collections,'observations','coverage']) merged[key]=[];
  for (const key of [...collections,'observations','coverage']) {
    const seen = new Map();
    for (const graph of graphs) for (const record of graph[key]) {
      const identity = record.id ?? sha256(record);
      if (seen.has(identity) && sha256(seen.get(identity)) !== sha256(record)) throw new Error('Conflicting case-corpus record: '+identity);
      if (!seen.has(identity)) { seen.set(identity,record); merged[key].push(record); }
    }
  }
  validateCaseGraph(merged);
  return merged;
}

export function createCaseQuery(graph) {
  const all = new Map();
  for (const key of collections) for (const record of graph[key]) all.set(record.id, record);
  const base = () => ({
    schema_version: graph.schema_version, snapshot_id: snapshotId(graph), status: 'research_candidates',
    coverage: graph.coverage, current_applicability: 'not_assessed',
    review_identity: 'declared_in_records_not_authenticated',
    source_integrity: 'hashes_and_locators_recorded_originals_not_bundled'
  });
  const reviewsFor = key => graph.reviews.filter(r => r.subject_id === key).map(r=>({...r,subject_matches_current:sha256(all.get(key))===r.subject_sha256}));
  function evidence(keys) {
    return keys.map(key => {
      const e = all.get(key), v = all.get(e.source_version_id), s = all.get(v.source_id);
      return { evidence_ref_id:e.id, source_version_id:v.id, source_id:s.id,
        source_kind:s.kind, publisher:s.publisher, url:s.url, upstream_ids:s.upstream_ids,
        content_sha256:v.content_sha256, locator:e.locator, support_note:e.support_note,
        original_bundled:false, verification:e.verification };
    });
  }
  function caseResult(entry, full = false) {
    const claims = entry.claim_ids.map(key => all.get(key));
    return {
      ...entry,
      claims: (full ? claims : claims.slice(0,2)).map(c => full ?
        ({...c,provenance:evidence(c.evidence_ref_ids),reviews:reviewsFor(c.id)}) :
        ({...c,text:c.text.slice(0,500),text_truncated:c.text.length>500})),
      claims_truncated:!full && claims.length>2,
      provenance:evidence(entry.evidence_ref_ids), reviews:reviewsFor(entry.id),
      ready_for_legal_reliance:false,
      ...(full ? { relations: graph.relations.filter(r => r.to_id === entry.id).map(r => ({...r,provenance:evidence(r.evidence_ref_ids)})) } : {})
    };
  }
  return {
    search_cases({query, kind, limit = 10}) {
      const tokens = query.normalize('NFKC').trim().split(/\s+/u).filter(Boolean);
      if (!tokens.length) throw new Error('query must not be blank');
      const matchingTopics = graph.topics.filter(t => tokens.every(token => [t.label,...t.aliases].join(' ').normalize('NFKC').toLowerCase().includes(token.toLowerCase())));
      const issueIds = new Set(graph.relations.filter(r => r.type === 'raises' && matchingTopics.some(t => t.id === r.from_id)).map(r => r.to_id));
      const linked = graph.relations.filter(r => r.type === 'illustrated_by' && issueIds.has(r.from_id));
      const matches = graph.cases.filter(c => !kind || c.kind === kind).map(c => {
        const haystack = [c.title, ...c.claim_ids.map(k => all.get(k).text)].join(' ').normalize('NFKC').toLowerCase();
        const direct = tokens.every(t => haystack.includes(t.toLowerCase()));
        const links = linked.filter(r => r.to_id === c.id);
        return {entry:c,direct,links};
      }).filter(x => x.direct || x.links.length).sort((a,b) => Number(b.direct)-Number(a.direct) || b.entry.event_date.localeCompare(a.entry.event_date));
      return { ...base(), total_matches:matches.length, truncated:matches.length>limit,
        results:matches.slice(0,limit).map(x => ({...caseResult(x.entry),match_basis:x.direct?'case_text':'curated_topic_association',topic_links:x.links})) };
    },
    get_case({id:key}) {
      const entry = graph.cases.find(c => c.id === key || c.key === key);
      return {...base(),status:entry?'research_candidates':'not_found_in_graph',result:entry?caseResult(entry,true):null};
    },
    explore_topic({topic:key, limit = 20}) {
      const normalized = key.normalize('NFKC').toLowerCase();
      const topic = graph.topics.find(t => t.id===key || t.key===key || [t.label,...t.aliases].some(s=>s.normalize('NFKC').toLowerCase()===normalized));
      if (!topic) return {...base(),status:'outside_coverage',topic:null,issues:[],cases:[],relations:[]};
      const first = graph.relations.filter(r => r.type==='raises' && r.from_id===topic.id);
      const issueIds = new Set(first.map(r=>r.to_id));
      const edges = graph.relations.filter(r=>issueIds.has(r.from_id));
      const selected = edges.slice(0,limit);
      const caseIds = new Set(selected.filter(r=>r.type==='illustrated_by').map(r=>r.to_id));
      const cases = graph.cases.filter(c=>caseIds.has(c.id));
      const sourceIds = new Set(selected.filter(r=>r.type==='guidance_on').map(r=>r.to_id));
      const allCaseIds = new Set(edges.filter(r=>r.type==='illustrated_by').map(r=>r.to_id));
      const counts = Object.fromEntries(['judgment','administrative_action','business_example'].map(kind=>[kind,graph.cases.filter(c=>allCaseIds.has(c.id)&&c.kind===kind).length]));
      return {
        ...base(), topic, issues:graph.issues.filter(i=>issueIds.has(i.id)),
        cases:cases.map(c=>caseResult(c)),
        guidance:graph.sources.filter(s=>sourceIds.has(s.id)),
        relations:[...first,...selected].map(r=>({...r,provenance:evidence(r.evidence_ref_ids),reviews:reviewsFor(r.id)})),
        case_counts_by_kind:counts, truncated:edges.length>limit,
        missing_case_kinds:Object.entries(counts).filter(([,count])=>count===0).map(([kind])=>kind)
      };
    }
  };
}

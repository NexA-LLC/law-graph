import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../src/egov.mjs';
import { id, uuid, snapshotId } from '../src/identity.mjs';
import { validateGraph, loadGraph } from '../src/validate.mjs';
import { createQuery } from '../src/query.mjs';
import { callTool } from '../src/tools.mjs';
import { DATA_ROOT, DEFAULT_GRAPH } from '../src/cli.mjs';

// Entirely synthetic source material; not a real law or official response.
function fixture() {
  const payload = {
    law_info: { law_id: '000AC0000000000' },
    revision_info: {
      law_revision_id: '000AC0000000000_20260101_TEST',
      law_title: '試験専用の架空法令',
      amendment_enforcement_date: '2026-01-01',
      current_revision_status: 'CurrentEnforced'
    },
    law_full_text: { tag: 'Article', attr: { Num: '2' }, children: [
      { tag: 'ArticleTitle', children: ['第二条'] },
      { tag: 'Paragraph', attr: { Num: '1' }, children: [
        { tag: 'ParagraphSentence', children: [{ tag: 'Sentence', children: ['この法律において「テスト概念」とは、試験用の情報をいう。'] }] }
      ] },
      { tag: 'Paragraph', attr: { Num: '2' }, children: [
        { tag: 'ParagraphSentence', children: [{ tag: 'Sentence', children: ['対象は、政令で定めるものとする。'] }] }
      ] }
    ] }
  };
  return {
    payload,
    request_url: 'https://laws.e-gov.go.jp/api/2/law_data/000AC0000000000_20260101_TEST?elm=LawBody-MainProvision-Article_2',
    observed_at: '2026-01-01T03:00:00.000Z'
  };
}
function built() { return buildGraph([fixture()], '2026-01-01'); }
function verify(result) { return validateGraph(result.graph, key => result.artifacts.get(key)); }

test('UUIDv5 matches the published DNS namespace test vector', () => {
  assert.equal(uuid('www.widgets.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'), '21f7f8de-8051-5b89-8680-0195ef798b6a');
});
test('synthetic evidence and the shipped real-source corpus both validate', () => {
  assert.equal(verify(built()).valid, true);
  const real = loadGraph(DEFAULT_GRAPH, DATA_ROOT);
  assert.equal(real.source_versions.length, 20);
  assert.equal(real.provision_versions.length, 156);
});
test('re-observation preserves content identities and snapshot identity', () => {
  const first = built();
  const input = fixture();
  input.observed_at = '2026-01-01T04:00:00.000Z';
  const second = buildGraph([input], '2026-01-01');
  assert.deepEqual(first.graph.source_versions, second.graph.source_versions);
  assert.deepEqual(first.graph.evidence_refs, second.graph.evidence_refs);
  assert.equal(snapshotId(first.graph), snapshotId(second.graph));
  assert.notDeepEqual(first.graph.observations, second.graph.observations);
});
test('source corrections preserve document identity and create new content/evidence IDs', () => {
  const first = built();
  const input = fixture();
  input.payload.law_full_text.children[1].children[0].children[0].children[0] += '追加文。';
  const second = buildGraph([input], '2026-01-01');
  assert.equal(first.graph.sources[0].id, second.graph.sources[0].id);
  assert.notEqual(first.graph.source_versions[0].id, second.graph.source_versions[0].id);
  assert.notDeepEqual(first.graph.evidence_refs, second.graph.evidence_refs);
});
test('a source artifact changed without a matching hash is rejected', () => {
  const result = built();
  result.artifacts.values().next().value.law_info.law_id = 'FORGED';
  assert.throws(() => verify(result), /hash mismatch/);
});
test('a changed displayed text cannot reuse an old evidence hash', () => {
  const result = built();
  result.graph.provision_versions[0].text += '改変';
  assert.throws(() => verify(result), /text hash mismatch/);
});
test('a valid-looking replacement UUID is rejected by deterministic identity checks', () => {
  const result = built();
  result.graph.evidence_refs[0].id = id('forged-evidence');
  assert.throws(() => verify(result), /Identity mismatch|Missing/);
});
test('duplicate IDs and missing endpoints fail validation', () => {
  const duplicate = built();
  duplicate.graph.laws.push(duplicate.graph.laws[0]);
  assert.throws(() => verify(duplicate), /Duplicate ID/);
  const dangling = built();
  dangling.graph.relations[0].from_id = id('missing');
  assert.throws(() => verify(dangling), /Dangling/);
});
test('coverage cannot silently omit an imported locator', () => {
  const result = built();
  result.graph.coverage[0].locators.pop();
  assert.throws(() => verify(result), /Coverage locator/);
});
test('unsupported dates and uncollected citations explicitly remain outside coverage', () => {
  const query = createQuery(built().graph);
  assert.equal(callTool(query, 'search_provisions', { query: '情報', as_of: '2025-12-31' }).status, 'outside_coverage');
  assert.equal(callTool(query, 'resolve_citation', { law_id: '000AC0000000000', article: '999' }).status, 'outside_coverage');
  const current = callTool(query, 'search_provisions', { query: 'テスト概念' });
  assert.equal(current.evaluated_as_of, '2026-01-01');
  assert.equal(current.results[0].provenance[0].upstream_ids.law_id, '000AC0000000000');
});
test('traversal keeps delegation candidates unresolved and reports bounds', () => {
  const graph = built().graph;
  const query = createQuery(graph);
  const delegation = graph.relations.find(r => r.type === 'delegates_to');
  const result = callTool(query, 'traverse_relations', { id: delegation.from_id });
  assert.equal(result.unresolved_count, 1);
  assert.equal(result.relations[0].to_id, null);
  const root = graph.law_revisions[0].id;
  assert.equal(callTool(query, 'traverse_relations', { id: root, depth: 3, limit: 1 }).truncated, true);
  assert.equal(callTool(query, 'traverse_relations', { id: root, depth: 1 }).depth_limited, true);
});
test('query argument bounds reject invalid dates, huge limits, and unknown fields', () => {
  const query = createQuery(built().graph);
  assert.throws(() => callTool(query, 'search_provisions', { query: 'a', limit: 10000 }), /Invalid arguments/);
  assert.throws(() => callTool(query, 'search_provisions', { query: 'a', as_of: '2026-02-30' }), /Invalid arguments/);
  assert.throws(() => callTool(query, 'search_provisions', { query: 'a', write: true }), /Invalid arguments/);
});
test('text response truncation is explicit', () => {
  const graph = built().graph;
  const result = callTool(createQuery(graph), 'get_provision', { id: graph.provision_versions[0].id, max_chars: 1 });
  assert.equal(result.result.text.length, 1);
  assert.equal(result.result.text_truncated, true);
});
test('a law revision without date coverage is not traversed just because its law is covered', () => {
  const graph = built().graph;
  const old = { ...graph.law_revisions[0], id: id('old-revision'), upstream_revision_id: 'OTHER' };
  graph.law_revisions.push(old);
  assert.equal(callTool(createQuery(graph), 'traverse_relations', { id: old.id }).status, 'outside_coverage');
});
test('mixed revisions, future revisions, and mismatched selection fail before ingestion', () => {
  const first = fixture();
  const second = fixture();
  second.payload.revision_info.law_revision_id += '_OTHER';
  assert.throws(() => buildGraph([first, second], '2026-01-01'), /Requested law\/revision mismatch|Mixed revisions/);
  const future = fixture();
  future.payload.revision_info.amendment_enforcement_date = '2026-02-01';
  assert.throws(() => buildGraph([future], '2026-01-01'), /current enforced/);
  const mismatch = fixture();
  mismatch.request_url = mismatch.request_url.replace('Article_2', 'Article_3');
  assert.throws(() => buildGraph([mismatch], '2026-01-01'), /Selection/);
});

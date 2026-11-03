import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGraph } from '../src/validate.mjs';
import { createQuery } from '../src/query.mjs';
import { callTool } from '../src/tools.mjs';
import { mergeFiles } from '../src/merge.mjs';
import { main, DEFAULT_GRAPH, DATA_ROOT } from '../src/cli.mjs';

const corpus = () => loadGraph(DEFAULT_GRAPH, DATA_ROOT);
const find = (g, args) => callTool(createQuery(g), 'find_related_laws', args);

test('slug and label lookups return identical grounded law/revision/provision results', () => {
  const g = corpus();
  const slug = find(g, { intent: 'contract-work' });
  const label = find(g, { intent: '請負契約を結ぶ' });
  assert.deepEqual(slug, label);
  assert.equal(slug.status, 'ok');
  assert.equal(slug.results[0].law.upstream_law_id, '129AC0000000089');
  assert.equal(slug.results[0].law.upstream_revision_id, '129AC0000000089_20260624_508AC0000000045');
  assert.equal(slug.results[0].provisions.length, 2);
  for (const r of slug.results) {
    assert.ok(r.reason);
    assert.equal(r.review_state, 'unreviewed');
    assert.equal(r.basis, 'curated');
    assert.ok(r.basis_provision_ids.every(key => r.provisions.some(p => p.id === key)));
    assert.ok(r.provenance.every(e => e.source_version_id && e.evidence_ref_id && e.upstream_ids.revision_id));
  }
});
test('only exact normalized matches are accepted; unsupported dates and missing links are outside coverage', () => {
  const g = corpus();
  for (const args of [{ intent: '請負' }, { intent: 'unknown' }, { intent: 'contract-work', as_of: '2026-11-02' }]) {
    const result = find(g,args);
    assert.equal(result.status, 'outside_coverage');
    assert.deepEqual(result.results, []);
    assert.equal(result.truncated, false);
  }
  assert.equal(find(g, { intent: '  ｃｏｎｔｒａｃｔ-work  ' }).status, 'ok');
  g.relations = g.relations.filter(r => r.type !== 'relates_to');
  assert.equal(find(g, { intent: 'contract-work' }).status, 'outside_coverage');
});
test('result limits, invalid inputs and explicit response truncation are enforced', () => {
  const g = corpus();
  const result = find(g, { intent: 'construction-contract', limit: 1 });
  assert.equal(result.total_matches, 3);
  assert.equal(result.results.length, 1);
  assert.equal(result.truncated, true);
  for (const args of [{ intent: '' }, { intent: '  ' }, { intent: 'contract-work', limit: 0 },
    { intent: 'contract-work', as_of: '2026-02-30' }, { intent: 'contract-work', write: true }]) assert.throws(() => find(g,args));
});
test('Intent and authority traversal respect dates, filters and the new relation types', () => {
  const g = corpus(), q = createQuery(g);
  const intent = g.intents.find(i => i.slug === 'construction-contract');
  const traversed = callTool(q, 'traverse_relations', { id: intent.id, types: ['relates_to'], limit: 1 });
  assert.equal(traversed.relations.length, 1);
  assert.equal(traversed.truncated, true);
  assert.ok(traversed.relations.every(r => r.review_state === 'unreviewed'));
  const authority = callTool(q, 'traverse_relations', { id: g.authorities[0].id, types: ['administered_by'], direction: 'in' });
  assert.equal(authority.relations.length, 3);
  const act = g.law_revisions.find(r => r.title === '建設業法');
  const order = g.law_revisions.find(r => r.title === '建設業法施行令');
  const from = g.provision_versions.find(p => p.law_revision_id === act.id && p.locator === 'main/article:19/paragraph:3');
  g.coverage.find(c => c.law_revision_id === order.id).as_of = '2026-11-04';
  const dated = callTool(createQuery(g), 'traverse_relations', { id: from.id, types: ['delegates_to'], as_of: '2026-11-03' });
  assert.ok(dated.nodes.every(n => n.law_revision_id !== order.id));
  assert.equal(find(g, { intent: 'construction-contract', as_of: '2026-11-03' }).total_matches, 2);
});
test('query operations stay offline and leave their input snapshot unchanged', () => {
  const g = corpus(), before = JSON.stringify(g), fetchBefore = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network must not be used'); };
  try {
    assert.equal(find(g, { intent: 'cancel-contract-work' }).results.length, 2);
    assert.equal(JSON.stringify(g), before);
  } finally { globalThis.fetch = fetchBefore; }
});
test('the shipped Intent aggregate is reproducible offline and output overwrite is refused', t => {
  const dir = mkdtempSync(join(tmpdir(), 'law-graph-intents-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const options = { files: [join(DATA_ROOT, 'laws/415AC0000000057/seed.graph.json'),
    ...['129AC0000000089','324AC0000000100','331CO0000000273','324M50004000014'].map(law => join(DATA_ROOT, 'laws', law, 'contract-20261103.graph.json'))],
    out: join(dir,'rebuilt.graph.json'), dataRoot: DATA_ROOT, intentsFile: join(DATA_ROOT,'intents/contracts.catalog.json') };
  mergeFiles(options);
  assert.deepEqual(loadGraph(options.out,DATA_ROOT), corpus());
  assert.throws(() => mergeFiles(options), /Refusing to overwrite/);
});
test('CLI find-related uses the same bounded read-only tool contract', async () => {
  const result = await main(['find-related', '--intent', 'contract-work', '--limit', '1']);
  assert.equal(result.status, 'ok');
  assert.equal(result.results.length, 1);
});

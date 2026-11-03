import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadGraph, validateGraph } from '../src/validate.mjs';
import { mergeGraphs } from '../src/merge.mjs';
import { extractReferences } from '../src/references.mjs';
import { assertion } from '../src/assertions.mjs';
import { DATA_ROOT } from '../src/cli.mjs';

const corpusFile = resolve(DATA_ROOT, 'corpora/contracts-20261103.graph.json');
const readArtifact = key => JSON.parse(readFileSync(resolve(DATA_ROOT, key)));
const corpus = () => loadGraph(corpusFile, DATA_ROOT);

test('every shipped graph validates against the official stored source payloads', () => {
  const files = readdirSync(DATA_ROOT, { recursive: true }).filter(p => p.endsWith('.graph.json'));
  assert.ok(files.length >= 6);
  for (const file of files) assert.ok(loadGraph(resolve(DATA_ROOT, file), DATA_ROOT));
});
test('construction delegation follows Act → Cabinet Order → Ministerial Ordinance with two-sided evidence', () => {
  const g = corpus();
  const p = (title, locator) => g.provision_versions.find(p => p.locator === locator && g.law_revisions.find(r => r.id === p.law_revision_id).title === title);
  const chain = [p('建設業法', 'main/article:19/paragraph:3'), p('建設業法施行令', 'main/article:5_5/paragraph:1'), p('建設業法施行規則', 'main/article:13_6/paragraph:1')];
  for (let i = 0; i < 2; i++) {
    const r = g.relations.find(r => r.type === 'delegates_to' && r.from_id === chain[i].id && r.to_id === chain[i+1].id);
    assert.equal(r.review_state, 'unreviewed');
    assert.ok(chain.slice(i,i+2).every(p => r.basis_provision_ids.includes(p.id)));
    assert.ok(r.evidence_ref_ids.length >= 2);
  }
  assert.ok(g.relations.some(r => r.type === 'cites' && r.resolution === 'unresolved'));
});
test('removing the collected alias declarations prevents cross-law alias resolution', () => {
  const g = corpus();
  g.provision_versions = g.provision_versions.filter(p => !/main\/article:(1|4)(\/|$)/u.test(p.locator));
  const refs = extractReferences(g);
  const order = g.law_revisions.find(r => r.title === '建設業法施行令');
  const from = g.provision_versions.find(p => p.law_revision_id === order.id && p.locator === 'main/article:5_5/paragraph:1');
  assert.ok(refs.some(r => r.type === 'cites' && r.from_id === from.id && r.resolution === 'unresolved'));
  assert.ok(!refs.some(r => r.type === 'cites' && r.from_id === from.id && r.resolution === 'resolved'));
});
test('a forged reference fails even with valid endpoint IDs and a recomputed assertion ID', () => {
  const g = corpus();
  const index = g.relations.findIndex(r => r.type === 'cites' && r.resolution === 'resolved');
  const { id: unused, ...fields } = g.relations[index];
  g.relations[index] = assertion({ ...fields, to_id: g.provision_versions.find(p => p.id !== fields.to_id).id });
  assert.throws(() => validateGraph(g, readArtifact), /not supported by the extractor/);
});
test('reference coverage cannot silently omit an extracted assertion', () => {
  const g = corpus();
  g.relations.splice(g.relations.findIndex(r => r.method === 'egov-references-v1'), 1);
  assert.throws(() => validateGraph(g, readArtifact), /coverage is incomplete/);
});
test('merge is deterministic, idempotent, nonmutating and rejects conflicting identities', () => {
  const g = corpus();
  const before = JSON.stringify(g);
  assert.deepEqual(mergeGraphs([g,g]), mergeGraphs([g]));
  assert.equal(JSON.stringify(g), before);
  const changed = structuredClone(g);
  changed.law_revisions[0].title += '変更';
  assert.throws(() => mergeGraphs([g,changed]), /Conflicting law_revisions/);
  const incompatible = { ...g, schema_version: 'OTHER' };
  assert.throws(() => mergeGraphs([g,incompatible]), /Incompatible/);
});
test('split coverage for one revision and day unions locators, while conflicting metadata fails', () => {
  const g = corpus();
  const first = structuredClone(g), second = structuredClone(g);
  first.coverage[0].locators = g.coverage[0].locators.slice(0,1);
  second.coverage[0].locators = g.coverage[0].locators.slice(1);
  assert.deepEqual(mergeGraphs([first,second]).coverage.find(c => c.law_revision_id === g.coverage[0].law_revision_id).locators,
    [...g.coverage[0].locators].sort());
  second.coverage[0].limits.push('different extraction contract');
  assert.throws(() => mergeGraphs([first,second]), /Conflicting coverage/);
});
test('cross-law reference resolution requires a common observation day', () => {
  const g = corpus();
  const order = g.law_revisions.find(r => r.title === '建設業法施行令');
  const from = g.provision_versions.find(p => p.law_revision_id === order.id && p.locator === 'main/article:5_5/paragraph:1');
  for (const c of g.coverage) if (c.law_revision_id !== order.id) c.as_of = '2026-11-04';
  assert.ok(!extractReferences(g).some(r => r.type === 'cites' && r.from_id === from.id && r.resolution === 'resolved'));
});

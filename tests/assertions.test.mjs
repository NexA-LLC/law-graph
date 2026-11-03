import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertion } from '../src/assertions.mjs';
import { id } from '../src/identity.mjs';
import { validateGraph } from '../src/validate.mjs';

function sample() {
  const graph = JSON.parse(readFileSync(new URL('../data/laws/415AC0000000057/seed.graph.json', import.meta.url)));
  const p = graph.provision_versions.find(p => p.level === 'Paragraph');
  const intent = { id: id('intent', 'test-intent'), slug: 'test-intent', label: '試験用目的', description: '検証用の目的。' };
  graph.intents = [intent];
  graph.authorities = [];
  const relation = assertion({ type: 'relates_to', from_id: intent.id, to_id: p.id, target_ref: null,
    basis: 'curated', method: 'intent-curation-v1', resolution: 'resolved', reason: '検証用の対応付け。',
    evidence_ref_ids: p.evidence_ref_ids, basis_provision_ids: [p.id] });
  graph.relations.push(relation);
  const verify = () => validateGraph(graph, path => JSON.parse(readFileSync(new URL('../data/' + path, import.meta.url))));
  return { graph, relation, verify };
}

test('additive Intent assertions validate alongside immutable legacy data', () => {
  assert.equal(sample().verify().valid, true);
});
test('Intent evidence must support its exact target even with a freshly recomputed assertion ID', () => {
  const s = sample();
  const other = s.graph.provision_versions.find(p => p.id !== s.relation.to_id);
  const { id: unused, ...fields } = s.relation;
  s.graph.relations[s.graph.relations.length - 1] = assertion({ ...fields, to_id: other.id });
  assert.throws(s.verify, /Intent basis target mismatch/);
});
test('changed reasons cannot silently reuse assertion identities', () => {
  const s = sample();
  s.relation.reason += '変更';
  assert.throws(s.verify, /Assertion identity mismatch/);
});
test('missing basis records, missing reasons, and unsupported review states fail', () => {
  const missing = sample();
  missing.relation.basis_provision_ids = [id('missing')];
  assert.throws(missing.verify);
  const reason = sample();
  delete reason.relation.reason;
  assert.throws(reason.verify, /Schema/);
  const review = sample();
  review.relation.review_state = 'reviewed';
  assert.throws(review.verify, /Schema/);
});

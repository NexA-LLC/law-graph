import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchClient} from '../src/research.mjs';
const client = createResearchClient();
test('installed research interface preserves all three source snapshots and validates tools', () => {
  const status = client.status();
  assert.equal(status.mode, 'offline_read_only');
  assert.equal(client.tools().length, 9);
  assert.ok(Object.values(status.snapshots).every(x => /^[0-9a-f]{64}$/.test(x)));
  assert.throws(() => client.call('import-egov', {}), /Unknown tool/);
  assert.throws(() => client.call('search_provisions', {query:'NDA', url:'https://example.org'}), /Invalid arguments/);
  status.snapshots.cases = 'tampered';
  assert.notEqual(client.status().snapshots.cases, 'tampered');
  const entry=client.call('get_case',{id:'courts-35471'});
  entry.result.title='tampered';
  entry.result.claims[0].text='tampered';
  const fresh=client.call('get_case',{id:'courts-35471'});
  assert.notEqual(fresh.result.title,'tampered');
  assert.notEqual(fresh.result.claims[0].text,'tampered');
});
test('ordinary NFT/NDA questions get grounded cases without claiming legal applicability', () => {
  for (const query of ['ブロックチェーンでNFTガチャを作りたい', '取引先とNDAを締結したい']) {
    const result = client.contextForQuery(query);
    assert.equal(result.current_applicability, 'not_assessed');
    const topic = result.results.find(x => x.tool === 'explore_topic');
    assert.ok(topic?.result.cases.length);
    assert.ok(topic.result.cases.every(c => c.ready_for_legal_reliance === false && c.provenance.length));
    assert.ok(JSON.stringify(result).length <= 24000);
  }
});
test('unsupported query and explicit foreign comparison retain coverage limits', () => {
  const unknown = client.contextForQuery('zz-uncollected-123');
  assert.equal(unknown.status, 'outside_coverage');
  assert.equal(unknown.results[0].result.total_matches, 0);
  const comparison = client.call('compare_issue', {issue:'引用', jurisdictions:['JP','US-federal']});
  assert.equal(comparison.equivalence, 'not_asserted');
  assert.equal(client.call('compare_issue', {issue:'引用', jurisdictions:['JP','US-CA']}).status, 'outside_coverage');
});
test('explicit Japanese/US copyright questions retrieve comparison; state queries do not fall back to federal', () => {
  const context = client.contextForQuery('日本とアメリカで著作権の引用はどう違う?');
  assert.equal(context.results[0].tool, 'compare_issue');
  assert.equal(context.results[0].result.comparisons.length, 1);
  const state = client.contextForQuery('日本とアメリカの州法で引用はどう違う?');
  assert.equal(state.status, 'outside_coverage');
});
test('context budgeting keeps complete JSON and records dropped evidence explicitly', () => {
  const result = client.contextForQuery('NFT NDA 下請法 建設', {maxChars:8000});
  assert.ok(JSON.stringify(result).length <= 8000);
  assert.equal(result.truncated, true);
  assert.ok(result.omitted.length || result.results.length < 4);
  assert.throws(() => client.contextForQuery('NDA', {maxChars:1}), /budget/);
});

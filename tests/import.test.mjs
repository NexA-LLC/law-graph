import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importEgov, fetchArticle } from '../src/import.mjs';
import { loadGraph } from '../src/validate.mjs';

function response(article) {
  // Deliberately fictional law ID and wording, used only in disposable tests.
  return {
    law_info: { law_id: '000AC0000000000' },
    revision_info: {
      law_revision_id: '000AC0000000000_20200101_TEST',
      law_title: '取り込み試験用の架空法令',
      amendment_enforcement_date: '2020-01-01',
      current_revision_status: 'CurrentEnforced'
    },
    law_full_text: { tag: 'Article', attr: { Num: article }, children: [
      { tag: 'ArticleTitle', children: ['試験条文'] },
      { tag: 'Paragraph', attr: { Num: '1' }, children: [
        { tag: 'ParagraphSentence', children: [{ tag: 'Sentence', children: ['この法律において「試験」とは、動作確認をいう。'] }] }
      ] }
    ] }
  };
}
test('import pins the first revision, validates artifacts, and refuses graph overwrite', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'law-graph-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const requests = [];
  const mockFetch = async url => {
    requests.push(url.toString());
    const article = url.searchParams.get('elm').split('_').at(-1);
    return new Response(JSON.stringify(response(article)), { status: 200 });
  };
  const options = { lawId: '000AC0000000000', articles: ['2', '3'], out: join(dir, 'test.graph.json'), dataRoot: dir, fetchImpl: mockFetch };
  await importEgov(options);
  assert.match(requests[0], /law_data\/000AC0000000000\?/);
  assert.match(requests[1], /law_data\/000AC0000000000_20200101_TEST\?/);
  const graph = loadGraph(options.out, dir);
  assert.equal(graph.source_versions.length, 2);
  assert.equal(graph.sources.length, 1);
  const before = readFileSync(options.out, 'utf8');
  await assert.rejects(importEgov(options), /Refusing to overwrite/);
  assert.equal(requests.length, 2);
  assert.equal(readFileSync(options.out, 'utf8'), before);
});
test('invalid or excessive ingestion scope fails before any network call', async () => {
  let calls = 0;
  await assert.rejects(importEgov({
    lawId: 'TEST', articles: ['2', '2'], out: '/does-not-exist/graph.json', dataRoot: '/does-not-exist',
    fetchImpl: async () => { calls++; }
  }), /unique articles/);
  assert.equal(calls, 0);
});
test('acquisition errors do not become valid source artifacts', async () => {
  await assert.rejects(fetchArticle('000AC0000000000', '2', async () => new Response('unavailable', { status: 503 })), /HTTP 503/);
  await assert.rejects(fetchArticle('https://example.invalid', '2'), /Invalid e-Gov/);
});

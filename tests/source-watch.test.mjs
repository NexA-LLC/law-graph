import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkSources,assertWatchUrl,watchTargets} from '../src/source-watch.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
test('watcher uses registered public sources and follows current e-Gov law revisions',()=>{
  const targets=watchTargets();assert.ok(targets.length>20);
  assert.ok(targets.every(t=>assertWatchUrl(t.url)));
  assert.ok(targets.filter(t=>t.url.includes('e-gov')).every(t=>!new URL(t.url).pathname.split('/').at(-1).includes('_')));
  for(const url of ['http://127.0.0.1/a','https://example.org/a','https://www.caa.go.jp/a?token=private'])
    assert.throws(()=>assertWatchUrl(url),/Unapproved/);
});
test('changed public bytes create review candidates; unchanged and unavailable sources never overwrite corpus',async()=>{
  const url='https://www.caa.go.jp/test',target={url,source_version_id:'fixture',expected_sha256:hash('original'),hash_method:'raw-bytes-sha256-v1',upstream_revision_id:null};
  const unchanged=await checkSources({targets:[target],fetchImpl:async()=>new Response('original')});
  assert.equal(unchanged.changes.length,0);
  const changed=await checkSources({targets:[target],fetchImpl:async()=>new Response('changed')});
  assert.equal(changed.changes[0].observed_sha256,hash('changed'));
  assert.equal(changed.changes[0].automatically_applied,false);
  const unavailable=await checkSources({targets:[target],fetchImpl:async()=>new Response('',{status:503})});
  assert.equal(unavailable.errors[0].status,'source_unavailable');
  assert.equal(unavailable.existing_corpus_modified,false);
});

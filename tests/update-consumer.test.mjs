import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {updateConsumer} from '../src/update-consumer.mjs';
const prefix='https://codeload.github.com/NexA-LLC/law-graph/tar.gz/';
test('consumer updates exact public commit only after compatibility check; no-op leaves file untouched', async t => {
  const cwd=mkdtempSync(join(tmpdir(),'law-consumer-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  const file=join(cwd,'package.json'),old='1'.repeat(40),next='2'.repeat(40);
  writeFileSync(file,JSON.stringify({dependencies:{'@nexa-llc/law-graph':prefix+old}}));
  const mock=async url=>new Response(JSON.stringify(url.includes('/branches/')?{commit:{sha:next}}:{name:'@nexa-llc/law-graph',researchProtocol:1,exports:{'./research':'./src/research.mjs'}}));
  assert.equal((await updateConsumer({cwd,fetchImpl:mock})).written,false);
  assert.ok(readFileSync(file,'utf8').includes(old));
  assert.equal((await updateConsumer({cwd,write:true,fetchImpl:mock})).written,true);
  const after=readFileSync(file,'utf8');
  assert.equal((await updateConsumer({cwd,write:true,fetchImpl:mock})).changed,false);
  assert.equal(readFileSync(file,'utf8'),after);
});
test('incompatible or unavailable upstream cannot replace a working consumer pin', async t => {
  const cwd=mkdtempSync(join(tmpdir(),'law-consumer-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  const file=join(cwd,'package.json'),old=JSON.stringify({dependencies:{'@nexa-llc/law-graph':prefix+'1'.repeat(40)}});
  writeFileSync(file,old);
  await assert.rejects(updateConsumer({cwd,write:true,fetchImpl:async url=>new Response(JSON.stringify(url.includes('/branches/')?{commit:{sha:'2'.repeat(40)}}:{}))}),/supported/);
  assert.equal(readFileSync(file,'utf8'),old);
  await assert.rejects(updateConsumer({cwd,write:true,fetchImpl:async()=>new Response('',{status:503})}),/503/);
});

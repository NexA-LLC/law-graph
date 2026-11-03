import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadCaseGraph,validateCaseGraph,createCaseQuery,mergeCaseGraphs} from '../src/cases.mjs';
import {id,sha256} from '../src/identity.mjs';
import {callTool} from '../src/tools.mjs';
import {main} from '../src/cli.mjs';

const original=loadCaseGraph();
const clone=()=>structuredClone(original);
function rekeyClaim(graph,claim,oldId){
  claim.id=id('case-claim',claim.case_id,claim.kind,claim.text,claim.evidence_ref_ids);
  const entry=graph.cases.find(c=>c.id===claim.case_id);
  entry.claim_ids=entry.claim_ids.map(key=>key===oldId?claim.id:key);
}
// Review identities and URLs below are deliberately synthetic test-only records.
function reviewFor(subject,overrides={}){
  const body={subject_id:subject.id,subject_sha256:sha256(subject),scope:'source_check',outcome:'supported',
    reviewer:'synthetic-test-only',review_url:'https://github.com/NexA-LLC/law-graph/pull/0#synthetic-test',
    recorded_at:'2026-11-03T00:00:00Z',reason:'Synthetic review test; not an actual human review.',supersedes_id:null,...overrides};
  return {id:id('case-review',body),...body};
}
test('independent files merge into three topics and three typed cases',()=>{
  const result=validateCaseGraph(original);
  assert.equal(result.topics,3);assert.equal(result.issues,5);assert.equal(result.cases,3);
  assert.equal(result.sources,6);assert.equal(result.review_records,0);
  assert.equal(original.cases.filter(c=>c.kind==='judgment').length,1);
  assert.equal(original.cases.filter(c=>c.kind==='administrative_action').length,2);
});
test('NFT research returns adjacent administrative material, not a fabricated NFT precedent',()=>{
  const query=createCaseQuery(original),r=callTool(query,'explore_topic',{topic:'NFT'});
  assert.equal(r.status,'research_candidates');
  assert.equal(r.case_counts_by_kind.judgment,0);
  assert.ok(r.missing_case_kinds.includes('judgment'));
  assert.ok(r.guidance.some(s=>s.kind==='industry_guideline'));
  assert.ok(r.cases.every(c=>c.kind==='administrative_action'&&!c.ready_for_legal_reliance));
  const search=callTool(query,'search_cases',{query:'NFT ガチャ'});
  assert.equal(search.results[0].match_basis,'curated_topic_association');
  assert.ok(search.results[0].topic_links.some(r=>r.material_differences.some(t=>t.includes('NFT固有'))));
  assert.equal(callTool(query,'search_cases',{query:'NFT',kind:'judgment'}).total_matches,0);
});
test('NDA retrieval separates allegations from findings and retains exact judicial provenance',()=>{
  const query=createCaseQuery(original);
  const r=callTool(query,'get_case',{id:'courts-35471'}).result;
  assert.ok(r.claims.some(c=>c.kind==='party_allegation'));
  assert.ok(r.claims.some(c=>c.kind==='court_finding'));
  assert.equal(r.docket_number,'平成17年（ワ）第23171号');
  assert.equal(r.event_date,'2007-11-27');assert.equal(r.later_history,'not_checked');
  assert.equal(r.provenance[0].source_kind,'judgment');
  assert.equal(r.provenance[0].upstream_ids.hanrei_id,'35471');
  assert.ok(r.provenance.every(p=>p.source_id&&p.source_version_id&&p.evidence_ref_id));
});
test('commissioned-work examples preserve historical law and recommendation/instruction differences',()=>{
  const r=callTool(createCaseQuery(original),'explore_topic',{topic:'取適法'});
  assert.equal(r.current_applicability,'not_assessed');
  const entry=r.cases[0];
  assert.equal(entry.event_date,'2024-10-25');
  assert.ok(entry.legal_context.every(x=>x.role==='at_case_time'&&x.label.includes('旧下請法')));
  const detail=createCaseQuery(original).get_case({id:entry.id}).result;
  assert.ok(detail.claims.find(c=>c.kind==='outcome').text.includes('支払遅延について勧告と併せた指導'));
  assert.ok(r.guidance.some(s=>s.kind==='regulatory_guidance'));
});
test('case metadata honestly reports unbundled original evidence',()=>{
  const r=createCaseQuery(original).get_case({id:'courts-35471'});
  assert.equal(r.source_integrity,'hashes_and_locators_recorded_originals_not_bundled');
  assert.ok(r.result.provenance.every(p=>p.original_bundled===false));
  const graph=clone();graph.source_versions[0].original_bundled=true;
  assert.throws(()=>validateCaseGraph(graph),/Case schema/);
});
test('an industry guideline cannot be presented as a judicial primary source',()=>{
  const graph=clone(),source=graph.sources.find(s=>s.kind==='industry_guideline');
  source.kind='judgment';
  assert.throws(()=>validateCaseGraph(graph),/official courts domain/);
});
test('an administrative action cannot be relabelled as a judgment',()=>{
  const graph=clone();graph.cases.find(c=>c.kind==='administrative_action').kind='judgment';
  assert.throws(()=>validateCaseGraph(graph),/Judgment needs/);
});
test('a regulator finding cannot be relabelled as a court finding',()=>{
  const graph=clone(),claim=graph.claims.find(c=>c.kind==='regulator_finding'),oldId=claim.id;
  claim.kind='court_finding';rekeyClaim(graph,claim,oldId);
  assert.throws(()=>validateCaseGraph(graph),/Court finding needs/);
});
test('a claim cannot borrow another case source as its evidence',()=>{
  const graph=clone(),claim=graph.claims.find(c=>c.kind==='court_finding'),oldId=claim.id;
  const other=graph.cases.find(c=>c.kind==='administrative_action');
  claim.evidence_ref_ids=[other.evidence_ref_ids[0]];rekeyClaim(graph,claim,oldId);
  assert.throws(()=>validateCaseGraph(graph),/not from its case/);
});
test('missing evidence and relation targets fail closed',()=>{
  const graph=clone();graph.evidence_refs.pop();
  assert.throws(()=>validateCaseGraph(graph),/Missing\/wrong/);
  const second=clone();second.relations[0].to_id=id('nonexistent');
  assert.throws(()=>validateCaseGraph(second),/Dangling/);
});
test('duplicate IDs fail and identical bundles deduplicate without changing meaning',()=>{
  const duplicate=clone();duplicate.cases.push(duplicate.cases[0]);
  assert.throws(()=>validateCaseGraph(duplicate),/Duplicate/);
  const merged=mergeCaseGraphs([original,structuredClone(original)]);
  assert.equal(merged.cases.length,original.cases.length);
  assert.equal(merged.source_versions.length,original.source_versions.length);
  const conflict=clone();conflict.sources[0].title+=' changed';
  assert.throws(()=>mergeCaseGraphs([original,conflict]),/Conflicting/);
});
test('review records never automatically confer legal approval or authenticate identity',()=>{
  const graph=clone(),entry=graph.cases[0];graph.reviews.push(reviewFor(entry));
  validateCaseGraph(graph);
  const r=createCaseQuery(graph).get_case({id:entry.id});
  assert.equal(r.review_identity,'declared_in_records_not_authenticated');
  assert.equal(r.result.ready_for_legal_reliance,false);
  assert.equal(r.result.reviews[0].subject_matches_current,true);
});
test('stale reviews remain visible and cannot silently cover changed metadata',()=>{
  const graph=clone(),entry=graph.cases[0];graph.reviews.push(reviewFor(entry));
  entry.title+=' (metadata correction)';
  assert.equal(validateCaseGraph(graph).stale_review_records,1);
  assert.equal(createCaseQuery(graph).get_case({id:entry.id}).result.reviews[0].subject_matches_current,false);
});
test('review correction and withdrawal must reference an earlier matching subject and scope',()=>{
  const graph=clone(),subject=graph.cases[0],first=reviewFor(subject);
  const second=reviewFor(subject,{outcome:'withdrawn',supersedes_id:first.id,recorded_at:'2026-11-03T01:00:00Z'});
  graph.reviews=[first,second];validateCaseGraph(graph);
  graph.reviews=[second,first];
  assert.throws(()=>validateCaseGraph(graph),/earlier record/);
});
test('private and credential-bearing source URLs are rejected without fetching',()=>{
  for(const url of ['https://127.0.0.1/private','https://user:password@example.invalid/doc','https://example.invalid/doc?token=synthetic']){
    const graph=clone();graph.sources[0].url=url;
    assert.throws(()=>validateCaseGraph(graph),/Private source|public HTTPS|Credential-bearing/);
  }
});
test('uncovered topics and missing cases remain explicit',()=>{
  const q=createCaseQuery(original);
  assert.equal(q.explore_topic({topic:'未収録の医療機器'}).status,'outside_coverage');
  assert.equal(q.get_case({id:'not-a-case'}).status,'not_found_in_graph');
});
test('bounds report truncation without pretending unreturned case kinds are absent',()=>{
  const q=createCaseQuery(original),r=callTool(q,'explore_topic',{topic:'NDA',limit:1});
  assert.equal(r.case_counts_by_kind.judgment,1);
  const first=original.relations.find(r=>r.type==='raises'&&r.from_id===original.topics.find(t=>t.key==='nft-random-sales').id);
  const nft=q.explore_topic({topic:'NFT',limit:1});
  assert.equal(nft.truncated,true);assert.equal(nft.case_counts_by_kind.administrative_action,1);
  assert.ok(first);
  assert.throws(()=>callTool(q,'search_cases',{query:'NFT',limit:1000}),/Invalid arguments/);
});
test('case CLI rejects an as-of date rather than silently claiming date applicability',async()=>{
  await assert.rejects(main(['topic','--topic','NDA','--as-of','2026-11-03']),/does not evaluate legal applicability/);
});
test('case directories support file URLs with spaces and reject symbolic links',t=>{
  const dir=mkdtempSync(join(tmpdir(),'law graph cases '));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const source=fileURLToPath(new URL('../data/cases/nda/courts-35471.case-graph.json',import.meta.url));
  cpSync(source,join(dir,'example.case-graph.json'));
  assert.equal(loadCaseGraph(pathToFileURL(dir+'/')).cases.length,1);
  symlinkSync(source,join(dir,'linked.case-graph.json'));
  assert.throws(()=>loadCaseGraph(dir),/symbolic links/);
});

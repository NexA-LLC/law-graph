import test from 'node:test';
import assert from 'node:assert/strict';
import {loadComparativeGraph,validateComparativeGraph,createComparativeQuery} from '../src/comparative.mjs';
import {id,sha256} from '../src/identity.mjs';
import {callTool} from '../src/tools.mjs';
import {main} from '../src/cli.mjs';
const original=loadComparativeGraph(),clone=()=>structuredClone(original);
const rekey=c=>{const {id:key,...body}=c;c.id=id('comparative-link',body);};
function addSyntheticTranslation(g){
 // Synthetic reference data only; no real translation is claimed or redistributed.
 const primary=g.anchors.find(a=>a.official_locator==='Article 32(1)');
 const version=g.source_versions.find(v=>v.id===primary.source_version_id);
 const source=g.sources.find(s=>s.id===version.source_id);
 const translatedSource={...source,id:id('source','reference-translation','synthetic-jp-en'),provider:'reference-translation',document_key:'synthetic-jp-en',url:'https://example.invalid/synthetic-reference',language:'en',text_role:'reference_translation',authority_kind:'reference'};
 g.sources.push(translatedSource);
 const translatedVersion={...version,source_id:translatedSource.id,content_type:'text/html',content_sha256:sha256('synthetic reference fixture'),retrieval_url:translatedSource.url};
 translatedVersion.id=id('source-version',translatedSource.id,translatedVersion.upstream_revision_id,'comparative-document',translatedVersion.content_type,translatedVersion.content_sha256);g.source_versions.push(translatedVersion);
 g.observations.push({source_version_id:translatedVersion.id,observed_at:g.observations[0].observed_at,request_url:translatedSource.url});
 const anchor={...primary,source_version_id:translatedVersion.id,text_role:'reference_translation',translation_of_anchor_id:primary.id};
 anchor.id=id('comparative-anchor',anchor.law_id,anchor.official_locator,translatedVersion.id,anchor.text_role);g.anchors.push(anchor);
 const card=g.comparisons.find(c=>c.sides.some(s=>s.primary_anchor_ids.includes(primary.id)));
 const side=card.sides.find(s=>s.primary_anchor_ids.includes(primary.id));side.reference_anchor_ids.push(anchor.id);rekey(card);
 return {anchor,side,card,version:translatedVersion,source:translatedSource};
}
test('seed provides two legal regimes, seven provision anchors and three comparisons',()=>{
 const r=validateComparativeGraph(original);assert.equal(r.jurisdictions,2);assert.equal(r.laws,2);assert.equal(r.anchors,7);assert.equal(r.comparisons,3);
 assert.ok(original.laws.some(l=>l.id===id('law','JP','egov-law-id','345AC0000000048')));
});
test('fair-use comparison keeps source language, edition limits and non-equivalence visible',()=>{
 const r=callTool(createComparativeQuery(original),'compare_issue',{issue:'引用',jurisdictions:['JP','US-federal']});
 assert.equal(r.status,'research_candidates');assert.equal(r.equivalence,'not_asserted');assert.equal(r.current_applicability,'not_assessed');assert.equal(r.conflict_of_laws,'not_assessed');assert.equal(r.temporal_alignment,'not_verified');
 const [jp,us]=r.comparisons[0].sides;
 assert.equal(jp.primary[0].official_locator,'Article 32(1)');assert.equal(us.primary[0].official_locator,'Section 107');
 assert.equal(us.primary[0].summary_language,'ja');assert.equal(us.primary[0].provenance.source_language,'en');
 assert.equal(us.primary[0].provenance.reported_through_date,'2025-12-18');
 assert.equal(us.primary[0].provenance.edition_evidence.url,'https://www.copyright.gov/title17/');
 assert.notEqual(jp.primary[0].law.id,us.primary[0].law.id);
});
test('unsupported state and country never silently fall back to federal law',()=>{
 const q=createComparativeQuery(original);
 for(const region of ['US-CA','EU','FR'])assert.equal(q.compare_issue({issue:'引用',jurisdictions:['JP',region]}).status,'outside_coverage');
 assert.equal(q.compare_issue({issue:'未収録の論点',jurisdictions:['JP','US-federal']}).status,'outside_coverage');
});
test('jurisdictions must be explicit and distinct; requested presentation order is respected',()=>{
 const q=createComparativeQuery(original);
 assert.throws(()=>callTool(q,'compare_issue',{issue:'引用'}),/Invalid arguments/);
 assert.throws(()=>callTool(q,'compare_issue',{issue:'引用',jurisdictions:['JP','JP']}),/Invalid arguments/);
 const r=callTool(q,'compare_issue',{issue:'引用',jurisdictions:['US-federal','JP']});
 assert.equal(r.comparisons[0].sides[0].jurisdiction.key,'US-federal');
});
test('a reference translation stays Japanese law and cannot become primary authority',()=>{
 const g=clone(),{anchor,side,card}=addSyntheticTranslation(g);validateComparativeGraph(g);
 const r=createComparativeQuery(g).compare_issue({issue:'引用',jurisdictions:['JP','US-federal']});
 assert.equal(r.comparisons[0].sides[0].references[0].law.id,anchor.law_id);
 assert.equal(r.comparisons[0].sides[0].references[0].provenance.source_language,'en');
 side.primary_anchor_ids=[anchor.id];rekey(card);
 assert.throws(()=>validateComparativeGraph(g),/primary anchor must be an original/);
});
test('a translation cannot be relabelled as a law of another jurisdiction',()=>{
 const g=clone(),{anchor}=addSyntheticTranslation(g);
 anchor.law_id=g.laws.find(l=>l.identifier_scheme==='uscode-title').id;
 assert.throws(()=>validateComparativeGraph(g),/jurisdiction mismatch/);
});
test('translation edition drift is rejected rather than linked to a newer original',()=>{
 const g=clone(),{anchor,side,card,version}=addSyntheticTranslation(g),oldVersion=version.id,oldAnchor=anchor.id;
 version.upstream_revision_id='synthetic-older-revision';
 version.id=id('source-version',version.source_id,version.upstream_revision_id,'comparative-document',version.content_type,version.content_sha256);
 anchor.source_version_id=version.id;anchor.id=id('comparative-anchor',anchor.law_id,anchor.official_locator,version.id,anchor.text_role);
 side.reference_anchor_ids=side.reference_anchor_ids.map(k=>k===oldAnchor?anchor.id:k);rekey(card);
 for(const o of g.observations)if(o.source_version_id===oldVersion)o.source_version_id=version.id;
 assert.throws(()=>validateComparativeGraph(g),/Translation revision mismatch/);
});
test('comparison cannot claim same_as, equivalence, or omit material differences',()=>{
 for(const update of [{relation:'same_as'},{equivalence:'equivalent'},{material_differences:[]}]){
  const g=clone();Object.assign(g.comparisons[0],update);assert.throws(()=>validateComparativeGraph(g),/Comparative schema/);
 }
});
test('foreign anchors cannot borrow a source from another jurisdiction',()=>{
 const g=clone(),anchor=g.anchors.find(a=>a.official_locator==='Section 107');
 anchor.source_version_id=g.anchors.find(a=>a.official_locator==='Article 32(1)').source_version_id;
 assert.throws(()=>validateComparativeGraph(g),/jurisdiction mismatch/);
});
test('edition cutoff needs its own evidence and every source version needs an observation',()=>{
 const missing=clone();missing.source_versions.find(v=>v.reported_through_date).version_evidence_id=null;
 assert.throws(()=>validateComparativeGraph(missing),/through date requires/);
 const unobserved=clone();unobserved.observations.pop();assert.throws(()=>validateComparativeGraph(unobserved),/Unobserved/);
});
test('comparative output cannot claim bundled originals or reviewed legal conclusions',()=>{
 const g=clone();g.source_versions[0].original_bundled=true;assert.throws(()=>validateComparativeGraph(g),/Comparative schema/);
 const second=clone();second.comparisons[0].current_applicability='applicable';assert.throws(()=>validateComparativeGraph(second),/Comparative schema/);
});
test('comparison CLI rejects unsupported legal-date evaluation',async()=>{
 await assert.rejects(main(['compare','--issue','引用','--jurisdictions','JP,US-federal','--as-of','2026-11-03']),/does not evaluate applicable law/);
});

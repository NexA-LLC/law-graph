import {readFileSync} from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {id,sha256,snapshotId} from './identity.mjs';
export const DEFAULT_COMPARATIVE_GRAPH=new URL('../data/comparative/jp-us-copyright.json',import.meta.url);
const ajv=new Ajv({strict:true,allErrors:true});addFormats(ajv);
const schema=JSON.parse(readFileSync(new URL('../schemas/comparative.schema.json',import.meta.url),'utf8'));
const validateSchema=ajv.compile(schema);
const entities=['jurisdictions','laws','sources','source_versions','anchors','issues','comparisons'];
export function validateComparativeGraph(graph){
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 check(validateSchema(graph),'Comparative schema: '+ajv.errorsText(validateSchema.errors));
 const all=new Map();
 for(const type of entities)for(const record of graph[type]){check(!all.has(record.id),'Duplicate comparative ID');all.set(record.id,{type,record});}
 function get(key,type){const value=all.get(key);check(value&&value.type===type,'Missing/wrong comparative reference: '+key);return value.record;}
 function identity(record,expected){check(record.id===expected,'Comparative identity mismatch: '+record.id);}
 for(const j of graph.jurisdictions){
  identity(j,id('jurisdiction',j.key));
  check(j.level!=='state'||j.subdivision!==null,'State jurisdiction requires a subdivision');
  check(j.level==='state'||j.subdivision===null,'Unexpected subdivision on national/federal jurisdiction');
 }
 for(const law of graph.laws){
  const j=get(law.jurisdiction_id,'jurisdictions');
  identity(law,id('law',j.key,law.identifier_scheme,law.official_id));
  check((law.identifier_scheme==='egov-law-id'&&j.country_code==='JP'&&j.level==='national')||
   (law.identifier_scheme==='uscode-title'&&j.country_code==='US'&&j.level==='federal'),'Law identifier scheme/jurisdiction mismatch');
 }
 for(const source of graph.sources){
  const j=get(source.jurisdiction_id,'jurisdictions');
  identity(source,id('source',source.provider,source.document_key));
  const u=new URL(source.url);
  check(u.protocol==='https:'&&!u.username&&!u.password&&!u.port,'Expected public HTTPS comparative source');
  check(![...u.searchParams.keys()].some(k=>/token|secret|password|signature|api.?key|authorization|code/i.test(k)),'Credential-bearing comparative source');
  if(source.text_role==='original'){
   check(source.authority_kind!=='reference','Original cannot be a reference translation');
   check((j.country_code==='JP'&&source.provider==='egov'&&u.hostname==='laws.e-gov.go.jp')||
    (j.country_code==='US'&&source.provider==='us-copyright-office'&&u.hostname==='www.copyright.gov'),'Unsupported original source provider');
  }else{
   check(source.authority_kind==='reference','Translation must remain reference material');
   check(!/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)&&!u.hostname.endsWith('.local')&&!u.hostname.startsWith('[')&&u.hostname.includes('.'),'Private translation source');
  }
 }
 for(const version of graph.source_versions){
  const source=get(version.source_id,'sources');
  identity(version,id('source-version',source.id,version.upstream_revision_id,'comparative-document',version.content_type,version.content_sha256));
  const retrieval=new URL(version.retrieval_url),canonicalUrl=new URL(source.url);
  check(retrieval.protocol==='https:'&&!retrieval.username&&!retrieval.password&&!retrieval.port&&retrieval.hostname===canonicalUrl.hostname,'Comparative retrieval URL mismatch');
  check(![...retrieval.searchParams.keys()].some(k=>/token|secret|password|signature|api.?key|authorization|code/i.test(k)),'Credential-bearing comparative retrieval');
  if(version.version_evidence_id){
   const evidence=get(version.version_evidence_id,'source_versions'),evidenceSource=get(evidence.source_id,'sources');
   check(evidence.id!==version.id&&evidenceSource.jurisdiction_id===source.jurisdiction_id,'Edition evidence jurisdiction mismatch');
   check(evidenceSource.text_role==='original'&&evidenceSource.authority_kind!=='reference','Edition evidence must be an original official source');
  }
  if(version.reported_through_date)check(version.version_evidence_id!==null,'A compilation-through date requires edition evidence');
 }
 for(const anchor of graph.anchors){
  const law=get(anchor.law_id,'laws'),version=get(anchor.source_version_id,'source_versions'),source=get(version.source_id,'sources');
  check(law.jurisdiction_id===source.jurisdiction_id,'Anchor/source jurisdiction mismatch');
  check(anchor.text_role===source.text_role,'Anchor/source text role mismatch');
  identity(anchor,id('comparative-anchor',law.id,anchor.official_locator,version.id,anchor.text_role));
  if(anchor.text_role==='original')check(anchor.translation_of_anchor_id===null,'Original cannot translate another anchor');
  else{
   const original=get(anchor.translation_of_anchor_id,'anchors');
   check(original.text_role==='original'&&original.law_id===law.id&&original.official_locator===anchor.official_locator,'Translation must refer to the same original law and provision');
   const originalSource=get(get(original.source_version_id,'source_versions').source_id,'sources');
   check(originalSource.language!==source.language,'Translation must distinguish source language');
   const originalVersion=get(original.source_version_id,'source_versions');
   check(version.upstream_revision_id===originalVersion.upstream_revision_id&&version.reported_through_date===originalVersion.reported_through_date,'Translation revision mismatch');
  }
 }
 for(const issue of graph.issues)identity(issue,id('comparative-issue',issue.key));
 for(const comparison of graph.comparisons){
  get(comparison.issue_id,'issues');
  const {id:key,...body}=comparison;identity(comparison,id('comparative-link',body));
  check(comparison.sides[0].jurisdiction_id!==comparison.sides[1].jurisdiction_id,'Comparison requires distinct jurisdictions');
  for(const side of comparison.sides){
   get(side.jurisdiction_id,'jurisdictions');
   for(const key of side.primary_anchor_ids){const a=get(key,'anchors');check(get(a.law_id,'laws').jurisdiction_id===side.jurisdiction_id&&a.text_role==='original','Comparison primary anchor must be an original in the selected jurisdiction');}
   for(const key of side.reference_anchor_ids){const a=get(key,'anchors');check(get(a.law_id,'laws').jurisdiction_id===side.jurisdiction_id&&a.text_role==='reference_translation','Comparison reference must be a translation in the same jurisdiction');}
  }
 }
 for(const observation of graph.observations){
  const version=get(observation.source_version_id,'source_versions'),source=get(version.source_id,'sources');
  check(observation.request_url===version.retrieval_url,'Comparative observation URL mismatch');
 }
 for(const version of graph.source_versions)check(graph.observations.some(o=>o.source_version_id===version.id),'Unobserved comparative source version');
 for(const c of graph.coverage){
  for(const key of c.jurisdiction_ids)get(key,'jurisdictions');
  for(const key of c.issue_ids)get(key,'issues');
  check(graph.observations.some(o=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date(o.observed_at))===c.observed_on),'Comparative coverage observation mismatch');
 }
 check(graph.comparisons.length>0&&graph.comparisons.every(c=>graph.coverage.some(v=>v.issue_ids.includes(c.issue_id)&&c.sides.every(s=>v.jurisdiction_ids.includes(s.jurisdiction_id)))),'Uncovered comparative links');
 return {valid:true,jurisdictions:graph.jurisdictions.length,laws:graph.laws.length,issues:graph.issues.length,comparisons:graph.comparisons.length,anchors:graph.anchors.length,source_versions:graph.source_versions.length};
}
export function loadComparativeGraph(file=DEFAULT_COMPARATIVE_GRAPH){const graph=JSON.parse(readFileSync(file,'utf8'));validateComparativeGraph(graph);return graph;}
export function createComparativeQuery(graph){
 const map=new Map();for(const key of entities)for(const r of graph[key])map.set(r.id,r);
 const response=()=>({schema_version:graph.schema_version,snapshot_id:snapshotId(graph),status:'research_candidates',coverage:graph.coverage,equivalence:'not_asserted',current_applicability:'not_assessed',conflict_of_laws:'not_assessed',temporal_alignment:'not_verified',review_status:'proposed',source_integrity:'hashes_recorded_originals_not_bundled'});
 function renderAnchor(key){
  const anchor=map.get(key),law=map.get(anchor.law_id),version=map.get(anchor.source_version_id),source=map.get(version.source_id);
  const edition=version.version_evidence_id?map.get(version.version_evidence_id):null;
  const editionSource=edition?map.get(edition.source_id):null;
  return {...anchor,law,provenance:{source_id:source.id,source_version_id:version.id,url:source.url,retrieval_url:version.retrieval_url,publisher:source.publisher,source_language:source.language,text_role:source.text_role,authority_kind:source.authority_kind,official_locator:anchor.official_locator,content_sha256:version.content_sha256,upstream_revision_id:version.upstream_revision_id,version_label:version.version_label,reported_through_date:version.reported_through_date,edition_evidence:edition?{source_id:editionSource.id,source_version_id:edition.id,url:editionSource.url,content_sha256:edition.content_sha256}:null,original_bundled:false}};
 }
 return {compare_issue({issue:key,jurisdictions}){
  const normalized=key.normalize('NFKC').toLowerCase();
  const issue=graph.issues.find(i=>i.id===key||i.key===key||[i.label,...i.aliases].some(s=>s.normalize('NFKC').toLowerCase()===normalized));
  const selected=jurisdictions.map(key=>graph.jurisdictions.find(j=>j.id===key||j.key===key));
  if(!issue||selected.some(j=>!j))return {...response(),status:'outside_coverage',issue:null,comparisons:[],supported_jurisdictions:graph.jurisdictions};
  if(selected[0].id===selected[1].id)throw new Error('Select distinct jurisdictions');
  const comparisons=graph.comparisons.filter(c=>c.issue_id===issue.id&&c.sides.every(s=>selected.some(j=>j.id===s.jurisdiction_id)));
  return {...response(),status:comparisons.length?'research_candidates':'outside_coverage',issue,comparisons:comparisons.map(c=>({...c,sides:selected.map(j=>{const s=c.sides.find(s=>s.jurisdiction_id===j.id);return {jurisdiction:j,primary:s.primary_anchor_ids.map(renderAnchor),references:s.reference_anchor_ids.map(renderAnchor)};})}))};
 }};
}

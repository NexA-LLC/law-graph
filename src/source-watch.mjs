import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, appendFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadGraph} from './validate.mjs';
import {loadCaseGraph} from './cases.mjs';
import {loadComparativeGraph} from './comparative.mjs';
import {sha256} from './identity.mjs';
import {DATA_ROOT, DEFAULT_GRAPH} from './cli.mjs';

const HOSTS = new Set(['laws.e-gov.go.jp','www.copyright.gov','www.courts.go.jp','www.caa.go.jp','www.jftc.go.jp','cryptocurrency-association.org']);
export function assertWatchUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) || url.port || url.username || url.password || url.hash ||
      [...url.searchParams.keys()].some(k => /token|secret|password|api.?key|authorization/i.test(k))) throw new Error('Unapproved public source URL');
  return url;
}
export function watchTargets() {
  const statute=loadGraph(DEFAULT_GRAPH,DATA_ROOT), cases=loadCaseGraph(), comparative=loadComparativeGraph();
  const targets=[];
  for(const graph of [statute,cases,comparative]) for(const version of graph.source_versions) {
    const source=graph.sources.find(s=>s.id===version.source_id);
    const recorded=version.retrieval_url || source.url;
    const url=assertWatchUrl(recorded);
    if(url.hostname==='laws.e-gov.go.jp'){
      const officialId=version.upstream_revision_id.split('_')[0];
      url.pathname='/api/2/law_data/'+officialId;
    }
    targets.push({source_version_id:version.id,url:url.href,expected_sha256:version.content_sha256,
      hash_method:version.hash_method || 'canonical-json-sha256-v1',upstream_revision_id:version.upstream_revision_id || null});
  }
  return [...new Map(targets.map(t=>[t.source_version_id,t])).values()];
}
async function download(url,fetchImpl){
  assertWatchUrl(url);
  const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Source HTTP '+response.status);
  if(Number(response.headers.get('content-length'))>10000000)throw new Error('Source too large');
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>10000000)throw new Error('Source too large');chunks.push(value);}}
  finally{await reader.cancel();}
  return Buffer.concat(chunks);
}
export async function checkSources({targets=watchTargets(),fetchImpl=fetch}={}){
  const changes=[],errors=[];
  for(const target of targets){
    try{
      const bytes=await download(target.url,fetchImpl);
      const parsed=target.url.startsWith('https://laws.e-gov.go.jp/') ? JSON.parse(bytes.toString('utf8')) : null;
      const hash=target.hash_method==='canonical-json-sha256-v1' ? sha256(parsed) : createHash('sha256').update(bytes).digest('hex');
      const currentRevision=parsed?.revision_info?.law_revision_id || null;
      if(hash!==target.expected_sha256 || (currentRevision && currentRevision!==target.upstream_revision_id)){
        changes.push({...target,observed_sha256:hash,observed_upstream_revision_id:currentRevision,
          status:'requires_source_review',automatically_applied:false});
      }
    }catch{errors.push({source_version_id:target.source_version_id,url:target.url,status:'source_unavailable'});}
  }
  return {schema_version:'law-graph.source-watch.v1',checked:targets.length,changes,errors,
    current_applicability:'not_assessed',existing_corpus_modified:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  checkSources().then(report=>{
    const out=resolve('.cache/source-watch.json');mkdirSync(dirname(out),{recursive:true});
    writeFileSync(out,JSON.stringify(report,null,2)+'\n');
    process.stdout.write(JSON.stringify({checked:report.checked,changes:report.changes.length,errors:report.errors.length})+'\n');
    if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'changed='+(report.changes.length>0)+'\n');
    if(report.errors.length)process.exitCode=1;
  }).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
}

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildGraph } from './egov.mjs';
import { sha256, snapshotId } from './identity.mjs';
import { validateGraph } from './validate.mjs';

export async function fetchArticle(identifier, article, fetchImpl = fetch) {
  if (!/^[0-9A-Z_]+$/.test(identifier) || !/^[0-9]+(_[0-9]+)*$/.test(article)) throw new Error('Invalid e-Gov identifier or article');
  const url = new URL('https://laws.e-gov.go.jp/api/2/law_data/' + identifier);
  url.searchParams.set('elm', 'LawBody-MainProvision-Article_' + article);
  const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error('e-Gov HTTP ' + response.status);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 4_000_000) throw new Error('Article response exceeds 4 MB');
    chunks.push(Buffer.from(chunk));
  }
  return { payload: JSON.parse(Buffer.concat(chunks).toString('utf8')), request_url: url.toString(), observed_at: new Date().toISOString() };
}

export async function importEgov({ lawId, articles, revisionId, out, dataRoot, fetchImpl }) {
  if (!articles.length || articles.length > 10 || new Set(articles).size !== articles.length) throw new Error('Select 1–10 unique articles');
  if (existsSync(out)) throw new Error('Refusing to overwrite graph; choose a new output file');
  const inputs = [];
  let pinned = revisionId;
  for (const article of articles) {
    const input = await fetchArticle(pinned ?? lawId, article, fetchImpl);
    if (input.payload.law_info?.law_id !== lawId) throw new Error('Returned law ID differs from requested law');
    pinned ??= input.payload.revision_info?.law_revision_id;
    inputs.push(input);
  }
  const asOf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(inputs[0].observed_at));
  const { graph, artifacts } = buildGraph(inputs, asOf);
  validateGraph(graph, key => artifacts.get(key));
  for (const [path, payload] of artifacts) {
    const file = resolve(dataRoot, path);
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) {
      if (sha256(JSON.parse(readFileSync(file, 'utf8'))) !== sha256(payload)) throw new Error('Existing source artifact differs: ' + path);
    } else writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx' });
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(graph, null, 2) + '\n', { flag: 'wx' });
  return { graph_file: out, snapshot_id: snapshotId(graph), as_of: asOf, articles, source_versions: graph.source_versions.length };
}

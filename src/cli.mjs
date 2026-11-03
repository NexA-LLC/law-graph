#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadGraph } from './validate.mjs';
import { createQuery } from './query.mjs';
import { callTool } from './tools.mjs';
import { importEgov } from './import.mjs';
import { mergeFiles } from './merge.mjs';

export const DATA_ROOT = fileURLToPath(new URL('../data/', import.meta.url));
export const DEFAULT_GRAPH = resolve(DATA_ROOT, 'corpora/contracts-20261103.graph.json');

export async function main(args = process.argv.slice(2)) {
  const { positionals, values } = parseArgs({
    args, allowPositionals: true,
    options: Object.fromEntries(['graph', 'graphs', 'intents', 'intent', 'data-root', 'law-id', 'articles', 'revision-id', 'out', 'query', 'id', 'article', 'paragraph', 'item', 'as-of', 'limit', 'depth', 'direction', 'max-chars'].map(key => [key, { type: 'string' }]))
  });
  if (positionals.length !== 1) throw new Error('Usage: law-graph <validate|coverage|search|resolve|get|traverse|find-related|import-egov|merge-graphs> [options]');
  const command = positionals[0];
  const dataRoot = resolve(values['data-root'] ?? DATA_ROOT);
  if (command === 'merge-graphs') {
    if (!values.graphs || !values.out) throw new Error('merge-graphs requires --graphs <comma-separated paths> and --out');
    return mergeFiles({ files: values.graphs.split(',').map(p => resolve(p)), out: resolve(values.out), dataRoot, intentsFile: values.intents ? resolve(values.intents) : undefined });
  }
  if (command === 'import-egov') {
    if (!values['law-id'] || !values.articles || !values.out) throw new Error('import-egov requires --law-id, --articles, --out');
    return importEgov({ lawId: values['law-id'], articles: values.articles.split(','), revisionId: values['revision-id'], out: resolve(values.out), dataRoot });
  }
  const file = resolve(values.graph ?? DEFAULT_GRAPH);
  const graph = loadGraph(file, dataRoot);
  const query = createQuery(graph);
  if (command === 'validate') return { valid: true, ...query.coverage().counts };
  if (command === 'coverage') return query.coverage();
  const input = {};
  const mappings = { intent: 'intent', query: 'query', id: 'id', 'law-id': 'law_id', article: 'article', paragraph: 'paragraph', item: 'item', 'as-of': 'as_of', limit: 'limit', depth: 'depth', direction: 'direction', 'max-chars': 'max_chars' };
  for (const [flag, key] of Object.entries(mappings)) if (values[flag] !== undefined) {
    input[key] = ['limit', 'depth', 'max_chars'].includes(flag) ? Number(values[flag]) : values[flag];
  }
  const names = { 'find-related': 'find_related_laws', search: 'search_provisions', resolve: 'resolve_citation', get: 'get_provision', traverse: 'traverse_relations' };
  if (!names[command]) throw new Error('Unknown command: ' + command);
  return callTool(query, names[command], input);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n')).catch(error => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  });
}

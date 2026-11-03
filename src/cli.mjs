#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadGraph } from './validate.mjs';
import { createQuery } from './query.mjs';
import { callTool } from './tools.mjs';
import { importEgov } from './import.mjs';
import { loadCaseGraph, createCaseQuery, validateCaseGraph } from './cases.mjs';

export const DATA_ROOT = fileURLToPath(new URL('../data/', import.meta.url));
export const DEFAULT_GRAPH = resolve(DATA_ROOT, 'laws/415AC0000000057/seed.graph.json');

export async function main(args = process.argv.slice(2)) {
  const { positionals, values } = parseArgs({
    args, allowPositionals: true,
    options: Object.fromEntries(['graph', 'case-graph', 'data-root', 'law-id', 'articles', 'revision-id', 'out', 'query', 'id', 'article', 'paragraph', 'item', 'as-of', 'limit', 'depth', 'direction', 'max-chars', 'topic', 'kind'].map(key => [key, { type: 'string' }]))
  });
  if (positionals.length !== 1) throw new Error('Usage: law-graph <validate|coverage|search|resolve|get|traverse|cases|case|topic|validate-cases|import-egov> [options]');
  const command = positionals[0];
  const dataRoot = resolve(values['data-root'] ?? DATA_ROOT);
  if (command === 'import-egov') {
    if (!values['law-id'] || !values.articles || !values.out) throw new Error('import-egov requires --law-id, --articles, --out');
    return importEgov({ lawId: values['law-id'], articles: values.articles.split(','), revisionId: values['revision-id'], out: resolve(values.out), dataRoot });
  }
  const caseGraph = loadCaseGraph(values['case-graph']);
  const caseQuery = createCaseQuery(caseGraph);
  if (command === 'validate-cases') return validateCaseGraph(caseGraph);
  const caseNames = {cases:'search_cases',case:'get_case',topic:'explore_topic'};
  if (caseNames[command]) {
    if(values['as-of']!==undefined)throw new Error('Case research does not evaluate legal applicability at an as-of date');
    const input = {};
    for (const key of ['query','id','topic','kind']) if (values[key] !== undefined) input[key]=values[key];
    if (values.limit !== undefined) input.limit=Number(values.limit);
    return callTool(caseQuery,caseNames[command],input);
  }
  const file = resolve(values.graph ?? DEFAULT_GRAPH);
  const graph = loadGraph(file, dataRoot);
  const query = createQuery(graph);
  if (command === 'validate') return { valid: true, ...query.coverage().counts, case_graph:validateCaseGraph(caseGraph) };
  if (command === 'coverage') return {...query.coverage(),case_graph:validateCaseGraph(caseGraph),case_coverage:caseGraph.coverage};
  const input = {};
  const mappings = { query: 'query', id: 'id', 'law-id': 'law_id', article: 'article', paragraph: 'paragraph', item: 'item', 'as-of': 'as_of', limit: 'limit', depth: 'depth', direction: 'direction', 'max-chars': 'max_chars' };
  for (const [flag, key] of Object.entries(mappings)) if (values[flag] !== undefined) {
    input[key] = ['limit', 'depth', 'max_chars'].includes(flag) ? Number(values[flag]) : values[flag];
  }
  const names = { search: 'search_provisions', resolve: 'resolve_citation', get: 'get_provision', traverse: 'traverse_relations' };
  if (!names[command]) throw new Error('Unknown command: ' + command);
  return callTool(query, names[command], input);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n')).catch(error => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  });
}

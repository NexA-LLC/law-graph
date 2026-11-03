import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { canonical } from './identity.mjs';
import { extractReferences, inferAuthorities, REFERENCE_METHOD } from './references.mjs';
import { loadGraph, validateGraph } from './validate.mjs';

export function mergeGraphs(graphs) {
  if (!graphs.length) throw new Error('At least one graph is required');
  const graph = { schema_version: graphs[0].schema_version, namespace: graphs[0].namespace };
  const collections = new Set(graphs.flatMap(g => Object.keys(g).filter(k => Array.isArray(g[k]))));
  for (const input of graphs) if (input.schema_version !== graph.schema_version || input.namespace !== graph.namespace) throw new Error('Incompatible graph protocol');
  for (const kind of collections) {
    const records = new Map();
    for (const input of graphs) for (const record of input[kind] ?? []) {
      const key = record.id ?? (kind === 'coverage' ? canonical([record.law_revision_id, record.as_of]) : canonical(record));
      if (records.has(key) && canonical(records.get(key)) !== canonical(record)) {
        if (kind === 'coverage') {
          const { locators: oldLocators, ...old } = records.get(key);
          const { locators, ...metadata } = record;
          if (canonical(old) === canonical(metadata)) {
            records.set(key, { ...metadata, locators: [...new Set([...oldLocators, ...locators])].sort() });
            continue;
          }
        }
        throw new Error('Conflicting ' + kind + ': ' + key);
      }
      records.set(key, structuredClone(record));
    }
    graph[kind] = [...records.values()].sort((a,b) => canonical(a).localeCompare(canonical(b)));
  }
  return graph;
}

export function mergeFiles({ files, out, dataRoot, intentsFile }) {
  if (existsSync(out)) throw new Error('Refusing to overwrite graph; choose a new output file');
  const graph = mergeGraphs(files.map(file => loadGraph(file, dataRoot)));
  const inferred = inferAuthorities(graph);
  // Retain imported assertions, including legacy unresolved delegation candidates.
  const extra = { ...graph, relations: [...extractReferences(graph), ...inferred.relations], authorities: inferred.authorities };
  let merged = mergeGraphs([graph, extra]);
  if (intentsFile) {
    const catalog = JSON.parse(readFileSync(intentsFile, 'utf8'));
    if (Object.keys(catalog).some(k => !['schema_version', 'namespace', 'intents', 'relations'].includes(k)) ||
      !Array.isArray(catalog.intents) || !Array.isArray(catalog.relations) || catalog.relations.some(r => r.type !== 'relates_to')) throw new Error('Invalid Intent catalog');
    merged = mergeGraphs([merged, catalog]);
  }
  for (const coverage of merged.coverage) {
    coverage.reference_extractor = REFERENCE_METHOD;
    coverage.relation_types = ['contains', 'defines', 'delegates_to', 'cites', 'administered_by'];
    coverage.limits = [...new Set([...coverage.limits, 'Narrow literal references and same-observation-day targets only; relative references stay unresolved.',
      'Delegations require implementation-side references; legacy unresolved candidates are retained.',
      'Authority candidates are unreviewed inferences from ministry/minister mentions, not an official authority register.'])];
  }
  validateGraph(merged, key => JSON.parse(readFileSync(resolve(dataRoot, key), 'utf8')));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(merged, null, 2) + '\n', { flag: 'wx' });
  return { graph_file: out, laws: merged.laws.length, relations: merged.relations.length };
}

import {readFileSync} from 'node:fs';
import {loadGraph} from './validate.mjs';
import {createQuery} from './query.mjs';
import {loadCaseGraph, createCaseQuery} from './cases.mjs';
import {loadComparativeGraph, createComparativeQuery} from './comparative.mjs';
import {tools, callTool} from './tools.mjs';
import {snapshotId} from './identity.mjs';
import {DATA_ROOT, DEFAULT_GRAPH} from './cli.mjs';

export const RESEARCH_PROTOCOL = 'law-graph.research.v1';

/** Validates the installed corpus once. All queries are offline and read-only. */
export function createResearchClient() {
  const graph = loadGraph(DEFAULT_GRAPH, DATA_ROOT);
  const cases = loadCaseGraph();
  const comparative = loadComparativeGraph();
  const query = {...createQuery(graph), ...createCaseQuery(cases), ...createComparativeQuery(comparative)};
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const source = {
    schema_version: RESEARCH_PROTOCOL, repository: 'https://github.com/NexA-LLC/law-graph',
    package_version: pkg.version, mode: 'offline_read_only', current_applicability: 'not_assessed',
    snapshots: {statutes: snapshotId(graph), cases: snapshotId(cases), comparative: snapshotId(comparative)},
    coverage: {
      statutes: graph.coverage.map(({locators, ...c}) => ({...c, provision_locator_count: locators.length})),
      cases: cases.coverage, comparative: comparative.coverage,
    },
  };
  function call(name, args = {}) { return callTool(query, name, args); }
  return {
    status() { return structuredClone(source); },
    tools() { return structuredClone(tools); },
    call,
    /** Literal aliases select research candidates, never legal applicability. */
    contextForQuery(message, {maxChars = 24000} = {}) {
      if (typeof message !== 'string' || !message.trim() || message.length > 100000) throw new Error('Expected a bounded research query');
      if (!Number.isInteger(maxChars) || maxChars < 8000 || maxChars > 64000) throw new Error('Invalid context budget');
      const normalized = message.normalize('NFKC').toLowerCase();
      const requests = [];
      if (/日本|japan/.test(normalized) && /米国|アメリカ|united states|\bus\b/.test(normalized)) {
        const issue = comparative.issues.find(i => [i.label, ...i.aliases].some(a => normalized.includes(a.normalize('NFKC').toLowerCase())));
        if (issue) requests.push({tool: 'compare_issue', arguments: {issue: issue.key,
          jurisdictions: ['JP', /州|california|state law/.test(normalized) ? 'US-state-unspecified' : 'US-federal']}, matched_term: issue.key});
      }
      for (const topic of cases.topics) {
        const match = [topic.label, ...topic.aliases].find(a => normalized.includes(a.normalize('NFKC').toLowerCase()));
        if (match) requests.push({tool: 'explore_topic', arguments: {topic: topic.key, limit: 3}, matched_term: match});
      }
      const intent = /建設|建築/.test(normalized) ? 'construction-contract' : /請負/.test(normalized) ? 'contract-work' : null;
      if (intent) requests.push({tool: 'find_related_laws', arguments: {intent, limit: 3}, matched_term: intent});
      if (!requests.length) {
        const term = ['個人情報', '著作権', '秘密保持', '契約', '支払'].find(t => normalized.includes(t));
        requests.push({tool: 'search_provisions', arguments: {query: term || message.trim().slice(0, 200), limit: 3}, matched_term: term || null});
      }
      const envelope = {
        schema_version: 'law-graph.context.v1', status: 'research_candidates', source: structuredClone(source),
        selection_basis: 'literal_terms_for_candidate_retrieval_not_legal_judgment',
        current_applicability: 'not_assessed', results: [], omitted: [], truncated: requests.length > 3,
      };
      for (const request of requests.slice(0, 3)) {
        const entry = {...request, result: call(request.tool, request.arguments)};
        if (JSON.stringify({...envelope, results: [...envelope.results, entry]}).length <= maxChars - 1000) envelope.results.push(entry);
        else { envelope.truncated = true; envelope.omitted.push({tool: request.tool, reason: 'context_budget'}); }
      }
      if (!envelope.results.some(e => e.result.results?.length || e.result.cases?.length || e.result.issues?.length || e.result.comparisons?.length)) {
        envelope.status = envelope.omitted.length ? 'context_budget_exceeded' : 'outside_coverage';
      }
      return envelope;
    },
  };
}

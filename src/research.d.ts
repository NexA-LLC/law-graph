export type ResearchTool = 'find_related_laws' | 'search_provisions' | 'resolve_citation' | 'get_provision' | 'traverse_relations' | 'explore_topic' | 'search_cases' | 'get_case' | 'compare_issue';
export interface ResearchClient {
  status(): Record<string, unknown>;
  tools(): Array<Record<string, unknown>>;
  call(name: ResearchTool, args?: Record<string, unknown>): Record<string, unknown>;
  contextForQuery(message: string, options?: {maxChars?: number}): Record<string, unknown>;
}
export const RESEARCH_PROTOCOL: 'law-graph.research.v1';
export function createResearchClient(): ResearchClient;

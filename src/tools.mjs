import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { caseTools } from './case-tools.mjs';
import { comparativeTools } from './comparative-tools.mjs';
const uuid = { type: 'string', format: 'uuid' };
const asOf = { type: 'string', format: 'date', description: 'Exact observation date covered by the graph; other dates return outside_coverage.' };
const object = (properties, required) => ({ type: 'object', additionalProperties: false, properties, required });
const number = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const part = { type: 'string', pattern: '^[0-9]+(_[0-9]+)*$' };
export const tools = [
  {
    name: 'find_related_laws', description: 'Offline exact Intent slug/label lookup. Returns curated research links, reasons, supporting provisions and unreviewed state; unknown intents return outside_coverage. Does not decide legal applicability.',
    inputSchema: object({ intent: { type: 'string', minLength: 1, maxLength: 200 }, as_of: asOf, limit: number(1, 50) }, ['intent'])
  },
  {
    name: 'search_provisions', description: 'Offline literal search over a partial source-grounded corpus; returns exact provenance and coverage.',
    inputSchema: object({ query: { type: 'string', minLength: 1, maxLength: 200 }, as_of: asOf, limit: number(1, 50) }, ['query'])
  },
  {
    name: 'resolve_citation', description: 'Resolve an explicit e-Gov law ID and main-provision article/paragraph/item. Uncollected citations return outside_coverage.',
    inputSchema: object({ law_id: { type: 'string', minLength: 1 }, article: part, paragraph: part, item: part, as_of: asOf }, ['law_id', 'article'])
  },
  {
    name: 'get_provision', description: 'Read a specific provision-version UUID with source/version/evidence IDs. Does not infer the current law.',
    inputSchema: object({ id: uuid, as_of: asOf, max_chars: number(1, 12000) }, ['id'])
  },
  {
    name: 'traverse_relations', description: 'Bounded read-only relation traversal. Explicit unresolved delegation candidates stay unresolved; all initial relations are unreviewed.',
    inputSchema: object({ id: uuid, as_of: asOf, depth: number(1, 3), limit: number(1, 100), types: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['contains', 'defines', 'delegates_to', 'cites', 'administered_by', 'relates_to'] } }, direction: { enum: ['out', 'in', 'both'] } }, ['id'])
  }
].concat(caseTools,comparativeTools).map(t => ({ ...t, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validators = new Map(tools.map(t => [t.name, ajv.compile(t.inputSchema)]));

export function callTool(query, name, args) {
  const validate = validators.get(name);
  if (!validate) throw new Error('Unknown tool: ' + name);
  if (!validate(args)) throw new Error('Invalid arguments: ' + ajv.errorsText(validate.errors));
  return query[name](args);
}

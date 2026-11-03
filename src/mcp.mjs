#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { loadGraph } from './validate.mjs';
import { createQuery } from './query.mjs';
import { tools, callTool } from './tools.mjs';
import { DATA_ROOT, DEFAULT_GRAPH } from './cli.mjs';

const { values } = parseArgs({ options: { graph: { type: 'string' }, 'data-root': { type: 'string' } } });
const graph = loadGraph(resolve(values.graph ?? DEFAULT_GRAPH), resolve(values['data-root'] ?? DATA_ROOT));
const query = createQuery(graph);
const server = new Server({ name: 'law-graph', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const result = callTool(query, request.params.name, request.params.arguments ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error.message }] };
  }
});
await server.connect(new StdioServerTransport());

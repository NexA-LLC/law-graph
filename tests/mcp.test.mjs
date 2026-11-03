import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('real stdio MCP handshake, tool discovery, citation, provenance, and coverage', { timeout: 15000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const transport = new StdioClientTransport({ command: process.execPath, args: ['src/mcp.mjs'], cwd: root, stderr: 'pipe' });
  const client = new Client({ name: 'law-graph-test', version: '1.0.0' });
  let stderr = '';
  transport.stderr.on('data', chunk => { stderr += chunk.toString(); });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 5);
    assert.ok(listed.tools.every(t => t.annotations.readOnlyHint));
    const related = await client.callTool({ name: 'find_related_laws', arguments: { intent: 'construction-contract', limit: 1 } });
    assert.equal(related.isError, undefined);
    assert.equal(related.structuredContent.status, 'ok');
    assert.equal(related.structuredContent.total_matches, 3);
    assert.equal(related.structuredContent.truncated, true);
    assert.equal(related.structuredContent.results[0].review_state, 'unreviewed');
    assert.ok(related.structuredContent.results[0].basis_provision_ids.length);
    assert.ok(related.structuredContent.results[0].reason);
    const unknown = await client.callTool({ name: 'find_related_laws', arguments: { intent: '未登録の目的' } });
    assert.equal(unknown.structuredContent.status, 'outside_coverage');
    const badIntent = await client.callTool({ name: 'find_related_laws', arguments: { intent: 'contract-work', limit: 999 } });
    assert.equal(badIntent.isError, true);
    const resolved = await client.callTool({
      name: 'resolve_citation',
      arguments: { law_id: '415AC0000000057', article: '2', paragraph: '1' }
    });
    assert.equal(resolved.isError, undefined);
    const result = resolved.structuredContent;
    assert.equal(result.status, 'ok');
    assert.equal(result.results.length, 1);
    assert.ok(result.results[0].provenance[0].source_id);
    assert.ok(result.results[0].provenance[0].source_version_id);
    assert.ok(result.results[0].provenance[0].evidence_ref_id);
    const fetched = await client.callTool({ name: 'get_provision', arguments: { id: result.results[0].id } });
    assert.match(fetched.structuredContent.result.text, /個人情報/);
    const stale = await client.callTool({ name: 'search_provisions', arguments: { query: '個人情報', as_of: '2000-01-01' } });
    assert.equal(stale.structuredContent.status, 'outside_coverage');
    const invalid = await client.callTool({ name: 'search_provisions', arguments: { query: '個人情報', limit: 99999 } });
    assert.equal(invalid.isError, true);
    assert.equal(stderr, '');
  } finally {
    await client.close();
  }
});

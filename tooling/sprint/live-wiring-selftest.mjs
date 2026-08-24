import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { writeDshPatches, parseReviewGate, parseResearchReceipt } from './dsh-runtime.mjs';

test('role patches isolate research, implement, and review capabilities', () => {
  const root = '/tmp/smokestack-sprint-wiring-selftest';
  fs.rmSync(root, { recursive: true, force: true });
  const research = writeDshPatches({ controlDir: path.join(root, 'research'), port: 12345, phase: 'research', researchMcp: { command: 'node', args: ['/tmp/lit.mjs'] } });
  const researchRole = fs.readFileSync(research.role, 'utf8');
  assert.match(researchRole, /tool-subagent-codex-implementer[\s\S]*disabled: true/);
  assert.match(researchRole, /tool-subagent-claude-reviewer[\s\S]*disabled: true/);
  assert.match(researchRole, /@deepseek-ai\/dsh-mcp-client/);

  const implement = writeDshPatches({ controlDir: path.join(root, 'implement'), port: 12345, phase: 'implement' });
  const implementRole = fs.readFileSync(implement.role, 'utf8');
  assert.match(implementRole, /tool-subagent-claude-reviewer[\s\S]*disabled: true/);
  assert.doesNotMatch(implementRole, /dsh-mcp-client/);
  assert.doesNotMatch(implementRole, /tool-subagent-codex-implementer/);

  const review = writeDshPatches({ controlDir: path.join(root, 'review'), port: 12345, phase: 'review' });
  const reviewRole = fs.readFileSync(review.role, 'utf8');
  assert.match(reviewRole, /tool-subagent-codex-implementer[\s\S]*disabled: true/);
  assert.doesNotMatch(reviewRole, /dsh-mcp-client/);
  assert.doesNotMatch(reviewRole, /tool-subagent-claude-reviewer/);
});

test('gate parsers fail closed on ambiguity', () => {
  assert.equal(parseReviewGate('REVIEW_GATE: NO_CRITICAL_HIGH'), 'NO_CRITICAL_HIGH');
  assert.equal(parseReviewGate('REVIEW_GATE: NO_CRITICAL_HIGH\nREVIEW_GATE: CRITICAL_HIGH_FOUND'), 'AMBIGUOUS');
  const good = parseResearchReceipt('EVIDENCE_JSON: {"sources":[{"id":"a"},{"id":"b"}]}\nRESEARCH_GATE: PASS');
  assert.equal(good.gate, 'PASS');
  assert.equal(good.evidence.sources.length, 2);
  assert.equal(parseResearchReceipt('RESEARCH_GATE: PASS').evidence, null);
  assert.equal(parseResearchReceipt('RESEARCH_GATE: PASS\nRESEARCH_GATE: BLOCKED').gate, 'AMBIGUOUS');
});

test('qualification MCP fixture is deterministic and read-only', async () => {
  const serverPath = new URL('./qualification/literature-mcp-fixture.mjs', import.meta.url);
  const child = spawn(process.execPath, [serverPath.pathname], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    for (;;) {
      const idx = buffer.indexOf('\n');
      if (idx < 0) break;
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  let id = 0;
  const call = (method, params = {}) => new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  try {
    const init = await call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'smokestack-literature-fixture');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    const list = await call('tools/list');
    assert.deepEqual(list.result.tools.map((x) => x.name).sort(), ['search_literature', 'verify_source']);
    const search = await call('tools/call', { name: 'search_literature', arguments: { query: 'PIT' } });
    const payload = JSON.parse(search.result.content[0].text);
    assert.equal(payload.fixture, true);
    assert.equal(payload.sources.length, 3);
    const verify = await call('tools/call', { name: 'verify_source', arguments: { id: 'FIXTURE:PIT-001' } });
    assert.equal(JSON.parse(verify.result.content[0].text).verified, true);
  } finally {
    child.kill('SIGTERM');
  }
});

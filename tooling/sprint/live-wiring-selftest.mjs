import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { writeDshPatches, parseReviewGate, parseResearchReceipt } from './dsh-runtime.mjs';
import { changedPaths, isAuthorizedPath, reconcileNonPassWorktree } from './live-sprint.mjs';

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if ((result.status ?? 125) !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function createReconciliationRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-reconciliation-'));
  runGit(cwd, ['init', '-q']);
  runGit(cwd, ['config', 'user.email', 'smokestack-test@example.invalid']);
  runGit(cwd, ['config', 'user.name', 'Smokestack Test']);
  fs.mkdirSync(path.join(cwd, 'experiments/qualification'), { recursive: true });
  fs.mkdirSync(path.join(cwd, 'outside'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'experiments/qualification/tracked.txt'), 'baseline\n');
  fs.writeFileSync(path.join(cwd, 'outside/preserved.txt'), 'baseline\n');
  runGit(cwd, ['add', '.']);
  runGit(cwd, ['commit', '-qm', 'baseline']);
  return cwd;
}

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

test('authority matcher supports exact files and recursive dir/** only', () => {
  assert.equal(isAuthorizedPath('src/exact.js', ['src/exact.js']), true);
  assert.equal(isAuthorizedPath('experiments/qualification/a/b.json', ['experiments/qualification/**']), true);
  assert.equal(isAuthorizedPath('experiments/qualification', ['experiments/qualification/**']), true);
  assert.equal(isAuthorizedPath('experiments/qualification-evil/a.json', ['experiments/qualification/**']), false);
  assert.equal(isAuthorizedPath('experiments/other/a.json', ['experiments/*/a.json']), false);
  assert.equal(isAuthorizedPath('../outside.txt', ['../**']), false);
});

test('authorized non-PASS rollback restores tracked/staged changes to checkpoint and proves clean', () => {
  const cwd = createReconciliationRepo();
  try {
    const checkpointHead = runGit(cwd, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(cwd, 'experiments/qualification/tracked.txt'), 'changed\n');
    fs.writeFileSync(path.join(cwd, 'experiments/qualification/new.txt'), 'new\n');
    runGit(cwd, ['add', 'experiments/qualification/new.txt']);

    const result = reconcileNonPassWorktree(cwd, ['experiments/qualification/**'], checkpointHead);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.authority_violation, false);
    assert.equal(fs.readFileSync(path.join(cwd, 'experiments/qualification/tracked.txt'), 'utf8'), 'baseline\n');
    assert.equal(fs.existsSync(path.join(cwd, 'experiments/qualification/new.txt')), false);
    assert.deepEqual(changedPaths(cwd), []);
    assert.equal(runGit(cwd, ['rev-parse', 'HEAD']), checkpointHead);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('any unauthorized mutation is preserved and blocks authorized rollback', () => {
  const cwd = createReconciliationRepo();
  try {
    const checkpointHead = runGit(cwd, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(cwd, 'experiments/qualification/tracked.txt'), 'authorized dirty\n');
    fs.writeFileSync(path.join(cwd, 'outside/preserved.txt'), 'unauthorized dirty\n');

    const result = reconcileNonPassWorktree(cwd, ['experiments/qualification/**'], checkpointHead);
    assert.equal(result.ok, false);
    assert.equal(result.authority_violation, true);
    assert.deepEqual(result.before.unauthorized, ['outside/preserved.txt']);
    assert.equal(fs.readFileSync(path.join(cwd, 'experiments/qualification/tracked.txt'), 'utf8'), 'authorized dirty\n');
    assert.equal(fs.readFileSync(path.join(cwd, 'outside/preserved.txt'), 'utf8'), 'unauthorized dirty\n');
    assert.deepEqual(changedPaths(cwd), ['experiments/qualification/tracked.txt', 'outside/preserved.txt']);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
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

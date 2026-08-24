import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { apply as applyToolCallGuard } from './dsh-tool-call-guard.mjs';
import { writeDshPatches, readToolGuardLedger, parseReviewGate, parseResearchReceipt } from './dsh-runtime.mjs';
import {
  changedPaths,
  isAuthorizedPath,
  reconcileNonPassWorktree,
  captureIgnoredState,
  compareIgnoredState,
  validatePhaseToolLedger,
  commitTask,
  resolveHead,
} from './live-sprint.mjs';

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
  fs.writeFileSync(path.join(cwd, '.gitignore'), 'ignored/\n');
  fs.writeFileSync(path.join(cwd, 'experiments/qualification/tracked.txt'), 'baseline\n');
  fs.writeFileSync(path.join(cwd, 'outside/preserved.txt'), 'baseline\n');
  runGit(cwd, ['add', '.']);
  runGit(cwd, ['commit', '-qm', 'baseline']);
  fs.mkdirSync(path.join(cwd, 'ignored'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'ignored/cache.txt'), 'baseline ignored\n');
  return cwd;
}

function guardHarness({ limits = {}, observe = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-tool-guard-'));
  const ledger = path.join(root, 'ledger.jsonl');
  let guard = null;
  let resultObserver = null;
  const ctx = {
    tools: {
      guard(fn) {
        guard = fn;
        return () => {};
      },
    },
    on(name, fn) {
      if (name === 'tools/result') resultObserver = fn;
      return () => {};
    },
  };
  const previous = {
    ledger: process.env.SMOKESTACK_TOOL_GUARD_LEDGER,
    limits: process.env.SMOKESTACK_TOOL_GUARD_LIMITS,
    observe: process.env.SMOKESTACK_TOOL_GUARD_OBSERVE,
  };
  process.env.SMOKESTACK_TOOL_GUARD_LEDGER = ledger;
  process.env.SMOKESTACK_TOOL_GUARD_LIMITS = JSON.stringify(limits);
  process.env.SMOKESTACK_TOOL_GUARD_OBSERVE = JSON.stringify(observe);
  try {
    applyToolCallGuard(ctx);
  } finally {
    if (previous.ledger === undefined) delete process.env.SMOKESTACK_TOOL_GUARD_LEDGER;
    else process.env.SMOKESTACK_TOOL_GUARD_LEDGER = previous.ledger;
    if (previous.limits === undefined) delete process.env.SMOKESTACK_TOOL_GUARD_LIMITS;
    else process.env.SMOKESTACK_TOOL_GUARD_LIMITS = previous.limits;
    if (previous.observe === undefined) delete process.env.SMOKESTACK_TOOL_GUARD_OBSERVE;
    else process.env.SMOKESTACK_TOOL_GUARD_OBSERVE = previous.observe;
  }
  if (!guard || !resultObserver) throw new Error('tool guard did not register expected hooks');
  return {
    ledger,
    guard,
    resultObserver,
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); },
  };
}

test('role patches isolate capabilities and install the monotonic tool guard', () => {
  const root = '/tmp/smokestack-sprint-wiring-selftest';
  fs.rmSync(root, { recursive: true, force: true });
  const research = writeDshPatches({ controlDir: path.join(root, 'research'), port: 12345, phase: 'research', researchMcp: { command: 'node', args: ['/tmp/lit.mjs'] } });
  const researchRole = fs.readFileSync(research.role, 'utf8');
  assert.match(researchRole, /smokestack-tool-call-guard/);
  assert.match(researchRole, /tool-subagent-codex-implementer[\s\S]*disabled: true/);
  assert.match(researchRole, /tool-subagent-claude-reviewer[\s\S]*disabled: true/);
  assert.match(researchRole, /@deepseek-ai\/dsh-mcp-client/);
  assert.deepEqual(research.guardObserve.sort(), ['mcp__literature__search_literature', 'mcp__literature__verify_source'].sort());

  const implement = writeDshPatches({ controlDir: path.join(root, 'implement'), port: 12345, phase: 'implement' });
  const implementRole = fs.readFileSync(implement.role, 'utf8');
  assert.match(implementRole, /smokestack-tool-call-guard/);
  assert.match(implementRole, /tool-subagent-claude-reviewer[\s\S]*disabled: true/);
  assert.doesNotMatch(implementRole, /dsh-mcp-client/);
  assert.doesNotMatch(implementRole, /tool-subagent-codex-implementer/);
  assert.equal(implement.guardLimits.subagent_codex_implementer, 1);

  const review = writeDshPatches({ controlDir: path.join(root, 'review'), port: 12345, phase: 'review' });
  const reviewRole = fs.readFileSync(review.role, 'utf8');
  assert.match(reviewRole, /smokestack-tool-call-guard/);
  assert.match(reviewRole, /tool-subagent-codex-implementer[\s\S]*disabled: true/);
  assert.doesNotMatch(reviewRole, /dsh-mcp-client/);
  assert.doesNotMatch(reviewRole, /tool-subagent-claude-reviewer/);
  assert.equal(review.guardLimits.subagent_claude_reviewer, 1);
});

test('tool guard mechanically denies a second Codex call and the host rejects that phase', () => {
  const harness = guardHarness({ limits: { subagent_codex_implementer: 1 } });
  try {
    const first = { name: 'subagent_codex_implementer', callId: 'codex-1', arguments: { description: 'first', prompt: 'not logged' } };
    const second = { name: 'subagent_codex_implementer', callId: 'codex-2', arguments: { description: 'second', prompt: 'not logged' } };
    assert.equal(harness.guard(first), undefined);
    harness.resultObserver(first, { isError: false });
    assert.match(harness.guard(second), /call ceiling exceeded/);
    harness.resultObserver(second, { isError: true });
    const ledger = readToolGuardLedger(harness.ledger);
    const gate = validatePhaseToolLedger(ledger, 'implement');
    assert.equal(gate.ok, false);
    assert.deepEqual(gate.counts, { calls: 2, successful: 1, denied: 1 });
    const raw = fs.readFileSync(harness.ledger, 'utf8');
    assert.doesNotMatch(raw, /not logged/);
  } finally {
    harness.cleanup();
  }
});

test('tool guard admits exactly one successful Codex call', () => {
  const harness = guardHarness({ limits: { subagent_codex_implementer: 1 } });
  try {
    const exec = { name: 'subagent_codex_implementer', callId: 'codex-1', arguments: { description: 'one' } };
    assert.equal(harness.guard(exec), undefined);
    harness.resultObserver(exec, { isError: false });
    assert.equal(validatePhaseToolLedger(readToolGuardLedger(harness.ledger), 'implement').ok, true);
  } finally {
    harness.cleanup();
  }
});

test('research evidence must be backed by successful MCP search and distinct verified source calls', () => {
  const events = [
    { stage: 'call', name: 'mcp__literature__search_literature', call_id: 's1', ordinal: 1, allowed: true, arguments: { query: 'PIT' } },
    { stage: 'result', name: 'mcp__literature__search_literature', call_id: 's1', is_error: false },
    { stage: 'call', name: 'mcp__literature__verify_source', call_id: 'v1', ordinal: 1, allowed: true, arguments: { id: 'A' } },
    { stage: 'result', name: 'mcp__literature__verify_source', call_id: 'v1', is_error: false },
    { stage: 'call', name: 'mcp__literature__verify_source', call_id: 'v2', ordinal: 2, allowed: true, arguments: { id: 'B' } },
    { stage: 'result', name: 'mcp__literature__verify_source', call_id: 'v2', is_error: false },
  ];
  const ledger = { ok: true, events };
  assert.equal(validatePhaseToolLedger(ledger, 'research', { sources: [{ id: 'A' }, { id: 'B' }] }).ok, true);
  assert.equal(validatePhaseToolLedger(ledger, 'research', { sources: [{ id: 'A' }, { id: 'C' }] }).ok, false);
  assert.equal(validatePhaseToolLedger({ ok: true, events: events.filter((event) => event.call_id !== 'v2') }, 'research', { sources: [{ id: 'A' }, { id: 'B' }] }).ok, false);
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

test('ignored workspace mutation is detected even when Git porcelain stays clean', () => {
  const cwd = createReconciliationRepo();
  try {
    const before = captureIgnoredState(cwd);
    assert.equal(before.ok, true, JSON.stringify(before));
    assert.deepEqual(changedPaths(cwd), []);
    fs.writeFileSync(path.join(cwd, 'ignored/cache.txt'), 'changed ignored\n');
    const after = captureIgnoredState(cwd);
    const diff = compareIgnoredState(before, after);
    assert.equal(diff.ok, false);
    assert.deepEqual(diff.changes, ['ignored/cache.txt']);
    assert.deepEqual(changedPaths(cwd), []);

    const second = captureIgnoredState(cwd);
    fs.writeFileSync(path.join(cwd, 'ignored/new.txt'), 'new\n');
    const secondDiff = compareIgnoredState(second, captureIgnoredState(cwd));
    assert.equal(secondDiff.ok, false);
    assert.deepEqual(secondDiff.changes, ['ignored/new.txt']);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('authorized non-PASS rollback restores tracked/staged changes and leaves a clean boundary for the next task', () => {
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

    fs.writeFileSync(path.join(cwd, 'outside/preserved.txt'), 'next task\n');
    const nextCommit = commitTask(cwd, 'NEXT_TASK', ['outside/preserved.txt'], checkpointHead);
    assert.equal(nextCommit.parent, checkpointHead);
    assert.deepEqual(nextCommit.committed_paths, ['outside/preserved.txt']);
    assert.deepEqual(changedPaths(cwd), []);
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

test('a child-created commit is a HEAD authority violation and is never silently rolled back', () => {
  const cwd = createReconciliationRepo();
  try {
    const checkpointHead = resolveHead(cwd);
    fs.writeFileSync(path.join(cwd, 'experiments/qualification/tracked.txt'), 'child commit\n');
    runGit(cwd, ['add', 'experiments/qualification/tracked.txt']);
    runGit(cwd, ['commit', '-qm', 'child unauthorized commit']);
    const childHead = resolveHead(cwd);
    assert.notEqual(childHead, checkpointHead);
    assert.deepEqual(changedPaths(cwd), []);

    const result = reconcileNonPassWorktree(cwd, ['experiments/qualification/**'], checkpointHead);
    assert.equal(result.ok, false);
    assert.equal(result.authority_violation, true);
    assert.equal(result.head_violation, true);
    assert.equal(result.actual_head, childHead);
    assert.equal(resolveHead(cwd), childHead);
    assert.equal(fs.readFileSync(path.join(cwd, 'experiments/qualification/tracked.txt'), 'utf8'), 'child commit\n');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('host checkpoint disables Git hooks and attests exact committed paths and parent', () => {
  const cwd = createReconciliationRepo();
  try {
    const checkpointHead = resolveHead(cwd);
    const hook = path.join(cwd, '.git/hooks/pre-commit');
    fs.writeFileSync(hook, '#!/bin/sh\nprintf "hooked\\n" > outside/preserved.txt\ngit add outside/preserved.txt\n', { mode: 0o755 });
    fs.chmodSync(hook, 0o755);
    fs.writeFileSync(path.join(cwd, 'experiments/qualification/tracked.txt'), 'host checkpoint\n');

    const committed = commitTask(cwd, 'HOOK_TEST', ['experiments/qualification/tracked.txt'], checkpointHead);
    assert.equal(committed.parent, checkpointHead);
    assert.deepEqual(committed.staged_paths, ['experiments/qualification/tracked.txt']);
    assert.deepEqual(committed.committed_paths, ['experiments/qualification/tracked.txt']);
    assert.equal(fs.readFileSync(path.join(cwd, 'outside/preserved.txt'), 'utf8'), 'baseline\n');
    assert.deepEqual(changedPaths(cwd), []);
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

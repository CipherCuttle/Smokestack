import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { apply as applyToolCallGuard } from './dsh-tool-call-guard.mjs';
import { runAsync, writeDshPatches, readToolGuardTranscript, parseReviewGate, parseResearchReceipt } from './dsh-runtime.mjs';
import {
  changedPaths,
  isAuthorizedPath,
  reconcileNonPassWorktree,
  captureIgnoredState,
  compareIgnoredState,
  captureGitMetadataState,
  compareGitMetadataState,
  captureContentAttestation,
  validatePhaseToolLedger,
  commitTask,
  resolveHead,
  evaluateFinalAttestations,
} from './live-sprint.mjs';

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if ((result.status ?? 125) !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function gitPathValue(cwd, key) {
  const result = spawnSync('git', ['config', '--local', '--path', '--null', '--get', key], { cwd, encoding: 'utf8' });
  if ((result.status ?? 125) !== 0) throw new Error(`git config ${key} failed: ${result.stderr}`);
  assert.equal(result.stdout.endsWith('\0'), true, `Git path output was not NUL terminated: ${JSON.stringify(result.stdout)}`);
  return result.stdout.slice(0, -1);
}

function gitPathBytes(cwd, key) {
  const result = spawnSync('git', ['config', '--local', '--path', '--null', '--get', key], { cwd, encoding: null });
  if ((result.status ?? 125) !== 0) throw new Error(`git config ${key} failed: ${result.stderr?.toString('utf8')}`);
  assert.equal(result.stdout.at(-1), 0, `Git path output was not NUL terminated: ${result.stdout.toString('hex')}`);
  return result.stdout.subarray(0, -1);
}

function referenceFingerprint(file) {
  const stat = fs.statSync(file, { bigint: true });
  return {
    present: true,
    type: 'file',
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: String(stat.mode),
    size: String(stat.size),
    mtime_ns: String(stat.mtimeNs),
    ctime_ns: String(stat.ctimeNs),
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  };
}

function captureLegacyTrimmedReference(cwd) {
  const expanded = gitPathValue(cwd, 'core.attributesFile');
  const target = path.resolve(cwd, expanded.trim());
  return {
    ok: true,
    error: null,
    identity: {},
    files: { reference: { target, fingerprint: referenceFingerprint(target) } },
  };
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
  const transcriptFile = path.join(root, 'trusted-transcript.jsonl');
  const transcriptFd = fs.openSync(transcriptFile, 'w');
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
    fd: process.env.DSH_SMOKESTACK_TOOL_GUARD_FD,
    limits: process.env.SMOKESTACK_TOOL_GUARD_LIMITS,
    observe: process.env.SMOKESTACK_TOOL_GUARD_OBSERVE,
  };
  process.env.DSH_SMOKESTACK_TOOL_GUARD_FD = String(transcriptFd);
  process.env.SMOKESTACK_TOOL_GUARD_LIMITS = JSON.stringify(limits);
  process.env.SMOKESTACK_TOOL_GUARD_OBSERVE = JSON.stringify(observe);
  try {
    applyToolCallGuard(ctx);
  } finally {
    if (previous.fd === undefined) delete process.env.DSH_SMOKESTACK_TOOL_GUARD_FD;
    else process.env.DSH_SMOKESTACK_TOOL_GUARD_FD = previous.fd;
    if (previous.limits === undefined) delete process.env.SMOKESTACK_TOOL_GUARD_LIMITS;
    else process.env.SMOKESTACK_TOOL_GUARD_LIMITS = previous.limits;
    if (previous.observe === undefined) delete process.env.SMOKESTACK_TOOL_GUARD_OBSERVE;
    else process.env.SMOKESTACK_TOOL_GUARD_OBSERVE = previous.observe;
  }
  if (!guard || !resultObserver) throw new Error('tool guard did not register expected hooks');
  return {
    transcriptFile,
    guard,
    resultObserver,
    cleanup() { fs.closeSync(transcriptFd); fs.rmSync(root, { recursive: true, force: true }); },
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
  assert.equal(Object.hasOwn(implement, 'guardLedger'), false);

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
    const ledger = readToolGuardTranscript(fs.readFileSync(harness.transcriptFile, 'utf8'));
    const gate = validatePhaseToolLedger(ledger, 'implement');
    assert.equal(gate.ok, false);
    assert.deepEqual(gate.counts, { calls: 2, successful: 1, denied: 1 });
    const raw = fs.readFileSync(harness.transcriptFile, 'utf8');
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
    assert.equal(validatePhaseToolLedger(readToolGuardTranscript(fs.readFileSync(harness.transcriptFile, 'utf8')), 'implement').ok, true);
  } finally {
    harness.cleanup();
  }
});

function trustedGuardProbeScript({ secondCall = false } = {}) {
  const guardUrl = new URL('./dsh-tool-call-guard.mjs', import.meta.url).href;
  return `
    import fs from 'node:fs';
    const { apply } = await import(${JSON.stringify(guardUrl)});
    let guard;
    let resultObserver;
    apply({
      tools: { guard(fn) { guard = fn; } },
      on(name, fn) { if (name === 'tools/result') resultObserver = fn; },
    });
    const first = { name: 'subagent_codex_implementer', callId: 'c1', arguments: { description: 'first' } };
    guard(first);
    resultObserver(first, { isError: false });
    ${secondCall ? `
      const second = { name: 'subagent_codex_implementer', callId: 'c2', arguments: { description: 'second' } };
      guard(second);
      resultObserver(second, { isError: true });
      if (process.env.LEGACY_LEDGER_PATH) fs.writeFileSync(process.env.LEGACY_LEDGER_PATH, '{"stage":"call","name":"subagent_codex_implementer","call_id":"c1","ordinal":1,"allowed":true,"arguments":{"description":"first"}}\\n{"stage":"result","name":"subagent_codex_implementer","call_id":"c1","is_error":false}\\n');
    ` : ''}
    process.stdout.write('forged stdout is not authority\\n');
  `;
}

test('host-owned fd transcript cannot be truncated or forged by model-facing output', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-trusted-channel-'));
  const legacyLedger = path.join(root, 'legacy-ledger.jsonl');
  try {
    const legitimate = await runAsync(process.execPath, ['--input-type=module', '-e', trustedGuardProbeScript()], {
      trustedChannel: true,
      env: {
        DSH_SMOKESTACK_TOOL_GUARD_FD: '3',
        SMOKESTACK_TOOL_GUARD_LIMITS: JSON.stringify({ subagent_codex_implementer: 1 }),
        SMOKESTACK_TOOL_GUARD_OBSERVE: '[]',
      },
      label: 'trusted-channel-legitimate',
    });
    const legitimateLedger = readToolGuardTranscript({ data: legitimate.trusted_transcript, complete: legitimate.trusted_transcript_complete });
    assert.equal(legitimate.trusted_transcript_complete, true);
    assert.equal(validatePhaseToolLedger(legitimateLedger, 'implement').ok, true);
    assert.match(legitimate.stdout, /not authority/);

    const attacked = await runAsync(process.execPath, ['--input-type=module', '-e', trustedGuardProbeScript({ secondCall: true })], {
      trustedChannel: true,
      env: {
        DSH_SMOKESTACK_TOOL_GUARD_FD: '3',
        SMOKESTACK_TOOL_GUARD_LIMITS: JSON.stringify({ subagent_codex_implementer: 1 }),
        SMOKESTACK_TOOL_GUARD_OBSERVE: '[]',
        LEGACY_LEDGER_PATH: legacyLedger,
      },
      label: 'trusted-channel-denied-second-call',
    });
    const attackedLedger = readToolGuardTranscript({ data: attacked.trusted_transcript, complete: attacked.trusted_transcript_complete });
    const attackedGate = validatePhaseToolLedger(attackedLedger, 'implement');
    assert.equal(attackedGate.ok, false);
    assert.deepEqual(attackedGate.counts, { calls: 2, successful: 1, denied: 1 });
    assert.equal(fs.readFileSync(legacyLedger, 'utf8').split('\n').filter(Boolean).length, 2);
    assert.equal(attackedLedger.events.length, 4);

    const forgedStdout = await runAsync(process.execPath, ['-e', "process.stdout.write('{\\\"stage\\\":\\\"call\\\"}\\n')"], {
      trustedChannel: true,
      env: { DSH_SMOKESTACK_TOOL_GUARD_FD: '3' },
      label: 'trusted-channel-stdout-forge',
    });
    assert.match(forgedStdout.stdout, /stage/);
    assert.equal(readToolGuardTranscript({ data: forgedStdout.trusted_transcript, complete: forgedStdout.trusted_transcript_complete }).ok, false);
    assert.equal(validatePhaseToolLedger(readToolGuardTranscript({ data: forgedStdout.trusted_transcript, complete: forgedStdout.trusted_transcript_complete }), 'implement').ok, false);

    assert.equal(readToolGuardTranscript('').ok, false);
    assert.equal(readToolGuardTranscript('{"stage":"call"}').ok, false);
    assert.equal(readToolGuardTranscript('{"stage":"call"}\nnot-json\n').ok, false);
    const call = { stage: 'call', name: 'subagent_codex_implementer', call_id: 'c1', ordinal: 1, allowed: true, arguments: { description: 'one' } };
    const result = { stage: 'result', name: 'subagent_codex_implementer', call_id: 'c1', is_error: false };
    const duplicate = readToolGuardTranscript(`${JSON.stringify(call)}\n${JSON.stringify(result)}\n${JSON.stringify(result)}\n`);
    assert.equal(validatePhaseToolLedger(duplicate, 'implement').ok, false);
    assert.equal(readToolGuardTranscript({ data: `${JSON.stringify(call)}\n${JSON.stringify(result)}\n`, complete: false }).ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('research evidence must be backed by successful MCP search and distinct verified source calls', () => {
  const events = [
    { stage: 'call', name: 'mcp__literature__search_literature', call_id: 's1', ordinal: 1, allowed: true, arguments: { query: 'PIT' } },
    { stage: 'result', name: 'mcp__literature__search_literature', call_id: 's1', is_error: false, payload: { sources: [{ id: 'A', url: 'fixture://literature/A' }, { id: 'B', url: 'fixture://literature/B' }] } },
    { stage: 'call', name: 'mcp__literature__verify_source', call_id: 'v1', ordinal: 1, allowed: true, arguments: { id: 'A' } },
    { stage: 'result', name: 'mcp__literature__verify_source', call_id: 'v1', is_error: false, payload: { id: 'A', url: 'fixture://literature/A', verified: true } },
    { stage: 'call', name: 'mcp__literature__verify_source', call_id: 'v2', ordinal: 2, allowed: true, arguments: { id: 'B' } },
    { stage: 'result', name: 'mcp__literature__verify_source', call_id: 'v2', is_error: false, payload: { id: 'B', url: 'fixture://literature/B', verified: true } },
  ];
  const ledger = { ok: true, events };
  assert.equal(validatePhaseToolLedger(ledger, 'research', { sources: [{ id: 'A' }, { id: 'B' }] }).ok, true);
  assert.equal(validatePhaseToolLedger(ledger, 'research', { sources: [{ id: 'A' }, { id: 'C' }] }).ok, false);
  assert.equal(validatePhaseToolLedger({ ok: true, events: events.filter((event) => event.call_id !== 'v2') }, 'research', { sources: [{ id: 'A' }, { id: 'B' }] }).ok, false);
});

test('strict ledger correlation rejects every duplicate, malformed, orphan, reordered, and incomplete settlement', () => {
  const call = { stage: 'call', name: 'subagent_codex_implementer', call_id: 'c1', ordinal: 1, allowed: true, arguments: { description: 'one' } };
  const success = { stage: 'result', name: 'subagent_codex_implementer', call_id: 'c1', is_error: false };
  const error = { stage: 'result', name: 'subagent_codex_implementer', call_id: 'c1', is_error: true };
  const valid = () => validatePhaseToolLedger({ ok: true, events: [call, success] }, 'implement');
  assert.equal(valid().ok, true);
  for (const events of [
    [call, error, success], // duplicate error -> success overwrite
    [call, success, error], // duplicate success -> error overwrite
    [{ ...call, call_id: '' }, success],
    [{ ...call, call_id: 42 }, success],
    [call, { ...success, call_id: '' }],
    [call, { ...call, call_id: 'c1' }, success],
    [{ ...success, call_id: 'orphan' }, call],
    [success, call],
    [call, { ...success, name: 'subagent_claude_reviewer' }],
    [{ ...call, ordinal: 0 }, success],
    [{ ...call, ordinal: '1' }, success],
    [{ ...call, ordinal: 2 }, success],
    [{ ...call, hostile: true }, success],
    [call],
    [call, { ...success, is_error: 'false' }],
  ]) {
    assert.equal(validatePhaseToolLedger({ ok: true, events }, 'implement').ok, false, JSON.stringify(events));
  }
  assert.equal(validatePhaseToolLedger({ ok: true, events: [call, success, { stage: 'call', name: 'subagent_codex_implementer', call_id: 'c2', ordinal: 2, allowed: false, arguments: { description: 'denied' } }, { ...error, call_id: 'c2' }] }, 'implement').ok, false);
});

function researchLedger({ searchPayload = { sources: [{ id: 'A', url: 'fixture://literature/A' }, { id: 'B', url: 'fixture://literature/B' }] }, verifyA = { id: 'A', url: 'fixture://literature/A', verified: true }, verifyB = { id: 'B', url: 'fixture://literature/B', verified: true }, verifyBError = false } = {}) {
  return { ok: true, events: [
    { stage: 'call', name: 'mcp__literature__search_literature', call_id: 's1', ordinal: 1, allowed: true, arguments: { query: 'PIT' } },
    { stage: 'result', name: 'mcp__literature__search_literature', call_id: 's1', is_error: false, payload: searchPayload },
    { stage: 'call', name: 'mcp__literature__verify_source', call_id: 'v1', ordinal: 1, allowed: true, arguments: { id: 'A' } },
    { stage: 'result', name: 'mcp__literature__verify_source', call_id: 'v1', is_error: false, payload: verifyA },
    { stage: 'call', name: 'mcp__literature__verify_source', call_id: 'v2', ordinal: 2, allowed: true, arguments: { id: 'B' } },
    { stage: 'result', name: 'mcp__literature__verify_source', call_id: 'v2', is_error: verifyBError, ...(verifyBError ? {} : { payload: verifyB }) },
  ] };
}

test('MCP evidence binding rejects fabricated, negative, mismatched, malformed, absent, duplicate, and incomplete verification', () => {
  const evidence = { sources: [{ id: 'A' }, { id: 'B' }] };
  assert.equal(validatePhaseToolLedger(researchLedger(), 'research', evidence).ok, true);
  assert.equal(validatePhaseToolLedger(researchLedger({ searchPayload: { sources: [{ id: 'A', url: 'fixture://literature/same' }, { id: 'B', url: 'fixture://literature/same' }], }, verifyA: { id: 'A', url: 'fixture://literature/same', verified: true }, verifyB: { id: 'B', url: 'fixture://literature/same', verified: true } }), 'research', evidence).ok, false);
  assert.equal(validatePhaseToolLedger(researchLedger({ verifyA: { id: 'A', url: 'fixture://literature/other', verified: true } }), 'research', evidence).ok, false);
  assert.equal(validatePhaseToolLedger(researchLedger({ searchPayload: { sources: [{ id: 'A', url: 'fixture://literature/A' }, { id: 'B', url: 'fixture://literature/B' }] }, verifyA: { id: 'A', url: 'fixture://literature/A', verified: true }, verifyB: { id: 'B', url: 'fixture://literature/B', verified: true } }), 'research', evidence).ok, true);
  assert.equal(validatePhaseToolLedger(researchLedger({ searchPayload: { sources: [{ id: 'A' }, { id: 'B' }] }, verifyA: { id: 'FAB-A', verified: true }, verifyB: { id: 'FAB-B', verified: true } }), 'research', evidence).ok, false);
  assert.equal(validatePhaseToolLedger(researchLedger({ verifyA: { id: 'A', verified: false } }), 'research', evidence).ok, false);
  assert.equal(validatePhaseToolLedger(researchLedger({ verifyA: { id: 'B', verified: true } }), 'research', evidence).ok, false);
  assert.equal(validatePhaseToolLedger(researchLedger({ verifyA: 'malformed' }), 'research', evidence).ok, false);
  assert.equal(validatePhaseToolLedger(researchLedger({ searchPayload: { query: 'PIT' } }), 'research', evidence).ok, false);
  const duplicate = researchLedger();
  duplicate.events.splice(4, 0,
    { stage: 'call', name: 'mcp__literature__verify_source', call_id: 'v3', ordinal: 3, allowed: true, arguments: { id: 'A' } },
    { stage: 'result', name: 'mcp__literature__verify_source', call_id: 'v3', is_error: false, payload: { id: 'A', verified: true } });
  assert.equal(validatePhaseToolLedger(duplicate, 'research', evidence).ok, false);
  assert.equal(validatePhaseToolLedger(researchLedger({ verifyBError: true }), 'research', evidence).ok, false);
  const incomplete = researchLedger();
  incomplete.events.pop();
  assert.equal(validatePhaseToolLedger(incomplete, 'research', evidence).ok, false);
  assert.equal(validatePhaseToolLedger(researchLedger(), 'research', { sources: [{ id: 'A' }, { id: 'A' }] }).ok, false);
  assert.equal(validatePhaseToolLedger(researchLedger({ searchPayload: { sources: [{ id: 'A' }, { id: 'B' }] } }), 'research', evidence).ok, false);
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
    // Git versions differ on whether the already-existing ignored parent
    // directory is emitted as a root; the mutation itself must always be detected.
    assert.ok(secondDiff.changes.includes('ignored/new.txt'));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('touching an existing ignored directory is detected by directory metadata attestation', () => {
  const cwd = createReconciliationRepo();
  try {
    const before = captureIgnoredState(cwd);
    const ignoredDirectory = path.join(cwd, 'ignored');
    const stat = fs.statSync(ignoredDirectory);
    fs.utimesSync(ignoredDirectory, stat.atime, new Date(stat.mtimeMs + 2000));
    const after = captureIgnoredState(cwd);
    const diff = compareIgnoredState(before, after);
    assert.equal(diff.ok, false, JSON.stringify(diff));
    assert.ok(diff.changes.some((entry) => entry === 'ignored' || entry.startsWith('ignored/')));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('ignored empty directories, internal symlinks, and external symlink targets fail closed and remain inspectable', () => {
  const cwd = createReconciliationRepo();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-external-'));
  try {
    const before = captureIgnoredState(cwd);
    fs.mkdirSync(path.join(cwd, 'ignored/empty'), { recursive: true });
    const created = compareIgnoredState(before, captureIgnoredState(cwd));
    assert.equal(created.ok, false);
    assert.ok(created.changes.includes('ignored/empty'));
    fs.rmdirSync(path.join(cwd, 'ignored/empty'));
    const deleted = compareIgnoredState(before, captureIgnoredState(cwd));
    // Directory timestamps are authority metadata: create/delete activity on
    // the ignored parent remains visible even after the empty child is gone.
    assert.equal(deleted.ok, false);
    assert.ok(deleted.changes.length > 0);

    fs.mkdirSync(path.join(cwd, 'ignored/target'), { recursive: true });
    fs.mkdirSync(path.join(cwd, 'ignored/target2'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'ignored/target/reachable.txt'), 'one\n');
    fs.writeFileSync(path.join(cwd, 'ignored/target2/reachable.txt'), 'two\n');
    fs.symlinkSync('target', path.join(cwd, 'ignored/link'));
    const symlinkBaseline = captureIgnoredState(cwd);
    fs.writeFileSync(path.join(cwd, 'ignored/target/reachable.txt'), 'mutated\n');
    assert.equal(compareIgnoredState(symlinkBaseline, captureIgnoredState(cwd)).ok, false);
    fs.unlinkSync(path.join(cwd, 'ignored/link'));
    fs.symlinkSync('target2', path.join(cwd, 'ignored/link'));
    assert.equal(compareIgnoredState(symlinkBaseline, captureIgnoredState(cwd)).ok, false);

    fs.writeFileSync(path.join(external, 'secret.txt'), 'outside\n');
    fs.symlinkSync(path.join(external, 'secret.txt'), path.join(cwd, 'ignored/external-link'));
    const externalState = captureIgnoredState(cwd);
    assert.equal(externalState.ok, false);
    assert.match(externalState.error, /escapes workdir/i);
    assert.equal(fs.readFileSync(path.join(external, 'secret.txt'), 'utf8'), 'outside\n');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  }
});

test('Git config, include, and filter metadata mutation is separately attested', () => {
  const cwd = createReconciliationRepo();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-config-'));
  try {
    const before = captureGitMetadataState(cwd);
    assert.equal(before.ok, true, JSON.stringify(before));
    fs.appendFileSync(path.join(cwd, '.git/config'), '\n[filter "late"]\n\tclean = tr a-z A-Z\n');
    const after = captureGitMetadataState(cwd);
    assert.equal(compareGitMetadataState(before, after).ok, false);
    fs.writeFileSync(path.join(external, 'included.config'), '[core]\n\thooksPath = /tmp\n');
    runGit(cwd, ['config', '--local', 'include.path', path.join(external, 'included.config')]);
    const externalInclude = captureGitMetadataState(cwd);
    assert.equal(externalInclude.ok, false);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  }
});

test('external attributes and excludes files are bound, while oversized references fail closed', () => {
  const cwd = createReconciliationRepo();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-config-reference-'));
  try {
    const attributes = path.join(external, 'attributes');
    const excludes = path.join(external, 'excludes');
    fs.writeFileSync(attributes, '*.txt text\n');
    fs.writeFileSync(excludes, 'ignored-from-external\n');
    runGit(cwd, ['config', '--local', 'core.attributesFile', attributes]);
    runGit(cwd, ['config', '--local', 'core.excludesFile', excludes]);
    const before = captureGitMetadataState(cwd);
    assert.equal(before.ok, true, JSON.stringify(before));
    assert.equal(compareGitMetadataState(before, captureGitMetadataState(cwd)).ok, true);

    fs.writeFileSync(attributes, '*.txt -text\n');
    assert.equal(compareGitMetadataState(before, captureGitMetadataState(cwd)).ok, false);

    const excludesBefore = captureGitMetadataState(cwd);
    fs.writeFileSync(excludes, 'changed-external-ignore\n');
    assert.equal(compareGitMetadataState(excludesBefore, captureGitMetadataState(cwd)).ok, false);

    const oversized = path.join(external, 'oversized');
    fs.writeFileSync(oversized, Buffer.alloc(2 * 1024 * 1024 + 1, 65));
    runGit(cwd, ['config', '--local', 'core.attributesFile', oversized]);
    assert.equal(captureGitMetadataState(cwd).ok, false);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  }
});

test('effective external attributes and excludes mutations fail closed', () => {
  const cwd = createReconciliationRepo();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-effective-config-'));
  const previous = {
    global: process.env.GIT_CONFIG_GLOBAL,
    system: process.env.GIT_CONFIG_NOSYSTEM,
  };
  try {
    const globalConfig = path.join(external, 'global.config');
    const attributes = path.join(external, 'attributes');
    const excludes = path.join(external, 'excludes');
    fs.writeFileSync(attributes, '*.txt text\n');
    fs.writeFileSync(excludes, 'effective-ignore.txt\n');
    fs.writeFileSync(globalConfig, `[core]\n\tattributesFile = ${attributes}\n\texcludesFile = ${excludes}\n`);
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';

    const tracked = path.join(cwd, 'experiments/qualification/tracked.txt');
    const ignored = path.join(cwd, 'effective-ignore.txt');
    fs.writeFileSync(ignored, 'external exclude target\n');
    const before = captureGitMetadataState(cwd);
    assert.equal(before.ok, true, JSON.stringify(before));
    assert.match(runGit(cwd, ['check-attr', 'text', '--', tracked]), /text: set/);
    assert.equal(spawnSync('git', ['check-ignore', '-q', '--', ignored], { cwd }).status, 0);

    fs.writeFileSync(attributes, '*.txt -text\n');
    const afterAttributes = captureGitMetadataState(cwd);
    assert.match(runGit(cwd, ['check-attr', 'text', '--', tracked]), /text: unset/);
    assert.equal(compareGitMetadataState(before, afterAttributes).ok, false);

    const excludesBefore = captureGitMetadataState(cwd);
    fs.writeFileSync(excludes, '# external exclude removed\n');
    const afterExcludes = captureGitMetadataState(cwd);
    assert.equal(spawnSync('git', ['check-ignore', '-q', '--', ignored], { cwd }).status, 1);
    assert.equal(compareGitMetadataState(excludesBefore, afterExcludes).ok, false);
  } finally {
    if (previous.global === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = previous.global;
    if (previous.system === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
    else process.env.GIT_CONFIG_NOSYSTEM = previous.system;
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  }
});

test('Git-consumed whitespace-bearing attributes paths are bound losslessly', () => {
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-lossless-path-'));
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-lossless-home-'));
  const globalConfig = path.join(configHome, 'global.config');
  const previous = {
    global: process.env.GIT_CONFIG_GLOBAL,
    system: process.env.GIT_CONFIG_NOSYSTEM,
    home: process.env.HOME,
  };
  try {
    fs.writeFileSync(globalConfig, '');
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    process.env.HOME = configHome;
    const cwd = createReconciliationRepo();
    try {
      const tracked = path.join(cwd, 'experiments/qualification/tracked.txt');
      const cases = [
        {
          name: 'quoted trailing space',
          configured: path.join(external, 'attributes-trailing '),
          target: path.join(external, 'attributes-trailing '),
          legacyTarget: path.join(external, 'attributes-trailing'),
        },
        {
          name: 'quoted multiple trailing spaces',
          configured: path.join(external, 'attributes-multiple  '),
          target: path.join(external, 'attributes-multiple  '),
          legacyTarget: path.join(external, 'attributes-multiple'),
        },
        {
          name: 'quoted leading relative space',
          configured: ' leading-attributes',
          target: path.join(cwd, ' leading-attributes'),
          legacyTarget: path.join(cwd, 'leading-attributes'),
        },
        {
          name: 'ordinary absolute path',
          configured: path.join(external, 'attributes-absolute'),
          target: path.join(external, 'attributes-absolute'),
        },
        {
          name: 'ordinary relative path',
          configured: 'attributes-relative',
          target: path.join(cwd, 'attributes-relative'),
        },
        {
          name: '%(prefix) path expansion',
          configured: `%(prefix)/../${path.relative('/', path.join(external, 'attributes-prefix'))}`,
          target: path.join(external, 'attributes-prefix'),
        },
        {
          name: '~/path expansion',
          configured: '~/attributes-home',
          target: path.join(configHome, 'attributes-home'),
        },
      ];

      for (const scenario of cases) {
        fs.writeFileSync(scenario.target, '*.txt text\n');
        if (scenario.legacyTarget) fs.writeFileSync(scenario.legacyTarget, '*.txt -text\n');
        runGit(cwd, ['config', '--local', 'core.attributesFile', scenario.configured]);

        const expanded = gitPathValue(cwd, 'core.attributesFile');
        assert.equal(path.resolve(cwd, expanded), scenario.target, `${scenario.name}: Git path oracle mismatch`);
        const before = captureGitMetadataState(cwd);
        assert.equal(before.ok, true, `${scenario.name}: ${JSON.stringify(before)}`);
        assert.ok(Object.values(before.files).some((entry) => entry?.target === scenario.target), `${scenario.name}: target not attested`);
        assert.match(runGit(cwd, ['check-attr', 'text', '--', tracked]), /text: set/);
        assert.equal(compareGitMetadataState(before, captureGitMetadataState(cwd)).ok, true, `${scenario.name}: unchanged state was not clean`);

        if (scenario.legacyTarget) {
          const legacyBefore = captureLegacyTrimmedReference(cwd);
          assert.equal(legacyBefore.files.reference.target, scenario.legacyTarget, `${scenario.name}: legacy target did not reproduce normalization`);
          fs.writeFileSync(scenario.target, '*.txt -text\n');
          const legacyAfter = captureLegacyTrimmedReference(cwd);
          assert.equal(compareGitMetadataState(legacyBefore, legacyAfter).ok, true, `${scenario.name}: legacy reproduction did not remain falsely clean`);
          assert.match(runGit(cwd, ['check-attr', 'text', '--', tracked]), /text: unset/);
          assert.equal(compareGitMetadataState(before, captureGitMetadataState(cwd)).ok, false, `${scenario.name}: repaired attestation stayed clean`);
        } else {
          fs.writeFileSync(scenario.target, '*.txt -text\n');
          assert.match(runGit(cwd, ['check-attr', 'text', '--', tracked]), /text: unset/);
          assert.equal(compareGitMetadataState(before, captureGitMetadataState(cwd)).ok, false, `${scenario.name}: mutation was not attested`);
        }
      }
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  } finally {
    if (previous.global === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = previous.global;
    if (previous.system === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
    else process.env.GIT_CONFIG_NOSYSTEM = previous.system;
    if (previous.home === undefined) delete process.env.HOME;
    else process.env.HOME = previous.home;
    fs.rmSync(external, { recursive: true, force: true });
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});

test('invalid UTF-8 Git paths fail closed before U+FFFD aliasing', () => {
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-invalid-utf8-'));
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-invalid-utf8-home-'));
  const globalConfig = path.join(configHome, 'global.config');
  const previous = {
    global: process.env.GIT_CONFIG_GLOBAL,
    system: process.env.GIT_CONFIG_NOSYSTEM,
    home: process.env.HOME,
  };
  try {
    fs.writeFileSync(globalConfig, '');
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    process.env.HOME = configHome;
    const cwd = createReconciliationRepo();
    try {
      const tracked = path.join(cwd, 'experiments/qualification/tracked.txt');
      const rawPath = Buffer.concat([Buffer.from(external), Buffer.from('/attributes-'), Buffer.from([0xff])]);
      const replacementAlias = rawPath.toString('utf8');
      assert.equal(rawPath.at(-1), 0xff, 'test pathname must contain a real invalid UTF-8 byte');
      assert.match(replacementAlias, /\uFFFD/, 'raw pathname must decode to a replacement character for the inherited seam');
      fs.writeFileSync(rawPath, '*.txt text\n');
      fs.writeFileSync(replacementAlias, '*.txt text\n');
      fs.appendFileSync(path.join(cwd, '.git/config'), Buffer.concat([
        Buffer.from('\n[core]\n\tattributesFile = "'),
        rawPath,
        Buffer.from('"\n'),
      ]));

      const gitConsumedPath = gitPathBytes(cwd, 'core.attributesFile');
      assert.deepEqual(gitConsumedPath, rawPath, 'Git must consume the exact raw pathname bytes');
      assert.match(runGit(cwd, ['check-attr', 'text', '--', tracked]), /text: set/);

      const legacyBefore = captureLegacyTrimmedReference(cwd);
      assert.equal(legacyBefore.files.reference.target, replacementAlias, 'inherited UTF-8 seam must bind the U+FFFD alias');
      fs.writeFileSync(rawPath, '*.txt -text\n');
      assert.match(runGit(cwd, ['check-attr', 'text', '--', tracked]), /text: unset/);
      const legacyAfter = captureLegacyTrimmedReference(cwd);
      assert.equal(compareGitMetadataState(legacyBefore, legacyAfter).ok, true, 'inherited lossy attestation must reproduce the falsely clean result');

      const repaired = captureGitMetadataState(cwd);
      assert.equal(repaired.ok, false, JSON.stringify(repaired));
      assert.match(repaired.error, /invalid UTF-8/);
      assert.equal(compareGitMetadataState(repaired, repaired).ok, false, 'invalid UTF-8 state must not be accepted as clean');
      assert.notEqual(repaired.files?.reference?.target, replacementAlias, 'U+FFFD aliasing must never be accepted by the repaired seam');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  } finally {
    if (previous.global === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = previous.global;
    if (previous.system === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
    else process.env.GIT_CONFIG_NOSYSTEM = previous.system;
    if (previous.home === undefined) delete process.env.HOME;
    else process.env.HOME = previous.home;
    fs.rmSync(external, { recursive: true, force: true });
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});

test('Git %(prefix) expansion binds the same attributes and excludes files Git consumes', () => {
  const external = fs.mkdtempSync(path.join('/tmp', 'smokestack-prefix-reference-'));
  const globalConfig = path.join(external, 'global.config');
  const targetDir = fs.mkdtempSync(path.join('/tmp', 'smokestack-prefix-target-'));
  const previous = {
    global: process.env.GIT_CONFIG_GLOBAL,
    system: process.env.GIT_CONFIG_NOSYSTEM,
  };
  try {
    fs.writeFileSync(globalConfig, '');
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    const cwd = createReconciliationRepo();
    try {
      const attributes = path.join(targetDir, 'attributes');
      const excludes = path.join(targetDir, 'excludes');
      fs.writeFileSync(attributes, '*.txt text\n');
      fs.writeFileSync(excludes, 'prefix-ignore.txt\n');
      const prefixPath = (target) => `%(prefix)/../${path.relative('/', target)}`;
      fs.writeFileSync(globalConfig, `[core]\n\tattributesFile = ${prefixPath(attributes)}\n\texcludesFile = ${prefixPath(excludes)}\n`);
      const tracked = path.join(cwd, 'experiments/qualification/tracked.txt');
      const ignored = path.join(cwd, 'prefix-ignore.txt');
      fs.writeFileSync(ignored, 'prefix ignore target\n');

      const before = captureGitMetadataState(cwd);
      assert.equal(before.ok, true, JSON.stringify(before));
      assert.match(runGit(cwd, ['check-attr', 'text', '--', tracked]), /text: set/);
      assert.equal(spawnSync('git', ['check-ignore', '-q', '--', ignored], { cwd }).status, 0);
      assert.ok(Object.values(before.files).some((entry) => entry?.target === attributes));
      assert.ok(Object.values(before.files).some((entry) => entry?.target === excludes));

      fs.writeFileSync(attributes, '*.txt -text\n');
      const afterAttributes = captureGitMetadataState(cwd);
      assert.match(runGit(cwd, ['check-attr', 'text', '--', tracked]), /text: unset/);
      assert.equal(compareGitMetadataState(before, afterAttributes).ok, false);

      const excludesBefore = captureGitMetadataState(cwd);
      fs.writeFileSync(excludes, '# prefix exclude removed\n');
      const afterExcludes = captureGitMetadataState(cwd);
      assert.equal(spawnSync('git', ['check-ignore', '-q', '--', ignored], { cwd }).status, 1);
      assert.equal(compareGitMetadataState(excludesBefore, afterExcludes).ok, false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  } finally {
    if (previous.global === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = previous.global;
    if (previous.system === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
    else process.env.GIT_CONFIG_NOSYSTEM = previous.system;
    fs.rmSync(external, { recursive: true, force: true });
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('implicit XDG global attributes and excludes files are bound', () => {
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-xdg-reference-'));
  const configHome = path.join(external, 'config');
  const globalConfig = path.join(external, 'global.config');
  const home = path.join(external, 'home');
  const previous = {
    global: process.env.GIT_CONFIG_GLOBAL,
    system: process.env.GIT_CONFIG_NOSYSTEM,
    xdg: process.env.XDG_CONFIG_HOME,
    home: process.env.HOME,
  };
  try {
    fs.mkdirSync(path.join(configHome, 'git'), { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(globalConfig, '');
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    process.env.XDG_CONFIG_HOME = configHome;
    process.env.HOME = home;
    const cwd = createReconciliationRepo();
    try {
      const attributes = path.join(configHome, 'git', 'attributes');
      const excludes = path.join(configHome, 'git', 'ignore');
      const tracked = path.join(cwd, 'experiments/qualification/tracked.txt');
      const ignored = path.join(cwd, 'implicit-xdg-ignore.txt');
      fs.writeFileSync(attributes, '*.txt text\n');
      fs.writeFileSync(excludes, 'implicit-xdg-ignore.txt\n');
      fs.writeFileSync(ignored, 'implicit XDG ignore target\n');

      const before = captureGitMetadataState(cwd);
      assert.equal(before.ok, true, JSON.stringify(before));
      assert.match(runGit(cwd, ['check-attr', 'text', '--', tracked]), /text: set/);
      assert.equal(spawnSync('git', ['check-ignore', '-q', '--', ignored], { cwd }).status, 0);
      assert.equal(before.files['<effective-git-config-default-reference>/core.attributesfile'].target, attributes);
      assert.equal(before.files['<effective-git-config-default-reference>/core.excludesfile'].target, excludes);

      fs.writeFileSync(attributes, '*.txt -text\n');
      const afterAttributes = captureGitMetadataState(cwd);
      assert.match(runGit(cwd, ['check-attr', 'text', '--', tracked]), /text: unset/);
      assert.equal(compareGitMetadataState(before, afterAttributes).ok, false);

      fs.writeFileSync(attributes, '*.txt text\n');
      const excludesBefore = captureGitMetadataState(cwd);
      fs.writeFileSync(excludes, '# implicit XDG exclude removed\n');
      const afterExcludes = captureGitMetadataState(cwd);
      assert.equal(spawnSync('git', ['check-ignore', '-q', '--', ignored], { cwd }).status, 1);
      assert.equal(compareGitMetadataState(excludesBefore, afterExcludes).ok, false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  } finally {
    if (previous.global === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = previous.global;
    if (previous.system === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
    else process.env.GIT_CONFIG_NOSYSTEM = previous.system;
    if (previous.xdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previous.xdg;
    if (previous.home === undefined) delete process.env.HOME;
    else process.env.HOME = previous.home;
    fs.rmSync(external, { recursive: true, force: true });
  }
});

function createFilterRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'smokestack-filter-'));
  runGit(cwd, ['init', '-q']);
  runGit(cwd, ['config', 'user.email', 'smokestack-test@example.invalid']);
  runGit(cwd, ['config', 'user.name', 'Smokestack Test']);
  runGit(cwd, ['config', 'filter.poison.clean', "sed 's/verified-good/poisoned/g'"]);
  runGit(cwd, ['config', 'filter.poison.smudge', 'cat']);
  fs.writeFileSync(path.join(cwd, '.gitattributes'), 'tracked.txt filter=poison\n');
  fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'baseline\n');
  runGit(cwd, ['add', '.']);
  runGit(cwd, ['commit', '-qm', 'baseline']);
  return cwd;
}

test('malicious clean filter cannot stage poisoned content after host verified verified-good', () => {
  const cwd = createFilterRepo();
  try {
    fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'verified-good\n');
    const verified = captureContentAttestation(cwd, ['tracked.txt']);
    const metadata = captureGitMetadataState(cwd);
    assert.equal(verified.ok, true, JSON.stringify(verified));
    assert.throws(
      () => commitTask(cwd, 'FILTER_ATTACK', ['tracked.txt'], resolveHead(cwd), verified, metadata),
      (err) => err?.code === 'SPRINT_CONTENT_ATTESTATION',
    );
    assert.equal(runGit(cwd, ['show', ':tracked.txt']), 'poisoned');
    assert.equal(runGit(cwd, ['show', 'HEAD:tracked.txt']), 'baseline');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('content attestation binds mode-only changes and final PASS truth', () => {
  const cwd = createReconciliationRepo();
  try {
    const checkpointHead = resolveHead(cwd);
    fs.chmodSync(path.join(cwd, 'experiments/qualification/tracked.txt'), 0o755);
    const verified = captureContentAttestation(cwd, ['experiments/qualification/tracked.txt']);
    const committed = commitTask(cwd, 'MODE_CHANGE', ['experiments/qualification/tracked.txt'], checkpointHead, verified, captureGitMetadataState(cwd));
    assert.equal(committed.content_attestation.ok, true);
    assert.equal(committed.content_attestation.entries['experiments/qualification/tracked.txt'].git_mode, '100755');
    assert.deepEqual(runGit(cwd, ['diff-tree', '--no-commit-id', '--name-only', '-r', checkpointHead, committed.head]), 'experiments/qualification/tracked.txt');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }

  const final = { state: 'PASS', tasks: { A: { state: 'PASS' } } };
  const receipt = { tasks: [{
    id: 'A', checkpoint_head: 'parent',
    commit: { checkpoint_attestation: true, parent: 'parent', staged_paths: ['a'], committed_paths: ['a'], content_attestation: { ok: true } },
  }] };
  const good = { ok: true, changes: [] };
  const badIgnored = { ok: false, changes: ['ignored/final'] };
  const verdict = evaluateFinalAttestations({ final, receipt, gitState: good, ignoredState: badIgnored, gitMetadataState: good });
  assert.equal(verdict.controller_state, 'FAILED');
  assert.equal(verdict.clean_worktree, false);
  assert.equal(verdict.all, false);
});

test('a final ignored-state mutation forces FAILED controller truth after the last PASS task', () => {
  const cwd = createReconciliationRepo();
  try {
    const baseline = captureIgnoredState(cwd);
    fs.writeFileSync(path.join(cwd, 'ignored/final-after-task.txt'), 'late mutation\n');
    const finalIgnored = compareIgnoredState(baseline, captureIgnoredState(cwd));
    assert.equal(finalIgnored.ok, false);
    const final = { state: 'PASS', tasks: { A: { state: 'PASS' } } };
    const receipt = { tasks: [{
      id: 'A', checkpoint_head: 'parent',
      commit: { checkpoint_attestation: true, parent: 'parent', staged_paths: ['a'], committed_paths: ['a'], content_attestation: { ok: true } },
    }] };
    const good = { ok: true, changes: [] };
    const verdict = evaluateFinalAttestations({ final, receipt, gitState: good, ignoredState: finalIgnored, gitMetadataState: good });
    assert.equal(verdict.controller_state, 'FAILED');
    assert.equal(verdict.clean_worktree, false);
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

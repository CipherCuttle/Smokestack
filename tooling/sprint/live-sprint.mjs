import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createSprint,
  readyFrontier,
  recordResearch,
  startImplementation,
  finishImplementation,
  finishHostVerify,
  finishReview,
  startRepair,
  finishRepair,
  finishRereview,
  markBlocked,
  checkpoint,
} from './sprint-engine.mjs';
import {
  runSync,
  startOpenRouterProxy,
  writeDshPatches,
  readToolGuardLedger,
  parseReviewGate,
  parseResearchReceipt,
  dshRun,
  ensureMcpPluginInstalled,
} from './dsh-runtime.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function fail(message, code = 1) {
  console.error(`SPRINT_LIVE_FAIL: ${message}`);
  process.exit(code);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function splitNul(text) {
  return text.split('\0').filter(Boolean);
}

function normalizeRepoPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.includes('\\')) return null;
  if (path.posix.isAbsolute(value) || path.posix.normalize(value) !== value) return null;
  const parts = value.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  return value;
}

function parseAuthorityPattern(pattern) {
  const normalized = normalizeRepoPath(pattern);
  if (!normalized) return null;
  if (normalized.endsWith('/**')) {
    const prefix = normalized.slice(0, -3);
    if (!prefix || prefix.includes('*')) return null;
    return { kind: 'recursive', value: prefix };
  }
  if (normalized.includes('*')) return null;
  return { kind: 'exact', value: normalized };
}

export function isAuthorizedPath(repoPath, allowed) {
  const normalizedPath = normalizeRepoPath(repoPath);
  if (!normalizedPath || !Array.isArray(allowed)) return false;
  return allowed.some((rawPattern) => {
    const pattern = parseAuthorityPattern(rawPattern);
    if (!pattern) return false;
    if (pattern.kind === 'exact') return normalizedPath === pattern.value;
    return normalizedPath === pattern.value || normalizedPath.startsWith(`${pattern.value}/`);
  });
}

export function changedPaths(cwd) {
  const tracked = runSync('git', ['diff', '--name-only', '-z', '--no-ext-diff', '--no-renames', 'HEAD', '--'], { cwd });
  if (tracked.exit !== 0) return ['<git-diff-error>'];
  const untracked = runSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd });
  if (untracked.exit !== 0) return ['<git-ls-files-error>'];
  return [...new Set([
    ...splitNul(tracked.stdout),
    ...splitNul(untracked.stdout),
  ])].sort();
}

function ignoredFingerprint(cwd, repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) throw new Error(`unsafe ignored path: ${repoPath}`);
  const root = path.resolve(cwd);
  const target = path.resolve(root, normalized);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new Error(`ignored path escapes workdir: ${repoPath}`);
  const stat = fs.lstatSync(target, { bigint: true });
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: String(stat.mode),
    size: String(stat.size),
    mtime_ns: String(stat.mtimeNs),
    ctime_ns: String(stat.ctimeNs),
    link: stat.isSymbolicLink() ? fs.readlinkSync(target) : null,
  };
}

export function captureIgnoredState(cwd) {
  const listed = runSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], { cwd });
  if (listed.exit !== 0) return { ok: false, error: `cannot list ignored paths: ${listed.stderr}`, entries: {} };
  const entries = {};
  try {
    for (const repoPath of splitNul(listed.stdout).sort()) {
      entries[repoPath] = ignoredFingerprint(cwd, repoPath);
    }
  } catch (err) {
    return { ok: false, error: err.message, entries: {} };
  }
  return { ok: true, error: null, entries };
}

export function compareIgnoredState(before, after) {
  if (!before?.ok || !after?.ok) {
    return {
      ok: false,
      error: before?.error ?? after?.error ?? 'ignored-state capture failed',
      changes: ['<ignored-state-capture-error>'],
      before_count: Object.keys(before?.entries ?? {}).length,
      after_count: Object.keys(after?.entries ?? {}).length,
    };
  }
  const keys = [...new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])].sort();
  const changes = keys.filter((key) => JSON.stringify(before.entries[key] ?? null) !== JSON.stringify(after.entries[key] ?? null));
  return {
    ok: changes.length === 0,
    error: null,
    changes,
    before_count: Object.keys(before.entries).length,
    after_count: Object.keys(after.entries).length,
  };
}

function ignoredStateSummary(state) {
  if (!state?.ok) return { ok: false, error: state?.error ?? 'ignored-state capture failed', count: 0, sha256: null };
  const canonical = JSON.stringify(Object.entries(state.entries).sort(([a], [b]) => a.localeCompare(b)));
  return {
    ok: true,
    error: null,
    count: Object.keys(state.entries).length,
    sha256: crypto.createHash('sha256').update(canonical).digest('hex'),
  };
}

export function scopeCheck(cwd, allowed) {
  const paths = changedPaths(cwd);
  const invalid_patterns = (Array.isArray(allowed) ? allowed : []).filter((pattern) => parseAuthorityPattern(pattern) === null);
  const unauthorized = paths.filter((p) => !isAuthorizedPath(p, allowed));
  return {
    paths,
    unauthorized,
    invalid_patterns,
    ok: invalid_patterns.length === 0 && unauthorized.length === 0,
  };
}

export function resolveHead(cwd) {
  const head = runSync('git', ['rev-parse', 'HEAD'], { cwd });
  if (head.exit !== 0 || !head.stdout.trim()) throw new Error(`cannot resolve checkpoint HEAD: ${head.stderr || head.stdout}`);
  return head.stdout.trim();
}

function literalTrackedPaths(cwd, checkpointHead, paths) {
  if (paths.length === 0) return { ok: true, paths: [] };
  const atHead = runSync('git', ['--literal-pathspecs', 'ls-tree', '-r', '-z', '--name-only', checkpointHead, '--', ...paths], { cwd });
  if (atHead.exit !== 0) return { ok: false, error: `git ls-tree failed: ${atHead.stderr}` };
  const inIndex = runSync('git', ['--literal-pathspecs', 'ls-files', '-z', '--', ...paths], { cwd });
  if (inIndex.exit !== 0) return { ok: false, error: `git ls-files failed: ${inIndex.stderr}` };
  return { ok: true, paths: [...new Set([...splitNul(atHead.stdout), ...splitNul(inIndex.stdout)])].sort() };
}

function sameStrings(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function successfulToolCalls(events, name) {
  const calls = events.filter((event) => event.stage === 'call' && event.name === name);
  const results = new Map(events
    .filter((event) => event.stage === 'result' && event.name === name)
    .map((event) => [event.call_id, event]));
  const successful = calls.filter((call) => call.allowed === true && results.get(call.call_id)?.is_error === false);
  const denied = calls.filter((call) => call.allowed !== true);
  const incomplete = calls.filter((call) => !results.has(call.call_id));
  const errored = calls.filter((call) => results.get(call.call_id)?.is_error === true);
  return { calls, successful, denied, incomplete, errored };
}

export function validatePhaseToolLedger(ledger, phase, evidence = null) {
  if (!ledger?.ok) {
    return { ok: false, reason: ledger?.error ?? 'TOOL_GUARD_LEDGER_INVALID', phase, counts: {} };
  }
  const events = ledger.events;
  if (phase === 'implement' || phase === 'repair') {
    const inspected = successfulToolCalls(events, 'subagent_codex_implementer');
    const ok = inspected.calls.length === 1
      && inspected.successful.length === 1
      && inspected.denied.length === 0
      && inspected.incomplete.length === 0
      && inspected.errored.length === 0;
    return {
      ok,
      reason: ok ? null : 'CODEX_CALL_CEILING_OR_RESULT_INVALID',
      phase,
      counts: { calls: inspected.calls.length, successful: inspected.successful.length, denied: inspected.denied.length },
    };
  }
  if (phase === 'review' || phase === 'rereview') {
    const inspected = successfulToolCalls(events, 'subagent_claude_reviewer');
    const ok = inspected.calls.length === 1
      && inspected.successful.length === 1
      && inspected.denied.length === 0
      && inspected.incomplete.length === 0
      && inspected.errored.length === 0;
    return {
      ok,
      reason: ok ? null : 'CLAUDE_CALL_CEILING_OR_RESULT_INVALID',
      phase,
      counts: { calls: inspected.calls.length, successful: inspected.successful.length, denied: inspected.denied.length },
    };
  }
  if (phase === 'research') {
    const search = successfulToolCalls(events, 'mcp__literature__search_literature');
    const verify = successfulToolCalls(events, 'mcp__literature__verify_source');
    const verifiedIds = [...new Set(verify.successful
      .map((call) => call.arguments?.id)
      .filter((id) => typeof id === 'string' && id.length > 0))].sort();
    const evidenceIds = Array.isArray(evidence?.sources)
      ? [...new Set(evidence.sources.map((source) => source?.id).filter((id) => typeof id === 'string' && id.length > 0))].sort()
      : [];
    const everyEvidenceSourceVerified = evidenceIds.length >= 2 && evidenceIds.every((id) => verifiedIds.includes(id));
    const noFailures = search.denied.length === 0
      && search.incomplete.length === 0
      && search.errored.length === 0
      && verify.denied.length === 0
      && verify.incomplete.length === 0
      && verify.errored.length === 0;
    const ok = search.successful.length >= 1 && verifiedIds.length >= 2 && everyEvidenceSourceVerified && noFailures;
    return {
      ok,
      reason: ok ? null : 'MCP_TOOL_ATTESTATION_INVALID',
      phase,
      counts: {
        search_calls: search.calls.length,
        search_successful: search.successful.length,
        verify_calls: verify.calls.length,
        verify_successful: verify.successful.length,
        verified_sources: verifiedIds.length,
      },
      verified_source_ids: verifiedIds,
      evidence_source_ids: evidenceIds,
    };
  }
  return { ok: false, reason: `UNSUPPORTED_TOOL_LEDGER_PHASE:${phase}`, phase, counts: {} };
}

export function reconcileNonPassWorktree(cwd, allowed, checkpointHead) {
  const before = scopeCheck(cwd, allowed);
  let actualHead;
  try {
    actualHead = resolveHead(cwd);
  } catch (err) {
    return {
      ok: false,
      authority_violation: false,
      head_violation: false,
      rollback_failed: true,
      rollback_error: err.message,
      checkpoint_head: checkpointHead,
      actual_head: null,
      before,
      after: before,
      rolled_back: [],
      removed_untracked: [],
    };
  }
  if (actualHead !== checkpointHead) {
    return {
      ok: false,
      authority_violation: true,
      head_violation: true,
      rollback_failed: false,
      rollback_error: null,
      checkpoint_head: checkpointHead,
      actual_head: actualHead,
      before,
      after: before,
      rolled_back: [],
      removed_untracked: [],
    };
  }
  if (!before.ok) {
    return {
      ok: false,
      authority_violation: before.unauthorized.length > 0,
      head_violation: false,
      rollback_failed: false,
      checkpoint_head: checkpointHead,
      actual_head: actualHead,
      before,
      after: before,
      rolled_back: [],
      removed_untracked: [],
    };
  }
  if (before.paths.length === 0) {
    return {
      ok: true,
      authority_violation: false,
      head_violation: false,
      rollback_failed: false,
      checkpoint_head: checkpointHead,
      actual_head: actualHead,
      before,
      after: before,
      rolled_back: [],
      removed_untracked: [],
    };
  }

  const tracked = literalTrackedPaths(cwd, checkpointHead, before.paths);
  if (!tracked.ok) {
    return {
      ok: false,
      authority_violation: false,
      head_violation: false,
      rollback_failed: true,
      rollback_error: tracked.error,
      checkpoint_head: checkpointHead,
      actual_head: actualHead,
      before,
      after: scopeCheck(cwd, allowed),
      rolled_back: [],
      removed_untracked: [],
    };
  }

  const trackedSet = new Set(tracked.paths);
  const untracked = before.paths.filter((p) => !trackedSet.has(p));
  const rolledBack = [];
  const removedUntracked = [];

  try {
    if (tracked.paths.length > 0) {
      const restore = runSync('git', [
        '--literal-pathspecs',
        'restore',
        `--source=${checkpointHead}`,
        '--staged',
        '--worktree',
        '--',
        ...tracked.paths,
      ], { cwd });
      if (restore.exit !== 0) throw new Error(`git restore failed: ${restore.stderr}`);
      rolledBack.push(...tracked.paths);
    }

    const root = path.resolve(cwd);
    for (const repoPath of untracked) {
      const normalized = normalizeRepoPath(repoPath);
      if (!normalized) throw new Error(`unsafe untracked path: ${repoPath}`);
      const target = path.resolve(root, normalized);
      if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new Error(`untracked path escapes workdir: ${repoPath}`);
      fs.rmSync(target, { force: true });
      removedUntracked.push(repoPath);
    }
  } catch (err) {
    return {
      ok: false,
      authority_violation: false,
      head_violation: false,
      rollback_failed: true,
      rollback_error: err.message,
      checkpoint_head: checkpointHead,
      actual_head: actualHead,
      before,
      after: scopeCheck(cwd, allowed),
      rolled_back: rolledBack,
      removed_untracked: removedUntracked,
    };
  }

  const after = scopeCheck(cwd, allowed);
  const finalHead = resolveHead(cwd);
  const clean = after.ok && after.paths.length === 0 && finalHead === checkpointHead;
  return {
    ok: clean,
    authority_violation: finalHead !== checkpointHead,
    head_violation: finalHead !== checkpointHead,
    rollback_failed: !clean,
    rollback_error: clean ? null : 'worktree or HEAD remained outside checkpoint after authorized rollback',
    checkpoint_head: checkpointHead,
    actual_head: finalHead,
    before,
    after,
    rolled_back: rolledBack,
    removed_untracked: removedUntracked,
  };
}

function hostVerify(cwd, rawTask) {
  const allowed = rawTask.authority?.write ?? [];
  const scope = scopeCheck(cwd, allowed);
  if (!scope.ok) return { pass: false, reason: `UNAUTHORIZED_WRITE:${scope.unauthorized.join(',')}`, scope, command: null };
  const verify = rawTask.verify;
  if (!verify || typeof verify.command !== 'string' || !Array.isArray(verify.args)) {
    return { pass: false, reason: 'MISSING_HOST_VERIFY_COMMAND', scope, command: null };
  }
  const command = runSync(verify.command, verify.args, {
    cwd,
    timeoutMs: Number(verify.timeout_ms ?? 120000),
    env: verify.env ?? {},
  });
  const afterScope = scopeCheck(cwd, allowed);
  const pass = command.exit === 0 && afterScope.ok;
  return {
    pass,
    reason: command.exit !== 0 ? `HOST_VERIFY_EXIT_${command.exit}` : afterScope.ok ? null : `UNAUTHORIZED_WRITE:${afterScope.unauthorized.join(',')}`,
    scope: afterScope,
    command: {
      command: verify.command,
      args: verify.args,
      exit: command.exit,
      duration_ms: command.duration_ms,
      stdout_tail: command.stdout.slice(-4000),
      stderr_tail: command.stderr.slice(-4000),
    },
  };
}

export function commitTask(cwd, taskId, allowed, checkpointHead) {
  const actualHead = resolveHead(cwd);
  if (actualHead !== checkpointHead) {
    const err = new Error(`HEAD changed before host checkpoint for ${taskId}: ${actualHead} != ${checkpointHead}`);
    err.code = 'SPRINT_HEAD_AUTHORITY';
    throw err;
  }
  const scope = scopeCheck(cwd, allowed);
  if (!scope.ok) {
    const err = new Error(`unauthorized paths before commit for ${taskId}: ${scope.unauthorized.join(',')}`);
    err.code = 'SPRINT_AUTHORITY';
    err.scope = scope;
    throw err;
  }
  if (scope.paths.length === 0) throw new Error(`task ${taskId} produced no change`);

  const add = runSync('git', ['--literal-pathspecs', 'add', '-A', '--', ...scope.paths], { cwd });
  if (add.exit !== 0) throw new Error(`git add failed for ${taskId}: ${add.stderr}`);
  const staged = runSync('git', ['diff', '--cached', '--name-only', '-z', '--no-renames'], { cwd });
  if (staged.exit !== 0) throw new Error(`cannot inspect staged paths for ${taskId}`);
  const stagedPaths = splitNul(staged.stdout).sort();
  const unauthorized = stagedPaths.filter((p) => !isAuthorizedPath(p, allowed));
  if (unauthorized.length) {
    const err = new Error(`unauthorized staged paths for ${taskId}: ${unauthorized.join(',')}`);
    err.code = 'SPRINT_AUTHORITY';
    err.scope = { paths: stagedPaths, unauthorized, ok: false };
    throw err;
  }
  if (stagedPaths.length === 0) throw new Error(`task ${taskId} produced no staged change`);

  const commit = runSync('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-qm', `sprint: ${taskId}`], { cwd });
  if (commit.exit !== 0) throw new Error(`git commit failed for ${taskId}: ${commit.stderr}`);
  const head = resolveHead(cwd);
  const parent = runSync('git', ['rev-parse', `${head}^`], { cwd });
  if (parent.exit !== 0 || parent.stdout.trim() !== checkpointHead) {
    const err = new Error(`host checkpoint parent mismatch for ${taskId}`);
    err.code = 'SPRINT_HEAD_AUTHORITY';
    throw err;
  }
  const committed = runSync('git', [
    'diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--no-renames', checkpointHead, head, '--',
  ], { cwd });
  if (committed.exit !== 0) throw new Error(`cannot inspect committed paths for ${taskId}`);
  const committedPaths = splitNul(committed.stdout).sort();
  if (!sameStrings(committedPaths, stagedPaths)) {
    const err = new Error(`committed path set changed after host scope check for ${taskId}`);
    err.code = 'SPRINT_COMMIT_ATTESTATION';
    err.scope = { staged_paths: stagedPaths, committed_paths: committedPaths };
    throw err;
  }
  const after = changedPaths(cwd);
  if (after.length !== 0) {
    const err = new Error(`worktree remained dirty after host checkpoint for ${taskId}: ${after.join(',')}`);
    err.code = 'SPRINT_COMMIT_ATTESTATION';
    err.scope = { paths: after };
    throw err;
  }
  return { head, parent: checkpointHead, staged_paths: stagedPaths, committed_paths: committedPaths };
}

function buildImplementPrompt(rawTask, researchEvidence = null) {
  return [
    'You are the Smokestack sprint orchestrator for one bounded implementation phase.',
    'The parent is read-only. You MUST call subagent_codex_implementer exactly once.',
    'Do not call Claude. Do not make repository edits yourself.',
    `TASK_ID: ${rawTask.id}`,
    `OBJECTIVE: ${rawTask.objective}`,
    `ALLOWED_WRITE_PATHS: ${(rawTask.authority?.write ?? []).join(', ')}`,
    'ACCEPTANCE:',
    ...rawTask.acceptance.map((x) => `- ${x}`),
    researchEvidence ? `RESEARCH_EVIDENCE_JSON: ${JSON.stringify(researchEvidence)}` : 'RESEARCH_EVIDENCE_JSON: null',
    'Tell Codex to make the smallest correct change, modify only the allowed paths, not commit, and not weaken tests/specification.',
    'After the child returns, do not edit anything. Return exactly SPRINT_IMPLEMENT_OK if and only if the child completed successfully.',
  ].join('\n');
}

function buildRepairPrompt(rawTask, reviewText) {
  return [
    'You are the Smokestack sprint orchestrator for the single authorized Critical/High repair.',
    'The parent is read-only. You MUST call subagent_codex_implementer exactly once.',
    'Do not call Claude. Do not make repository edits yourself.',
    `TASK_ID: ${rawTask.id}`,
    `ALLOWED_WRITE_PATHS: ${(rawTask.authority?.write ?? []).join(', ')}`,
    'Repair ONLY the Critical/High findings below while preserving the accepted contract and already-correct behavior.',
    'REVIEW_FINDINGS:',
    reviewText.slice(-12000),
    'Tell Codex not to commit and not to edit tests/specification unless an allowed path explicitly includes them.',
    'After the child returns, do not edit anything. Return exactly SPRINT_REPAIR_OK if and only if the child completed successfully.',
  ].join('\n');
}

function buildReviewPrompt(rawTask, tenStack, phase) {
  return [
    `You are the Smokestack sprint orchestrator for an independent ${phase}.`,
    'The parent is read-only. You MUST call subagent_claude_reviewer exactly once.',
    'Do not call Codex. Do not edit the repository.',
    `TASK_ID: ${rawTask.id}`,
    `OBJECTIVE: ${rawTask.objective}`,
    'ACCEPTANCE:',
    ...rawTask.acceptance.map((x) => `- ${x}`),
    'Apply the complete frozen TEN_STACK_V1 rubric below adversarially.',
    tenStack,
    'Reviewer must inspect the actual diff and relevant files/tests in the current workspace.',
    'Critical/High means a defect that invalidates the objective, acceptance, evidence, security/fail-closed behavior, PIT correctness, or creates a material regression.',
    'Medium/Low findings may be reported but MUST NOT be upgraded merely to force another loop.',
    'The reviewer is read-only and must not repair.',
    'Your final answer must reproduce the reviewer result and contain exactly one final gate line:',
    'REVIEW_GATE: NO_CRITICAL_HIGH',
    'or',
    'REVIEW_GATE: CRITICAL_HIGH_FOUND',
  ].join('\n');
}

function buildResearchPrompt(rawTask) {
  return [
    'You are the Smokestack research worker for one bounded evidence episode.',
    'Codex and Claude are unavailable. The repository is read-only.',
    'You MUST use mcp__literature__search_literature and then mcp__literature__verify_source for at least two returned sources.',
    `TASK_ID: ${rawTask.id}`,
    `RESEARCH_QUESTION: ${rawTask.research_question ?? rawTask.objective}`,
    'Search for evidence that could SUPPORT and evidence that could CONTRADICT the proposed implementation assumption.',
    'Do not invent citations or source identifiers. Use only tool-returned source identity.',
    'Only include sources in EVIDENCE_JSON that verify_source successfully verified.',
    'If fewer than two independently identified sources can be verified, return RESEARCH_GATE: BLOCKED.',
    'Otherwise return exactly one compact single-line JSON object after EVIDENCE_JSON: with keys question, sources, supports, contradicts, unresolved.',
    'Finish with exactly one gate line: RESEARCH_GATE: PASS or RESEARCH_GATE: BLOCKED.',
  ].join('\n');
}

function parseArgs(argv) {
  const out = { live: false, spec: null, workdir: null, receipt: null, researchMcpCommand: null, researchMcpArgs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--live') out.live = true;
    else if (a === '--spec') out.spec = argv[++i];
    else if (a === '--workdir') out.workdir = argv[++i];
    else if (a === '--receipt') out.receipt = argv[++i];
    else if (a === '--research-mcp-command') out.researchMcpCommand = argv[++i];
    else if (a === '--research-mcp-arg') out.researchMcpArgs.push(argv[++i]);
    else fail(`unknown argument: ${a}`);
  }
  if (!out.spec || !out.workdir) fail('--spec and --workdir are required');
  if (!out.live) fail('live model execution requires explicit --live');
  return out;
}

function assertClean(cwd) {
  const status = runSync('git', ['status', '--porcelain'], { cwd });
  if (status.exit !== 0) fail(`cannot inspect workdir git status: ${status.stderr}`);
  if (status.stdout.trim()) fail('workdir must be clean at sprint start');
}

function validateAuthority(spec) {
  for (const task of spec.tasks) {
    const allowed = task.authority?.write ?? [];
    const invalid = allowed.filter((pattern) => parseAuthorityPattern(pattern) === null);
    if (invalid.length > 0) fail(`invalid authority.write pattern for ${task.id}: ${invalid.join(',')}`);
  }
}

function preflight() {
  if (process.version !== 'v24.19.0') fail(`Node v24.19.0 required; got ${process.version}`);
  const dsh = runSync('smokestack-dsh', ['--profile', 'headless', '--dump-config'], { timeoutMs: 120000 });
  if (dsh.exit !== 0) fail(`DSH headless preflight failed: ${dsh.stderr || dsh.stdout}`);
  if (dsh.stderr.trim()) fail(`DSH headless preflight emitted stderr: ${dsh.stderr.trim().slice(0, 1000)}`);
}

async function runResearch({ cwd, task, controlRoot, researchMcp }) {
  const proxy = await startOpenRouterProxy({ cap: 8, label: `${task.id}/RESEARCH` });
  try {
    const patches = writeDshPatches({
      controlDir: path.join(controlRoot, task.id, 'research'),
      port: proxy.port,
      phase: 'research',
      researchMcp,
    });
    const before = changedPaths(cwd);
    const ignoredBefore = captureIgnoredState(cwd);
    const headBefore = resolveHead(cwd);
    const result = await dshRun({ cwd, patches, prompt: buildResearchPrompt(task), label: `${task.id}/RESEARCH`, timeoutSeconds: 300 });
    const after = changedPaths(cwd);
    const ignoredAfter = captureIgnoredState(cwd);
    const ignoredState = compareIgnoredState(ignoredBefore, ignoredAfter);
    const headAfter = resolveHead(cwd);
    const parsed = parseResearchReceipt(`${result.stdout}\n${result.stderr}`);
    const ledger = readToolGuardLedger(patches.guardLedger);
    const toolGuard = validatePhaseToolLedger(ledger, 'research', parsed.evidence);
    const validEvidence = parsed.evidence && Array.isArray(parsed.evidence.sources) && parsed.evidence.sources.length >= 2;
    const gitUnchanged = JSON.stringify(before) === JSON.stringify(after);
    const headUnchanged = headBefore === headAfter;
    return {
      ok: result.exit === 0
        && parsed.gate === 'PASS'
        && validEvidence
        && toolGuard.ok
        && gitUnchanged
        && ignoredState.ok
        && headUnchanged,
      result,
      parsed,
      tool_guard: toolGuard,
      parent: { ...proxy.state },
      worktree_unchanged: gitUnchanged && ignoredState.ok && headUnchanged,
      ignored_state: ignoredState,
      head_unchanged: headUnchanged,
      head_before: headBefore,
      head_after: headAfter,
    };
  } finally {
    await proxy.close();
  }
}

async function runTaskLifecycle({ cwd, task, sprint, tenStack, controlRoot, researchEvidence }) {
  const proxy = await startOpenRouterProxy({ cap: 8, label: `${task.id}/LIFECYCLE` });
  const phases = [];
  try {
    startImplementation(sprint, task.id);
    let patches = writeDshPatches({ controlDir: path.join(controlRoot, task.id, 'implement'), port: proxy.port, phase: 'implement' });
    let result = await dshRun({ cwd, patches, prompt: buildImplementPrompt(task, researchEvidence), label: `${task.id}/IMPLEMENT`, timeoutSeconds: 300 });
    let toolGuard = validatePhaseToolLedger(readToolGuardLedger(patches.guardLedger), 'implement');
    const implementMarker = /(^|\n)SPRINT_IMPLEMENT_OK(\n|$)/.test(result.stdout);
    const implementOk = result.exit === 0 && implementMarker && toolGuard.ok;
    phases.push({ phase: 'IMPLEMENT', exit: result.exit, marker: implementMarker, tool_guard: toolGuard, duration_ms: result.duration_ms });
    finishImplementation(sprint, task.id, { exit_code: implementOk ? 0 : 1 });
    if (sprint.tasks[task.id].state === 'FAILED') return { phases, parent: { ...proxy.state }, review_text: null };

    let verify = hostVerify(cwd, task);
    phases.push({ phase: 'HOST_VERIFY', ...verify });
    finishHostVerify(sprint, task.id, { pass: verify.pass, reason: verify.reason });
    if (sprint.tasks[task.id].state === 'FAILED' || sprint.tasks[task.id].state === 'PASS') return { phases, parent: { ...proxy.state }, review_text: null };

    patches = writeDshPatches({ controlDir: path.join(controlRoot, task.id, 'review'), port: proxy.port, phase: 'review' });
    result = await dshRun({ cwd, patches, prompt: buildReviewPrompt(task, tenStack, 'hostile review'), label: `${task.id}/REVIEW`, timeoutSeconds: 300 });
    toolGuard = validatePhaseToolLedger(readToolGuardLedger(patches.guardLedger), 'review');
    const reviewText = `${result.stdout}\n${result.stderr}`;
    const gate = result.exit === 0 && toolGuard.ok ? parseReviewGate(reviewText) : 'AMBIGUOUS';
    phases.push({ phase: 'REVIEW', exit: result.exit, gate, tool_guard: toolGuard, duration_ms: result.duration_ms });
    if (gate === 'AMBIGUOUS') {
      markBlocked(sprint, task.id, 'AMBIGUOUS_OR_FAILED_REVIEW');
      return { phases, parent: { ...proxy.state }, review_text: reviewText };
    }
    finishReview(sprint, task.id, { gate });
    if (sprint.tasks[task.id].state === 'PASS') return { phases, parent: { ...proxy.state }, review_text: reviewText };

    startRepair(sprint, task.id);
    patches = writeDshPatches({ controlDir: path.join(controlRoot, task.id, 'repair'), port: proxy.port, phase: 'repair' });
    result = await dshRun({ cwd, patches, prompt: buildRepairPrompt(task, reviewText), label: `${task.id}/REPAIR`, timeoutSeconds: 300 });
    toolGuard = validatePhaseToolLedger(readToolGuardLedger(patches.guardLedger), 'repair');
    const repairMarker = /(^|\n)SPRINT_REPAIR_OK(\n|$)/.test(result.stdout);
    const repairOk = result.exit === 0 && repairMarker && toolGuard.ok;
    phases.push({ phase: 'REPAIR', exit: result.exit, marker: repairMarker, tool_guard: toolGuard, duration_ms: result.duration_ms });
    finishRepair(sprint, task.id, { exit_code: repairOk ? 0 : 1 });
    if (sprint.tasks[task.id].state === 'FAILED') return { phases, parent: { ...proxy.state }, review_text: reviewText };

    verify = hostVerify(cwd, task);
    phases.push({ phase: 'HOST_RETEST', ...verify });
    finishHostVerify(sprint, task.id, { pass: verify.pass, reason: verify.reason });
    if (sprint.tasks[task.id].state !== 'REREVIEWING') return { phases, parent: { ...proxy.state }, review_text: reviewText };

    patches = writeDshPatches({ controlDir: path.join(controlRoot, task.id, 'rereview'), port: proxy.port, phase: 'rereview' });
    result = await dshRun({ cwd, patches, prompt: buildReviewPrompt(task, tenStack, 'targeted rereview'), label: `${task.id}/REREVIEW`, timeoutSeconds: 300 });
    toolGuard = validatePhaseToolLedger(readToolGuardLedger(patches.guardLedger), 'rereview');
    const rereviewText = `${result.stdout}\n${result.stderr}`;
    const rereviewGate = result.exit === 0 && toolGuard.ok ? parseReviewGate(rereviewText) : 'AMBIGUOUS';
    phases.push({ phase: 'REREVIEW', exit: result.exit, gate: rereviewGate, tool_guard: toolGuard, duration_ms: result.duration_ms });
    if (rereviewGate === 'AMBIGUOUS') {
      markBlocked(sprint, task.id, 'AMBIGUOUS_OR_FAILED_REREVIEW');
      return { phases, parent: { ...proxy.state }, review_text: rereviewText };
    }
    finishRereview(sprint, task.id, { gate: rereviewGate });
    return { phases, parent: { ...proxy.state }, review_text: rereviewText };
  } finally {
    await proxy.close();
  }
}

function reconciliationStopReason(reconciliation) {
  if (reconciliation?.head_violation) return 'HEAD_AUTHORITY_VIOLATION';
  if (reconciliation?.authority_violation) return 'AUTHORITY_VIOLATION';
  return 'AUTHORIZED_ROLLBACK_FAILED';
}

export async function runLiveSprint({ spec, cwd, receiptPath, researchMcp }) {
  preflight();
  assertClean(cwd);
  validateAuthority(spec);
  const sprintIgnoredBaseline = captureIgnoredState(cwd);
  if (!sprintIgnoredBaseline.ok) fail(`cannot capture ignored-state baseline: ${sprintIgnoredBaseline.error}`);
  const requiresResearch = spec.tasks.some((t) => t.research_required === true);
  let mcpInstall = null;
  if (requiresResearch) {
    if (!researchMcp) fail('research-required sprint needs a configured literature MCP command');
    mcpInstall = ensureMcpPluginInstalled();
  }

  const sprint = createSprint(spec);
  const rawById = new Map(spec.tasks.map((t) => [t.id, t]));
  const tenStack = fs.readFileSync(path.join(repoRoot, 'docs/TEN_STACK_V1.md'), 'utf8');
  const controlRoot = path.join('/tmp/smokestack-sprint-control', spec.sprint_id.replace(/[^A-Za-z0-9_.-]/g, '_'));
  fs.rmSync(controlRoot, { recursive: true, force: true });
  fs.mkdirSync(controlRoot, { recursive: true });

  const receipt = {
    version: 2,
    sprint_id: spec.sprint_id,
    objective: spec.objective ?? '',
    started_at: new Date().toISOString(),
    spec_sha256: crypto.createHash('sha256').update(JSON.stringify(spec)).digest('hex'),
    workdir: cwd,
    mcp_plugin: mcpInstall,
    ignored_baseline: ignoredStateSummary(sprintIgnoredBaseline),
    tasks: [],
    checkpoints: [],
  };
  let hardStop = null;

  while (sprint.state === 'ACTIVE') {
    const frontier = readyFrontier(sprint);
    if (frontier.length === 0) break;

    const boundaryPaths = changedPaths(cwd);
    if (boundaryPaths.length > 0) {
      hardStop = { reason: 'DIRTY_TASK_BOUNDARY', paths: boundaryPaths };
      break;
    }

    const taskId = frontier[0];
    const task = rawById.get(taskId);
    const checkpointHead = resolveHead(cwd);
    const ignoredCheckpoint = captureIgnoredState(cwd);
    if (!ignoredCheckpoint.ok) {
      hardStop = { reason: 'IGNORED_STATE_CAPTURE_FAILED', task_id: taskId, error: ignoredCheckpoint.error };
      break;
    }
    console.log(`\n=== SPRINT TASK ${taskId} mode=${task.mode} ===`);
    const taskReceipt = {
      id: taskId,
      mode: task.mode,
      checkpoint_head: checkpointHead,
      ignored_checkpoint: ignoredStateSummary(ignoredCheckpoint),
      ignored_state: null,
      research: null,
      lifecycle: null,
      reconciliation: null,
      commit: null,
    };

    let researchEvidence = null;
    if (task.research_required === true) {
      const research = await runResearch({ cwd, task, controlRoot, researchMcp });
      taskReceipt.research = {
        ok: research.ok,
        parsed: research.parsed,
        tool_guard: research.tool_guard,
        parent: research.parent,
        worktree_unchanged: research.worktree_unchanged,
        ignored_state: research.ignored_state,
        head_unchanged: research.head_unchanged,
        exit: research.result.exit,
        duration_ms: research.result.duration_ms,
      };
      if (!research.ok) {
        recordResearch(sprint, taskId, { ok: false, reason: 'RESEARCH_MCP_OR_EVIDENCE_GATE_FAILED' });
        if (!research.ignored_state.ok || !research.head_unchanged) {
          hardStop = {
            reason: !research.head_unchanged ? 'HEAD_AUTHORITY_VIOLATION' : 'IGNORED_WORKTREE_MUTATION',
            task_id: taskId,
            research: taskReceipt.research,
          };
          receipt.tasks.push(taskReceipt);
          receipt.checkpoints.push(checkpoint(sprint));
          break;
        }
        taskReceipt.reconciliation = reconcileNonPassWorktree(cwd, task.authority?.write ?? [], checkpointHead);
        receipt.tasks.push(taskReceipt);
        receipt.checkpoints.push(checkpoint(sprint));
        if (!taskReceipt.reconciliation.ok) {
          hardStop = {
            reason: reconciliationStopReason(taskReceipt.reconciliation),
            task_id: taskId,
            reconciliation: taskReceipt.reconciliation,
          };
          break;
        }
        if (receiptPath) writeJson(receiptPath, { ...receipt, current: checkpoint(sprint) });
        continue;
      }
      researchEvidence = research.parsed.evidence;
      recordResearch(sprint, taskId, { ok: true });
    }

    taskReceipt.lifecycle = await runTaskLifecycle({ cwd, task, sprint, tenStack, controlRoot, researchEvidence });
    const ignoredAfterLifecycle = captureIgnoredState(cwd);
    taskReceipt.ignored_state = compareIgnoredState(ignoredCheckpoint, ignoredAfterLifecycle);
    if (!taskReceipt.ignored_state.ok) {
      hardStop = {
        reason: 'IGNORED_WORKTREE_MUTATION',
        task_id: taskId,
        ignored_state: taskReceipt.ignored_state,
      };
      receipt.tasks.push(taskReceipt);
      receipt.checkpoints.push(checkpoint(sprint));
      if (receiptPath) writeJson(receiptPath, { ...receipt, current: checkpoint(sprint), hard_stop: hardStop });
      break;
    }

    const current = sprint.tasks[taskId];
    if (current.state === 'PASS') {
      try {
        taskReceipt.commit = commitTask(cwd, taskId, task.authority?.write ?? [], checkpointHead);
      } catch (err) {
        taskReceipt.commit_error = {
          code: err.code ?? 'HOST_COMMIT_CHECKPOINT_FAILED',
          message: err.message,
          scope: err.scope ?? null,
        };
        hardStop = {
          reason: err.code === 'SPRINT_AUTHORITY'
            ? 'AUTHORITY_VIOLATION'
            : err.code === 'SPRINT_HEAD_AUTHORITY'
              ? 'HEAD_AUTHORITY_VIOLATION'
              : err.code === 'SPRINT_COMMIT_ATTESTATION'
                ? 'HOST_COMMIT_ATTESTATION_FAILED'
                : 'HOST_COMMIT_CHECKPOINT_FAILED',
          task_id: taskId,
          commit_error: taskReceipt.commit_error,
        };
      }
    } else {
      taskReceipt.reconciliation = reconcileNonPassWorktree(cwd, task.authority?.write ?? [], checkpointHead);
      if (!taskReceipt.reconciliation.ok) {
        hardStop = {
          reason: reconciliationStopReason(taskReceipt.reconciliation),
          task_id: taskId,
          reconciliation: taskReceipt.reconciliation,
        };
      }
    }

    receipt.tasks.push(taskReceipt);
    receipt.checkpoints.push(checkpoint(sprint));
    if (receiptPath) writeJson(receiptPath, { ...receipt, current: checkpoint(sprint), hard_stop: hardStop });
    if (hardStop) break;
  }

  const final = checkpoint(sprint);
  const gitStatus = runSync('git', ['status', '--porcelain'], { cwd });
  const finalIgnored = captureIgnoredState(cwd);
  const ignoredFinalState = compareIgnoredState(sprintIgnoredBaseline, finalIgnored);
  receipt.finished_at = new Date().toISOString();
  receipt.final = final;
  receipt.controller_state = hardStop ? 'FAILED' : final.state;
  receipt.controller_terminal_reason = hardStop?.reason ?? final.terminal_reason;
  receipt.hard_stop = hardStop;
  receipt.ignored_final = ignoredStateSummary(finalIgnored);
  receipt.ignored_state_unchanged = ignoredFinalState;
  receipt.clean_worktree = gitStatus.exit === 0 && gitStatus.stdout.trim() === '' && ignoredFinalState.ok;
  if (receiptPath) writeJson(receiptPath, receipt);

  console.log('\n==========================================');
  console.log('SMOKESTACK LIVE SPRINT FINAL');
  console.log('==========================================');
  console.log(JSON.stringify({
    sprint_id: receipt.sprint_id,
    state: final.state,
    controller_state: receipt.controller_state,
    terminal_reason: receipt.controller_terminal_reason,
    clean_worktree: receipt.clean_worktree,
    ignored_state_unchanged: ignoredFinalState.ok,
    task_states: Object.fromEntries(Object.entries(final.tasks).map(([id, t]) => [id, t.state])),
    checkpoint_sha256: final.sha256,
    receipt: receiptPath ?? null,
  }, null, 2));
  return { sprint, receipt };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = readJson(path.resolve(args.spec));
  const cwd = path.resolve(args.workdir);
  const receiptPath = path.resolve(args.receipt ?? path.join('/tmp', `${spec.sprint_id}-receipt.json`));
  const researchMcp = args.researchMcpCommand ? { command: args.researchMcpCommand, args: args.researchMcpArgs } : null;
  const { receipt } = await runLiveSprint({ spec, cwd, receiptPath, researchMcp });
  process.exit(receipt.controller_state === 'PASS' && receipt.clean_worktree ? 0 : 2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => fail(err.stack || err.message));
}

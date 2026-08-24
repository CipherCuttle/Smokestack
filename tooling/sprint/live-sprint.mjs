import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { homedir } from 'node:os';
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
  readToolGuardTranscript,
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

const MAX_IGNORED_ENTRIES = 20_000;
const MAX_GIT_METADATA_FILE = 2 * 1024 * 1024;
const MAX_GIT_CONFIG_REFERENCES = 128;
const MAX_CONTENT_FILE = 64 * 1024 * 1024;

function within(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function ignoredFingerprint(root, repoPath, target) {
  const stat = fs.lstatSync(target, { bigint: true });
  const type = stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : 'other';
  if (type === 'other') throw new Error(`unsupported ignored filesystem entry: ${repoPath}`);
  const fingerprint = {
    type,
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: String(stat.mode),
    size: String(stat.size),
    mtime_ns: String(stat.mtimeNs),
    ctime_ns: String(stat.ctimeNs),
    link: type === 'symlink' ? fs.readlinkSync(target) : null,
    resolved: null,
    target: null,
  };
  if (type === 'symlink') {
    let resolved;
    try { resolved = fs.realpathSync.native(target); } catch (err) { throw new Error(`ignored symlink cannot be resolved: ${repoPath}: ${err.message}`); }
    if (!within(root, resolved)) throw new Error(`ignored symlink escapes workdir: ${repoPath}`);
    fingerprint.resolved = path.relative(root, resolved) || '.';
    const targetStat = fs.lstatSync(resolved, { bigint: true });
    fingerprint.target = {
      type: targetStat.isDirectory() ? 'directory' : targetStat.isFile() ? 'file' : targetStat.isSymbolicLink() ? 'symlink' : 'other',
      dev: String(targetStat.dev),
      ino: String(targetStat.ino),
      mode: String(targetStat.mode),
      size: String(targetStat.size),
      mtime_ns: String(targetStat.mtimeNs),
      ctime_ns: String(targetStat.ctimeNs),
    };
  }
  return fingerprint;
}

function walkIgnoredEntry(root, repoPath, target, entries, activeTargets) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized) throw new Error(`unsafe ignored path: ${repoPath}`);
  if (!within(root, target)) throw new Error(`ignored path escapes workdir: ${repoPath}`);
  if (Object.keys(entries).length >= MAX_IGNORED_ENTRIES) throw new Error('ignored-state entry limit exceeded');
  entries[normalized] = ignoredFingerprint(root, normalized, target);
  const stat = fs.lstatSync(target, { bigint: true });
  let directory = target;
  let realDirectory = null;
  if (stat.isSymbolicLink()) {
    realDirectory = fs.realpathSync.native(target);
    if (!within(root, realDirectory)) throw new Error(`ignored symlink escapes workdir: ${repoPath}`);
    const targetStat = fs.statSync(target, { bigint: true });
    if (!targetStat.isDirectory()) return;
    directory = realDirectory;
  } else if (!stat.isDirectory()) {
    return;
  }
  const identity = fs.realpathSync.native(directory);
  if (activeTargets.has(identity)) throw new Error(`ignored symlink cycle: ${repoPath}`);
  const nextActive = new Set(activeTargets);
  nextActive.add(identity);
  for (const child of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const childPath = `${normalized}/${child.name}`;
    const childTarget = path.join(directory, child.name);
    walkIgnoredEntry(root, childPath, childTarget, entries, nextActive);
  }
}

export function captureIgnoredState(cwd) {
  const listed = runSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], { cwd });
  const listedDirs = runSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], { cwd });
  if (listed.exit !== 0 || listedDirs.exit !== 0) {
    return { ok: false, error: `cannot list ignored paths: ${listed.stderr || listedDirs.stderr}`, entries: {} };
  }
  const roots = [...new Set([
    ...splitNul(listed.stdout),
    ...splitNul(listedDirs.stdout).map((entry) => entry.endsWith('/') ? entry.slice(0, -1) : entry),
  ])].sort();
  const entries = {};
  const root = path.resolve(cwd);
  try {
    for (const repoPath of roots) {
      const normalized = normalizeRepoPath(repoPath);
      if (!normalized) throw new Error(`unsafe ignored path: ${repoPath}`);
      const target = path.resolve(root, normalized);
      if (!within(root, target) || !fs.existsSync(target)) throw new Error(`ignored path is missing: ${repoPath}`);
      if (entries[normalized]) continue;
      walkIgnoredEntry(root, normalized, target, entries, new Set());
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

function metadataFileFingerprint(file, authorities) {
  if (!fs.existsSync(file)) return { present: false };
  const stat = fs.lstatSync(file, { bigint: true });
  if (stat.isSymbolicLink()) {
    const resolved = fs.realpathSync.native(file);
    if (!authorities.some((root) => within(root, resolved))) throw new Error(`Git metadata symlink escapes authority: ${file}`);
  }
  if (!stat.isFile()) throw new Error(`unsupported Git metadata entry: ${file}`);
  if (stat.size > BigInt(MAX_GIT_METADATA_FILE)) throw new Error(`Git metadata file too large: ${file}`);
  const content = fs.readFileSync(file);
  return {
    present: true,
    type: 'file',
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: String(stat.mode),
    size: String(stat.size),
    mtime_ns: String(stat.mtimeNs),
    ctime_ns: String(stat.ctimeNs),
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

function gitPath(cwd, name) {
  const result = runSync('git', ['rev-parse', '--git-path', name], { cwd });
  if (result.exit !== 0 || !result.stdout.trim()) throw new Error(`cannot resolve Git metadata path ${name}: ${result.stderr}`);
  return path.resolve(cwd, result.stdout.trim());
}

function captureMetadataDirectory(directory, authorities, output, prefix, count = { value: 0 }) {
  if (!fs.existsSync(directory)) return;
  if (count.value >= 1024) throw new Error(`Git metadata directory entry limit exceeded: ${directory}`);
  for (const entry of fs.readdirSync(directory).sort()) {
    count.value += 1;
    const file = path.join(directory, entry);
    const stat = fs.lstatSync(file, { bigint: true });
    const key = `${prefix}/${entry}`;
    if (stat.isDirectory()) {
      output[key] = {
        present: true,
        type: 'directory',
        dev: String(stat.dev),
        ino: String(stat.ino),
        mode: String(stat.mode),
      };
      captureMetadataDirectory(file, authorities, output, key, count);
    } else {
      output[key] = metadataFileFingerprint(file, authorities);
    }
  }
}

function parseGitConfigRecords(text, label) {
  const fields = text.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length === 0 || fields.length % 2 !== 0) throw new Error(`malformed ${label} Git config records`);
  const records = [];
  for (let index = 0; index < fields.length; index += 2) {
    const origin = fields[index];
    const pair = fields[index + 1];
    const separator = pair.indexOf('\n');
    if (!origin || separator <= 0) throw new Error(`malformed ${label} Git config record`);
    records.push({ origin, key: pair.slice(0, separator).toLowerCase(), value: pair.slice(separator + 1) });
  }
  return records;
}

function resolveGitConfigReference(cwd, expandedValue) {
  if (typeof expandedValue !== 'string' || expandedValue.length === 0 || expandedValue.includes('\0')) {
    throw new Error('Git file reference is empty or malformed');
  }
  const value = expandedValue;
  if (value.includes('%(') || value === '~' || value.startsWith('~/') || value.startsWith('~')) {
    throw new Error(`Git file reference was not fully expanded: ${expandedValue}`);
  }
  // Git --path expands supported path syntax. Git resolves relative core
  // paths from the command's worktree context, so only that final relative
  // resolution remains here.
  return path.resolve(cwd, value);
}

function gitConfigReferenceRecords(cwd, scopeArgs, label) {
  const result = runSync('git', [
    'config',
    ...scopeArgs,
    '--path',
    '--show-origin',
    '--null',
    '--get-regexp',
    '^(core.attributesfile|core.excludesfile)$',
  ], { cwd });
  if (result.exit === 1 && result.stdout === '') return [];
  if (result.exit !== 0) throw new Error(`cannot inspect ${label} Git config references: ${result.stderr}`);
  return parseGitConfigRecords(result.stdout, `${label} reference`);
}

function defaultGitConfigReference(cwd, fileName) {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config');
  if (configHome.includes('\0')) throw new Error('Git XDG config home is malformed');
  return path.resolve(cwd, configHome, 'git', fileName);
}

export function captureGitMetadataState(cwd) {
  const identityNames = ['--git-dir', '--git-common-dir', '--show-toplevel', '--is-inside-work-tree', '--is-bare-repository'];
  const identity = {};
  for (const name of identityNames) {
    const result = runSync('git', ['rev-parse', name], { cwd });
    if (result.exit !== 0 || !result.stdout.trim()) return { ok: false, error: `cannot resolve Git identity ${name}: ${result.stderr}`, files: {}, identity: {} };
    identity[name] = result.stdout.trim();
  }
  const root = path.resolve(cwd);
  const gitDir = path.resolve(cwd, identity['--git-dir']);
  const commonDir = path.resolve(cwd, identity['--git-common-dir']);
  const authorities = [root, gitDir, commonDir];
  const fileNames = ['config', 'config.worktree', 'info/attributes', 'info/exclude', 'objects/info/alternates'];
  const files = {};
  try {
    for (const name of fileNames) {
      const file = gitPath(cwd, name);
      if (!authorities.some((authority) => within(authority, file))) throw new Error(`Git metadata path escapes authority: ${name}`);
      files[path.relative(root, file) || name] = metadataFileFingerprint(file, authorities);
    }
    const localConfig = runSync('git', ['config', '--local', '--includes', '--show-origin', '--null', '--list'], { cwd });
    if (localConfig.exit !== 0) throw new Error(`cannot inspect local Git config: ${localConfig.stderr}`);
    if (Buffer.byteLength(localConfig.stdout, 'utf8') > MAX_GIT_METADATA_FILE) throw new Error('effective local Git config too large');
    files['<effective-local-config>'] = {
      present: true,
      sha256: crypto.createHash('sha256').update(localConfig.stdout).digest('hex'),
    };
    const configRecords = parseGitConfigRecords(localConfig.stdout, 'local');
    for (const record of configRecords) {
      if (!record.origin.startsWith('file:')) throw new Error(`local Git config has non-file origin: ${record.origin}`);
      const origin = path.resolve(cwd, record.origin.slice('file:'.length));
      if (!authorities.some((authority) => within(authority, origin))) {
        throw new Error(`local Git config includes external file: ${record.origin}`);
      }
      const key = path.relative(root, origin) || record.origin;
      files[key] = metadataFileFingerprint(origin, authorities);
    }
    const references = gitConfigReferenceRecords(cwd, ['--local', '--includes'], 'local');
    if (references.length > MAX_GIT_CONFIG_REFERENCES) throw new Error('security-relevant Git config reference limit exceeded');
    const referenceCounts = new Map();
    for (const reference of references) {
      const target = resolveGitConfigReference(cwd, reference.value);
      const ordinal = referenceCounts.get(reference.key) ?? 0;
      referenceCounts.set(reference.key, ordinal + 1);
      files[`<git-config-reference>/${reference.key}/${ordinal}`] = {
        target,
        fingerprint: metadataFileFingerprint(target, authorities),
      };
    }
    const effectiveConfig = runSync('git', ['config', '--includes', '--show-origin', '--null', '--list'], { cwd });
    if (effectiveConfig.exit !== 0) throw new Error(`cannot inspect effective Git config: ${effectiveConfig.stderr}`);
    if (Buffer.byteLength(effectiveConfig.stdout, 'utf8') > MAX_GIT_METADATA_FILE) throw new Error('effective Git config too large');
    files['<effective-git-config>'] = {
      present: true,
      sha256: crypto.createHash('sha256').update(effectiveConfig.stdout).digest('hex'),
    };
    const effectiveReferences = gitConfigReferenceRecords(cwd, ['--includes'], 'effective');
    for (const key of ['core.attributesfile', 'core.excludesfile']) {
      const records = effectiveReferences.filter((record) => record.key === key);
      if (records.length > MAX_GIT_CONFIG_REFERENCES) throw new Error('effective Git config reference limit exceeded');
      const referenceCounts = new Map();
      for (const record of records) {
        if (record.key !== key) throw new Error(`unexpected effective Git config key: ${record.key}`);
        if (!record.origin.startsWith('file:')) throw new Error(`effective Git config has non-file origin: ${record.origin}`);
        const target = resolveGitConfigReference(cwd, record.value);
        const ordinal = referenceCounts.get(key) ?? 0;
        referenceCounts.set(key, ordinal + 1);
        files[`<effective-git-config-reference>/${key}/${ordinal}`] = {
          target,
          fingerprint: metadataFileFingerprint(target, authorities),
        };
      }
      if (records.length === 0) {
        const fileName = key === 'core.attributesfile' ? 'attributes' : 'ignore';
        const target = defaultGitConfigReference(cwd, fileName);
        files[`<effective-git-config-default-reference>/${key}`] = {
          target,
          fingerprint: metadataFileFingerprint(target, authorities),
        };
      }
    }
    for (const name of ['hooks', 'info']) {
      const directory = gitPath(cwd, name);
      if (!authorities.some((authority) => within(authority, directory))) throw new Error(`Git metadata directory escapes authority: ${name}`);
      const dirStat = fs.existsSync(directory) ? fs.lstatSync(directory, { bigint: true }) : null;
      files[`<git-dir>/${name}`] = dirStat ? {
        present: true,
        type: dirStat.isDirectory() ? 'directory' : 'other',
        dev: String(dirStat.dev),
        ino: String(dirStat.ino),
        mode: String(dirStat.mode),
      } : { present: false };
      if (name === 'hooks' && dirStat?.isDirectory()) captureMetadataDirectory(directory, authorities, files, '<git-dir>/hooks');
    }
  } catch (err) {
    return { ok: false, error: err.message, files: {}, identity };
  }
  return { ok: true, error: null, identity, files };
}

export function compareGitMetadataState(before, after) {
  if (!before?.ok || !after?.ok) {
    return {
      ok: false,
      error: before?.error ?? after?.error ?? 'Git metadata attestation failed',
      changes: ['<git-metadata-attestation-error>'],
    };
  }
  const changes = [];
  if (JSON.stringify(before.identity) !== JSON.stringify(after.identity)) changes.push('<identity>');
  const keys = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort();
  for (const key of keys) {
    if (JSON.stringify(before.files[key] ?? null) !== JSON.stringify(after.files[key] ?? null)) changes.push(key);
  }
  return { ok: changes.length === 0, error: null, changes };
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

const PHASE_TOOL_NAMES = Object.freeze({
  implement: new Set(['subagent_codex_implementer']),
  repair: new Set(['subagent_codex_implementer']),
  review: new Set(['subagent_claude_reviewer']),
  rereview: new Set(['subagent_claude_reviewer']),
  research: new Set(['mcp__literature__search_literature', 'mcp__literature__verify_source']),
});

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedPayload(value, depth = 0) {
  if (depth > 8) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return typeof value !== 'string' || value.length <= 32 * 1024;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 256 && value.every((item) => boundedPayload(item, depth + 1));
  return plainObject(value) && Object.keys(value).length <= 256
    && Object.keys(value).every((key) => key.length <= 512 && boundedPayload(value[key], depth + 1));
}

function strictLedger(ledger, phase) {
  if (!ledger?.ok) return { ok: false, reason: ledger?.error ?? 'TOOL_GUARD_LEDGER_INVALID', calls: [], results: new Map() };
  if (!Array.isArray(ledger.events) || ledger.events.length === 0) return { ok: false, reason: 'TOOL_GUARD_LEDGER_EMPTY', calls: [], results: new Map() };
  const allowedNames = PHASE_TOOL_NAMES[phase];
  if (!allowedNames) return { ok: false, reason: `UNSUPPORTED_TOOL_LEDGER_PHASE:${phase}`, calls: [], results: new Map() };
  const calls = [];
  const results = new Map();
  const callIds = new Set();
  const callOrdinals = new Map();
  let pendingCall = null;
  for (const event of ledger.events) {
    if (!plainObject(event) || (event.stage !== 'call' && event.stage !== 'result')) return { ok: false, reason: 'MALFORMED_LEDGER_EVENT', calls, results };
    if (typeof event.name !== 'string' || !allowedNames.has(event.name)) return { ok: false, reason: 'UNEXPECTED_TOOL_NAME', calls, results };
    if (typeof event.call_id !== 'string' || event.call_id.length === 0 || event.call_id.length > 512) return { ok: false, reason: 'MALFORMED_CALL_ID', calls, results };
    const allowedKeys = event.stage === 'call'
      ? new Set(['stage', 'name', 'call_id', 'ordinal', 'allowed', 'arguments'])
      : new Set(['stage', 'name', 'call_id', 'is_error', ...(event.name.startsWith('mcp__literature__') ? ['payload'] : [])]);
    if (Object.keys(event).some((key) => !allowedKeys.has(key))) return { ok: false, reason: 'UNKNOWN_LEDGER_EVENT_FIELD', calls, results };
    if (event.stage === 'call') {
      if (pendingCall !== null) return { ok: false, reason: 'REORDERED_LEDGER_EVENT', calls, results };
      if (callIds.has(event.call_id) || results.has(event.call_id)) return { ok: false, reason: 'DUPLICATE_CALL_ID', calls, results };
      if (!Number.isSafeInteger(event.ordinal) || event.ordinal < 1) return { ok: false, reason: 'MALFORMED_CALL_ORDINAL', calls, results };
      const expectedOrdinal = (callOrdinals.get(event.name) ?? 0) + 1;
      if (event.ordinal !== expectedOrdinal) return { ok: false, reason: 'NON_MONOTONIC_CALL_ORDINAL', calls, results };
      if (typeof event.allowed !== 'boolean' || !plainObject(event.arguments) || !boundedPayload(event.arguments)) return { ok: false, reason: 'MALFORMED_CALL_EVENT', calls, results };
      if (event.name === 'mcp__literature__search_literature' && event.arguments.query !== undefined && typeof event.arguments.query !== 'string') return { ok: false, reason: 'MALFORMED_MCP_SEARCH_ARGUMENTS', calls, results };
      if (event.name === 'mcp__literature__verify_source' && (typeof event.arguments.id !== 'string' || event.arguments.id.length === 0)) return { ok: false, reason: 'MALFORMED_MCP_VERIFY_ARGUMENTS', calls, results };
      callIds.add(event.call_id);
      callOrdinals.set(event.name, event.ordinal);
      calls.push(event);
      pendingCall = event;
      continue;
    }
    if (results.has(event.call_id)) return { ok: false, reason: 'DUPLICATE_RESULT', calls, results };
    const call = pendingCall;
    if (!call || call.call_id !== event.call_id) return { ok: false, reason: 'ORPHAN_OR_REORDERED_RESULT', calls, results };
    if (call.name !== event.name) return { ok: false, reason: 'RESULT_TOOL_NAME_MISMATCH', calls, results };
    if (typeof event.is_error !== 'boolean') return { ok: false, reason: 'MALFORMED_RESULT_EVENT', calls, results };
    if (Object.prototype.hasOwnProperty.call(event, 'payload') && !boundedPayload(event.payload)) return { ok: false, reason: 'MALFORMED_RESULT_PAYLOAD', calls, results };
    if (event.name.startsWith('mcp__literature__') && event.is_error === false && (!Object.prototype.hasOwnProperty.call(event, 'payload') || !plainObject(event.payload))) {
      return { ok: false, reason: 'MISSING_MCP_RESULT_PAYLOAD', calls, results };
    }
    results.set(event.call_id, event);
    pendingCall = null;
  }
  if (pendingCall !== null || calls.some((call) => !results.has(call.call_id))) return { ok: false, reason: 'INCOMPLETE_CALL_RESULT_SETTLEMENT', calls, results };
  return { ok: true, reason: null, calls, results };
}

function successfulToolCalls(inspected, name) {
  const calls = inspected.calls.filter((event) => event.name === name);
  const successful = calls.filter((call) => call.allowed === true && inspected.results.get(call.call_id)?.is_error === false);
  const denied = calls.filter((call) => call.allowed !== true);
  const incomplete = calls.filter((call) => !inspected.results.has(call.call_id));
  const errored = calls.filter((call) => inspected.results.get(call.call_id)?.is_error === true);
  return { calls, successful, denied, incomplete, errored };
}

export function canonicalSourceIdentity(source) {
  if (!plainObject(source) || typeof source.url !== 'string') return null;
  const raw = source.url.trim();
  if (raw.length === 0 || raw.length > 4096) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  if (!parsed.protocol || parsed.username || parsed.password) return null;
  return `url:${parsed.href}`;
}

function sourceRecord(source) {
  if (!plainObject(source) || typeof source.id !== 'string' || source.id.length === 0 || source.id.length > 512) return null;
  const identity = canonicalSourceIdentity(source);
  return identity === null ? null : { id: source.id, identity };
}

function searchSourceRecords(successfulSearches, results) {
  const sources = new Map();
  let malformed = false;
  for (const call of successfulSearches) {
    const payload = results.get(call.call_id)?.payload;
    if (!plainObject(payload) || !Array.isArray(payload.sources)) {
      malformed = true;
      continue;
    }
    for (const source of payload.sources) {
      const record = sourceRecord(source);
      if (!record || sources.has(record.id)) {
        malformed = true;
        continue;
      }
      sources.set(record.id, record.identity);
    }
  }
  return { sources, malformed };
}

function verifiedPayloadSource(payload) {
  if (!plainObject(payload) || payload.verified !== true) return null;
  const source = plainObject(payload.source) ? payload.source : payload;
  const record = sourceRecord(source);
  if (!record) return null;
  if (payload.source && payload.id !== undefined && payload.id !== record.id) return null;
  return record;
}

export function validatePhaseToolLedger(ledger, phase, evidence = null) {
  const strict = strictLedger(ledger, phase);
  if (!strict.ok) return { ok: false, reason: strict.reason, phase, counts: { calls: strict.calls.length, results: strict.results.size } };
  if (!ledger?.ok) {
    return { ok: false, reason: ledger?.error ?? 'TOOL_GUARD_LEDGER_INVALID', phase, counts: {} };
  }
  if (phase === 'implement' || phase === 'repair') {
    const inspected = successfulToolCalls(strict, 'subagent_codex_implementer');
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
    const inspected = successfulToolCalls(strict, 'subagent_claude_reviewer');
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
    const search = successfulToolCalls(strict, 'mcp__literature__search_literature');
    const verify = successfulToolCalls(strict, 'mcp__literature__verify_source');
    const searched = searchSourceRecords(search.successful, strict.results);
    const searchedIds = [...searched.sources.keys()].sort();
    const verificationCounts = new Map();
    const verifiedIds = [];
    const verifiedIdentities = new Set();
    let malformedVerification = false;
    for (const call of verify.successful) {
      const requestedId = call.arguments.id;
      const returned = verifiedPayloadSource(strict.results.get(call.call_id)?.payload);
      if (!searched.sources.has(requestedId) || returned?.id !== requestedId || returned?.identity !== searched.sources.get(requestedId)) {
        malformedVerification = true;
      }
      if (returned?.id === requestedId && returned.identity === searched.sources.get(requestedId)) {
        verificationCounts.set(requestedId, (verificationCounts.get(requestedId) ?? 0) + 1);
        verifiedIdentities.add(returned.identity);
        if (!verifiedIds.includes(requestedId)) verifiedIds.push(requestedId);
      }
    }
    verifiedIds.sort();
    const evidenceIds = Array.isArray(evidence?.sources)
      ? evidence.sources.map((source) => source?.id)
      : [];
    const validEvidenceIds = evidenceIds.length >= 2
      && evidenceIds.every((id) => typeof id === 'string' && id.length > 0 && searchedIds.includes(id))
      && new Set(evidenceIds).size === evidenceIds.length;
    const evidenceIdentities = validEvidenceIds
      ? new Set(evidenceIds.map((id) => searched.sources.get(id)))
      : new Set();
    const everyEvidenceSourceVerified = validEvidenceIds
      && evidenceIds.every((id) => verificationCounts.get(id) === 1);
    const noFailures = search.denied.length === 0
      && search.incomplete.length === 0
      && search.errored.length === 0
      && verify.denied.length === 0
      && verify.incomplete.length === 0
      && verify.errored.length === 0;
    const ok = search.successful.length >= 1
      && searchedIds.length >= 2
      && verifiedIds.length >= 2
      && evidenceIdentities.size >= 2
      && verifiedIdentities.size >= 2
      && everyEvidenceSourceVerified
      && !searched.malformed
      && !malformedVerification
      && [...verificationCounts.values()].every((count) => count === 1)
      && noFailures;
    return {
      ok,
      reason: ok ? null : 'MCP_TOOL_ATTESTATION_INVALID',
      phase,
      counts: {
        search_calls: search.calls.length,
        search_successful: search.successful.length,
        verify_calls: verify.calls.length,
        verify_successful: verify.successful.length,
        searched_sources: searchedIds.length,
        verified_sources: verifiedIds.length,
        verified_canonical_sources: verifiedIdentities.size,
        evidence_canonical_sources: evidenceIdentities.size,
      },
      searched_source_ids: searchedIds,
      verified_source_ids: verifiedIds,
      evidence_source_ids: [...new Set(evidenceIds)].sort(),
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
  let contentAttestation = null;
  if (command.exit === 0 && afterScope.ok) contentAttestation = captureContentAttestation(cwd, afterScope.paths);
  const pass = command.exit === 0 && afterScope.ok && contentAttestation?.ok === true;
  return {
    pass,
    reason: command.exit !== 0
      ? `HOST_VERIFY_EXIT_${command.exit}`
      : !afterScope.ok
        ? `UNAUTHORIZED_WRITE:${afterScope.unauthorized.join(',')}`
        : contentAttestation?.ok ? null : `CONTENT_ATTESTATION_FAILED:${contentAttestation?.error ?? 'unknown'}`,
    scope: afterScope,
    content_attestation: contentAttestation,
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

function contentHash(file) {
  const stat = fs.statSync(file, { bigint: true });
  if (stat.size > BigInt(MAX_CONTENT_FILE)) throw new Error(`authorized content too large: ${file}`);
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let offset = 0;
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, offset);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
      offset += read;
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function gitMode(stat, type) {
  if (type === 'symlink') return '120000';
  return (Number(stat.mode) & 0o111) !== 0 ? '100755' : '100644';
}

export function captureContentAttestation(cwd, paths) {
  if (!Array.isArray(paths)) return { ok: false, error: 'content attestation paths must be an array', paths: [], entries: {} };
  const root = path.resolve(cwd);
  const normalizedPaths = [...new Set(paths)].sort();
  const entries = {};
  try {
    for (const rawPath of normalizedPaths) {
      const repoPath = normalizeRepoPath(rawPath);
      if (!repoPath) throw new Error(`unsafe content attestation path: ${rawPath}`);
      const target = path.resolve(root, repoPath);
      if (!within(root, target)) throw new Error(`content attestation path escapes workdir: ${repoPath}`);
      let stat;
      try { stat = fs.lstatSync(target, { bigint: true }); } catch (err) {
        if (err.code === 'ENOENT') {
          entries[repoPath] = { present: false };
          continue;
        }
        throw err;
      }
      const type = stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : 'other';
      if (type === 'other') throw new Error(`unsupported authorized content type: ${repoPath}`);
      const entry = {
        present: true,
        type,
        mode: String(stat.mode),
        git_mode: gitMode(stat, type),
        size: String(stat.size),
        sha256: type === 'file'
          ? contentHash(target)
          : crypto.createHash('sha256').update(fs.readlinkSync(target)).digest('hex'),
        link: type === 'symlink' ? fs.readlinkSync(target) : null,
      };
      const object = runSync('git', ['hash-object', '--no-filters', '--', repoPath], { cwd });
      if (object.exit !== 0 || !/^[0-9a-f]{40,64}$/.test(object.stdout.trim())) throw new Error(`cannot hash authorized content: ${repoPath}: ${object.stderr}`);
      entry.git_object_id = object.stdout.trim();
      entries[repoPath] = entry;
    }
  } catch (err) {
    return { ok: false, error: err.message, paths: normalizedPaths, entries: {} };
  }
  return {
    ok: true,
    error: null,
    paths: normalizedPaths,
    entries,
    sha256: crypto.createHash('sha256').update(JSON.stringify(Object.entries(entries))).digest('hex'),
  };
}

function compareContentAttestations(expected, actual) {
  if (!expected?.ok || !actual?.ok || JSON.stringify(expected.paths) !== JSON.stringify(actual.paths)) return false;
  return JSON.stringify(expected.entries) === JSON.stringify(actual.entries);
}

function indexEntries(cwd, paths) {
  const entries = {};
  for (const repoPath of paths) {
    const result = runSync('git', ['--literal-pathspecs', 'ls-files', '--stage', '-z', '--', repoPath], { cwd });
    if (result.exit !== 0) throw new Error(`cannot inspect staged path ${repoPath}: ${result.stderr}`);
    const records = splitNul(result.stdout);
    if (records.length > 1) throw new Error(`staged path has multiple index stages: ${repoPath}`);
    if (records.length === 0) continue;
    const tab = records[0].indexOf('\t');
    const fields = tab < 0 ? [] : records[0].slice(0, tab).split(' ');
    if (fields.length !== 3 || fields[2] !== '0') throw new Error(`malformed staged index record: ${repoPath}`);
    entries[repoPath] = { mode: fields[0], object_id: fields[1], path: records[0].slice(tab + 1) };
  }
  return entries;
}

function treeEntries(cwd, head, paths) {
  const result = runSync('git', ['--literal-pathspecs', 'ls-tree', '-r', '-z', head, '--', ...paths], { cwd });
  if (result.exit !== 0) throw new Error(`cannot inspect committed content: ${result.stderr}`);
  const entries = {};
  for (const record of splitNul(result.stdout)) {
    const tab = record.indexOf('\t');
    const fields = tab < 0 ? [] : record.slice(0, tab).split(' ');
    if (fields.length !== 3) throw new Error('malformed committed tree record');
    entries[record.slice(tab + 1)] = { mode: fields[0], object_id: fields[2] };
  }
  return entries;
}

function compareIndexToContent(cwd, attestation) {
  const paths = attestation.paths;
  const index = indexEntries(cwd, paths);
  for (const repoPath of paths) {
    const expected = attestation.entries[repoPath];
    const actual = index[repoPath];
    if (!expected.present) {
      if (actual) return { ok: false, error: `deleted path remains staged: ${repoPath}` };
      continue;
    }
    if (!actual || actual.mode !== expected.git_mode || actual.object_id !== expected.git_object_id) {
      return { ok: false, error: `staged content or mode differs: ${repoPath}` };
    }
  }
  return { ok: true, error: null };
}

function compareTreeToContent(cwd, head, attestation) {
  const tree = treeEntries(cwd, head, attestation.paths);
  for (const repoPath of attestation.paths) {
    const expected = attestation.entries[repoPath];
    const actual = tree[repoPath];
    if (!expected.present) {
      if (actual) return { ok: false, error: `deleted path remains committed: ${repoPath}` };
      continue;
    }
    if (!actual || actual.mode !== expected.git_mode || actual.object_id !== expected.git_object_id) {
      return { ok: false, error: `committed content or mode differs: ${repoPath}` };
    }
  }
  return { ok: true, error: null };
}

export function commitTask(cwd, taskId, allowed, checkpointHead, expectedContent = null, expectedGitMetadata = null) {
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

  const content = expectedContent?.ok ? expectedContent : captureContentAttestation(cwd, scope.paths);
  if (!content.ok || JSON.stringify(content.paths) !== JSON.stringify(scope.paths)) {
    const err = new Error(`content attestation mismatch before staging for ${taskId}: ${content.error ?? 'path set changed'}`);
    err.code = 'SPRINT_CONTENT_ATTESTATION';
    throw err;
  }
  const currentContent = captureContentAttestation(cwd, content.paths);
  if (!compareContentAttestations(content, currentContent)) {
    const err = new Error(`worktree content changed after host verification for ${taskId}`);
    err.code = 'SPRINT_CONTENT_ATTESTATION';
    throw err;
  }
  if (expectedGitMetadata) {
    const currentMetadata = captureGitMetadataState(cwd);
    const metadataDiff = compareGitMetadataState(expectedGitMetadata, currentMetadata);
    if (!metadataDiff.ok) {
      const err = new Error(`Git metadata changed before staging for ${taskId}: ${metadataDiff.changes.join(',')}`);
      err.code = 'SPRINT_GIT_METADATA_ATTESTATION';
      err.scope = metadataDiff;
      throw err;
    }
  }

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
  const stagedContent = compareIndexToContent(cwd, content);
  if (!stagedContent.ok) {
    const err = new Error(`staged content attestation failed for ${taskId}: ${stagedContent.error}`);
    err.code = 'SPRINT_CONTENT_ATTESTATION';
    err.scope = stagedContent;
    throw err;
  }

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
  const committedContent = compareTreeToContent(cwd, head, content);
  if (!committedContent.ok) {
    const err = new Error(`committed content attestation failed for ${taskId}: ${committedContent.error}`);
    err.code = 'SPRINT_CONTENT_ATTESTATION';
    err.scope = committedContent;
    throw err;
  }
  if (expectedGitMetadata) {
    const currentMetadata = captureGitMetadataState(cwd);
    const metadataDiff = compareGitMetadataState(expectedGitMetadata, currentMetadata);
    if (!metadataDiff.ok) {
      const err = new Error(`Git metadata changed after checkpoint for ${taskId}: ${metadataDiff.changes.join(',')}`);
      err.code = 'SPRINT_GIT_METADATA_ATTESTATION';
      err.scope = metadataDiff;
      throw err;
    }
  }
  const after = changedPaths(cwd);
  if (after.length !== 0) {
    const err = new Error(`worktree remained dirty after host checkpoint for ${taskId}: ${after.join(',')}`);
    err.code = 'SPRINT_COMMIT_ATTESTATION';
    err.scope = { paths: after };
    throw err;
  }
  return {
    head,
    parent: checkpointHead,
    staged_paths: stagedPaths,
    committed_paths: committedPaths,
    checkpoint_attestation: true,
    content_attestation: { ...content, staged: stagedContent, committed: committedContent, ok: true },
  };
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
    const gitMetadataBefore = captureGitMetadataState(cwd);
    const headBefore = resolveHead(cwd);
    const result = await dshRun({ cwd, patches, prompt: buildResearchPrompt(task), label: `${task.id}/RESEARCH`, timeoutSeconds: 300 });
    const after = changedPaths(cwd);
    const ignoredAfter = captureIgnoredState(cwd);
    const ignoredState = compareIgnoredState(ignoredBefore, ignoredAfter);
    const gitMetadataAfter = captureGitMetadataState(cwd);
    const gitMetadataState = compareGitMetadataState(gitMetadataBefore, gitMetadataAfter);
    const headAfter = resolveHead(cwd);
    const parsed = parseResearchReceipt(`${result.stdout}\n${result.stderr}`);
    const ledger = readToolGuardTranscript({ data: result.trusted_transcript, complete: result.trusted_transcript_complete });
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
        && gitMetadataState.ok
        && headUnchanged,
      result,
      parsed,
      tool_guard: toolGuard,
      parent: { ...proxy.state },
      worktree_unchanged: gitUnchanged && ignoredState.ok && gitMetadataState.ok && headUnchanged,
      ignored_state: ignoredState,
      git_metadata_state: gitMetadataState,
      git_metadata_before: gitMetadataBefore,
      git_metadata_after: gitMetadataAfter,
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
    let toolGuard = validatePhaseToolLedger(readToolGuardTranscript({ data: result.trusted_transcript, complete: result.trusted_transcript_complete }), 'implement');
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
    toolGuard = validatePhaseToolLedger(readToolGuardTranscript({ data: result.trusted_transcript, complete: result.trusted_transcript_complete }), 'review');
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
    toolGuard = validatePhaseToolLedger(readToolGuardTranscript({ data: result.trusted_transcript, complete: result.trusted_transcript_complete }), 'repair');
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
    toolGuard = validatePhaseToolLedger(readToolGuardTranscript({ data: result.trusted_transcript, complete: result.trusted_transcript_complete }), 'rereview');
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

export function evaluateFinalAttestations({ final, receipt, gitState, ignoredState, gitMetadataState }) {
  const content = {
    ok: final.state !== 'PASS' || (receipt.tasks.length > 0
      && receipt.tasks.every((task) => task.commit?.content_attestation?.ok === true)),
    incomplete_tasks: receipt.tasks.filter((task) => task.commit?.content_attestation?.ok !== true).map((task) => task.id),
  };
  const checkpoint = {
    ok: final.state !== 'PASS' || (Object.values(final.tasks).every((task) => task.state === 'PASS')
      && receipt.tasks.length === Object.keys(final.tasks).length
      && receipt.tasks.every((task) => task.commit?.checkpoint_attestation === true
        && task.commit.parent === task.checkpoint_head
        && sameStrings(task.commit.staged_paths ?? [], task.commit.committed_paths ?? []))),
  };
  const all = gitState.ok && ignoredState.ok && gitMetadataState.ok && content.ok && checkpoint.ok;
  return {
    git: gitState,
    ignored: ignoredState,
    git_metadata: gitMetadataState,
    content,
    checkpoint,
    all,
    controller_state: final.state === 'PASS' && !all ? 'FAILED' : final.state,
    clean_worktree: all,
  };
}

export async function runLiveSprint({ spec, cwd, receiptPath, researchMcp }) {
  preflight();
  assertClean(cwd);
  validateAuthority(spec);
  const sprintIgnoredBaseline = captureIgnoredState(cwd);
  if (!sprintIgnoredBaseline.ok) fail(`cannot capture ignored-state baseline: ${sprintIgnoredBaseline.error}`);
  const sprintGitMetadataBaseline = captureGitMetadataState(cwd);
  if (!sprintGitMetadataBaseline.ok) fail(`cannot capture Git metadata baseline: ${sprintGitMetadataBaseline.error}`);
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
    git_metadata_baseline: { ok: true, sha256: crypto.createHash('sha256').update(JSON.stringify(sprintGitMetadataBaseline)).digest('hex') },
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
    const gitMetadataCheckpoint = captureGitMetadataState(cwd);
    if (!gitMetadataCheckpoint.ok) {
      hardStop = { reason: 'GIT_METADATA_CAPTURE_FAILED', task_id: taskId, error: gitMetadataCheckpoint.error };
      break;
    }
    console.log(`\n=== SPRINT TASK ${taskId} mode=${task.mode} ===`);
    const taskReceipt = {
      id: taskId,
      mode: task.mode,
      checkpoint_head: checkpointHead,
      ignored_checkpoint: ignoredStateSummary(ignoredCheckpoint),
      git_metadata_checkpoint: { ok: true, sha256: crypto.createHash('sha256').update(JSON.stringify(gitMetadataCheckpoint)).digest('hex') },
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
        git_metadata_state: research.git_metadata_state,
        head_unchanged: research.head_unchanged,
        exit: research.result.exit,
        duration_ms: research.result.duration_ms,
      };
      if (!research.ok) {
        recordResearch(sprint, taskId, { ok: false, reason: 'RESEARCH_MCP_OR_EVIDENCE_GATE_FAILED' });
        if (!research.ignored_state.ok || !research.git_metadata_state.ok || !research.head_unchanged) {
          hardStop = {
            reason: !research.head_unchanged
              ? 'HEAD_AUTHORITY_VIOLATION'
              : !research.git_metadata_state.ok ? 'GIT_METADATA_MUTATION' : 'IGNORED_WORKTREE_MUTATION',
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
    const gitMetadataAfterLifecycle = captureGitMetadataState(cwd);
    taskReceipt.git_metadata_state = compareGitMetadataState(sprintGitMetadataBaseline, gitMetadataAfterLifecycle);
    if (!taskReceipt.ignored_state.ok || !taskReceipt.git_metadata_state.ok) {
      hardStop = {
        reason: !taskReceipt.git_metadata_state.ok ? 'GIT_METADATA_MUTATION' : 'IGNORED_WORKTREE_MUTATION',
        task_id: taskId,
        ignored_state: taskReceipt.ignored_state,
        git_metadata_state: taskReceipt.git_metadata_state,
      };
      receipt.tasks.push(taskReceipt);
      receipt.checkpoints.push(checkpoint(sprint));
      if (receiptPath) writeJson(receiptPath, { ...receipt, current: checkpoint(sprint), hard_stop: hardStop });
      break;
    }

    const current = sprint.tasks[taskId];
    if (current.state === 'PASS') {
      try {
        const verifyPhase = [...(taskReceipt.lifecycle?.phases ?? [])].reverse().find((phase) => phase.phase === 'HOST_VERIFY' || phase.phase === 'HOST_RETEST');
        taskReceipt.commit = commitTask(
          cwd,
          taskId,
          task.authority?.write ?? [],
          checkpointHead,
          verifyPhase?.content_attestation ?? null,
          sprintGitMetadataBaseline,
        );
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
                : err.code === 'SPRINT_CONTENT_ATTESTATION'
                  ? 'HOST_CONTENT_ATTESTATION_FAILED'
                  : err.code === 'SPRINT_GIT_METADATA_ATTESTATION'
                    ? 'GIT_METADATA_MUTATION'
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
  const finalGitMetadata = captureGitMetadataState(cwd);
  const gitMetadataFinalState = compareGitMetadataState(sprintGitMetadataBaseline, finalGitMetadata);
  const finalGitState = {
    ok: gitStatus.exit === 0 && gitStatus.stdout.trim() === '',
    paths: gitStatus.exit === 0 ? gitStatus.stdout.trim().split(/\r?\n/).filter(Boolean) : ['<git-status-error>'],
    error: gitStatus.exit === 0 ? null : gitStatus.stderr,
  };
  const finalAttestation = evaluateFinalAttestations({
    final,
    receipt,
    gitState: finalGitState,
    ignoredState: ignoredFinalState,
    gitMetadataState: gitMetadataFinalState,
  });
  const allFinalAttestations = finalAttestation.all;
  if (!hardStop && !allFinalAttestations) hardStop = { reason: 'FINAL_ATTESTATION_FAILED', final_attestation: finalAttestation };
  receipt.finished_at = new Date().toISOString();
  receipt.final = final;
  receipt.controller_state = hardStop ? 'FAILED' : finalAttestation.controller_state;
  receipt.controller_terminal_reason = hardStop?.reason ?? final.terminal_reason;
  receipt.hard_stop = hardStop;
  receipt.ignored_final = ignoredStateSummary(finalIgnored);
  receipt.ignored_state_unchanged = ignoredFinalState;
  receipt.git_final = finalGitState;
  receipt.git_metadata_final = gitMetadataFinalState;
  receipt.content_final = finalAttestation.content;
  receipt.checkpoint_final = finalAttestation.checkpoint;
  receipt.final_attestation = finalAttestation;
  receipt.clean_worktree = allFinalAttestations;
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

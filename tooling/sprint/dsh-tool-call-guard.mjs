import fs from 'node:fs';

export const name = 'smokestack-tool-call-guard';
export const inject = ['tools'];

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} must contain valid JSON`);
  }
}

function trustedChannelFd() {
  const raw = process.env.DSH_SMOKESTACK_TOOL_GUARD_FD;
  if (!raw || !/^\d+$/.test(raw)) throw new Error('DSH_SMOKESTACK_TOOL_GUARD_FD is required');
  const fd = Number(raw);
  if (!Number.isSafeInteger(fd) || fd < 3) throw new Error('DSH_SMOKESTACK_TOOL_GUARD_FD must be a safe fd >= 3');
  return fd;
}

function appendTrustedEvent(fd, event) {
  fs.writeSync(fd, `${JSON.stringify(event)}\n`, undefined, 'utf8');
}

function safeArguments(exec) {
  if (exec.name === 'mcp__literature__search_literature') {
    return typeof exec.arguments?.query === 'string'
      ? { query: exec.arguments.query.slice(0, MAX_RESULT_TEXT) }
      : {};
  }
  if (exec.name === 'mcp__literature__verify_source') {
    return typeof exec.arguments?.id === 'string'
      ? { id: exec.arguments.id.slice(0, 512) }
      : {};
  }
  const description = exec.arguments && typeof exec.arguments === 'object'
    ? exec.arguments.description
    : undefined;
  return typeof description === 'string' ? { description: description.slice(0, MAX_RESULT_TEXT) } : {};
}

const MAX_RESULT_TEXT = 32 * 1024;

function boundedJson(value, depth = 0) {
  if (depth > 6) return '[depth-limit]';
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return typeof value === 'string' && value.length > MAX_RESULT_TEXT
      ? value.slice(0, MAX_RESULT_TEXT)
      : value;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.slice(0, 128).map((item) => boundedJson(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().slice(0, 128)
      .map((key) => [key, boundedJson(value[key], depth + 1)]));
  }
  return null;
}

function resultPayload(exec, result) {
  if (!exec.name.startsWith('mcp__literature__')) return undefined;
  const candidates = [];
  if (result?.structuredContent && typeof result.structuredContent === 'object') {
    candidates.push(result.structuredContent);
  }
  if (Array.isArray(result?.content)) {
    for (const item of result.content) {
      if (item?.type !== 'text' || typeof item.text !== 'string') continue;
      if (item.text.length > MAX_RESULT_TEXT) return { malformed: true };
      try { candidates.push(JSON.parse(item.text)); } catch { return { malformed: true }; }
    }
  }
  if (candidates.length !== 1 || !candidates[0] || typeof candidates[0] !== 'object' || Array.isArray(candidates[0])) {
    return { malformed: true };
  }
  return boundedJson(candidates[0]);
}

export function apply(ctx) {
  const trustedFd = trustedChannelFd();

  const rawLimits = parseJsonEnv('SMOKESTACK_TOOL_GUARD_LIMITS', {});
  const rawObserve = parseJsonEnv('SMOKESTACK_TOOL_GUARD_OBSERVE', []);
  if (rawLimits === null || typeof rawLimits !== 'object' || Array.isArray(rawLimits)) {
    throw new Error('SMOKESTACK_TOOL_GUARD_LIMITS must be a JSON object');
  }
  if (!Array.isArray(rawObserve) || rawObserve.some((name) => typeof name !== 'string' || name.length === 0)) {
    throw new Error('SMOKESTACK_TOOL_GUARD_OBSERVE must be a JSON string array');
  }

  const limits = new Map();
  for (const [toolName, rawMax] of Object.entries(rawLimits)) {
    const max = Number(rawMax);
    if (!Number.isSafeInteger(max) || max < 0) throw new Error(`invalid tool call limit for ${toolName}`);
    limits.set(toolName, max);
  }
  const observed = new Set([...limits.keys(), ...rawObserve]);
  const counts = new Map();

  ctx.tools.guard((exec) => {
    if (!observed.has(exec.name)) return undefined;
    const ordinal = (counts.get(exec.name) ?? 0) + 1;
    counts.set(exec.name, ordinal);
    const max = limits.get(exec.name);
    const allowed = max === undefined || ordinal <= max;
    appendTrustedEvent(trustedFd, {
      stage: 'call',
      name: exec.name,
      call_id: exec.callId,
      ordinal,
      allowed,
      arguments: safeArguments(exec),
    });
    return allowed
      ? undefined
      : `Smokestack tool call ceiling exceeded for ${exec.name}: ${ordinal}/${max}`;
  });

  ctx.on('tools/result', (exec, result) => {
    if (!observed.has(exec.name)) return;
    appendTrustedEvent(trustedFd, {
      stage: 'result',
      name: exec.name,
      call_id: exec.callId,
      is_error: result?.isError,
      payload: resultPayload(exec, result),
    });
  });
}

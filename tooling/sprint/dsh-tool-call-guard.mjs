import fs from 'node:fs';
import path from 'node:path';

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

function appendLedger(file, event) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');
}

function safeArguments(exec) {
  if (exec.name.startsWith('mcp__literature__')) return exec.arguments;
  const description = exec.arguments && typeof exec.arguments === 'object'
    ? exec.arguments.description
    : undefined;
  return typeof description === 'string' ? { description } : {};
}

export function apply(ctx) {
  const ledger = process.env.SMOKESTACK_TOOL_GUARD_LEDGER;
  if (!ledger) throw new Error('SMOKESTACK_TOOL_GUARD_LEDGER is required');

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
    appendLedger(ledger, {
      stage: 'call',
      name: exec.name,
      call_id: String(exec.callId),
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
    appendLedger(ledger, {
      stage: 'result',
      name: exec.name,
      call_id: String(exec.callId),
      is_error: result.isError === true,
    });
  });
}

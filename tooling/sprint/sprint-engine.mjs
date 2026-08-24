import crypto from 'node:crypto';

export const MODES = Object.freeze(['FAST', 'REVIEWED', 'GOVERNED']);
export const TERMINAL_TASK_STATES = Object.freeze(['PASS', 'BLOCKED', 'NEEDS_HUMAN', 'FAILED']);
export const REVIEW_GATES = Object.freeze(['NO_CRITICAL_HIGH', 'CRITICAL_HIGH_FOUND']);

const ACTIVE_STATES = new Set([
  'PENDING',
  'READY',
  'RUNNING',
  'VERIFYING',
  'REVIEWING',
  'REPAIRING',
  'REREVIEWING',
]);
const TERMINAL = new Set(TERMINAL_TASK_STATES);

function invariant(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.code = 'SPRINT_INVARIANT';
    throw err;
  }
}

function clone(value) {
  return structuredClone(value);
}

export function canonicalJson(value) {
  const walk = (x) => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') {
      return Object.fromEntries(Object.keys(x).sort().map((k) => [k, walk(x[k])]));
    }
    return x;
  };
  return `${JSON.stringify(walk(value), null, 2)}\n`;
}

export function sha256Canonical(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function validateSprintSpec(spec) {
  invariant(spec && typeof spec === 'object', 'sprint spec must be an object');
  invariant(typeof spec.sprint_id === 'string' && spec.sprint_id.length > 0, 'sprint_id required');
  invariant(Array.isArray(spec.tasks) && spec.tasks.length > 0, 'tasks must be a non-empty array');

  const byId = new Map();
  for (const raw of spec.tasks) {
    invariant(raw && typeof raw === 'object', 'task must be an object');
    invariant(typeof raw.id === 'string' && raw.id.length > 0, 'task id required');
    invariant(!byId.has(raw.id), `duplicate task id: ${raw.id}`);
    invariant(MODES.includes(raw.mode), `invalid mode for ${raw.id}: ${raw.mode}`);
    invariant(Array.isArray(raw.depends_on), `depends_on must be an array for ${raw.id}`);
    invariant(Array.isArray(raw.acceptance) && raw.acceptance.length > 0, `acceptance required for ${raw.id}`);
    byId.set(raw.id, raw);
  }

  for (const raw of spec.tasks) {
    for (const dep of raw.depends_on) {
      invariant(byId.has(dep), `unknown dependency ${dep} for ${raw.id}`);
      invariant(dep !== raw.id, `self dependency for ${raw.id}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const dfs = (id) => {
    if (visited.has(id)) return;
    invariant(!visiting.has(id), `dependency cycle detected at ${id}`);
    visiting.add(id);
    for (const dep of byId.get(id).depends_on) dfs(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) dfs(id);

  return true;
}

function makeTask(raw) {
  return {
    id: raw.id,
    objective: String(raw.objective ?? ''),
    depends_on: [...raw.depends_on].sort(),
    mode: raw.mode,
    acceptance: [...raw.acceptance],
    authority: clone(raw.authority ?? { write: [] }),
    research_required: raw.research_required === true,
    research_state: raw.research_required === true ? 'PENDING' : 'NOT_REQUIRED',
    state: 'PENDING',
    terminal_reason: null,
    implementation_calls: 0,
    review_calls: 0,
    repair_calls: 0,
    rereview_calls: 0,
    review_gate: null,
    rereview_gate: null,
    repair_inflight: false,
    awaiting_rereview: false,
    host_verify_count: 0,
  };
}

export function createSprint(spec) {
  validateSprintSpec(spec);
  const tasks = {};
  for (const raw of [...spec.tasks].sort((a, b) => a.id.localeCompare(b.id))) {
    tasks[raw.id] = makeTask(raw);
  }
  const sprint = {
    version: 1,
    sprint_id: spec.sprint_id,
    objective: String(spec.objective ?? ''),
    state: 'ACTIVE',
    terminal_reason: null,
    event_seq: 0,
    tasks,
    events: [],
  };
  appendEvent(sprint, 'SPRINT_CREATED', null, { task_count: Object.keys(tasks).length });
  reconcile(sprint);
  return sprint;
}

function appendEvent(sprint, type, taskId, detail = {}) {
  sprint.event_seq += 1;
  sprint.events.push({ seq: sprint.event_seq, type, task_id: taskId, detail: clone(detail) });
}

function taskOf(sprint, taskId) {
  const task = sprint.tasks[taskId];
  invariant(task, `unknown task: ${taskId}`);
  return task;
}

function setTerminal(sprint, task, state, reason) {
  invariant(TERMINAL.has(state), `invalid terminal state: ${state}`);
  task.state = state;
  task.terminal_reason = reason ?? null;
  task.repair_inflight = false;
  appendEvent(sprint, `TASK_${state}`, task.id, { reason: task.terminal_reason });
  reconcile(sprint);
}

export function reconcile(sprint) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of Object.values(sprint.tasks).sort((a, b) => a.id.localeCompare(b.id))) {
      if (task.state !== 'PENDING') continue;
      const deps = task.depends_on.map((id) => sprint.tasks[id]);
      const nonPassTerminal = deps.find((dep) => TERMINAL.has(dep.state) && dep.state !== 'PASS');
      if (nonPassTerminal) {
        task.state = 'BLOCKED';
        task.terminal_reason = `DEPENDENCY_${nonPassTerminal.id}_${nonPassTerminal.state}`;
        appendEvent(sprint, 'TASK_BLOCKED', task.id, { reason: task.terminal_reason });
        changed = true;
        continue;
      }
      if (deps.every((dep) => dep.state === 'PASS')) {
        task.state = 'READY';
        appendEvent(sprint, 'TASK_READY', task.id);
        changed = true;
      }
    }
  }

  const tasks = Object.values(sprint.tasks);
  if (tasks.every((t) => t.state === 'PASS')) {
    sprint.state = 'PASS';
    sprint.terminal_reason = 'ALL_TASKS_PASS';
    return sprint;
  }

  const anyActive = tasks.some((t) => ACTIVE_STATES.has(t.state));
  if (anyActive) {
    sprint.state = 'ACTIVE';
    sprint.terminal_reason = null;
    return sprint;
  }

  if (tasks.some((t) => t.state === 'NEEDS_HUMAN')) {
    sprint.state = 'NEEDS_HUMAN';
    sprint.terminal_reason = 'EXECUTABLE_FRONTIER_EXHAUSTED_WITH_HUMAN_DECISION';
  } else if (tasks.some((t) => t.state === 'FAILED')) {
    sprint.state = 'FAILED';
    sprint.terminal_reason = 'EXECUTABLE_FRONTIER_EXHAUSTED_WITH_FAILURE';
  } else {
    sprint.state = 'BLOCKED';
    sprint.terminal_reason = 'EXECUTABLE_FRONTIER_EXHAUSTED_WITH_BLOCKERS';
  }
  return sprint;
}

export function readyFrontier(sprint) {
  reconcile(sprint);
  return Object.values(sprint.tasks)
    .filter((t) => t.state === 'READY')
    .map((t) => t.id)
    .sort();
}

export function recordResearch(sprint, taskId, { ok, reason = null } = {}) {
  const task = taskOf(sprint, taskId);
  invariant(task.state === 'READY', `research requires READY task: ${taskId}`);
  invariant(task.research_required, `research not required for ${taskId}`);
  invariant(task.research_state === 'PENDING', `research already resolved for ${taskId}`);
  if (ok === true) {
    task.research_state = 'PASS';
    appendEvent(sprint, 'RESEARCH_PASS', taskId);
  } else {
    task.research_state = 'FAILED';
    setTerminal(sprint, task, 'BLOCKED', reason ?? 'RESEARCH_FAILED');
  }
  return sprint;
}

export function startImplementation(sprint, taskId) {
  const task = taskOf(sprint, taskId);
  invariant(task.state === 'READY', `implementation requires READY task: ${taskId}`);
  invariant(task.implementation_calls === 0, `implementation call ceiling reached for ${taskId}`);
  invariant(!task.research_required || task.research_state === 'PASS', `required research incomplete for ${taskId}`);
  task.implementation_calls += 1;
  task.state = 'RUNNING';
  appendEvent(sprint, 'IMPLEMENTATION_STARTED', taskId, { call: task.implementation_calls });
  return sprint;
}

export function finishImplementation(sprint, taskId, { exit_code } = {}) {
  const task = taskOf(sprint, taskId);
  invariant(task.state === 'RUNNING', `implementation not running for ${taskId}`);
  invariant(Number.isInteger(exit_code), `integer exit_code required for ${taskId}`);
  if (exit_code !== 0) {
    setTerminal(sprint, task, 'FAILED', `IMPLEMENTATION_EXIT_${exit_code}`);
  } else {
    task.state = 'VERIFYING';
    appendEvent(sprint, 'IMPLEMENTATION_COMPLETED', taskId, { exit_code });
  }
  return sprint;
}

export function finishHostVerify(sprint, taskId, { pass, reason = null } = {}) {
  const task = taskOf(sprint, taskId);
  invariant(task.state === 'VERIFYING', `host verification not expected for ${taskId}`);
  task.host_verify_count += 1;
  if (pass !== true) {
    setTerminal(sprint, task, 'FAILED', reason ?? 'HOST_VERIFY_FAILED');
    return sprint;
  }

  appendEvent(sprint, 'HOST_VERIFY_PASS', taskId, { count: task.host_verify_count });
  if (task.awaiting_rereview) {
    task.state = 'REREVIEWING';
  } else if (task.mode === 'FAST') {
    setTerminal(sprint, task, 'PASS', 'FAST_HOST_VERIFY_PASS');
  } else {
    task.state = 'REVIEWING';
  }
  return sprint;
}

function assertGate(gate) {
  invariant(REVIEW_GATES.includes(gate), `invalid review gate: ${gate}`);
}

export function finishReview(sprint, taskId, { gate } = {}) {
  const task = taskOf(sprint, taskId);
  invariant(task.state === 'REVIEWING', `review not expected for ${taskId}`);
  invariant(task.review_calls === 0, `review call ceiling reached for ${taskId}`);
  assertGate(gate);
  task.review_calls += 1;
  task.review_gate = gate;
  appendEvent(sprint, 'REVIEW_COMPLETED', taskId, { gate });
  if (gate === 'NO_CRITICAL_HIGH') {
    setTerminal(sprint, task, 'PASS', 'REVIEW_NO_CRITICAL_HIGH');
  } else {
    task.state = 'REPAIRING';
  }
  return sprint;
}

export function startRepair(sprint, taskId) {
  const task = taskOf(sprint, taskId);
  invariant(task.state === 'REPAIRING', `repair is not authorized for ${taskId}`);
  invariant(task.review_gate === 'CRITICAL_HIGH_FOUND', `repair requires Critical/High review gate for ${taskId}`);
  invariant(task.repair_calls === 0, `repair call ceiling reached for ${taskId}`);
  invariant(task.repair_inflight === false, `repair already running for ${taskId}`);
  task.repair_calls += 1;
  task.repair_inflight = true;
  appendEvent(sprint, 'REPAIR_STARTED', taskId, { call: task.repair_calls });
  return sprint;
}

export function finishRepair(sprint, taskId, { exit_code } = {}) {
  const task = taskOf(sprint, taskId);
  invariant(task.state === 'REPAIRING' && task.repair_inflight, `repair not running for ${taskId}`);
  invariant(Number.isInteger(exit_code), `integer exit_code required for ${taskId}`);
  task.repair_inflight = false;
  if (exit_code !== 0) {
    setTerminal(sprint, task, 'FAILED', `REPAIR_EXIT_${exit_code}`);
  } else {
    task.awaiting_rereview = true;
    task.state = 'VERIFYING';
    appendEvent(sprint, 'REPAIR_COMPLETED', taskId, { exit_code });
  }
  return sprint;
}

export function finishRereview(sprint, taskId, { gate } = {}) {
  const task = taskOf(sprint, taskId);
  invariant(task.state === 'REREVIEWING', `rereview not expected for ${taskId}`);
  invariant(task.repair_calls === 1, `rereview requires exactly one repair for ${taskId}`);
  invariant(task.rereview_calls === 0, `rereview call ceiling reached for ${taskId}`);
  assertGate(gate);
  task.rereview_calls += 1;
  task.rereview_gate = gate;
  appendEvent(sprint, 'REREVIEW_COMPLETED', taskId, { gate });
  if (gate === 'NO_CRITICAL_HIGH') {
    setTerminal(sprint, task, 'PASS', 'REREVIEW_NO_CRITICAL_HIGH');
  } else {
    setTerminal(sprint, task, 'BLOCKED', 'CRITICAL_HIGH_REMAINS_AFTER_SINGLE_REPAIR');
  }
  return sprint;
}

export function markNeedsHuman(sprint, taskId, reason = 'HUMAN_AUTHORITY_REQUIRED') {
  const task = taskOf(sprint, taskId);
  invariant(!TERMINAL.has(task.state), `task already terminal: ${taskId}`);
  setTerminal(sprint, task, 'NEEDS_HUMAN', reason);
  return sprint;
}

export function markBlocked(sprint, taskId, reason = 'BLOCKED') {
  const task = taskOf(sprint, taskId);
  invariant(!TERMINAL.has(task.state), `task already terminal: ${taskId}`);
  setTerminal(sprint, task, 'BLOCKED', reason);
  return sprint;
}

export function checkpoint(sprint) {
  reconcile(sprint);
  const compactTasks = {};
  for (const id of Object.keys(sprint.tasks).sort()) {
    const t = sprint.tasks[id];
    compactTasks[id] = {
      state: t.state,
      mode: t.mode,
      depends_on: [...t.depends_on],
      research_state: t.research_state,
      implementation_calls: t.implementation_calls,
      review_calls: t.review_calls,
      repair_calls: t.repair_calls,
      rereview_calls: t.rereview_calls,
      review_gate: t.review_gate,
      rereview_gate: t.rereview_gate,
      terminal_reason: t.terminal_reason,
    };
  }
  const body = {
    version: sprint.version,
    sprint_id: sprint.sprint_id,
    state: sprint.state,
    terminal_reason: sprint.terminal_reason,
    event_seq: sprint.event_seq,
    ready_frontier: readyFrontier(sprint),
    tasks: compactTasks,
  };
  return { ...body, sha256: sha256Canonical(body) };
}

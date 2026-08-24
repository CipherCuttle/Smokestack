import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkpoint,
  createSprint,
  finishHostVerify,
  finishImplementation,
  finishRepair,
  finishReview,
  finishRereview,
  markNeedsHuman,
  readyFrontier,
  recordResearch,
  startImplementation,
  startRepair,
  validateSprintSpec,
} from './sprint-engine.mjs';

function task(id, mode, depends_on = [], extra = {}) {
  return {
    id,
    mode,
    depends_on,
    objective: `objective ${id}`,
    acceptance: [`accept ${id}`],
    authority: { write: [`${id}.txt`] },
    ...extra,
  };
}

function expectInvariant(fn, pattern) {
  assert.throws(fn, (err) => err?.code === 'SPRINT_INVARIANT' && pattern.test(err.message));
}

test('rejects dependency cycles', () => {
  const spec = {
    sprint_id: 'cycle',
    tasks: [task('A', 'FAST', ['B']), task('B', 'FAST', ['A'])],
  };
  expectInvariant(() => validateSprintSpec(spec), /cycle/i);
});

test('ready frontier is deterministic and dependency-bound', () => {
  const sprint = createSprint({
    sprint_id: 'frontier',
    tasks: [
      task('Z', 'FAST', ['A']),
      task('B', 'FAST'),
      task('A', 'FAST'),
    ],
  });
  assert.deepEqual(readyFrontier(sprint), ['A', 'B']);
});

test('FAST closes on host verification with no review', () => {
  const sprint = createSprint({ sprint_id: 'fast', tasks: [task('A', 'FAST')] });
  startImplementation(sprint, 'A');
  finishImplementation(sprint, 'A', { exit_code: 0 });
  finishHostVerify(sprint, 'A', { pass: true });
  assert.equal(sprint.tasks.A.state, 'PASS');
  assert.equal(sprint.tasks.A.review_calls, 0);
  assert.equal(sprint.state, 'PASS');
});

test('GOVERNED research requirement is a hard precondition', () => {
  const sprint = createSprint({
    sprint_id: 'research',
    tasks: [task('A', 'GOVERNED', [], { research_required: true })],
  });
  expectInvariant(() => startImplementation(sprint, 'A'), /research incomplete/i);
  recordResearch(sprint, 'A', { ok: true });
  startImplementation(sprint, 'A');
  assert.equal(sprint.tasks.A.implementation_calls, 1);
});

test('REVIEWED no-Critical-High branch closes without repair', () => {
  const sprint = createSprint({ sprint_id: 'review-pass', tasks: [task('A', 'REVIEWED')] });
  startImplementation(sprint, 'A');
  finishImplementation(sprint, 'A', { exit_code: 0 });
  finishHostVerify(sprint, 'A', { pass: true });
  assert.equal(sprint.tasks.A.state, 'REVIEWING');
  finishReview(sprint, 'A', { gate: 'NO_CRITICAL_HIGH' });
  assert.equal(sprint.tasks.A.state, 'PASS');
  assert.equal(sprint.tasks.A.review_calls, 1);
  assert.equal(sprint.tasks.A.repair_calls, 0);
  expectInvariant(() => startRepair(sprint, 'A'), /not authorized|terminal|REPAIRING/i);
});

test('Critical-High branch allows exactly one repair and one rereview', () => {
  const sprint = createSprint({ sprint_id: 'repair-pass', tasks: [task('A', 'GOVERNED')] });
  startImplementation(sprint, 'A');
  finishImplementation(sprint, 'A', { exit_code: 0 });
  finishHostVerify(sprint, 'A', { pass: true });
  finishReview(sprint, 'A', { gate: 'CRITICAL_HIGH_FOUND' });
  assert.equal(sprint.tasks.A.state, 'REPAIRING');
  startRepair(sprint, 'A');
  expectInvariant(() => startRepair(sprint, 'A'), /ceiling|already running/i);
  finishRepair(sprint, 'A', { exit_code: 0 });
  finishHostVerify(sprint, 'A', { pass: true });
  assert.equal(sprint.tasks.A.state, 'REREVIEWING');
  finishRereview(sprint, 'A', { gate: 'NO_CRITICAL_HIGH' });
  assert.equal(sprint.tasks.A.state, 'PASS');
  assert.equal(sprint.tasks.A.repair_calls, 1);
  assert.equal(sprint.tasks.A.rereview_calls, 1);
  expectInvariant(() => startRepair(sprint, 'A'), /not authorized|REPAIRING/i);
  expectInvariant(() => finishRereview(sprint, 'A', { gate: 'NO_CRITICAL_HIGH' }), /not expected/i);
});

test('Critical-High remaining after the single rereview closes BLOCKED', () => {
  const sprint = createSprint({ sprint_id: 'repair-block', tasks: [task('A', 'REVIEWED')] });
  startImplementation(sprint, 'A');
  finishImplementation(sprint, 'A', { exit_code: 0 });
  finishHostVerify(sprint, 'A', { pass: true });
  finishReview(sprint, 'A', { gate: 'CRITICAL_HIGH_FOUND' });
  startRepair(sprint, 'A');
  finishRepair(sprint, 'A', { exit_code: 0 });
  finishHostVerify(sprint, 'A', { pass: true });
  finishRereview(sprint, 'A', { gate: 'CRITICAL_HIGH_FOUND' });
  assert.equal(sprint.tasks.A.state, 'BLOCKED');
  assert.match(sprint.tasks.A.terminal_reason, /CRITICAL_HIGH_REMAINS/);
  assert.equal(sprint.state, 'BLOCKED');
});

test('human-blocked branch does not stop independent ready work', () => {
  const sprint = createSprint({
    sprint_id: 'skip-blocked',
    tasks: [
      task('A', 'GOVERNED'),
      task('B', 'FAST', ['A']),
      task('C', 'FAST'),
      task('D', 'FAST', ['C']),
    ],
  });

  assert.deepEqual(readyFrontier(sprint), ['A', 'C']);
  markNeedsHuman(sprint, 'A', 'FROZEN_SEMANTICS_CHANGE_REQUIRED');
  assert.equal(sprint.tasks.B.state, 'BLOCKED');
  assert.deepEqual(readyFrontier(sprint), ['C']);

  startImplementation(sprint, 'C');
  finishImplementation(sprint, 'C', { exit_code: 0 });
  finishHostVerify(sprint, 'C', { pass: true });
  assert.deepEqual(readyFrontier(sprint), ['D']);

  startImplementation(sprint, 'D');
  finishImplementation(sprint, 'D', { exit_code: 0 });
  finishHostVerify(sprint, 'D', { pass: true });

  assert.equal(sprint.tasks.C.state, 'PASS');
  assert.equal(sprint.tasks.D.state, 'PASS');
  assert.equal(sprint.state, 'NEEDS_HUMAN');
  assert.equal(sprint.terminal_reason, 'EXECUTABLE_FRONTIER_EXHAUSTED_WITH_HUMAN_DECISION');
});

test('checkpoint is stable for unchanged state and binds task counters', () => {
  const sprint = createSprint({ sprint_id: 'receipt', tasks: [task('A', 'FAST')] });
  const c1 = checkpoint(sprint);
  const c2 = checkpoint(sprint);
  assert.deepEqual(c1, c2);

  startImplementation(sprint, 'A');
  finishImplementation(sprint, 'A', { exit_code: 0 });
  finishHostVerify(sprint, 'A', { pass: true });
  const c3 = checkpoint(sprint);
  assert.notEqual(c1.sha256, c3.sha256);
  assert.equal(c3.tasks.A.implementation_calls, 1);
  assert.equal(c3.tasks.A.state, 'PASS');
});

test('medium/low prose cannot authorize repair without a C/H gate transition', () => {
  const sprint = createSprint({ sprint_id: 'no-prose-repair', tasks: [task('A', 'REVIEWED')] });
  startImplementation(sprint, 'A');
  finishImplementation(sprint, 'A', { exit_code: 0 });
  finishHostVerify(sprint, 'A', { pass: true });
  expectInvariant(() => startRepair(sprint, 'A'), /not authorized/i);
});

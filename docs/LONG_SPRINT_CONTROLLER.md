# Long Sprint Controller V0

Status: PR-00B QUALIFICATION CANDIDATE

## Goal

Provide one-command, low-attention Smokestack development sprints without transferring authority to a model.

Target operator experience:

```bash
smokestack-sprint run <phase-contract> --mode autonomous
```

The host controller owns task state, authority, tests, Git scope, budgets, receipts, retries, terminal decisions, and escalation. Models plan, research, implement, and review only inside host-issued task capabilities.

## Core architecture

```text
USER
  |
  | one command
  v
HOST SPRINT SUPERVISOR
  |
  +--> task DAG / ready frontier
  +--> budget + concurrency controller
  +--> immutable task/phase contracts
  +--> host tests / Git scope / hashes
  +--> receipts + checkpoints
  |
  +--> RESEARCH role: DeepSeek + narrow read-only MCP tools
  +--> IMPLEMENT role: bounded Codex workspace writer
  +--> REVIEW role: independent read-only Claude TEN_STACK_V1 reviewer
```

The sprint is long-lived; individual model episodes are not. A fresh bounded model episode receives only the current task contract, relevant durable decisions/evidence, and required repository state.

## Task modes

### FAST

For low-risk, mechanically testable work.

```text
IMPLEMENT -> HOST VERIFY -> CLOSE
```

### REVIEWED

For ordinary meaningful implementation.

```text
IMPLEMENT -> HOST VERIFY -> TEN_STACK REVIEW
                         | no C/H -> CLOSE
                         | C/H    -> REPAIR(1) -> RETEST -> REREVIEW(1) -> CLOSE/BLOCK
```

### GOVERNED

For scientific contracts, point-in-time semantics, security/auth, migrations, external-source semantics, architecture boundaries, and phase closure.

```text
RESEARCH/EVIDENCE (when required)
 -> FROZEN TASK CONTRACT
 -> IMPLEMENT
 -> HOST VERIFY
 -> TEN_STACK REVIEW
 -> optional single C/H repair/retest/rereview
 -> RECEIPT
 -> CLOSE/BLOCK
```

Routing must be deterministic from the phase/task contract. A model may recommend a mode but may not downgrade a host-assigned mode.

## Task DAG

Each task has:

```json
{
  "id": "PR01_SOURCE_FIRST_BUYER_03",
  "objective": "Qualify candidate first-buyer source",
  "depends_on": ["PR01_UNIVERSE_FREEZE_01"],
  "mode": "GOVERNED",
  "authority": {
    "write": ["experiments/qualification/**"]
  },
  "acceptance": [
    "host tests pass",
    "provider semantics recorded",
    "direct-chain comparison exists"
  ],
  "research_required": true,
  "status": "PENDING"
}
```

Allowed task states:

`PENDING`, `READY`, `RUNNING`, `VERIFYING`, `REVIEWING`, `REPAIRING`, `REREVIEWING`, `PASS`, `BLOCKED`, `NEEDS_HUMAN`, `FAILED`.

Terminal task states are `PASS`, `BLOCKED`, `NEEDS_HUMAN`, and `FAILED`.

## Ready-frontier rule

A task becomes `READY` only when every dependency is `PASS`.

If a task becomes blocked, independent tasks continue. Descendants of a non-PASS dependency remain non-runnable and must not be silently skipped as successful.

The sprint stops only when:

1. all tasks are `PASS`; or
2. no runnable task remains and one or more tasks are `BLOCKED`, `NEEDS_HUMAN`, or `FAILED`; or
3. a host budget/time/authority ceiling is reached.

This avoids waking the operator for a local blocker when unrelated useful work remains.

## Bounded repair

Per task:

- implementation calls <= 1 before review;
- independent reviews <= 1 before repair;
- repair calls <= 1 and only after `CRITICAL_HIGH_FOUND`;
- rereviews <= 1 and only after repair;
- automatic whole-task replay = 0 unless the failure is an explicitly classified infrastructure failure and a separate host retry budget authorizes it;
- a second C/H after the one rereview closes the task `BLOCKED`.

No reviewer finding can extend these ceilings.

## Checkpoints and durable context

Sprint state lives outside model context and is append-only where practical:

```text
.sprint/<sprint-id>/
  SPRINT_CONTRACT.json
  TASK_DAG.json
  DECISIONS.jsonl
  ASSUMPTIONS.jsonl
  EVIDENCE.jsonl
  EVENTS.jsonl
  CHECKPOINT.json
  RECEIPTS/
```

A new model episode receives a compact task capsule derived from these records. It does not receive a multi-hour conversation transcript.

## Evidence / MCP boundary

Research MCPs are read-only and narrow. V0 target capabilities:

- search papers/documents;
- fetch metadata by stable identifier;
- fetch references/citations;
- search official documentation;
- read-only GitHub lookup when explicitly required.

Research results are normalized into claim receipts containing stable identifiers/URLs and retrieval metadata before they enter implementation/review context.

The implementation worker does not inherit the broad research MCP surface.

## Concurrency

V0 qualification begins with one writer at a time. Read-only research/review may later overlap with an independent task only after worktree isolation and integration reconciliation are proven.

Never run two writers in the same worktree.

## Human escalation

A task becomes `NEEDS_HUMAN` for authority questions such as:

- changing frozen scientific semantics;
- weakening acceptance criteria;
- materially expanding product scope;
- reading a new secret or credential domain;
- increasing spend/time ceiling;
- publishing externally;
- merging a protected branch;
- deleting non-disposable data;
- unresolved canonical source conflict.

Other READY tasks continue. The operator sees one consolidated terminal report when the executable frontier is exhausted.

## PR-00B qualification target

Before any model-backed long sprint, prove with zero-model deterministic selftests:

- DAG validation and cycle rejection;
- deterministic READY frontier;
- blocked-node skipping while independent work continues;
- dependency descendants never run after non-PASS prerequisites;
- FAST / REVIEWED / GOVERNED lifecycle legality;
- C/H-only repair authorization;
- one repair and one rereview maximum;
- second repair/rereview rejection;
- deterministic terminal sprint state;
- stable checkpoint/receipt generation.

After this passes, wire the already-qualified PR-00A DSH executor topology into the controller. MCP research is a separate adapter with a narrow allowlist and must not enlarge implementer/reviewer authority.

# PR-00B R1 — Host Attestation Hardening

Status: `FROZEN_IMPLEMENTATION_PENDING`

## Identity

- Phase: `PR-00B_R1_HOST_ATTESTATION_HARDENING`
- Predecessor terminal candidate: `90816bc445a2d5965df5f12ef4d46be56609abd6`
- Predecessor verdict: `CLOSED_FAIL_TARGETED_REREVIEW_CRITICAL_HIGH_FOUND`
- Scope source: the one independent targeted rereview of PR-00B V0.

R1 exists only to repair the four reproduced High-severity host-control failures below. It is not authority to redesign the controller, run live model qualification, merge, or begin PR-01.

## Frozen High findings

### R1-H01 — strict tool-ledger correlation

Failure reproduced: duplicate/malformed result events can be collapsed/overwritten so host validation accepts a forged successful child/MCP call correlation.

Required properties:

1. Every ledger event has a strict schema.
2. Every observed call has a non-empty string `call_id` unique within the phase ledger.
3. Every result has a non-empty string `call_id` and matches exactly one preceding observed call of the same tool name.
4. Exactly one result may exist for each call.
5. Orphan results, duplicate results, duplicate call ids, malformed ordinals/types, or impossible ordering fail closed.
6. IMPLEMENT/REPAIR requires exactly one allowed, successful Codex child call and no other Codex child call.
7. REVIEW/REREVIEW requires exactly one allowed, successful Claude child call and no other Claude child call.
8. A denied second child call followed by any parent success marker cannot PASS.

Required falsification tests include duplicate error→success result overwrite, success→error duplicate result, missing/empty ids, duplicate call ids, orphan results, result-before-call, wrong-name result correlation, malformed ordinals, and incomplete call/result settlement.

### R1-H02 — complete local-state contamination boundary

Failure reproduced: ignored-state attestation misses empty ignored directories, mutations reachable through pre-existing ignored symlinks, and Git metadata/config outside ordinary worktree path enumeration.

Required properties:

1. Relevant ignored filesystem entries, including directories, are represented in the baseline/final attestation.
2. Empty ignored directory creation/deletion is detectable.
3. Symlinks are never followed outside the repository attestation boundary; an ignored symlink resolving outside the repository must fail closed, or its external target must be independently immutable/attested. Default R1 policy: fail closed on external targets.
4. Internal symlink identity/target changes are detectable without escaping the repository root.
5. Security-relevant repository Git metadata/config that can change staging/commit semantics is separately attested and unauthorized mutation fails closed. At minimum bind effective/local Git config relevant to filters, hooks, attributes/config includes, and repository-path/worktree identity.
6. Ignored-state failure may never be converted to silent cleanup.
7. Cross-task inheritance of a detected mutation is prohibited.

Required falsification tests include empty ignored directory creation/deletion, external ignored symlink target attack, internal symlink replacement, `.git/config` mutation, config/include/filter mutation where applicable, and ignored state capable of affecting a later task/test.

### R1-H03 — MCP evidence payload binding

Failure reproduced: successful transport/tool calls with arbitrary verify arguments can satisfy research validation even when IDs were not returned by search and verification payload did not assert successful verification.

Required chain:

`successful search result payload -> host-extracted source id -> successful verify_source(id) result payload -> matching id + verified:true -> evidence source id`

Required properties:

1. Host ledger records a deterministic, bounded representation of successful MCP result payloads sufficient for attestation.
2. Evidence source ids must be present in successful search result payload(s).
3. Each evidence source id must have exactly one acceptable verification result bound to the same id.
4. Verification payload must explicitly assert the expected positive verification state (`verified: true` or the fixture contract's exact equivalent).
5. Transport success alone is insufficient.
6. Duplicate verification of one source cannot satisfy the >=2 distinct-source requirement.
7. Fabricated IDs, mismatched payload IDs, missing payloads, malformed payloads, error results, and incomplete settlement fail closed.

Required falsification tests include `FAB-A/FAB-B` never returned by search, successful transport with `verified:false`, mismatched returned id, malformed result body, duplicate verification, and evidence id absent from search results.

### R1-H04 — verified-content/terminal-truth binding

Failure reproduced: staging can transform authorized content after host verification (for example through a Git clean filter), while path-only parent/path attestation still succeeds. Separately, final clean-state attestation can fail while `controller_state` remains `PASS`.

Required properties:

1. After host verification, capture a deterministic content+mode attestation for the complete authorized change set that is eligible to commit.
2. Staged tree/content must exactly equal the post-verification attestation before commit.
3. Committed tree/content must exactly equal the same attestation after commit.
4. Git filters or other staging-time transforms that alter verified content must cause a hard failure before/at checkpoint acceptance.
5. Existing exact checkpoint parent and committed path-set checks remain required.
6. Any final Git-state, ignored-state, Git-metadata, content, or checkpoint attestation failure forces terminal controller failure; `controller_state=PASS` with `clean_worktree=false` is forbidden.
7. Hard-stop/failure receipts remain inspectable and never claim task/sprint PASS.

Required falsification tests include a malicious clean filter that stages altered content, mode-only changes, partial staging/commit failure, final ignored mutation after last task, and explicit proof that terminal PASS implies every final attestation is true.

## Required regression set

R1 must retain all previously passing controls:

- actual monotonic pre-dispatch child-call ceiling;
- child-created HEAD drift rejection;
- authorized non-PASS rollback -> different READY task;
- unauthorized tracked/untracked mutation preserved and blocks cleanup;
- staged add/delete/rename and literal-path behavior;
- verify-command unauthorized side effects rejection;
- pre-commit hook suppression;
- exact checkpoint parent and committed path-set binding;
- process failure/incomplete receipt rejection;
- deterministic read-only qualification MCP fixture behavior.

## Completion policy

Bounded policy for R1:

`IMPLEMENT -> ZERO-MODEL TESTS -> FULL CI/TYPECHECK -> ONE INDEPENDENT HOSTILE REVIEW -> fix genuine Critical/High if any -> at most ONE targeted rereview only if such fixes were required -> CLOSE`

Medium/Low do not reopen R1 unless they invalidate the frozen objective/evidence/fail-closed boundary.

If the first independent hostile review returns no Critical/High, R1 closes PASS immediately. Do not perform a second generic review.

If a targeted rereview after a Critical/High repair still returns Critical/High, R1 closes FAIL rather than beginning another repair/review loop.

## Acceptance gate

R1 may close PASS only when all are true:

- the four reproduced exploit classes are represented by tests that fail against predecessor `90816bc445a2d5965df5f12ef4d46be56609abd6` and pass on R1;
- full zero-model suite passes;
- repository CI/typecheck passes in the intended environment;
- no live DSH/model-backed four-task qualification occurred during R1 implementation/review;
- one independent hostile review returns no remaining Critical/High, or one allowed targeted rereview after a C/H repair returns no remaining Critical/High;
- final candidate SHA is frozen and recorded.

Only after R1 closes PASS may the separate one-live-four-task qualification gate be consumed.

## Explicitly unauthorized

- merging PR-00B V0 or R1 during this phase;
- live four-task model qualification;
- product PR-01 work;
- changing DSH/provider/model topology except where strictly necessary to preserve the frozen host-control contract;
- weakening or deleting exploit tests to obtain PASS;
- another open-ended review loop.

# PR-00B R1 — Host Attestation Hardening

Status: `CRITICAL_HIGH_REPAIR_PENDING`

## Identity

- Phase: `PR-00B_R1_HOST_ATTESTATION_HARDENING`
- Predecessor terminal candidate: `90816bc445a2d5965df5f12ef4d46be56609abd6`
- Frozen hostile-review candidate: `669d3add0c489a900ede47a6064c50d8678288af`
- Hostile review result: `R1_HOSTILE_REVIEW_GATE: CRITICAL_HIGH_FOUND`
- Hostile review counts: Critical 0 / High 3 / Medium 0 / Low 0.
- Hostile review budget: consumed.
- Targeted rereview budget remaining: exactly one, after the bounded C/H repair.

The hostile-review wrapper rejected its receipt only because the reviewer repeated the same terminal gate twice. The substantive review result is unambiguous, the reviewer remained read-only, and the review is not rerun.

R1 exists only to repair the reproduced host-control failures below. It is not authority to run live model qualification, merge, or begin PR-01.

## Original R1 High findings

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

### R1-H02 — complete local-state contamination boundary

Required properties include ignored directories/files, internal/external symlink boundaries, security-relevant Git metadata/config, fail-closed mutation handling, and no cross-task inheritance.

### R1-H03 — MCP evidence payload binding

Required chain:

`successful search result payload -> host-extracted source id -> successful verify_source(id) result payload -> matching id + verified:true -> evidence source id`

### R1-H04 — verified-content/terminal-truth binding

Required properties include post-host-verify content/mode attestation, staged-tree equality, committed-tree equality, filter-transform rejection, checkpoint parent/path binding, and `PASS => every final attestation true`.

## Hostile-review C/H repair scope

The one broad hostile review of frozen candidate `669d3add0c489a900ede47a6064c50d8678288af` reproduced three remaining High findings. The bounded repair may address only these findings plus regression fallout from their fixes.

### R1-RH01 — HIGH — mutable tool-ledger evidence

The current tool guard emits host authority evidence to a filesystem ledger. The reviewer demonstrated that four genuine events containing a denied second child call can be reduced to a valid two-event call/result pair, after which host validation returns `ok: true`.

Repair requirements:

- child/model-controlled execution must not be able to rewrite, truncate, replace, delete, or forge the evidence channel used for child-call ceilings;
- same-UID file permissions alone are not accepted as isolation;
- first inspect the real DSH/Codex subagent process/sandbox topology and determine whether the actual child can reach the evidence channel;
- if reachability exists, replace the filesystem ledger authority with a mechanically isolated host-owned channel or equivalent fail-closed design;
- if reachability is mechanically impossible, add an executable regression that proves the real topology blocks the attack;
- missing/truncated/duplicate/reordered/injected evidence remains fail-closed.

### R1-RH02 — HIGH — local-state metadata coverage incomplete

The reviewer reproduced:

1. touching an existing ignored directory is invisible because directory `mtime_ns` / `ctime_ns` are stored as null;
2. an effective external `core.attributesFile` may change after baseline and alter staging semantics without changing current metadata comparison.

Repair requirements:

- attest relevant ignored-directory timestamps or an equivalent deterministic mutation signal;
- effective Git configuration references capable of changing ignored/staging/commit semantics must be independently fingerprinted/bound or rejected fail-closed when outside trusted authority;
- cover `core.attributesFile` and inspect analogous file-valued semantics such as excludes/config includes rather than fixing only one string;
- preserve bounded resource limits and existing symlink/config/include/filter protections.

### R1-RH03 — HIGH — semantic duplicate MCP sources

The reviewer reproduced distinct IDs `A` and `B` representing the same underlying source identity/content. Both verified positively and current validation treated them as two distinct sources.

Repair requirements:

- the >=2 source gate requires >=2 distinct canonical source identities, not merely distinct opaque IDs;
- derive/bind a deterministic canonical source identity or fingerprint from search payload and verification payload;
- reject two IDs that canonicalize to the same source;
- reject search/verification canonical-identity mismatch;
- preserve fabricated-ID, negative verification, malformed/error/incomplete, duplicate-ID, and missing-search-source rejection.

## Required C/H repair tests

Before the repair can freeze for targeted rereview, executable local tests/probes must prove:

1. the prior ledger truncation/rewrite attack cannot yield host PASS under the actual authority topology;
2. existing ignored-directory timestamp mutation is detected;
3. mutation of an effective external `core.attributesFile` cannot silently alter staging semantics;
4. analogous effective Git file references are either fingerprinted or fail closed;
5. two distinct MCP IDs for one canonical source are rejected;
6. search/verify canonical identity mismatch is rejected;
7. all prior R1 regression controls remain passing.

## Required regression set

R1 must retain all previously passing controls:

- actual monotonic pre-dispatch child-call ceiling;
- strict ledger schema/correlation;
- child-created HEAD drift rejection;
- authorized non-PASS rollback -> different READY task;
- unauthorized mutation preserved;
- staged add/delete/rename and literal path behavior;
- verify-command unauthorized side effects rejection;
- pre-commit hook suppression;
- exact checkpoint parent and committed path-set binding;
- ignored files/directories and symlink controls;
- MCP fabricated/negative/mismatched/malformed/error/incomplete rejection;
- malicious clean-filter staging rejection;
- mode-only/deletion content attestation;
- final PASS implies all final attestations true;
- deterministic read-only qualification MCP fixture.

## Completion policy

Bounded R1 policy:

`IMPLEMENT -> ZERO-MODEL TESTS -> FULL CI/TYPECHECK -> ONE INDEPENDENT HOSTILE REVIEW -> fix genuine Critical/High if any -> at most ONE targeted rereview -> CLOSE`

Current position:

`C/H REPAIR -> ZERO-MODEL TESTS -> FULL CI/TYPECHECK -> ONE TARGETED REREVIEW -> CLOSE`

No second broad review is permitted. If the targeted rereview still returns Critical/High, R1 closes FAIL rather than starting another repair/review loop.

Medium/Low do not reopen R1 unless they invalidate the frozen objective/evidence/fail-closed boundary.

## Acceptance gate

R1 may close PASS only when all are true:

- the original exploit classes and the three hostile-review Highs are represented by fail-closed tests/probes;
- full zero-model suite passes;
- repository CI/typecheck passes;
- no live four-task qualification occurred during R1 implementation/review/repair;
- the one allowed targeted rereview returns no remaining Critical/High;
- final repair SHA is frozen and recorded.

Only after R1 closes PASS may the separate one-live-four-task qualification gate be consumed.

## Explicitly unauthorized

- merge;
- live four-task model qualification;
- product PR-01 work;
- second broad hostile review;
- more than one targeted rereview;
- weakening/deleting exploit tests;
- unrelated redesign.

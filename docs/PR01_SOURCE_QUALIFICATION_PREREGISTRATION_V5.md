# PR-01 Source Qualification Preregistration V5

## Frozen identity and state

- Phase: `PR01_SOURCE_QUALIFICATION_PREREGISTRATION_V5`
- Lineage kind: `NEW_PREREGISTRATION_LINEAGE` — this is a fresh canonical
  preregistration lineage, not a continuation or repair of V2, not another
  feasibility experiment, not live measurement, not provider execution, and
  not PR-02.
- State: `PREREGISTERED_NOT_EXECUTED`
- Canonical predecessor: `e09ed82e378ae4a04d4988a917851dd9e275be14` (V4 terminal candidate)
- `MEASUREMENT_AUTHORIZED = NO`
- `SOURCE_STACK_QUALIFIED = NO`
- `LIVE_PROVIDER_EXECUTION_AUTHORIZED = NO`
- `PR02 = NOT_STARTED`
- Exact JSON: [`experiments/qualification/pr01-source-qualification-prereg-v5.json`](../experiments/qualification/pr01-source-qualification-prereg-v5.json)
- JSON SHA-256: `f1b04c9f49d368048fb77ce86f22a22fb1f7563b6875a39f5ca96cf4e0beffd2`
- Historical V3 repair source: `7805046e6fac291d87fa8431f8f9166cb9f86284`
- `HISTORICAL_FAILED_V3_RULE_NONAUTHORITATIVE`: V3's remaining C01 fixed-window failure is historical input only; V5 freezes the exact window literals below and does not modify V3.

### Historical failed preregistration evidence (immutable, not reopened)

| Version | Final commit | Terminal verdict | Notes |
| --- | --- | --- | --- |
| V0 | `bb8696bc74b660ec1ed34f404493bf05035a9b2a` | `TERMINAL_FAIL_CLOSED` | historical semantic source only |
| V1 | `e23ffa8e18c0da2c71da9a7bc6e51d0aff77e6aa` | `TERMINAL_FAIL_CLOSED` | historical semantic source only |
| V2 | `72175b91b39a2a093f12d13abf1e9d9d4f9f9b3f` | `TERMINAL_FAIL_CLOSED` | PR #10, CLOSED, UNMERGED |

V0, V1, and V2 remain byte-for-byte unchanged. V5 does not edit, reopen,
repair, or re-review them. V5 is a new preregistration lineage built on the
same canonical predecessor (`42bc8003b280affc8da0bb484ea9468da32bb656`) that
V0, V1, and V2 were each independently built on.

## V4 predecessor disposition (historical provenance only)

V4 is terminal `PASS_CLOSED` and remains immutable. V5 exists solely because
the separate V4 execution-authorization attempt failed closed on
`BLOCKED_V4_EXECUTION_CONTRACT_IDENTITY_CONFLICT`.

```text
V4_TERMINAL_CANDIDATE = e09ed82e378ae4a04d4988a917851dd9e275be14
V4_FINAL_JSON_SHA256 = f519eaacc31ad050013a145ff7af7cf13983cb3540d4cbf8eccdbe9bf9b4153c
V4_INITIAL_REVIEW_CANDIDATE = 788ec53a42f53c681cfed07ac0af663da5c9b56b
HISTORICAL_REVIEW_CANDIDATE_IS_EXECUTION_AUTHORITY = NO
CLAIM_OCCURRED = NO
WITNESS_CALL_OCCURRED = NO
PROVIDER_OR_RPC_OPERATION_OCCURRED = NO
MEASUREMENT_OCCURRED = NO
WINDOW_CONSUMED = NO
```

Do not reopen, patch, resume, or use either V4 candidate as V5 execution
authority. Historical review identity is recorded only as provenance.

## V5 design decision: what V5 does and does not attempt to prove

V5 does **not** attempt to prove that outcome information is secret. That
line of defense was explored and falsified in scratch feasibility work (see
below) and is abandoned as a design goal.

V5 instead freezes a narrower, mechanically checkable claim:

```text
OUTCOME_KNOWLEDGE_CANNOT_CHANGE_A_VALID_SAMPLE_OR_ERASE_AN_ATTEMPT
```

The security/evidentiary properties that constitute this claim are:

1. Prospective claim
2. Single-shot window
3. Outcome-independent sample
4. Pre-result selected-list commitment
5. No same-window retry
6. No writer handoff
7. Externally witnessed lineage
8. Fail-closed abort/crash
9. Complete failed-attempt visibility

Sections A through G below freeze each of these mechanically. Section H
carries forward the validated V2 sampling repair unchanged. Section I
restates the pre-result sample barrier, now bound to the witnessed lineage.
Sections J through L are unchanged carry-forward, Stage-1 gates, and
authorization boundaries.

## Feasibility evidence (noncanonical supporting evidence)

Three scratch feasibility phases occurred after V2 closed. They are
`NONCANONICAL_SUPPORTING_EVIDENCE`: their bytes are not copied into this
canonical repository at this preregistration phase, because the canonical
bootstrap scope for `PR01_SOURCE_QUALIFICATION_PREREGISTRATION_V5` authorizes
only this Markdown file and its companion JSON. Their SHA-256 digests and
provenance are recorded here instead, and are also recorded machine-readably
in `feasibility_evidence_status` in the JSON.

Passing scratch feasibility bytes are **not** treated as validated canonical
evidence merely by reference; V5 independently freezes its own design and
must independently pass its own hostile review.

### 1. `PR01_BLIND_CENSUS_COMMIT_CAPSULE_FEASIBILITY_V0`

- Terminal: `FEASIBILITY_FAIL`
- Reason: strict precommit transcript byte equality was falsified because
  membership-equivalent worlds with different unrelated chain volume produced
  different aggregate progress telemetry.
- Disposition: `STRICT_NONINTERFERENCE` is **not** carried forward.
- Scratch path: `/tmp/smokestack-blind-census-feasibility-v0`
- SHA-256 digests:
  - `REPORT.md`: `423cafae9dce5ad34890877afa46196bc7a2cff988edb928afe52cb6977c3b50`
  - `feasibility_v0.py`: `715f6d7e4aec19e9f7175928ea910921ff0eddb4accc766abdaccb806ec9cd54`

### 2. `PR01_PRECOMMIT_OUTCOME_BLIND_CONTROL_FEASIBILITY_V0`

- Terminal: `FEASIBILITY_FAIL`
- Reason: claim uniqueness was object-scoped rather than persistent
  window-scoped; the lineage ledger was mutable and omission/truncation could
  not be detected.
- Disposition: the weak claim/ledger implementation is **not** reused.
- Scratch path: `/tmp/smokestack-precommit-control-feasibility-v0`
- SHA-256 digests:
  - `VERDICT.md`: `dcd07b55919a315cc7060c4a7e18ddbdaeb193ad57c2c1e5dcad00738cf2e03f`
  - `capsule.py`: `0d47bc9f49bc8cb5c2f1640a8bb19305263741f47740619c8d5e6b4cafefc30e`
  - `test_capsule.py`: `ee2ed6e4e18be68e430b5c17310afb823e80f8765319af110f3fb70a456b23da`

### 3. `PR01_PROSPECTIVE_CLAIM_AND_LINEAGE_FEASIBILITY_V0`

- Terminal: `FEASIBILITY_PASS`
- Test suite: 51/51 PASS
- Independent hostile review: CRITICAL = 0, HIGH = 0
- Established in a bounded offline model: `WINDOW_CLAIM_KEY` independent of
  `episode_id` and contract revision; SQLite transactional claim uniqueness;
  concurrent duplicate claim rejection; cross-object/cross-process/
  cross-restart rejection; a changed contract cannot reuse a consumed window;
  claim strictly precedes the observation window; data is blocked until a
  witnessed claim exists; append-only hash-chained lineage; separate witness
  persistence/API model; truncation detected; rollback detected;
  failed-episode omission detected; success-only presentation detected; stale
  writer fencing modeled; strategic abort consumes the window; a successor
  uses a new non-overlapping window; the final result binds prior lineage; the
  deterministic sample is invariant to outcome material.
- Two non-scored dependencies from hostile review, both resolved by this V5
  preregistration (Sections D and E below):
  - **D1**: production witness must be instantiated as an actually separate
    process/service and trust domain, not merely same-process API
    discipline.
  - **D2**: fencing-authority-transfer policy was not designed.
- Scratch path: `/tmp/smokestack-pr01-claim-lineage-feasibility-v0`
- SHA-256 digests:
  - `evidence/FEASIBILITY_REPORT.md`: `4e418923652cf4754edfce8729735ceaf93455ec2af283eac5fc299d1f7969e1`
  - `evidence/HOSTILE_REVIEW.md`: `82d7270ed79d109b6de985d14c04d606b7bf27de02722d566b597c70cf689317`
  - `evidence/test_results.json`: `3af14b17073b11741de6a2043f5bc8d2b8aac003ca5169fe718cd8a085f9312c`

## Stage-1 gates (unchanged)

The frozen gates are exactly:

| Gate | Threshold |
| --- | --- |
| Successful parse rate | `>=99.5%` |
| Schema violations | `<=0.5%` |
| Market-legible universe coverage | `>=95%` |
| p95 discovery latency | `<=120 seconds` |
| First-buyer availability | `>=95%` of eligible assets |
| Audited first-buyer identity/order agreement | `>=99%` with direct-chain truth |
| Undocumented semantic shifts | `0` |

No Stage-1 threshold, denominator policy, or fail-closed rule is weakened or
reopened by V5.

## A. Single-shot prospective episode, frozen window

V5 authorizes at most **one** live qualification episode:

```text
MAX_QUALIFICATION_EPISODES = 1
```

The observation window is **frozen by this preregistration**. The four
literal timestamps below are its sole authoritative values; execution state
cannot change them:

```text
WINDOW_START    = 2026-09-21T00:00:00Z
WINDOW_END      = 2026-09-28T00:00:00Z
WINDOW_INTERVAL = [2026-09-21T00:00:00Z, 2026-09-28T00:00:00Z)
CENSUS_CLOSE    = 2026-09-28T00:30:00Z
```

The claim must be authoritatively anchored **strictly before**:

```text
CLAIM_ANCHOR_DEADLINE = 2026-09-20T00:00:00Z
```

Equality fails. If, before that deadline, V5 has not: terminally closed
PASS; bound the actual witness; completed execution authorization; completed
witness `CLAIM_ONCE`; verified the witness receipt; and locally persisted
the claim mirror — then:

```text
V5_LIVE_EPISODE_ELIGIBLE = NO
MEASUREMENT_AUTHORIZED = NO
```

Missing the deadline **terminally blocks this V5 live episode**. A
successor requires a fresh preregistration version and a fresh future
non-overlapping window, while preserving V5 lineage.

## B. Window claim identity — global window namespace

`WINDOW_CLAIM_KEY` no longer depends on `lineage_id`. It is scoped to one
permanent, cross-version namespace:

```text
PR01_WINDOW_NAMESPACE = "smokestack:pr01:source-qualification:solana-mainnet-beta"
```

Timestamps are frozen to exact ASCII/RFC3339 UTC strings, format
`YYYY-MM-DDTHH:MM:SSZ` only — no fractional seconds, no timezone offsets, no
alternate equivalent encoding:

```text
WINDOW_START_STRING = "2026-09-21T00:00:00Z"
WINDOW_END_STRING   = "2026-09-28T00:00:00Z"
```

The exact immutable window object, with no missing, null, or extra members, is:

```json
{
  "namespace": "smokestack:pr01:source-qualification:solana-mainnet-beta",
  "window_start": "2026-09-21T00:00:00Z",
  "window_end": "2026-09-28T00:00:00Z"
}
```

```text
window_claim_preimage = UTF8(RFC8785_JCS(exact_window_object))
computed_window_claim_key = lowercase_hex(SHA256(window_claim_preimage))
computed_window_claim_key = 17dd9ba775784400dd83179e2722a18efc4d5d3f25c75d85b4552da9b949702d
```

This exact formula is authoritative; no "equivalently exact byte contract"
language applies. V5 freezes `SELF_REFERENTIAL_COMMIT_LITERAL_FORBIDDEN = YES`;
no active executable field may contain the eventual V5 Git commit SHA.
`WINDOW_CLAIM_KEY` **must not** depend on `lineage_id`,
`episode_id`, contract version, `contract_digest`, process, machine, writer,
provider, or operator. A consumed `WINDOW_CLAIM_KEY` can never become
unconsumed. A changed contract does not authorize reuse of a consumed
window.

A witness operating under `PR01_WINDOW_NAMESPACE` must reject not only an
exact duplicate `WINDOW_CLAIM_KEY` but any second qualification claim whose
observation interval overlaps a previously consumed interval in that
namespace. A successor cannot evade consumption with a shifted interval that
still overlaps a previously consumed interval; V5 itself has no claim yet.
The `CLAIM_ONCE` request must carry at minimum:

```text
namespace
window_start
window_end
window_claim_key
episode_id
writer_public_key
initial_claim_digest
TERMINAL_CONTRACT_BINDING
```

`TERMINAL_CONTRACT_BINDING` is a schema, not a self-referential literal:

```json
{
  "prereg_contract_id": "PR01_SOURCE_QUALIFICATION_PREREGISTRATION_V5",
  "prereg_terminal_commit": "DEFERRED_TO_EXECUTION_AUTHORIZATION_AFTER_V5_TERMINAL_CLOSURE",
  "prereg_json_sha256": "DEFERRED_TO_EXECUTION_AUTHORIZATION_AFTER_V5_TERMINAL_CLOSURE",
  "prereg_terminal_state": "PASS_CLOSED",
  "execution_authorization_contract_id": "DEFERRED_TO_EXECUTION_AUTHORIZATION_AFTER_V5_TERMINAL_CLOSURE",
  "execution_authorization_terminal_commit": "DEFERRED_TO_EXECUTION_AUTHORIZATION_AFTER_V5_TERMINAL_CLOSURE",
  "execution_authorization_json_sha256": "DEFERRED_TO_EXECUTION_AUTHORIZATION_AFTER_V5_TERMINAL_CLOSURE"
}
```

V5 freezes these seven required members and the later validation contract.
The two fixed values are `prereg_contract_id =
PR01_SOURCE_QUALIFICATION_PREREGISTRATION_V5` and
`prereg_terminal_state = PASS_CLOSED`. The five runtime commit/digest or
later-authorization values remain unpopulated until the separate
execution-authorization phase after terminal V5 closure. No active V5
artifact may contain the eventual V5 Git SHA. `initial_claim_digest` must be
SHA-256 over the complete binding object under
`UTF8(RFC8785_JCS(TERMINAL_CONTRACT_BINDING))`; the witness preserves it and
every later event remains transitively bound through immutable
`EPISODE_BINDING`.

The following identity attacks are explicitly rejected:

- A claim naming the initial broad-review candidate instead of the final V5
  terminal commit.
- A claim naming the V4 terminal candidate instead of the V5 terminal commit.
- A matching preregistration commit paired with a nonmatching JSON digest, or
  a digest taken from another file or version.
- An execution authorization bound to a prerepair authorization candidate.
- Acceptance of a historical review identity merely because it was reviewed.
- A terminal V5 commit SHA hard-coded into the V5 artifact itself.
- An `initial_claim_digest` that omits any member of the complete binding.
- A later witness event detached from the initial claim binding.

The external witness must itself validate the exact timestamp representation,
reconstruct the exact immutable window object, RFC8785/JCS-canonicalize it,
UTF-8 encode it, recompute the lowercase hexadecimal SHA-256 key, and require
the supplied `window_claim_key` to equal that server-recomputed key. It then
evaluates overlap against every previously consumed interval in the permanent
namespace and atomically either rejects or consumes the interval.

Intervals are half-open, `[start, end)`, and overlap exactly when:

```text
max(start_a, start_b) < min(end_a, end_b)
```

The overlap check and successful `CLAIM` append/interval consumption are one
atomic, linearizable witness operation. There is no state in which the witness
acknowledges a claim without a consumed interval registry entry, or consumes
an interval without a discoverable `CLAIM` record. Changing version,
`episode_id`, writer, machine, process, local database, or contract digest
cannot bypass overlap rejection.

## C. Claim order — witness is the global claim authority

The external witness is the cross-machine uniqueness authority. It receives
the exact interval object, the recomputed-key-bearing claim request, and the
episode binding. Exactly one `CLAIM_ONCE` may ever succeed for an overlapping
window in the permanent namespace. A fresh machine, local database,
`episode_id`, contract revision, or writer must not bypass it.

The exact frozen state order is the sole authoritative machine-readable
pre-data order in `execution_shape.evaluation_order`:

```text
V5_TERMINAL_PASS
→ EXECUTION_AUTHORIZATION_BOUND
→ VERIFY_FROZEN_WINDOW_LITERALS
→ VERIFY_TERMINAL_CONTRACT_BINDING
→ CONSTRUCT_EXACT_CLAIM
→ WITNESS_NAMESPACE_GENESIS_BOUND
→ WITNESS_CLAIM_ONCE
→ WITNESS_CLAIM_DURABLY_INCLUDED
→ WITNESS_CLAIM_RECEIPT_VERIFIED
→ LOCAL_DURABLE_CLAIM_MIRROR_WRITTEN
→ COMPUTE_CLAIM_ANCHORED_AT
→ VERIFY_CLAIM_ANCHORED_AT_LT_CLAIM_ANCHOR_DEADLINE
→ APPEND_AND_VERIFY_CLAIM_ANCHORED_EVENT
→ LIVE_EXECUTION_ELIGIBLE
→ APPEND_AND_VERIFY_DATA_STARTED
→ FIRST_PROVIDER_OR_DATA_OPERATION
```

No data/provider/RPC/secret/spend/census operation is permitted before this
sequence completes. In particular, `APPEND_AND_VERIFY_DATA_STARTED` must
succeed before the first provider connection, Solana RPC, census request, or
other live data operation.

- provider connection
- Solana RPC
- secret read
- paid request
- LaserStream
- census
- data-dependent measurement

The authoritative temporal predicate is:

```text
CLAIM_ANCHORED_AT < CLAIM_ANCHOR_DEADLINE
```

If `CLAIM_ANCHORED_AT >= 2026-09-20T00:00:00Z`, exactly
`V5_LIVE_EPISODE_ELIGIBLE = NO` and `MEASUREMENT_AUTHORIZED = NO`. There is
no later V5 window, fallback, next-midnight choice, or recomputation.

`CLAIM_ONCE` succeeds before the local mirror is written. If the local mirror
write fails or the client crashes, `WINDOW_CONSUMED = YES`; the external
witness `CLAIM` remains authoritative and discoverable. A fresh machine must
query and recover that claim and must not create another claim. If witness
state cannot be queried, execution **FAILS CLOSED** and no data starts.

## C-bis. Authoritative claim time

Two independently generated times are required:

1. **`WITNESS_INCLUDED_AT`** — a server-generated timestamp created by the
   external witness at durable `CLAIM_ONCE` inclusion. It must not be
   caller-supplied; it must be cryptographically/receipt-bound to the
   witnessed claim, part of the independently verifiable receipt, and use
   exact UTC RFC3339 representation.
2. **`HOST_RECEIPT_AT`** — captured immediately after successful receipt
   verification, using the already-frozen V1 absolute-UTC-valid host clock
   contract. The host clock must have passed the carried-forward absolute
   UTC preflight.

```text
CLAIM_ANCHORED_AT = max(WITNESS_INCLUDED_AT, HOST_RECEIPT_AT)
```

Both timestamps must individually parse under the exact clock contract.
Required:

```text
CLAIM_ANCHORED_AT < CLAIM_ANCHOR_DEADLINE   (2026-09-20T00:00:00Z)
```

The client may not supply or override `WITNESS_INCLUDED_AT`. An actual
witness implementation is execution-ineligible unless its receipt semantics
prove the timestamp is server-assigned at durable inclusion.

The deadline gate is evaluated after witness receipt verification and before
the witnessed `CLAIM_ANCHORED` append. If the predicate fails, the exact
result is `V5_LIVE_EPISODE_ELIGIBLE = NO` and `MEASUREMENT_AUTHORIZED = NO`;
there is no fallback window or recomputation.

## D. Actual external witness trust boundary (resolves D1)

Future live execution **must not** use an in-process-only witness. Same-
process SQLite is not a production-independent witness. The frozen minimum
witness requirements are:

- separate process/service trust domain;
- separate durable persistence;
- an atomic interval-aware `CLAIM_ONCE` operation as the cross-machine
  uniqueness authority (Section B and Section C);
- append-only normal API;
- runtime qualification credentials have APPEND/READ/VERIFY only;
- runtime credentials have NO delete/rewrite/truncate operation;
- service returns a durable receipt/inclusion identifier;
- `initial_claim_digest` is bound in the witnessed record;
- `window_claim_key` and `writer_public_key` are bound;
- `namespace_genesis_id` and `namespace_genesis_digest` are bound;
- a server-generated `WITNESS_INCLUDED_AT` is bound (Section C-bis);
- witness receipt can later be independently verified;
- local database rollback/truncation is detectable by comparison with the
  witness;
- successful final evidence cannot omit witnessed prior episodes.

The specific production provider/product may remain
`TO_BE_BOUND_BEFORE_EXECUTION` only if V5 contains a hard execution gate:

```text
WITNESS_IMPLEMENTATION_BOUND = YES
```

and tests of the actual configured witness must PASS before:

```text
MEASUREMENT_AUTHORIZED = YES
```

## E. Mechanical no-writer-handoff (resolves D2)

```text
WRITER_HANDOFF_ALLOWED = NO
SAME_WINDOW_RECOVERY_WRITER_ALLOWED = NO
```

This is not policy wording alone — it is mechanically enforced. At
execution start the harness generates one ephemeral signing keypair,
`WRITER_EPHEMERAL_KEYPAIR`:

- the public key is bound into `CLAIM_ONCE`;
- every subsequent witness event for that episode must carry the same
  `writer_public_key`;
- every subsequent event must contain a valid signature made by the
  corresponding private key;
- the witness rejects a changed `writer_public_key`;
- the witness rejects unsigned/invalidly signed transitions;
- the private key is process-ephemeral and **must not** be persisted to
  disk, database, evidence package, environment variable, secret store, or
  witness;
- no key-transfer/recovery protocol exists;
- transparent writer recovery is forbidden.

If the writer process dies and loses its private key, the same episode
cannot produce further valid events. A new writer cannot substitute another
key. The window is already consumed by `CLAIM_ONCE`. Future implementation
tests must prove no supported restart/resume path can append a valid event
using a different writer key. If a fencing value remains, it is not an
authority-transfer mechanism; fencing-authority-transfer policy (lease
timing / quorum) remains explicitly undesigned and out of scope.

Test:

```text
writer A starts
writer A fails
writer B attempts continuation with a new key
=> REJECT
```

Transparent failover is not modeled.

## F. Abort semantics

After claim, `EMERGENCY_ABORT` is permitted for safety. But:

```text
ABORT
=> TERMINAL_ABORT
=> WINDOW_CONSUMED = YES
=> terminal receipt required
=> witness terminal lineage state
=> SOURCE_STACK_QUALIFIED = NO
```

No retry under V5. Because `MAX_QUALIFICATION_EPISODES = 1`, an abort or
execution-invalidating crash ends the V5 live qualification attempt. A new
observation window requires a NEW preregistration lineage/version, using a
new non-overlapping window only, and must preserve V5 failure
evidence. This prevents optional stopping inside V5. Any future PR01
qualification claim MUST use the same permanent `PR01_WINDOW_NAMESPACE` and
`PR01_LINEAGE_NAMESPACE`, and its final verifier must enumerate prior
witnessed attempts, so a future success cannot masquerade as the first
attempt. The permanent namespaces are cross-version protocol constants.

## G. Complete witnessed lineage

The witness is upgraded from a passive receipt sink to the authoritative
external PR01 event log, under one permanent namespace:

```text
PR01_LINEAGE_NAMESPACE = "smokestack:pr01:source-qualification:solana-mainnet-beta"
```

The production witness initializes this permanent namespace with exactly:

```text
CREATE_OR_GET_NAMESPACE_ROOT(
  PR01_LINEAGE_NAMESPACE,
  frozen_genesis_payload
)
```

```json
{
  "namespace": "smokestack:pr01:source-qualification:solana-mainnet-beta",
  "protocol_id": "PR01_SOURCE_QUALIFICATION",
  "canonical_predecessor": "42bc8003b280affc8da0bb484ea9468da32bb656"
}
```

The actual witness must return authenticated `NAMESPACE_GENESIS_ID`,
`NAMESPACE_GENESIS_DIGEST`, `NAMESPACE_GENESIS_RECEIPT`, and
`NAMESPACE_GENESIS_CHECKPOINT`. Their concrete values are
`TO_BE_BOUND_BY_EXECUTION_AUTHORIZATION_BEFORE_CLAIM` because the production
witness is not yet authorized/bound. Their semantics are fixed: an existing
namespace returns the same permanent root, and no later PR01 version may
create another root. Execution authorization must bind all returned values
before `CLAIM_ONCE`.

Every V5 episode event — not merely `CLAIM`/`SAMPLE_COMMITTED`/`TERMINAL_*`
— must be externally witnessed. Frozen canonical event classes:

```text
CLAIM
CLAIM_ANCHORED
DATA_STARTED
CENSUS_CLOSED
SAMPLE_COMMITTED
TERMINAL_PASS
TERMINAL_FAIL
TERMINAL_ABORT
```

Each witness event binds exact: `namespace`, `namespace_genesis_id`,
`namespace_genesis_digest`, `witness_sequence`, `episode_id`,
`window_claim_key`, `initial_claim_digest`, `writer_public_key`, `event_type`,
`payload_digest`, `previous_witness_event_digest`, `event_digest`.

At successful `CLAIM_ONCE`, the witness freezes this immutable episode tuple:

```text
EPISODE_BINDING = {
  namespace_genesis_id,
  namespace_genesis_digest,
  episode_id,
  window_claim_key,
  initial_claim_digest,
  writer_public_key
}
```

The `CLAIM` event establishes it. Every later event for that episode must
contain exactly the same six values; the witness rejects any mismatch and
the final verifier independently asserts equality across the complete
episode. In particular, no later event may change `episode_id`,
`window_claim_key`, `initial_claim_digest`, `writer_public_key`,
`namespace_genesis_id`, or `namespace_genesis_digest`.

The external witness must provide
`CREATE_OR_GET_NAMESPACE_ROOT(namespace, frozen_genesis_payload)`,
`CLAIM_ONCE(exact_window_object, window_claim_key, episode_binding,
TERMINAL_CONTRACT_BINDING)`, `APPEND_EVENT(...)`, `READ_EVENT(...)`,
`LIST_NAMESPACE_FROM_GENESIS(namespace, NAMESPACE_GENESIS_ID)`,
`CURRENT_CHECKPOINT()`, `VERIFY_INCLUSION(...)`, `VERIFY_CONSISTENCY(...)`
— or one exact interface with equivalent required semantics:

- globally monotone `witness_sequence` within `PR01_LINEAGE_NAMESPACE`;
- append-only;
- previously acknowledged events cannot disappear;
- independently queryable complete namespace history;
- first returned namespace record is the authenticated genesis/root;
- all subsequent `witness_sequence` values are contiguous under the
  namespace ordering contract;
- no unexplained sequence or event gap;
- signed/authenticated current checkpoint/head;
- inclusion verification for every returned event;
- consistency proof that the current checkpoint extends the pinned genesis
  checkpoint;
- runtime qualification credentials cannot delete/rewrite/truncate history.

A final qualification verifier **must independently query the witness
namespace**. It must not merely verify receipts supplied by the local
process. Final verification algorithm:

1. obtain current authenticated witness checkpoint;
2. enumerate every `PR01_LINEAGE_NAMESPACE` event with
   `LIST_NAMESPACE_FROM_GENESIS(PR01_LINEAGE_NAMESPACE,
   NAMESPACE_GENESIS_ID)`;
3. require the first returned namespace record to be the authenticated pinned
   genesis/root and require contiguous witness sequences with no unexplained
   gap;
4. verify all event inclusion;
5. verify the current checkpoint extends the pinned genesis checkpoint;
6. reject any supplied older/later checkpoint that replaces the pinned
   genesis;
7. reconstruct every claimed/started window and assert exact episode binding;
8. compare against local lineage;
9. reject if any external event/window is absent locally;
10. reject success-only selective presentation;
11. reject history that begins after genesis, any omitted prior event, a
    sequence gap, an inconsistent checkpoint, a namespace-genesis mismatch,
    or local history that omits any externally witnessed event;
12. reject dangling `CLAIM`/`DATA_STARTED` unless represented by a
   terminally invalid/unfinished lineage state;
13. require the current V5 event chain to be complete.

Verification of one supplied receipt is **not** lineage completeness. A
final PASS requires:

```text
LOCAL_LINEAGE_VALID = YES
WITNESS_LINEAGE_VALID = YES
LOCAL_WITNESS_CONSISTENT = YES
NO_WITNESSED_ATTEMPT_OMITTED = YES
```

### G-bis. Exact witness state machine

Legal order for one V5 episode:

```text
CLAIM
→ CLAIM_ANCHORED
→ DATA_STARTED
→ CENSUS_CLOSED
→ SAMPLE_COMMITTED
→ TERMINAL_PASS
```

Alternative terminal paths:

```text
CLAIM → ...any valid prefix... → TERMINAL_FAIL
CLAIM → ...any valid prefix... → TERMINAL_ABORT
```

Once `TERMINAL_*` occurs, no later event is valid: no second
`DATA_STARTED`, no second `SAMPLE_COMMITTED`, no transition backward, no
episode resurrection. The witness service must **reject** illegal
transitions, not merely record them. Every event must bind the exact
authenticated namespace genesis values and exact immutable `EPISODE_BINDING`.
`DATA_STARTED` must be externally appended successfully before the first
provider connection/census request/data operation. `SAMPLE_COMMITTED` must be
externally appended and verified before `AUDIT_SAMPLE_COMMIT_BARRIER = PASS`.

### G-ter. Partial-failure semantics

- **A.** `CLAIM_ONCE` rejects before durable append: no window consumed; no
  data allowed; retry of the same pre-data submission is permitted only
  after an authoritative witness query proves absence.
- **B.** `CLAIM_ONCE` durably appended but the client receives no response:
  window consumed; query/recovery may retrieve the existing receipt; no new
  claim.
- **C.** `CLAIM_ONCE` appended; local mirror fails/crashes: window
  consumed; the episode cannot silently disappear; the external dangling
  `CLAIM` is visible; V5 cannot qualify unless lineage eventually ends in
  an allowed terminal state.
- **D.** `CLAIM_ANCHORED` appended; process crashes: window consumed; no
  second writer; V5 qualification FAIL.
- **E.** `DATA_STARTED` appended; process crashes: window consumed;
  externally visible started attempt; V5 qualification FAIL.

A missing terminal receipt never makes the attempt disappear.

## H. Universe, providers, and receipt clock — carried forward from V2 High-02

V5 carries forward the exact byte-level universe, provider candidate set,
receipt-clock, first-buyer, chain-order, and audit-population semantics
validated in V0/V1/V2 without redesign. `SOLANA_UNIVERSE_CANDIDATE_V0`
remains the Solana mainnet-beta universe of a fungible SPL Token or
Token-2022 non-quote mint in a newly initialized Raydium CPMM pool. Identity
is `(chain_id, mint_address)`; names, symbols, logos, and provider IDs are
not identity. The Raydium program, initialization instructions,
discriminators, quote-mint set, token-program set, seven-day UTC window,
finalized commitment, genesis-inclusive pre-window history, and
first-ever/newly-active semantics are frozen as in the validated V0 repair.
The deliberate separation of census truth and market-state observation, the
non-tautological market-state gate, and the absolute UTC/local
receipt-clock validity contract (`H-01` through the clock interval rules)
are frozen exactly as in V2 and are not reopened. The exact machine-readable
authority for this section is the `universe`, `providers`, `receipt_clock`,
`first_buyer_semantics`, `chain_order`, and `audit_population` paths of the
companion JSON.

The V2 `CENSUS_PRECOMMIT_INFORMATION_FIREWALL_V1` /
`PRECOMMIT_OPAQUE_EVIDENCE_STORE` census-secrecy layer, and its output
allowlist/quarantine/parser-secrecy closure assertions, are **deleted** by
this repair and are not replaced by an equivalent secrecy assertion. V5
does not claim strict census secrecy:

```text
STRICT_PRECOMMIT_NONINTERFERENCE = NOT_CLAIMED
CENSUS_OUTCOME_SECRECY = NOT_REQUIRED
```

V5's defense is instead: an exact prospective window; global claim-once
before the window; a deterministic membership→sample function; sample input
that excludes `FIRST_BUYER`/`DIRECT_CHAIN_AUDIT` results; one consumed
attempt; externally complete lineage; no writer handoff; and a pre-result
selected-list commitment. Census/raw-chain information may be visible;
visibility alone does not invalidate V5. It becomes invalid only if such
information can influence a valid sample, permit window reuse, erase an
attempt, redraw/replace cases, or bypass the commit barrier.

V2 High-02 byte-exact sampling semantics (bare array snapshot, exact
fields/types, canonical identity object, `canonical_asset_identity_bytes`,
RFC8785/JCS, UTF-8, `universe_digest`, selector seed, selector exact byte
preimage, raw SHA-256 ordering, tie break, selected identity array,
commitment schema, `audit_selected_list_digest`) are carried forward
unchanged. V2 High-01's failed information-firewall assertions are not:

```text
V2_H02_BYTE_EXACT_SAMPLING = CARRIED_FORWARD
V2_H01_PRECOMMIT_SECRECY = SUPERSEDED_NOT_CLAIMED
```

## I. Pre-result audit-sample commitment barrier

The V5 hard state/order barrier extends the validated V2 barrier with
`WINDOW_CLAIM_KEY` binding and an externally witnessed `SAMPLE_COMMITTED`
event:

```text
COMPLETE CENSUS
→ prove CENSUS_COMPLETE = YES
→ freeze FINAL ELIGIBLE UNIVERSE
→ canonical universe snapshot
→ universe_digest
→ deterministic sample
→ exact selected-list commitment (binds window_claim_key)
→ durable seal
→ witness SAMPLE_COMMITTED digest
→ verify witness receipt
→ AUDIT_SAMPLE_COMMIT_BARRIER = PASS
```

Only then may `FIRST_BUYER` request/result and `DIRECT_CHAIN_AUDIT`
request/result proceed. This requirement is about result ordering/control,
not census secrecy — no census-information secrecy claim is needed or
attempted. The defense is deterministic selection, a prospective consumed
window, and irreversible/witnessed lineage — exactly the frozen V5 design
decision above. The exact byte-level snapshot schema, canonicalization,
selector construction, tie-break rule, and commitment-object schema are
unchanged from the validated V2 High-02 repair, with the sole addition of
`window_claim_key` as a required commitment-object member. No step can be
skipped, reordered, or satisfied by provider output. After the seal and
witness verification, the selected list and its order are immutable; the
harness must not recompute, replace, redraw, or shrink the sample within the
same qualification episode. The exact machine-readable authority is
`audit_sampling` and `audit_sample_commit_barrier` in the companion JSON.

## J. Carried-forward validated semantics

Preserved without reopening: first-ever/newly-active universe; Raydium
initialization semantics; complete genesis-inclusive census;
completeness/resource fail-closed rules; absolute UTC clock preflight;
sequence-based clock-invalid intervals; one latency datum per eligible
asset; failure-worst p95 semantics; non-tautological `MARKET_STATE` role;
immutable initialization-event retrieval; market-state denominator;
QuickNode role budgets; deterministic request order; `FIRST_BUYER`
semantics; Helius / direct QuickNode role separation; chain ordering; zero
denominators; Stage-1 thresholds. V5 does not broaden into another review of
these closed semantics.

## K. Execution bounds and authorization

Future execution has one discovery connection, ten reconnects, fifteen
minutes of replay per reconnect, twenty Helius history pages per asset,
eight market-state request calls per asset, 50,000 census signature pages,
and 100,000 total QuickNode raw RPC calls. QuickNode accounting is
role-specific:

- census ceiling: 50,000 charged attempts, in newest-to-oldest cursor and
  required-resolution order;
- market-state ceiling: 40,000 charged attempts, with 24 worst-case charged
  attempts reserved per asset (eight request calls plus two retries each),
  and `N * 24 <= 40,000` required before any selective market-state
  execution; and
- direct-audit ceiling: 10,000 charged attempts, in committed selected-list
  order, with 50 worst-case charged attempts reserved per selected case.

These are the frozen role constants: `QUICKNODE_CENSUS_CALL_BUDGET =
50,000`, `QUICKNODE_MARKET_STATE_CALL_BUDGET = 40,000`,
`QUICKNODE_AUDIT_CALL_BUDGET = 10,000`, and `QUICKNODE_GLOBAL_CALL_CEILING =
100,000`. The global ceiling is exactly `100,000 = 50,000 + 40,000 +
10,000`. Two retries are allowed for 408/429/5xx/transport and none for
400/401/403/404/schema errors; 30-second stream and 10-second HTTP timeouts,
raw response hashing, parser identity, and source-level cost accounting
remain frozen.

This preregistration authorizes none of the following:

- live provider execution or source measurement;
- paid provider spend or secret reads;
- Solana RPC calls;
- database or detector startup; or
- PR-02.

The only permitted phase outcome is `PREREGISTERED_NOT_EXECUTED`. It can
never declare `SOURCE_STACK_QUALIFIED`.

A successful V5 preregistration closure is **necessary but not sufficient**
for live execution. After V5 PASS there must still be a separate bounded
execution authorization that binds: the exact V5 terminal commit and exact V5
JSON digest through `TERMINAL_CONTRACT_BINDING`; the exact frozen V5
observation window; the actual external witness
implementation/service identity; a witness health/permission test; the local
durable claim store identity; provider credentials identities without
exposing secrets; provider spend ceilings; host/toolchain identity; and
one-shot episode authority.

## L. Mechanical closure assertions

Before closure, the implementer must verify:

```text
V0_FILES_UNCHANGED = PASS
V1_FILES_UNCHANGED = PASS
V2_FILES_UNCHANGED = PASS
NEW_PREREGISTRATION_LINEAGE_NOT_A_REPAIR = PASS
H01_ABSOLUTE_UTC_PREFLIGHT_FROZEN = PASS
H01_STALE_UTC_SYNC_FAIL_CLOSED = PASS
H02_ONE_LATENCY_DATUM_PER_ELIGIBLE_ASSET = PASS
H02_P95_DENOMINATOR_EQUALS_ELIGIBLE_UNIVERSE = PASS
H02_FAILURES_CANNOT_IMPROVE_P95 = PASS
H03_CLOCK_INTERVAL_BOUNDARIES_FROZEN = PASS
H03_CLOCK_CLASSIFICATION_DETERMINISTIC = PASS
H04_MARKET_STATE_TRIGGER_EVENT_FROZEN = PASS
H04_MARKET_STATE_EXECUTION_ORDER_UNIQUE = PASS
H04_MARKET_STATE_TEMPORAL_FEASIBILITY = PASS
H05_ROLE_SPECIFIC_QUICKNODE_BUDGETS = PASS
H05_SCHEDULER_ORDER_CANNOT_SELECT_CASES = PASS
H05_RESOURCE_EXHAUSTION_FAIL_CLOSED = PASS
H06_RFC8785_JCS_RESTORED = PASS
H06_UNIVERSE_DIGEST_REPRODUCIBLE = PASS
H06_AUDIT_SAMPLE_REPRODUCIBLE = PASS
CARRIED_FORWARD_VALIDATED_SEMANTICS = PASS
ZERO_DENOMINATOR_FAIL_CLOSED = PASS
STAGE1_GATE_IDENTITY = PASS
EXECUTION_RESOURCE_CLOSURE = PASS
AUTHORIZATION_FAIL_CLOSED = PASS
CENSUS_COMPLETE_BEFORE_SAMPLE_COMMIT = PASS
STRICT_PRECOMMIT_NONINTERFERENCE = NOT_CLAIMED
CENSUS_OUTCOME_SECRECY = NOT_REQUIRED
V2_H01_PRECOMMIT_SECRECY = SUPERSEDED_NOT_CLAIMED
V2_H02_BYTE_EXACT_SAMPLING = CARRIED_FORWARD
RFC8785_JCS_UNIVERSE_SNAPSHOT = PASS
AUDIT_SAMPLE_DERIVED_FROM_PRE_RESULT_UNIVERSE_ONLY = PASS
AUDIT_SELECTED_LIST_SCHEMA_FROZEN = PASS
AUDIT_SELECTED_LIST_JCS_FROZEN = PASS
AUDIT_SELECTED_LIST_DIGEST_FROZEN = PASS
AUDIT_SELECTED_LIST_ORDER_FROZEN = PASS
AUDIT_SAMPLE_COMMITTED_PRE_RESULT = PASS
FIRST_BUYER_REQUEST_BLOCKED_BEFORE_SAMPLE_COMMIT = PASS
DIRECT_AUDIT_REQUEST_BLOCKED_BEFORE_SAMPLE_COMMIT = PASS
POST_COMMIT_SAMPLE_MUTATION_FORBIDDEN = PASS
FAILED_SELECTED_CASE_REPLACEMENT_FORBIDDEN = PASS
EVALUATION_ORDER_FROZEN = PASS
R1_AUTHORITATIVE_EXECUTION_ORDER = PASS
R2_INTERVAL_AWARE_CLAIM_ONCE = PASS
R3_PINNED_NAMESPACE_GENESIS = PASS
R4_EPISODE_BINDING = PASS
R5_WITNESS_BEFORE_LOCAL_MIRROR = PASS
R6_STATE_MACHINE_BINDING = PASS
STAGE1_GATES_UNCHANGED = PASS
JSON_DIGEST_MATCH = PASS
MARKDOWN_JSON_SEMANTIC_IDENTITY = PASS
SINGLE_SHOT_EPISODE_FROZEN = PASS
WINDOW_CLAIM_KEY_OUTCOME_INDEPENDENT = PASS
WINDOW_CLAIM_KEY_CONSUMPTION_IRREVERSIBLE = PASS
CLAIM_STRICTLY_PRECEDES_CLAIM_ANCHOR_DEADLINE = PASS
CLAIM_BOUNDARY_EQUALITY_REJECTED = PASS
NO_DATA_DEPENDENT_ACTION_BEFORE_CLAIM_ANCHORED = PASS
EXTERNAL_WITNESS_TRUST_BOUNDARY_SPECIFIED = PASS
EXTERNAL_WITNESS_APPEND_ONLY_CREDENTIAL_SCOPE = PASS
WITNESS_IMPLEMENTATION_BINDING_GATED = PASS
WRITER_HANDOFF_ELIMINATED = PASS
SAME_WINDOW_RECOVERY_WRITER_REJECTED = PASS
ABORT_IS_TERMINAL_AND_CONSUMES_WINDOW = PASS
NO_RETRY_UNDER_V5 = PASS
LINEAGE_EVENT_CLASSES_FROZEN = PASS
LINEAGE_HASH_CHAIN_BOUND = PASS
CRITICAL_EVENTS_EXTERNALLY_WITNESSED = PASS
ALL_LINEAGE_EVENTS_EXTERNALLY_WITNESSED = PASS
FEASIBILITY_EVIDENCE_CLASSIFIED_NONCANONICAL = PASS
FEASIBILITY_EVIDENCE_NOT_SELF_VALIDATING = PASS
WINDOW_FROZEN_NOT_DISCRETIONARY = PASS
WINDOW_NAMESPACE_GLOBAL_NOT_LINEAGE_SCOPED = PASS
WINDOW_CLAIM_KEY_GLOBAL_NAMESPACE_SCOPED = PASS
OVERLAPPING_WINDOW_CLAIM_REJECTED = PASS
WITNESS_IS_GLOBAL_CLAIM_AUTHORITY = PASS
CLAIM_ANCHORED_AT_SERVER_ASSIGNED = PASS
CLAIM_ANCHORED_AT_STRICTLY_BEFORE_DEADLINE = PASS
CLAIM_ONCE_INTERVAL_AWARE = PASS
CLAIM_ONCE_KEY_RECOMPUTED_BY_WITNESS = PASS
CLAIM_ONCE_OVERLAP_CHECK_LINEARIZABLE = PASS
LOCAL_CLAIM_IS_MIRROR_ONLY = PASS
NAMESPACE_GENESIS_PERMANENT = PASS
NAMESPACE_GENESIS_VALUES_BOUND_BEFORE_CLAIM = PASS
EPISODE_BINDING_CONSTANT_ACROSS_EVENTS = PASS
SEQUENCE_CONTIGUITY_AND_GENESIS_INCLUSIVE = PASS
WITNESS_STATE_MACHINE_ILLEGAL_TRANSITIONS_REJECTED = PASS
PARTIAL_FAILURE_SEMANTICS_FROZEN = PASS
WRITER_EPHEMERAL_KEYPAIR_BOUND = PASS
WRITER_KEY_SUBSTITUTION_REJECTED = PASS
SUCCESSOR_NAMESPACE_ENUMERATION_REQUIRED = PASS
```

No V0, V1, V2, or V4 filename is modified. V4 remains immutable and is not reopened. The exact JSON bytes are the
machine-readable authority; this Markdown records the same frozen values and
its recorded digest must match the computed SHA-256 before commit.

### Mechanical falsification requirements

These are the required falsification checks a future implementation test
suite must include (`mechanical_falsification_requirements` in the
companion JSON); no new test file is in the authorized repair scope for
this preregistration artifact, so they are frozen here declaratively:

1. an authoritative execution array containing a dynamic-window resolver is
   rejected; only the frozen R1 array is valid.
2. `CLAIM_ANCHORED_AT` equal to or later than the deadline but earlier than
   `WINDOW_START` is rejected.
3. reaching `LIVE_EXECUTION_ELIGIBLE` without an explicit deadline gate is
   rejected.
4. a `CLAIM_ONCE` request carrying only a supplied window key is rejected;
   the exact interval and all required identity fields are required.
5. a supplied key differing from the witness's canonical interval
   recomputation is rejected.
6. an overlapping shifted interval is rejected under half-open interval
   semantics.
7. interval consumption without a discoverable `CLAIM`, or a `CLAIM`
   acknowledgement without interval consumption, is rejected.
8. final enumeration from a caller-selected later sequence is rejected; it
   must begin from the pinned namespace genesis.
9. final enumeration that begins after namespace genesis is rejected.
10. a witness history with a sequence or event gap is rejected.
11. a successor success presented without an earlier V5 failure is rejected
    by complete permanent-namespace enumeration.
12. changing `window_claim_key` after `CLAIM` is rejected.
13. changing `episode_id` after `CLAIM` is rejected.
14. changing `initial_claim_digest` after `CLAIM` is rejected.
15. changing `writer_public_key` after `CLAIM` is rejected.
16. writing the local claim mirror before witness `CLAIM_ONCE` is rejected.
17. a fresh machine creating a new claim after witness success and a local
    mirror crash is rejected.
18. `DATA_STARTED` before witness verification is rejected.
19. any R1–R6 semantic disagreement between Markdown and JSON is rejected.
20. any active historical broad-review attack path is rejected.
21. dynamic-window selection or recomputation is rejected.
22. resurrection of the superseded V2 secrecy requirement is rejected.
23. `FIRST_BUYER` or `DIRECT_CHAIN_AUDIT` before witnessed
    `SAMPLE_COMMITTED` is rejected by the pre-result barrier.
24. alternate H-02 sampling bytes or order are rejected.

## Phase result

```text
STATE = PREREGISTERED_NOT_EXECUTED
MEASUREMENT_AUTHORIZED = NO
SOURCE_STACK_QUALIFIED = NO
LIVE_PROVIDER_EXECUTION = NO
SOURCE_MEASUREMENT_RUN = NO
SECRET_READ = NO
SOLANA_RPC_CALL = NO
PAID_PROVIDER_SPEND = NO
DATABASE_STARTED = NO
DETECTOR_STARTED = NO
PR02_STARTED = NO
```

Next gate: `PR01_PREREG_V5_INDEPENDENT_BROAD_HOSTILE_REVIEW`.

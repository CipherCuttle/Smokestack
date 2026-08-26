# PR-01 Source Qualification Preregistration V3

## Frozen identity and state

- Phase: `PR01_SOURCE_QUALIFICATION_PREREGISTRATION_V3`
- Lineage kind: `NEW_PREREGISTRATION_LINEAGE` — this is a fresh canonical
  preregistration lineage, not a continuation or repair of V2, not another
  feasibility experiment, not live measurement, not provider execution, and
  not PR-02.
- State: `PREREGISTERED_NOT_EXECUTED`
- Canonical predecessor: `42bc8003b280affc8da0bb484ea9468da32bb656`
- `MEASUREMENT_AUTHORIZED = NO`
- `SOURCE_STACK_QUALIFIED = NO`
- `LIVE_PROVIDER_EXECUTION_AUTHORIZED = NO`
- `PR02 = NOT_STARTED`
- Exact JSON: [`experiments/qualification/pr01-source-qualification-prereg-v3.json`](../experiments/qualification/pr01-source-qualification-prereg-v3.json)
- JSON SHA-256: `47de6e6976b8357c50c42f289b5fea11f84ddda9ad13696bead22f898deae5b5`

### Historical failed preregistration evidence (immutable, not reopened)

| Version | Final commit | Terminal verdict | Notes |
| --- | --- | --- | --- |
| V0 | `bb8696bc74b660ec1ed34f404493bf05035a9b2a` | `TERMINAL_FAIL_CLOSED` | historical semantic source only |
| V1 | `e23ffa8e18c0da2c71da9a7bc6e51d0aff77e6aa` | `TERMINAL_FAIL_CLOSED` | historical semantic source only |
| V2 | `72175b91b39a2a093f12d13abf1e9d9d4f9f9b3f` | `TERMINAL_FAIL_CLOSED` | PR #10, CLOSED, UNMERGED |

V0, V1, and V2 remain byte-for-byte unchanged. V3 does not edit, reopen,
repair, or re-review them. V3 is a new preregistration lineage built on the
same canonical predecessor (`42bc8003b280affc8da0bb484ea9468da32bb656`) that
V0, V1, and V2 were each independently built on.

## V3 design decision: what V3 does and does not attempt to prove

V3 does **not** attempt to prove that outcome information is secret. That
line of defense was explored and falsified in scratch feasibility work (see
below) and is abandoned as a design goal.

V3 instead freezes a narrower, mechanically checkable claim:

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
bootstrap scope for `PR01_SOURCE_QUALIFICATION_PREREGISTRATION_V3` authorizes
only this Markdown file and its companion JSON. Their SHA-256 digests and
provenance are recorded here instead, and are also recorded machine-readably
in `feasibility_evidence_status` in the JSON.

Passing scratch feasibility bytes are **not** treated as validated canonical
evidence merely by reference; V3 independently freezes its own design and
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
  uses a new future window; the final result binds prior lineage; the
  deterministic sample is invariant to outcome material.
- Two non-scored dependencies from hostile review, both resolved by this V3
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
reopened by V3.

## A. Single-shot prospective episode

V3 authorizes at most **one** live qualification episode:

```text
MAX_QUALIFICATION_EPISODES = 1
```

The exact observation window must be deterministically resolved before
claim, using the prospective rule:

```text
WINDOW_START =
  first UTC midnight satisfying BOTH:
  - it is strictly after V3 terminal PASS/closure; and
  - enough pre-window time exists to complete the external claim/witness
    procedure

WINDOW_DURATION = 7x24h
CENSUS_CLOSE = WINDOW_END + 30 minutes
```

A retrospective window is never silently chosen. The exact concrete
`WINDOW_START`, `WINDOW_END`, and `CENSUS_CLOSE` timestamps must be durably
bound before execution authority is released; this preregistration does not
itself bind them, because `MEASUREMENT_AUTHORIZED = NO` at this phase.

## B. Window claim identity

```text
WINDOW_CLAIM_KEY =
  SHA256(
    JCS({
      lineage_id,
      window_start,
      window_end
    })
  )
```

or an equivalently exact byte contract. `WINDOW_CLAIM_KEY` **must not**
depend on `episode_id`, process, PID, contract revision, operator, or
provider outcome. A consumed `WINDOW_CLAIM_KEY` can never become unconsumed.
A changed contract does not authorize reuse of a consumed window.

## C. Claim order

The exact frozen state order is:

```text
V3_CLOSED_PASS
→ resolve exact future window
→ build exact claim object
→ durable local claim transaction
→ external witness submission
→ external witness inclusion/receipt verification
→ CLAIM_ANCHORED = YES
→ verify CLAIM_ANCHORED_AT < WINDOW_START
→ LIVE_EXECUTION_ELIGIBLE
```

None of the following is permitted before `CLAIM_ANCHORED = YES`:

- provider connection
- Solana RPC
- secret read
- paid request
- LaserStream
- census
- data-dependent measurement

Boundary equality fails:

```text
CLAIM_ANCHORED_AT == WINDOW_START  =>  INVALID / execution forbidden
```

## D. Actual external witness trust boundary (resolves D1)

Future live execution **must not** use an in-process-only witness. Same-
process SQLite is not a production-independent witness. The frozen minimum
witness requirements are:

- separate process/service trust domain;
- separate durable persistence;
- append-only normal API;
- runtime qualification credentials have APPEND/READ/VERIFY only;
- runtime credentials have NO delete/rewrite/truncate operation;
- service returns a durable receipt/inclusion identifier;
- `claim_digest` is bound in the witnessed record;
- `lineage_id` is bound;
- observed inclusion/witness time is bound;
- witness receipt can later be independently verified;
- local database rollback/truncation is detectable by comparison with the
  witness;
- successful final evidence cannot omit witnessed prior episodes.

The specific production provider/product may remain
`TO_BE_BOUND_BEFORE_EXECUTION` only if V3 contains a hard execution gate:

```text
WITNESS_IMPLEMENTATION_BOUND = YES
```

and tests of the actual configured witness must PASS before:

```text
MEASUREMENT_AUTHORIZED = YES
```

## E. Remove fencing transfer complexity (resolves D2)

```text
WRITER_HANDOFF_ALLOWED = NO
SAME_WINDOW_RECOVERY_WRITER_ALLOWED = NO
```

One episode has one writer authority. If that writer crashes, loses its
local claim lease/authority, is killed, is manually aborted, becomes stale,
or cannot continue safely, then:

```text
EPISODE_STATE = TERMINAL_FAIL_CLOSED
WINDOW_CONSUMED = YES
```

No second writer may resume that qualification window. This eliminates the
need for a lease-transfer/quorum protocol. A fencing token may still be used
to reject stale/concurrent writes, but no new fencing token may authorize
continuation of the same live episode after writer failure.

Test:

```text
writer A starts
writer A fails
writer B attempts continuation
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

No retry under V3. Because `MAX_QUALIFICATION_EPISODES = 1`, an abort or
execution-invalidating crash ends the V3 live qualification attempt. A new
observation window requires a NEW preregistration lineage/version and must
preserve V3 failure evidence. This prevents optional stopping inside V3.

## G. Lineage

Frozen canonical event classes:

```text
CLAIM
CLAIM_WITNESSED
DATA_STARTED
CENSUS_CLOSED
SAMPLE_COMMITTED
TERMINAL_PASS
TERMINAL_FAIL
TERMINAL_ABORT
```

Every lineage event binds: `lineage_id`, `sequence`, `episode_id`,
`window_claim_key`, `event_type`, `payload_digest`, `previous_event_digest`,
`event_digest`.

Critical events externally witnessed at minimum: `CLAIM`,
`SAMPLE_COMMITTED`, and every `TERMINAL_*` event.

A final PASS requires:

```text
LOCAL_LINEAGE_VALID = YES
WITNESS_LINEAGE_VALID = YES
LOCAL_WITNESS_CONSISTENT = YES
NO_WITNESSED_ATTEMPT_OMITTED = YES
```

## H. Universe, providers, and receipt clock — carried forward from V2 High-02

V3 carries forward the exact byte-level universe, provider candidate set,
receipt-clock, first-buyer, chain-order, and audit-population semantics
validated in V0/V1/V2 without redesign. `SOLANA_UNIVERSE_CANDIDATE_V0`
remains the Solana mainnet-beta universe of a fungible SPL Token or
Token-2022 non-quote mint in a newly initialized Raydium CPMM pool. Identity
is `(chain_id, mint_address)`; names, symbols, logos, and provider IDs are
not identity. The Raydium program, initialization instructions,
discriminators, quote-mint set, token-program set, seven-day UTC window,
finalized commitment, genesis-inclusive pre-window history, and
first-ever/newly-active semantics are frozen as in the validated V0 repair.
The precommit census information firewall, the deliberate separation of
census truth and market-state observation, the non-tautological market-state
gate, and the absolute UTC/local receipt-clock validity contract (`H-01`
through the clock interval rules) are frozen exactly as in V2 and are not
reopened. The exact machine-readable authority for this section is the
`universe`, `providers`, `receipt_clock`, `first_buyer_semantics`,
`chain_order`, and `audit_population` paths of the companion JSON.

## I. Pre-result audit-sample commitment barrier

The V3 hard state/order barrier extends the validated V2 barrier with
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
request/result proceed. No census-information secrecy claim is needed or
attempted. The defense is deterministic selection, a prospective consumed
window, and irreversible/witnessed lineage — exactly the frozen V3 design
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
denominators; Stage-1 thresholds. V3 does not broaden into another review of
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

A successful V3 preregistration closure is **necessary but not sufficient**
for live execution. After V3 PASS there must still be a separate bounded
execution authorization that binds: the exact V3 candidate digest; the exact
future observation window; the actual external witness
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
CENSUS_PRECOMMIT_INFORMATION_FIREWALL = PASS
CENSUS_SELECTION_VIEW_ALLOWLIST_FROZEN = PASS
CENSUS_RAW_RESPONSE_PRECOMMIT_OPAQUE = PASS
FIRST_BUYER_OUTCOME_VISIBLE_PRECOMMIT = NO
DIRECT_AUDIT_OUTCOME_VISIBLE_PRECOMMIT = NO
PRECOMMIT_OUTCOME_LEAK_FAIL_CLOSED = PASS
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
STAGE1_GATES_UNCHANGED = PASS
JSON_DIGEST_MATCH = PASS
MARKDOWN_JSON_SEMANTIC_IDENTITY = PASS
SINGLE_SHOT_EPISODE_FROZEN = PASS
WINDOW_CLAIM_KEY_OUTCOME_INDEPENDENT = PASS
WINDOW_CLAIM_KEY_CONSUMPTION_IRREVERSIBLE = PASS
CLAIM_STRICTLY_PRECEDES_WINDOW_START = PASS
CLAIM_BOUNDARY_EQUALITY_REJECTED = PASS
NO_DATA_DEPENDENT_ACTION_BEFORE_CLAIM_ANCHORED = PASS
EXTERNAL_WITNESS_TRUST_BOUNDARY_SPECIFIED = PASS
EXTERNAL_WITNESS_APPEND_ONLY_CREDENTIAL_SCOPE = PASS
WITNESS_IMPLEMENTATION_BINDING_GATED = PASS
WRITER_HANDOFF_ELIMINATED = PASS
SAME_WINDOW_RECOVERY_WRITER_REJECTED = PASS
ABORT_IS_TERMINAL_AND_CONSUMES_WINDOW = PASS
NO_RETRY_UNDER_V3 = PASS
LINEAGE_EVENT_CLASSES_FROZEN = PASS
LINEAGE_HASH_CHAIN_BOUND = PASS
CRITICAL_EVENTS_EXTERNALLY_WITNESSED = PASS
FEASIBILITY_EVIDENCE_CLASSIFIED_NONCANONICAL = PASS
FEASIBILITY_EVIDENCE_NOT_SELF_VALIDATING = PASS
```

No V0, V1, or V2 filename is modified. The exact JSON bytes are the
machine-readable authority; this Markdown records the same frozen values and
its recorded digest must match the computed SHA-256 before commit.

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

Next gate: `PR01_PREREG_V3_INDEPENDENT_BROAD_HOSTILE_REVIEW`.

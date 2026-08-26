# PR-01 Source Qualification Preregistration V2

## Frozen identity and state

- Phase: `PR01_SOURCE_QUALIFICATION_PREREGISTRATION_V2`
- State: `PREREGISTERED_NOT_EXECUTED`
- Canonical predecessor: `42bc8003b280affc8da0bb484ea9468da32bb656`
- `SUPERSEDES_FAILED_V0 = bb8696bc74b660ec1ed34f404493bf05035a9b2a`
- `V0_TERMINAL_VERDICT = TERMINAL_FAIL_CLOSED`
- `MEASUREMENT_AUTHORIZED = NO`
- `SOURCE_STACK_QUALIFIED = NO`
- `LIVE_PROVIDER_EXECUTION_AUTHORIZED = NO`
- `PR02 = NOT_STARTED`
- Historical semantic source only: `e23ffa8e18c0da2c71da9a7bc6e51d0aff77e6aa`
- Exact JSON: [`experiments/qualification/pr01-source-qualification-prereg-v2.json`](../experiments/qualification/pr01-source-qualification-prereg-v2.json)
- JSON SHA-256: `18d53fcc0c6818ca90658aebaa532231e8ed56414480900466810370a2af4c44`

This is a new immutable V2 preregistration. V0 remains terminally failed and is
not edited, reopened, repaired, or re-reviewed. V2 carries forward the exact
repaired V1 semantics that survived targeted rereview and fixes the sole
remaining V1 High: the exact deterministic direct-chain audit selected list
must be canonicalized, hashed, and durably committed before any first-buyer or
direct-chain-audit request or corresponding result retrieval/inspection. V1 is
historical semantic source only; it is not the V2 Git base.

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

No Stage-1 threshold, denominator policy, or fail-closed rule is weakened.

## 1. Universe and census truth

`SOLANA_UNIVERSE_CANDIDATE_V0` remains the Solana mainnet-beta universe of a
fungible SPL Token or Token-2022 non-quote mint in a newly initialized Raydium
CPMM pool. Identity is `(chain_id, mint_address)`; names, symbols, logos, and
provider IDs are not identity. The Raydium program, initialization
instructions, discriminators, quote-mint set, token-program set, seven-day
UTC window, finalized commitment, genesis-inclusive pre-window history, and
first-ever/newly-active semantics are frozen as in the validated V0 repair.

The complete chain-native census enumerates the frozen Raydium program history
from slot 0 through census close, paginates newest-to-oldest, resolves every
required finalized signature/block/transaction primitive, checks prior history,
and fails closed on gaps, pruning, null required primitives, malformed data,
timeouts, rate limits, or resource ceilings before closure. No absence is
treated as exclusion or as a smaller denominator.

### Deliberate separation of census truth and market-state observation

The census establishes only `membership_evidence`:

- finalized successful CPMM initialization signature, slot, block transaction
  index, instruction path, frozen discriminator, pool identity, canonical mint
  pair, single non-quote mint, and positive initialization amounts;
- first qualifying initialization for that mint is inside the window; and
- complete history proves that first-ever/newly-active rule.

The census does not require a successful `MARKET_STATE` request, response,
hash, or field validation. This is the independent denominator truth.

An otherwise eligible asset is never removed because its market-state request
is `UNAVAILABLE`, `MALFORMED`, `TIMEOUT`, `UNSUPPORTED`, late, or otherwise
invalid. It remains an eligible universe member and counts in the market-state
denominator.

## 2. Provider candidate set

The carried-forward candidates are Helius LaserStream discovery, Helius
Enhanced Transactions V1 first-buyer, and QuickNode raw JSON-RPC direct-chain
audit. Their source roles, first-buyer semantics, chain ordering, audit
population, deterministic sample (`min(200,N)` without replacement), raw
evidence, retry ceilings, and cost accounting are unchanged from validated V0
semantics. No credentials, provider calls, or spend are authorized.

### V2 market-state candidate (carried-forward V1 semantics)

`MARKET_STATE_CANDIDATE = QUICKNODE_SOLANA_MAINNET_RPC_MARKET_STATE_V1`.

This is Option B: a separately scheduled chain observation operation, not a
rename of census evidence. The contract distinguishes
`CANDIDATE_EVENT_KNOWLEDGE_AT` (first complete evidence for an event that may
later qualify) from `FINAL_ELIGIBILITY_CONFIRMED_AT` (the sealed result after
the complete census, genesis-inclusive history proof, window closure, and
outcome-independent membership ledger).

After `FINAL_ELIGIBILITY_CONFIRMED_AT`, the harness issues one independent
bounded raw finalized JSON-RPC request sequence (`getTransaction`/`getBlock`
plus the required event evidence) for every final eligible member in ascending
`(chain_id, mint_address)` order. The census response is never reused or
counted as market-state success. Because the request is addressed to immutable
finalized initialization evidence, later retrieval remains point-in-time valid:
`source_event_at` is the initialization event time and
`market_state_fetched_at` is the later retrieval time. This operation claims
ability to retrieve and represent frozen event-time state, not contemporaneous
30-second notification latency. The operation may share QuickNode
infrastructure with the census and direct audit; that shared backend is
disclosed and no source independence claim is made for MARKET_STATE.

`AVAILABLE` requires all of these exact initialization-time fields:

1. pool account bound by the initialization instruction;
2. canonical non-quote mint and token-program identity;
3. fixed-set quote mint;
4. both vault accounts bound by the initialization instruction;
5. both strictly positive initialization amounts;
6. decoded `INITIALIZE_OPEN_TIME_ARGUMENT`;
7. known zero-initialized PoolState status under the pinned Raydium source
   semantics; and
8. finalized signature, slot, block transaction index, discriminator,
   instruction path, and non-null `blockTime` binding.

The request observes the initialization event at its finalized slot. It does
not claim that a later current PoolState snapshot describes the past. Later
mutable PoolState, current price, volume, returns, survival, attention, and
other future outcomes are prohibited. Each raw response is hashed and bound to
source, schema, parser, request, and `fetched_at` metadata.

The provider documentation supports the method/response capability, but
availability, completeness, schema drift, latency, cost, and retention terms
remain `UNKNOWN_TO_BE_MEASURED`. Documented sources include Solana
`getBlock`, `getTransaction`, JSON structures, Raydium CPMM documentation,
and QuickNode’s Solana API overview.

## 3. Non-tautological market-state gate

`MARKET_STATE_DENOMINATOR` is **all eligible universe members in the closed
complete census**, not only responders. The metric is:

```text
market_legible_universe_coverage =
  count(valid AVAILABLE MARKET_STATE observations)
  / count(eligible universe members)
```

`UNAVAILABLE`, `MALFORMED`, `TIMEOUT`, `UNSUPPORTED`, late, invalid, and
request-failure cases remain visible in the denominator and are not numerator
success. A zero denominator is `NOT_REPORTABLE` and cannot pass. Therefore
coverage cannot become 100% merely because an asset entered the universe.

The market-state fields are initialization-time observables, not later outcome
variables: pool identity, canonical mint/token program, quote mint, vault
identities, positive initialization amounts, initialization open-time
argument, initial status, and finalized event binding. Each field has a
defined valid representation; missing, malformed, unsupported, or unavailable
values classify the operation as a failure state rather than removing its
asset.

## 4. Absolute UTC and local receipt-clock validity contract

`RECEIPT_CLOCK_VALIDITY_FROZEN = YES` and the machine-readable contract ID is
`V1_RECEIPT_CLOCK_V1`.

The contract distinguishes the four domains
`CHAIN_EVENT_TIME`, `HOST_WALL_RECEIPT_UTC`, `HOST_MONOTONIC_RECEIPT`, and
`WALL_MONOTONIC_OFFSET`.

### H-01 absolute UTC preflight

Before the qualification run, and throughout it, the host must establish
trusted absolute UTC health. The frozen implementation-independent contract is:

- `UTC_TIME_SOURCE_IDENTITY = HOST_TRUSTED_TIME_SYNCHRONIZATION_SERVICE_CHRONY`;
- `UTC_SYNC_MEASUREMENT_METHOD` reads the active chrony tracking state and
  validated synchronized-source state, recording the signed local-wall-minus-
  trusted-UTC offset and a conservative error bound including synchronization
  uncertainty, root dispersion, and half root delay;
- `ABSOLUTE_UTC_OFFSET_ESTIMATE` is that signed offset in seconds;
- `ABSOLUTE_UTC_ERROR_BOUND` is the non-negative conservative upper error bound
  in seconds; and
- `UTC_SYNC_OBSERVED_AT` is the host UTC timestamp captured with the measurement
  and its monotonic sample.

The concrete bound is `MAX_ABSOLUTE_UTC_ERROR = 0.25 seconds`. At start and at
every continuing health check, the required conservative test is:

```text
abs(ABSOLUTE_UTC_OFFSET_ESTIMATE) + ABSOLUTE_UTC_ERROR_BOUND <= 0.25 seconds
```

The maximum sync age is 60 seconds by monotonic time, with a 60-second health
check cadence. A missing, stale, unsynchronized, leap-invalid, or over-bound
measurement fails closed; local wall time is never used as a fallback. This
absolute UTC contract is separate from the local wall-vs-monotonic
discontinuity contract below.

If trusted UTC state cannot be established:

```text
CLOCK_PREFLIGHT = FAIL
LATENCY_PACKET_VALID = NO
DISCOVERY_LATENCY_GATE = NOT_REPORTABLE_INVALID_CLOCK
SOURCE_STACK_QUALIFIED = NO
```

At qualification start, synchronously bind `wall_start_utc` and
`mono_start_ns`. At each live first-observation callback entry, without an
`await` or blocking operation, synchronously bind `wall_received_utc` and
`mono_received_ns`. Define:

```text
predicted_wall_received_utc =
  wall_start_utc + (mono_received_ns - mono_start_ns)
```

The frozen tolerance is `CLOCK_SKEW_TOLERANCE = 0.25 seconds`. This bounds
clock error below 0.21% of the 120-second gate while retaining sub-second
freshness resolution. Every observation must satisfy:

- `mono_received_ns >= mono_start_ns`;
- absolute wall/predicted-wall divergence `<= 0.25 seconds`;
- non-null finite `source_event_at`; and
- `discovery_latency_seconds = wall_received_utc - source_event_at >= 0`.

Negative finite latency is `INVALID_CLOCK`; it is never clamped to zero and
never counts as valid successful latency.

Integrity checkpoints are captured at process start, every 100 ms on a
monotonic schedule, before and after each receipt batch where batching exists,
and at finalization. Every checkpoint and receipt sample has `monotonic_ns` and
a process-local strictly increasing `clock_sample_sequence`; sequence 1 is the
start checkpoint, and the sequence is assigned synchronously before any later
sample. Receipt capture occurs at callback entry, before parsing, awaiting, or
blocking. The first checkpoint has no predecessor and creates no invalid
interval.

For consecutive checkpoints `C[i-1]` and `C[i]`, if

```text
abs(offset(C[i]) - offset(C[i-1])) > 0.25 seconds
```

then exactly these receipt observations are `INVALID_CLOCK`:

```text
C[i-1].clock_sample_sequence < R.clock_sample_sequence
  <= C[i].clock_sample_sequence
```

The comparison is strictly greater-than: equality at 250 ms does not trigger
an interval, the lower sequence boundary is excluded, and the upper boundary
is included. The final checkpoint is captured after the last receipt and
applies through its sequence. Each discontinuity interval is retained; the
union handles consecutive or overlapping intervals. A receipt's own
wall/monotonic divergence check independently invalidates that receipt. There
is no start/end-only recalibration, and an unobserved sub-cadence step cannot
be promoted to a valid latency. Given the same ordered samples, source event
times, tolerance, and UTC-health samples, faithful implementations produce the
same classifications.

Every eligible universe member receives exactly one discovery-latency datum:

```text
{ "kind": "FINITE", "seconds": <non-negative finite number> }
{ "kind": "FAILURE_INFINITY", "reason": <frozen failure classification> }
```

Every `FINITE` value orders below `FAILURE_INFINITY`. Only
`LIVE_FIRST_OBSERVATION` with passing absolute UTC preflight, valid local
receipt-clock classification, and non-null finite `source_event_at` receives
the first form. Replay/recovery, duplicates, late, timeout, unavailable,
malformed, unsupported, invalid-clock, missing-event-time, and clock-preflight
failures receive the second form and are never omitted. A packet-wide absolute
clock failure is `NOT_REPORTABLE_INVALID_CLOCK`, not a successful p95.

For `N = count(all eligible universe members)`, the p95 order statistic sorts
all `N` tagged datums—not only finite successes—and uses
`sorted_latency[ceil(0.95*N)-1]`. `N = 0` is `NOT_REPORTABLE` and cannot pass.
Because `FAILURE_INFINITY` is worse than every finite value, failures cannot
improve p95.

## 5. Pre-result audit-sample commitment barrier

The V2 hard state/order barrier is frozen as follows:

~~~text
COMPLETE CENSUS
→ prove CENSUS_COMPLETE = YES
→ freeze FINAL ELIGIBLE UNIVERSE
→ build exact audit universe snapshot
→ RFC8785/JCS canonicalize
→ SHA-256 universe_digest
→ deterministically derive sample size min(200,N)
→ deterministically derive exact ordered selected list
→ build selected-list commitment object
→ RFC8785/JCS canonicalize selected-list object
→ SHA-256 audit_selected_list_digest
→ DURABLY SEAL COMMITMENT
→ prove AUDIT_SAMPLE_COMMIT_BARRIER = PASS
~~~

No step can be skipped, reordered, or satisfied by provider output. The
snapshot is built only from the complete outcome-independent census after
CENSUS_COMPLETE = YES has been proven and FINAL_ELIGIBLE_UNIVERSE has been
frozen. The universe snapshot uses the exact V1 field contract and
RFC8785 / JSON Canonicalization Scheme (JCS) UTF-8 bytes. Its universe_digest
is SHA-256 over those bytes.

The sample size is exactly min(200,N). The carried-forward seed is
smokestack:pr01:source-qualification:audit-v1. For each canonical asset
identity, the selector is:

~~~text
SHA256(seed + '|' + universe_digest + '|' + canonical_asset_identity)
~~~

The concatenation is UTF-8 encoded. Unsigned hexadecimal scores are sorted
ascending; equal scores are ordered by canonical asset identity in ascending
bytewise UTF-8 order. The first min(200,N) identities form the exact ordered
selected list, without replacement. The selected list has no discretionary
replacement, redraw, or shrinkage rule.

The selected-list commitment object is frozen to exactly these members:

~~~json
{
  "contract_id": "PR01_SOURCE_QUALIFICATION_PREREGISTRATION_V2",
  "canonical_predecessor": "42bc8003b280affc8da0bb484ea9468da32bb656",
  "universe_digest": "<64 lowercase hexadecimal SHA-256 digest>",
  "sample_size": "<integer equal to min(200,N)>",
  "selector_seed": "smokestack:pr01:source-qualification:audit-v1",
  "selected_asset_identities": "<exact ordered array of unique {chain_id,mint_address} objects>"
}
~~~

The commitment object has no extra members. It is RFC8785/JCS
canonicalized as UTF-8, and audit_selected_list_digest is SHA-256 of those
canonical bytes. The digest binds the canonical predecessor, universe digest,
sample size, carried-forward selector seed, and exact ordered selected
identities.

DURABLY SEAL COMMITMENT means durably persisting the exact canonical
commitment-object bytes, digest, and seal metadata as one append-only
qualification evidence record before emitting AUDIT_SAMPLE_COMMIT_BARRIER =
PASS. Barrier PASS requires exact durable read-back byte equality and digest
equality; a missing, partial, changed, or unreadable seal is failure. This is a
future execution contract and authorizes no request, credential read, spend, or
provider measurement during preregistration.

Only after AUDIT_SAMPLE_COMMIT_BARRIER = PASS may the harness start
FIRST_BUYER_REQUEST_STARTED, retrieve or inspect a first-buyer result, start
DIRECT_CHAIN_AUDIT_REQUEST_STARTED, or retrieve or inspect a direct-chain
result. These are hard invariants:

~~~text
AUDIT_SAMPLE_COMMITTED_PRE_RESULT = YES
FIRST_BUYER_REQUEST_BLOCKED_BEFORE_SAMPLE_COMMIT = YES
DIRECT_AUDIT_REQUEST_BLOCKED_BEFORE_SAMPLE_COMMIT = YES
AUDIT_SAMPLE_MUTABLE_AFTER_COMMIT = NO
FAILED_SELECTED_CASE_REPLACEMENT_FORBIDDEN = YES
~~~

After the seal, the selected list and its order are immutable. If later
evidence invalidates the committed underlying universe or shows that the
snapshot was not complete, PACKET_VALID = NO and SOURCE_STACK_QUALIFIED = NO.
The harness must not recompute, replace, redraw, or shrink the sample within
the same qualification episode; every committed selected case and its
failure/invalidity lineage remains retained.

## 6. Carried-forward first-buyer and audit contract

The first buyer is the wallet owner receiving a positive net candidate-mint
amount in a successful single-hop Raydium CPMM swap with positive quote flow
into the paired vault. Failed transactions, direct transfers, airdrops,
liquidity movements, self-transfers, routed/multi-hop cases, missing owners,
missing paths, and ambiguous identities are unavailable/invalid. Chain truth
uses finalized slot, full block transaction order, instruction path, and the
frozen signature-byte duplicate tie-breaker; ambiguous order is never guessed.

The audit population is every distinct canonical asset in the closed complete
universe snapshot under outcome-independent criteria. Provider absence cannot
remove a case. The snapshot contains exactly the ordered complete asset
objects with fields `chain_id`, `mint_address`, `pool_address`,
`initialization_signature`, `initialization_slot`,
`block_transaction_index`, `candidate_vault`, `quote_vault`, and
`source_event_at`, ordered by `(chain_id, mint_address)` in ascending bytewise
UTF-8 order. Its UTF-8 bytes are serialized with `RFC8785 / JSON
Canonicalization Scheme (JCS)` and hashed as `universe_digest` before
selected-list derivation or any first-buyer/direct-chain-audit request or
result retrieval/inspection. The carried-forward V1 seed and selector are:

```text
seed = smokestack:pr01:source-qualification:audit-v1
score = SHA256(seed + '|' + universe_digest + '|' + canonical_asset_identity)
```

Scores are sorted as unsigned hexadecimal bytes, with equal scores ordered by
canonical asset identity in ascending bytewise UTF-8 order. The first
`min(200,N)` identities are selected without replacement. The exact ordered
selected identity list is bound into the frozen selected-list commitment
object, JCS-canonicalized, SHA-256 hashed as `audit_selected_list_digest`, and
durably sealed before any first-buyer or direct-chain-audit request or
corresponding result retrieval/inspection. Every selected case, including
failures, remains in the audit denominator; no replacement or
resource-order-dependent reselection is permitted. First-buyer availability
and audited agreement thresholds remain exactly 95% and 99%.

## 7. Execution bounds and authorization

Future execution has one discovery connection, ten reconnects, fifteen minutes
of replay per reconnect, twenty Helius history pages per asset, eight
market-state request calls per asset, 50,000 census signature pages, and
100,000 total QuickNode raw RPC calls. QuickNode accounting is role-specific:

- census ceiling: 50,000 charged attempts, in newest-to-oldest cursor and
  required-resolution order;
- market-state ceiling: 40,000 charged attempts, with 24 worst-case charged
  attempts reserved per asset (eight request calls plus two retries each), and
  `N * 24 <= 40,000` required before any selective market-state execution; and
- direct-audit ceiling: 10,000 charged attempts, in committed selected-list
  order, with 50 worst-case charged attempts reserved per selected case.

These are the frozen role constants:
`QUICKNODE_CENSUS_CALL_BUDGET = 50,000`,
`QUICKNODE_MARKET_STATE_CALL_BUDGET = 40,000`,
`QUICKNODE_AUDIT_CALL_BUDGET = 10,000`, and
`QUICKNODE_GLOBAL_CALL_CEILING = 100,000`.

Every initial request and retry consumes one role budget unit. Roles cannot
borrow from one another, concurrency cannot select survivors, and every role
must complete all its frozen cases. Census exhaustion before completeness,
market-state fit failure or exhaustion, or audit exhaustion before committed
sample completion makes `PACKET_VALID = NO` and
`SOURCE_STACK_QUALIFIED = NO`; it never samples, replaces, or shrinks a
denominator. The global ceiling is exactly `100,000 = 50,000 + 40,000 +
10,000`. Two retries are allowed for 408/429/5xx/transport and none for
400/401/403/404/schema errors; 30-second stream and 10-second HTTP timeouts,
raw response hashing, parser identity, and source-level cost accounting remain
frozen.

This preregistration authorizes none of the following:

- live provider execution or source measurement;
- paid provider spend or secret reads;
- Solana RPC calls;
- database or detector startup; or
- PR-02.

The only permitted phase outcome is `PREREGISTERED_NOT_EXECUTED`. It can never
declare `SOURCE_STACK_QUALIFIED`.

## 8. Mechanical closure assertions

Before closure, the implementer must verify:

```text
V0_FILES_UNCHANGED = PASS
V1_FILES_UNCHANGED = PASS
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
V1_RECEIPT_CLOCK_NEGATIVE_REJECTED = PASS
V1_RECEIPT_CLOCK_SKEW_RULE_FROZEN = PASS
V1_RECEIPT_CLOCK_TRANSIENT_STEP_DETECTION = PASS
V1_MARKET_STATE_NON_TAUTOLOGICAL = PASS
V1_MARKET_STATE_SUBSTANTIVE_OBSERVATION = PASS
V1_MARKET_STATE_DENOMINATOR_INDEPENDENT_OF_SUCCESS = PASS
V1_MARKET_STATE_TEMPORAL_CONTRACT = PASS
V1_MARKET_STATE_FAILURE_REMAINS_IN_DENOMINATOR = PASS
V1_STAGE1_GATES_UNCHANGED = PASS
AUTHORIZATION_FAIL_CLOSED = PASS
CENSUS_COMPLETE_BEFORE_SAMPLE_COMMIT = PASS
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
```

No V0 or V1 filename is modified. The exact JSON bytes are the machine-readable
authority; this Markdown records the same frozen values and its recorded
digest must match the computed SHA-256 before commit. The V2 barrier schema,
state order, request gate, immutability rule, and invalidation rule are
identical to the JSON paths audit_sample_commit_barrier.*.

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

Next gate: `PR01_PREREG_V2_INDEPENDENT_BROAD_HOSTILE_REVIEW`.

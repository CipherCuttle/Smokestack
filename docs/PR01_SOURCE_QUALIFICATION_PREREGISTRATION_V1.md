# PR-01 Source Qualification Preregistration V1

## Frozen identity and state

- Phase: `PR01_SOURCE_QUALIFICATION_PREREGISTRATION_V1`
- State: `PREREGISTERED_NOT_EXECUTED`
- Canonical predecessor: `42bc8003b280affc8da0bb484ea9468da32bb656`
- `SUPERSEDES_FAILED_V0 = bb8696bc74b660ec1ed34f404493bf05035a9b2a`
- `V0_TERMINAL_VERDICT = TERMINAL_FAIL_CLOSED`
- `MEASUREMENT_AUTHORIZED = NO`
- `SOURCE_STACK_QUALIFIED = NO`
- `LIVE_PROVIDER_EXECUTION_AUTHORIZED = NO`
- `PR02 = NOT_STARTED`
- Exact JSON: [`experiments/qualification/pr01-source-qualification-prereg-v1.json`](../experiments/qualification/pr01-source-qualification-prereg-v1.json)
- JSON SHA-256: `93df6beb85528b77804218e3b56f8751b567d7460a0c42500f2c351b73aa81e5`

This is a new immutable preregistration. V0 remains terminally failed and is
not edited, reopened, repaired, or re-reviewed. V1 carries forward the V0
semantics that survived targeted rereview and repairs only V0-H04 and V0-H05.

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

### V1 market-state candidate

`MARKET_STATE_CANDIDATE = QUICKNODE_SOLANA_MAINNET_RPC_MARKET_STATE_V1`.

This is Option B: a separately scheduled chain observation operation, not a
rename of census evidence. For each eligible member, the harness issues its
own bounded raw finalized JSON-RPC request sequence (`getTransaction`/
`getBlock` plus the required event evidence), within 30 seconds of
`eligibility_knowledge_at`. The census response is never reused or counted as
market-state success. The operation may share QuickNode infrastructure with
the census and direct audit; that shared backend is disclosed and no source
independence claim is made for MARKET_STATE.

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

## 4. V1-H04 receipt-clock validity contract

`RECEIPT_CLOCK_VALIDITY_FROZEN = YES` and the machine-readable contract ID is
`V1_RECEIPT_CLOCK_V1`.

The contract distinguishes the four domains
`CHAIN_EVENT_TIME`, `HOST_WALL_RECEIPT_UTC`, `HOST_MONOTONIC_RECEIPT`, and
`WALL_MONOTONIC_OFFSET`.

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
and at finalization. Each checkpoint compares its wall-minus-monotonic offset
with the preceding checkpoint. A change above 250 ms invalidates the affected
interval and all receipt observations in that interval. A discontinuity seen
in an observation pair also invalidates that observation/interval. Start/end
only recalibration is forbidden. A wholly unobserved sub-cadence step cannot
be inferred from timestamps and cannot be promoted to a valid successful
latency. The decision is a pure function of the frozen timestamp pairs,
source event time, tolerance, and checkpoint labels, so faithful
implementations agree.

Only `LIVE_FIRST_OBSERVATION` with a valid clock and non-null chain event time
enters p95. Replay/recovery, duplicates, late, timeout, unavailable,
malformed, unsupported, and invalid-clock cases remain visible and do not
enter the success numerator. V0 replay/recovery behavior is otherwise
unchanged.

## 5. Carried-forward first-buyer and audit contract

The first buyer is the wallet owner receiving a positive net candidate-mint
amount in a successful single-hop Raydium CPMM swap with positive quote flow
into the paired vault. Failed transactions, direct transfers, airdrops,
liquidity movements, self-transfers, routed/multi-hop cases, missing owners,
missing paths, and ambiguous identities are unavailable/invalid. Chain truth
uses finalized slot, full block transaction order, instruction path, and the
frozen signature-byte duplicate tie-breaker; ambiguous order is never guessed.

The audit population is every distinct canonical asset in the closed complete
universe snapshot under outcome-independent criteria. Provider absence cannot
remove a case. The committed audit sample is selected before result inspection
using the V1 seed and `min(200,N)` without replacement. Every selected case,
including failures, remains in the audit denominator. First-buyer availability
and audited agreement thresholds remain exactly 95% and 99%.

## 6. Execution bounds and authorization

Future execution has one discovery connection, ten reconnects, fifteen minutes
of replay per reconnect, twenty Helius history pages per asset, eight
market-state RPC calls per asset, 50,000 census signature pages, 100,000 total
QuickNode raw RPC calls, two retries for 408/429/5xx/transport, no retry for
400/401/403/404/schema errors, 30-second stream and 10-second HTTP timeouts,
raw response hashing, parser identity, and source-level cost accounting.

This preregistration authorizes none of the following:

- live provider execution or source measurement;
- paid provider spend or secret reads;
- Solana RPC calls;
- database or detector startup; or
- PR-02.

The only permitted phase outcome is `PREREGISTERED_NOT_EXECUTED`. It can never
declare `SOURCE_STACK_QUALIFIED`.

## 7. Mechanical closure assertions

Before closure, the implementer must verify:

```text
V0_FILES_UNCHANGED = PASS
V1_RECEIPT_CLOCK_NEGATIVE_REJECTED = PASS
V1_RECEIPT_CLOCK_SKEW_RULE_FROZEN = PASS
V1_RECEIPT_CLOCK_TRANSIENT_STEP_DETECTION = PASS
V1_MARKET_STATE_NON_TAUTOLOGICAL = PASS
V1_MARKET_STATE_DENOMINATOR_INDEPENDENT_OF_SUCCESS = PASS
V1_MARKET_STATE_TEMPORAL_CONTRACT = PASS
V1_MARKET_STATE_FAILURE_REMAINS_IN_DENOMINATOR = PASS
V1_STAGE1_GATES_UNCHANGED = PASS
MARKDOWN_JSON_SEMANTIC_IDENTITY = PASS
JSON_DIGEST_MATCH = PASS
```

No V0 filename is modified. The exact JSON bytes are the machine-readable
authority; this Markdown records the same frozen values and its recorded
digest must match the computed SHA-256 before commit.

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

Next gate: `PR01_PREREG_V1_INDEPENDENT_REVIEW`.

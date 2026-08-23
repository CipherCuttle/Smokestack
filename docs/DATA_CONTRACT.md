# Data and Temporal Contract

This document defines semantic requirements before concrete schemas exist.

## Time taxonomy

Every raw observation distinguishes, when available:

- `source_event_at`: when the source claims the underlying event occurred;
- `source_slot_or_block`: chain ordering identity when applicable;
- `fetched_at`: when Smokestack received the source payload;
- `recorded_at`: when Smokestack durably committed it.

For decision eligibility, `fetched_at` is the conservative default knowledge-time boundary unless a later frozen contract proves a stricter valid convention.

## Raw observation requirements

A promoted raw observation must bind provider/source family, endpoint/query identity, provider schema/version identity when available, subject identity, all applicable times, source metadata required for interpretation, raw response bytes or immutable object reference, SHA-256 of raw bytes, parser/code identity, and parse outcome.

## Append-only rule

Raw observations are never updated to make history cleaner. Corrections append a new observation with a relation to the prior record.

Derived projections may be rebuilt and replaced because their source lineage is immutable.

## Missingness

Missingness is a first-class state.

Examples:
- provider outage => `UNAVAILABLE`, not zero;
- first buyers unsupported => `UNAVAILABLE`, not no overlap;
- ambiguous symbol collision => `AMBIGUOUS`, not THIN attention.

## Provider isolation

Providers are not silently interchangeable. Fallback requires a separate source observation and explicit aggregation semantics.

## Schema evolution

External/wire schemas use immutable versioned files under `schemas/` once introduced. A semantic breaking change creates `v2`; old observations retain the version that interpreted them.

## Canonicalization

Content-addressed JSON receipts will use RFC 8785 JSON Canonicalization Scheme once receipt work is authorized. Until then no bespoke receipt canonicalizer is added.

## Deterministic replay invariant

For a fixed raw observation set, schema/parser versions, code SHA and config, replay must produce identical decision-relevant projections and digests.

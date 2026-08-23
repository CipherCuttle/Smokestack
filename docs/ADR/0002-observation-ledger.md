# ADR-0002: Append-only Raw Observation Ledger, Not Full Event Sourcing

Status: ACCEPTED as Stage-2 direction

## Context

Smokestack must prove what was knowable at decision time and replay decisions without hindsight. Full domain event sourcing would add unnecessary abstraction.

## Decision

When storage is introduced, preserve append-only raw source observations with explicit source-event and knowledge times. Build replaceable projections from those facts. Do not model every domain action as an event merely for architectural purity.

## Consequences

Historical truth stays auditable while projections remain simple and rebuildable.

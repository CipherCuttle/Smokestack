# Architecture v0

## Decision

Smokestack begins as one TypeScript modular monolith on Node 24 LTS with PostgreSQL introduced only after source qualification. No second runtime language or distributed middleware is allowed until a stage explicitly earns it.

## Dependency direction

```text
core -> no providers/storage/runtime
providers -> core contracts
storage -> core contracts
runtime -> core + providers + storage
cli -> runtime/core
research -> may consume promoted runtime outputs
experiments -> disposable qualification only

src/** MUST NOT import research/** or experiments/**
```

## Planned promoted modules

Directories are created only when their stage starts; this document is the skeleton authority until then.

```text
src/
  core/
    contracts/
    temporal/
    structure/
    formation/
    attention/
    tripwire/
  providers/
    solana/
    market/
    public-attention/
  storage/
  runtime/
    ingest/
    projection/
    outcomes/
    publication/
  cli/
```

## Planned data flow

```text
QUALIFIED SOURCES
      |
      v
RAW OBSERVATION LEDGER
      |
      v
POINT-IN-TIME PROJECTIONS
      |
      +------------------+
      |                  |
      v                  v
STRUCTURE / ACTORS    ATTENTION
      |                  |
      v                  |
FORMATION SNAPSHOT       |
      +--------+---------+
               v
        TRIPWIRE DECISION
         /             \
   NO_SIGNAL           FIRE
                         |
                         v
                  INTERNAL RECEIPT
                         |
                         v
                 OUTCOME CHECKPOINTS
```

## Why modular monolith

The expensive design decisions are provider semantics, temporal semantics, formation rules, attention rules, and receipt semantics. They get explicit boundaries without introducing network boundaries. Process/service decomposition is deferred until measured operational need exists.

## Deferred architecture

- PostgreSQL: Stage 2, after source qualification.
- LLM labeler: after Formation freeze and only as non-decision presentation.
- transactional outbox: Stage 10, when notifications exist.
- Rust verifier: Stage 11, when public receipts justify independent implementation.
- web application: Stage 12.
- second chain: Stage 14.

## Architectural kill rule

If an implementation stage requires a new service, language, database, broker, or framework not authorized in its phase contract, stop and justify it with a new ADR before adding the prerequisite.

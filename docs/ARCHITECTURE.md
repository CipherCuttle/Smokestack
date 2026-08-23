# Architecture v0

## Decision

Smokestack begins as one TypeScript modular monolith on Node 24 LTS with PostgreSQL introduced only after source qualification. No second **application runtime** language or distributed middleware is allowed until a stage explicitly earns it.

DeepSeek Harness, if qualified, is an external development control plane under `tooling/dsh/`. It is not an application dependency and does not alter the runtime architecture described here.

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
src/** MUST NOT import tooling/dsh/** or DSH packages
```

## Development-tool boundary

```text
                    BUILD-TIME ONLY

Codex orchestrator ---> DSH control ---> Codex implementer
       read-only             |              worktree-write
                             |
                             +---------> Claude reviewer
                                        read-only

                             |
                             v
                         Git candidate
                             |
========================= BOUNDARY =========================
                             |
                             v
                     SMOKESTACK APPLICATION
                     Node/TypeScript + later PostgreSQL
```

A clean checkout must build/test without DSH, Codex, Claude, coding-agent auth state, or a DSH home. DSH failure therefore cannot become an application outage or package prerequisite.

See ADR-0006 and `docs/DSH_BUILD_CONTROL.md`.

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

The expensive application design decisions are provider semantics, temporal semantics, formation rules, attention rules, and receipt semantics. They get explicit boundaries without introducing network boundaries. Process/service decomposition is deferred until measured operational need exists.

The development harness is deliberately outside that graph. Using a sophisticated build controller is not justification for a sophisticated product runtime.

## Deferred architecture

- DSH build control: separate PR-00A tooling qualification; never required by app runtime.
- PostgreSQL: Stage 2, after source qualification.
- LLM labeler: after Formation freeze and only as non-decision presentation.
- transactional outbox: Stage 10, when notifications exist.
- Rust verifier: Stage 12, when public receipts justify independent implementation.
- web application: Stage 13.
- second chain: Stage 15+.

## Architectural kill rule

If an implementation stage requires a new application service, language, database, broker, or framework not authorized in its phase contract, stop and justify it with a new ADR before adding the prerequisite.

If DSH qualification requires modifying the Smokestack runtime architecture to make the build harness work, reject that DSH integration rather than contaminating the application.

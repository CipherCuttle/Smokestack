# ADR-0005: One Runtime Language Until a Later Stage Earns Another

Status: ACCEPTED

## Decision

PR-00 through V0 efficacy use Node/TypeScript only. Useful Pyroshade/Serrata/RekTrace behavior may be ported directly or reimplemented in TypeScript as appropriate.

Rust is allowed only when independent public receipt verification is authorized. Python is allowed only if a future required capability demonstrably has lower total risk in Python than a TypeScript port.

A second language requires a new ADR describing ownership, build/CI, serialization boundary, dependency policy and removal criteria.

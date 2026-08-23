# ADR-0001: Begin as a TypeScript Modular Monolith

Status: ACCEPTED for PR-00

## Context

The concept spans source ingestion, temporal storage, structural inference, attention measurement, research, receipts and eventually delivery. Premature service decomposition would create network, deployment and versioning boundaries before scale/reliability requirements are measured.

## Decision

Use one Node/TypeScript application with module boundaries enforced by dependency direction. Add process/service boundaries only through a later ADR backed by measured operational need.

## Consequences

Positive: fewer prerequisites, simpler replay/testing, cheaper refactors, one contract authority.

Negative: later extraction may require work if a module develops genuinely independent scaling/reliability needs. That is accepted deferred work, not current debt.

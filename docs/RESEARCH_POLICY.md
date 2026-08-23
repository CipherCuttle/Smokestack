# Research Policy

## Separation of concerns

Smokestack uses four evidence states:

1. **Qualification** — can the instrument/source measure what we think it measures?
2. **Calibration** — exploratory parameter/configuration work; outcomes may inform hypothesis generation only.
3. **Freeze** — exact hypothesis, detector, controls, endpoints, sample/stopping rules and code/config/schema identities are preregistered.
4. **Prospective evaluation** — new observations test the frozen hypothesis; no outcome-aware tuning.

Qualification/calibration evidence cannot be presented as confirmatory prospective evidence.

## Trial ledger

Every materially distinct calibration attempt must have a row/file containing:
- trial ID;
- parent trial if any;
- code SHA;
- config digest;
- universe/packet identity;
- data cutoff;
- purpose;
- result summary;
- disposition: REJECTED / CANDIDATE / SUPERSEDED / FROZEN;
- reason for next change.

Failed and boring trials remain visible.

## HARKing prohibition

If an outcome observation caused a hypothesis/rule to be invented or changed, that same observation cannot be the confirmatory test of the new rule.

Any material semantic change after freeze creates a new detector version and new prospective cohort.

## Primary endpoint discipline

The preregistration must name exactly one primary endpoint for the V0 adjudication. Secondary metrics are descriptive unless explicitly corrected for multiplicity.

The V0 endpoint concerns attention transition, not investment return.

## Control construction

Controls are selected at decision time using only pre-outcome variables. They must be contemporaneous and matched on frozen dimensions such as age, market-cap bucket, liquidity bucket and activity bucket.

Do not compare selected Formation members against the full launch graveyard.

## Uncertainty and effect size

Advance is based on a preregistered minimum useful effect plus uncertainty, not merely p<0.05 or a positive point estimate. Sample size/precision is calculated after calibration and before evaluation.

## Data leakage rule

A decision at time T may consume only records whose knowledge-time eligibility is satisfied by the frozen contract. Later corrections append new knowledge and may affect later decisions, never sealed earlier decisions.

## Economic research boundary

`EMBER` is a separate study. When economic outcomes become primary, the study must explicitly model liquidity and spread, realistic execution convention, fees, survivorship/delistings, multiple testing/model selection, and drawdown/tail behavior where relevant.

No V0 Silent Ignition result is automatically evidence for Ember.

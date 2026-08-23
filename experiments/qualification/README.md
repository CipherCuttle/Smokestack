# Qualification Experiments

Disposable code used to determine whether candidate sources/instruments are fit for purpose.

Rules:
- may not be imported by `src/`;
- may not silently become production code;
- useful behaviors are promoted through a later implementation PR;
- retain raw/golden fixtures needed to prove promoted parity;
- qualification success does not prove the product hypothesis.

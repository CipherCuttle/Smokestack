# Database Migrations

PostgreSQL and real migrations are intentionally deferred until PR-02, after source qualification.

Once introduced:
- migrations are SQL and committed;
- CI must migrate from empty DB and the previous supported schema;
- destructive changes use expand -> migrate -> contract;
- raw observation rows are append-only.

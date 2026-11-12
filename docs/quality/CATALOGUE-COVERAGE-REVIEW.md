# Legacy 4.1 integration — local validation, not deployed

Base: PR #38 / 384d74ce30307823eced2dd24fffacae6b9d5c95.
Source: `CATALOGUE_REFERENCE.json`, 4.1.0-coverage.1, SHA256 `e79f9308d99e41987ab441384b5fde7001ae518505b5c37ed3064c61e9266e52`.
Accompanying coach source SHA256: `b233c1abd065df9a77a40772a2342d31a99e058eea83824f478953ddd5ef0ac4`.

## Complete current catalogue

The index now exposes all 1,326 current source IDs and versions. A test compares every ID/version against the imported master manifest, not only the total count.

- 140 new identities and 55 updated identities (including the original 15 pilots).
- Existing source files, library entries, programs, publications and results are never rewritten. Old immutable revisions remain in the private database catalog.
- Current display: 769 selectable in authorized staging, 557 read-only for source ambiguity or limitations of the prescription form. All 1,326 remain searchable. This is not clinical/professional approval or unrestricted production eligibility.
- The update adds 109 representable snapshots: 87 new identities and 22 revised existing identities. 86 of the 195 delta entries remain read-only. Private historical database retains 689 original snapshots plus 109 new snapshots = 798 rows, not 1,326; read-only documentary entries remain in the server projection, not selectable seed rows.
- Max's explicit DB_034 per-arm counting decision remains an identified overlay on the new 1.3.0 source version. No alternating-pair count or halving is introduced.
- Old imported revisions do not reappear alongside the current revision in the chooser. Existing client programs retain their old frozen snapshots.
- No images/video/reference URLs are published and no exercise is marked approved.

## Version-safe import

`node scripts/m1-import-exercise-coverage.mjs /absolute/CATALOGUE_REFERENCE.json` previews only. `--write` writes local projection, report and new migration; it never contacts a database.

The importer verifies source scope, identity retention and core client-facing content for unchanged version numbers. It fails rather than silently accepting changed content under an old version.

`202611120001_training_catalogue_coverage.sql`:
- extends the private shape validator;
- adds generated `source_version` and makes `(source_id,source_version)` the private primary key;
- preserves all old rows and RPC/auth/RLS permissions;
- inserts only representable new versions;
- serializes application, rejects same-ID/version content conflicts, and treats identical repeats as no-ops.

Existing RPC selection already requires ID plus version. Existing guard comparisons remain exact snapshots. No published document, exercise-library row or performance history is updated.

## Verification

- Baseline suite: 822 unit tests passed.
- Final suite: 829 unit tests passed, including backward compatibility, current-version manifest, stale chooser filtering, source overlay, strict schemas and SQL seed correspondence.
- TypeScript and lint passed. Production build passed locally; no deployment performed.
- Actual generated migration executed in an isolated PGlite embedded PostgreSQL database: 689 → 798 rows; second application unchanged; every old snapshot unchanged; deliberate same-ID/version conflict rejected without overwrite. This is a narrow PostgreSQL migration test, NOT the full Supabase gate.
- PGlite harness retained separately at `/workspace/shared/legacy-workflow-analysis/test-versioned-migration.mjs`.
- Ten additional pgTAP checks prepared in `131_training_coverage_versions.test.sql`. Existing scalar DB_034 tests now explicitly target the old pilot version.
- Browser tests could not start: Playwright download returned an invalid ZIP; installed Chromium failed with `socket() failed: Operation not permitted`.
- Full Supabase SQL/RLS/HTTP integration and E2E remain unrun because Docker/Postgres service is unavailable. Therefore release gate remains BLOCKED until those checks pass in an appropriate isolated environment on these changes.

## Explicit boundaries

No remote push, migration application on staging/production, deployment or data deletion. No client programs or predefined content created.

Requested coach redesign is deferred per Max's latest direction. The only chooser change is the integration-required ID/version filtering. All exploratory compact-layout changes were removed.

Test-data cleanup remains a distinct inventory-and-approval task. Do not classify records as disposable from names alone; preserve personal-client histories. Prefer existing archive/withdraw mechanisms before any permanent purge.

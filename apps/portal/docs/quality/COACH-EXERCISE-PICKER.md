# Coach exercise picker — implementation review

## Scope
- Search above anatomical group buttons and combined results list.
- Multi-selection basket across filters, then prescription editing in the existing session editor.
- Single immediate selection preserved for a fast one-exercise flow.
- Protected imports resolved before one batch draft change; failed imports preserve the entire draft and receipt identities for retry.
- Ranking from actual saved prescription occurrences in the current coach's drafts, scoped by organization and author, under existing RLS.
- Ranking occurs before pagination. Counts span source versions of the same catalogue exercise.
- Personal exercises without anatomy metadata use conservative bilingual name families for group filtering.
- No schema migration, production deployment, publication, client-result modification or template creation.

## Limits
- Usage means saved draft occurrences, not click tracking or client results. History of 200 or more drafts uses the safe fallback rather than an unbounded interactive scan.
- Existing catalogue eligibility restrictions remain enforced.
- Program templates and blank program flows are unchanged.

## Verification
- TypeScript, lint, unit suite and production build passed locally during implementation.
- Added regression coverage for groups, privacy scope, usage ordering before pagination, fallback and multi-selection flows.
- Browser assertions NOT RUN: Chromium exits with `socket() failed: Operation not permitted`, including an approved elevated attempt. No screenshot claimed.
- Full SQL/RLS/HTTP gate NOT RUN for this change: Docker is absent in this cloud workspace. The previous staging commit's passing gate is not evidence for this new commit.
- Remote CI and staging deployment remain pending; the Mac with existing authenticated deployment session was offline during implementation.

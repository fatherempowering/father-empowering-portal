# Coach/Admin M1 integration contract

This feature owns the Coach-facing M1 slice only. It intentionally does not
create shared authentication, Supabase, migration, or application bootstrap
files.

## Shared contracts used

- `@/lib/contracts/m1`
  - `ActorContext`
  - `ClientSummary`
  - `CreateClientRequest`
  - `InvitationSummary`
- `@/lib/auth/actor`
  - `requireCoachAal2()`

## Platform adapter required

At server startup, platform integration must call
`installCoachM1Dependencies()` with a PostgreSQL-backed implementation of
`CoachM1Dependencies` from `server/ports.ts`.

The implementation must guarantee that `runIdempotentMutation`:

1. stores `clientMutationId` and a request fingerprint;
2. returns the original result when the same key and fingerprint are retried;
3. rejects a reused key with different content;
4. executes the business writes, audit rows and outbox rows in one PostgreSQL
   transaction;
5. checks organization membership and active Coach↔Client assignment in SQL;
6. never uses a browser-exposed `service_role` key.

For `createClient`, the transaction must cover client creation, primary Coach
assignment, invitation creation, two audit records and the invitation-delivery
outbox row. Separate RPC calls without a surrounding database transaction do
not satisfy this port.

Invitation resend must invalidate the previous activation secret and create a
new expiry. Only a hash may be retained as the durable verification value. The
delivery worker may receive the one-time plaintext token through the
transactional outbox, but it must never be written to logs or audit metadata.

## Deliberately excluded

- Week Zero
- Exercise Library
- Program Builder
- publishing
- legacy portal changes
- advanced multi-Coach administration


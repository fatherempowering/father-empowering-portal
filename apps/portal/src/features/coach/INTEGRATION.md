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

## Platform adapter

`server/runtime.ts` installs the PostgreSQL-backed implementation by default.
`installCoachM1Dependencies()` remains available only as an explicit test seam.

The three mutation ports map one-to-one to transaction-owning PostgreSQL RPCs.
The implementation guarantees that each RPC:

1. stores `clientMutationId` and a request fingerprint;
2. returns the original result when the same key and fingerprint are retried;
3. rejects a reused key with different content;
4. executes the business writes, audit rows and outbox rows in one PostgreSQL
   transaction;
5. checks organization membership and active Coach↔Client assignment in SQL;
6. never uses a browser-exposed `service_role` key.

For `createClient`, one RPC covers client creation, primary Coach assignment,
invitation creation, audit and the invitation-delivery outbox row. There is no
JavaScript callback pretending to hold a database transaction open.

Invitation resend must invalidate the previous activation secret and create a
new expiry. Only a hash may be retained as the durable verification value. The
delivery worker derives the retry-stable opaque token in memory; the
transactional outbox contains only identifiers. Plaintext tokens are never
stored in the database, logs or audit metadata.

## Deliberately excluded

- Week Zero
- Exercise Library
- Program Builder
- publishing
- legacy portal changes
- advanced multi-Coach administration

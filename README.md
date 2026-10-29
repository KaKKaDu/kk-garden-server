# Diploma Project Server

## Running

Configure the variables listed in `env-vars/env.schema.ts`; keep their values
out of source control. The schema validates MongoDB, Better Auth, email, client
origin, and private R2 settings. Review the profile/avatar deployment notes in
[`../.agents/plans/user-profile.md`](../.agents/plans/user-profile.md).

For local development, run `npm run dev`. For deployment, run `npm run build`
then `npm start`. Startup initializes the account-tombstone, avatar-upload,
rate-limit, pending-visualisation, and Agenda indexes, then starts the
avatar-cleanup worker in the server process. Initialization failure prevents
the server from starting; shutdown drains the worker.
Better Auth sessions expire after 24 hours. Account deletion requires a valid
session and explicit confirmation, with no additional five-minute freshness
gate.

MongoDB must use a replica set or sharded-cluster topology that supports
multi-document transactions; standalone MongoDB deployments are not supported.

Pending visualisations have a 72-hour TTL index on `createdAt`. MongoDB's TTL
monitor deletes asynchronously, so the timestamp is not an exact expiration
moment or an authorization check; owner-scoped application lookups remain
authoritative, and removed records return the normal not-found result.
Agenda cleanup job records have a 72-hour TTL from enqueue time (`data.queuedAt`),
regardless of job state. TTL deletes the job record, not its R2 object; a job
that has not completed by then can leave an orphaned object. Better Auth
collections and avatar upload sessions do not receive TTL indexes.

Shared contract changes must be published and resolved by the server before
implementing server code that depends on them. Agenda Mongo job-event logging
is disabled; `agenda_logs` is not currently enabled. The existing
`ProfileService`/avatar boundary remains unchanged for this architecture polish.

## Checks and acceptance

`npm run check` runs formatting, lint, and type checks. Use
`npm run env-validate` to validate the configured environment.

Smoke/acceptance scripts and benchmark scripts are not maintained in this
package. Historical plan documents may describe scripts and results from before
their removal; those commands are no longer available.

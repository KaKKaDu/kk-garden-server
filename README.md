# Diploma Project Server

## Running

Configure the variables listed in `env-vars/env.schema.ts`; keep their values
out of source control. The schema validates MongoDB, Better Auth, email, client
origin, and private R2 settings. Review the profile/avatar deployment notes in
[`../.agents/plans/user-profile.md`](../.agents/plans/user-profile.md).

For local development, run `npm run dev`. For deployment, run `npm run build`
then `npm start`. Startup initializes the account-tombstone, avatar-upload,
rate-limit, and Agenda indexes, then starts the avatar-cleanup worker in the
server process. Initialization failure prevents the server from starting;
shutdown drains the worker.
Better Auth sessions expire after 24 hours. Account deletion requires a valid
session and explicit confirmation, with no additional five-minute freshness
gate.

## Checks and acceptance

`npm run check` runs formatting, lint, and type checks. The smoke scripts cover
image processing, upload/finalization, profile ownership, pending ownership,
and account-deletion service and route behavior. They use synthetic data and
mocks; they do not prove live MongoDB/R2 behavior.

`npm run test:avatar-storage` writes synthetic objects to the configured R2
bucket and exercises its CORS policy. Run it only against a private development
bucket. `npm run test:auth-rate-limit` requires the configured local server.
`npm run test:account-deletion-mongo` inserts and removes uniquely identified
synthetic Mongo records and calls the real deletion transaction; run it only
against a disposable development database. It does not exercise authenticated
HTTP or R2 cleanup.
End-to-end deletion, email reuse, and worker restart/recovery require disposable
accounts and the configured development MongoDB/R2 environment.

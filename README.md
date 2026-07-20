# DiTeLe Version 2

DiTeLe V2 is a greenfield, security-first rebuild of the practical software-testing learning platform. The current Release 0 provides real public/authentication, learner task/revision, trainer review/question, administration read/lifecycle and organization vertical slices behind canonical V2 contracts. Remaining Version 1 parity and advanced Plan 10 modules are tracked explicitly; schema/domain groundwork is never presented as a live feature.

The authoritative implementation plan is [Plan 10](anforderung/10_ENTWICKLUNGSPLAN_NEUBAU.md). Current implementation and external blockers are tracked in [the execution checklist](docs/execution/IMPLEMENTATION_CHECKLIST.md) and [blocker register](docs/execution/KNOWN_BLOCKERS.md). A visible preview is not considered production-complete unless its model, authorization, logic, error states, tests, workflow and browser verification all pass.

## Stack

- Next.js App Router, React and strict TypeScript
- Local Supabase/PostgreSQL through Docker
- Versioned SQL migrations, deterministic seed data and Row Level Security
- Zod-validated canonical contracts and named state machines
- Vitest, Testing Library and Playwright
- EN, DE and RU localized routes

## Local development

Prerequisites: Node.js 22+, npm and a Docker-compatible runtime.

```bash
npm ci
npm run db:start
npm run env:local
npm run db:reset
npm run dev:local
```

Open `http://127.0.0.1:3100/en`. Local Supabase Studio is available at `http://127.0.0.1:56723`. The isolated `3100` default avoids accidentally reusing another service already listening on the conventional Next.js port.

To run the verified production build locally instead of the development server:

```bash
npm run build
npm run start:local
```

The deterministic local accounts all use the development-only password `123123123`:

- learner: `learner@ditele.local`
- trainer: `trainer@ditele.local`
- platform/content admin: `admin@ditele.local`
- organization admin: `org-admin@ditele.local`

These identities are recreated by `npm run db:reset` and must never be used in a shared or production environment.

`npm run db:reset` is pinned to the local Supabase project and explicit development seed files. After the reset it checks the loopback Auth health endpoint and, only if needed, restarts the gateway container whose Supabase project label exactly matches this repository. The recovery is time-bounded and does not read or print credentials. If it reports that Docker or the gateway is unavailable, confirm Docker is running, run `npm run db:start`, and retry the reset.

Never expose `SUPABASE_SERVICE_ROLE_KEY` or provider secrets through `NEXT_PUBLIC_*`. The local Supabase stack is development-only and must not be exposed to untrusted networks.
`DITELE_AUTH_RATE_LIMIT_HMAC_KEY` is also server-only; use an independent random value in shared environments so authentication throttle identifiers remain pseudonymous and independently rotatable.

## Verification

```bash
npm run i18n:check
npm run secrets:check
npm run typecheck
npm run lint
npm run test
npm run test:local-auth-gateway
npm run build
npm run test:e2e
```

Database verification starts from a clean state with `npm run db:reset`. Browser evidence is stored only under the structured `artifacts/screenshots/<role>/` paths required by the execution plan.

## Repository boundaries

- `src/app` — routes, layouts, same-origin handlers and server actions
- `src/features` — domain use cases and feature UI
- `src/entities` — canonical domain states and policies
- `src/shared` — auth, contracts, database, localization, UI, validation and telemetry
- `supabase` — local config, immutable migrations and deterministic seeds
- `docs/execution` — coordinator-owned status, traceability and verification records

The Version 1 repository at `/home/wamocon/Desktop/Wamocon_academy_Ditele` is a read-only behavioral reference and is never modified by this project.

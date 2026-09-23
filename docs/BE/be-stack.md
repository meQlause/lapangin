# Lapangin — Backend stack

**Stage:** S3 · **Owns:** the eight library choices, their alternatives, their traps · Conventions: [`../../references/conventions.md`](../../references/conventions.md) · Lint: [`./lint.md`](./lint.md)

Fixed once at S3 and recorded in `docs/.pspt.json`. Changing an entry here is a specification change, not a pull-request-time decision.

---

## 1. Choices

| # | Concern | Choice | Alternative it beat | Why it won *for this project* | Trap |
|---|---|---|---|---|---|
| 1 | Language | **TypeScript**, ESM, `moduleResolution: NodeNext` | JavaScript | The `Cradle` interface (`../BE/be-architecture.md` §5), Zod `z.infer`, and the branded `Money` type are all compile-time guarantees — deleting them costs a runtime parity test each | Under ESM + NodeNext, an import is written `./courts.routes.js` while the file on disk is `courts.routes.ts`. tsc's message is `Cannot find module`; append `.js` |
| 2 | Runtime | **Node 22 LTS** | Node 20, Bun | Node 22 ships `--test`-parallelism and stable `fetch`; the platform is standard, the deploy is unopinionated. Bun's Prisma/native-module story is still a live issue | The `.nvmrc` and CI matrix must both pin 22; a mixed local/CI version breaks Prisma's binary target |
| 3 | Database | **PostgreSQL 16** | MySQL, SQLite | Only PostgreSQL expresses `EXCLUDE USING gist` (`../data-spec.md` §6) — the single line that makes NFR-001 mechanical. MySQL would need a discretised slot key + write lock; SQLite has no `TSTZRANGE` at all | `btree_gist`, `pgcrypto` and `citext` are extensions, not core — the migration must `CREATE EXTENSION IF NOT EXISTS` explicitly. Missing this is a first-migration failure |
| 4 | Backend framework | **Express 5** | NestJS | The whole feature-based `*.rules.ts` shape (`./be-architecture.md` §3) works identically in either. Express 5's native async-error propagation removes the one wart of 4.x; without a framework container, the pure-rules layer earns its keep more visibly here | No built-in DI, so the `*.rules.ts` purity boundary is worth **more** — without it nothing stops a handler's decision logic from reaching straight for the database. `no-restricted-imports` in [`./lint.md`](./lint.md) §7 is what pins it |
| 5 | ORM / query layer | **Prisma 6** | Drizzle, Kysely | The schema-first workflow keeps the migration story boring, and `Prisma.Decimal` is a real BigDecimal that never rounds. Drizzle is faster but leaves migrations to a second tool | `findFirst({where:{userId}})` returns `null` for both "not yours" and "does not exist" — the mapper decides which envelope code to use (NFR-005). And `Prisma.Decimal` **must** be converted to string in the mapper — a JSON `Decimal` serialises as `{}` |
| 6 | DI container | **Awilix** | tsyringe, manual factories | Zero decorators, works cleanly under ESM, per-request scope is a first-class concept. tsyringe wants `experimentalDecorators` and `emitDecoratorMetadata`, which drags a compile mode along; manual factories are fine at three features and painful at ten | `createContainer<Cradle>({ strict: true })` is mandatory — without it, a missing registration surfaces at first request as `AwilixResolutionError`. With `strict` + `Cradle`, it is a `tsc` error |
| 7 | Validation | **Zod** | Valibot, TypeBox | The `type X = z.infer<typeof …>` pattern (`../../references/conventions.md` §3) makes the schema the type; Valibot is smaller but the ecosystem is thinner; TypeBox needs a separate compile step to reach the same DX | A `.strict()` on every request schema is not optional — without it, a client posting an `amount` field succeeds silently (which would violate PRD §6 "the client never sends an amount") |
| 8 | Test runner | **Node's built-in `--test`** + `tsx` + Playwright/Chromium for e2e | Vitest, Jest | The unit and integration suites need nothing Vitest adds; the test tree already mirrors `src/` (SR-2). Playwright covers the browser side, one tool, one binary | `node --test` glob is `--test-name-pattern`, not Jest's `-t`. And `tsx --test` needs `--import tsx` in the process, not just as a loader flag |

> Every "not asked" is deliberate: language, architecture (feature-based with `*.rules.ts`), and the test toolchain are fixed by `../../references/conventions.md` — see the "Not asked" note in `references/stages/s3-decisions.md`.

## 2. Lint

The governing lint file for this stack is [`./lint.md`](./lint.md) — copied from `references/lint/express.md` into this repo so it travels with the project. The three consequences that reach the specification are already threaded through the other documents:

| Rule | Where the spec absorbs it |
|---|---|
| `complexity: 8`, `max-depth: 2` | Field rules are expressed as **Zod schema**, never as service branching. Six validations inline in a handler breaches the cap; the schema does not |
| `sonarjs/no-nested-conditional` | The code → HTTP-status map is a **`const` lookup table** in `src/http/error.ts` (`../error-handling.md` §2), never a `switch` chain. The class → presentation map on the client is the same shape (`../FE/fe-architecture.md`) |
| `sonarjs/todo-tag` | Deferred work has exactly one home: `phases.md` (S6). A `TODO` in source fails the commit |

`warn` is not advisory. The commit hook runs `eslint --max-warnings=0`, so every warning blocks a commit even when `pnpm run lint` passes. State it in the definition of done: the local `pnpm check` (§4) runs ESLint with `--max-warnings=0 --no-warn-ignored`.

## 3. Toolchain

| Concern | Choice | Command |
|---|---|---|
| Package manager | **pnpm** | `pnpm install` |
| TS execution / dev | **tsx** | `pnpm dev` runs `tsx watch src/server.ts` |
| Build | **tsc** | `pnpm build` compiles to `dist/` (Node runs the compiled ESM in production) |
| Format | **Prettier** | `pnpm format` |
| Lint | **ESLint 9 flat config** | `pnpm lint` |
| Types | **tsc --noEmit** | `pnpm typecheck` |
| Dead code | **knip** | `pnpm dead` |
| Unit + integration | `node --test` via `tsx` | `pnpm test` |
| End to end | **Playwright/Chromium** (SR-4) | `pnpm e2e` |
| Migrations | **Prisma migrate** | `pnpm prisma migrate dev/deploy` |
| Seed | `prisma/seed.ts` | `pnpm prisma db seed` — loads the exact figures from `../data-spec.md` §10 |
| Commit hook | **husky + lint-staged + commitlint** | `.husky/pre-commit` runs `pnpm check`; `.husky/commit-msg` runs commitlint (SR-6 rejects co-author trailers) |

## 4. The single check command

```jsonc
// package.json
{
  "scripts": {
    "check": "pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run dead",
    "format:check": "prettier --check .",
    "lint": "eslint --max-warnings=0 --no-warn-ignored .",
    "typecheck": "tsc --noEmit",
    "dead": "knip"
  }
}
```

`pnpm check` is the one command a contributor runs before committing, the pre-commit hook runs the same, and CI runs the same. Three definitions become three answers to "is this ready" — one definition is one answer.

> `pnpm test`, `pnpm e2e` and the database migration checks are run **in addition** by CI, not by `check`. `check` is the format/lint/types/dead pass; tests are a separate job.

## 5. Environment

Validated by Zod at boot (`src/config/env.ts`). Missing or malformed values fail the boot, not the first request.

| Variable | Type | Purpose |
|---|---|---|
| `NODE_ENV` | `'development'` \| `'test'` \| `'production'` | pino level, error-envelope verbosity flag |
| `PORT` | `number ≥ 1024` | HTTP listener |
| `DATABASE_URL` | Postgres URL | Prisma connection string |
| `CORS_ORIGIN` | URL or `*` in dev only | Locked to the SPA origin in production |
| `LOG_LEVEL` | `'debug' \| 'info' \| 'warn' \| 'error'` | pino level override |

`.env.example` ships in the repo; `.env` is git-ignored.

## 6. Packages

| Purpose | Package | Version |
|---|---|---|
| Framework | `express` | ^5 |
| DI | `awilix` | ^12 |
| ORM | `prisma`, `@prisma/client` | ^6 |
| Validation | `zod` | ^3.23 |
| Logger | `pino`, `pino-http` | ^9, ^10 |
| ULID | `ulid` | ^2 |
| Security headers | `helmet` | ^7 |
| CORS | `cors` | ^2 |
| Test runner deps | `tsx`, `@types/node` | latest LTS-compatible |
| E2E | `@playwright/test` | ^1.47 |
| Lint | `eslint`, `typescript-eslint`, `eslint-plugin-sonarjs`, `eslint-plugin-import`, `eslint-plugin-unused-imports`, `eslint-config-prettier` | flat-config-compatible versions |
| Hooks | `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional` | latest |
| Dead code | `knip` | ^5 |

> No `date-fns`, no `dayjs`, no `moment`. Native `Date` + IANA arithmetic (through Postgres and the venue's stored `timezone`) covers what we need. Adding a date library is deferred to a real requirement it satisfies — the current window and horizon comparisons happen on `TIMESTAMPTZ` values the database produces.

## 7. Traps worth naming

Every trap that has cost an afternoon on a comparable stack, in one place.

| Trap | Cost | Fix |
|---|---|---|
| ESM + NodeNext import extension (`./x.js` for `./x.ts`) | 20 min the first time, every developer, once | Written in §1 row 1, and once more here |
| `PrismaClient` instantiated per request | Connection-pool exhaustion under load | Single instance registered as an Awilix singleton with a disposer |
| `Prisma.Decimal` serialised to JSON as `{}` | A silent zero on the wire, discovered by a QA screenshot | Convert in `<feature>.mapper.ts`; return type forbids `Decimal` (`../../references/conventions.md` §3 row 5) |
| Missing `CREATE EXTENSION` in the first migration | `bookings_no_overlap` won't be created; the guarantee ships silently disabled | `prisma/migrations/0000_extensions.sql` runs `CREATE EXTENSION IF NOT EXISTS pgcrypto, btree_gist, citext` before any table exists |
| `PrismaExclusionViolation` translated in ten places | Same conflict, three different envelopes | Translated in **exactly one** place: `bookings.service.ts` (`../error-handling.md` §2 driver-error row) |
| Awilix without `strict: true` | Typo turns into a runtime resolution error | `createContainer<Cradle>({ strict: true })`; `Cradle` typed in `src/config/types.ts` |
| `express.json()` before `correlationIdMiddleware` | A JSON parse failure logs no requestId; support has nothing to grep | Middleware order pinned in `./be-architecture.md` §6 |
| `.strict()` missing from a request schema | The client can send `amount`, and the arithmetic runs on client-supplied numbers (violates PRD §6) | Every request schema ends with `.strict()`; enforced by an integration test that posts one extra field and expects 400 |
| PG timezone assumed to be UTC | Local-date + local-time computed against the server, not the venue | `bookings.service.ts` reads `venues.timezone`, converts once, stores the instant. See `../data-spec.md` §8 |

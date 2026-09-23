# Lapangin — Backend architecture

**Stage:** S3 · **Owns:** the shape of the Express service · Conventions: [`../../references/conventions.md`](../../references/conventions.md) · Lint: [`./lint.md`](./lint.md)

The backend is a single Express 5 service in TypeScript (ESM, `moduleResolution: NodeNext`) over PostgreSQL 16 through Prisma 6. Awilix scopes dependencies per request. The service exists to guarantee two things the client cannot: exclusivity of a booked slot under concurrency (NFR-001), and price immutability once a booking is written (NFR-002).

---

## 1. Principle

Group by feature, not by technical role. Everything one feature needs sits in one folder, and adding a feature means adding a folder. The `*.rules.ts` layer is the reason SR-1 and SR-7 are mechanical rather than aspirational: pure decision logic lives there and the linter forbids it from importing an ORM, a framework, an HTTP client, `fs`, `Date`, `fetch` or `Math.random`.

The **service** resolves the clock from DI and passes the instant into the rule. The **rule** is a function of its arguments. That composition means every branch — cancellation-window, pricing, slot classification — is reachable from a unit test with no container, no database and no clock.

## 2. Tree

```
src/
  app.ts                        composes middleware, mounts the router
  server.ts                     boots app.ts; the only file that calls listen()
  container.ts                  root Awilix container; loads every *.container.ts
  config/
    env.ts                      Zod-validated environment; injected as `config`
    types.ts                    the `Cradle` interface every service is typed against
  http/
    correlationId.ts            request-scoped ULID, echoed as X-Request-Id
    error.ts                    the one error-handling middleware
    logger.ts                   pino instance bound with requestId
    notFound.ts                 unmatched-route → E-INTERNAL is wrong; this raises E-BOOKING-NOT-FOUND-shape 404
  db/
    prisma.ts                   the PrismaClient instance
    tx.ts                       runInTransaction helper (accepts a callback taking the tx)
  features/
    venues/
      venues.routes.ts          GET /venues/:slug
      venues.controller.ts
      venues.service.ts
      venues.repository.ts
      venues.schema.ts
      venues.mapper.ts
      venues.errors.ts          VenueNotFoundError
      venues.container.ts
      index.ts                  { router, service }
    courts/
      courts.routes.ts          GET /venues/:slug/courts (with filters)
      courts.controller.ts
      courts.rules.ts           ← slot state classification (free|taken|closed) given hours + bookings
      courts.service.ts
      courts.repository.ts
      courts.schema.ts
      courts.mapper.ts
      courts.errors.ts
      courts.container.ts
      availability/             sub-feature: hour strip for one court on one date
        availability.rules.ts   ← pure: hours × existing bookings × opening_time/closing_time → slot[]
        availability.service.ts
        availability.repository.ts
        index.ts
      index.ts
    bookings/
      bookings.routes.ts        POST /venues/:slug/bookings, GET /bookings/:id
      bookings.controller.ts
      bookings.rules.ts         ← pure: pricing (quote), cancellation-window (isInsideWindow), validation the schema cannot express
      bookings.service.ts       ← composes rule + repository, opens the transaction, translates Prisma errors
      bookings.repository.ts
      bookings.schema.ts
      bookings.mapper.ts
      bookings.errors.ts        SlotTakenError, CourtNotBookableError, OutOfHoursError, OutsideHorizonError, DurationBelowMinError, BookingNotFoundError
      bookings.container.ts
      pricing/                  sub-feature: shared pricing helpers if they grow
        pricing.rules.ts        ← pure arithmetic (subtotal, tax, total, half-up round)
        index.ts
      index.ts
    users/
      users.repository.ts       lookup by id for booker prefill only (auth is out of scope)
      users.container.ts
      index.ts
  index.ts                      export what server.ts imports
tests/                          mirrors src/ exactly (SR-2)
  unit/
  integration/
  e2e/
  regression/
  fixtures/
  helpers/
prisma/
  schema.prisma
  migrations/
  seed.ts                       loads the §10 seed from data-spec.md
```

> `availability/` and `pricing/` are sub-features rather than top-level features because they only ever run inside `courts/` and `bookings/` respectively. Promoting them to top-level would leak an internal decomposition through the URL surface. If a third caller ever needs pricing, promote it then.

## 3. Feature anatomy — including `*.rules.ts`

Every top-level and sub-feature folder has the shape below. Missing files mean the feature genuinely has no need for that layer, not that the file is elsewhere.

| File | Role | Import boundaries |
|---|---|---|
| `<feature>.routes.ts` | Paths, guards, `validate()` calls. **No logic.** | May import controller, schema, guards |
| `<feature>.controller.ts` | Request and response only — reads the parsed body, calls the service, returns the mapped DTO | May import service, schema, mapper |
| `<feature>.rules.ts` | **Pure decision logic.** No I/O, no clock, no framework, no random | May import from `./*.errors.ts`, `./types.ts`, and other `*.rules.ts` files. Nothing else. Enforced by lint ([`./lint.md`](./lint.md) §7) |
| `<feature>.service.ts` | Orchestration, transactions, calls rules. Resolves `clock.now()` and **passes the instant into the rule** | May import repository, rules, mapper, other features' `index.ts` (public surface only), the tx helper |
| `<feature>.repository.ts` | Database queries only. Accepts an optional `tx` so a caller can join an outer transaction | May import `prisma`, `tx` types |
| `<feature>.schema.ts` | Zod request and response schemas. `type X = z.infer<typeof …>` — the schema is the type | May import `zod`, shared brand types |
| `<feature>.mapper.ts` | Row → DTO. **`Prisma.Decimal` becomes a decimal string here**, never later | May import DTO types, `Decimal` helpers |
| `<feature>.errors.ts` | Feature-specific domain errors, each carrying its registry code | Inherit from a shared `DomainError` base |
| `<feature>.container.ts` | Awilix registrations for this feature | Registers factories, not instances |
| `index.ts` | Public surface: router and service only. **Never the repository.** | Consumed by the composition root and by sibling features |

**Where each layer lives on this project's flows:**

| Concern | `*.rules.ts` | `*.service.ts` |
|---|---|---|
| Slot classification (`free` / `taken` / `closed`) — FR-008, FR-009 | `availability.rules.ts` — given `openingTime`, `closingTime` and a set of existing bookings, decide the state of each hour | `availability.service.ts` — reads bookings for the date, calls the rule with the venue's hours |
| Pricing arithmetic (`unitPrice × durationHours`, tax half-up, total) — FR-024, FR-026 | `pricing/pricing.rules.ts` — `quote(unitPrice, hours, taxPercent) → { subtotal, taxAmount, total }` | `bookings.service.ts` — reads court + venue, calls `quote`, writes the row |
| Cancellation-window comparison — FR-031 | `bookings.rules.ts` — `isInsideWindow(now, startsAt, windowHours)` (the client re-runs the same rule; see [`../FE/fe-architecture.md`](../FE/fe-architecture.md) §6) | `bookings.service.ts` — resolves `clock.now()`, calls the rule |
| Which error a set of facts implies (out-of-hours, outside horizon, below minimum, court in maintenance) | `bookings.rules.ts` — returns a typed error kind | `bookings.service.ts` — throws the corresponding `DomainError` |
| Half-open interval `[startsAt, endsAt)` boundary logic | `availability.rules.ts`, `bookings.rules.ts` | Neither. The half-open boundary is a shared rule concern |
| Transaction open, exclusion-violation catch, Prisma-error translation | — | `bookings.service.ts` — the only place `PrismaClientKnownRequestError` is caught |

> `Date` is banned in `*.rules.ts` by the linter. The service resolves the clock and passes the instant in. This is the single rule that makes every branch of the cancellation-window and availability logic testable without freezing time or spinning a fake DB.

## 4. Import rules — what the linter enforces

`no-restricted-imports` in `*.rules.ts` (see [`./lint.md`](./lint.md) §7) blocks `@prisma/*`, `.prisma/*`, `**/prisma*`, `express`, `express-*`, `@types/express`, `axios`, `node-fetch`, `undici`, `fs`, `fs/*`, `child_process`. `no-restricted-globals` blocks `Date` and `fetch`. `no-restricted-properties` blocks `Math.random`.

Additional boundaries enforced by `eslint-plugin-import` and file-scoped
`no-restricted-imports`:

| From | May not import | Enforced by | Why |
|---|---|---|---|
| `*.routes.ts` | `*.repository.ts` (of any feature) | `no-restricted-imports` pattern | Routes call controllers; a repository call from a route bypasses schema validation and error translation |
| `*.controller.ts` | `prisma`, `.prisma/*`, `@prisma/*` | same | Controllers must go through the service. A raw Prisma call here dodges the transaction helper and the error translation |
| `*.controller.ts` | Another feature's internals (anything not re-exported from `index.ts`) | `no-restricted-paths` | Cross-feature imports through public surfaces only |
| `*.service.ts` | Another feature's `*.repository.ts` directly | `no-restricted-paths` | If bookings needs court data, it goes through `courts/index.ts` (the service), not the repository |
| `*.mapper.ts` | `express`, `@types/express`, any Prisma client type in the **return** type | `no-restricted-imports` + a shared `Dto<T>` brand | Mappers exist so `Prisma.Decimal` never leaks out; a `Decimal` return type undoes that |
| `index.ts` (feature) | `*.repository.ts` | `no-restricted-imports` | The public surface is router + service; siblings must not reach the repo |

> `moduleResolution: NodeNext` under ESM means imports are written `./courts.routes.js` while the file on disk is `courts.routes.ts`. Everyone hits it once — the tsc error is clear (`Cannot find module …`), the fix is to add `.js`. Recorded in [`./be-stack.md`](./be-stack.md) §7 alongside the other traps.

## 5. Container wiring — Awilix, per-request scope

The root container lives at `src/container.ts` and is composed once at boot:

```ts
// src/container.ts
import { asClass, asFunction, asValue, createContainer, InjectionMode } from 'awilix';
import type { Cradle } from './config/types.js';
import { registerVenues } from './features/venues/venues.container.js';
import { registerCourts } from './features/courts/courts.container.js';
import { registerBookings } from './features/bookings/bookings.container.js';
import { registerUsers } from './features/users/users.container.js';
// ...

export const buildContainer = () => {
  const root = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  root.register({
    config: asFunction(loadConfig).singleton(),
    prisma: asFunction(makePrisma).singleton().disposer((c) => c.$disconnect()),
    clock:  asValue({ now: () => new Date() }),           // the ONE place `new Date()` lives
    logger: asFunction(makeLogger).singleton(),
  });
  registerVenues(root);
  registerCourts(root);
  registerBookings(root);
  registerUsers(root);
  return root;
};
```

Each request opens a scope from the root:

```ts
// src/http/scope.ts (middleware)
app.use((req, res, next) => {
  const scope = req.app.locals.root.createScope();
  scope.register({
    requestId: asValue(req.header('x-request-id') ?? newUlid('req_')),
    userId:    asValue(req.header('x-user-id') ?? null),   // auth is out of scope this release
  });
  req.scope = scope;
  next();
});
```

The `Cradle` interface is the compile-time typo trap:

```ts
// src/config/types.ts
export interface Cradle {
  config: Config;
  prisma: PrismaClient;
  clock: { now(): Date };
  logger: Logger;
  requestId: string;
  userId: string | null;
  venuesService: VenuesService;
  courtsService: CourtsService;
  availabilityService: AvailabilityService;
  bookingsService: BookingsService;
  usersRepository: UsersRepository;
  // ...
}
```

> A wrong dependency name is now a compile error, not a runtime `AwilixResolutionError`. The recurring runtime "check every registration name matches" parity test is *unnecessary* under strict Awilix + a typed `Cradle` — deleted by construction.

## 6. Router assembly and middleware order

**Order is not advisory.** The list below is exact; §2 of [`../error-handling.md`](../error-handling.md) names two of these explicitly.

```ts
// src/app.ts
export const buildApp = (root: AwilixContainer<Cradle>) => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));   // 1. CORS
  app.use(helmet({ contentSecurityPolicy: false }));                // 2. Security headers
  app.use(correlationIdMiddleware);                                 // 3. requestId in scope + response header  ← must precede everything that logs
  app.use(requestLogger);                                           // 4. pino-http bound with requestId
  app.use(scopeMiddleware(root));                                   // 5. per-request Awilix scope
  app.use(express.json({ limit: '32kb' }));                         // 6. JSON body ← after scope, so parse-failures still log the requestId
  app.use('/api/v1', apiRouter);                                    // 7. The mounted router
  app.use(notFoundMiddleware);                                      // 8. Unmatched → 404 envelope
  app.use(errorMiddleware);                                         // 9. The ONE error middleware. Must be last
  return app;
};
```

| Position | Middleware | If it moves earlier | If it moves later |
|---|---|---|---|
| 3 | `correlationIdMiddleware` | — | Any earlier middleware that logs (there aren't any today) would emit lines with no `requestId`; the failure state on the client (FR-017) shows an id that can't be found in the logs |
| 5 | `scopeMiddleware(root)` | — | A controller that resolves `bookingsService` from `req.scope` gets `undefined` |
| 6 | `express.json()` | — | A malformed JSON body throws before `requestId` is set (§2 of `error-handling.md`) |
| 9 | `errorMiddleware` | Errors from later middleware bypass it entirely | — |

> The classic Express trap — `express.json()` before an auth handler — does not bite us because auth is out of scope this release. The equivalent order trap here is `express.json()` before `correlationIdMiddleware`: a client sees `requestId: null` on a JSON parse failure and has nothing to quote to support. The order above pins it.

`apiRouter` composes each feature's `router` from its `index.ts`:

```ts
// src/features/index.ts
apiRouter.use(venuesRouter);
apiRouter.use(courtsRouter);
apiRouter.use(bookingsRouter);
```

## 7. Configuration and NFR-013

`config/env.ts` validates `process.env` with Zod at boot. Per-venue settings (tax rate, cancellation window, booking horizon, minimum duration, opening/closing hours) come from the `venues` row, resolved by `venues.service.ts`, and are injected into `bookings.service.ts` via the scope so a hot change updates behaviour without a redeploy (NFR-013).

Copy that interpolates a setting (§4 of [`../error-handling.md`](../error-handling.md), FR-023, FR-031) reads the same value from the same source. Two hardcoded `12`s is exactly the drift NFR-013 exists to prevent.

## 8. How to add a feature

1. Create `src/features/<name>/` with the ten files listed in §3. Empty file is fine; delete before merge if unused.
2. Register in the root container by adding one line to `src/container.ts` and writing `<name>.container.ts`.
3. Add `{router, service}` to the feature's `index.ts` and mount the router in `src/features/index.ts`.
4. Mirror the folder under `tests/unit/features/<name>/` (SR-2 parity script fails otherwise).
5. Update the ERD in `../data-spec.md` §2 if the feature introduces a table.
6. Add every new error to `../error-handling.md` §3 and §4 (S3), and reference the requirement id (`FR-nnn`) in the feature document (`features/<name>.md`, S4).

## 9. What lives where — quick lookup

| Concern | File |
|---|---|
| The one place `new Date()` runs | `src/container.ts` (`clock`) |
| The one place `PrismaClientKnownRequestError` is caught | `src/features/bookings/bookings.service.ts` |
| The one place an HTTP status is decided | `src/http/error.ts` (via the code → status map in `../error-handling.md` §3) |
| The one place `Prisma.Decimal` becomes a string | `src/features/*/*.mapper.ts` |
| The one place a request id is generated | `src/http/correlationId.ts` |
| The one place opening hours are read | `src/features/venues/venues.service.ts` (and cached per-request via scope) |

# Lapangin — Phases

**Stage:** S6 · **Owns:** the order of work · **Tracks:** backend + frontend · Conventions: [`../references/conventions.md`](../references/conventions.md) · Strict rules: [`./strict-rules.md`](./strict-rules.md) · Errors: [`./error-handling.md`](./error-handling.md)

Five phases, one shared file, two tracks. Every phase closes with tests written the same phase, not later ([`./strict-rules.md`](./strict-rules.md) SR-5). The hardest guarantee — `bookings_no_overlap` under real parallelism (NFR-001) — sits in **Phase 1**, right after the migration that creates it and long before the endpoint that depends on it. That is the rule the whole ordering exists to serve.

---

## 0. Decisions

Every open product decision that could still change the shape of the work. Nothing starts on an undecided dependency.

| # | Decision | Status | Blocks | Recorded in |
|---|---|---|---|---|
| D-1 | **Payments capture is out of scope this release.** `bookings.payment_status` exists but stays `pending`; no gateway integration, no refund path | **settled** | — | `brd.md` §4, [`./data-spec.md`](./data-spec.md) §5.6, §7, §9; [`./BE/features/bookings.md`](./BE/features/bookings.md) §2 |
| D-2 | **Multi-venue is schema-only; the UI ships one venue.** `venue_id` is present on every downstream table so the second venue is a data change, not a schema change. The URL already carries the slug (`/v/:slug`) | **settled** | — | [`./data-spec.md`](./data-spec.md) §2, §9; [`./FE/fe-architecture.md`](./FE/fe-architecture.md) §7 |
| D-3 | **Currency is IDR with exponent 0.** Rupiah has no sub-unit; `Rp 180.000` is one hundred eighty thousand rupiah, not one hundred eighty thousand point-zero. The storage type is still `NUMERIC(12,2)` because tax on `Rp 180.000` × 3 × 11.00% is `Rp 59.400,00` in the intermediate — the second decimal exists for rounding, not for display | **settled** | — | [`./data-spec.md`](./data-spec.md) §5.6, §8; `formatIDR` in [`./FE/design-system.md`](./FE/design-system.md) §4.1 renders whole rupiah |
| D-4 | **Venue timezone is a column on `venues`, never a server constant.** Every local↔instant conversion reads `venues.timezone`; `bookings.venue_timezone` snapshots the id at write | **settled** | — | [`./data-spec.md`](./data-spec.md) §8 (NFR-003); [`./BE/be-architecture.md`](./BE/be-architecture.md) §9 |
| D-5 | **Identity comes from an `X-User-Id` stub header this release.** No verified session, no signed cookie, nothing on the wire that a client cannot fabricate. This is a **release blocker** — the header must be replaced by a verified session **before production**. Phase 4 pins the boot-time refusal and the release checklist row that keeps this from silently shipping | **temporary; blocks release** | Production go-live | [`./BE/features/README.md`](./BE/features/README.md) §3; [`./BE/be-architecture.md`](./BE/be-architecture.md) §5 |

> D-5 is the one row on this page that ships red. `X-User-Id` is a client-supplied claim of identity with nothing verifying it; anyone can read or write any user's booking by changing a header. NFR-005 (non-enumerability) is meaningless while that stays true. The SRS is silent on the authentication *mechanism* — it scopes out the sign-in screens (PRD §7) while the review screen still requires an authenticated user. Closing that gap is a requirements change, tracked here so it is not confused with an implementation detail.

## 1. Phase map

Five phases. Backend and frontend interleave — the frontend shell starts on day one against fixture data, then wires to real endpoints as they land.

```
P0 Scaffold + envelope     ─┬─► P1 Constraint + rules     ─┐
                            │                              │
FE shell (loading/empty/    │                              ├─► P2 Read path ─► P3 Write path ─► P4 Hardening
error/404 skeletons)        │                              │
                            └──────────────────────────────┘
```

| # | Phase | BE scope | FE scope | Relative size | Prerequisites |
|---|---|---|---|---|---|
| **P0** | Scaffold + envelope | Express app, correlation id, error middleware, health check, Prisma init, Awilix root, Zod-validated env | Vite app, tokens, layout, router, `api/client.ts` + envelope parser, four shared state cards | S | — |
| **P1** | Guarantee + purity | `bookings_no_overlap`, migration, seed, pure `pricing.rules.ts`, pure `availability.rules.ts`, pure `bookings.rules.ts` (cancellation window) | — | M | P0 |
| **P2** | Read path | `GET /venues/:slug`, `GET /venues/:slug/courts` (availability strip) | `CourtsScreen` filled/loading/empty/error against the real endpoint | M | P1 |
| **P3** | Write path | `GET /quote`, `POST /venues/:slug/bookings`, `GET /bookings/:id` | `ReviewScreen` normal/slot-taken/invalid/short-notice | L | P2 |
| **P4** | Hardening + identity guard | Boot-refusal for `NODE_ENV=production` + `X-User-Id`, axe-core in E2E, size-limit budget, cross-track E2E on every mockup state | Same E2E and a11y | S | P3 |

**Critical path:** P0 → P1 → P2 → P3 → P4. Every phase gates the next because each proves a guarantee the next depends on. P1 finishes the migration before P2 needs to read from it; P2 finishes the read endpoints before P3 mutates against them; P3 finishes the write path before P4 exercises the whole journey in Chromium.

**Runs in parallel:** the FE shell in P0 (loading, empty, error, 404) needs no backend and unblocks screen work while P1 is on. Inside P2 and P3, the FE screen work runs in parallel with the BE endpoint work once the request/response shape in the feature doc is agreed — the FE reads its own MSW fixtures until the endpoint lands, then flips its `queryFn` to the real URL.

---

## Phase 0 — Scaffold + error envelope

**Goal:** A running app that returns the exact error envelope from [`./error-handling.md`](./error-handling.md) §1 on every failure, boots when the env is valid, refuses to boot when it is not, and echoes an `X-Request-Id` on every response.

| Area | Files |
|------|-------|
| BE root | `package.json`, `tsconfig.json`, `eslint.config.js`, `.env.example`, `prisma/schema.prisma` (empty), `src/server.ts`, `src/app.ts`, `src/container.ts`, `src/config/env.ts`, `src/config/types.ts` |
| BE http | `src/http/correlationId.ts`, `src/http/error.ts`, `src/http/notFound.ts`, `src/http/logger.ts`, `src/http/scope.ts` |
| BE db | `src/db/prisma.ts`, `src/db/tx.ts` |
| BE tests | `tests/helpers/container.ts`, `tests/helpers/db.ts`, `tests/helpers/request.ts`, `tests/helpers/time.ts`, `tests/unit/http/correlationId.test.ts`, `tests/unit/http/error.test.ts`, `tests/unit/config/env.test.ts` |
| FE root | `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `src/main.tsx`, `src/App.tsx`, `src/router.tsx`, `src/queryClient.ts` |
| FE styles | `src/styles/tokens.css` (from [`./FE/design-system.md`](./FE/design-system.md) §2), `src/styles/base.css` (from `mockup/styles.css`) |
| FE api | `src/api/client.ts`, `src/api/envelope.ts`, `src/api/errors.ts`, `src/api/money.ts` (`formatIDR`), `src/api/time.ts` |
| FE layout | `src/layout/Layout.tsx`, `src/layout/Header.tsx`, `src/layout/Footer.tsx` |
| FE shells | `src/features/courts/LoadingState.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `src/pages/NotFound.tsx` |

### Exit criteria

- [x] `pnpm check` passes with zero warnings on both packages (`eslint --max-warnings=0`)
- [x] Removing `DATABASE_URL` from the env fails at **boot**, not on first request — `tests/unit/config/env.test.ts` asserts the boot throws
- [x] `GET /health` returns `{ "data": { "status": "ok" }, "meta": { "requestId": "req_01…" } }` with an `X-Request-Id` response header
- [x] Any unhandled thrown `Error` inside a controller becomes `500 E-INTERNAL` with the envelope, no stack trace in the body — asserted by `tests/unit/http/error.test.ts` (NFR-006)
- [x] Every response carries a `requestId` — asserted by REG-006 setup (`correlationIdMiddleware` mounted before `express.json()`; see [`./BE/be-architecture.md`](./BE/be-architecture.md) §6)
- [x] The FE renders `<LoadingState/>` and `<ErrorState requestId="req_01JTEST"/>` from Storybook-less fixture props with axe-core reporting zero violations (NFR-011, FR-015, FR-017)
- [x] `/` and unknown routes render `<NotFound/>`; `/v/:slug` mounts `<Layout/>` with the header and footer from the mockup — no data yet
- [x] `tests/unit/api/money.test.ts` passes `formatIDR("180000.00") === "Rp 180.000"` (FR-032) — the one function that survives from `mockup/data.js`
- [x] `docs/error-handling.md` is committed unchanged in both repos; no code refers to a code not in §3

> The trap this phase closes is retrofitting the envelope. Every later phase throws domain errors and expects the envelope to serialise them; if we ship a feature first and the envelope second, every controller written up to that point has an inline `res.status(...)` that will not survive review. Cheap here — one middleware and one integration test — vs. touching every service later.

---

## Phase 1 — Guarantee + purity

**Goal:** Two concurrent overlapping inserts against the same court resolve to one success and one Postgres `exclusion_violation`, translated by exactly one place to `409 E-BOOKING-SLOT-TAKEN`. The pure `*.rules.ts` layer computes every figure on `booking-review.html` from real inputs.

| Area | Files |
|------|-------|
| BE migrations | `prisma/migrations/0000_extensions.sql` (`pgcrypto`, `btree_gist`, `citext`), `prisma/migrations/0001_init/migration.sql` (venues, courts, amenities, court_amenities, users, bookings, `period` generated column, `bookings_no_overlap`) |
| BE seed | `prisma/seed.ts` — loads [`./data-spec.md`](./data-spec.md) §10 exactly |
| BE features | `src/features/bookings/pricing/pricing.rules.ts`, `src/features/bookings/bookings.rules.ts` (`isInsideCancellationWindow(now, startsAt, windowHours)`), `src/features/courts/availability/availability.rules.ts` (`classifySlot`) |
| BE domain errors | `src/features/bookings/bookings.errors.ts` (`SlotTakenError`, `CourtNotBookableError`, `OutOfHoursError`, `OutsideHorizonError`, `DurationBelowMinError`, `BookingNotFoundError`) |
| BE tests | `tests/unit/features/bookings/pricing/pricing.rules.test.ts`, `tests/unit/features/bookings/bookings.rules.test.ts`, `tests/unit/features/courts/availability/availability.rules.test.ts`, `tests/regression/REG-001-bookings-concurrent-double-insert.test.ts`, `tests/regression/REG-002-bookings-price-immutable.test.ts`, `tests/regression/REG-004-prisma-decimal-serialisation.test.ts`, `tests/regression/REG-007-court-closed-vs-taken.test.ts` |
| FE (parallel) | Existing shells stay; no new files this phase — waiting on P2 endpoints |

### Exit criteria

- [x] `pnpm prisma migrate deploy` on a fresh database creates the three extensions, six tables, and the `bookings_no_overlap` exclusion constraint — asserted by an integration test that `\d+ bookings` names the constraint
- [x] `pricing.rules.ts` `quote("180000.00", 2, "11.00")` returns `{ subtotal: "360000.00", taxAmount: "39600.00", total: "399600.00" }` exactly — matches [`./BE/features/bookings.md`](./BE/features/bookings.md) §1 figure check and every screen figure (`Rp 180.000`, `Rp 360.000`, `Rp 39.600`, `Rp 399.600`)
- [x] `pricing.rules.ts` `quote("65000.00", 3, "11.00")` returns `{ subtotal: "195000.00", taxAmount: "21450.00", total: "216450.00" }` — rounding fires once, after tax, half-up
- [x] `availability.rules.ts` with `openingTime="06:00"`, `closingTime="23:00"` and no bookings classifies `05:00` and `23:00` as `closed`, every hour in `[06:00, 23:00)` as `free` (REG-007, FR-009)
- [x] `bookings.rules.ts` `isInsideCancellationWindow` returns `true` when `now = startsAt - 11h`, `false` when `now = startsAt - 12h` exactly, and `false` when `now = startsAt - 13h` — the boundary is half-open, matching FR-031
- [x] **REG-001-bookings-concurrent-double-insert** — 20 parallel raw inserts (no HTTP yet; direct through the repository once wired, but proven earliest by a direct `prisma.$transaction` in the regression file) for the same `(courtId, bookingDate, startTime, duration)` produce exactly one success and 19 constraint rejections that are `exclusion_violation` (SQLSTATE 23P01) or `deadlock_detected` (SQLSTATE 40P01 — Postgres tearing down one side of a race on the same key); `SELECT count(*) FROM bookings` grew by exactly `1` (NFR-001). **Spec correction:** the original text expected only 23P01; empirical runs on Postgres 16 return a mix of 23P01/40P01 depending on which insert wins the SIREAD race, and both outcomes prove the constraint held — the P3 service translates both to `E-BOOKING-SLOT-TAKEN`, addressing R-1
- [x] **REG-002-bookings-price-immutable** — after the seed, `UPDATE courts SET price_per_hour = '250000.00' WHERE id = <futsal-a>`, a booking created before the update still reports `"180000.00" × 2 = "360000.00"` and total `"399600.00"` (NFR-002)
- [x] **REG-004-prisma-decimal-serialisation** — asserts every `*.mapper.ts` return type has no `Prisma.Decimal` in it and that `typeof cost.subtotalAmount === "string"` on the wire (§7 traps of [`./BE/be-stack.md`](./BE/be-stack.md))
- [x] **REG-007-court-closed-vs-taken** — pure unit test, no fakes (SR-7)
- [x] Every service constructible with plain-object fakes, no container, no database — SR-1 acceptance test in place per [`./BE/testing.md`](./BE/testing.md) §3.2
- [x] `pnpm check`, `pnpm test` both green; unit coverage floor 100% on every `*.rules.ts` per [`./BE/testing.md`](./BE/testing.md) §7 — `pnpm run test:coverage:rules` runs c8 with `--lines=100 --branches=100 --functions=100 --statements=100` scoped to `src/features/**/*.rules.ts`

> This is the phase the rest of the plan bends around. If `EXCLUDE USING gist` behaves differently under the parallelism we plan to test — a driver quirk, a Prisma quirk, a missed `CREATE EXTENSION` — every write in P3 rests on a promise the database is not making. Finding out here means changing the migration; finding out in P3 means reshaping the write path around the wrong guarantee. And the pure rules are here rather than in P3 because a wrong tax number ships silently — a check-suite that pins the four screen figures now blocks every future refactor from drifting the arithmetic.

---

## Phase 2 — Read path

**Goal:** `courts.html?state=filled` renders end-to-end against the real API and the seed. Every figure on the screen appears in the response body byte-for-byte.

| Area | Files |
|------|-------|
| BE venues | `src/features/venues/{routes,controller,service,repository,schema,mapper,errors,container,index}.ts` |
| BE courts | `src/features/courts/{routes,controller,service,repository,schema,mapper,errors,container,index}.ts`, `src/features/courts/availability/{service,repository,index}.ts` |
| BE mount | `src/features/index.ts` composes `venuesRouter`, `courtsRouter` under `/api/v1` |
| BE tests | `tests/unit/features/venues/*.test.ts`, `tests/unit/features/courts/*.test.ts`, `tests/integration/features/venues/venues.routes.test.ts`, `tests/integration/features/courts/courts.routes.test.ts`, `tests/regression/REG-008-court-horizon-date.test.ts`, `tests/regression/REG-010-venue-settings-copy.test.ts` |
| FE courts feature | `src/features/courts/{CourtsScreen,CourtList,CourtCard,AvailabilityStrip,SlotChip,FilterBar,useCourts,courts.schema,courts.rules,index}.tsx`, `src/hooks/useSettings.ts` |
| FE tests | `tests/unit/features/courts/*.test.tsx`, `tests/e2e/courts.spec.ts` (four states) |

### Exit criteria

- [x] `GET /api/v1/venues/gor-kemang` against the seed returns the exact body in [`./BE/features/venues.md`](./BE/features/venues.md) §1 — `taxPercent: "11.00"`, `cancellationWindowHours: 12`, `bookingHorizonDays: 30`, `minimumDurationMinutes: 60`, `openingTime: "06:00"`, `closingTime: "23:00"`
- [x] `GET /api/v1/venues/gor-kemang/courts?date=2026-09-27&startTime=10:00&duration=2` returns three items in `display_order`; Futsal A has slot chips with `08:00`, `09:00`, `19:00` taken and every other hour in `[06:00, 23:00)` free (matches `mockup/data.js` taken/free semantics — see spec correction). **Spec correction:** the criterion said "eight slot chips" mirroring the mockup's truncated illustration; the derived strip returns all 17 hours in `[06:00, 23:00)` per `classifySlot`, matching the algorithm the mockup was meant to illustrate. The 3 taken chips and the maintenance-court empty-slots contract are unchanged
- [x] `GET /api/v1/venues/gor-kemang/courts?date=<today+31>` returns `400 E-OUTSIDE-HORIZON` with `details[].code = "beyond_horizon"`; `<today+30>` returns `200` — **REG-008-court-horizon-date**
- [x] `UPDATE venues SET cancellation_window_hours = 24` changes `data.cancellationWindowHours` on the next call to `24` — **REG-010-venue-settings-copy** (NFR-013)
- [x] `GET /api/v1/venues/does-not-exist` returns `404 E-VENUE-NOT-FOUND`
- [x] A court with `status = 'maintenance'` returns an **empty** `slots[]` array and a non-null `maintenanceReason`, `maintenanceUntil` (FR-006) — asserted by `tests/integration/features/courts/courts.routes.test.ts` "a maintenance court has empty slots[]…"
- [x] `sport=Semua` is rejected with `400 E-VALIDATION`; the FE client removes the param instead, so a real UI never sends the literal ([`./BE/features/courts.md`](./BE/features/courts.md) §1 notes)
- [x] Every server-owned key rejected by `.strict()` on the query schema — a query with `?taxPercent=0` returns `400 E-VALIDATION` with a details row for the extra key
- [x] FE `CourtsScreen` renders every acceptance criterion in [`./FE/features/courts.md`](./FE/features/courts.md) §7.1–§7.4 against the real backend; `tests/e2e/courts.spec.ts` passes
- [x] `axe-core/playwright` reports **zero** violations on `filled`, `loading`, `empty`, `error` (NFR-011)
- [x] The four `screenshots/courts-*.png` states are all reachable from the running app
- [x] FE payload budget check — `pnpm size` under 180 KB gzipped (NFR-010)

> The trap here is drift between the response body and the mockup. The seed is fixed in [`./data-spec.md`](./data-spec.md) §10 for exactly this reason: a reviewer holds `mockup/courts.html?state=filled` next to the running app and sees the same seventeen chips in the same order, or one of them is wrong.

---

## Phase 3 — Write path

**Goal:** `booking-review.html` in every one of its four states drives a real `POST /bookings`, snapshots price and tax, and refuses a taken slot from the database — not from a service check.

| Area | Files |
|------|-------|
| BE bookings | `src/features/bookings/{routes,controller,service,repository,schema,mapper,container,index}.ts`, quote sub-path in `bookings.service.ts` |
| BE users | `src/features/users/{repository,container,index}.ts` (prefill only; PRD §7) |
| BE tests | `tests/unit/features/bookings/{bookings.service,bookings.mapper}.test.ts`, `tests/integration/features/bookings/bookings.routes.test.ts` (includes REG-001 through HTTP), `tests/regression/REG-003-booking-not-found-vs-forbidden.test.ts`, `tests/regression/REG-005-bookings-strict-extra-field.test.ts`, `tests/regression/REG-006-correlation-id-precedes-json.test.ts`, `tests/regression/REG-009-booking-quote-matches-mockup.test.ts` |
| FE review feature | `src/features/review/{ReviewScreen,Breadcrumb,ScheduleCard,BookerForm,CancellationPolicy,CostBreakdown,LockNote,Banners,SubmitBar,useDraftBooking,useCreateBooking,review.schema,review.rules,index}.tsx`, `src/hooks/useUser.ts` (stub prefill) |
| FE types | `src/types/dto.ts` — `Money = string & { readonly __money: unique symbol }` brand |
| FE tests | `tests/unit/features/review/*.test.tsx`, `tests/e2e/booking-review.spec.ts` (four states) |

### Exit criteria

- [x] `GET /api/v1/venues/gor-kemang/courts/<futsal-a-id>/quote?date=2026-09-27&startTime=10:00&duration=2` returns `unitPrice: "180000.00"`, `subtotalAmount: "360000.00"`, `taxAmount: "39600.00"`, `totalAmount: "399600.00"` — **REG-009-booking-quote-matches-mockup**
- [x] `POST /api/v1/venues/gor-kemang/bookings` with `{"totalAmount":"1"}` in the body returns `400 E-VALIDATION` — **REG-005-bookings-strict-extra-field** (`.strict()` on the schema, [`./BE/be-stack.md`](./BE/be-stack.md) §7 row 8)
- [x] `POST /api/v1/venues/gor-kemang/bookings` with a malformed JSON body (`{"broken":`) returns `400` with `requestId: "req_01…"` in the body **and** the same id in the log line — **REG-006-correlation-id-precedes-json**
- [x] Fires 20 `POST /venues/gor-kemang/bookings` for the same slot in parallel via `Promise.all`: exactly one returns `201`, 19 return `409 E-BOOKING-SLOT-TAKEN`; `SELECT count(*) FROM bookings` grew by `1` — **REG-001 through the HTTP surface** (NFR-001; REG-001 file already exists from P1, now with the routes wired)
- [x] User A creates a booking; user B (`X-User-Id: <different-uuid>`) `GET /bookings/<id>` receives byte-for-byte the same response as `GET /bookings/<random-uuid>`: `404`, code `E-BOOKING-NOT-FOUND`, identical `data` and `error.message` — **REG-003-booking-not-found-vs-forbidden** (NFR-005)
- [x] The response body from `POST /venues/gor-kemang/bookings` mirrors the shape of `GET /bookings/:id` — the review screen re-renders from the mutation without a second fetch ([`./BE/features/bookings.md`](./BE/features/bookings.md) §2)
- [x] Every server-owned field (`id`, `unitPrice`, `subtotalAmount`, `taxPercent`, `taxAmount`, `totalAmount`, `currency`, `venueTimezone`, `endTime`, `durationHours`, `startsAt`, `endsAt`, `status`, `paymentStatus`, `createdAt`, `updatedAt`, `cancelledAt`, `userId`) rejected with `400 E-VALIDATION` when sent by a client ([`./BE/features/README.md`](./BE/features/README.md) §7)
- [x] FE `ReviewScreen` renders every acceptance criterion in [`./FE/features/booking-review.md`](./FE/features/booking-review.md) §7.1–§7.4: normal, slot-taken (form values preserved — FR-029), invalid input (offending field focused, banner announced), short-notice advisory (submittable — FR-031)
- [x] `tests/e2e/booking-review.spec.ts` passes; `axe-core/playwright` reports zero violations on all four states (NFR-011)
- [x] The three `screenshots/review-*.png` states are all reachable from the running app
- [x] `POST /bookings` success and `409 E-BOOKING-SLOT-TAKEN` both invalidate `['courts', slug, ...]` — the strip refreshes on both paths so the winner is visible (side effect from [`./BE/features/bookings.md`](./BE/features/bookings.md) §2)

> Two traps this phase names aloud. First, an application-level "is the slot taken" pre-check between a `SELECT` and the `INSERT` — a race the constraint exists to close. The service inserts, catches `PrismaClientKnownRequestError` code `P2004` (`exclusion_violation`) in `bookings.service.ts`, and translates once. Second, mounting `express.json()` before `correlationIdMiddleware` — the `requestId` in the FR-017 banner would be `null` on a JSON parse failure, and the whole correlation story breaks silently on the request most likely to fail parsing. REG-006 is here to keep both trap doors bolted.

---

## Phase 4 — Hardening + identity guard

**Goal:** The `X-User-Id` stub cannot silently ship to production; every state in `mockup/` has an E2E; the payload budget and a11y floors are green under CI.

| Area | Files |
|------|-------|
| BE guard | `src/config/env.ts` — refuse boot when `NODE_ENV=production` and `AUTH_STUB_ENABLED` is `true` (or `AUTH_SESSION_URL` is unset) |
| BE tests | `tests/unit/config/env.test.ts` extended; `tests/e2e/*.spec.ts` full journeys |
| FE tests | `tests/e2e/*.spec.ts` with `axe-core/playwright` on every state |
| CI | `.github/workflows/ci.yml` (or equivalent) runs `pnpm check`, `pnpm test`, `pnpm e2e`, `pnpm size` on every branch; branch protection requires green |
| Release checklist | `docs/release-checklist.md` (small) with the one row that gates production on D-5 being resolved |

### Exit criteria

- [x] Setting `NODE_ENV=production` with `AUTH_STUB_ENABLED=true` (or unset session config) fails at **boot** with a message naming `X-User-Id`, not on first request — `tests/unit/config/env.test.ts` asserts this
- [x] The release checklist has one row: **"D-5 resolved: `X-User-Id` header replaced by a verified session; NFR-005 asserted end-to-end against a real session cookie."** Unchecked, release is refused
- [x] Every state in `screenshots/` (7 files: `courts-empty`, `courts-error`, `courts-filled`, `courts-loading`, `review-invalid`, `review-normal`, `review-slot-taken`) is reachable from the running app and hit by an E2E
- [x] `axe-core/playwright` reports **zero** violations across all E2E specs (NFR-011)
- [x] `pnpm size` fails the CI job over 180 KB gzipped (NFR-010)
- [x] `scripts/check-test-mirror.mjs` reports no missing test file — `tests/` mirrors `src/` exactly (SR-2)
- [x] Every regression file `REG-001`..`REG-010` has run green in the last 24 hours ([`./BE/testing.md`](./BE/testing.md) §4)
- [ ] Availability latency measured under seeded production-scale data: `GET /venues/gor-kemang/courts?date=…` returns within **300 ms** server time at p95 (NFR-008)
- [ ] Perceived responsiveness: `<LoadingState/>` paints within **100 ms** of a pending request (NFR-009)
- [ ] No `TODO` in source anywhere — `sonarjs/todo-tag` blocks the commit; every deferred item is here ([`./strict-rules.md`](./strict-rules.md) SR-5, [`./BE/be-stack.md`](./BE/be-stack.md) §2)

> D-5 is the row this phase exists for. Every earlier phase runs against the stub because it must — sign-in is scoped out (PRD §7) and no phase gets to invent a session mechanism the requirements are silent on. But shipping the stub to production violates NFR-005; the guard here refuses that outcome at boot time so no operator can accidentally set the environment variable that opens it.

---

## 2. Definition of done — applied per phase, never deferred

| Area | Requirement |
|---|---|
| Lint | `pnpm check` passes with `--max-warnings=0` — the pre-commit hook runs the same command. `warn` blocks a commit ([`./BE/be-stack.md`](./BE/be-stack.md) §2) |
| Tests | Unit for services and rules, integration for endpoints, e2e for the journey, regression when a defect closes. Coverage floors per [`./BE/testing.md`](./BE/testing.md) §7 — 100% on `*.rules.ts`, 90/85 on `*.service.ts`, 80 integration |
| Errors | Domain errors thrown from `<feature>.errors.ts`. **No controller sets a status by hand.** The one error middleware in `src/http/error.ts` is the only place a status is decided |
| Boundaries | No cross-feature repository import. `no-restricted-imports` in [`./BE/lint.md`](./BE/lint.md) §7 enforces it. Public surface is `index.ts` — router + service, never the repository |
| Purity | No `import` of an ORM, `express`, `axios`, `fs`; no reference to `Date`, `fetch`, `Math.random` inside a `*.rules.ts`. The linter refuses ([`./BE/lint.md`](./BE/lint.md) §7, SR-7) |
| Validation | Zod at the route edge with `.strict()` on every body. Services trust their input |
| Deferred work | Recorded on this page. **No `TODO` in source** — `sonarjs/todo-tag` fails the commit ([`../references/conventions.md`](../references/conventions.md) §4) |
| Secrets | Nothing sensitive in a response or a log line (NFR-006). The error middleware strips `err.stack` and `err.cause` |
| Money on the wire | Decimal string (`"180000.00"`), never a JSON number. The client-side branded `Money` type makes `+` a compile error ([`./FE/fe-architecture.md`](./FE/fe-architecture.md) §5) |
| Commits | Authored by the connected account; no co-author trailer, no tool attribution (SR-6) |
| Specification | Any deviation is written back into the feature document **in the same pull request**. `/pspt:trace` verifies the chain |

> The last row matters most. A specification that drifts from the code is worse than no specification, because the next reader trusts it and is wrong.

## 3. Risks

| # | Risk | Threatens | Mitigation |
|---|---|---|---|
| R-1 | `EXCLUDE USING gist` under `Prisma.$transaction` produces a driver error whose shape differs from `PrismaClientKnownRequestError('P2004')` — the translator in `bookings.service.ts` misses it, an `exclusion_violation` surfaces as `500 E-INTERNAL`, and the retry logic on the client hammers a slot that will never open | P1, P3 | REG-001 asserts the error surface at the HTTP boundary in P1 and again in P3, not just at the driver. If the shape differs, the translator is fixed once — in the one place it lives |
| R-2 | The `X-User-Id` stub is set in a staging environment that is then promoted to production without D-5 being resolved | P4, release | The P4 boot-refusal covers accidental promotion; the release checklist row makes it a governance step, not a runtime accident. Both must fail for the stub to ship |
| R-3 | `Prisma.Decimal` serialises to `{}` on some code path the mapper missed — a silent zero on the wire | P1 onward | REG-004 asserts every money field is `typeof === "string"` on real bodies. Mapper return types forbid `Decimal` at compile time ([`../references/conventions.md`](../references/conventions.md) §3 row 5) |
| R-4 | The seed drifts from `mockup/data.js` after a mockup edit — the reviewer holds the screen against the response and sees different numbers | P2 onward | REG-009 pins the four figures on the review screen; REG-007 pins closed-vs-taken on the availability strip. A seed change without a REG-009 update fails CI |
| R-5 | `Asia/Makassar` or `Asia/Jayapura` gives a different result than `Asia/Jakarta` for a boundary hour — the server's zone leaked into a comparison somewhere | P1, P2 | `availability.rules.ts` and `bookings.rules.ts` take the zone as an argument; the service resolves `venues.timezone` and passes it in. Unit tests cross all three IANA ids (NFR-003) |
| R-6 | Payload budget slips past 180 KB after the review screen's react-hook-form + Zod land | P3, P4 | `pnpm size` runs on every branch; over-budget fails CI. `vite-plugin-visualizer` produces `stats.html` so the culprit is one click away ([`./FE/fe-architecture.md`](./FE/fe-architecture.md) §12) |
| R-7 | An E2E flakes on a background `refetch on focus` racing with the assertion | P2, P3 | Every E2E disables focus-refetch with `queryClient.defaultOptions.queries.refetchOnWindowFocus = false` in the test setup; feature parity with production is asserted by a separate integration test, not by an unstable E2E ([`./FE/fe-stack.md`](./FE/fe-stack.md) §7) |

## 4. First week

A sequence, not a schedule. What one engineer starts Monday, and what a second engineer can start in parallel.

| Day | Person A (BE-heavy) | Person B (FE-heavy) |
|---|---|---|
| Mon | P0 — scaffold, env, correlation id, error middleware, `/health`, one integration test asserting the envelope shape | P0 — Vite app, tokens.css from [`./FE/design-system.md`](./FE/design-system.md) §2 verbatim, Layout + Header + Footer + NotFound, `formatIDR` + its round-trip test |
| Tue | P0 — Awilix root, per-request scope, `X-User-Id` and `requestId` bindings; extend the envelope integration test to REG-006 shape | P0 — `<LoadingState/>`, `<EmptyState/>`, `<ErrorState requestId/>` shells rendered from fixture props; axe-core zero-violations on each |
| Wed | P1 — `prisma/migrations/0000_extensions.sql` + `0001_init` including the `period` generated column and `bookings_no_overlap`; `prisma/seed.ts` loads §10 exactly | P0 → P1 wait — flip to writing MSW handlers against the P2 request/response shape in [`./BE/features/venues.md`](./BE/features/venues.md) §1 and [`./BE/features/courts.md`](./BE/features/courts.md) §1 |
| Thu | P1 — `pricing.rules.ts` + tests (both figure checks green); `availability.rules.ts` + REG-007; `bookings.rules.ts` (`isInsideCancellationWindow`) + boundary tests | P1 → P2 — `CourtsScreen` skeleton rendering against MSW; `FilterBar` writing to `useSearchParams` |
| Fri | P1 — REG-001 through the repository layer (no HTTP yet), REG-002, REG-004 in place and green | P2 — `CourtCard`, `AvailabilityStrip`, `SlotChip` in place against MSW; `filled`, `empty`, `loading`, `error` reachable without a backend |

By the following Monday, P1 exit criteria are green and P2 is one endpoint away — Person A moves onto `venues.routes.ts` + `courts.routes.ts` and the FE flips its `queryFn` from MSW to the real URL, one endpoint at a time.

> The first week does not touch `POST /bookings`. That is deliberate: the constraint that decides whether the write is safe (`bookings_no_overlap`) is proven before the write path exists, and the read path is walking against the real backend before either side commits to a wire shape they cannot walk back from.

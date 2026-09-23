# Lapangin — Backend testing

**Stage:** S4 · **Owns:** the four suites, their layout, their shapes, the regression register · Conventions: [`../../references/conventions.md`](../../references/conventions.md) §8 · Strict rules: [`../strict-rules.md`](../strict-rules.md) SR-1, SR-2, SR-5, SR-7

Four suites, one shape, mirroring `src/` exactly. A test is found by transforming a path, not by searching. Coverage is a floor and not a goal — the register (§4) protects the failures already seen; the level tables (§5) name what must be tested where; and the fixtures (§6) exist so nobody hand-writes a booking blob twice.

---

## 1. Suites

| Suite | What it proves | Runs against | Speed |
|---|---|---|---|
| **Unit** | Pure decision logic (`*.rules.ts`) is a function of its inputs, and services orchestrate rules and repositories correctly given fakes | Fakes only. **No container, no database, no clock, no network** | ≤ 3 s for the whole suite |
| **Integration** | The features assemble correctly against the real Prisma client, the real router and the exclusion constraint | Real PostgreSQL (Docker) with `pnpm prisma migrate deploy` applied, real Express app, real Awilix container | ≤ 60 s for the whole suite |
| **End to end** | The user journeys on `courts.html` and `booking-review.html` behave exactly as designed, including every state the mockup ships | Real backend + real frontend + Chromium. `docker compose up` starts Postgres; `pnpm --filter backend seed` loads [`../data-spec.md`](../data-spec.md) §10 | ≤ 3 min for the whole suite |
| **Regression** | One numbered file per closed defect (`REG-nnn`); the fastest suite level at which the defect could be caught. Files are **never deleted** (SR-5) | Whatever level the register (§4) names for it — usually integration | Bounded by the level |

> "Runs against fakes only" for unit is not a nice-to-have. A unit test that reaches for `PrismaClient` or `new Date()` violates SR-1 and SR-7; the test itself is fine, it just belongs in the integration suite.

## 2. Layout

Mirrors `src/` exactly (SR-2). A parity script in CI (`scripts/check-test-mirror.mjs`) walks `src/` and asserts that every source path with `*.rules.ts`, `*.service.ts`, `*.controller.ts`, `*.repository.ts`, `*.mapper.ts`, `*.errors.ts` has a corresponding `tests/unit/…test.ts` or `tests/integration/…test.ts` file. A file is unmatched → CI fails.

```
tests/
  unit/
    features/
      venues/
        venues.service.test.ts
        venues.mapper.test.ts
      courts/
        courts.service.test.ts
        courts.mapper.test.ts
        availability/
          availability.rules.test.ts     ← pure, no fakes
          availability.service.test.ts
      bookings/
        bookings.rules.test.ts           ← pure
        bookings.service.test.ts
        bookings.mapper.test.ts
        pricing/
          pricing.rules.test.ts          ← pure
    http/
      correlationId.test.ts
      error.test.ts
    config/
      env.test.ts
  integration/
    features/
      venues/
        venues.routes.test.ts
      courts/
        courts.routes.test.ts
      bookings/
        bookings.routes.test.ts          ← includes the concurrency test
  e2e/
    courts.spec.ts                       ← the four states of courts.html
    review.spec.ts                       ← the four states of booking-review.html
  regression/
    REG-001-bookings-concurrent-double-insert.test.ts
    REG-002-bookings-price-immutable.test.ts
    REG-003-booking-not-found-vs-forbidden.test.ts
    REG-004-prisma-decimal-serialisation.test.ts
    REG-005-bookings-strict-extra-field.test.ts
    REG-006-correlation-id-precedes-json.test.ts
    REG-007-court-closed-vs-taken.test.ts
    REG-008-court-horizon-date.test.ts
    REG-009-booking-quote-matches-mockup.test.ts
    REG-010-venue-settings-copy.test.ts
  fixtures/
    builders/
      venue.ts     court.ts   booking.ts   user.ts
  helpers/
    container.ts                         ← fake-Cradle factory: buildTestCradle(overrides)
    db.ts                                ← beginTransaction / rollbackAll, seed helpers
    request.ts                           ← supertest wrapper that fills X-User-Id + X-Request-Id
    time.ts                              ← FIXED = new Date('2026-09-25T04:00:00Z')
```

## 3. Unit testing shape

Two shapes, and **only** two. Any unit test that fits neither belongs in integration.

### 3.1 A `*.rules.ts` test — pure, no fakes at all

The single check for `quote` matches the [`../data-spec.md`](../data-spec.md) §10 figure check and the mockup exactly.

```ts
// tests/unit/features/bookings/pricing/pricing.rules.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../../../../../src/features/bookings/pricing/pricing.rules.js';

test('quote — matches booking-review.html figures', () => {
  assert.deepEqual(
    quote('180000.00', 2, '11.00'),
    { subtotal: '360000.00', taxAmount: '39600.00', total: '399600.00' },
  );
});

test('quote — half-up rounding, applied once, after tax', () => {
  // 65000 × 3 × 0.11 = 21450.00 exactly; verifies rounding does not fire prematurely
  assert.deepEqual(
    quote('65000.00', 3, '11.00'),
    { subtotal: '195000.00', taxAmount: '21450.00', total: '216450.00' },
  );
});
```

Pure means pure: no `import { PrismaClient }`, no `new Date()`, no container, no `vi.fn()`. If the rule takes a clock (`isCancellable(now, startsAt, windowHours)`), the test passes the instant as an argument — the value is chosen, not resolved.

### 3.2 A `*.service.ts` test — fakes only

The service resolves the clock and the repository from DI, then calls the rule. Fakes are plain objects, not a mock framework.

```ts
// tests/unit/features/bookings/bookings.service.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBookingsService } from '../../../../src/features/bookings/bookings.service.js';

const FIXED = new Date('2026-09-25T04:00:00Z');
const VENUE = { id: 'v1', slug: 'gor-kemang', timezone: 'Asia/Jakarta', taxPercent: '11.00',
                cancellationWindowHours: 12, bookingHorizonDays: 30, minimumDurationMinutes: 60,
                openingTime: '06:00', closingTime: '23:00', currency: 'IDR' };
const COURT = { id: 'c1', venueId: 'v1', status: 'available', pricePerHour: '180000.00' };

test('create — snapshots price and tax onto the booking (NFR-002)', async () => {
  const inserted: any[] = [];
  const service = buildBookingsService({
    clock:              { now: () => FIXED },
    logger:             { info: () => {}, warn: () => {}, error: () => {} },
    venuesRepository:   { findBySlug: async () => VENUE },
    courtsRepository:   { findByIdInVenue: async () => COURT, lockById: async () => COURT },
    bookingsRepository: { insert: async (row) => { inserted.push(row); return { ...row, id: 'b1', createdAt: FIXED }; } },
    runInTransaction:   async (fn) => fn({} as any),
    ulid:               () => 'req_01JTEST',
  });

  const result = await service.create({
    slug: 'gor-kemang', userId: 'u1',
    input: { courtId: 'c1', bookingDate: '2026-09-27', startTime: '10:00', duration: 2,
             booker: { name: 'Azka', phone: '081211223344', note: null } },
  });

  assert.equal(inserted[0].unitPrice,       '180000.00');
  assert.equal(inserted[0].taxPercent,      '11.00');
  assert.equal(inserted[0].subtotalAmount,  '360000.00');
  assert.equal(inserted[0].taxAmount,       '39600.00');
  assert.equal(inserted[0].totalAmount,     '399600.00');
  assert.equal(inserted[0].currency,        'IDR');
  assert.equal(inserted[0].venueTimezone,   'Asia/Jakarta');
  assert.equal(result.cost.totalAmount,     '399600.00');
});
```

Every branch of the service is reachable this way: a `courtsRepository.lockById` fake that returns `status: 'maintenance'` proves `E-COURT-NOT-BOOKABLE`; a `bookingsRepository.insert` fake that throws `PrismaClientKnownRequestError('P2004')` proves `E-BOOKING-SLOT-TAKEN`. No container. No database. No `Date`.

> A service that **cannot** be constructed this way is violating SR-1. A rule that **needs** a fake is not pure and belongs in the service. Both symptoms have the same cure: move the code across the `rules.ts` / `service.ts` line.

## 4. Regression register

One row per failure mode already seen (or seen on comparable systems and worth pinning up front). Each has an id, a level, a precise assertion, and is cross-linked from the endpoint or component it protects.

| ID | Defect / failure mode | Level | Asserts |
|---|---|---|---|
| **REG-001-bookings-concurrent-double-insert** | Two concurrent inserts for the same court and overlapping window both succeed (BO-1, NFR-001) | Integration | Fires 20 `POST /venues/:slug/bookings` for the same `(courtId, bookingDate, startTime, duration)` in parallel via `Promise.all`; exactly one returns `201`, the other 19 return `409 E-BOOKING-SLOT-TAKEN`; `SELECT count(*) FROM bookings` grew by exactly `1` |
| **REG-002-bookings-price-immutable** | Changing `courts.price_per_hour` alters an existing booking (NFR-002) | Integration | Creates a booking, `UPDATE courts SET price_per_hour = '250000.00' WHERE id = ...`, `GET /bookings/:id` returns the original `"180000.00"` × 2 = `"360000.00"` and total `"399600.00"` |
| **REG-003-booking-not-found-vs-forbidden** | Another user's booking leaks its existence (NFR-005) | Integration | User A creates a booking; user B `GET /bookings/:id` receives byte-for-byte the same body as `GET /bookings/<random-uuid>`: `404`, code `E-BOOKING-NOT-FOUND`, message and `data` identical, no owner name, no owner email, no timestamps |
| **REG-004-prisma-decimal-serialisation** | `Prisma.Decimal` serialises to JSON as `{}` (a silent zero) | Unit (mapper) + integration | The mapper's return type has no `Decimal`; the integration test posts, then reads back, and asserts `typeof cost.subtotalAmount === 'string'` for every money field |
| **REG-005-bookings-strict-extra-field** | `.strict()` missing from a request schema lets a client send `totalAmount` (violates PRD §6) | Integration | `POST /bookings` with a body containing `"totalAmount": "1"` returns `400 E-VALIDATION`; the response's `details[]` includes an entry for the extra field |
| **REG-006-correlation-id-precedes-json** | `express.json()` mounted before the correlation middleware leaves `requestId: null` on parse failure | Integration | `POST /venues/gor-kemang/bookings` with body `{"broken":` returns `400`; the response envelope carries `requestId: "req_01…"`; the same id appears in the log line for the request |
| **REG-007-court-closed-vs-taken** | `closed` misclassified as `taken` in the availability strip (FR-008, FR-009) | Unit (`availability.rules.ts`) | Given `openingTime = '06:00'`, `closingTime = '23:00'` and no bookings, `05:00` is `closed`, `23:00` is `closed`, every hour in `[06:00, 23:00)` is `free` |
| **REG-008-court-horizon-date** | A `bookingDate` exactly `bookingHorizonDays + 1` days ahead is accepted (FR-010) | Integration | `GET /venues/.../courts?date=<today+31>` returns `400 E-OUTSIDE-HORIZON` with `details[].code = "beyond_horizon"`; `<today+30>` returns `200` |
| **REG-009-booking-quote-matches-mockup** | The response body's figures disagree with `mockup/booking-review.html` | Integration | `GET .../quote?date=2026-09-27&startTime=10:00&duration=2` against the seed returns `unitPrice: "180000.00"`, `subtotalAmount: "360000.00"`, `taxAmount: "39600.00"`, `totalAmount: "399600.00"` — exactly the four figures on the screen |
| **REG-010-venue-settings-copy** | Changing `cancellation_window_hours` in the venue row does not change the number quoted in FR-023 copy (NFR-013) | Integration | `UPDATE venues SET cancellation_window_hours = 24`, then `GET /venues/gor-kemang` returns `cancellationWindowHours: 24`; the quote endpoint's `policy.cancellationWindowHours` is also `24` on the next call |

> The register is append-only. When a new production defect closes, the fix reserves the next `REG-` id, adds the row here, adds the file to `tests/regression/`, and cross-links the endpoint/component it protects. `/pspt:reg` automates the round trip. A regression is **never deleted** (SR-5), even if the code path it covers has since been refactored — the test moves with the code, or the assertion widens, but the file stays.

## 5. Coverage per level

What must be tested at which level. The right side of each row is the **anti-rule**: what is deliberately *not* tested there.

| Concern | Unit | Integration | E2E |
|---|---|---|---|
| Pricing arithmetic (`quote`), half-up round | ✓ `pricing.rules.ts` — every rounding branch | Once end-to-end, via the booking write | Once, in the happy-path booking journey |
| Slot classification (`free`/`taken`/`closed`) | ✓ `availability.rules.ts` — every edge (empty bookings, out-of-hours, boundary hour) | ✓ real bookings persisted, real query | Once, via the strip on `courts.html` |
| Cancellation-window rule | ✓ `bookings.rules.ts` — inside, outside, exactly at boundary | ✓ via the `quote` endpoint's `policy.isInsideCancellationWindow` field | Once, via the advisory banner (`?state=window`) |
| Exclusion-constraint concurrency | — (impossible without a real database) | ✓ REG-001, parallel `Promise.all` | Once, in the "slot goes while reviewing" journey |
| `.strict()` on schemas | ✓ mapper returns no server-owned key | ✓ REG-005 | — |
| Error code → HTTP status mapping | ✓ `http/error.test.ts` — every registry row | ✓ each endpoint's error paths | The user-visible ones only |
| Prisma error translation | ✓ `bookings.service.test.ts` with fake `PrismaClientKnownRequestError('P2004')` | ✓ real driver error surfaces the same code | — |
| `Prisma.Decimal` → decimal string | ✓ mapper unit test | ✓ REG-004 body inspection | — |
| Correlation id propagation | ✓ `correlationId.test.ts` | ✓ REG-006 | Once, that the `requestId` shown in the error state matches the log |
| Middleware order | — | ✓ implicit in REG-006 | — |
| SR-2 mirror | ✓ `check-test-mirror.mjs` in CI, not a runtime test | — | — |
| SR-1 constructibility | ✓ every service's unit test is the assertion | — | — |
| Accessibility (NFR-011) | — | — | ✓ `axe-core/playwright` on every state |

**Deliberately not tested at all this release:** payment capture (BRD §4 out of scope), sign-in flows (PRD §7 out of scope), multi-venue browse (BRD §4). No skipped test carries a `TODO` — deferred work has one home, `phases.md` ([`../references/conventions.md`](../../references/conventions.md) §4 lint row 3).

## 6. Fixtures and isolation

### Builders, not blobs

`tests/fixtures/builders/` returns objects; each builder takes an `overrides` object. Composition wins over inheritance. No JSON blob is shared across two tests.

```ts
// tests/fixtures/builders/booking.ts
export const aBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'b_' + ulid(),
  courtId: 'c1',
  userId: 'u1',
  bookingDate: '2026-09-27',
  startTime: '10:00',
  endTime: '12:00',
  durationHours: '2.00',
  unitPrice: '180000.00',
  taxPercent: '11.00',
  subtotalAmount: '360000.00',
  taxAmount: '39600.00',
  totalAmount: '399600.00',
  currency: 'IDR',
  venueTimezone: 'Asia/Jakarta',
  status: 'pending',
  paymentStatus: 'pending',
  bookerName: 'Azka Willian Muhammad',
  bookerPhone: '081211223344',
  note: null,
  cancelledAt: null,
  createdAt: new Date('2026-09-25T04:00:00Z'),
  updatedAt: new Date('2026-09-25T04:00:00Z'),
  ...overrides,
});
```

### Transaction rollback for integration

Each integration test opens a transaction in `beforeEach`, runs the test inside it (repositories accept an optional `tx` — [`../references/conventions.md`](../../references/conventions.md) §1), and rolls back in `afterEach`. Migrations run once at process start. **No test truncates.** The concurrency test (REG-001) is the exception: it needs real commits under real parallelism, so it uses a dedicated schema (`test_conc_<worker>`) that is truncated between test files, not between tests.

### E2E database

`docker compose up postgres` provides a fresh volume per CI job; `pnpm prisma migrate deploy && pnpm prisma db seed` runs before `pnpm e2e`. The seed loads exactly [`../data-spec.md`](../data-spec.md) §10, so `courts.html` shows `Rp 180.000 × 2 jam`, `Rp 360.000`, `Rp 39.600`, `Rp 399.600` — the same four numbers on screen and in every response.

### One clock, one place

`buildTestCradle({ clock: { now: () => FIXED } })` in `tests/helpers/container.ts`. `FIXED` is one `Date` constant in `tests/helpers/time.ts`. If a test needs a different instant, it passes an override — never a `sinon.useFakeTimers`, never a monkey-patch, never a `vi.setSystemTime`.

## 7. Thresholds

Coverage is a floor and not a goal. The floor is per-level so the ratio does not average away a gap.

| Suite | Statements | Branches | Notes |
|---|---|---|---|
| Unit — `*.rules.ts` | **100%** | **100%** | Pure functions with a finite input space; if a branch is unreachable, delete it |
| Unit — `*.service.ts` | 90% | 85% | Every domain-error branch has a fake that provokes it |
| Integration | 80% | — | Every route × every registry error code the route can raise |
| E2E | — | — | Not measured by percentage — measured by every state in `mockup/` reaching a spec |

`pnpm test --experimental-test-coverage` prints the report; CI fails under the floors. `warn` is not advisory anywhere ([`../be-stack.md`](../be-stack.md) §2). The definition of done:

- [ ] `pnpm check` passes with `--max-warnings=0`
- [ ] `pnpm test` passes, floors met per §7
- [ ] `pnpm e2e` passes, `axe-core` reports zero violations
- [ ] `scripts/check-test-mirror.mjs` reports no missing test file (SR-2)
- [ ] Every service in `src/features/*/` is constructed with fakes in at least one unit test (SR-1)
- [ ] Every `*.rules.ts` has a test that runs with no fakes at all (SR-7)
- [ ] Every regression in §4 has a file and a green run in the last 24 hours

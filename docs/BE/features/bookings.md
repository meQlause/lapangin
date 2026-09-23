# Bookings API

**Owns:** `bookings`  ·  Conventions: [`README.md`](./README.md)

The bookings feature is the one that decides whether the venue keeps its notebook. Every guarantee that justifies the project lives inside it — a court cannot be double booked under concurrency (BO-1, NFR-001), the agreed price never moves (BO-2, NFR-002), another user's booking is invisible (NFR-005). The three endpoints below are the surface: one asks the server to compute a quote, one writes the booking, one reads it back.

| # | Method | Path | Access |
|---|---|---|---|
| 1 | GET | `/venues/:slug/courts/:courtId/quote` | Public |
| 2 | POST | `/venues/:slug/bookings` | Owner |
| 3 | GET | `/bookings/:id` | Owner |

---

## 1. `GET /venues/:slug/courts/:courtId/quote`

Compute — but do not persist — the price breakdown the review screen renders (FR-024, FR-026). The client sends the schedule and receives every figure it must display; the client itself never multiplies, adds or rounds an amount. **Access:** Public.

### Request

```
GET /api/v1/venues/gor-kemang/courts/c1a7f2d4-.../quote?date=2026-09-27&startTime=10:00&duration=2
```

| Field | In | Type | Required | Default | Rules | Source |
|---|---|---|---|---|---|---|
| `slug` | path | string | yes | — | as `venues` §1 | FR-018 |
| `courtId` | path | UUID | yes | — | `courts.id` under this venue | FR-019 |
| `date` | query | date | yes | — | `YYYY-MM-DD`, today ≤ date ≤ today+`booking_horizon_days` | FR-019 |
| `startTime` | query | time | yes | — | `HH:mm`, must lie in `[openingTime, closingTime)` | FR-019 |
| `duration` | query | integer | yes | — | 1, 2 or 3; `startTime + duration ≤ closingTime` | FR-019 |

### Response `200`

Every figure below matches the mockup exactly ([`booking-review.html`](../../../mockup/booking-review.html), [`data.js`](../../../mockup/data.js) rows 87–108, [`../../data-spec.md`](../../data-spec.md) §10 figure check).

```json
{
  "data": {
    "court": {
      "id": "c1a7f2d4-2b88-4f1a-9a10-0f6e8c11b201",
      "name": "Lapangan Futsal A",
      "venueName": "GOR Kemang",
      "venueAddress": "Jl. Kemang Raya No. 18, Jakarta Selatan"
    },
    "schedule": {
      "bookingDate": "2026-09-27",
      "bookingDateLabel": "Sabtu, 27 September 2026",
      "startTime": "10:00",
      "endTime": "12:00",
      "durationHours": "2.00",
      "venueTimezone": "Asia/Jakarta",
      "venueTimezoneLabel": "Asia/Jakarta (WIB)",
      "startsAt": "2026-09-27T03:00:00.000Z",
      "endsAt": "2026-09-27T05:00:00.000Z"
    },
    "cost": {
      "unitPrice": "180000.00",
      "subtotalAmount": "360000.00",
      "taxPercent": "11.00",
      "taxAmount": "39600.00",
      "totalAmount": "399600.00",
      "currency": "IDR"
    },
    "policy": {
      "cancellationWindowHours": 12,
      "isInsideCancellationWindow": false
    }
  },
  "meta": { "requestId": "req_01J9Z4K2M7Q" }
}
```

| Field | Type | Source |
|---|---|---|
| `data.court.id` | UUID | `courts.id` |
| `data.court.name` | string | `courts.name`, FR-019 |
| `data.court.venueName` | string | `venues.name`, FR-019 |
| `data.court.venueAddress` | string | `venues.address`, FR-019 |
| `data.schedule.bookingDate` | date | echo of query, FR-019 |
| `data.schedule.bookingDateLabel` | string | Indonesian long-form date formatted server-side under `venues.timezone`, FR-019 |
| `data.schedule.startTime` | `HH:mm` | echo, FR-019 |
| `data.schedule.endTime` | `HH:mm` | Computed: `startTime + duration hours`, FR-019 |
| `data.schedule.durationHours` | decimal string, 2dp | `duration` as `"2.00"`, FR-019 |
| `data.schedule.venueTimezone` | IANA id | `venues.timezone`, FR-019, NFR-003 |
| `data.schedule.venueTimezoneLabel` | string | Server-derived, e.g. `"Asia/Jakarta (WIB)"`, FR-019 |
| `data.schedule.startsAt` / `endsAt` | ISO 8601 UTC | Computed under `venues.timezone`, half-open `[startsAt, endsAt)` |
| `data.cost.unitPrice` | decimal string, 2dp | `courts.price_per_hour`, FR-024 |
| `data.cost.subtotalAmount` | decimal string, 2dp | `unitPrice × durationHours`, FR-024, FR-026 |
| `data.cost.taxPercent` | decimal string, 2dp | `venues.tax_percent`, FR-024 |
| `data.cost.taxAmount` | decimal string, 2dp | `round(subtotalAmount × taxPercent / 100, 2)` half-up, FR-024 |
| `data.cost.totalAmount` | decimal string, 2dp | `subtotalAmount + taxAmount`, FR-024 |
| `data.cost.currency` | ISO 4217 | `venues.currency`, FR-032 |
| `data.policy.cancellationWindowHours` | integer | `venues.cancellation_window_hours`, FR-023, FR-031 |
| `data.policy.isInsideCancellationWindow` | boolean | `isInsideCancellationWindow(clock.now(), startsAt, cancellationWindowHours)`, FR-031 |

#### Figure check against the mockup

`quote("180000.00", 2, "11.00")` must produce:

| Line | Computed | Mockup |
|---|---|---|
| Unit line | `180000.00 × 2.00 = 360000.00` | `Rp 180.000 × 2 jam` → `Rp 360.000` ✓ |
| Tax line | `round(360000.00 × 11.00 / 100, 2) = 39600.00` | `Pajak 11.00%` → `Rp 39.600` ✓ |
| Total | `360000.00 + 39600.00 = 399600.00` | `Rp 399.600` ✓ |

Enforced twice: as the pure-rule check `pricing.rules.ts` in [`../testing.md`](../testing.md) §3, and as the response body in the `POST /venues/:slug/bookings` integration test §4 REG-BOOKING-QUOTE-MATCHES-MOCKUP.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `E-VALIDATION` | Zod rejects any field |
| 400 | `E-OUT-OF-HOURS` | `startTime` or `endTime` falls outside the venue's opening window |
| 400 | `E-OUTSIDE-HORIZON` | `date > today + booking_horizon_days` or `date < today` |
| 400 | `E-DURATION-BELOW-MIN` | `duration × 60 < minimum_duration_minutes` |
| 404 | `E-VENUE-NOT-FOUND` | `slug` does not resolve |
| 404 | `E-COURT-NOT-FOUND` | `courtId` does not exist under this venue |

### Side effects

None. Read-only; no `bookings` row is written, no draft is reserved.

### Concurrency

None on this endpoint. The quote is a pure derivation. The court's `price_per_hour` may change between quote and write; the write snapshots the live price at the moment of `POST /bookings` (NFR-002 preserves *booked* prices, not *quoted* ones). If a quote returns `"180000.00"` and the manager raises the rate a second later, the write uses the new rate. Named here because "the quote said less" is a real support ticket a policy should answer up-front.

### Notes

> The quote endpoint exists so PRD §6 ("the client never sends an amount") is a shape rather than a promise. If the review screen computed the tax in a `useMemo`, one careful client would round differently (half-up-away-from-zero vs half-up) and the total on screen would disagree with the amount the server writes. The endpoint moves that decision to the one place it belongs.

> `isInsideCancellationWindow` is here rather than derived on the client so the server's clock and the venue's zone (NFR-003) settle the boundary. The client re-runs the same rule ([`../../FE/fe-architecture.md`](../../FE/fe-architecture.md) §6) only to keep the advisory reactive if the user re-opens the screen without a refetch.

---

## 2. `POST /venues/:slug/bookings`

Write a booking for the identified court on `bookingDate` from `startTime` for `duration` hours, snapshotting price, tax and timezone at the moment of the write. This is the endpoint the whole system exists for. **Access:** Owner (`X-User-Id` required).

### Request

```json
{
  "courtId": "c1a7f2d4-2b88-4f1a-9a10-0f6e8c11b201",
  "bookingDate": "2026-09-27",
  "startTime": "10:00",
  "duration": 2,
  "booker": {
    "name": "Azka Willian Muhammad",
    "phone": "081211223344",
    "note": "Tim 10 orang, minta bola pinjam kalau ada."
  }
}
```

| Field | In | Type | Required | Default | Rules | Source |
|---|---|---|---|---|---|---|
| `slug` | path | string | yes | — | as `venues` §1 | — |
| `courtId` | body | UUID | yes | — | `courts.id` under this venue | FR-019 |
| `bookingDate` | body | date | yes | — | `YYYY-MM-DD`, today ≤ date ≤ today+`booking_horizon_days`, coerced under `venues.timezone` | FR-019 |
| `startTime` | body | time | yes | — | `HH:mm`, in `[openingTime, closingTime)` | FR-019 |
| `duration` | body | integer | yes | — | 1, 2 or 3; `startTime + duration ≤ closingTime` | FR-019 |
| `booker.name` | body | string | yes | — | trim, 1–120 chars after trim | FR-020 |
| `booker.phone` | body | string | yes | — | `^[0-9]{9,20}$`, no spaces or hyphens; client strips them before submit | FR-021 |
| `booker.note` | body | string | no | `null` | ≤ 500 chars, trim | FR-022 |

**Server-owned fields** (rejected with `E-VALIDATION` if sent — [`README.md`](./README.md) §7): `id`, `unitPrice`, `subtotalAmount`, `taxPercent`, `taxAmount`, `totalAmount`, `currency`, `venueTimezone`, `endTime`, `durationHours`, `startsAt`, `endsAt`, `status`, `paymentStatus`, `createdAt`, `updatedAt`, `cancelledAt`, `userId`. The schema uses `.strict()` — the whole object is rejected on the first extra key ([`../be-stack.md`](../be-stack.md) §7 row 7).

### Response `201`

```json
{
  "data": {
    "id": "b7a3c9e1-1122-4d3e-9a0f-2c3b4d5e6f70",
    "courtId": "c1a7f2d4-2b88-4f1a-9a10-0f6e8c11b201",
    "userId": "f0a1b2c3-4d5e-6f78-9a0b-1c2d3e4f5a6b",
    "status": "pending",
    "paymentStatus": "pending",
    "schedule": {
      "bookingDate": "2026-09-27",
      "bookingDateLabel": "Sabtu, 27 September 2026",
      "startTime": "10:00",
      "endTime": "12:00",
      "durationHours": "2.00",
      "venueTimezone": "Asia/Jakarta",
      "startsAt": "2026-09-27T03:00:00.000Z",
      "endsAt": "2026-09-27T05:00:00.000Z"
    },
    "cost": {
      "unitPrice": "180000.00",
      "subtotalAmount": "360000.00",
      "taxPercent": "11.00",
      "taxAmount": "39600.00",
      "totalAmount": "399600.00",
      "currency": "IDR"
    },
    "booker": {
      "name": "Azka Willian Muhammad",
      "phone": "081211223344",
      "note": "Tim 10 orang, minta bola pinjam kalau ada."
    },
    "createdAt": "2026-09-25T04:20:00.000Z"
  },
  "meta": { "requestId": "req_01J9Z4K2M7Q" }
}
```

| Field | Type | Source |
|---|---|---|
| `data.id` | UUID | `bookings.id` |
| `data.courtId` / `userId` | UUID | `bookings.court_id`, `bookings.user_id` |
| `data.status` | enum | `bookings.status`, starts `pending` |
| `data.paymentStatus` | enum | `bookings.payment_status`, stays `pending` this release (BRD §4) |
| `data.schedule.*` | as in §1 | §1 rows apply verbatim |
| `data.cost.*` | as in §1, **snapshotted at write** | `bookings.unit_price`, `tax_percent`, `tax_amount`, `subtotal_amount`, `total_amount`, `currency`, NFR-002 |
| `data.booker.*` | strings | `bookings.booker_name`, `booker_phone`, `note`, FR-020..022 |
| `data.createdAt` | ISO 8601 UTC | `bookings.created_at` |

The response deliberately mirrors the `GET /bookings/:id` shape (§3), so the review screen can render straight from the mutation without a second fetch.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `E-VALIDATION` | Any Zod violation, including a server-owned field, a bad phone shape, or a note over 500 chars |
| 400 | `E-OUT-OF-HOURS` | `startTime`/`endTime` outside `[openingTime, closingTime)` |
| 400 | `E-OUTSIDE-HORIZON` | `bookingDate` outside `[today, today + bookingHorizonDays]` |
| 400 | `E-DURATION-BELOW-MIN` | `duration × 60 < minimum_duration_minutes` |
| 404 | `E-VENUE-NOT-FOUND` | `slug` does not resolve |
| 404 | `E-COURT-NOT-FOUND` | `courtId` does not exist under this venue |
| 409 | `E-COURT-NOT-BOOKABLE` | The court's `status = 'maintenance'` at the moment of write |
| 409 | `E-BOOKING-SLOT-TAKEN` | Postgres raises `exclusion_violation` on `bookings_no_overlap` ([`../../data-spec.md`](../../data-spec.md) §6) |
| 500 | `E-INTERNAL` | Any uncaught error inside the controller or service |

> **`E-BOOKING-SLOT-TAKEN` has one source: the constraint.** The service inserts, catches `PrismaClientKnownRequestError` code `P2004` (`exclusion_violation`) in `bookings.service.ts` and translates it once ([`../../error-handling.md`](../../error-handling.md) §2 driver-error row). The service does **not** query for a conflict first — that is the race the constraint exists to close.

### Side effects

| # | Effect |
|---|---|
| 1 | One row inserted into `bookings` with the snapshot fields set from the venue and court at write time |
| 2 | The frontend's availability query for `(slug, bookingDate)` is invalidated on success — and also on `409 E-BOOKING-SLOT-TAKEN` so the strip refreshes to reveal the winner ([`../../FE/fe-architecture.md`](../../FE/fe-architecture.md) §5) |
| 3 | No mail, no webhook, no SMS. Payment is out of scope (BRD §4); WhatsApp confirmation is a future feature |

### Concurrency

The exclusion constraint `bookings_no_overlap EXCLUDE USING gist (court_id WITH =, period WITH &&) WHERE (status IN ('pending','confirmed'))` guarantees exclusivity under any parallelism — two concurrent inserts for the same court and overlapping window resolve as one success and one Postgres `exclusion_violation`. **The service does not check-then-write.** It writes, lets Postgres refuse the loser, and translates the error.

`courts.status = 'maintenance'` is read inside the same transaction the insert runs under (`SELECT status FROM courts WHERE id = $1 FOR UPDATE` immediately before the insert), so a court switched to maintenance mid-transaction still refuses the write. Without the row lock, a manager flipping to maintenance in the exact millisecond of a booking write could produce a `pending` booking against a maintenance court; the lock closes that.

Regression: **REG-BOOKING-CONCURRENT-DOUBLE-INSERT** ([`../testing.md`](../testing.md) §4).

### Notes

> The `E-BOOKING-SLOT-TAKEN` copy on the client uses the booked date, time and court name from the request context, not from the winning booking (which the caller does not own — leaking it would violate NFR-005). See [`../../error-handling.md`](../../error-handling.md) §4 for the sentence.

> A `409 E-COURT-NOT-BOOKABLE` and a `409 E-BOOKING-SLOT-TAKEN` share a status and screen slot but must remain distinct codes — the copy names different data ([`../../error-handling.md`](../../error-handling.md) §3 note).

> Regressions this endpoint carries: **REG-BOOKING-CONCURRENT-DOUBLE-INSERT**, **REG-BOOKING-PRICE-IMMUTABLE**, **REG-BOOKING-STRICT-EXTRA-FIELD**, **REG-BOOKING-QUOTE-MATCHES-MOCKUP** ([`../testing.md`](../testing.md) §4).

---

## 3. `GET /bookings/:id`

Return a single booking to its owner. **Access:** Owner.

### Request

Path: `id` — booking UUID.

| Field | In | Type | Required | Default | Rules | Source |
|---|---|---|---|---|---|---|
| `id` | path | UUID | yes | — | UUID v4 shape | — |

The header `X-User-Id` is required. When absent or when the row's `user_id` does not match, the response is `404 E-BOOKING-NOT-FOUND` — the same as for a nonexistent id (NFR-005). Never `403`.

### Response `200`

The same shape as §2 response — the review screen can render either. The `updatedAt` and `cancelledAt` fields are present here because they are meaningful on a retrieved booking:

```json
{
  "data": {
    "id": "b7a3c9e1-1122-4d3e-9a0f-2c3b4d5e6f70",
    "courtId": "c1a7f2d4-2b88-4f1a-9a10-0f6e8c11b201",
    "userId": "f0a1b2c3-4d5e-6f78-9a0b-1c2d3e4f5a6b",
    "status": "pending",
    "paymentStatus": "pending",
    "schedule": { "…": "…" },
    "cost":     { "…": "…" },
    "booker":   { "…": "…" },
    "createdAt": "2026-09-25T04:20:00.000Z",
    "updatedAt": "2026-09-25T04:20:00.000Z",
    "cancelledAt": null
  },
  "meta": { "requestId": "req_01J9Z4K2M7Q" }
}
```

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `E-VALIDATION` | `id` fails UUID shape |
| 404 | `E-BOOKING-NOT-FOUND` | The booking does not exist **or** exists but belongs to another user (NFR-005) |

### Side effects

None.

### Concurrency

A single primary-key lookup. No locking.

### Notes

> Regression: **REG-BOOKING-NOT-FOUND-VS-FORBIDDEN** ([`../testing.md`](../testing.md) §4) verifies that another user's booking returns identical status, code, message, and shape to a nonexistent id — right down to the absence of any owner name in the body.

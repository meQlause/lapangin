# Courts API

**Owns:** `courts`, `amenities`, `court_amenities`  ·  Conventions: [`README.md`](./README.md)

The courts endpoint returns the catalogue and, for a chosen date, the hourly availability strip that decides whether a customer can book without asking anyone (BO-3, F-4, FR-007 through FR-014). It does not create anything and it does not know about payments — writing a booking is the shape of [`bookings.md`](./bookings.md).

| # | Method | Path | Access |
|---|---|---|---|
| 1 | GET | `/venues/:slug/courts` | Public |

---

## 1. `GET /venues/:slug/courts`

List the courts under a venue with the state of each hour on `date`. Every hour arrives classified as one of three states so the client renders `courts.html?state=filled` without a second decision on the wire. **Access:** Public.

### Request

Path: `slug` — venue slug (see [`venues.md`](./venues.md) §1 rules).

```
GET /api/v1/venues/gor-kemang/courts?date=2026-09-27&startTime=10:00&duration=2&sport=futsal
```

| Field | In | Type | Required | Default | Rules | Source |
|---|---|---|---|---|---|---|
| `slug` | path | string | yes | — | as `venues` §1 | FR-001 |
| `date` | query | date | yes | — | `YYYY-MM-DD`, today ≤ date ≤ today+`booking_horizon_days`, coerced under `venues.timezone` | FR-010 |
| `startTime` | query | time | no | `openingTime` | `HH:mm`, `step=1800` allowed on the client, the server accepts any `HH:00` or `HH:30`; hour resolution on the strip | FR-011 |
| `duration` | query | integer | no | `2` | 1, 2 or 3 (whole hours this release, capped by opening window) | FR-012 |
| `sport` | query | enum | no | *(all)* | `futsal` \| `badminton` \| `basket`; absence means "all sports" (FR-013 `Semua`) | FR-013 |

> `duration` is an integer, not a decimal string. `duration=2.5` fails with `E-VALIDATION`, code `not_whole_hour` on the `duration` field ([`../../error-handling.md`](../../error-handling.md) §4). Half-hour bookings are deferred (SRS §6 out-of-scope for this release).

> A `date` outside `[today, today + booking_horizon_days]` returns `400 E-OUTSIDE-HORIZON`, not `E-VALIDATION`, so the copy names the horizon (`Kamu hanya bisa booking sampai {bookingHorizonDays} hari ke depan.`). Zod parses the shape; the domain rule decides the code.

### Response `200`

Values below match the seed exactly ([`../../data-spec.md`](../../data-spec.md) §10 and [`mockup/data.js`](../../../mockup/data.js)).

```json
{
  "data": {
    "date": "2026-09-27",
    "filters": { "startTime": "10:00", "duration": 2, "sport": "futsal" },
    "items": [
      {
        "id": "c1a7f2d4-2b88-4f1a-9a10-0f6e8c11b201",
        "name": "Lapangan Futsal A",
        "sport": "futsal",
        "surface": "Rumput sintetis",
        "floor": "Lantai 1",
        "photoLabel": "Futsal A",
        "pricePerHour": "180000.00",
        "currency": "IDR",
        "status": "available",
        "maintenanceReason": null,
        "maintenanceUntil": null,
        "amenities": ["Lampu malam", "Ruang ganti", "Tribun", "Parkir luas"],
        "displayOrder": 0,
        "availability": {
          "openingTime": "06:00",
          "closingTime": "23:00",
          "slots": [
            { "start": "06:00", "end": "07:00", "state": "free" },
            { "start": "07:00", "end": "08:00", "state": "free" },
            { "start": "08:00", "end": "09:00", "state": "taken" },
            { "start": "09:00", "end": "10:00", "state": "taken" },
            { "start": "10:00", "end": "11:00", "state": "free" },
            { "start": "11:00", "end": "12:00", "state": "free" },
            { "start": "19:00", "end": "20:00", "state": "taken" },
            { "start": "20:00", "end": "21:00", "state": "free" }
          ]
        }
      }
    ]
  },
  "meta": { "requestId": "req_01J9Z4K2M7Q" }
}
```

| Field | Type | Source |
|---|---|---|
| `data.date` | date | Echo of the query, useful for cache keying, FR-010 |
| `data.filters.*` | echo of the query with defaults applied | FR-011, FR-012, FR-013 |
| `data.items[].id` | UUID | `courts.id` |
| `data.items[].name` | string | `courts.name`, FR-002 |
| `data.items[].sport` | enum | `courts.sport`, FR-013 |
| `data.items[].surface` | string | `courts.surface`, FR-002 |
| `data.items[].floor` | string | `courts.floor`, FR-002 |
| `data.items[].photoLabel` | string | `courts.photo_label`, FR-002 |
| `data.items[].pricePerHour` | decimal string, 2dp | `courts.price_per_hour`, FR-004 |
| `data.items[].currency` | ISO 4217 | `venues.currency` (parent), FR-032 |
| `data.items[].status` | enum | `courts.status`, FR-005 |
| `data.items[].maintenanceReason` | string \| null | `courts.maintenance_reason`, FR-006 |
| `data.items[].maintenanceUntil` | date \| null | `courts.maintenance_until`, FR-005 |
| `data.items[].amenities[]` | string labels, in `amenities.display_order` | `amenities.label` via `court_amenities`, FR-003 |
| `data.items[].displayOrder` | integer | `courts.display_order`, catalogue ordering |
| `data.items[].availability.openingTime` / `closingTime` | `HH:mm` | `venues.opening_time` / `closing_time`, FR-008 |
| `data.items[].availability.slots[]` | array of hour blocks | Derived — see §Slot classification below |

**A court under maintenance (`status = "maintenance"`) returns an empty `slots[]` array and populated `maintenanceReason` / `maintenanceUntil`**, so `mockup/courts.html?state=filled` renders the Basket Indoor card without a strip and with `Perawatan sampai 30 September` (FR-005, FR-006). Empty `[]` is deliberate — `null` would let a client render a skeleton, which is wrong here.

#### Slot classification (FR-008, FR-009)

Each hour block on `date` is one of three states. The classification is a pure function in `courts/availability/availability.rules.ts` ([`../be-architecture.md`](../be-architecture.md) §3), given `openingTime`, `closingTime` and the set of confirmed-or-pending bookings that intersect `date`.

| State | When |
|---|---|
| `taken` | An existing booking with `status IN ('pending','confirmed')` on the same court overlaps `[hour, hour+1)` under the half-open convention (`hour` in `[b.start_time, b.end_time)` for at least one booking) |
| `closed` | The hour falls outside `[openingTime, closingTime)`. Kept distinct from `taken` because the copy is different (`Di luar jam operasional` vs `Sudah dibooking`) |
| `free` | Neither of the above |

Worked example against the mockup (Badminton 3 on `2026-09-27`, [`mockup/data.js`](../../../mockup/data.js) rows 60–68):

| Hour | Existing booking? | Inside `[06:00, 23:00)`? | State |
|---|---|---|---|
| 06:00 | yes (seed row) | yes | `taken` ✓ |
| 11:00 | no | yes (11:00 is inside 06:00–23:00) | **currently `closed`** in the mockup because the seed illustration models a `venue_hours`-per-weekday closure the schema does not yet carry — see [`../../data-spec.md`](../../data-spec.md) §10 note |
| 19:00 | yes | yes | `taken` ✓ |

> The `11:00 = closed` case is a mockup illustration until the `venue_hours` child table lands ([`../../data-spec.md`](../../data-spec.md) §9). The service classifies it as `free` today, and the seed does not contain a booking at 11:00. Named here so the reviewer holding the screenshot next to the response knows the divergence is intentional and tracked.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `E-VALIDATION` | Zod rejects any query field — including `duration=2.5` (`not_whole_hour`) and `date` out of `YYYY-MM-DD` shape (`format`) |
| 400 | `E-OUTSIDE-HORIZON` | `date > today + booking_horizon_days` or `date < today`, decided by the rule after Zod passes |
| 400 | `E-OUT-OF-HOURS` | `startTime` outside `[openingTime, closingTime)` |
| 400 | `E-DURATION-BELOW-MIN` | `duration × 60 < minimum_duration_minutes`. With `minimum_duration_minutes = 60` today, this never fires for `duration ≥ 1`; kept in the surface so a future change to `90` returns the correct code |
| 404 | `E-VENUE-NOT-FOUND` | `slug` does not resolve |

### Side effects

None. Read-only.

### Concurrency

No writes. The availability query reads bookings that intersect `date` and classifies each hour. A booking created in the millisecond after the read appears on the next fetch — the client refetches on `window focus` ([`../../FE/fe-architecture.md`](../../FE/fe-architecture.md) §5), and the review-screen mutation invalidates this key on both success and `409` ([`bookings.md`](./bookings.md) §2 side effects).

### Notes

> The strip is computed **inside** the venue's timezone, not the server's. `availability.service.ts` reads `venues.timezone` once, converts `date` + each hour to a `TIMESTAMPTZ`, and passes the resolved instants into `availability.rules.ts`. Server locale never enters the comparison (NFR-003).

> `sport=Semua` on the client is the absence of the query field, not the string `"Semua"`. The server rejects `sport=Semua` with `E-VALIDATION` — the client removes the param instead. Named here because "the enum has an extra all-value" is exactly the kind of drift that adds a fifth sport nobody asked for.

> The response is not paginated ([`README.md`](./README.md) §8). Three courts today, capped at a few dozen per venue before a second venue changes the shape. When that changes, the cursor lands on `(venue_id, display_order, id)`.

> Regressions this endpoint carries: **REG-COURT-HORIZON-DATE** and **REG-COURT-CLOSED-VS-TAKEN** ([`../testing.md`](../testing.md) §4).

# Venues API

**Owns:** `venues`  ·  Conventions: [`README.md`](./README.md)

The venue endpoint resolves a slug into the row that decides every downstream number — tax rate, cancellation window, booking horizon, minimum duration, timezone, opening and closing hours. The client caches this response as venue settings ([`../../FE/fe-architecture.md`](../../FE/fe-architecture.md) §5, `useSettings`), so `courts.html` and `booking-review.html` both quote the same values without a second fetch. It deliberately does not list courts or availability — those are the shape of the next feature.

| # | Method | Path | Access |
|---|---|---|---|
| 1 | GET | `/venues/:slug` | Public |

---

## 1. `GET /venues/:slug`

Return the venue that renders the header on `courts.html` and drives every derived number on both screens. **Access:** Public.

### Request

Path: `slug` — URL-safe venue slug, case-insensitive.

No body, no query.

| Field | In | Type | Required | Default | Rules | Source |
|---|---|---|---|---|---|---|
| `slug` | path | string | yes | — | 1–64 chars, `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$` | FR-001 |

### Response `200`

Real values from the seed ([`../../data-spec.md`](../../data-spec.md) §10).

```json
{
  "data": {
    "id": "5e1b0a5e-1f4c-4a22-9d0e-7a2b9c1d33aa",
    "slug": "gor-kemang",
    "name": "GOR Kemang",
    "address": "Jl. Kemang Raya No. 18, Jakarta Selatan",
    "timezone": "Asia/Jakarta",
    "openingTime": "06:00",
    "closingTime": "23:00",
    "openingHoursLabel": "Senin sampai Minggu, 06:00 sampai 23:00",
    "currency": "IDR",
    "taxPercent": "11.00",
    "cancellationWindowHours": 12,
    "bookingHorizonDays": 30,
    "minimumDurationMinutes": 60
  },
  "meta": { "requestId": "req_01J9Z4K2M7Q" }
}
```

| Field | Type | Source |
|---|---|---|
| `id` | UUID | `venues.id` |
| `slug` | string | `venues.slug`, FR-001 |
| `name` | string | `venues.name`, FR-001 |
| `address` | string | `venues.address`, FR-001 |
| `timezone` | IANA id | `venues.timezone`, FR-001, FR-019, NFR-003 |
| `openingTime` | `HH:mm` | `venues.opening_time`, FR-001, FR-008 |
| `closingTime` | `HH:mm` | `venues.closing_time`, FR-001, FR-008 |
| `openingHoursLabel` | string | Derived server-side from `opening_time`, `closing_time` and the every-day pattern (BRD §5). Rendered verbatim on the header line, FR-001 |
| `currency` | ISO 4217 | `venues.currency`, FR-032 |
| `taxPercent` | decimal string, 2dp | `venues.tax_percent`, FR-004, FR-024 |
| `cancellationWindowHours` | integer | `venues.cancellation_window_hours`, FR-023, FR-031, NFR-013 |
| `bookingHorizonDays` | integer | `venues.booking_horizon_days`, FR-010 |
| `minimumDurationMinutes` | integer | `venues.minimum_duration_minutes`, FR-012, NFR-013 |

> `taxPercent` is a decimal string like `"11.00"`, not the number `11` and not `0.11`. The rule in [`../../data-spec.md`](../../data-spec.md) §8 is stored as `NUMERIC(5,2)` and quoted here so no client hand-writes a divide-by-100.

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `E-VALIDATION` | `slug` fails the pattern |
| 404 | `E-VENUE-NOT-FOUND` | No `venues.slug` matches |

### Side effects

None. Read-only.

### Concurrency

None. Row read by primary lookup; the response is cacheable per `slug` for 60 s at the CDN with a `Cache-Control: public, max-age=60` header — settings change rarely, and the client already re-reads on route change.

### Notes

> The `openingHoursLabel` is generated on the server so a config change (BRD §5 becomes different-per-weekday) touches one place. A hardcoded `"Senin sampai Minggu, 06:00 sampai 23:00"` on the client is exactly the NFR-013 drift the label exists to prevent.

> The venue currency, tax rate, cancellation window, booking horizon and minimum duration are settings — not requirements text. Changing them changes the sentence in FR-023 and the field-error copy in [`../../error-handling.md`](../../error-handling.md) §4 without a deploy (NFR-013).

> `cancellationWindowHours` is an integer in JSON, not a string, because it is a whole-hour count (never fractional this release). Should the product decide to allow `1.5 h`, the type widens to a decimal string and the copy interpolation is unchanged — the sentence still says `12 jam`.

> Regressions that pin behaviour here: **REG-VENUE-SETTINGS-COPY** ([`../testing.md`](../testing.md) §4) verifies that changing `cancellation_window_hours` from `12` to `24` changes the label in every place NFR-013 promises (venues response, cancellation-policy copy on the review screen).

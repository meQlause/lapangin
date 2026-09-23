# Lapangin — Error handling

**Stage:** S3 · **Owns:** the single error envelope, the code registry, the copy table, and the frontend mapping · Conventions: [`../references/conventions.md`](../references/conventions.md) §6

Every error a screen can receive exists here before the screen is built (S4/S5).
A frontend cannot show a useful message for a code it learns about in production.
Numbers in a copy sentence are interpolated from configuration, never typed —
`{cancellationWindowHours}` becomes `12` at render time, so changing the setting
changes the sentence (NFR-013, FR-023).

---

## 1. Envelope

One shape for every failure, on every endpoint.

```json
{
  "error": {
    "code": "E-BOOKING-SLOT-TAKEN",
    "message": "Jadwal ini baru saja diambil orang lain.",
    "details": [
      { "field": "startTime", "code": "conflict" }
    ],
    "requestId": "req_01J9Z4K2M7Q"
  }
}
```

| Field | Rule |
|---|---|
| `code` | One of the registry values in §3. **Never reused for a second condition.** A new condition gets a new code |
| `message` | The user-facing Indonesian sentence from §4, resolved by the server. The client renders it verbatim (NFR-012) |
| `details` | Array of `{field, code}` for field-level violations (E-VALIDATION only). Absent otherwise |
| `requestId` | ULID-shape correlation id (`req_01J…`), always present, also written into the log line for this request. This is the identifier shown in FR-017 |

> An HTTP body that ever contains a stack trace, a Prisma error message, a SQL
> fragment or an internal id is a defect (NFR-006). The envelope above is the
> **only** failure body the API emits.

## 2. Production rules

| Concern | Rule |
|---|---|
| Produced by | Services throw domain errors from `<feature>.errors.ts`. **No controller sets a status by hand.** No handler builds an envelope inline |
| Become responses in | A single error-handling middleware, mounted last after the router (see [`BE/be-architecture.md`](./BE/be-architecture.md) §6) |
| Status mapping | Each code maps to exactly one HTTP status (§3). The mapping is a `const` object, not a `switch` |
| Not found vs forbidden | Another user's booking returns the same `404 E-BOOKING-NOT-FOUND` as a nonexistent id (NFR-005). Existence is never leaked through a `403` |
| Leakage | No stack trace, driver message, SQL fragment or internal id reaches a response (NFR-006). The error middleware strips `err.stack` and `err.cause` before serialising |
| Correlation | Every request gets a ULID at the edge, injected into the request scope, echoed as `X-Request-Id` in the response, threaded through the error envelope, and printed on every log line for the request (NFR-007) |
| Driver-error translation | Prisma error codes cross the service→error boundary in one place: `PrismaExclusionViolation` → `E-BOOKING-SLOT-TAKEN`, `PrismaUniqueViolation` on `venues.slug` → `E-VENUE-NOT-FOUND`, `PrismaCheckViolation` → `E-VALIDATION` with a synthetic detail. A caller never inspects a Prisma error |

> The one order trap in the Express pipeline: if `express.json()` is mounted
> before the correlation-id middleware, the id is missing from the log line for
> any JSON parse failure — the very requests you most need to correlate. Order
> is stated in [`BE/be-architecture.md`](./BE/be-architecture.md) §6.

## 3. Registry

Codes the mockup can already produce, plus the boundary codes the two endpoints
in scope this release must return. One row per code, in the order the API will
introduce them.

| Status | Code | Raised when | Frontend behaviour |
|---|---|---|---|
| `400` | `E-VALIDATION` | Zod schema rejects the request body or query. Field details enumerate what failed | Field-level: mark each row in `details[]` invalid; render the field message from the copy table. Blocking banner above the form: `Ada isian yang perlu diperbaiki`. Preserve every value the user typed (FR-029, FR-030) |
| `400` | `E-OUT-OF-HOURS` | Requested `startTime`/`endTime` is outside the venue's `opening_time`/`closing_time` window | Field-level on `startTime`; blocking banner: `Jam yang kamu pilih di luar jam operasional GOR Kemang.` |
| `400` | `E-OUTSIDE-HORIZON` | Requested `bookingDate` is more than `booking_horizon_days` ahead of today, or in the past | Field-level on `bookingDate`; blocking banner names the horizon (`Kamu hanya bisa booking sampai {bookingHorizonDays} hari ke depan.`) |
| `400` | `E-DURATION-BELOW-MIN` | Requested duration is below `minimum_duration_minutes` | Field-level on `duration`; blocking banner: `Durasi minimum {minimumDurationMinutes} menit.` |
| `404` | `E-VENUE-NOT-FOUND` | `venues.slug` does not resolve | Screen-level: navigate to a 404 view. Court list is unreachable without a valid slug |
| `404` | `E-COURT-NOT-FOUND` | `courts.id` in the URL does not exist under this venue | Screen-level on the review screen: navigate back to the court list with an advisory banner |
| `404` | `E-BOOKING-NOT-FOUND` | Booking id does not exist, **or** exists but belongs to another user (NFR-005) | Screen-level: 404 view. Never `403`; never disclose either the existence or the owner |
| `409` | `E-BOOKING-SLOT-TAKEN` | **Only** when the insert against `bookings_no_overlap` raises Postgres `exclusion_violation`. Never from an application pre-check — see the note below | Blocking banner on the review screen: `Jadwal ini baru saja diambil orang lain`. **Every typed value is preserved.** Primary CTA disables and relabels to `Pilih jam lain dulu` (FR-028, FR-029) |
| `409` | `E-COURT-NOT-BOOKABLE` | Court `status = 'maintenance'` when a booking write is attempted | Blocking banner on the review screen: uses `courts.maintenance_reason` and `maintenance_until` interpolated. Primary disables and relabels to `Tidak tersedia` |
| `500` | `E-INTERNAL` | Any uncaught error inside a controller or service reaches the error middleware | Screen-level failure state (FR-017): `Jadwal gagal dimuat` on the list, or the review equivalent, with `Kode permintaan: {requestId}` and a `Muat ulang` action |

> **`E-BOOKING-SLOT-TAKEN` has exactly one source: the constraint.** The service
> does *not* query for a conflict and then insert — that is a race with a
> comfortable-looking test, and it is the precise failure NFR-001 and BO-1 exist
> to eliminate. It inserts, lets `exclusion_violation` surface from the
> repository, and translates it. An application pre-check would reintroduce the
> window between checking and writing that the constraint was added to close.

> Two "why not a 403" moments are worth naming: `E-BOOKING-NOT-FOUND` for
> someone else's booking, and `E-COURT-NOT-BOOKABLE` when maintenance is on.
> The first stays a `404` because existence is confidential (NFR-005, PRD §6
> "Another person's booking is invisible, not forbidden"). The second is `409`
> because the resource is real and public — the current *state* refuses the
> action.

> The 409 pair (`SLOT-TAKEN`, `COURT-NOT-BOOKABLE`) share a status and screen
> position but must remain separate codes: the copy is different, and the
> banner refers to different data (`courts.maintenance_reason` vs the just-taken
> time). Reusing one code because "both are conflicts" is exactly the drift the
> "never reuse a code" rule prevents.

## 4. Copy

The user-facing sentence per code, written once. Indonesian only (NFR-012).
Placeholders in `{braces}` are interpolated at render time from configuration or
from the error `details[]`, never typed into the string.

| Code | Message | Field message (E-VALIDATION only) |
|---|---|---|
| `E-VALIDATION` | `Ada isian yang perlu diperbaiki.` | see the field table below |
| `E-OUT-OF-HOURS` | `Jam yang kamu pilih di luar jam operasional {venueName}.` | — |
| `E-OUTSIDE-HORIZON` | `Kamu hanya bisa booking sampai {bookingHorizonDays} hari ke depan.` | — |
| `E-DURATION-BELOW-MIN` | `Durasi minimum {minimumDurationMinutes} menit.` | — |
| `E-VENUE-NOT-FOUND` | `Venue yang kamu cari tidak ditemukan.` | — |
| `E-COURT-NOT-FOUND` | `Lapangan yang kamu pilih sudah tidak ada.` | — |
| `E-BOOKING-NOT-FOUND` | `Booking tidak ditemukan.` | — |
| `E-BOOKING-SLOT-TAKEN` | `Jadwal ini baru saja diambil orang lain.` (banner body adds the date, time and court name from the request context) | — |
| `E-COURT-NOT-BOOKABLE` | `{courtName} sedang {maintenanceReason}. Buka lagi {maintenanceUntil}.` | — |
| `E-INTERNAL` | `Terjadi gangguan sesaat. Coba muat ulang.` | — |

### Field messages for `E-VALIDATION`

| `details[].field` | `details[].code` | Message |
|---|---|---|
| `booker.phone` | `too_short` | `Nomor WhatsApp minimal 9 angka, tanpa spasi atau tanda hubung.` (FR-030) |
| `booker.phone` | `format` | `Nomor WhatsApp hanya boleh berisi angka.` |
| `booker.name` | `required` | `Nama wajib diisi.` |
| `note` | `too_long` | `Catatan maksimal 500 karakter.` |
| `bookingDate` | `past` | `Tanggal tidak bisa di masa lalu.` |
| `bookingDate` | `beyond_horizon` | `Kamu hanya bisa booking sampai {bookingHorizonDays} hari ke depan.` |
| `startTime` | `format` | `Jam mulai harus format HH:mm.` |
| `duration` | `not_whole_hour` | `Durasi harus kelipatan 1 jam untuk rilis ini.` |
| `duration` | `below_minimum` | `Durasi minimum {minimumDurationMinutes} menit.` |

> The field-message table is the single source of truth for both the API's
> `details[]` codes and the frontend's field-error strings. A new field rule
> adds a row here first, then the schema and the copy follow — never the other
> way around.

## 5. Frontend mapping

Codes group into five presentation classes. The class decides where the message
lands; the copy table decides what it says.

| Class | Where it renders | Codes | Also |
|---|---|---|---|
| Field level | Under the offending row, plus a summarising banner above the form | `E-VALIDATION` | Row gets `aria-invalid="true"`, message linked by `aria-describedby` (NFR-011) |
| Blocking banner (danger) | Top of the review screen, above the form | `E-BOOKING-SLOT-TAKEN`, `E-COURT-NOT-BOOKABLE`, `E-OUT-OF-HOURS`, `E-OUTSIDE-HORIZON`, `E-DURATION-BELOW-MIN` | Primary CTA disables and relabels; typed values are preserved (FR-029) |
| Advisory banner (warn) | Same slot, non-blocking; CTA stays enabled | *client-derived*: cancellation-window advisory (FR-031) | Not raised from a server code; the server only exposes the raw times and the client-side rule (`isInsideCancellationWindow`, see [`FE/fe-architecture.md`](./FE/fe-architecture.md) §6) decides |
| Screen level | Replaces the primary content area with an error card | `E-INTERNAL` (both screens), `E-VENUE-NOT-FOUND`, `E-COURT-NOT-FOUND`, `E-BOOKING-NOT-FOUND` | Shows the `requestId` (FR-017) and a `Muat ulang` action |
| Navigation | Route change | `E-VENUE-NOT-FOUND` → `/404`; `E-COURT-NOT-FOUND` on the review screen → back to the list with an advisory | Happens before render, never after |

> The class-to-code mapping is a **`const` object** on the client, resolved once
> per response. It is never a chain of `if (code === …)` or a nested ternary
> inside JSX — both are banned by the linter ([`FE/lint.md`](./FE/lint.md) §3).

> The advisory-banner row is deliberately server-code-less. Turning FR-031 into
> `E-INSIDE-WINDOW` would be wrong — the request succeeds, and inventing a
> "successful error" is exactly how a code registry rots.

## 6. Rules for adding a code

1. **Registry first.** Add the row to §3 (status, raised-when, frontend
   behaviour) *before* the code exists in source. `/pspt:code` verifies the
   round trip.
2. **Copy at the same time.** Add the sentence to §4 in Indonesian; add the
   field-message row if the code is `E-VALIDATION`.
3. **One status.** Exactly one HTTP status. If the same condition needs two
   statuses on two endpoints, the endpoints disagree on what the condition
   *is* — split the code.
4. **Never reuse.** A new condition gets a new code, even if the old code's
   sentence "would work". Reuse silently merges two conditions in metrics,
   logs and support tickets.
5. **Domain error before HTTP.** The condition raises a typed domain error
   from `<feature>.errors.ts`; the error middleware turns it into the envelope.
   A controller that constructs the envelope inline is a defect, not a
   shortcut.
6. **Update the frontend mapping.** Every new code lands in exactly one class
   in §5, or explicitly opts out (like FR-031). "Fell through to the default"
   is not a mapping — it is a bug the day the first user hits it.

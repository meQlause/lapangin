# Booking review screen

**Stage:** S5 · **Route:** `/v/:slug/courts/:courtId/review` · **Derives from:** [`../../../mockup/booking-review.html`](../../../mockup/booking-review.html), [`../../../mockup/data.js`](../../../mockup/data.js) · **Access:** Owner (`X-User-Id` required for the mutation) · Design system: [`../design-system.md`](../design-system.md) · Architecture: [`../fe-architecture.md`](../fe-architecture.md)

The review screen on `/v/gor-kemang/courts/:courtId/review`. Reads a server-computed quote for the chosen slot, collects the booker's name/phone/note, and either commits the booking or explains why it cannot. Four states as drawn in the mockup: `normal`, `slot taken`, `invalid input`, `short-notice advisory`. **The client never computes an amount** (PRD §6).

---

## 1. Component tree

Naming from [`../fe-architecture.md`](../fe-architecture.md) §2.

```
src/features/review/
  ReviewScreen.tsx        route component; owns the quote query and the mutation
  Breadcrumb.tsx          "GOR Kemang · Review booking" (FR-018)
  ScheduleCard.tsx        the schedule <dl> (FR-019)
  BookerForm.tsx          name, phone, note; react-hook-form + Zod (FR-020..022, FR-030)
  CancellationPolicy.tsx  the copy sentence interpolating {cancellationWindowHours} (FR-023)
  CostBreakdown.tsx       three lines: unit, tax, total — formatted, not computed (FR-024, FR-026)
  LockNote.tsx            the "Harga dikunci …" copy (FR-025)
  Banners.tsx             the alert slot; danger (FR-028, FR-030) and warn (FR-031)
  SubmitBar.tsx           primary CTA + "Ganti jadwal" link (FR-027)
  useDraftBooking.ts      reads URL params, calls GET /quote, exposes {schedule, cost, policy}
  useCreateBooking.ts     POST /bookings mutation; onError branches by ApiError.code
  review.schema.ts        Zod: quote response, mutation request body, mutation response
  review.rules.ts         isInsideCancellationWindow(now, startsAt, windowHours) — pure
  index.ts                exports { ReviewScreen }
```

| Component | Owns |
|---|---|
| `ReviewScreen` | Quote query lifecycle, mutation lifecycle, banner dispatch, layout |
| `BookerForm` | Form state (react-hook-form); **not** the schedule or cost — those are read-only from the quote |
| `Banners` | Renders the current banner class from the dispatcher; empty when no advisory or error |
| `SubmitBar` | Renders the CTA; its label and enabled state are props from `ReviewScreen` |
| `CostBreakdown` | Reads three decimal-string fields; the only permitted operation is `formatIDR` — no `+`, no `*`, no `toFixed` (PRD §6, [`../fe-architecture.md`](../fe-architecture.md) §3) |

> **FR-029 lives here.** The three fields in `BookerForm` are keyed by a client-generated draft id from `useId()`, so a refetched quote after a `409 E-BOOKING-SLOT-TAKEN` does not blow the typed values away — the form owns its state and the quote does not touch it. See [`../fe-architecture.md`](../fe-architecture.md) §4.

---

## 2. Data contract

Three server operations. Two reads, one write.

### 2.1 `useSettings(slug)` — `GET /api/v1/venues/:slug`

Shared with the courts screen. Referenced by `CancellationPolicy` (`cancellationWindowHours`) and by no one else on this screen — every other configuration value is snapshotted into the quote response below.

### 2.2 `useDraftBooking({ slug, courtId, date, startTime, duration })` — `GET /api/v1/venues/:slug/courts/:courtId/quote`

Full contract in [`../../BE/features/bookings.md`](../../BE/features/bookings.md) §1.

**Fields this screen reads:**

| Field | Rendered as | Requirement |
|---|---|---|
| `data.court.name` | Schedule → Lapangan; breadcrumb link text | FR-018, FR-019 |
| `data.court.venueName`, `.venueAddress` | Schedule → Lokasi joined with ` · ` — `GOR Kemang · Jl. Kemang Raya No. 18, Jakarta Selatan` | FR-019 |
| `data.schedule.bookingDateLabel` | Schedule → Tanggal — `Minggu, 27 September 2026` | FR-019 |
| `data.schedule.startTime`, `.endTime` | Schedule → Jam — `10:00 sampai 12:00` | FR-019 |
| `data.schedule.durationHours` | Schedule → Durasi — `"2.00"` rendered as `2 jam` (strip trailing `.00`, matches `mockup/booking-review.html:124`) | FR-019 |
| `data.schedule.venueTimezone` | Schedule → Zona waktu — `Asia/Jakarta (WIB)`, using the server's `venueTimezoneLabel` when present | FR-019, NFR-003 |
| `data.cost.unitPrice`, `.durationHours` | Cost line 1 label — `Rp 180.000 × 2 jam` | FR-024 |
| `data.cost.subtotalAmount` | Cost line 1 value — `Rp 360.000` | FR-024, FR-026 |
| `data.cost.taxPercent` | Cost line 2 label — `Pajak 11.00%` | FR-024 |
| `data.cost.taxAmount` | Cost line 2 value — `Rp 39.600` | FR-024 |
| `data.cost.totalAmount` | Cost total — `Rp 399.600` | FR-024 |
| `data.policy.cancellationWindowHours` | Interpolated into `CancellationPolicy` copy | FR-023 |
| `data.policy.isInsideCancellationWindow` | If `true`, `Banners` renders the warn banner | FR-031 |

**Fields not read by this screen:** `data.court.id` (used only as URL context, not rendered), `data.court.venueSlug`, `data.schedule.bookingDate` (server sends both the ISO form and the label; the screen uses the label), `data.schedule.startsAt`/`endsAt` (the mutation resends `startTime` + `duration`; the client does not need the instants), `data.cost.currency` (`IDR` this release; folded into `formatIDR`).

> Nothing else on the response is read. Additional fields arriving later are fine ([`../fe-architecture.md`](../fe-architecture.md) §5).

**Cache and refetch:**

| Concern | Value |
|---|---|
| Cache key | `['quote', slug, courtId, { date, startTime, duration }]` |
| `staleTime` | `0` — a quote is per-navigation; the user has just committed to *this* slot |
| Refetch on window focus | On — a rate change or a taken slot appears on return |
| Retry | `(n, err) => err.status >= 500 && n < 2` — `400`/`404` never retry |

### 2.3 `useCreateBooking({ slug })` — `POST /api/v1/venues/:slug/bookings`

Full contract in [`../../BE/features/bookings.md`](../../BE/features/bookings.md) §2.

**Request body — the ONLY amounts absent from this list:**

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

| Field | Source in the UI |
|---|---|
| `courtId`, `bookingDate`, `startTime`, `duration` | URL params, echoed from the quote |
| `booker.name` | `BookerForm` — text input (FR-020) |
| `booker.phone` | `BookerForm` — tel input; the mockup shows `0812-1122-3344` and the client strips `-` and spaces before submit (FR-021, [`../../data-spec.md`](../../data-spec.md) §5.5 note) |
| `booker.note` | `BookerForm` — textarea, optional (FR-022) |

**No amount is ever in the request body.** `unitPrice`, `subtotalAmount`, `taxAmount`, `totalAmount`, `currency` are all server-owned; sending any of them fails with `400 E-VALIDATION` ([`../../BE/features/bookings.md`](../../BE/features/bookings.md) §2 server-owned fields, [`../fe-architecture.md`](../fe-architecture.md) §1).

**Mutation cache effects:**

| Trigger | Effect |
|---|---|
| Success (`201`) | Navigate to a confirmation view (out of scope this release — for now, keep the response in cache under `['booking', id]` and re-render the screen with the same shape). Invalidate `['courts', slug, ...]` |
| `409 E-BOOKING-SLOT-TAKEN` | Do not navigate. Render the danger banner. Invalidate `['courts', slug, ...]` so the availability strip refreshes when the user goes back |
| `409 E-COURT-NOT-BOOKABLE` | Do not navigate. Render the danger banner citing the maintenance reason and until-date from `error.details` |
| `400 E-VALIDATION` | Do not navigate. `setError(name, {...}, { shouldFocus: true })` for each `details[].field`; render the summarising danger banner |

---

## 3. States

Every state below is a code path in `ReviewScreen`. `?state=` from the mockup does not ship.

| State | Trigger | Presentation |
|---|---|---|
| `normal` | Fresh landing; `useDraftBooking.status === 'success'`; no mutation attempt yet | Full layout: `ScheduleCard`, `BookerForm`, `CancellationPolicy`, `CostBreakdown`, `LockNote`. `Banners` is empty. Primary CTA reads `Lanjut ke pembayaran`, enabled (FR-018..027) |
| `slot taken` | `useCreateBooking.error?.code === 'E-BOOKING-SLOT-TAKEN'` **or** a background availability refetch marks the exact slot as `taken` (checked with `classifySlot` from `features/courts/courts.rules.ts` on the quote's `startsAt`) | `Banners` renders the danger banner: `Jadwal ini baru saja diambil orang lain` — `Minggu, 27 September 2026 jam 10:00 sampai 12:00 sudah tidak tersedia di Lapangan Futsal A. Data yang kamu isi tetap tersimpan, tinggal pilih jam lain.`. `SubmitBar` primary becomes disabled and relabels to `Pilih jam lain dulu`. **The form values are preserved** (FR-028, FR-029) |
| `invalid input` | Client Zod schema rejects on submit, **or** `useCreateBooking.error?.code === 'E-VALIDATION'` | `Banners` renders the danger banner: `Ada isian yang perlu diperbaiki` — `Periksa kembali kolom yang ditandai merah.`. The `BookerForm` row for each offending field is marked invalid (`aria-invalid="true"`, `.form-row.invalid`) and shows the field-message from [`../error-handling.md`](../error-handling.md) §4 (e.g. `Nomor WhatsApp minimal 9 angka, tanpa spasi atau tanda hubung.`). `SubmitBar` primary stays enabled and re-labelled `Lanjut ke pembayaran` — the user needs to be able to try again after the fix (FR-030) |
| `short-notice advisory` | `data.policy.isInsideCancellationWindow === true` (server-decided) **or** `isInsideCancellationWindow(now, startsAt, windowHours)` returns `true` on the client (for reactivity without a refetch) | `Banners` renders the warn banner: `Booking kurang dari 12 jam sebelum main` — `Jadwal ini masih bisa dipesan, tetapi tidak bisa dibatalkan lagi setelah pembayaran.`. **`SubmitBar` primary stays enabled** — this is an advisory, not a blocker (FR-031) |

> The `short-notice advisory` state combines with `normal` — the user still sees the schedule, form, and cost. It also combines with `invalid input` and `slot taken` in principle, but `Banners` renders **one** banner at a time; the priority is `slot taken` > `invalid input` > `short-notice advisory`, decided in `Banners.tsx` from the props `ReviewScreen` passes.

> Loading and error variants of the quote query use the shared `<LoadingState />` and `<ErrorState />` from `features/courts/` — same look, same requestId behaviour (FR-015, FR-017). They are not separate states of *this* screen; they are the query's states, and `ReviewScreen` returns them from an early `if` before rendering the form.

---

## 4. Validation

The client schema mirrors the server schema; the server is authoritative. Field-level rules live once in [`../error-handling.md`](../error-handling.md) §4 field table.

Schemas live in `review.schema.ts`:

```ts
// Mirrors the POST /venues/:slug/bookings body — matches BE/features/bookings.md §2
export const bookerSchema = z.object({
  name: z.string().trim().min(1, 'required').max(120),           // FR-020
  phone: z
    .string()
    .transform((s) => s.replace(/[-\s]/g, ''))                    // strip formatting first
    .pipe(z.string().regex(/^[0-9]{9,20}$/, 'too_short')),        // FR-021
  note: z.string().trim().max(500, 'too_long').optional(),        // FR-022
});
```

| Field | Client rule | Server rule mirrored | On failure |
|---|---|---|---|
| `booker.name` | `trim().min(1)`, `max(120)` | Same | Row `.form-row.invalid`; message `Nama wajib diisi.` |
| `booker.phone` | Strip `-`/space, then `/^[0-9]{9,20}$/` | Same | Row `.form-row.invalid`; message `Nomor WhatsApp minimal 9 angka, tanpa spasi atau tanda hubung.` (`too_short`) or `Nomor WhatsApp hanya boleh berisi angka.` (`format`) — decided by which regex fails |
| `booker.note` | `.trim().max(500)` | Same | Row `.form-row.invalid`; message `Catatan maksimal 500 karakter.` |

`react-hook-form` mode: `onSubmit`, plus `revalidateMode: 'onBlur'`. `setError(..., { shouldFocus: true })` is called for every server-returned `details[].field` in `useCreateBooking.onError`, or the invalid field is not focused on API rejection and the screen reader stays silent ([`../fe-stack.md`](../fe-stack.md) §7 trap).

> The `duration`, `date` and `startTime` fields are not in the form — they arrive from the URL and are already validated by the courts screen filter and by the quote endpoint. If a hand-typed URL smuggles a bad value in, the quote query returns `E-VALIDATION` and the screen renders the shared `<ErrorState>`.

---

## 5. Error mapping

Reads the class table in [`../error-handling.md`](../error-handling.md) §5. This screen can see the full range:

| Code | Class | On this screen |
|---|---|---|
| `E-VALIDATION` | field | `BookerForm` rows marked invalid per `details[].field`; danger banner `Ada isian yang perlu diperbaiki` above the form (FR-030) |
| `E-OUT-OF-HOURS` | blocking | Danger banner reading `Jam yang kamu pilih di luar jam operasional GOR Kemang.`. `SubmitBar` disabled, relabelled to `Ganti jadwal` (the user must go back) |
| `E-OUTSIDE-HORIZON` | blocking | Danger banner from the copy table. `SubmitBar` disabled + relabelled |
| `E-DURATION-BELOW-MIN` | blocking | Same treatment |
| `E-COURT-NOT-FOUND` | navigate | Router redirects back to `/v/:slug` with an advisory banner passed via location state |
| `E-BOOKING-SLOT-TAKEN` | blocking | The `slot taken` state above (FR-028) |
| `E-COURT-NOT-BOOKABLE` | blocking | Danger banner interpolating `{courtName}`, `{maintenanceReason}`, `{maintenanceUntil}` from `error.details`. `SubmitBar` disabled and relabelled to `Tidak tersedia` |
| `E-VENUE-NOT-FOUND` | navigate | Redirects to `/*` (404) — this screen never renders when the venue slug is invalid |
| `E-INTERNAL` | screen | Replaces the review layout with the shared `<ErrorState requestId={...} />`. The `Muat ulang` action retries the mutation (or the quote query, whichever raised) |

The dispatcher is the `const ERROR_CLASS` in `src/api/errors.ts`, not a chained ternary ([`../fe-architecture.md`](../fe-architecture.md) §9, [`../fe-stack.md`](../fe-stack.md) §2). Adding a new error code adds a row here **and** in the `ERROR_CLASS` map — enforced by `/pspt:code`.

> The advisory banner for FR-031 is deliberately **not** in this table. It is not raised from a server error code; the server exposes `data.policy.isInsideCancellationWindow` as data, and the client renders the banner from that ([`../error-handling.md`](../error-handling.md) §5 advisory-banner note). Inventing `E-INSIDE-WINDOW` for a successful response would rot the registry.

---

## 6. Interactions

| Control | Does | Notes |
|---|---|---|
| Breadcrumb `GOR Kemang` link | Navigates back to `/v/:slug` preserving the current filter search params if any | The breadcrumb is a `<a href>`, not a `history.back()` call — a shared link should land on the court list, not on nothing (FR-018) |
| Name / phone / note inputs | Update `react-hook-form` state; validate on blur; do not touch the query cache | Form-only state (FR-020..022) |
| Cancellation policy sentence | Read-only text; interpolates `{cancellationWindowHours}` from the quote response, never from a hard-coded literal | Changing the setting on the server changes the sentence (FR-023, NFR-013) |
| Cost breakdown | Read-only; `formatIDR(subtotalAmount)`, `formatIDR(taxAmount)`, `formatIDR(totalAmount)` — no arithmetic anywhere | The `Money` branded type ([`../fe-architecture.md`](../fe-architecture.md) §5) makes `subtotalAmount + taxAmount` a compile error (FR-026) |
| `Lanjut ke pembayaran` primary CTA (`normal`) | Runs client Zod → `useCreateBooking.mutate(body)` | On success, navigate to the (future) confirmation. On error, branch by `error.code` per §5. **Not optimistic** — this is the confirmation screen; there is nothing to be optimistic about ([`../fe-architecture.md`](../fe-architecture.md) §5) (FR-027) |
| `Pilih jam lain dulu` primary CTA (`slot taken`) | Disabled `<button>`, no handler | The `Ganti jadwal` link below stays enabled; the user goes back to the court list, invalidated availability included (FR-028) |
| `Ganti jadwal` link | Navigates to `/v/:slug` preserving the current filter search params | Always visible under the primary; never disabled (FR-027) |

**Draft/flow state that survives across the state changes:**

| Value | Where it lives | Survives `slot taken` | Survives `invalid input` | Survives `short-notice advisory` |
|---|---|---|---|---|
| `booker.name` | `react-hook-form` local, keyed by `useId()` | yes (FR-029) | yes | yes |
| `booker.phone` | same | yes | yes (with formatting preserved as typed) | yes |
| `booker.note` | same | yes | yes | yes |
| The quote (schedule + cost) | TanStack Query cache | Refetched on the background invalidation, but the form does not depend on it | — | — |

> Everything the user typed survives every branch below `Lanjut ke pembayaran`. This is FR-029 stated aloud, and it is why `BookerForm` owns its state instead of reading it from the mutation response.

**No optimistic mutation.** A `POST /bookings` that "seemed to work" and then failed would be worse than a slower confirmation ([`../fe-architecture.md`](../fe-architecture.md) §5).

---

## 7. Acceptance criteria

Written so `tests/e2e/booking-review.spec.ts` implements them without interpretation. Every figure below matches the seed ([`../../data-spec.md`](../../data-spec.md) §10), [`../../BE/features/bookings.md`](../../BE/features/bookings.md) §1 figure check, and [`../error-handling.md`](../error-handling.md) §4 copy.

### 7.1 Normal state

- **Given** the seed and URL `/v/gor-kemang/courts/c1a7f2d4-2b88-4f1a-9a10-0f6e8c11b201/review?date=2026-09-27&startTime=10:00&duration=2`, **when** the page loads, **then** the breadcrumb reads `GOR Kemang · Review booking` and the page heading reads `Review booking` with the sub-copy `Periksa jadwal dan biayanya sebelum lanjut ke pembayaran.`. (FR-018)
- **Given** the same, **when** the page loads, **then** the schedule card shows `Lapangan Futsal A`, `GOR Kemang · Jl. Kemang Raya No. 18, Jakarta Selatan`, `Minggu, 27 September 2026`, `10:00 sampai 12:00`, `2 jam`, `Asia/Jakarta (WIB)`. (FR-019)
- **Given** the same, **when** the page loads, **then** the booker form shows `Nama` prefilled `Azka Willian Muhammad`, `Nomor WhatsApp` prefilled `0812-1122-3344` with the hint `Dipakai untuk konfirmasi dan kode masuk lapangan.`, and an optional `Catatan untuk pengelola` textarea. (FR-020, FR-021, FR-022)
- **Given** the same, **when** the page loads, **then** the cancellation card contains the sentence including the substring `12 jam`. (FR-023)
- **Given** the same, **when** the page loads, **then** the cost breakdown shows the unit line `Rp 180.000 × 2 jam` → `Rp 360.000`, the tax line `Pajak 11.00%` → `Rp 39.600`, and the total `Rp 399.600`. (FR-024, FR-026, FR-032)
- **Given** the same, **when** the page loads, **then** the lock note reads `Harga dikunci saat booking dibuat. Perubahan tarif lapangan setelah ini tidak mengubah tagihanmu.`. (FR-025)
- **Given** the same, **when** the page loads, **then** the primary CTA reads `Lanjut ke pembayaran` and is enabled, and a `Ganti jadwal` link is visible below it. (FR-027)

### 7.2 Slot-taken state

- **Given** the form is filled with `Azka Willian Muhammad`, `081211223344`, and `Tim 10 orang, minta bola pinjam kalau ada.`, **when** the user clicks `Lanjut ke pembayaran` and the API returns `409 E-BOOKING-SLOT-TAKEN`, **then** a danger banner appears above the form with the title `Jadwal ini baru saja diambil orang lain` and body naming the slot and the court, and the primary CTA becomes disabled with the label `Pilih jam lain dulu`. (FR-028)
- **Given** the same, **when** the banner renders, **then** every value in the form (name, phone, note) is unchanged from what the user typed. (FR-029)
- **Given** the same, **when** the mutation resolves, **then** the `['courts', slug, ...]` query is invalidated. (Side effect from [`../../BE/features/bookings.md`](../../BE/features/bookings.md) §2)

### 7.3 Invalid-input state

- **Given** the form is filled with `Azka Willian Muhammad` and phone `0812` (four digits), **when** the user clicks `Lanjut ke pembayaran`, **then** the phone row is marked `aria-invalid="true"` with the class `form-row invalid`, its message reads `Nomor WhatsApp minimal 9 angka, tanpa spasi atau tanda hubung.`, and a danger banner above the form reads `Ada isian yang perlu diperbaiki` — `Periksa kembali kolom yang ditandai merah.`. (FR-030)
- **Given** the same, **when** the failure renders, **then** focus is on the phone input (announced by screen readers via `role="alert"` on the banner). (NFR-011, [`../fe-stack.md`](../fe-stack.md) §7 trap)

### 7.4 Short-notice advisory state

- **Given** a quote response with `data.policy.cancellationWindowHours = 12` and `data.policy.isInsideCancellationWindow = true`, **when** the page renders, **then** a warn banner appears above the form with the title `Booking kurang dari 12 jam sebelum main` and body `Jadwal ini masih bisa dipesan, tetapi tidak bisa dibatalkan lagi setelah pembayaran.`, and the primary CTA `Lanjut ke pembayaran` stays enabled. (FR-031)
- **Given** the same, **when** `venues.cancellation_window_hours` is changed to `24` and the page re-renders, **then** both the warning banner title and the cancellation-policy sentence read `24 jam` in place of `12 jam` — no code change is needed. (NFR-013, FR-023, FR-031)

### 7.5 Cross-screen

- **Given** any state above, **when** the page renders, **then** the header shows `Lapangin`, a link `Cari lapangan`, a `Booking saya` placeholder without a destination, and an avatar `AW`; the footer shows the stage line. (FR-033, FR-034, FR-035)

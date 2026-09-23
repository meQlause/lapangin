# Courts screen

**Stage:** S5 · **Route:** `/v/:slug` · **Derives from:** [`../../../mockup/courts.html`](../../../mockup/courts.html), [`../../../mockup/data.js`](../../../mockup/data.js) · **Access:** Public · Design system: [`../design-system.md`](../design-system.md) · Architecture: [`../fe-architecture.md`](../fe-architecture.md)

The court list on `/v/gor-kemang`. Reads the venue's catalogue, the caller's filters (date, start time, duration, sport), and renders one card per court with the hourly availability strip for the chosen date. Four states, exactly as drawn in the mockup: `filled`, `loading`, `empty`, `error`. Does not create anything.

---

## 1. Component tree

Every file mirrors the mockup shape. Naming from [`../fe-architecture.md`](../fe-architecture.md) §2.

```
src/features/courts/
  CourtsScreen.tsx        route component; owns the query, dispatches state
  FilterBar.tsx           date, startTime, duration, sport (FR-010..013)
  CourtList.tsx           renders the array of CourtCard
  CourtCard.tsx           one <article class="court"> — photo, body, side (FR-002..006, FR-014)
  AvailabilityStrip.tsx   the row of SlotChip (FR-007)
  SlotChip.tsx            one <span class="slot [taken|closed]"> (FR-008, FR-009)
  LoadingState.tsx        three <Skeleton> rows (FR-015)
  EmptyState.tsx          the empty-card layout (FR-016)
  ErrorState.tsx          the error-card layout, shows requestId (FR-017)
  useCourts.ts            TanStack Query hook
  courts.schema.ts        Zod schemas for the response and for the filter URL
  courts.rules.ts         classifySlot(openingTime, closingTime, bookings, hour) — pure
  index.ts                exports { CourtsScreen }
```

| Component                                    | Owns                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CourtsScreen`                               | Query lifecycle (`useCourts`), state dispatch (`LoadingState`/`EmptyState`/`ErrorState`/`CourtList`), page head                                   |
| `FilterBar`                                  | The four filter inputs; writes to `useSearchParams`; owns no query state                                                                          |
| `CourtList` / `CourtCard`                    | Pure rendering of the response items; no query knowledge                                                                                          |
| `AvailabilityStrip` / `SlotChip`             | Renders `data.items[].availability.slots[]` verbatim; no arithmetic, no state derivation on the client — the backend already classified each hour |
| `LoadingState` / `EmptyState` / `ErrorState` | Presentational only; `ErrorState` receives `error.requestId` as a prop                                                                            |

> State lives at `CourtsScreen`; every child is presentational. This is the one screen where lifting state to the route is cheaper than passing a query hook down, because every child renders the same query.

---

## 2. Data contract

Two queries. Both cached by TanStack Query, keyed by URL.

### 2.1 `useSettings(slug)` — `GET /api/v1/venues/:slug`

Read once per venue, referenced by every child that quotes a configuration value (tax percent, cancellation window, opening hours). Detailed in [`bookings.md`](./bookings.md) §2 (same hook).

### 2.2 `useCourts({ slug, date, startTime, duration, sport })` — `GET /api/v1/venues/:slug/courts`

Full request/response contract in [`../../BE/features/courts.md`](../../BE/features/courts.md) §1.

**Fields this screen reads:**

| Field                                                 | Rendered as                                                                                                                                                               | Requirement            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `data.date`                                           | Not rendered; cache key                                                                                                                                                   | —                      |
| `data.filters.startTime`, `.duration`, `.sport`       | Echoed into the `EmptyState` copy (`Minggu, 27 September 2026 jam 10:00 selama 2 jam`)                                                                                    | FR-016                 |
| `data.items[].id`                                     | Not rendered; used as React `key` and as URL for `Pilih jadwal`                                                                                                           | FR-014                 |
| `data.items[].name`                                   | Card `<h2>` — `Lapangan Futsal A`                                                                                                                                         | FR-002                 |
| `data.items[].surface`, `.floor`                      | Card subtitle joined with `·` — `Rumput sintetis · Lantai 1`                                                                                                              | FR-002                 |
| `data.items[].photoLabel`                             | Photo panel label — `Futsal A`                                                                                                                                            | FR-002                 |
| `data.items[].pricePerHour`                           | `formatIDR("180000.00")` → `Rp 180.000`                                                                                                                                   | FR-004, FR-032         |
| `data.items[].amenities[]`                            | One `<Tag>` per label, in order                                                                                                                                           | FR-003                 |
| `data.items[].status`                                 | Drives status line and action button — `available` shows `Bisa dibooking hari ini` + `Pilih jadwal`; `maintenance` shows the maintenance line + disabled `Tidak tersedia` | FR-005, FR-006         |
| `data.items[].maintenanceReason`, `.maintenanceUntil` | Read when `status === 'maintenance'` — `Perawatan sampai 30 September`                                                                                                    | FR-005, FR-006         |
| `data.items[].availability.slots[]`                   | One `<SlotChip>` per element; `start` is the label, `state` picks the class                                                                                               | FR-007, FR-008, FR-009 |

**Fields not read by this screen:** `data.items[].sport`, `.currency`, `.displayOrder`, `.availability.openingTime`, `.availability.closingTime`. `sport` and `displayOrder` are used by the backend to order and filter; `currency` is `IDR` this release and folded into `formatIDR`; `openingTime`/`closingTime` are already applied by the backend when producing `closed` slots.

> **Nothing else on the response is read** ([`../fe-architecture.md`](../fe-architecture.md) §5). Additional fields arriving in a later release are fine — the schema is `z.object({...}).passthrough()` for `items[]`, strict at the top level.

### 2.3 Query key and refetch

| Concern                 | Value                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache key               | `['courts', slug, { date, startTime, duration, sport }]`                                                                                                    |
| `staleTime`             | `30_000` ms — a court list rarely changes inside 30 s                                                                                                       |
| Refetch on window focus | On — a friend booking in another tab appears when the user returns ([`../fe-architecture.md`](../fe-architecture.md) §5)                                    |
| Retry                   | Default from `queryClient.ts`: `(n, err) => err.status >= 500 && n < 2`. `400` and `404` never retry ([`../fe-stack.md`](../fe-stack.md) §7)                |
| Invalidated by          | `POST /venues/:slug/bookings` success **and** `409 E-BOOKING-SLOT-TAKEN` ([`../../BE/features/bookings.md`](../../BE/features/bookings.md) §2 side effects) |

---

## 3. States

Every state below is a code path in `CourtsScreen`. `?state=` from the mockup does not ship.

| State     | Trigger                                                     | Presentation                                                                                                                                                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `filled`  | `useCourts.status === 'success'`, `data.items.length > 0`   | `<CourtList items={data.items} />`. `CourtCard` renders the mockup shape exactly; `available` shows the strip and the `Pilih jadwal` link; `maintenance` shows `Jadwal ditutup sementara karena perawatan lapangan.`, no strip, and a disabled `Tidak tersedia` button (FR-006)                                                      |
| `loading` | `useCourts.status === 'pending'`, no cached data yet        | `<LoadingState />` — three `<Skeleton>` rows. Under 100 ms to first paint (NFR-009)                                                                                                                                                                                                                                                  |
| `empty`   | `useCourts.status === 'success'`, `data.items.length === 0` | `<EmptyState />` with copy quoting the filter values: `Tidak ada lapangan yang cocok`, then `Tidak ada lapangan kosong pada {bookingDateLabel} jam {startTime} selama {duration} jam.`, then a `Coba geser jam mulai atau pilih tanggal lain.` line and an `Atur ulang filter` button that clears every filter search param (FR-016) |
| `error`   | `useCourts.status === 'error'`                              | `<ErrorState requestId={error.requestId} />` — `Jadwal gagal dimuat`, then `Kami tidak bisa mengambil jadwal lapangan saat ini. Coba lagi sebentar lagi.`, then `<Tag>Kode permintaan: {requestId}</Tag>` and a `Muat ulang` button that triggers `queryClient.refetchQueries(['courts', slug, ...])` (FR-017, NFR-007)              |

> The `filled` branch is not "one court" — the mockup's Basket Indoor card is a filled-state variant, not a separate state. A court under maintenance appears in `data.items[]` with an empty `availability.slots[]` and a populated `maintenanceReason`, and `CourtCard` chooses the layout from `status`. That is why the seed contains three courts and the response above contains three items.

---

## 4. Validation

Client-side rules are a **mirror** of the server schema, never a second source of truth. Every rule below is the exact same predicate the API applies; the client rejects locally purely for feedback speed. The API is still called and is still authoritative ([`../../BE/features/courts.md`](../../BE/features/courts.md) §1).

Schemas live in `courts.schema.ts`:

```ts
// The URL search params for /v/:slug — matches the API's query schema
export const courtsFilterSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // FR-010, mirrors API
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):(00|30)$/)
    .default('06:00'), // FR-011
  duration: z.coerce.number().int().min(1).max(3).default(2), // FR-012
  sport: z.enum(['futsal', 'badminton', 'basket']).optional(), // FR-013
});
```

| Field       | Client rule                                             | Server rule mirrored                                                                                                                                                               | Requirement |
| ----------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `date`      | `YYYY-MM-DD` format                                     | Same, plus `today ≤ date ≤ today + booking_horizon_days` (server-only, produces `E-OUTSIDE-HORIZON`)                                                                               | FR-010      |
| `startTime` | `HH:00` or `HH:30`; `<input step="1800">` in the mockup | Same shape; server also checks `[openingTime, closingTime)` and produces `E-OUT-OF-HOURS`                                                                                          | FR-011      |
| `duration`  | Integer in `{1, 2, 3}`                                  | Same; server also checks `startTime + duration ≤ closingTime`                                                                                                                      | FR-012      |
| `sport`     | One of `futsal`, `badminton`, `basket`, or absent       | Same. **Absent means "all sports"** — `Semua` is the _absence_ of the parameter, not the literal `"Semua"` ([`../../BE/features/courts.md`](../../BE/features/courts.md) §1 notes) | FR-013      |

> The `Semua` sport chip clears the `sport` search param instead of sending `sport=Semua`. Sending the literal fails with `E-VALIDATION` on the server. This is written here so a "why does clicking `Semua` sometimes 400" question has a home.

> The horizon rule (`E-OUTSIDE-HORIZON`) is deliberately not mirrored on the client. The API rejects it with the copy `Kamu hanya bisa booking sampai 30 hari ke depan.` and the banner then explains the ceiling; duplicating the rule client-side means changing it in two places when the horizon changes (NFR-013).

---

## 5. Error mapping

Reads the class table in [`../error-handling.md`](../error-handling.md) §5. This screen sees:

| Code                   | Class    | On this screen                                                                                                                                                                                                            |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E-VALIDATION`         | field    | Never reaches this screen from the API — the filter bar's client validation prevents a malformed URL from being sent. If the URL was tampered with, it maps to `screen` (the `<ErrorState>` card) rather than field-level |
| `E-OUTSIDE-HORIZON`    | blocking | Rendered as `<ErrorState>` (screen-level), not a banner — this screen has no form above which to hang one. Copy from `[`../error-handling.md`](../error-handling.md) §4                                                   |
| `E-OUT-OF-HOURS`       | blocking | Same treatment as `E-OUTSIDE-HORIZON` on this screen                                                                                                                                                                      |
| `E-DURATION-BELOW-MIN` | blocking | Same                                                                                                                                                                                                                      |
| `E-VENUE-NOT-FOUND`    | navigate | Router redirects to `/*` (404 route) before this screen renders; never seen as a card here                                                                                                                                |
| `E-INTERNAL`           | screen   | `<ErrorState>` — the state above; the `Muat ulang` action retries the query (FR-017)                                                                                                                                      |

The dispatcher is the `const ERROR_CLASS` in `src/api/errors.ts` shown in [`../fe-architecture.md`](../fe-architecture.md) §9. The screen-level render is:

```ts
// Sketch — inside CourtsScreen
if (isLoading) return <LoadingState />;
if (isError) return <ErrorState requestId={error.requestId} onRetry={refetch} />;
if (data.items.length === 0) return <EmptyState filters={data.filters} onReset={clearFilters} />;
return <CourtList items={data.items} />;
```

The chained ternary equivalent (`{isLoading ? <A/> : isError ? <B/> : ...}`) is banned by `sonarjs/no-nested-conditional` ([`../fe-stack.md`](../fe-stack.md) §2). Early returns above are the enforced shape.

---

## 6. Interactions

| Control                                     | Does                                                                                    | Notes                                                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date input                                  | On `change`, writes `date` to the URL search params; `useCourts` refetches              | The input is `<input type="date" min={today} max={today + booking_horizon_days}>`; native picker enforces the horizon (FR-010)                                                                                 |
| Start-time input                            | On `change`, writes `startTime`; refetch                                                | `<input type="time" step="1800">` matches the mockup (FR-011)                                                                                                                                                  |
| Duration select                             | On `change`, writes `duration`; refetch                                                 | Three options: `1 jam`, `2 jam`, `3 jam` (FR-012)                                                                                                                                                              |
| Sport chip                                  | On `click`, exactly one `aria-pressed="true"` at a time; writes/clears `sport`; refetch | The `Semua` chip clears; other chips set. Rendered as `<button role="radio" aria-checked>` inside a `<div role="radiogroup">` for keyboard nav (NFR-011, [`../fe-architecture.md`](../fe-architecture.md) §10) |
| `Pilih jadwal` link (available court)       | Navigates to `/v/:slug/courts/:courtId/review?date=…&startTime=…&duration=…`            | The three schedule params are propagated so the review screen quotes the same slot (FR-014)                                                                                                                    |
| `Tidak tersedia` button (maintenance court) | Disabled; renders as `<button disabled>`, focusable and read by screen readers          | The card still lists amenities and the maintenance line so the user understands _why_ (FR-006)                                                                                                                 |
| `Atur ulang filter` button (empty state)    | Clears every filter search param, resets to defaults                                    | Triggers a refetch with the default filter set (FR-016)                                                                                                                                                        |
| `Muat ulang` button (error state)           | Calls `queryClient.refetchQueries(['courts', slug, ...])`                               | No page reload — the header, footer and filter bar stay mounted (FR-017)                                                                                                                                       |

**No optimistic updates on this screen.** It is read-only. The `useCourts` query is only invalidated by a booking write, which happens on the other screen ([`../../BE/features/bookings.md`](../../BE/features/bookings.md) §2 side effects).

---

## 7. Acceptance criteria

Written so `tests/e2e/courts.spec.ts` implements them without interpretation. Every figure below matches the seed ([`../../data-spec.md`](../../data-spec.md) §10) and [`../../BE/features/courts.md`](../../BE/features/courts.md) §1 example response.

### 7.1 Filled state

- **Given** the seed venue `gor-kemang` and `date=2026-09-27, startTime=10:00, duration=2`, **when** the page loads, **then** the header reads `GOR Kemang` and its meta line reads `Jl. Kemang Raya No. 18, Jakarta Selatan · Senin sampai Minggu, 06:00 sampai 23:00 · WIB`. (FR-001)
- **Given** the same, **when** the page loads, **then** the first card shows `Lapangan Futsal A`, subtitle `Rumput sintetis · Lantai 1`, amenities `Lampu malam`, `Ruang ganti`, `Tribun`, `Parkir luas`, price `Rp 180.000` with `per jam, belum termasuk pajak 11.00%`, and status `Bisa dibooking hari ini`. (FR-002..005, FR-032)
- **Given** the same, **when** the page loads, **then** the Futsal A availability strip renders all 17 chips for `[06:00, 23:00)` in order, with `08:00`, `09:00`, `19:00` in `taken` state (line-through) and every other chip `free`. (FR-007, FR-008; aligned with the explicit P2 correction in `phases.md` §Phase 2)
- **Given** the same, **when** the page loads, **then** the Badminton 3 strip includes an `11:00` chip in `free` state, matching the backend response. The mockup's `closed` illustration at this hour is not returned by the current service because `11:00` is inside venue hours; the client renders slot states verbatim. (FR-008, FR-009; aligned with the explicit divergence note in `../BE/features/courts.md` §1)
- **Given** the same, **when** the page loads, **then** the Basket Indoor card shows the maintenance body `Jadwal ditutup sementara karena perawatan lapangan.`, status `Perawatan sampai 30 September`, no availability strip, and a disabled button reading `Tidak tersedia`. (FR-005, FR-006)
- **Given** the same, **when** the user clicks `Pilih jadwal` on the Futsal A card, **then** the URL becomes `/v/gor-kemang/courts/{futsal-a-id}/review?date=2026-09-27&startTime=10:00&duration=2`, where `{futsal-a-id}` is the id returned for that card by the real API. (FR-014)

### 7.2 Loading state

- **Given** the API call is in-flight and no cache exists, **when** the page renders, **then** three `Skeleton` rows appear in the list slot within 100 ms of navigation. (FR-015, NFR-009)

### 7.3 Empty state

- **Given** the API returns `data.items.length === 0` for `date=2026-09-27, startTime=10:00, duration=2`, **when** the page renders, **then** the empty card shows the heading `Tidak ada lapangan yang cocok` and the body `Tidak ada lapangan kosong pada Minggu, 27 September 2026 jam 10:00 selama 2 jam. Coba geser jam mulai atau pilih tanggal lain.`. (FR-016)
- **Given** the empty state is rendered, **when** the user clicks `Atur ulang filter`, **then** the search params are cleared and the query refetches. (FR-016)

### 7.4 Error state

- **Given** the API returns `500 E-INTERNAL` with `requestId=req_01J9Z4K2M7Q`, **when** the page renders, **then** the error card shows heading `Jadwal gagal dimuat`, body `Kami tidak bisa mengambil jadwal lapangan saat ini. Coba lagi sebentar lagi.`, a tag reading `Kode permintaan: req_01J9Z4K2M7Q`, and a `Muat ulang` button. (FR-017, NFR-007)
- **Given** the error state is rendered, **when** the user clicks `Muat ulang`, **then** `queryClient.refetchQueries` is called with the current cache key. (FR-017)

### 7.5 Cross-screen

- **Given** any state above, **when** the page renders, **then** the header shows `Lapangin`, a link `Cari lapangan`, a `Booking saya` placeholder without a destination, and an avatar `AW`; the footer shows the stage line. (FR-033, FR-034, FR-035)

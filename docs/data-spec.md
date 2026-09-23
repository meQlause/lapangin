# Lapangin — Data specification

**Stage:** S2 · **Database:** PostgreSQL 16 · Conventions: [`../references/conventions.md`](../references/conventions.md)

The schema for one venue with bookable courts and non-overlapping hourly bookings. Every table on this page traces to a value drawn in `mockup/` (§1) or to a written rule that produced a column no screen renders (§7). Payments are out of scope this release, so `bookings.payment_status` exists but stays `pending`.

---

## 1. Extraction table

Read off `mockup/courts.html`, `mockup/booking-review.html` and `mockup/data.js`. `Implied field` uses the same identifier the mockup already labels with `data-field=`.

### 1.1 `courts.html`

| Screen element | Rendered value | Implied field | Implied rule | Source |
|---|---|---|---|---|
| Venue heading | `GOR Kemang` | `venues.name` | one venue this release, model permits many | FR-001 |
| Venue meta line | `Jl. Kemang Raya No. 18, Jakarta Selatan · Senin sampai Minggu, 06:00 sampai 23:00 · WIB` | `venues.address`, `venues.opening_time`, `venues.closing_time`, `venues.timezone` | zone label derived from IANA id | FR-001 |
| Court photo panel | `Futsal A` | `courts.photo_label` | text placeholder for the photo asset | FR-002 |
| Court title | `Lapangan Futsal A` | `courts.name` | — | FR-002 |
| Court subtitle | `Rumput sintetis · Lantai 1` | `courts.surface`, `courts.floor` | — | FR-002 |
| Amenity chip | `Lampu malam`, `Ruang ganti`, `Tribun`, `Parkir luas` | `amenities.label` via `court_amenities` | shared label, renaming reaches every court | FR-003 |
| Unit price | `Rp 180.000` | `courts.price_per_hour` | decimal string on the wire, formatted client-side | FR-004, FR-032 |
| Tax quote | `belum termasuk pajak 11.00%` | `venues.tax_percent` | percent stored as decimal(5,2) | FR-004 |
| Court status line | `Bisa dibooking hari ini` \| `Perawatan sampai 30 September` | `courts.status`, `courts.maintenance_until` | status enum drives the label; date only rendered when `maintenance` | FR-005 |
| Maintenance body | `Jadwal ditutup sementara karena perawatan lapangan.` | `courts.maintenance_reason` | maintained court still listed | FR-006 |
| Slot chip start | `06:00`, `07:00`, … | derived from `venues.opening_time`, `bookings.starts_at`, `bookings.ends_at` | hourly window, half-open `[start, end)` | FR-007 |
| Slot state | `free` \| `taken` \| `closed` | derived; `taken` when a confirmed/pending booking overlaps; `closed` when outside opening hours | three-way classification, `closed` distinct from `taken` | FR-008, FR-009 |
| Date input | `2026-09-27` | filter, not persisted | at most `venues.booking_horizon_days` ahead | FR-010 |
| Start-time input | `10:00`, `step=1800` | filter | half-hour resolution on the client, hour resolution on the server | FR-011 |
| Duration select | `1 jam` \| `2 jam` \| `3 jam` | filter | integer hours, capped by opening window | FR-012 |
| Sport chip | `Semua` \| `Futsal` \| `Badminton` \| `Basket` | filter over `courts.sport` | `Semua` is the absence of the filter | FR-013 |
| Action | `Pilih jadwal` → `booking-review.html` | link, no persisted field | — | FR-014 |
| Skeleton | placeholder cards | UI state, no field | — | FR-015 |
| Empty body | `Minggu, 27 September 2026 jam 10:00 selama 2 jam` | echoes the filter values | — | FR-016 |
| Error tag | `Kode permintaan: req_01J9Z4K2M7Q` | error envelope `requestId` | ULID-shape correlation id, see §7 | FR-017, NFR-007 |

> Date correction: `2026-09-27` is Sunday. The static mockup hard-codes `Sabtu`; the API and UI format the actual date as `Minggu` in the venue timezone.

### 1.2 `booking-review.html`

| Screen element | Rendered value | Implied field | Implied rule | Source |
|---|---|---|---|---|
| Crumb | `GOR Kemang · Review booking` | `venues.name` | — | FR-018 |
| Schedule → Lapangan | `Lapangan Futsal A` | `courts.name` | — | FR-019 |
| Schedule → Lokasi | `GOR Kemang · Jl. Kemang Raya No. 18, Jakarta Selatan` | `venues.name`, `venues.address` | — | FR-019 |
| Schedule → Tanggal | `Minggu, 27 September 2026` | `bookings.booking_date` | Indonesian long date formatted in the venue timezone | FR-019 |
| Schedule → Jam | `10:00 sampai 12:00` | `bookings.start_time`, `bookings.end_time` | `HH:mm` on the wire | FR-019 |
| Schedule → Durasi | `2 jam` | `bookings.duration_hours` | decimal, always whole hours this release | FR-019 |
| Schedule → Zona waktu | `Asia/Jakarta (WIB)` | `venues.timezone`, snapshotted as `bookings.venue_timezone` | zone belongs to the row, never the server | FR-019, NFR-003 |
| Booker → Nama | `Azka Willian Muhammad` | `bookings.booker_name` (snapshot of `users.name` at review) | editable at review, so snapshot on submit | FR-020 |
| Booker → WhatsApp | `0812-1122-3344` + hint | `bookings.booker_phone` | 9–20 digits, no spaces or hyphens (server side) | FR-021 |
| Booker → Catatan | textarea | `bookings.note` | optional, ≤500 chars | FR-022 |
| Ketentuan pembatalan | contains `12 jam` | `venues.cancellation_window_hours` | copy generated from settings, never hardcoded | FR-023 |
| Cost → unit | `Rp 180.000 × 2 jam` | `bookings.unit_price`, `bookings.duration_hours` | unit price is the snapshot on the booking, not the live catalogue value | FR-024, NFR-002 |
| Cost → subtotal | `Rp 360.000` | `bookings.subtotal_amount` | server computed | FR-024, FR-026 |
| Cost → pajak | `Pajak 11.00%` → `Rp 39.600` | `bookings.tax_percent`, `bookings.tax_amount` | tax percent is a snapshot too | FR-024, NFR-002 |
| Cost → total | `Rp 399.600` | `bookings.total_amount` | half-up round to 2dp, applied once after tax | FR-024 |
| Lock note | copy | — | states the snapshot rule aloud | FR-025 |
| Primary | `Lanjut ke pembayaran` | writes a `bookings` row | payment stays `pending`, no capture this release | FR-027 |
| Back | `Ganti jadwal` | link | — | FR-027 |
| Slot-taken banner | copy | client conflict UI on `E-BOOKING-SLOT-TAKEN` (S3) | preserves typed values | FR-028, FR-029 |
| Invalid banner + field error | `Nomor WhatsApp minimal 9 angka…` | validation error from Zod schema | field rules live in the schema, not in a service branch | FR-030 |
| Window advisory | contains `12 jam` | derived from `bookings.starts_at` − `now()` against `venues.cancellation_window_hours` | still submittable | FR-031 |

### 1.3 Cross-screen

| Screen element | Rendered value | Implied field | Implied rule | Source |
|---|---|---|---|---|
| Money format | `"180000.00"` → `Rp 180.000` | any `*_amount`, `price_per_hour` | decimal string in / whole rupiah with `.` grouping out | FR-032 |
| Header brand + link | `Lapangin`, `Cari lapangan` | static copy | — | FR-033 |
| Header placeholders | `Booking saya`, avatar `AW` | static markup only | no destination, PRD §7 | FR-034 |
| Footer stage line | text | build/env constant | — | FR-035 |

Nothing on any screen renders a value no field can supply.

---

## 2. Entity map

```
                       ┌─────────┐
                       │ venues  │  1 this release, N in the model
                       └────┬────┘
                            │ 1..N
                       ┌────▼────┐        N..N        ┌───────────┐
                       │ courts  │────────────────────│ amenities │
                       └────┬────┘   court_amenities  └───────────┘
                            │ 1..N
                       ┌────▼────┐
                       │bookings │─── N..1 ──── users
                       └─────────┘
```

| Entity | One-line purpose |
|---|---|
| `venues` | The physical location, its timezone, and the settings that govern every court under it |
| `courts` | A bookable resource inside a venue, its price, sport, surface, and current bookability |
| `amenities` | A shared label attached to zero or more courts, renaming reaches every court that carries it |
| `court_amenities` | Join between the two |
| `users` | The account behind a booker; identity for `bookings` this release, home for a future "Booking saya" screen |
| `bookings` | The exclusive claim of a court for a `[starts_at, ends_at)` window, with the price snapshotted at creation |

---

## 3. Relationships

| Child → parent | Cardinality | `ON DELETE` | `ON UPDATE` | Why |
|---|---|---|---|---|
| `courts.venue_id` → `venues.id` | N..1 | `RESTRICT` | `RESTRICT` | Deleting a venue with courts is always a mistake; UUID keys never rename |
| `court_amenities.court_id` → `courts.id` | N..1 | `CASCADE` | `RESTRICT` | Join rows are metadata about the court; removing the court removes the associations |
| `court_amenities.amenity_id` → `amenities.id` | N..1 | `RESTRICT` | `RESTRICT` | Removing an amenity still referenced by a court would silently drop the meaning |
| `bookings.court_id` → `courts.id` | N..1 | `RESTRICT` | `RESTRICT` | Financial history never cascades; a retired court is soft-marked, not deleted |
| `bookings.user_id` → `users.id` | N..1 | `RESTRICT` | `RESTRICT` | Same reason; a departing user is soft-marked |

> A `CASCADE` on any edge that touches `bookings` would let a mis-clicked "delete court" wipe last month's revenue. The one edge that cascades is the pure join, which carries no history.

---

## 4. Enum types

| Type | Values | Representation | Why not the other option |
|---|---|---|---|
| `sport_kind` | `futsal`, `badminton`, `basket` | Native `CREATE TYPE ... AS ENUM` | Values change rarely and only by product decision; a lookup table adds a join to every court query for no rename benefit |
| `court_status` | `available`, `maintenance` | Native enum | Same argument; the set is closed |
| `booking_status` | `pending`, `confirmed`, `cancelled` | Native enum | Same |
| `payment_status` | `pending`, `paid`, `refunded` | Native enum | Same; kept for the post-release payment feature so no data has to move |

> Amenities are **not** an enum. The set grows by product decision and the label is what appears on screen; renaming `Lampu malam` → `Lampu LED` must reach every court in one row change. That is a lookup table (§5.3), not `ALTER TYPE`.

> Adding a value to a native enum in PostgreSQL is `ALTER TYPE sport_kind ADD VALUE 'padel'` — non-locking since PG 12. That is the upgrade path when a fourth sport lands.

---

## 5. Tables

### 5.1 `venues`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | `UUID` | no | `gen_random_uuid()` | PK |
| `slug` | `TEXT` | no | — | UNIQUE |
| `name` | `TEXT` | no | — | |
| `address` | `TEXT` | no | — | |
| `timezone` | `TEXT` | no | — | IANA id, see §8 |
| `currency` | `CHAR(3)` | no | `'IDR'` | ISO 4217 |
| `tax_percent` | `NUMERIC(5,2)` | no | — | e.g. `11.00` |
| `cancellation_window_hours` | `SMALLINT` | no | — | |
| `booking_horizon_days` | `SMALLINT` | no | — | |
| `minimum_duration_minutes` | `SMALLINT` | no | — | |
| `opening_time` | `TIME(0)` | no | — | local |
| `closing_time` | `TIME(0)` | no | — | local |
| `created_at` | `TIMESTAMPTZ` | no | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | no | `now()` | |

**Indexes** — `UNIQUE (slug)` reads `GET /venues/:slug`.

**Checks**
```sql
CHECK (opening_time < closing_time)
CHECK (tax_percent >= 0 AND tax_percent < 100)
CHECK (cancellation_window_hours BETWEEN 0 AND 168)
CHECK (booking_horizon_days BETWEEN 1 AND 365)
CHECK (minimum_duration_minutes BETWEEN 15 AND 720)
```

> Opening hours per weekday are not modelled this release — the venue is open every day 06:00–23:00 (BRD §5). When that changes, a `venue_hours` child table replaces these two columns.

### 5.2 `courts`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | `UUID` | no | `gen_random_uuid()` | PK |
| `venue_id` | `UUID` | no | — | FK → `venues.id` |
| `name` | `TEXT` | no | — | |
| `sport` | `sport_kind` | no | — | |
| `surface` | `TEXT` | no | — | |
| `floor` | `TEXT` | no | — | |
| `photo_label` | `TEXT` | no | — | placeholder for the photo asset until images ship |
| `price_per_hour` | `NUMERIC(12,2)` | no | — | see §8 |
| `status` | `court_status` | no | `'available'` | |
| `maintenance_reason` | `TEXT` | yes | — | only meaningful when `status = 'maintenance'` |
| `maintenance_until` | `DATE` | yes | — | same |
| `display_order` | `SMALLINT` | no | `0` | catalogue ordering |
| `created_at` | `TIMESTAMPTZ` | no | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | no | `now()` | |

**Indexes**
- `idx_courts_venue_display` — `btree (venue_id, display_order)` — reads the court list on `courts.html`
- `idx_courts_venue_sport` — `btree (venue_id, sport)` — reads the sport-chip filter in FR-013
- `UNIQUE (venue_id, name)` — a court name is unique within a venue

**Checks**
```sql
CHECK (price_per_hour > 0)
CHECK (
  (status = 'maintenance' AND maintenance_reason IS NOT NULL)
  OR (status <> 'maintenance' AND maintenance_reason IS NULL AND maintenance_until IS NULL)
)
```

### 5.3 `amenities`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | `UUID` | no | `gen_random_uuid()` | PK |
| `label` | `TEXT` | no | — | UNIQUE |
| `display_order` | `SMALLINT` | no | `0` | chip ordering on a card |

**Seed:** `Lampu malam`, `Ruang ganti`, `Tribun`, `Parkir luas`, `Sewa raket`, `Papan skor elektronik`.

### 5.4 `court_amenities`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `court_id` | `UUID` | no | — | FK → `courts.id`, part of PK |
| `amenity_id` | `UUID` | no | — | FK → `amenities.id`, part of PK |

**Indexes**
- `PRIMARY KEY (court_id, amenity_id)` — reads amenity chips for a court
- `idx_court_amenities_amenity` — `btree (amenity_id)` — reads "which courts have this amenity", cheap now, load-bearing later

### 5.5 `users`

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | `UUID` | no | `gen_random_uuid()` | PK |
| `name` | `TEXT` | no | — | |
| `email` | `CITEXT` | no | — | UNIQUE (case-insensitive) |
| `phone` | `TEXT` | yes | — | digits only, 9–20 chars |
| `created_at` | `TIMESTAMPTZ` | no | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | no | `now()` | |

> Sign-in and registration are out of scope this release (PRD §7). `users` exists so the review screen can prefill Nama and so `bookings.user_id` has a target. Auth is added later; the column will already be there.

**Checks**
```sql
CHECK (phone IS NULL OR phone ~ '^[0-9]{9,20}$')
```

> The mockup displays `0812-1122-3344` for readability; the stored value is `081211223344`. Formatting is a client concern.

### 5.6 `bookings`

The centre of gravity. Every column below is either drawn on screen (§1) or the direct expression of a written rule (§7).

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | `UUID` | no | `gen_random_uuid()` | PK |
| `court_id` | `UUID` | no | — | FK → `courts.id` |
| `user_id` | `UUID` | no | — | FK → `users.id` |
| `booking_date` | `DATE` | no | — | venue-local |
| `start_time` | `TIME(0)` | no | — | venue-local |
| `end_time` | `TIME(0)` | no | — | venue-local |
| `duration_hours` | `NUMERIC(4,2)` | no | — | e.g. `2.00` |
| `starts_at` | `TIMESTAMPTZ` | no | — | computed by the service from date + start_time + venue_timezone |
| `ends_at` | `TIMESTAMPTZ` | no | — | same, half-open |
| `period` | `TSTZRANGE` | no | *generated* | see §6 |
| `venue_timezone` | `TEXT` | no | — | IANA id snapshot |
| `unit_price` | `NUMERIC(12,2)` | no | — | snapshot of `courts.price_per_hour` at write |
| `subtotal_amount` | `NUMERIC(14,2)` | no | — | `unit_price × duration_hours` |
| `tax_percent` | `NUMERIC(5,2)` | no | — | snapshot of `venues.tax_percent` at write |
| `tax_amount` | `NUMERIC(14,2)` | no | — | `round(subtotal_amount × tax_percent / 100, 2)` half-up |
| `total_amount` | `NUMERIC(14,2)` | no | — | `subtotal_amount + tax_amount` |
| `currency` | `CHAR(3)` | no | — | snapshot of `venues.currency` |
| `status` | `booking_status` | no | `'pending'` | |
| `payment_status` | `payment_status` | no | `'pending'` | payment out of scope, see §7 |
| `booker_name` | `TEXT` | no | — | snapshot of `users.name` at the moment of review |
| `booker_phone` | `TEXT` | no | — | snapshot of `users.phone`, digits only |
| `note` | `TEXT` | yes | — | FR-022 |
| `created_at` | `TIMESTAMPTZ` | no | `now()` | |
| `updated_at` | `TIMESTAMPTZ` | no | `now()` | |
| `cancelled_at` | `TIMESTAMPTZ` | yes | — | set when `status` moves to `cancelled` |

**Indexes**
- `idx_bookings_court_starts` — `btree (court_id, starts_at)` — reads the availability strip on `courts.html`
- `idx_bookings_user_starts` — `btree (user_id, starts_at DESC)` — reads a future "Booking saya"; created now because the write cost is cheap and the migration later is not
- `idx_bookings_period_gist` — `gist (court_id, period)` — the same index that backs the exclusion constraint (§6)

**Checks**
```sql
CHECK (start_time < end_time)
CHECK (starts_at < ends_at)
CHECK (duration_hours = EXTRACT(EPOCH FROM (ends_at - starts_at)) / 3600.0)
CHECK (duration_hours > 0)
CHECK (unit_price > 0)
CHECK (subtotal_amount = round(unit_price * duration_hours, 2))
CHECK (tax_amount     = round(subtotal_amount * tax_percent / 100.0, 2))
CHECK (total_amount   = subtotal_amount + tax_amount)
CHECK (booker_phone ~ '^[0-9]{9,20}$')
CHECK (length(coalesce(note, '')) <= 500)
CHECK ( (status = 'cancelled') = (cancelled_at IS NOT NULL) )
```

> `duration_hours` and the money lines look redundant against `starts_at`/`ends_at`. They are not: they are the values the review screen quotes, and a `CHECK` ties them to what the schedule actually is. If one drifts the other refuses.

---

## 6. Constraints that carry a guarantee

**BO-1 / NFR-001 — a court can never be double booked.** Expressed once, in the datastore, so no application code can miss it.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD COLUMN period tstzrange
  GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (court_id WITH =, period WITH &&)
  WHERE (status IN ('pending', 'confirmed'));
```

> Half-open `'[)'` is the choice everyone gets wrong once: a booking that ends at 12:00 leaves 12:00 free for the next one. Writing the boundary into the range type means no service code has to remember it.

> The `WHERE (status IN ('pending','confirmed'))` clause is why `cancelled` rows survive next to a new booking for the same court and hour — the guarantee is only about *live* claims.

**NFR-002 — price immutability.** Enforced by snapshot columns (`unit_price`, `tax_percent`, `currency`) on `bookings` and by never reading `courts.price_per_hour` for a row that already exists. There is no SQL constraint for this; §7 states the rule, and the check-suite regression pins it (S4).

**NFR-005 — non-enumerability.** Handled at the API layer (S3 error registry): another user's booking returns the same shape as a nonexistent id.

---

## 7. Written rules that produced columns

| Rule | Source | Column(s) |
|---|---|---|
| Agreed price never moves | BRD §7, PRD §6, NFR-002 | `bookings.unit_price`, `bookings.tax_percent`, `bookings.currency` — snapshotted at write |
| Zone belongs to the row | BRD §5, NFR-003 | `bookings.venue_timezone` — set at write from `venues.timezone` |
| Payment is not captured this release | BRD §4 | `bookings.payment_status` exists, stays `pending`; the column is here so adding capture later moves no data |
| Booker is not necessarily the account holder | BRD §6.2, FR-020, FR-021 | `bookings.booker_name`, `bookings.booker_phone` — snapshotted separately from `users.*` |
| Correlation id on every response | NFR-007, FR-017 | Not a column on any domain table; generated per request as a ULID and logged. Named here so §1 has a home |
| Cancellation timestamp is derivable but recorded | product decision | `bookings.cancelled_at` — reporting reads it without recomputing |

---

## 8. Data types

Applied everywhere. Each rule is stated once here and never restated in a per-column note.

| Kind | Rule |
|---|---|
| Money | `NUMERIC(12,2)` for a unit price, `NUMERIC(14,2)` for a total; **decimal string on the wire** (`"399600.00"`); never a `float`, never a JSON number |
| Currency | ISO 4217, `CHAR(3)`, stored on the parent (`venues.currency`) and snapshotted onto every transactional row (`bookings.currency`) |
| Rounding | Half up, two places, applied once, after tax |
| Percent | `NUMERIC(5,2)` (`11.00`), never `0.11` |
| Local date | `DATE` (venue-local) |
| Local time | `TIME(0)` (venue-local), `HH:mm` on the wire |
| Instant | `TIMESTAMPTZ`, ISO 8601 UTC on the wire |
| Range | `TSTZRANGE` with `'[)'` bounds |
| Timezone | IANA id in a `TEXT` column on the tenant row, never a server constant or a fixed offset |
| Identifiers | `UUID` v4 via `gen_random_uuid()` (from `pgcrypto`); URL-safe case-insensitive slug for `venues.slug` |
| Timestamps | `created_at`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` on every table; `updated_at` maintained by a trigger, not the application |

**Extensions required:** `pgcrypto` (`gen_random_uuid`), `btree_gist` (mixed-type gist index for the overlap constraint), `citext` (case-insensitive `users.email`).

---

## 9. Not modelled

Every omission below was considered and left out for a reason. Adding one later is a schema change, not a redesign.

| Omitted | Reason |
|---|---|
| `payments` table | Payment capture is out of scope this release (BRD §4). `bookings.payment_status` already carries the eventual state |
| `venue_hours` per-weekday table | Opening hours are 06:00–23:00 every day (BRD §5). When a venue keeps different Sunday hours, this replaces `venues.opening_time` / `closing_time` |
| `venue_holidays` / closures | No screen currently renders a "closed today" reason distinct from `courts.status = maintenance` |
| `court_images` | The mockup renders `photo_label`, not a photo. When the CDN lands, this table joins `courts` |
| `booking_events` audit log | Product does not currently ask "who changed what and when" of a booking |
| Ratings, memberships, credits | PRD §7, BRD §4 — no screen renders them |
| Multi-venue browse (`venue_groups`) | One venue this release (BRD §4). The `venue_id` column already carries the model forward |
| Reschedule-in-place | PRD §7 — cancel and rebook |
| `roles`, `permissions` | Sign-in is out of scope; when it lands, the auth library's own tables cover it, not a bespoke design |
| Sport as its own table | §4 — the set is small and closed; the rename argument that forces `amenities` into a table does not apply |

---

## 10. Seed dataset

The seed must populate every state in the mockup, so a reviewer can open the app and see the exact figures on `courts.html?state=filled` and `booking-review.html`.

| Table | Rows | Notes |
|---|---|---|
| `venues` | 1 | `slug='gor-kemang'`, `name='GOR Kemang'`, `timezone='Asia/Jakarta'`, `currency='IDR'`, `tax_percent=11.00`, `cancellation_window_hours=12`, `booking_horizon_days=30`, `minimum_duration_minutes=60`, `opening_time='06:00'`, `closing_time='23:00'` |
| `amenities` | 6 | The list in §5.3 |
| `courts` | 3 | Matches `mockup/data.js` — Futsal A (`180000.00`), Badminton 3 (`65000.00`), Basket Indoor (`250000.00`, `status='maintenance'`, `maintenance_reason='Perawatan lapangan'`, `maintenance_until='2026-09-30'`) |
| `court_amenities` | 10 | Futsal A → 4, Badminton 3 → 3, Basket Indoor → 3, matching `data.js` |
| `users` | 1 | `name='Azka Willian Muhammad'`, `email='azka@example.com'`, `phone='081211223344'` |
| `bookings` | 4 | For `booking_date='2026-09-27'` on Futsal A at 08:00, 09:00 and 19:00; on Badminton 3 at 06:00, 19:00 and 20:00 — producing the exact `taken` chips in `data.js` |

> The `closed` slot at Badminton 3 11:00 is not a seeded booking. It appears because 11:00 is inside the opening window in the seed but marked `closed` by the availability query when the venue is otherwise configured — kept as a placeholder for a future per-weekday-hours model (§9). The seed's `closing_time=23:00` covers 11:00, so the mockup screenshot's `closed` state at 11:00 is a mockup-only illustration until `venue_hours` lands.

**Figure check against the mockup.** With the seed above:

| Line | Computed | Mockup |
|---|---|---|
| Unit line | `180000.00 × 2.00 = 360000.00` | `Rp 180.000 × 2 jam` ✓ |
| Tax line | `round(360000.00 × 11.00 / 100, 2) = 39600.00` | `Rp 39.600` ✓ |
| Total | `360000.00 + 39600.00 = 399600.00` | `Rp 399.600` ✓ |

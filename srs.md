# Lapangin — Software Requirements

**Owner:** Ardial · **Status:** draft · **Version:** v1.0
**Product:** [`prd.md`](./prd.md) · **Mockup:** [`mockup/`](./mockup/)

Every functional requirement below is realised by something drawn in the mockup,
and the `Screen` column names where. Non-functional requirements have no screen
by nature and are listed separately in §3.

Configuration values referenced throughout — tax 11.00%, cancellation window 12
hours, booking horizon 30 days, minimum duration 60 minutes, timezone
`Asia/Jakarta`, currency IDR — are settings, never literals in code or copy.

---

## 1. Court list — `courts.html`

| ID | Requirement | Acceptance | Screen |
|---|---|---|---|
| FR-001 | The venue header shows name, address, opening hours and the timezone label | Header reads `GOR Kemang`, `Jl. Kemang Raya No. 18, Jakarta Selatan · Senin sampai Minggu, 06:00 sampai 23:00 · WIB` | filled |
| FR-002 | Each court card shows its name, surface, floor and a photo panel | `Lapangan Futsal A` with `Rumput sintetis · Lantai 1`, and a labelled image area | filled |
| FR-003 | Each court lists its amenities as discrete labels | Futsal A shows four: `Lampu malam`, `Ruang ganti`, `Tribun`, `Parkir luas` | filled |
| FR-004 | Price is shown per hour, tax-exclusive, naming the tax rate | `Rp 180.000` with `per jam, belum termasuk pajak 11.00%` | filled |
| FR-005 | Each court shows a status line reflecting whether it is bookable today | `Bisa dibooking hari ini`, or `Perawatan sampai 30 September` | filled |
| FR-006 | A court not available for booking is still listed, with the reason and a disabled action | Basket Indoor shows `Jadwal ditutup sementara karena perawatan lapangan.`, no strip, and a disabled `Tidak tersedia` button | filled |
| FR-007 | A bookable court shows an hourly availability strip for the chosen date | Futsal A renders eight hour chips from `06:00` | filled |
| FR-008 | Each slot carries one of three states, each visually distinct and labelled | `free` → `Tersedia`; `taken` → `Sudah dibooking`; `closed` → `Di luar jam operasional` | filled |
| FR-009 | `closed` means outside venue opening hours and is distinct from `taken` | Badminton 3 shows `11:00` as `closed` while `06:00` is `taken` | filled |
| FR-010 | The list is filtered by a play date | Date control, defaulting to the chosen day, at most 30 days ahead | filled |
| FR-011 | The list is filtered by a start time in half-hour steps | Time control with `step=1800`, value `10:00` | filled |
| FR-012 | The list is filtered by a duration of whole hours | Select offering `1 jam`, `2 jam`, `3 jam`, defaulting to 2 | filled |
| FR-013 | The list is filtered by sport, with an all-sports default | Four chips — `Semua`, `Futsal`, `Badminton`, `Basket` — exactly one pressed at a time | filled |
| FR-014 | A bookable court offers an action leading to review | `Pilih jadwal` navigates to the review screen for that court | filled |
| FR-015 | While results are pending, placeholder cards are shown | Three skeleton cards render in place of the list | loading |
| FR-016 | When no court matches, the empty state names the date and interval tried and offers a reset | `Tidak ada lapangan yang cocok` plus `Sabtu, 27 September 2026 jam 10:00 selama 2 jam` and `Atur ulang filter` | empty |
| FR-017 | When the request fails, the failure state shows a correlation identifier and a retry | `Jadwal gagal dimuat` with `Kode permintaan: req_01J9Z4K2M7Q` and `Muat ulang` | error |

## 2. Booking review — `booking-review.html`

| ID | Requirement | Acceptance | Screen |
|---|---|---|---|
| FR-018 | The screen offers a route back to the venue it came from, and states its purpose | Breadcrumb `GOR Kemang · Review booking`; heading `Review booking` with `Periksa jadwal dan biayanya sebelum lanjut ke pembayaran.` | normal |
| FR-019 | The schedule card shows court, location, date, time range, duration and timezone | `Lapangan Futsal A`, `GOR Kemang · Jl. Kemang Raya No. 18…`, `Sabtu, 27 September 2026`, `10:00 sampai 12:00`, `2 jam`, `Asia/Jakarta (WIB)` | normal |
| FR-020 | The booker supplies a name | Text field, prefilled from the account, editable | normal |
| FR-021 | The booker supplies a WhatsApp number, with its purpose stated | Tel field with hint `Dipakai untuk konfirmasi dan kode masuk lapangan.` | normal |
| FR-022 | The booker may leave a note for the venue | Optional textarea | normal |
| FR-023 | Cancellation terms are shown, generated from configuration | Sentence contains `12 jam`, read from settings rather than typed | normal |
| FR-024 | The cost breakdown shows the unit line, the tax line and the total | `Rp 180.000 × 2 jam` → `Rp 360.000`; `Pajak 11.00%` → `Rp 39.600`; `Total` → `Rp 399.600` | normal |
| FR-025 | The screen states that the agreed price will not change afterwards | `Harga dikunci saat booking dibuat. Perubahan tarif lapangan setelah ini tidak mengubah tagihanmu.` | normal |
| FR-026 | Every amount is computed by the server; the client performs no arithmetic and sends no amount | All figures arrive computed and are only formatted for display | normal |
| FR-027 | The screen offers a primary commit action and a way back to change the schedule | `Lanjut ke pembayaran` and `Ganti jadwal` | normal |
| FR-028 | When the slot is taken before submission, a blocking banner explains it and the commit action is disabled and relabelled | Danger banner `Jadwal ini baru saja diambil orang lain`; button becomes a disabled `Pilih jam lain dulu` | taken |
| FR-029 | A conflict preserves every value the user has already typed | Name, phone and note retain their contents after the conflict renders | taken |
| FR-030 | Invalid input is reported against the offending field and summarised above the form | Phone row marked invalid with `Nomor WhatsApp minimal 9 angka, tanpa spasi atau tanda hubung.`, plus `Ada isian yang perlu diperbaiki` | invalid |
| FR-031 | A booking starting inside the cancellation window shows an advisory, and remains submittable | Warning banner `Booking kurang dari 12 jam sebelum main`; the commit action stays enabled | window |

## 3. Cross-screen

| ID | Requirement | Acceptance | Screen |
|---|---|---|---|
| FR-032 | Monetary values render as whole rupiah with thousands separators | `"180000.00"` renders as `Rp 180.000` | both |
| FR-033 | A persistent header carries the brand and primary navigation | Brand `Lapangin`, link `Cari lapangan`, plus the placeholders in FR-034 | both |
| FR-034 | `Booking saya` and the account avatar render as navigation placeholders with no destination this release | Both present in the header, neither leading to a screen — see `prd.md` §7 | both |
| FR-035 | A footer states the current build stage | Footer line present on both screens | both |

## 4. Non-functional

No screen realises these; they constrain how the functional set is built.

| ID | Requirement | Acceptance |
|---|---|---|
| NFR-001 | **Exclusivity under concurrency.** Two simultaneous requests for the same court and overlapping interval must never both succeed | Under parallel load, exactly one succeeds and the other is refused with a specific conflict reason. Guaranteed by the datastore, not by an application check |
| NFR-002 | **Price immutability.** Changing a court's rate must not alter any existing booking | After a rate change, a prior booking's unit price and total are unchanged |
| NFR-003 | **Timezone correctness.** All local date and time reasoning uses the venue's stored IANA zone, never the server's | Window and horizon comparisons give identical results regardless of server locale, verified across `Asia/Jakarta`, `Asia/Makassar`, `Asia/Jayapura` |
| NFR-004 | **Monetary exactness.** No amount is ever held or transported as a binary float | Amounts are exact decimals in storage and decimal strings on the wire |
| NFR-005 | **Non-enumerability.** A record belonging to another user is indistinguishable from one that does not exist | Requesting another user's booking yields the same response as a nonexistent id, leaking no reference or name |
| NFR-006 | **No internal leakage.** No stack trace, driver message, SQL fragment or internal identifier reaches a client response or a client-visible log | Failure responses carry only a stable code, a safe message, and a correlation id |
| NFR-007 | **Correlation.** Every response carries a request identifier that also appears in server logs | The identifier shown in the failure state (FR-017) is locatable in the logs |
| NFR-008 | **Availability latency.** Availability for one court on one date returns within 300 ms server time at p95 | Measured under seeded production-scale data |
| NFR-009 | **Perceived responsiveness.** Placeholder content appears within 100 ms of a pending request | Below this the loading state flashes and reads as a defect |
| NFR-010 | **Payload budget.** Initial JavaScript is at most 180 KB gzipped | The court list is the entry point and is usually opened on mobile data |
| NFR-011 | **Accessibility.** Every control is labelled; toggle state is exposed; unavailable slots are not focusable but are described; alerts are announced; contrast is at least 4.5:1; focus is always visible | Automated accessibility checks report zero violations on both screens in all states |
| NFR-012 | **Language.** All user-facing text, including failure copy, is Indonesian | No English string reaches the interface |
| NFR-013 | **Configurability.** Tax rate, cancellation window, booking horizon, minimum duration and opening hours are changeable without a deploy | Changing a value updates both behaviour and the copy that quotes it |
| NFR-014 | **Browser support.** Current Chromium, Firefox and Safari, mobile-first from 360 px | Both screens are usable at 360 px with no horizontal scroll |

## 5. Mockup scaffolding

One element of the mockup is **not** a product feature and carries no
requirement: the `Status layar:` switcher on both screens. It exists so a
reviewer can click through every designed state before any of them is
implemented, and it is replaced by real query and mutation state during the
refactor. It ships no further than the mockup.

## 6. Out of scope

Listed so the omissions are decisions rather than oversights, and so no
requirement is written against them.

| Excluded | Note |
|---|---|
| Payment capture and refunds | A payment status exists on a booking but stays pending. See `brd.md` §4 |
| Sign-in, registration, account management | The review screen assumes a known user |
| A "my bookings" screen | Header placeholder only, FR-034 |
| Rescheduling in place | Cancel and rebook |
| Multiple venues in the interface | The model permits it; the release ships one venue |
| Ratings, memberships, credits | No screen renders them |

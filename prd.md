# Lapangin — Product Requirements

**Owner:** Ardial · **Status:** draft · **Version:** v1.0
**Business case:** [`brd.md`](./brd.md) · **Requirements:** [`srs.md`](./srs.md)

Two screens. A visitor finds a free court, reviews what it costs, and books it.

---

## 1. Users

| User | Context | Needs |
|---|---|---|
| **Pemain** — the person booking | On a phone, often deciding with friends in a group chat, minutes before committing | To see what is actually free tonight, what it costs in total, and whether it can be cancelled |
| **Petugas** — front desk staff | At the venue, on a laptop, between arrivals | A schedule that is correct without being maintained by hand |
| **Pengelola** — venue manager | Weekly, on a laptop | To change a price or close a court for maintenance without asking an engineer |

The customer is the user this release is designed around. Staff and manager needs
are met by the same data being correct.

## 2. Jobs to be done

1. *When I am deciding with friends where to play tonight, I want to see which
   courts are free at the hour we want, so we can settle it in the group chat
   instead of waiting on a reply.*
2. *When I am about to commit, I want to see the total including tax and the
   cancellation terms, so there is no surprise at the gate.*
3. *When someone takes the slot while I am filling the form, I want to be told
   immediately and keep what I typed, rather than losing the lot.*

## 3. Features

| # | Feature | Priority | Screen |
|---|---|:--:|---|
| F-1 | Venue header — name, address, opening hours, timezone | P0 | Court list |
| F-2 | Court catalogue — name, sport, surface, floor, amenities, photo | P0 | Court list |
| F-3 | Price per hour, shown tax-exclusive with the tax rate named | P0 | Court list |
| F-4 | Availability strip — free, taken and closed hours for a chosen date | P0 | Court list |
| F-5 | Filters — date, start time, duration, sport | P0 | Court list |
| F-6 | Maintenance state — court listed but not bookable, with a reason | P1 | Court list |
| F-7 | Booking review — schedule, location, duration, timezone | P0 | Review |
| F-8 | Cost breakdown — unit price × hours, tax, total, server computed | P0 | Review |
| F-9 | Booker details — name, WhatsApp number, note to the venue | P0 | Review |
| F-10 | Cancellation terms, generated from configuration | P0 | Review |
| F-11 | Conflict handling — slot taken while reviewing | P0 | Review |
| F-12 | Field validation with inline messages | P0 | Review |
| F-13 | Short-notice advisory — booking inside the cancellation window | P1 | Review |
| F-14 | Loading, empty and failure states on every screen | P0 | Both |

## 4. Flows

**Finding a court.** Open the venue page → pick date, start time and duration →
optionally filter by sport → scan the availability strips → tap *Pilih jadwal* on
a court that is free.

**Booking it.** Review the schedule and the cost → fill name, WhatsApp number and
an optional note → read the cancellation terms → *Lanjut ke pembayaran*.

**When the slot goes.** Somebody else books the same hour first → a blocking
banner says so → **every field the user typed is preserved** → the action becomes
*Pilih jam lain dulu* → the user returns to the list with their date and interval
still selected.

That last flow is the one that decides whether this feels trustworthy. Losing a
filled form to a race is the moment a user gives up and sends a WhatsApp message
instead.

## 5. Screens and states

Every state is designed, not left to implementation.

| Screen | States |
|---|---|
| **Court list** `courts.html` | filled · loading · empty · error |
| **Booking review** `booking-review.html` | normal · slot taken · invalid input · short-notice advisory |

Each is reachable in the mockup through `?state=`, and each has approved copy.

## 6. Rules the product commits to

| Rule | Why it is a product decision, not a technical one |
|---|---|
| **The client never sends an amount** | The price is the venue's, not the browser's. Every figure is computed server-side and the request carries none |
| **The agreed price never moves** | Raising a rate today leaves last week's booking at what was agreed |
| **A taken slot is refused for everyone, staff included** | An override is how a double booking gets back in |
| **Another person's booking is invisible, not forbidden** | "You may not see this" confirms it exists, which is enough to go looking |
| **Cancellation copy is generated from configuration** | A hardcoded "12 jam" becomes a lie the first time the policy changes |
| **A court under maintenance stays listed** | Hiding it generates the phone call the product exists to remove |

## 7. Explicitly not in this release

| Not building | Note |
|---|---|
| Payment capture | Collected on arrival. Nothing in the flow promises otherwise |
| "Booking saya" and the account menu | Rendered in the header as navigation placeholders only. No screen behind them |
| Sign-in and registration screens | Out of scope here; the review screen assumes a known user |
| Multi-venue browsing | One venue, selected by its slug |
| Rescheduling an existing booking | Cancel and rebook |

## 8. Success criteria

| | |
|---|---|
| F-4 | A visitor can tell, without contacting anyone, whether a court is free at a given hour |
| F-8 | The total on screen equals the amount charged, every time |
| F-11 | A conflict never loses typed input, and the strip refreshes to show the truth |
| F-14 | No state ships undesigned — every screen has approved copy for empty and failure |

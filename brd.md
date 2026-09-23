# Lapangin — Business Requirements

**Owner:** Ardial · **Approver:** (pending) · **Status:** draft · **Version:** v1.0
**Classification:** internal

---

## 1. The problem

GOR Kemang runs three bookable courts and takes every booking by WhatsApp. One
member of staff holds the schedule in a notebook and answers messages between
06:00 and 23:00.

Three things go wrong, repeatedly.

| Problem | What it costs today |
|---|---|
| Two customers are promised the same court and hour | A refund, an argument at the gate, and a customer who does not come back |
| Price is quoted from memory | Quotes disagree between staff, and a discount given once is expected forever |
| "Is 8pm free on Saturday?" answered by hand | Roughly 40 messages a day that a screen could answer without anyone reading them |

The venue does not need a payment system, a membership scheme or a mobile app.
It needs the schedule to be true and the price to be the price.

## 2. Objectives

| # | Objective | Measure | Target |
|---|---|---|---|
| BO-1 | A court can never be double booked | Double-booking incidents per month | **0**, enforced by the system, not by staff care |
| BO-2 | The price shown is the price charged | Billing disputes per month | 0 |
| BO-3 | Availability is self-service | Share of bookings made without a staff message | 70% within three months of launch |
| BO-4 | Staff time returns to the venue | Minutes per day spent answering schedule questions | Under 30, from roughly 150 |

BO-1 is the one that justifies the project. If the system cannot guarantee it,
the venue is no better off than the notebook, and staff will keep the notebook as
a safety net — at which point there are two schedules and neither is true.

## 3. Stakeholders

| Role | Who | Interest | Signs off |
|---|---|---|---|
| Venue owner | GOR Kemang management | Fewer disputes, more bookings per court-hour | Scope and launch |
| Front desk staff | 2 people, shift-based | A schedule they can trust at the gate | Daily workflow |
| Customer | Recreational players, Jakarta Selatan | Knowing a court is actually theirs | — |
| Engineering | Internal | A correct system that is cheap to change | Technical approach |

## 4. Scope

**In**

- Browsing courts at one venue, with real availability for a chosen date and interval
- Reviewing a booking — schedule, cost breakdown, cancellation terms — before committing
- Creating a booking that the system guarantees is exclusive
- Capturing the contact details of the person who will actually turn up

**Out, this release**

| Excluded | Reason |
|---|---|
| Online payment | The venue collects on arrival today and is content to continue. A `paymentStatus` field exists so adding it later moves no data |
| Multiple venues | One venue exists. The data model allows more; the interface ships single-venue |
| Memberships, credits, loyalty | No evidence anyone has asked for them |
| Ratings and reviews | Nothing is decided by them at a single venue |
| Native mobile app | The web page is the product |
| Staff scheduling and payroll | A different system's problem |

## 5. Constraints

| Constraint | Detail |
|---|---|
| Currency | Indonesian rupiah, exponent 0. Amounts are whole rupiah |
| Tax | 11% VAT, shown separately from the subtotal, configurable without a deploy |
| Timezone | Venue operates on `Asia/Jakarta`. Indonesia spans three zones, so the zone is data rather than an assumption |
| Language | Indonesian throughout, including error copy |
| Opening hours | 06:00 to 23:00, seven days. Hours are configuration, not text in the page |
| Team | Two engineers, one backend and one frontend, working in parallel |

## 6. Assumptions

1. Customers booking a court have a WhatsApp number and will give it.
2. The person who books is often **not** the person who arrives, so contact
   details belong to the booking rather than to the account.
3. Cancellations are rare enough that a fixed free-cancellation window is fairer
   and simpler than a sliding refund scale.
4. A court under maintenance should still be visible, so customers stop asking
   when it reopens.

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Double booking survives into production | BO-1 fails and the venue reverts to the notebook | The guarantee is proven against the database under real concurrency before any booking endpoint is written |
| Price changes retroactively alter past bookings | BO-2 fails, customer trust is lost | The agreed price is copied onto the booking at creation and never read live afterwards |
| Cancellation window computed in the wrong timezone | Refunds granted or refused wrongly, quietly | The venue's own zone is stored and used for every comparison |
| Staff keep a parallel notebook | Two schedules, neither true | Availability must be fast and correct from launch day, not after a hardening phase |

## 8. Success

The release is successful when the database itself refuses a second booking for
the same court and hour, without a person or a service check being involved —
and staff stop keeping the notebook.

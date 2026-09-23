# Lapangin

Court booking for one sports venue in Jakarta. Built spec-first with
[pspt](https://github.com/meQlause/pspt): requirements and a static mockup go in,
the engineering specification set comes out, one stage per commit.

**Stack:** TypeScript · PostgreSQL · Express · Prisma · React + Vite

---

## Status

| Stage | Produces | State |
|---|---|:--:|
| Inputs | `brd.md` `prd.md` `srs.md` `mockup/` | ✓ |
| Gates | completeness · two-way consistency | ✓ |
| S2 | `docs/data-spec.md` | · |
| S3 | strict rules, error registry, architecture, stack | · |
| S4 | endpoint contracts, testing strategy | · |
| S5 | design tokens, screen specs | · |
| S6 | `docs/phases.md` | · |
| S7 | code and tests | · |

## The inputs

| | |
|---|---|
| `brd.md` | Why. Four objectives; zero double bookings is the one that justifies the project |
| `prd.md` | What. 14 features, three flows, two screens |
| `srs.md` | What must be true. 35 functional requirements, 14 non-functional |
| `mockup/` | Two screens in static HTML, CSS and vanilla JS, with all six states drawn |
| `screenshots/` | Each state rendered, for review without running anything |

Everything under `docs/` is derived from those. Nothing there is written by hand.

## Build log

Newest first. One entry per commit.

### Inputs and gates

The two screens carry 35 functional requirements between them. Writing the SRS
against the markup rather than from memory surfaced three elements no requirement
covered: the court card's photo panel, the review screen's heading, and the
`Status layar:` state switcher.

The first two became requirements. The third is mockup scaffolding — a real
rendered control that exists so a reviewer can click through every designed state
before any is implemented, and which ships no further than the mockup. Declaring
it as scaffolding is what lets the consistency gate pass honestly, instead of
inventing a requirement to cover a thing the product does not have.

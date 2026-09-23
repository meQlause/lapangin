# NFR-008 availability latency

Measured on 2026-09-24 using `pnpm --dir backend perf:availability`.

The benchmark resets only `localhost/lapangin_test`, applies the migrations, loads the reference seed, and expands it to 30 courts for one venue. It adds 10 active, non-overlapping bookings per synthetic court, for 273 active bookings total on the measured date. The 30-court volume follows the documented “few dozen per venue” bound in [`../BE/features/README.md`](../BE/features/README.md) §8.

The script starts the real Express app with PostgreSQL 16.14 and measures from the Node HTTP server's `request` event until the response `finish` event. This includes routing, database queries, and response serialization while excluding client/network time. It makes 20 warm-up requests and 200 sequential measured requests.

| Measurement     |   Result | Requirement |
| --------------- | -------: | ----------: |
| p50 server time |  7.50 ms |           — |
| p95 server time | 10.25 ms |    < 300 ms |

The measured host was Windows with an Intel Core i7-10750H CPU and 16 GB RAM; PostgreSQL ran locally in an Alpine Linux container. These results describe this development setup, not a production hardware guarantee.

# Office building management: server (TypeScript)

Node.js 20+ / Express 5 / PostgreSQL, written in TypeScript (strict mode, ES modules).
Implements the API contract for the three roles (`Employee`, `Manager`, `Admin`).

## Run

```bash
npm install
cp .env.example .env        # set DATABASE_URL, JWT_SECRET (32+ chars), SEED_ADMIN_PASSWORD
# Optional: put machine-specific overrides in .env.local; it takes precedence over .env.
npm run typecheck           # tsc --noEmit: run this first, before anything else
npm run migrate             # creates the schema (safe to re-run)
npm run seed                # admin user; in development also demo employees, rooms, bookings and inquiries
npm run dev                 # tsx watch, http://localhost:3000   (health check: GET /health)
```

Swagger UI is available at `http://localhost:3000/swagger/`.
In development, the API also accepts browser requests from `http://localhost` and
`http://127.0.0.1` on any port. In production, set `CORS_ORIGIN` to the exact
frontend origin (comma-separated for multiple origins).

For production: `npm run build` (compiles to `dist/`), then `npm run migrate:prod`,
`npm run seed:prod` and `npm start`.

Dev seed logins (password = `SEED_ADMIN_PASSWORD`): `admin@office.local`,
`manager@demo.local`, `employee@demo.local`, `employee2@demo.local`, `employee3@demo.local`.
Pretty logs in development: `npm run dev | npx pino-pretty`.

## Architecture (request flow)

```
routes  ->  middleware (auth, endpoint)  ->  controllers  ->  services  ->  repositories  ->  PostgreSQL
```

| Layer | Responsibility | Never does |
|---|---|---|
| `routes/` | One table of every endpoint and its role check | business logic |
| `middleware/` | JWT auth, role check, validation wrapper, central error handler | SQL |
| `controllers/` | Take validated input, call a service, choose the HTTP status | business rules |
| `services/` | Business rules, permissions by ownership/company, transactions, logging | HTTP, raw SQL |
| `repositories/` | All SQL (parameterised), mapping rows to camelCase objects | decisions |
| `validators/` | zod schemas; the request types are inferred from them | |
| `types/` | Domain types (`User`, `Room`, `Booking`...) and the Express augmentation | |

### How the typing works

- **One source of truth per request shape.** A zod schema is written once in `validators/`;
  `z.infer` turns it into the TypeScript type. There is no separate hand-written interface to
  drift out of sync with the validation.
- **`endpoint(schemas, handler)`** (in `middleware/endpoint.ts`) validates `params`, `query` and
  `body`, then calls the handler with `input` typed from those schemas, plus `ctx.user` typed as
  `User` (not `User | undefined`, because those routes sit behind `authenticate`).
  Invalid input never reaches a controller.
- **Rows from the database** are asserted to the domain type in the repository that wrote the
  column list. That assertion lives in one place per table; every layer above it is fully typed.

## Resource contention

- **Double booking:** the `bookings_no_overlap` exclusion constraint (`btree_gist`) makes
  overlapping active bookings for a room impossible at the database level. Of two simultaneous
  requests for the same slot, one succeeds and the other gets `409`. No check-then-insert race.
- **Booking vs. room deletion:** booking takes `FOR KEY SHARE` on the room row, deletion takes
  `FOR UPDATE` and re-checks upcoming bookings inside the same transaction.
- **Cancel / close:** state changes are single conditional `UPDATE ... WHERE status = ...`
  statements, so concurrent requests cannot both win (cancel is idempotent; closing a closed
  inquiry returns `409`).
- **Unique data:** emails and room/company names are protected by unique indexes; violations map
  to `409`.
- **Company creation:** `POST /api/companies` requires a `manager` object with `name`, `email`,
  and `password`. The manager is created with the company in one transaction and always receives
  the `Manager` role.
- **Migrations:** guarded by a Postgres advisory lock, so two instances can start together.

## Pagination

Every list endpoint accepts `?page=1&pageSize=20` (max 100) and returns
`{ items, total, page, pageSize }`. Ordering always ends with `id`, so pages are stable.
This includes `/rooms`, `/rooms/available`, `/rooms/:id/bookings`.

## Logging

`pino` (JSON). Each request gets an `X-Request-Id` (reused if the client sends one). `requestId`
and `userId` are attached to **every** log line via `AsyncLocalStorage`, including those written in
services. Passwords, tokens and the `Authorization` header are redacted. 4xx are logged as `warn`,
5xx as `error`; `/health` is not logged.

## Behaviour that differs from, or adds to, the earlier contract

- **Timestamps must include an offset** (`2026-10-20T09:00:00Z` or `+03:00`). On the client use
  `date.toISOString()`. The server rejects timestamps without one, to avoid timezone ambiguity.
- `GET /rooms/:id/bookings?date=YYYY-MM-DD` interprets the day in `APP_TIMEZONE`
  (default `Asia/Jerusalem`). Subjects and names of other people's bookings are hidden (`null`).
  "This week" on dashboards starts on Sunday in the same timezone.
- Managers can also book rooms and file inquiries (`Employee` and `Manager` roles); admins cannot.
- Bookings: must start in the future, at most 8 hours. Cancelling marks `status = 'Cancelled'`
  (history is kept); only the owner or an admin may cancel.
- Deleting a room is refused (`409`) if it has upcoming bookings; past bookings of that room are
  deleted with it.
- A manager cannot block or change the role of themselves. Cross-company access answers `404`.
- Blocking takes effect immediately: the user is loaded from the database on every request.
- Extra endpoint: `GET /rooms/:id`.
- Login rate limit: 10 failed attempts per 15 minutes per IP; 300 requests/minute overall.

## Sharing types with the React client

The client can re-declare only what it consumes, or you can copy `src/types/domain.ts` into it —
it imports nothing but `src/constants.ts`, so the two files travel together. A shared npm
workspace is the tidier option once the project grows.

## Not included (reasonable next steps)

Automated tests, ESLint config, refresh tokens/logout, email notifications, OpenAPI file.

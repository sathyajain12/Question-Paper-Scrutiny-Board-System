# QPSB Portal

Question Paper Scrutiny Board portal for SSSIHL — a React rewrite of the
original Google Apps Script web app.

Google Sheets remains the system of record and Google Drive remains the file
store; the app runs on Cloudflare Workers. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design and the
reasoning behind each choice.

## Stack

React 19 · TypeScript · Vite · React Router v7 · TanStack Query · TanStack
Table · React Hook Form + Zod · Tailwind v4 + shadcn/ui — served by a single
**Cloudflare Worker** running **Hono**, with **Workers KV** for caching and a
**Durable Object** per board to serialise writes to Sheets.

## Requirements

**Node 22.22.0 or newer** — react-router 8 requires it. Check with `node -v`;
anything older installs but is unsupported.

## Getting started

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars` (see [docs/ARCHITECTURE.md §6](docs/ARCHITECTURE.md)), drop
`logo.png` into `public/`, then:

```bash
npm run dev
```

## Layout

```
public/            static assets — logo.png, favicon (edge-cached, no Worker CPU)
src/
  client/          React SPA
    routes/        constitution (HoD) · file-checker · admin
    components/    shared UI; components/ui = shadcn primitives
    lib/           api client, query keys, formatting
  server/          Cloudflare Worker
    routes/        Hono routers, one per API group
    middleware/    session + role/board guards
    repositories/  the ONLY Google-aware code (sheets.ts, drive.ts)
    google/        service-account JWT, Sheets/Drive clients
    durable-objects/ board-lock.ts — write serialisation
  shared/          imported by BOTH sides
    schemas/       Zod — validation defined once
    domain/        board state machine
    constants/     Drive folder conventions
docs/              ARCHITECTURE.md
```

The import boundary that matters: **nothing outside `server/repositories/` and
`server/google/` knows the data lives in Google.** That is what keeps the
D1 read-model escape hatch (§14) cheap to add later.

## Status

All three screens are built and working against **in-memory fixtures**
(`DEV_MODE: "true"` in `wrangler.jsonc`), which enforce the same rules the
live repository will: the state machine, version checks, and role/department
scoping.

| Area | State |
|---|---|
| QPSB Constitution (HoD) | Built — submit, rejection feedback, resubmit, schedule |
| Admin Portal | Built — counts, filters, approve, reject, offer dates |
| File Checker | Built — pre/post matrices with problem filter |
| Google Sheets / Drive | **Not implemented** — `createSheetsRepo` / `createDriveRepo` throw |
| Google login | **Not implemented** — dev impersonation only |
| ZIP download, appointment email | **Not implemented** (Phases 5) |

### Development sign-in

There is no Google login yet. Append `?as=<email>` to any URL to act as that
user; it is remembered for the browser tab. Valid users are in
`src/server/repositories/fixtures.ts`:

- `coe@sssihl.edu.in` — administrator
- `hod.maths@sssihl.edu.in` — HoD, Mathematics
- `hod.cs@sssihl.edu.in` — HoD, Computer Science + Physics

This works only while `DEV_MODE` is `"true"`. **Set it to `"false"` before any
production deploy.**

Build order for the rest is in
[docs/ARCHITECTURE.md §12](docs/ARCHITECTURE.md).

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Vite + Worker together |
| `npm run build` | Typecheck + build (SPA → `dist/client`, Worker → `dist/qpsb_portal`) |
| `npm run deploy` | Build, then deploy using the plugin-generated wrangler config |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm test` | Vitest (Worker tests run in the real runtime) |
| `npm run cf-typegen` | Regenerate binding types after editing `wrangler.jsonc` |

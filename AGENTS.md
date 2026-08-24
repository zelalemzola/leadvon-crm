<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Project overview

LeadVon CRM — a lead-selling platform for the French insurance market. Single Next.js 16 (App Router) codebase serving two surfaces: admin portal (`/admin`) and client workspace (`/client`). Uses Supabase (Postgres + Auth), Stripe (payments), and Base44 (external lead ingestion).

### Development commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (port 3000) |
| Lint | `npm run lint` (ESLint 9) |
| Tests | `npm run test` (Vitest) |
| Build | `npm run build` |

### Environment variables

A `.env.local` file is required. The minimum set for the dev server to start:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `NEXT_PUBLIC_APP_URL` — typically `http://localhost:3000`

Additional keys needed for full functionality: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BASE44_API_KEY`, `CRON_SECRET`. These can be obtained via the Supabase MCP (`list_projects` → project "leadvon", id `elgtfcbhdjqvcegpflpv`) and team secrets.

### Known pre-existing issues (not bugs introduced by agents)

- **ESLint**: 9 errors and 13 warnings exist on `main` (mostly `react-hooks/set-state-in-effect` and `react/no-unescaped-entities`). Do not attempt to fix these unless specifically asked.
- **Vitest**: 1 test failure in `tests/validation.test.ts` ("accepts valid lead flow payload") — pre-existing on `main`.
- **Post-signup redirect loop**: After signup, the app tries to navigate `/client/setup` ↔ `/client` in a loop due to missing `organization_id` logic. This is a known issue on `main`.

### Architecture notes

- Locale-based routing: `app/[locale]/...` with `en` and `fr` support.
- Route groups: `(admin)` for staff, `(client)` for customer orgs, `(auth)` for login/signup.
- State management: Redux Toolkit + RTK Query slices in `lib/store/`.
- Supabase migrations: `supabase/migrations/` (32 SQL files). No local Supabase CLI config committed.
- No Docker, no Makefile — pure Next.js on Vercel.

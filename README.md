## LeadVon CRM

Single codebase for both user-facing client workspace and internal admin portal.

## Local Development

```bash
npm install
npm run dev
```

## Separate Client/Admin Deployments

This app supports deployment surface isolation with `APP_SURFACE`.

- `APP_SURFACE=client`: serves customer routes and blocks admin pages/APIs.
- `APP_SURFACE=admin`: serves admin routes and blocks client pages/APIs.
- `APP_SURFACE=all` (default): serves everything (current behavior).

Optional host hardening:

- `ADMIN_ALLOWED_HOSTS`: comma-separated hostnames allowed for admin deployment
- `CLIENT_ALLOWED_HOSTS`: comma-separated hostnames allowed for client deployment
- Supports wildcard patterns like `*.yourdomain.com`

### Recommended production setup

- Deploy **two separate projects** from the same repository.
- Client project env: `APP_SURFACE=client`
- Admin project env: `APP_SURFACE=admin`
- Attach separate domains:
  - Client: `app.yourdomain.com`
  - Admin: `admin.yourdomain.com`

### Example (Vercel)

1. Create project `leadvon-client` from this repo.
2. Set `APP_SURFACE=client` in environment variables.
3. Set `CLIENT_ALLOWED_HOSTS=app.yourdomain.com`
4. Set `ADMIN_ALLOWED_HOSTS=admin.yourdomain.com` (to explicitly block admin host on client app)
5. Add domain `app.yourdomain.com`.
6. Create project `leadvon-admin` from the same repo.
7. Set `APP_SURFACE=admin` in environment variables.
8. Set `ADMIN_ALLOWED_HOSTS=admin.yourdomain.com`
9. Set `CLIENT_ALLOWED_HOSTS=app.yourdomain.com` (to explicitly block client host on admin app)
10. Add domain `admin.yourdomain.com`.

### Security notes

- Route isolation is an additional layer, not the only layer.
- Keep server-side role checks in layouts and APIs (already implemented).
- Use MFA for admin users and monitor admin audit logs.

## SMS (Twilio)

Configure these environment variables to enable outbound SMS:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER` (or `TWILIO_MESSAGING_SERVICE_SID`)
- Optional hardening: `TWILIO_VALIDATE_WEBHOOK_SIGNATURE=true`

SMS billing uses a separate prepaid balance per organization ($0.30 per message). Customers top up via Stripe (`purpose: sms_topup`). Apply the migration `20260702120000_sms_call_scripts.sql` before using SMS features.
For delivery reconciliation + failed-send refunds, also apply `20260702133000_sms_delivery_reconciliation.sql`.
To allow each customer to send from their own sender, apply `20260702150000_org_twilio_sender_settings.sql` and configure sender values under Client -> Settings.

## External Lead Sync

CRM can ingest external leads from:

- `base44` (existing SaLead sync)
- `funnel` (`leadvon-funnel` prelander submissions)
- `wmleads` (Base44 `WmLead` entity — separate app host)

Required env vars for funnel sync:

- `FUNNEL_SUPABASE_URL`
- `FUNNEL_SUPABASE_SERVICE_ROLE_KEY`
- Optional: `FUNNEL_INGEST_BATCH_SIZE` (default 100)
- Optional: `FUNNEL_DEFAULT_CATEGORY_ID` (fallback when debt-review category is missing)

Required env vars for wmleads sync:

- `WMLEADS_BASE_URL` (e.g. `https://beratervermittlung.base44.app/api`)
- `WMLEADS_API_KEY` (falls back to `BASE44_API_KEY` if unset)
- Optional: `WMLEADS_INGEST_BATCH_SIZE` (default 100)
- Optional: `WMLEADS_DEFAULT_CATEGORY_ID` (fallback when wealth-management category is missing)
- Optional: `WMLEADS_DEFAULT_COUNTRY` (default `Unknown`)

Trigger endpoints:

- `POST /api/cron/funnel-sync` with `x-cron-secret: $CRON_SECRET`
- `POST /api/cron/wmleads-sync` with `x-cron-secret: $CRON_SECRET`
- Staff: `POST /api/admin/leads/sync-wmleads`

## Google Sheets lead export (per customer)

When enabled for an organization (Admin → Customers → Google Sheets export), every lead
delivered into that customer’s CRM account is also **appended** to their Google Sheet.

Apply migrations:

- `20260714120000_google_sheet_lead_exports.sql` (idempotency ledger)
- `20260714130000_organization_google_sheet_exports.sql` (per-org settings)

Required env vars (one shared Google service account for all customers):

- `GOOGLE_SHEETS_CLIENT_EMAIL` — service account email (each client must share their sheet with this address as **Editor**)
- `GOOGLE_SHEETS_PRIVATE_KEY` — service account private key (`\n` for newlines)
- Or: `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` — full service account JSON

Flush path: same places as lead emails (`processPendingLeadEmails`) plus `POST /api/cron/notifications`.

Row layout:

- A–G (required order): Creation Date/Time | Consumer Name | Consumer Surname | Email | Mobile | Ad Source | Qualifying
- H–K (optional extras to the right): Zip/Province | Summary | Unit | Country

Append-only — never delete sheet rows.

## Browser push notifications (Web Push)

Client users can opt in on **Client → Notifications** to receive browser alerts when new leads arrive or status changes.

Required env vars:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — VAPID public key (safe for the browser)
- `VAPID_PRIVATE_KEY` — VAPID private key (server only)
- Optional: `VAPID_SUBJECT` — contact URI, e.g. `mailto:support@leadvoncrm.com`

Generate keys:

```bash
npx web-push generate-vapid-keys
```

Apply migration `20260702160000_web_push_subscriptions.sql` before enabling push.

Pending push delivery for DB-triggered notifications (new leads, assignments) is processed by the existing notifications cron:

- `POST /api/cron/notifications` with `Authorization: Bearer $CRON_SECRET`

Status-change notifications attempt immediate push delivery from the API when configured.


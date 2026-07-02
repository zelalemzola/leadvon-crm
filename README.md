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

- `base44` (existing sync)
- `funnel` (`leadvon-funnel` prelander submissions)

Required env vars for funnel sync:

- `FUNNEL_SUPABASE_URL`
- `FUNNEL_SUPABASE_SERVICE_ROLE_KEY`
- Optional: `FUNNEL_INGEST_BATCH_SIZE` (default 100)
- Optional: `FUNNEL_DEFAULT_CATEGORY_ID` (fallback when debt-review category is missing)

Trigger endpoint:

- `POST /api/cron/funnel-sync` with `x-cron-secret: $CRON_SECRET`


-- HARD RESET: remove business/app data while keeping auth users and profile identities.
-- Keeps: auth.users, public.profiles
-- Clears: leads, categories, packages, purchases, flows, billing/ledger, routing logs, org records.

BEGIN;

-- Routing + processing logs
DELETE FROM public.delivery_routing_events;
DELETE FROM public.routing_job_runs;

-- Billing / finance artifacts
DELETE FROM public.delivery_ledger_lines;
DELETE FROM public.delivery_invoices;
DELETE FROM public.delivery_entitlements;
DELETE FROM public.stripe_webhook_events;

-- Customer operations
DELETE FROM public.customer_flow_commitments;
DELETE FROM public.customer_lead_flows;
DELETE FROM public.customer_audit_logs;
DELETE FROM public.customer_leads;
DELETE FROM public.lead_purchases;
DELETE FROM public.wallet_transactions;
DELETE FROM public.wallets;

-- Catalog + inventory
DELETE FROM public.lead_offers;
DELETE FROM public.lead_pricebook;
DELETE FROM public.leads;
DELETE FROM public.lead_packages;
DELETE FROM public.categories;

-- Admin/support/meta data
DELETE FROM public.support_contacts;
DELETE FROM public.admin_audit_logs;
DELETE FROM public.external_sync_cursors;

-- Remove org records so customer directories/tenant lists are clean.
-- Profiles are preserved; organization_id becomes NULL due FK ON DELETE SET NULL.
DELETE FROM public.organizations;

COMMIT;

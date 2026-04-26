import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripeServer } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Webhook misconfigured" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripeServer();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const service = createServiceClient();

  // Record receipt of webhook (non-blocking for retries if insert fails).
  await service.from("stripe_webhook_events").upsert({
    id: event.id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "payment" || session.payment_status !== "paid") {
      return NextResponse.json({ received: true });
    }
    const purpose = session.metadata?.purpose;
    const orgId = session.metadata?.organization_id;
    const amountTotal = session.amount_total ?? 0;
    if (purpose === "wallet_topup" && orgId && amountTotal > 0) {
      const ref = `checkout_session:${session.id}`;
      const { error } = await service.rpc("apply_wallet_topup", {
        p_organization_id: orgId,
        p_amount_cents: amountTotal,
        p_reference_id: ref,
        p_description: "Stripe wallet top-up",
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    if (purpose === "prepaid_entitlement" && orgId && amountTotal > 0) {
      const ref = `checkout_session:${session.id}`;
      const ent = await service.rpc("create_delivery_entitlement", {
        p_organization_id: orgId,
        p_budget_cents: amountTotal,
        p_stripe_payment_ref: ref,
      });
      if (ent.error) {
        return NextResponse.json({ error: ent.error.message }, { status: 500 });
      }
      const inv = await service.rpc("create_prepaid_purchase_invoice", {
        p_organization_id: orgId,
        p_amount_cents: amountTotal,
        p_stripe_payment_ref: ref,
      });
      if (inv.error) {
        return NextResponse.json({ error: inv.error.message }, { status: 500 });
      }
    }
    if (purpose === "tiered_lead_flow" && orgId && amountTotal > 0) {
      const ref = `checkout_session:${session.id}`;
      const packageId = session.metadata?.package_id;
      const userId = session.metadata?.user_id ?? null;
      const monthlyTarget = Number(session.metadata?.monthly_target_leads ?? "0");
      const leadsPerWeek = Number(session.metadata?.leads_per_week ?? "0");
      const businessDaysOnly = session.metadata?.business_days_only === "true";
      if (!packageId || !Number.isFinite(leadsPerWeek) || leadsPerWeek <= 0) {
        return NextResponse.json(
          { error: "Missing tiered flow metadata in checkout session" },
          { status: 500 }
        );
      }

      const ent = await service.rpc("create_delivery_entitlement", {
        p_organization_id: orgId,
        p_budget_cents: amountTotal,
        p_stripe_payment_ref: ref,
      });
      if (ent.error) {
        return NextResponse.json({ error: ent.error.message }, { status: 500 });
      }

      const flowUpsert = await service
        .from("customer_lead_flows")
        .upsert(
          {
            organization_id: orgId,
            package_id: packageId,
            leads_per_week: Math.max(1, Math.round(leadsPerWeek)),
            is_active: true,
            created_by: userId,
            next_run_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: "organization_id,package_id" }
        )
        .select("id")
        .single();
      if (flowUpsert.error) {
        return NextResponse.json({ error: flowUpsert.error.message }, { status: 500 });
      }

      if (monthlyTarget > 0) {
        const commitment = await service.from("customer_flow_commitments").upsert(
          {
            flow_id: flowUpsert.data.id,
            monthly_target_leads: Math.round(monthlyTarget),
            business_days_only: businessDaysOnly,
            is_active: true,
          },
          { onConflict: "flow_id" }
        );
        if (commitment.error) {
          return NextResponse.json({ error: commitment.error.message }, { status: 500 });
        }
      }

      const inv = await service.rpc("create_prepaid_purchase_invoice", {
        p_organization_id: orgId,
        p_amount_cents: amountTotal,
        p_stripe_payment_ref: ref,
      });
      if (inv.error) {
        return NextResponse.json({ error: inv.error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}

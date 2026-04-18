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
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
  }

  return NextResponse.json({ received: true });
}

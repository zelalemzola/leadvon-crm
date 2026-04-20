import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAppBaseUrl, getStripeServer } from "@/lib/stripe/server";

const schema = z.object({
  amount_cents: z.number().int().min(500).max(5000000),
});

/**
 * Creates a one-time Stripe Checkout session. On success, the webhook
 * creates a delivery_entitlement (30-day prepaid budget) — not a wallet balance.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active) {
    return NextResponse.json({ error: "Inactive account" }, { status: 403 });
  }
  if (!profile.organization_id) {
    return NextResponse.json({ error: "No organization context" }, { status: 400 });
  }
  if (profile.role !== "customer_admin") {
    return NextResponse.json(
      { error: "Only organization admins can purchase prepaid delivery" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const amount = parsed.data.amount_cents;
  const stripe = getStripeServer();
  const baseUrl = getAppBaseUrl(request.url);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${baseUrl}/client/billing?prepaid=success`,
    cancel_url: `${baseUrl}/client/billing?prepaid=cancel`,
    customer_email: user.email ?? undefined,
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name: "LeadVon prepaid delivery budget",
            description:
              "Prepaid delivery budget (USD). A 30-day delivery period starts when payment succeeds.",
          },
        },
      },
    ],
    metadata: {
      purpose: "prepaid_entitlement",
      organization_id: profile.organization_id,
      user_id: user.id,
      amount_cents: String(amount),
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "Could not create checkout session" }, { status: 400 });
  }

  return NextResponse.json({ data: { url: session.url } });
}

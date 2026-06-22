import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppBaseUrl, getStripeServer } from "@/lib/stripe/server";
import { requireCustomerUser } from "@/lib/server/client/auth";
import {
  TieredPricingError,
  computeTieredQuote,
} from "@/lib/server/pricing/tiered-pricing";

const schema = z.object({
  category_id: z.string().uuid(),
  unit_type: z.string().min(1).max(50).optional(),
  quantity: z.number().int().min(1).max(100000),
  monthly_target_leads: z.number().int().min(1).max(100000).optional(),
  business_days_only: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  const auth = await requireCustomerUser({ adminOnly: true });
  if ("error" in auth) {
    return auth.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const quote = await computeTieredQuote({
      categoryId: parsed.data.category_id,
      unitType: parsed.data.unit_type,
      quantity: parsed.data.quantity,
      organizationId: auth.organizationId,
    });

    const monthlyTarget = parsed.data.monthly_target_leads ?? quote.quantity;
    const leadsPerWeek = Math.max(1, Math.round(monthlyTarget / 4.333));
    const stripe = getStripeServer();
    const baseUrl = getAppBaseUrl(request.url);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${baseUrl}/client/billing?tiered=success`,
      cancel_url: `${baseUrl}/client/billing?tiered=cancel`,
      customer_email: undefined,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: quote.total_cents,
            product_data: {
              name: "LeadVon monthly lead flow budget",
              description: `${quote.quantity} lead(s) / month for category ${quote.category_id}`,
            },
          },
        },
      ],
      metadata: {
        purpose: "tiered_lead_flow",
        organization_id: auth.organizationId,
        user_id: auth.userId,
        amount_cents: String(quote.total_cents),
        category_id: quote.category_id,
        quantity: String(quote.quantity),
        monthly_target_leads: String(monthlyTarget),
        leads_per_week: String(leadsPerWeek),
        business_days_only: String(parsed.data.business_days_only),
      },
    });
    if (!session.url) {
      return NextResponse.json({ error: "Could not create checkout session" }, { status: 400 });
    }
    return NextResponse.json({ data: { url: session.url } });
  } catch (error) {
    if (error instanceof TieredPricingError) {
      const statusByCode: Record<TieredPricingError["code"], number> = {
        FEATURE_DISABLED: 404,
        CATEGORY_NOT_FOUND: 404,
        BELOW_MINIMUM_ORDER: 400,
        NO_ACTIVE_TIER: 409,
        NO_TIER_RATE: 409,
      };
      return NextResponse.json({ error: error.message }, { status: statusByCode[error.code] });
    }
    return NextResponse.json({ error: "Could not start tiered checkout" }, { status: 500 });
  }
}

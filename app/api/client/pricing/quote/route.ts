import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/server/client/auth";
import { TieredPricingError, computeTieredQuote } from "@/lib/server/pricing/tiered-pricing";

const quoteSchema = z.object({
  category_id: z.string().uuid(),
  unit_type: z.string().min(1).max(50).optional(),
  quantity: z.number().int().min(1).max(100000),
});

export async function POST(request: Request) {
  const auth = await requireCustomerUser();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const quote = await computeTieredQuote({
      categoryId: parsed.data.category_id,
      unitType: parsed.data.unit_type,
      quantity: parsed.data.quantity,
    });
    return NextResponse.json({ data: quote });
  } catch (error) {
    if (error instanceof TieredPricingError) {
      const statusByCode: Record<TieredPricingError["code"], number> = {
        FEATURE_DISABLED: 404,
        CATEGORY_NOT_FOUND: 404,
        BELOW_MINIMUM_ORDER: 400,
        NO_ACTIVE_TIER: 409,
        NO_TIER_RATE: 409,
      };
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: statusByCode[error.code] }
      );
    }
    return NextResponse.json({ error: "Could not compute pricing quote" }, { status: 500 });
  }
}

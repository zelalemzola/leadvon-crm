import { createServiceClient } from "@/lib/supabase/service";
export type TieredQuoteResult = {
  category_id: string;
  unit_type: string;
  quantity: number;
  minimum_order_qty: number;
  tier_id: string;
  tier_min_qty: number;
  tier_max_qty: number | null;
  price_per_lead_cents: number;
  total_cents: number;
  currency: "USD";
};

export class TieredPricingError extends Error {
  code:
    | "FEATURE_DISABLED"
    | "CATEGORY_NOT_FOUND"
    | "BELOW_MINIMUM_ORDER"
    | "NO_ACTIVE_TIER"
    | "NO_TIER_RATE";

  constructor(code: TieredPricingError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export function isTieredPricingEnabled(): boolean {
  const raw = process.env.BILLING_TIERED_PRICING_ENABLED ?? "";
  return raw === "1" || raw.toLowerCase() === "true";
}

export async function computeTieredQuote(args: {
  categoryId: string;
  unitType: string;
  quantity: number;
}): Promise<TieredQuoteResult> {
  if (!isTieredPricingEnabled()) {
    throw new TieredPricingError("FEATURE_DISABLED", "Tiered pricing is currently disabled");
  }

  const service = createServiceClient();
  const qty = Math.trunc(args.quantity);
  const { data: category, error: categoryError } = await service
    .from("categories")
    .select("id, minimum_order_qty")
    .eq("id", args.categoryId)
    .maybeSingle();

  if (categoryError) {
    throw new Error(categoryError.message);
  }
  if (!category) {
    throw new TieredPricingError("CATEGORY_NOT_FOUND", "Category not found");
  }

  const minimumOrderQty = Number(category.minimum_order_qty ?? 1);
  if (qty < minimumOrderQty) {
    throw new TieredPricingError(
      "BELOW_MINIMUM_ORDER",
      `Minimum order is ${minimumOrderQty} leads for this category`
    );
  }

  const { data: tiers, error: tierError } = await service
    .from("category_pricing_tiers")
    .select("id, min_qty, max_qty")
    .eq("category_id", args.categoryId)
    .eq("is_active", true)
    .order("min_qty", { ascending: false });

  if (tierError) {
    throw new Error(tierError.message);
  }

  const selectedTier = (tiers ?? []).find((tier) => {
    const min = Number(tier.min_qty);
    const max = tier.max_qty === null ? Number.POSITIVE_INFINITY : Number(tier.max_qty);
    return qty >= min && qty <= max;
  });

  if (!selectedTier) {
    throw new TieredPricingError("NO_ACTIVE_TIER", "No active tier matches this quantity");
  }

  const { data: rate, error: rateError } = await service
    .from("category_pricing_tier_rates")
    .select("price_cents")
    .eq("tier_id", selectedTier.id)
    .eq("unit_type", args.unitType)
    .maybeSingle();

  if (rateError) {
    throw new Error(rateError.message);
  }
  if (!rate) {
    throw new TieredPricingError(
      "NO_TIER_RATE",
      `No tier price configured for unit type "${args.unitType}"`
    );
  }

  const pricePerLead = Number(rate.price_cents);
  return {
    category_id: args.categoryId,
    unit_type: args.unitType,
    quantity: qty,
    minimum_order_qty: minimumOrderQty,
    tier_id: selectedTier.id,
    tier_min_qty: Number(selectedTier.min_qty),
    tier_max_qty: selectedTier.max_qty === null ? null : Number(selectedTier.max_qty),
    price_per_lead_cents: pricePerLead,
    total_cents: pricePerLead * qty,
    currency: "USD",
  };
}

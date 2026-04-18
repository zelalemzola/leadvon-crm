import { describe, expect, it } from "vitest";
import { slugify } from "../lib/slugify";
import {
  categorySchema,
  inviteStaffSchema,
  leadSchema,
} from "../lib/validation/admin";
import { clientLeadPatchSchema, customerLeadFlowSchema } from "../lib/validation/client";

describe("slugify", () => {
  it("normalizes strings into url-safe slugs", () => {
    expect(slugify(" Health Insurance Leads ")).toBe("health-insurance-leads");
    expect(slugify("A__B  C")).toBe("a-b-c");
  });
});

describe("admin validation schemas", () => {
  it("accepts valid lead payload", () => {
    const valid = leadSchema.safeParse({
      category_id: "0c63f5df-b572-4a15-bf2f-0ea95f850f4f",
      phone: "+14155550123",
      first_name: "Ada",
      last_name: "Lovelace",
      country: "United States",
      notes: "Interested in PPO",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects invalid category slug", () => {
    const invalid = categorySchema.safeParse({
      name: "Health",
      slug: "Health Plan",
    });
    expect(invalid.success).toBe(false);
  });

  it("requires strong-enough staff password", () => {
    const invalid = inviteStaffSchema.safeParse({
      email: "owner@leadvon.com",
      password: "123",
    });
    expect(invalid.success).toBe(false);
  });
});

describe("client validation schemas", () => {
  it("accepts valid lead flow payload", () => {
    const valid = customerLeadFlowSchema.safeParse({
      package_id: "0c63f5df-b572-4a15-bf2f-0ea95f850f4f",
      leads_per_week: 120,
      is_active: true,
    });
    expect(valid.success).toBe(true);
  });

  it("rejects invalid lead status payload", () => {
    const invalid = clientLeadPatchSchema.safeParse({
      status: "bad_status",
    });
    expect(invalid.success).toBe(false);
  });
});

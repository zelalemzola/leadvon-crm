import { describe, expect, it } from "vitest";
import { mapBase44WmLeadToInventoryLead } from "../lib/integrations/wmleads-mapper";

describe("mapBase44WmLeadToInventoryLead", () => {
  const categoryId = "11111111-1111-1111-1111-111111111111";

  it("maps a valid new WmLead with labeled q1-q5 summary", () => {
    const result = mapBase44WmLeadToInventoryLead(
      {
        id: "wm-1",
        prenom: "Alice",
        nom: "Martin",
        telephone: "+33123456789",
        email: "alice@example.com",
        q1: "Yes",
        q2: "Retirement",
        q3: "None",
        q4: "100k_250k",
        q5: "Growth",
        source: "wm",
        status: "new",
        created_date: "2026-08-01T10:00:00.000Z",
        updated_date: "2026-08-01T11:00:00.000Z",
      },
      categoryId
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source_system).toBe("wmleads");
    expect(result.data.source_external_id).toBe("wm-1");
    expect(result.data.category_id).toBe(categoryId);
    expect(result.data.first_name).toBe("Alice");
    expect(result.data.last_name).toBe("Martin");
    expect(result.data.phone).toBe("+33123456789");
    expect(result.data.summary).toContain("Interest in wealth management: Yes");
    expect(result.data.summary).toContain("Main wealth concern: Retirement");
    expect(result.data.summary).toContain("Current wealth manager: None");
    expect(result.data.summary).toContain("Portfolio size bracket: 100k_250k");
    expect(result.data.summary).toContain("Primary goal: Growth");
    expect(result.data.summary).toContain("status: New");
  });

  it("rejects non-new status", () => {
    const result = mapBase44WmLeadToInventoryLead(
      {
        id: "wm-2",
        prenom: "Bob",
        nom: "Dupont",
        telephone: "+33111111111",
        status: "contacted",
      },
      categoryId
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("status_not_new");
  });

  it("rejects missing phone", () => {
    const result = mapBase44WmLeadToInventoryLead(
      {
        id: "wm-3",
        prenom: "Claire",
        nom: "Bernard",
        status: "new",
      },
      categoryId
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing_phone");
  });
});

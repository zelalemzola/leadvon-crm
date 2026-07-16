import { describe, expect, it } from "vitest";
import {
  buildFunnelLeadSummary,
  mapFunnelSubmissionToInventoryLead,
} from "../lib/integrations/funnel-mapper";

const base = {
  id: "sub-1",
  funnel_id: "f1",
  page_id: "p1",
  created_at: "2026-07-15T12:00:00.000Z",
  updated_at: "2026-07-15T12:05:00.000Z",
  geo: null,
  user_agent: null,
  referrer: null,
};

describe("mapFunnelSubmissionToInventoryLead", () => {
  it("imports phone-only partials with Unknown name", () => {
    const mapped = mapFunnelSubmissionToInventoryLead(
      {
        ...base,
        answers: { phone: "+33612345678", utm_source: "fb", email: "a@b.com" },
      },
      "cat-1"
    );
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.data.phone).toBe("+33612345678");
    expect(mapped.data.first_name).toBe("Unknown");
    expect(mapped.data.last_name).toBe("Unknown");
    expect(mapped.data.summary).toContain("email: a@b.com");
    expect(mapped.data.summary).toContain("utm_source: fb");
  });

  it("rejects missing phone", () => {
    const mapped = mapFunnelSubmissionToInventoryLead(
      { ...base, answers: { first_name: "Ada", email: "a@b.com" } },
      "cat-1"
    );
    expect(mapped.ok).toBe(false);
    if (mapped.ok) return;
    expect(mapped.reason).toBe("missing_or_invalid_phone");
  });

  it("merges lead_qa with top-level extras into summary", () => {
    const summary = buildFunnelLeadSummary({
      phone: "+33612345678",
      email: "ops@example.com",
      utm_campaign: "spring",
      lead_qa: JSON.stringify([
        { question: "Debt range", answer: "10k-20k" },
        { key: "email", question: "Email", answer: "ops@example.com" },
      ]),
    });
    expect(summary).toContain("Debt range: 10k-20k");
    expect(summary.toLowerCase()).toContain("ops@example.com");
    expect(summary).toContain("utm_campaign: spring");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildLeadCsvTemplateCsv,
  normalizeLeadCsvPhone,
  parseLeadCsvText,
} from "../lib/imports/lead-csv";

const categories = [
  { id: "0c63f5df-b572-4a15-bf2f-0ea95f850f4f", name: "Debt Review", slug: "debt-review" },
  { id: "1a2b3c4d-e5f6-7890-abcd-ef1234567890", name: "Health", slug: "health" },
];

describe("lead csv import", () => {
  it("parses a valid CSV with explicit columns", () => {
    const csv = [
      "first_name,last_name,phone,category,country",
      "Ada,Lovelace,+1 (415) 555-0123,Debt Review,United States",
    ].join("\n");

    const result = parseLeadCsvText(csv, categories);
    expect(result.fileErrors).toEqual([]);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]).toMatchObject({
      rowNumber: 2,
      first_name: "Ada",
      last_name: "Lovelace",
      phone: "+14155550123",
      category_id: categories[0]!.id,
      country: "United States",
    });
  });

  it("accepts only first_name when last_name is missing", () => {
    const csv = [
      "first_name,phone,category",
      "Ada,+14155550123,debt-review",
    ].join("\n");

    const result = parseLeadCsvText(csv, categories);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]?.first_name).toBe("Ada");
    expect(result.validRows[0]?.last_name).toBe("");
  });

  it("accepts only last_name when first_name is missing", () => {
    const csv = [
      "last_name,telephone,category_name",
      "Lovelace,4155550123,Debt Review",
    ].join("\n");

    const result = parseLeadCsvText(csv, categories);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]?.last_name).toBe("Lovelace");
    expect(result.validRows[0]?.first_name).toBe("");
  });

  it("splits full_name into first and last", () => {
    const csv = [
      "full_name,mobile,category",
      "Ada Lovelace,4155550123,Debt Review",
    ].join("\n");

    const result = parseLeadCsvText(csv, categories);
    expect(result.validRows[0]).toMatchObject({
      first_name: "Ada",
      last_name: "Lovelace",
    });
  });

  it("handles quoted fields with commas in summary", () => {
    const csv = [
      "first_name,last_name,phone,category,summary",
      'Ada,Lovelace,4155550123,Debt Review,"Interested in PPO, HMO"',
    ].join("\n");

    const result = parseLeadCsvText(csv, categories);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]?.summary).toBe("Interested in PPO, HMO");
  });

  it("rejects rows without phone", () => {
    const csv = [
      "first_name,last_name,phone,category",
      "Ada,Lovelace,,Debt Review",
    ].join("\n");

    const result = parseLeadCsvText(csv, categories);
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows[0]?.errors).toContain("Phone is required");
  });

  it("rejects rows without any name", () => {
    const csv = [
      "phone,category",
      "4155550123,Debt Review",
    ].join("\n");

    const result = parseLeadCsvText(csv, categories);
    expect(result.fileErrors.length).toBeGreaterThan(0);
  });

  it("reports unknown categories", () => {
    const csv = [
      "first_name,phone,category",
      "Ada,4155550123,Unknown Category",
    ].join("\n");

    const result = parseLeadCsvText(csv, categories);
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows[0]?.errors[0]).toContain("Unknown category");
  });

  it("normalizes phone numbers", () => {
    expect(normalizeLeadCsvPhone("+1 (415) 555-0123")).toBe("+14155550123");
    expect(normalizeLeadCsvPhone("")).toBe("");
  });

  it("builds a downloadable template", () => {
    const template = buildLeadCsvTemplateCsv();
    expect(template).toContain("first_name,last_name,phone,category");
    expect(template).toContain("review_status");
    expect(template.split("\n")).toHaveLength(2);
  });

  it("parses review_status from a dedicated column", () => {
    const csv = [
      "first_name,phone,category,review_status",
      "Ada,4155550123,Debt Review,yes_review",
    ].join("\n");

    const result = parseLeadCsvText(csv, categories);
    expect(result.validRows[0]?.review_status).toBe("yes_review");
  });

  it("accepts human-readable review status labels", () => {
    const csv = [
      "first_name,phone,category,review_status",
      "Ada,4155550123,Debt Review,Yes Review",
    ].join("\n");

    const result = parseLeadCsvText(csv, categories);
    expect(result.validRows[0]?.review_status).toBe("yes_review");
  });

  it("extracts review_status from summary when column is missing", () => {
    const csv = [
      "first_name,phone,category,summary",
      "Ada,4155550123,Debt Review,age: 34 - review_status: yes_review",
    ].join("\n");

    const result = parseLeadCsvText(csv, categories);
    expect(result.validRows[0]?.review_status).toBe("yes_review");
    expect(result.validRows[0]?.summary).toBe("age: 34");
  });
});

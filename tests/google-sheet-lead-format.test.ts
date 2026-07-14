import { describe, expect, it } from "vitest";
import {
  buildGoogleSheetLeadRow,
  formatGoogleSheetLeadDateTime,
  parseGoogleSpreadsheetId,
  toSaLocalMobile,
  toTitleCaseName,
} from "../lib/server/integrations/google-sheet-lead-format";

describe("Google Sheet lead formatting", () => {
  it("title-cases names and trims whitespace", () => {
    expect(toTitleCaseName("  john   SMITH ")).toBe("John Smith");
    expect(toTitleCaseName("")).toBe("");
  });

  it("converts phones to SA local format", () => {
    expect(toSaLocalMobile("+27 81 123 4567")).toBe("0811234567");
    expect(toSaLocalMobile("27811234567")).toBe("0811234567");
    expect(toSaLocalMobile("0811234567")).toBe("0811234567");
    expect(toSaLocalMobile("811234567")).toBe("0811234567");
  });

  it("formats creation datetime per READ ME", () => {
    const formatted = formatGoogleSheetLeadDateTime("1969-07-20T18:17:00.000Z");
    expect(formatted).toBe("20/07/1969 8:17PM");
  });

  it("builds sheet rows with blank email/ad source and Qualified tag", () => {
    const row = buildGoogleSheetLeadRow({
      first_name: "jane",
      last_name: "doe",
      phone: "+27821234567",
      created_at: "1969-07-20T18:17:00.000Z",
    });
    expect(row).toEqual([
      "20/07/1969 8:17PM",
      "Jane",
      "Doe",
      "",
      "0821234567",
      "",
      "Qualified",
    ]);
  });

  it("parses spreadsheet ids from urls", () => {
    expect(
      parseGoogleSpreadsheetId(
        "https://docs.google.com/spreadsheets/d/1Jxrkjez_TIqTsVlsGGe8Lely4fSVxnmZuLrOLeSGrng/edit?usp=sharing"
      )
    ).toBe("1Jxrkjez_TIqTsVlsGGe8Lely4fSVxnmZuLrOLeSGrng");
    expect(parseGoogleSpreadsheetId("1Jxrkjez_TIqTsVlsGGe8Lely4fSVxnmZuLrOLeSGrng")).toBe(
      "1Jxrkjez_TIqTsVlsGGe8Lely4fSVxnmZuLrOLeSGrng"
    );
  });
});

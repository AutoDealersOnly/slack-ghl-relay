import { describe, expect, it } from "vitest";
import { ghlHeaders, selectExactProductionRecord } from "./ghl";

describe("GHL object request headers", () => {
  it("carries the ADO location context without changing the bearer token format", () => {
    const headers = new Headers(ghlHeaders("test-token", "2021-07-28", "test-location"));

    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("version")).toBe("2021-07-28");
    expect(headers.get("locationid")).toBe("test-location");
  });

  it("uses only an exact normalized Production name match instead of the first broad search result", () => {
    const record = selectExactProductionRecord(
      [
        { properties: { production: "2608 Fayetteville Kia SD Archive", event_end: "2026-08-15" } },
        { properties: { production: "2608 Fayetteville Kia SD", event_end: "2026-09-20" } },
      ],
      "2608-fayetteville-kia-sd"
    );
    expect(record?.properties.event_end).toBe("2026-09-20");
  });

  it("refuses an ambiguous exact Production match rather than scheduling from an arbitrary record", () => {
    expect(() =>
      selectExactProductionRecord(
        [
          { properties: { production: "2608 Fayetteville Kia SD", event_end: "2026-09-05" } },
          { properties: { production: "2608 Fayetteville Kia SD", event_end: "2026-09-20" } },
        ],
        "2608-fayetteville-kia-sd"
      )
    ).toThrow("Ambiguous Production record match");
  });
});

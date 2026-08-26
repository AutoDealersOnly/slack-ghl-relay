import { describe, expect, it } from "vitest";
import { buildProductionCanvas } from "./canvas";

describe("Production Canvas rendering", () => {
  it("renders the related dealership and campaign fields as safe Markdown", () => {
    const canvas = buildProductionCanvas(
      { production: "2609 Westshore Honda AME", event_start: "2026-09-14", job_numbers: "100 | 101" },
      { dealership_name: "Westshore Honda", tracking: "813-555-0199" }
    );

    expect(canvas).toContain("2609 Westshore Honda AME");
    expect(canvas).toContain("Westshore Honda");
    expect(canvas).toContain("100 \\| 101");
    expect(canvas).toContain("813-555-0199");
  });
});

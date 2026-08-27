import { describe, expect, it } from "vitest";
import { listPinLookupDealerships, listPinLookupPipelines } from "./pin-code-lookup";

const runLiveDiagnostic = process.env.RUN_LIVE_PIN_CODE_LOOKUP_OPPORTUNITY_DIAGNOSTIC === "true";

describe.runIf(runLiveDiagnostic)("live PIN Code Lookup opportunity diagnostic", () => {
  it("retrieves ABC Dealer pipelines read-only and selects its Marketing Pipeline when available", async () => {
    const access = process.env.PIN_CODE_LOOKUP_ACCESS_TOKEN?.trim() ?? "";
    expect(access.length).toBeGreaterThan(24);

    const dealerships = await listPinLookupDealerships(access);
    const abc = dealerships.find(item => item.dealershipName.toLowerCase().includes("abc"));
    expect(abc?.ready).toBe(true);

    const result = await listPinLookupPipelines(access, abc!.locationId);
    expect(result.pipelines.length).toBeGreaterThan(0);
    expect(result.defaultPipelineName.toLowerCase()).toContain("marketing");
  }, 60_000);
});

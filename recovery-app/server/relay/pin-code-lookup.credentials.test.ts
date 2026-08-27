import { describe, expect, it } from "vitest";
import { getPinLookupBootstrap, listPinLookupDealerships } from "./pin-code-lookup";

const runLiveDiagnostic = process.env.RUN_LIVE_PIN_CODE_LOOKUP_DIAGNOSTIC === "true";

describe.runIf(runLiveDiagnostic)("live universal PIN Code Lookup diagnostic", () => {
  it("resolves ABC Dealer and its PIN field without retrieving customer data or writing to GoHighLevel", async () => {
    const access = process.env.PIN_CODE_LOOKUP_ACCESS_TOKEN?.trim() ?? "";
    expect(access.length).toBeGreaterThan(24);

    const dealerships = await listPinLookupDealerships(access);
    const abc = dealerships.find(item => item.dealershipName.toLowerCase().includes("abc"));
    expect(abc).toBeDefined();
    expect(abc?.ready).toBe(true);

    const bootstrap = await getPinLookupBootstrap(access, abc!.locationId);
    expect(bootstrap.dealershipName.toLowerCase()).toContain("abc");
    expect(bootstrap.missingPinField).toBe(false);
    expect(bootstrap.availableFields).toContain("pin_code");
  }, 30_000);
});

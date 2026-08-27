import { describe, expect, it } from "vitest";
import { getRelayConfig } from "./config";

const runLiveCheck = process.env.RUN_LIVE_ADO_LOCATION_CHECK === "true";

describe.skipIf(!runLiveCheck)("ADO location configuration", () => {
  it("uses the same ADO subaccount location context shown in GoHighLevel", () => {
    // This value is an ADO location identifier, not a credential. The assertion
    // intentionally reports only pass/fail and never prints the configured value.
    expect(getRelayConfig().ghlLocationId).toBe("UGJmliC4GETAgeO6IDXa");
  });
});

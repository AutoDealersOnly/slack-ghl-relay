import { describe, expect, it } from "vitest";
import { dealershipCustomValues } from "./ghl";
import { parseLegacyDealershipWebhookPayload } from "./legacy-ghl-webhook";
import { selectLegacyHeaderlessHandler } from "./routes";

describe("VERIFIED dealership custom-value sync", () => {
  it("accepts only a verified Dealership record ID from the existing workflow", () => {
    expect(parseLegacyDealershipWebhookPayload({ record_id: "dealer-abc", verified: "VERIFIED" })).toEqual({
      record_id: "dealer-abc",
      verified: "VERIFIED",
    });
    expect(parseLegacyDealershipWebhookPayload({ verified: "verified" })).toBeNull();
  });

  it("maps only the preserved dealership-information custom values", () => {
    expect(
      dealershipCustomValues({
        dealership_name: "ABC Dealer",
        street_address: "123 Main Street",
        city: "Orlando",
        state: "FL",
        zip: "32801",
        website: "https://abc.example",
        tracking: "14075551212",
        tracking__2: "407-555-3434",
        hours: "Mon–Sat",
        crm_email: "crm@abc.example",
        alias: "Bobby Lamb",
        alias_position: "General Manager",
        brand: "Toyota",
        crm_link: "https://crm.example",
        passcode: "1234",
      })
    ).toEqual({
      dealership_name: "ABC Dealer",
      dealership_address: "123 Main Street, Orlando, FL, 32801",
      dealership_address_full: "123 Main Street, Orlando, FL, 32801",
      dealer_website: "https://abc.example",
      dealership_tracking_number: "407-555-1212",
      dealership_tracking_number_2: "407-555-3434",
      our_hours: "Mon–Sat",
      crm_email: "crm@abc.example",
      alias_name: "Bobby Lamb",
      alias_1st_name: "Bobby",
      alias_position: "General Manager",
      brand: "Toyota",
      crm_link: "https://crm.example",
      passcode: "1234",
    });
  });

  it("routes a headerless VERIFIED delivery to its separate dealership-value handler", () => {
    expect(selectLegacyHeaderlessHandler("dealership_sync", false)).toBe("dealership_values");
    expect(selectLegacyHeaderlessHandler("dealership_sync", true)).toBeNull();
  });
});

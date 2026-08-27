import { describe, expect, it } from "vitest";
import { createQrPassOutputs, createSmsQrUrl } from "./qr-pass-builder";

describe("QR Pass Page Builder output", () => {
  const outputs = createQrPassOutputs({
    apiKey: "pit-selected-dealer-key",
    locationId: "selected-location",
    qrPassUrl: "adoevent.com/qrpass-page",
  });

  it("uses the approved 2026 staff PIN and retains all four modular outputs", () => {
    expect(outputs.pinGate).toContain('QR_PASS_PIN_CODE="2026"');
    expect(outputs.pinGate).not.toContain("1234");
    expect(outputs.appointmentPass).toContain("APPOINTMENT PASS MODULE");
    expect(outputs.editContact).toContain("EDIT THIS CONTACT MODULE");
    expect(outputs.campaignReference).toContain("CAMPAIGN REFERENCE MODULE");
  });

  it("injects only the selected dealer configuration into the copy-ready modules", () => {
    expect(outputs.editContact).toContain('LOCATION_ID="selected-location"');
    expect(outputs.campaignReference).toContain('QR_CAMPAIGN_LOCATION_ID="selected-location"');
    expect(outputs.editContact).toContain("pit-selected-dealer-key");
    expect(outputs.campaignReference).toContain("pit-selected-dealer-key");
  });

  it("retains the exact QR appointment data field order", () => {
    const url = createSmsQrUrl("https://adoevent.com/qrpass-page?d=old");
    expect(url).toContain("https://adoevent.com/qrpass-page?d={{contact.first_name}}");
    expect(url).toContain("%7C{{custom_values.dealership_tracking_number}}%7C{{contact.year}}");
    expect(url).toContain("%7C{{contact.appointment_date}}%7C{{contact.appointment}}");
    expect(url).not.toContain("d=old");
  });
});

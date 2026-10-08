import { describe, expect, it } from "vitest";
import { buildQrPages, createQrPassOutputs, createSmsQrUrl } from "./qr-pass-builder";

describe("QR Pass Page Builder output", () => {
  const outputs = createQrPassOutputs({
    apiKey: "test-api-key",
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
    expect(outputs.editContact).toContain("test-api-key");
    expect(outputs.campaignReference).toContain("test-api-key");
  });

  it("retains the exact QR appointment data field order", () => {
    const url = createSmsQrUrl("https://adoevent.com/qrpass-page?d=old");
    expect(url).toContain("https://adoevent.com/qrpass-page?d={{contact.first_name}}");
    expect(url).toContain("%7C{{custom_values.dealership_tracking_number}}%7C{{contact.year}}");
    expect(url).toContain("%7C{{contact.appointment_date}}%7C{{contact.appointment}}");
    expect(url).not.toContain("d=old");
  });

  it("returns both saved dealership QR page URLs with their fixed safe labels", () => {
    expect(buildQrPages({
      qrUrl: "https://adoevent.com/qr-page-one",
      qrUrl2: "http://example.test/qr-page-two?campaign=2610",
    })).toEqual([
      { id: "qr-page-1", label: "QR Page 1", url: "https://adoevent.com/qr-page-one" },
      { id: "qr-page-2", label: "QR Page 2", url: "http://example.test/qr-page-two?campaign=2610" },
    ]);
  });

  it("omits missing or non-HTTP QR page values without returning raw dealership data", () => {
    expect(buildQrPages({
      qrUrl: "   ",
      qrUrl2: "javascript:alert('not a QR page')",
    })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { generateQrPassPackage, listQrPassDealerships } from "./qr-pass-builder";

const runLiveDiagnostic = process.env.RUN_LIVE_QR_PASS_BUILDER_DIAGNOSTIC === "true";

describe.runIf(runLiveDiagnostic)("live QR Pass Page Builder diagnostic", () => {
  it("generates all five selected-ABC outputs without a write or credential disclosure", async () => {
    const access = process.env.QR_PASS_BUILDER_ACCESS_TOKEN?.trim() ?? "";
    expect(access.length).toBeGreaterThan(24);

    const dealerships = await listQrPassDealerships(access);
    const abc = dealerships.find(item => item.name.toLowerCase().includes("abc"));
    expect(abc).toBeDefined();
    expect(abc?.ready).toBe(true);

    const generated = await generateQrPassPackage(access, abc!.id);
    expect(generated.dealership.name.toLowerCase()).toContain("abc");
    expect(generated.pinGate).toContain('QR_PASS_PIN_CODE="2026"');
    expect(generated.appointmentPass.length).toBeGreaterThan(1000);
    expect(generated.editContact.length).toBeGreaterThan(1000);
    expect(generated.campaignReference.length).toBeGreaterThan(700);
    expect(generated.smsQrUrl).toContain("quickchart.io/qr");
  }, 30_000);
});

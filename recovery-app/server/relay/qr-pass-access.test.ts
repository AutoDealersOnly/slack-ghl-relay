import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { qrPassAccessRouter } from "./qr-pass-access";

describe("QR Pass Builder private access check", () => {
  const configuredAccess = process.env.QR_PASS_BUILDER_ACCESS_TOKEN?.trim() ?? "";
  const app = express();
  app.use("/api/qr-pass", qrPassAccessRouter);
  const server = app.listen(0);

  beforeAll(() => {
    expect(configuredAccess.length).toBeGreaterThan(24);
  });

  afterAll(() => server.close());

  it("accepts the protected custom-menu access value without disclosing it", async () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/qr-pass/access-check?access=${encodeURIComponent(configuredAccess)}`
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects an incorrect access value", async () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/qr-pass/access-check?access=incorrect`);
    expect(response.status).toBe(403);
  });
});

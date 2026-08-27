import { describe, expect, it } from "vitest";
import { ghlHeaders } from "./ghl";

describe("GHL object request headers", () => {
  it("carries the ADO location context without changing the bearer token format", () => {
    const headers = new Headers(ghlHeaders("test-token", "2021-07-28", "test-location"));

    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("version")).toBe("2021-07-28");
    expect(headers.get("locationid")).toBe("test-location");
  });
});

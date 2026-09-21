import { describe, expect, it } from "vitest";
import { ARCHIVE_WARNING_MESSAGE, buildRelayKeepaliveResponse } from "./scheduled-routes";

describe("campaign archive warning", () => {
  it("uses the approved admin-contact wording without changing the archive rule", () => {
    expect(ARCHIVE_WARNING_MESSAGE).toBe("This channel is scheduled to archive tomorrow. Contact admin if the campaign needs to remain open.");
    expect(ARCHIVE_WARNING_MESSAGE).not.toContain("operations channel");
  });
});

describe("relay availability keepalive", () => {
  it("is a lightweight acknowledgement and cannot perform archive work", () => {
    expect(buildRelayKeepaliveResponse()).toEqual({ ok: true, service: "relay" });
  });
});

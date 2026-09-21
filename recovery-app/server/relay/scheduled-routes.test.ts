import { describe, expect, it } from "vitest";
import {
  ARCHIVE_WARNING_MESSAGE,
  MONDAY_ARCHIVE_WARNING_MESSAGE,
  buildRelayKeepaliveResponse,
  getArchiveWarningMessage,
} from "./scheduled-routes";

describe("campaign archive warning", () => {
  it("uses the approved admin-contact wording without changing the archive rule", () => {
    expect(ARCHIVE_WARNING_MESSAGE).toBe("This channel is scheduled to archive tomorrow. Contact admin if the campaign needs to remain open.");
    expect(ARCHIVE_WARNING_MESSAGE).not.toContain("operations channel");
  });

  it("names Monday when a weekend archive hold moved the archive date", () => {
    expect(getArchiveWarningMessage(new Date("2026-09-14T12:00:00.000Z"))).toBe(MONDAY_ARCHIVE_WARNING_MESSAGE);
    expect(getArchiveWarningMessage(new Date("2026-09-15T12:00:00.000Z"))).toBe(ARCHIVE_WARNING_MESSAGE);
  });
});

describe("relay availability keepalive", () => {
  it("is a lightweight acknowledgement and cannot perform archive work", () => {
    expect(buildRelayKeepaliveResponse()).toEqual({ ok: true, service: "relay" });
  });
});

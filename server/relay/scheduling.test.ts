import { describe, expect, it } from "vitest";
import { buildExactDateCron, calculateArchiveDate } from "./scheduling";

describe("relay archive timing", () => {
  it("schedules an archive three days after a valid campaign end date", () => {
    const archiveDate = calculateArchiveDate("2026-08-30");
    expect(archiveDate?.toISOString()).toBe("2026-09-02T12:00:00.000Z");
    expect(buildExactDateCron(archiveDate!)).toBe("0 0 12 2 9 *");
  });

  it("refuses a malformed campaign end date", () => {
    expect(calculateArchiveDate("not-a-date")).toBeNull();
  });
});

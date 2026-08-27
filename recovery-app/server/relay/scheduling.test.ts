import { describe, expect, it } from "vitest";
import { buildExactDateCron, calculateArchiveDate, shouldReconcileArchiveSchedule, shouldRescheduleArchive } from "./scheduling";

describe("relay archive timing", () => {
  it("schedules an archive three days after a valid campaign end date", () => {
    const archiveDate = calculateArchiveDate("2026-08-30");
    expect(archiveDate?.toISOString()).toBe("2026-09-02T12:00:00.000Z");
    expect(buildExactDateCron(archiveDate!)).toBe("0 0 12 2 9 *");
  });

  it("refuses a malformed campaign end date", () => {
    expect(calculateArchiveDate("not-a-date")).toBeNull();
  });

  it("reschedules when the event end date changes and cancels when it is cleared", () => {
    expect(shouldRescheduleArchive("2026-09-07", "2026-09-12", "scheduled")).toBe(true);
    expect(shouldRescheduleArchive("2026-09-12", null, "scheduled")).toBe(true);
    expect(shouldRescheduleArchive("2026-09-12", "2026-09-12", "scheduled")).toBe(false);
    expect(shouldRescheduleArchive("2026-09-07", "2026-09-12", "archived")).toBe(false);
  });

  it("uses the same date-change rule when a channel-creation delivery reaches an existing campaign", () => {
    expect(shouldRescheduleArchive("2026-09-12", "2026-09-13", "scheduled")).toBe(true);
  });

  it("reconciles a stale planned archive date even when the stored end date already matches", () => {
    expect(shouldReconcileArchiveSchedule("2026-09-13", "2026-09-13", "scheduled", "2026-09-15T12:00:00.000Z")).toBe(true);
    expect(shouldReconcileArchiveSchedule("2026-09-13", "2026-09-13", "scheduled", "2026-09-16T12:00:00.000Z")).toBe(false);
    expect(shouldReconcileArchiveSchedule("2026-09-13", null, "scheduled", "2026-09-16T12:00:00.000Z")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { decideArchiveReconciliation } from "./archive-reconciliation";

describe("daily campaign archive reconciliation", () => {
  const now = new Date("2026-09-08T01:10:00.000Z");

  it("restores a missing future archive schedule", () => {
    expect(
      decideArchiveReconciliation({
        eventEndDate: "2026-09-10",
        archiveStatus: "not_scheduled",
        hasArchiveTask: false,
        now,
      })
    ).toBe("schedule");
  });

  it("does not replace an existing future archive schedule", () => {
    expect(
      decideArchiveReconciliation({
        eventEndDate: "2026-09-10",
        archiveStatus: "scheduled",
        hasArchiveTask: true,
        now,
      })
    ).toBe("skip");
  });

  it("flags an overdue unregistered campaign for the separate approved catch-up list", () => {
    expect(
      decideArchiveReconciliation({
        eventEndDate: "2026-08-31",
        archiveStatus: "not_scheduled",
        hasArchiveTask: false,
        now,
      })
    ).toBe("manual_catchup");
  });

  it("never reschedules archived or cancelled campaigns", () => {
    expect(
      decideArchiveReconciliation({
        eventEndDate: "2026-09-10",
        archiveStatus: "archived",
        hasArchiveTask: false,
        now,
      })
    ).toBe("skip");
    expect(
      decideArchiveReconciliation({
        eventEndDate: "2026-09-10",
        archiveStatus: "cancelled",
        hasArchiveTask: false,
        now,
      })
    ).toBe("skip");
  });
});

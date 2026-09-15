import { describe, expect, it } from "vitest";
import { buildArchiveControlResultMessage, buildPendingArchiveControlMessage, buildSuperAdminCanvas, SUPER_ADMIN_KEEP_OPEN_ACTION } from "./super-admin";

const pendingCampaign = {
  id: 41,
  productionName: "2610 Sample Dealer AME",
  channelName: "2610-sample-dealer-ame",
  channelId: "C-sample",
  canvasId: null,
  dealershipRecordId: null,
  dealershipName: "Sample Dealer",
  eventEndDate: "2026-10-01",
  archiveAfter: new Date("2026-10-04T12:00:00.000Z"),
  archiveTaskUid: "task-sample",
  warningTaskUid: "warning-sample",
  archiveStatus: "scheduled" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Super Admin control content", () => {
  it("keeps the Canvas instructional and limits its first live control to archive holds", () => {
    const canvas = buildSuperAdminCanvas();
    expect(canvas).toContain("# ADO Super Admin");
    expect(canvas).toContain("Keep Open");
    expect(canvas).toContain("ABC Test only");
    expect(canvas).toContain("does not change GoHighLevel workflows");
    expect(canvas).not.toContain("API key");
  });

  it("builds one Keep Open button with only the related campaign ID", () => {
    const control = buildPendingArchiveControlMessage(pendingCampaign);
    expect(control.text).toContain("2610-sample-dealer-ame");
    expect(JSON.stringify(control.blocks)).toContain(SUPER_ADMIN_KEEP_OPEN_ACTION);
    expect(JSON.stringify(control.blocks)).toContain('"value":"41"');
  });

  it("removes the action button after a channel is kept open", () => {
    const resolved = buildArchiveControlResultMessage(pendingCampaign, "kept_open");
    expect(resolved.text).toContain("will remain open");
    expect(JSON.stringify(resolved.blocks)).not.toContain(SUPER_ADMIN_KEEP_OPEN_ACTION);
  });
});

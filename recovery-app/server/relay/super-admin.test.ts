import { describe, expect, it } from "vitest";
import {
  buildArchiveManagerLauncherMessage,
  buildCanvasRepairLauncherMessage,
  buildSuperAdminCanvas,
  SUPER_ADMIN_MANAGE_ARCHIVES_ACTION,
  SUPER_ADMIN_REPAIR_CANVAS_ACTION,
} from "./super-admin";

const pendingCampaign = {
  id: 41,
  productionName: "2610 Sample Dealer AME",
  channelName: "2610-sample-dealer-ame",
  channelId: "C-sample",
  canvasId: "F-sample",
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

describe("Super Admin Canvas content", () => {
  it("keeps the current pending archive list in the Canvas and does not expose protected settings", () => {
    const canvas = buildSuperAdminCanvas([pendingCampaign]);
    expect(canvas).toContain("# ADO Super Admin");
    expect(canvas).toContain("Pending campaign-channel archives");
    expect(canvas).toContain("2610-sample-dealer-ame");
    expect(canvas).toContain("Manage Pending Archives");
    expect(canvas).toContain("All automation testing happens in ABC Test only");
    expect(canvas).not.toContain("API key");
  });

  it("uses one permanent archive-manager button rather than a Keep Open card for every campaign", () => {
    const launcher = buildArchiveManagerLauncherMessage();
    expect(launcher.text).toContain("Manage the current campaign channels");
    expect(JSON.stringify(launcher.blocks)).toContain(SUPER_ADMIN_MANAGE_ARCHIVES_ACTION);
    expect(JSON.stringify(launcher.blocks)).not.toContain('"value":"41"');
  });

  it("states that the Canvas refresh edits only an existing saved Canvas", () => {
    const launcher = buildCanvasRepairLauncherMessage();
    expect(launcher.text).toContain("without creating a new Canvas");
    expect(JSON.stringify(launcher.blocks)).toContain(SUPER_ADMIN_REPAIR_CANVAS_ACTION);
    expect(JSON.stringify(launcher.blocks)).toContain("cannot create or relink a Canvas");
  });
});

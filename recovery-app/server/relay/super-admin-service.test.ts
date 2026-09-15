import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveSuperAdminChannel: vi.fn(),
  getCampaignById: vi.fn(),
  getSuperAdminArchiveControl: vi.fn(),
  claimPendingSuperAdminArchiveControl: vi.fn(),
  updateSuperAdminArchiveControlStatus: vi.fn(),
  logRelayAction: vi.fn(),
  cancelScheduledCampaignArchive: vi.fn(),
  updateSlackMessage: vi.fn(),
}));

vi.mock("./db", () => ({
  getActiveSuperAdminChannel: mocks.getActiveSuperAdminChannel,
  getCampaignById: mocks.getCampaignById,
  getSuperAdminArchiveControl: mocks.getSuperAdminArchiveControl,
  claimPendingSuperAdminArchiveControl: mocks.claimPendingSuperAdminArchiveControl,
  updateSuperAdminArchiveControlStatus: mocks.updateSuperAdminArchiveControlStatus,
  logRelayAction: mocks.logRelayAction,
  listPendingCampaignArchives: vi.fn(),
  saveSuperAdminArchiveControl: vi.fn(),
  saveSuperAdminChannel: vi.fn(),
  updateSuperAdminCanvasId: vi.fn(),
}));
vi.mock("./archive-jobs", () => ({ cancelScheduledCampaignArchive: mocks.cancelScheduledCampaignArchive }));
vi.mock("./slack", () => ({
  createOrUpdateSuperAdminCanvas: vi.fn(),
  getSlackChannelInfo: vi.fn(),
  postSlackBlocks: vi.fn(),
  updateSlackMessage: mocks.updateSlackMessage,
}));

import { keepOneCampaignChannelOpen } from "./super-admin";

const campaign = {
  id: 42,
  productionName: "2610 Sample Dealer AME",
  channelName: "2610-sample-dealer-ame",
  channelId: "C-campaign",
  canvasId: null,
  dealershipRecordId: null,
  dealershipName: "Sample Dealer",
  eventEndDate: "2026-10-01",
  archiveAfter: new Date("2026-10-04T12:00:00.000Z"),
  archiveTaskUid: "archive-task",
  warningTaskUid: "warning-task",
  archiveStatus: "scheduled" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Super Admin Keep Open service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveSuperAdminChannel.mockResolvedValue({ channelId: "C-super-admin", channelName: "super-admin", canvasId: "F1" });
    mocks.getCampaignById.mockResolvedValue(campaign);
    mocks.getSuperAdminArchiveControl.mockResolvedValue({ campaignId: 42, superAdminChannelId: "C-super-admin", slackMessageTs: "123.456", status: "pending" });
    mocks.claimPendingSuperAdminArchiveControl.mockResolvedValue(true);
    mocks.cancelScheduledCampaignArchive.mockResolvedValue(undefined);
    mocks.updateSuperAdminArchiveControlStatus.mockResolvedValue(undefined);
    mocks.updateSlackMessage.mockResolvedValue(undefined);
    mocks.logRelayAction.mockResolvedValue(undefined);
  });

  it("rejects a signed click that did not originate in the saved private Super Admin channel", async () => {
    await expect(keepOneCampaignChannelOpen({ superAdminChannelId: "C-other", campaignId: 42, messageTs: "123.456" })).resolves.toBe("not_allowed");
    expect(mocks.cancelScheduledCampaignArchive).not.toHaveBeenCalled();
    expect(mocks.claimPendingSuperAdminArchiveControl).not.toHaveBeenCalled();
  });

  it("cancels only the exact pending archive after the campaign, message, channel, and one-click claim all match", async () => {
    await expect(keepOneCampaignChannelOpen({ superAdminChannelId: "C-super-admin", campaignId: 42, messageTs: "123.456" })).resolves.toBe("kept_open");
    expect(mocks.claimPendingSuperAdminArchiveControl).toHaveBeenCalledWith({ campaignId: 42, superAdminChannelId: "C-super-admin" });
    expect(mocks.cancelScheduledCampaignArchive).toHaveBeenCalledWith(campaign);
    expect(mocks.updateSuperAdminArchiveControlStatus).toHaveBeenCalledWith(42, "kept_open");
    expect(mocks.updateSlackMessage).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the button is no longer tied to the saved bot message", async () => {
    await expect(keepOneCampaignChannelOpen({ superAdminChannelId: "C-super-admin", campaignId: 42, messageTs: "changed" })).resolves.toBe("already_handled");
    expect(mocks.cancelScheduledCampaignArchive).not.toHaveBeenCalled();
  });
});

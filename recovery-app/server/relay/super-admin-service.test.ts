import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveSuperAdminChannel: vi.fn(),
  getCampaignById: vi.fn(),
  getSuperAdminArchiveControl: vi.fn(),
  listSuperAdminCanvasRepairCandidates: vi.fn(),
  claimPendingSuperAdminArchiveControl: vi.fn(),
  updateSuperAdminArchiveControlStatus: vi.fn(),
  logRelayAction: vi.fn(),
  cancelScheduledCampaignArchive: vi.fn(),
  updateSlackMessage: vi.fn(),
  getSlackChannelInfo: vi.fn(),
  hasMatchingSlackChannelCanvas: vi.fn(),
  openProductionCanvasRepairModal: vi.fn(),
  postSlackMessage: vi.fn(),
  refreshProductionCanvas: vi.fn(),
}));

vi.mock("./db", () => ({
  getActiveSuperAdminChannel: mocks.getActiveSuperAdminChannel,
  getCampaignById: mocks.getCampaignById,
  getSuperAdminArchiveControl: mocks.getSuperAdminArchiveControl,
  listSuperAdminCanvasRepairCandidates: mocks.listSuperAdminCanvasRepairCandidates,
  claimPendingSuperAdminArchiveControl: mocks.claimPendingSuperAdminArchiveControl,
  updateSuperAdminArchiveControlStatus: mocks.updateSuperAdminArchiveControlStatus,
  logRelayAction: mocks.logRelayAction,
  listPendingCampaignArchives: vi.fn(),
  saveSuperAdminArchiveControl: vi.fn(),
  saveSuperAdminChannel: vi.fn(),
  updateSuperAdminCanvasId: vi.fn(),
  updateSuperAdminCanvasRepairMessageTs: vi.fn(),
}));
vi.mock("./archive-jobs", () => ({ cancelScheduledCampaignArchive: mocks.cancelScheduledCampaignArchive }));
vi.mock("./slack", () => ({
  createOrUpdateSuperAdminCanvas: vi.fn(),
  getSlackChannelInfo: mocks.getSlackChannelInfo,
  hasMatchingSlackChannelCanvas: mocks.hasMatchingSlackChannelCanvas,
  openProductionCanvasRepairModal: mocks.openProductionCanvasRepairModal,
  postSlackBlocks: vi.fn(),
  postSlackMessage: mocks.postSlackMessage,
  updateSlackMessage: mocks.updateSlackMessage,
}));
vi.mock("./workflows", () => ({ refreshProductionCanvas: mocks.refreshProductionCanvas }));

import { keepOneCampaignChannelOpen, openCanvasRepairPicker, repairOneProductionCanvas } from "./super-admin";

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
    mocks.listSuperAdminCanvasRepairCandidates.mockResolvedValue([{ id: 42, productionName: campaign.productionName, channelName: campaign.channelName, channelId: campaign.channelId, canvasId: campaign.canvasId }]);
    mocks.hasMatchingSlackChannelCanvas.mockResolvedValue(false);
    mocks.openProductionCanvasRepairModal.mockResolvedValue(undefined);
    mocks.refreshProductionCanvas.mockResolvedValue(campaign);
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

describe("Super Admin Production Canvas repair service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveSuperAdminChannel.mockResolvedValue({ channelId: "C-super-admin", channelName: "super-admin", canvasId: "F1" });
    mocks.getCampaignById.mockResolvedValue(campaign);
    mocks.getSlackChannelInfo.mockResolvedValue({ id: "C-campaign", name: campaign.channelName, is_private: false });
    mocks.listSuperAdminCanvasRepairCandidates.mockResolvedValue([{ id: 42, productionName: campaign.productionName, channelName: campaign.channelName, channelId: campaign.channelId, canvasId: campaign.canvasId }]);
    mocks.hasMatchingSlackChannelCanvas.mockResolvedValue(false);
    mocks.openProductionCanvasRepairModal.mockResolvedValue(undefined);
    mocks.refreshProductionCanvas.mockResolvedValue(campaign);
    mocks.logRelayAction.mockResolvedValue(undefined);
  });

  it("opens the picker only from the saved private Super Admin channel", async () => {
    await expect(openCanvasRepairPicker({ superAdminChannelId: "C-super-admin", triggerId: "trigger" })).resolves.toBe("opened");
    expect(mocks.openProductionCanvasRepairModal).toHaveBeenCalledWith(expect.objectContaining({
      triggerId: "trigger",
      superAdminChannelId: "C-super-admin",
      candidates: expect.arrayContaining([expect.objectContaining({ id: 42 })]),
    }));
    await expect(openCanvasRepairPicker({ superAdminChannelId: "C-other", triggerId: "trigger" })).resolves.toBe("not_allowed");
  });

  it("leaves an already attached selected Canvas alone", async () => {
    mocks.hasMatchingSlackChannelCanvas.mockResolvedValue(true);
    await expect(repairOneProductionCanvas({ superAdminChannelId: "C-super-admin", campaignId: 42 })).resolves.toBe("already_current");
    expect(mocks.refreshProductionCanvas).not.toHaveBeenCalled();
  });

  it("refreshes only the selected campaign after confirming its Canvas is detached", async () => {
    await expect(repairOneProductionCanvas({ superAdminChannelId: "C-super-admin", campaignId: 42 })).resolves.toBe("repaired");
    expect(mocks.refreshProductionCanvas).toHaveBeenCalledWith({ production_name: campaign.productionName, channel_name: campaign.channelName });
    expect(mocks.logRelayAction).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 42, action: "super_admin_repair_production_canvas", outcome: "success" }));
  });

  it("rejects a campaign whose saved channel name no longer matches Slack", async () => {
    mocks.getSlackChannelInfo.mockResolvedValue({ id: "C-campaign", name: "renamed-channel", is_private: false });
    await expect(repairOneProductionCanvas({ superAdminChannelId: "C-super-admin", campaignId: 42 })).resolves.toBe("channel_link_needs_refresh");
    expect(mocks.refreshProductionCanvas).not.toHaveBeenCalled();
  });
});

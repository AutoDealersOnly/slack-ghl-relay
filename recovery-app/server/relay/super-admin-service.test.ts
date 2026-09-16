import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveSuperAdminChannel: vi.fn(),
  getCampaignById: vi.fn(),
  getCampaignByChannelName: vi.fn(),
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
  refreshKnownProductionCanvasOnly: vi.fn(),
}));

vi.mock("./db", () => ({
  getActiveSuperAdminChannel: mocks.getActiveSuperAdminChannel,
  getCampaignById: mocks.getCampaignById,
  getCampaignByChannelName: mocks.getCampaignByChannelName,
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
vi.mock("./workflows", () => ({
  refreshProductionCanvas: mocks.refreshProductionCanvas,
  refreshKnownProductionCanvasOnly: mocks.refreshKnownProductionCanvasOnly,
}));

import {
  ABC_TEST_CHANNEL_NAME,
  keepOneCampaignChannelOpen,
  openCanvasRepairPicker,
  refreshAbcTestProductionCanvas,
  repairOneProductionCanvas,
} from "./super-admin";

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
  mocks.getCampaignByChannelName.mockResolvedValue({ ...campaign, channelName: ABC_TEST_CHANNEL_NAME, canvasId: "F-abc" });
  mocks.refreshKnownProductionCanvasOnly.mockResolvedValue("refreshed");
});

describe("Super Admin Keep Open service", () => {
  it("rejects a click outside the saved private Super Admin channel", async () => {
    await expect(keepOneCampaignChannelOpen({ superAdminChannelId: "C-other", campaignId: 42, messageTs: "123.456" })).resolves.toBe("not_allowed");
    expect(mocks.cancelScheduledCampaignArchive).not.toHaveBeenCalled();
  });

  it("cancels only the exact pending archive after its saved message and one-click claim match", async () => {
    await expect(keepOneCampaignChannelOpen({ superAdminChannelId: "C-super-admin", campaignId: 42, messageTs: "123.456" })).resolves.toBe("kept_open");
    expect(mocks.cancelScheduledCampaignArchive).toHaveBeenCalledWith(campaign);
    expect(mocks.updateSuperAdminArchiveControlStatus).toHaveBeenCalledWith(42, "kept_open");
  });
});

describe("Super Admin Production Canvas repair service", () => {
  it("keeps the old generic repair launcher disabled before it can open a picker", async () => {
    await expect(openCanvasRepairPicker({ superAdminChannelId: "C-super-admin", triggerId: "trigger" })).resolves.toBe("not_allowed");
    expect(mocks.openProductionCanvasRepairModal).not.toHaveBeenCalled();
  });

  it("keeps the old generic repair disabled before reading or changing an active campaign", async () => {
    await expect(repairOneProductionCanvas({ superAdminChannelId: "C-super-admin", campaignId: 42 })).resolves.toBe("not_allowed");
    expect(mocks.getCampaignById).not.toHaveBeenCalled();
    expect(mocks.refreshProductionCanvas).not.toHaveBeenCalled();
  });

  it("refreshes only ABC Test's saved Canvas without a create or relink path", async () => {
    await expect(refreshAbcTestProductionCanvas({ superAdminChannelId: "C-super-admin" })).resolves.toBe("refreshed");
    expect(mocks.getCampaignByChannelName).toHaveBeenCalledWith(ABC_TEST_CHANNEL_NAME);
    expect(mocks.refreshKnownProductionCanvasOnly).toHaveBeenCalledWith({
      production_name: campaign.productionName,
      channel_name: ABC_TEST_CHANNEL_NAME,
    });
    expect(mocks.refreshProductionCanvas).not.toHaveBeenCalled();
  });

  it("rejects ABC Test refresh outside the saved private Super Admin channel before reading a campaign", async () => {
    await expect(refreshAbcTestProductionCanvas({ superAdminChannelId: "C-other" })).resolves.toBe("not_allowed");
    expect(mocks.getCampaignByChannelName).not.toHaveBeenCalled();
    expect(mocks.refreshKnownProductionCanvasOnly).not.toHaveBeenCalled();
  });
});

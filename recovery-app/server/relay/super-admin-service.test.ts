import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveSuperAdminChannel: vi.fn(),
  getCampaignById: vi.fn(),
  getSuperAdminArchiveControl: vi.fn(),
  listPendingCampaignArchives: vi.fn(),
  listSuperAdminArchiveControls: vi.fn(),
  listSuperAdminCanvasRepairCandidates: vi.fn(),
  claimPendingSuperAdminArchiveControl: vi.fn(),
  updateSuperAdminArchiveControlStatus: vi.fn(),
  updateSuperAdminArchiveManagerMessageTs: vi.fn(),
  updateSuperAdminCanvasId: vi.fn(),
  updateSuperAdminCanvasRepairMessageTs: vi.fn(),
  saveSuperAdminArchiveControl: vi.fn(),
  logRelayAction: vi.fn(),
  cancelScheduledCampaignArchive: vi.fn(),
  createOrUpdateSuperAdminCanvas: vi.fn(),
  deleteSlackMessage: vi.fn(),
  openPendingArchiveManagerModal: vi.fn(),
  openProductionCanvasRepairModal: vi.fn(),
  postSlackBlocks: vi.fn(),
  postSlackMessage: vi.fn(),
  updateSlackMessage: vi.fn(),
  refreshKnownProductionCanvasOnly: vi.fn(),
}));

vi.mock("./db", () => ({
  getActiveSuperAdminChannel: mocks.getActiveSuperAdminChannel,
  getCampaignById: mocks.getCampaignById,
  getSuperAdminArchiveControl: mocks.getSuperAdminArchiveControl,
  listPendingCampaignArchives: mocks.listPendingCampaignArchives,
  listSuperAdminArchiveControls: mocks.listSuperAdminArchiveControls,
  listSuperAdminCanvasRepairCandidates: mocks.listSuperAdminCanvasRepairCandidates,
  claimPendingSuperAdminArchiveControl: mocks.claimPendingSuperAdminArchiveControl,
  updateSuperAdminArchiveControlStatus: mocks.updateSuperAdminArchiveControlStatus,
  updateSuperAdminArchiveManagerMessageTs: mocks.updateSuperAdminArchiveManagerMessageTs,
  updateSuperAdminCanvasId: mocks.updateSuperAdminCanvasId,
  updateSuperAdminCanvasRepairMessageTs: mocks.updateSuperAdminCanvasRepairMessageTs,
  saveSuperAdminArchiveControl: mocks.saveSuperAdminArchiveControl,
  saveSuperAdminChannel: vi.fn(),
  logRelayAction: mocks.logRelayAction,
}));
vi.mock("./archive-jobs", () => ({ cancelScheduledCampaignArchive: mocks.cancelScheduledCampaignArchive }));
vi.mock("./slack", () => ({
  createOrUpdateSuperAdminCanvas: mocks.createOrUpdateSuperAdminCanvas,
  deleteSlackMessage: mocks.deleteSlackMessage,
  findSlackChannelByName: vi.fn(),
  getSlackChannelInfo: vi.fn(),
  openPendingArchiveManagerModal: mocks.openPendingArchiveManagerModal,
  openProductionCanvasRepairModal: mocks.openProductionCanvasRepairModal,
  postSlackBlocks: mocks.postSlackBlocks,
  postSlackMessage: mocks.postSlackMessage,
  updateSlackMessage: mocks.updateSlackMessage,
}));
vi.mock("./workflows", () => ({ refreshKnownProductionCanvasOnly: mocks.refreshKnownProductionCanvasOnly }));

import {
  keepOneCampaignChannelOpen,
  openCanvasRepairPicker,
  openPendingArchiveManager,
  repairOneProductionCanvas,
  syncSuperAdminArchiveDashboard,
} from "./super-admin";

const campaign = {
  id: 42,
  productionName: "2610 Sample Dealer AME",
  channelName: "2610-sample-dealer-ame",
  channelId: "C-campaign",
  canvasId: "F-campaign",
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
  mocks.getActiveSuperAdminChannel.mockResolvedValue({
    channelId: "C-super-admin",
    channelName: "super-admin",
    canvasId: "F-super-admin",
    canvasRepairMessageTs: "100.001",
    archiveManagerMessageTs: "100.002",
  });
  mocks.getCampaignById.mockResolvedValue(campaign);
  mocks.getSuperAdminArchiveControl.mockResolvedValue({ campaignId: 42, superAdminChannelId: "C-super-admin", slackMessageTs: "100.002", status: "pending" });
  mocks.listPendingCampaignArchives.mockResolvedValue([campaign]);
  mocks.listSuperAdminArchiveControls.mockResolvedValue([]);
  mocks.listSuperAdminCanvasRepairCandidates.mockResolvedValue([campaign]);
  mocks.claimPendingSuperAdminArchiveControl.mockResolvedValue(true);
  mocks.cancelScheduledCampaignArchive.mockResolvedValue(undefined);
  mocks.updateSuperAdminArchiveControlStatus.mockResolvedValue(undefined);
  mocks.updateSuperAdminArchiveManagerMessageTs.mockResolvedValue(undefined);
  mocks.updateSuperAdminCanvasId.mockResolvedValue(undefined);
  mocks.updateSuperAdminCanvasRepairMessageTs.mockResolvedValue(undefined);
  mocks.saveSuperAdminArchiveControl.mockResolvedValue(undefined);
  mocks.logRelayAction.mockResolvedValue(undefined);
  mocks.createOrUpdateSuperAdminCanvas.mockResolvedValue("F-super-admin");
  mocks.deleteSlackMessage.mockResolvedValue(undefined);
  mocks.openPendingArchiveManagerModal.mockResolvedValue(undefined);
  mocks.openProductionCanvasRepairModal.mockResolvedValue(undefined);
  mocks.postSlackBlocks.mockResolvedValue({ channel: "C-super-admin", ts: "100.003" });
  mocks.postSlackMessage.mockResolvedValue(undefined);
  mocks.updateSlackMessage.mockResolvedValue(undefined);
  mocks.refreshKnownProductionCanvasOnly.mockResolvedValue("refreshed");
});

describe("Super Admin archive manager", () => {
  it("opens one current-state picker only from the saved private channel", async () => {
    await expect(openPendingArchiveManager({ superAdminChannelId: "C-super-admin", triggerId: "trigger" })).resolves.toBe("opened");
    expect(mocks.openPendingArchiveManagerModal).toHaveBeenCalledWith({
      triggerId: "trigger",
      superAdminChannelId: "C-super-admin",
      candidates: [{ id: campaign.id, productionName: campaign.productionName, channelName: campaign.channelName }],
    });
  });

  it("cancels only the exact selected pending archive and refreshes the Canvas list", async () => {
    await expect(keepOneCampaignChannelOpen({ superAdminChannelId: "C-super-admin", campaignId: 42 })).resolves.toBe("kept_open");
    expect(mocks.cancelScheduledCampaignArchive).toHaveBeenCalledWith(campaign);
    expect(mocks.updateSuperAdminArchiveControlStatus).toHaveBeenCalledWith(42, "kept_open");
    expect(mocks.createOrUpdateSuperAdminCanvas).toHaveBeenCalled();
  });

  it("does not open the archive manager outside the private Super Admin channel", async () => {
    await expect(openPendingArchiveManager({ superAdminChannelId: "C-other", triggerId: "trigger" })).resolves.toBe("not_allowed");
    expect(mocks.openPendingArchiveManagerModal).not.toHaveBeenCalled();
  });
});

describe("Super Admin direct Production Canvas refresh", () => {
  it("opens a picker of campaigns with a saved Canvas link from the private Super Admin channel", async () => {
    await expect(openCanvasRepairPicker({ superAdminChannelId: "C-super-admin", triggerId: "trigger" })).resolves.toBe("opened");
    expect(mocks.openProductionCanvasRepairModal).toHaveBeenCalledWith({
      triggerId: "trigger",
      superAdminChannelId: "C-super-admin",
      candidates: [campaign],
    });
  });

  it("refreshes only the selected saved Canvas and never calls a Canvas creation helper", async () => {
    await expect(repairOneProductionCanvas({ superAdminChannelId: "C-super-admin", campaignId: 42 })).resolves.toBe("repaired");
    expect(mocks.refreshKnownProductionCanvasOnly).toHaveBeenCalledWith({
      production_name: campaign.productionName,
      channel_name: campaign.channelName,
    });
    expect(mocks.createOrUpdateSuperAdminCanvas).not.toHaveBeenCalled();
  });

  it("stops without a Slack update if the selected campaign has no saved Canvas link", async () => {
    mocks.getCampaignById.mockResolvedValue({ ...campaign, canvasId: null });
    await expect(repairOneProductionCanvas({ superAdminChannelId: "C-super-admin", campaignId: 42 })).resolves.toBe("canvas_link_missing");
    expect(mocks.refreshKnownProductionCanvasOnly).not.toHaveBeenCalled();
  });
});

describe("Super Admin Canvas dashboard", () => {
  it("writes the current pending archive list into the private Canvas and updates only the two permanent launcher messages", async () => {
    await syncSuperAdminArchiveDashboard();
    expect(mocks.createOrUpdateSuperAdminCanvas).toHaveBeenCalledWith("C-super-admin", expect.stringContaining(campaign.channelName), "F-super-admin");
    expect(mocks.updateSlackMessage).toHaveBeenCalledTimes(2);
    expect(mocks.postSlackBlocks).not.toHaveBeenCalled();
  });
});

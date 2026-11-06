import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DealershipProperties, GhlCustomObjectRecord, ProductionProperties } from "./types";
import type { SlackChannelFile } from "./slack";

const mocks = vi.hoisted(() => ({
  createWebhookReceipt: vi.fn(),
  finishWebhookReceipt: vi.fn(),
  getCampaignByChannelName: vi.fn(),
  claimMailpieceImageUpload: vi.fn(),
  finishMailpieceImageUpload: vi.fn(),
  logRelayAction: vi.fn(),
  fetchProductionRecord: vi.fn(),
  fetchDealership: vi.fn(),
  uploadDealershipMediaImage: vi.fn(),
  syncRequiredCustomValues: vi.fn(),
  getCurrentChannelMailpiecePdfs: vi.fn(),
  downloadSlackPdf: vi.fn(),
  postSlackMessage: vi.fn(),
  getPdfPageCount: vi.fn(),
  renderPdfPagesToJpegs: vi.fn(),
  enqueueCampaignMailpieceImageJob: vi.fn(),
}));

// Keep the actual router -> legacy receipt -> proof notice -> mailpiece pipeline.
// Only persistence, provider I/O, native PDF work, and scheduling are replaced.
vi.mock("./db", () => ({
  createWebhookReceipt: mocks.createWebhookReceipt,
  finishWebhookReceipt: mocks.finishWebhookReceipt,
  getCampaignByChannelName: mocks.getCampaignByChannelName,
  claimMailpieceImageUpload: mocks.claimMailpieceImageUpload,
  finishMailpieceImageUpload: mocks.finishMailpieceImageUpload,
  logRelayAction: mocks.logRelayAction,
  claimProofPdfAttachment: vi.fn(),
  finishProofPdfAttachment: vi.fn(),
  upsertCampaign: vi.fn(),
}));
vi.mock("./ghl", async importOriginal => ({
  ...await importOriginal<typeof import("./ghl")>(),
  fetchProductionRecord: mocks.fetchProductionRecord,
  fetchDealership: mocks.fetchDealership,
  uploadDealershipMediaImage: mocks.uploadDealershipMediaImage,
  syncRequiredCustomValues: mocks.syncRequiredCustomValues,
}));
vi.mock("./slack", async importOriginal => ({
  ...await importOriginal<typeof import("./slack")>(),
  getCurrentChannelMailpiecePdfs: mocks.getCurrentChannelMailpiecePdfs,
  downloadSlackPdf: mocks.downloadSlackPdf,
  postSlackMessage: mocks.postSlackMessage,
}));
vi.mock("./pdf-to-jpeg", async importOriginal => ({
  ...await importOriginal<typeof import("./pdf-to-jpeg")>(),
  getPdfPageCount: mocks.getPdfPageCount,
  renderPdfPagesToJpegs: mocks.renderPdfPagesToJpegs,
}));
vi.mock("./scheduling", () => ({
  enqueueCampaignMailpieceImageJob: mocks.enqueueCampaignMailpieceImageJob,
  cancelCampaignArchive: vi.fn(),
  rescheduleCampaignArchive: vi.fn(),
  scheduleCampaignArchive: vi.fn(),
  shouldReconcileArchiveSchedule: vi.fn(),
  shouldRescheduleArchive: vi.fn(),
}));

import { relayRouter } from "./routes";
import { RELAY_SETTING_KEYS } from "./config";
import { selectCurrentChannelMailpiecePdfs } from "./slack";
import { buildBdcMailpieceImagesUpdatedMessage } from "./mailpiece-images";

const campaign = {
  id: 42,
  productionName: "2609 ABC Test AME",
  channelName: "2609-abc-test-ame",
  channelId: "ABC-channel",
  dealershipRecordId: "ABC-dealership",
};
const dealership: GhlCustomObjectRecord<DealershipProperties> = {
  id: "ABC-dealership",
  properties: {
    dealership_name: "ABC Dealer",
    loc_id: "ABC-location",
    api_key: "ABC-test-only-not-a-credential",
  },
};
const pdfBytes = new Uint8Array([65, 66, 67]);
const jpegBytes = new Uint8Array([65, 66, 67, 1]);
const confirmationText = buildBdcMailpieceImagesUpdatedMessage("ABC Dealer");
const file = (id: string, name: string, created: number): SlackChannelFile => ({
  id,
  name,
  created,
  channels: [campaign.channelId],
  filetype: "pdf",
  url_private_download: `https://example.test/ABC/${id}.pdf`,
});

type ProductionFixture = GhlCustomObjectRecord<ProductionProperties> & { updatedAt: string };
type ImageState = { status: "processing" | "uploaded" | "failed"; mediaUrl?: string };
let production: ProductionFixture;
let channelFiles: SlackChannelFile[];
let steps: string[];
let receipts: Map<string, "processing" | "processed" | "failed">;
let images: Map<string, ImageState>;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(release => { resolve = release; });
  return { promise, resolve };
}

function imageKey(input: { campaignId: number; slackFileId: string; pageNumber: number }) {
  return `${input.campaignId}:${input.slackFileId}:${input.pageNumber}`;
}

// Invoke the handler registered on the actual Express router without opening a
// socket or replacing either the legacy handler or any workflow helper.
function deliver(body: Record<string, unknown>) {
  const layer = relayRouter.stack.find(layer => layer.route?.path === "/ghl/:eventType");
  if (!layer?.route) throw new Error("Expected the actual GHL relay route");
  const handler = layer.route.stack[0].handle as (
    req: Request, res: Response, next: NextFunction
  ) => unknown;
  const req = {
    body,
    params: { eventType: "proof_status" },
    header: vi.fn(() => undefined),
  } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn(() => { steps.push("response"); }),
    json: vi.fn(() => { steps.push("json-response"); }),
  };
  const next = vi.fn();
  const finished = Promise.resolve(handler(req, res as unknown as Response, next));
  return { res, next, finished };
}

function expectNoResponse(delivery: ReturnType<typeof deliver>) {
  expect(delivery.res.status).not.toHaveBeenCalled();
  expect(delivery.res.send).not.toHaveBeenCalled();
  expect(delivery.res.json).not.toHaveBeenCalled();
}

function expectOk(delivery: ReturnType<typeof deliver>) {
  expect(delivery.res.status).toHaveBeenCalledOnce();
  expect(delivery.res.status).toHaveBeenCalledWith(200);
  expect(delivery.res.send).toHaveBeenCalledOnce();
  expect(delivery.res.send).toHaveBeenCalledWith("ok");
  expect(delivery.res.json).not.toHaveBeenCalled();
  expect(delivery.next).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  // Never read real provider settings or permit an accidental live fetch.
  for (const key of RELAY_SETTING_KEYS) vi.stubEnv(key, "");
  vi.stubEnv("SLACK_PROOF_SENT_TO_PRINT_USER_ID", "ABC-print-user");
  vi.stubEnv("SLACK_PROOF_APPROVED_USER_ID", "ABC-approved-user");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected live call in ABC route test"); }));
  steps = [];
  receipts = new Map();
  images = new Map();
  production = {
    id: "ABC-production",
    updatedAt: "2026-09-09T12:00:00.000Z",
    properties: { production: campaign.productionName, proof_stage: "sent_to_print" },
    relations: [{ objectKey: "custom_objects.dealerships", recordId: dealership.id! }],
  };
  channelFiles = [file("ABC-print-file", "ABC-mailer.pdf", 100)];

  mocks.fetchProductionRecord.mockImplementation(async () => production);
  mocks.fetchDealership.mockResolvedValue(dealership);
  mocks.getCampaignByChannelName.mockResolvedValue(campaign);
  mocks.createWebhookReceipt.mockImplementation(async ({ deliveryKey }) => {
    if (receipts.has(deliveryKey)) return { accepted: false };
    receipts.set(deliveryKey, "processing");
    steps.push("receipt-claimed");
    return { accepted: true };
  });
  mocks.finishWebhookReceipt.mockImplementation(async (deliveryKey, status) => {
    receipts.set(deliveryKey, status);
    steps.push(`receipt-${status}`);
  });
  mocks.logRelayAction.mockImplementation(async ({ action, outcome }) => {
    steps.push(`${action}:${outcome}`);
  });
  mocks.getCurrentChannelMailpiecePdfs.mockImplementation(async channelId => {
    steps.push("file-list");
    return selectCurrentChannelMailpiecePdfs(channelId, channelFiles);
  });
  mocks.downloadSlackPdf.mockResolvedValue(pdfBytes);
  mocks.getPdfPageCount.mockResolvedValue(2);
  mocks.renderPdfPagesToJpegs.mockResolvedValue([jpegBytes]);
  mocks.claimMailpieceImageUpload.mockImplementation(async input => {
    const previous = images.get(imageKey(input));
    if (previous) return { claimed: false, mediaUrl: previous.mediaUrl ?? null };
    images.set(imageKey(input), { status: "processing" });
    return { claimed: true, mediaUrl: null };
  });
  mocks.finishMailpieceImageUpload.mockImplementation(async input => {
    images.set(imageKey(input), { status: input.status, mediaUrl: input.mediaUrl });
    steps.push(`image-${input.pageNumber}:${input.status}`);
  });
  mocks.uploadDealershipMediaImage.mockImplementation(async ({ fileName }) => {
    steps.push(`upload:${fileName}`);
    return `https://example.test/ABC/${fileName}`;
  });
  mocks.syncRequiredCustomValues.mockImplementation(async () => { steps.push("values-written"); });
  mocks.postSlackMessage.mockImplementation(async (_channelId, text) => {
    steps.push(text === confirmationText ? "confirmation" : "notice");
  });
  mocks.enqueueCampaignMailpieceImageJob.mockResolvedValue("scheduled");
});

afterEach(() => {
  expect(mocks.enqueueCampaignMailpieceImageJob).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("headerless Sent-to-Print direct relay route", () => {
  it("posts the notice first and withholds the response through uploads, values, confirmation, and receipt completion", async () => {
    const upload = deferred<string>();
    const values = deferred<void>();
    const confirmation = deferred<void>();
    const receipt = deferred<void>();
    mocks.uploadDealershipMediaImage.mockImplementationOnce(() => upload.promise);
    mocks.syncRequiredCustomValues.mockImplementationOnce(async () => {
      await values.promise;
      steps.push("values-written");
    });
    mocks.postSlackMessage.mockImplementation(async (_channelId, text) => {
      if (text === confirmationText) {
        await confirmation.promise;
        steps.push("confirmation");
      } else {
        steps.push("notice");
      }
    });
    mocks.finishWebhookReceipt.mockImplementationOnce(async (deliveryKey, status) => {
      await receipt.promise;
      receipts.set(deliveryKey, status);
      steps.push(`receipt-${status}`);
    });
    const delivery = deliver({ production_name: campaign.productionName, proof_stage: "sent_to_print" });

    try {
      await vi.waitFor(() => expect(mocks.uploadDealershipMediaImage).toHaveBeenCalledOnce());
      expectNoResponse(delivery);
      expect(steps).toEqual(["receipt-claimed", "notice", "proof_stage_notice:success", "file-list"]);
      expect(mocks.postSlackMessage).toHaveBeenCalledWith(
        campaign.channelId,
        "*📤 Sent to Print*\nUploaded to MBI 📤 <@ABC-print-user>"
      );
      expect(mocks.finishMailpieceImageUpload).not.toHaveBeenCalled();
      expect(mocks.syncRequiredCustomValues).not.toHaveBeenCalled();
      expect(mocks.finishWebhookReceipt).not.toHaveBeenCalled();
      expect(mocks.enqueueCampaignMailpieceImageJob).not.toHaveBeenCalled();

      upload.resolve("https://example.test/ABC/front.jpg");
      await vi.waitFor(() => expect(mocks.syncRequiredCustomValues).toHaveBeenCalledOnce());
      expectNoResponse(delivery);
      expect(mocks.uploadDealershipMediaImage).toHaveBeenCalledTimes(2);
      expect(mocks.finishMailpieceImageUpload).toHaveBeenCalledTimes(2);
      expect([...images.values()].map(image => image.status)).toEqual(["uploaded", "uploaded"]);
      expect(mocks.renderPdfPagesToJpegs.mock.calls).toEqual([[pdfBytes, [1]], [pdfBytes, [2]]]);
      expect(mocks.uploadDealershipMediaImage.mock.calls.map(([input]) => input)).toEqual([
        { locationId: "ABC-location", apiKey: dealership.properties.api_key, fileName: "ABC-mailer-page-1.jpg", bytes: jpegBytes },
        { locationId: "ABC-location", apiKey: dealership.properties.api_key, fileName: "ABC-mailer-page-2.jpg", bytes: jpegBytes },
      ]);
      expect(mocks.syncRequiredCustomValues).toHaveBeenCalledWith(
        "ABC-location", dealership.properties.api_key,
        { current_mailpiece_image: "https://example.test/ABC/front.jpg", current_mailpiece_image_back: "https://example.test/ABC/ABC-mailer-page-2.jpg" }
      );
      expect(mocks.postSlackMessage).toHaveBeenCalledOnce();
      expect(mocks.finishWebhookReceipt).not.toHaveBeenCalled();

      values.resolve();
      await vi.waitFor(() => expect(mocks.postSlackMessage).toHaveBeenCalledTimes(2));
      expectNoResponse(delivery);
      expect(mocks.postSlackMessage).toHaveBeenLastCalledWith(campaign.channelId, confirmationText);
      expect(mocks.finishWebhookReceipt).not.toHaveBeenCalled();

      confirmation.resolve();
      await vi.waitFor(() => expect(mocks.finishWebhookReceipt).toHaveBeenCalledOnce());
      expectNoResponse(delivery);
      expect([...receipts.values()]).toEqual(["processing"]);
      receipt.resolve();
      await vi.waitFor(() => expect(delivery.res.send).toHaveBeenCalledOnce());
      await delivery.finished;
      expectOk(delivery);
      expect([...receipts.values()]).toEqual(["processed"]);
      expect(steps.indexOf("notice")).toBeLessThan(steps.indexOf("file-list"));
      expect(steps.slice(-5)).toEqual([
        "values-written", "confirmation", "bdc_mailpiece_images:success", "receipt-processed", "response",
      ]);
    } finally {
      upload.resolve("https://example.test/ABC/front.jpg");
      values.resolve();
      confirmation.resolve();
      receipt.resolve();
      await delivery.finished;
      await vi.waitFor(() => expect([...receipts.values()]).not.toContain("processing"));
    }
  });

  it.each([undefined, "   "])("awaits a fresh Sent to Print record for a name-only or blank-stage payload (%s)", async proofStage => {
    production.properties.proof_stage = "Sent to Print";
    const lookup = deferred<ProductionFixture>();
    const upload = deferred<string>();
    mocks.fetchProductionRecord.mockImplementationOnce(() => lookup.promise);
    mocks.uploadDealershipMediaImage.mockImplementationOnce(() => upload.promise);
    const body = proofStage === undefined
      ? { production_name: campaign.productionName }
      : { production_name: campaign.productionName, proof_stage: proofStage };
    const delivery = deliver(body);
    try {
      expectNoResponse(delivery);
      expect(mocks.fetchProductionRecord).toHaveBeenCalledWith(campaign.channelName);
      expect(mocks.createWebhookReceipt).not.toHaveBeenCalled();
      lookup.resolve(production);
      await vi.waitFor(() => expect(mocks.uploadDealershipMediaImage).toHaveBeenCalledOnce());
      expectNoResponse(delivery);
      expect(mocks.postSlackMessage.mock.calls[0][1]).toContain("Sent to Print");
      expect(mocks.finishWebhookReceipt).not.toHaveBeenCalled();
      upload.resolve("https://example.test/ABC/front.jpg");
      await vi.waitFor(() => expect(delivery.res.send).toHaveBeenCalledOnce());
      await delivery.finished;
      expectOk(delivery);
      expect(mocks.fetchProductionRecord).toHaveBeenCalledTimes(2);
      expect(mocks.syncRequiredCustomValues).toHaveBeenCalledOnce();
    } finally {
      lookup.resolve(production);
      upload.resolve("https://example.test/ABC/front.jpg");
      await delivery.finished;
      await vi.waitFor(() => expect([...receipts.values()]).not.toContain("processing"));
    }
  });

  it("suppresses all additional notices, uploads, values, and confirmations for a same-version retry", async () => {
    const body = { production_name: campaign.productionName, proof_stage: "sent_to_print" };
    const first = deliver(body);
    await vi.waitFor(() => expect(first.res.send).toHaveBeenCalledOnce());
    await first.finished;
    expectOk(first);
    const key = mocks.createWebhookReceipt.mock.calls[0][0].deliveryKey;
    const retry = deliver(body);
    await vi.waitFor(() => expect(retry.res.send).toHaveBeenCalledOnce());
    await retry.finished;
    expectOk(retry);
    expect(mocks.createWebhookReceipt).toHaveBeenCalledTimes(2);
    expect(mocks.createWebhookReceipt.mock.calls[1][0].deliveryKey).toBe(key);
    expect(mocks.finishWebhookReceipt).toHaveBeenCalledOnce();
    expect(mocks.postSlackMessage).toHaveBeenCalledTimes(2);
    expect(mocks.getCurrentChannelMailpiecePdfs).toHaveBeenCalledOnce();
    expect(mocks.uploadDealershipMediaImage).toHaveBeenCalledTimes(2);
    expect(mocks.syncRequiredCustomValues).toHaveBeenCalledOnce();
  });

  it("permits a new record version to print the newest non-ENV file without reusing old artwork", async () => {
    const body = { production_name: campaign.productionName, proof_stage: "sent_to_print" };
    const first = deliver(body);
    await vi.waitFor(() => expect(first.res.send).toHaveBeenCalledOnce());
    await first.finished;
    production = { ...production, updatedAt: "2026-09-10T12:00:00.000Z" };
    channelFiles.push(file("ABC-new-print-file", "ABC-reprint.pdf", 200));
    channelFiles.push(file("ABC-envelope-file", "ABC-reprint-env.pdf", 300));
    const reprint = deliver(body);
    await vi.waitFor(() => expect(reprint.res.send).toHaveBeenCalledOnce());
    await reprint.finished;
    expectOk(reprint);
    expect(mocks.createWebhookReceipt.mock.calls[1][0].deliveryKey)
      .not.toBe(mocks.createWebhookReceipt.mock.calls[0][0].deliveryKey);
    expect(mocks.uploadDealershipMediaImage.mock.calls.map(([input]) => input.fileName)).toEqual([
      "ABC-mailer-page-1.jpg", "ABC-mailer-page-2.jpg", "ABC-reprint-page-1.jpg", "ABC-reprint-page-2.jpg",
    ]);
    expect(mocks.claimMailpieceImageUpload.mock.calls.slice(2).map(([input]) => input.slackFileId))
      .toEqual(["ABC-new-print-file", "ABC-new-print-file"]);
    expect(mocks.syncRequiredCustomValues).toHaveBeenCalledTimes(2);
    expect(mocks.postSlackMessage).toHaveBeenCalledTimes(4);
  });

  it("immediately acknowledges explicit non-print stages while their notice work continues, without images", async () => {
    const lookup = deferred<ProductionFixture>();
    mocks.fetchProductionRecord.mockImplementationOnce(() => lookup.promise);
    const delivery = deliver({ production_name: campaign.productionName, proof_stage: "approved_to_upload" });
    try {
      expectOk(delivery);
      expect(mocks.postSlackMessage).not.toHaveBeenCalled();
      expect(mocks.finishWebhookReceipt).not.toHaveBeenCalled();
      lookup.resolve(production);
      await vi.waitFor(() => expect(mocks.finishWebhookReceipt).toHaveBeenCalledOnce());
      await delivery.finished;
      expect(mocks.postSlackMessage).toHaveBeenCalledOnce();
      expect(mocks.postSlackMessage.mock.calls[0][1]).toContain("Approved to Upload");
      expect(mocks.getCurrentChannelMailpiecePdfs).not.toHaveBeenCalled();
      expect(mocks.renderPdfPagesToJpegs).not.toHaveBeenCalled();
      expect(mocks.uploadDealershipMediaImage).not.toHaveBeenCalled();
      expect(mocks.syncRequiredCustomValues).not.toHaveBeenCalled();
    } finally {
      lookup.resolve(production);
      await vi.waitFor(() => expect(mocks.finishWebhookReceipt).toHaveBeenCalledOnce());
      await delivery.finished;
    }
  });

  it("records a media upload 401 without image/value success or a false confirmation, preserving the notice", async () => {
    const upload = deferred<string>();
    mocks.uploadDealershipMediaImage.mockImplementationOnce(async () => {
      await upload.promise;
      throw new Error("GoHighLevel dealership media image upload failed with status 401");
    });
    const delivery = deliver({ production_name: campaign.productionName, proof_stage: "sent_to_print" });
    try {
      await vi.waitFor(() => expect(mocks.uploadDealershipMediaImage).toHaveBeenCalledOnce());
      expectNoResponse(delivery);
      expect(mocks.postSlackMessage).toHaveBeenCalledOnce();
      expect(mocks.logRelayAction).toHaveBeenCalledWith(expect.objectContaining({ action: "proof_stage_notice", outcome: "success" }));
      upload.resolve("ABC-release");
      await vi.waitFor(() => expect(delivery.res.send).toHaveBeenCalledOnce());
      await delivery.finished;
      expectOk(delivery);
      expect(mocks.finishMailpieceImageUpload).toHaveBeenCalledOnce();
      expect(mocks.finishMailpieceImageUpload).toHaveBeenCalledWith({
        campaignId: campaign.id, slackFileId: "ABC-print-file", pageNumber: 1, status: "failed",
      });
      expect([...images.values()].map(image => image.status)).toEqual(["failed"]);
      expect(mocks.syncRequiredCustomValues).not.toHaveBeenCalled();
      expect(mocks.postSlackMessage).toHaveBeenCalledOnce();
      expect(mocks.logRelayAction).toHaveBeenCalledWith(expect.objectContaining({
        action: "bdc_mailpiece_images", outcome: "failed", detail: expect.stringContaining("401"),
      }));
      expect(mocks.logRelayAction).not.toHaveBeenCalledWith(expect.objectContaining({ action: "bdc_mailpiece_images", outcome: "success" }));
      // The receipt acknowledges the handled proof notice, not an image success.
      expect(steps.indexOf("bdc_mailpiece_images:failed")).toBeLessThan(steps.indexOf("response"));
    } finally {
      upload.resolve("ABC-release");
      await delivery.finished;
      await vi.waitFor(() => expect([...receipts.values()]).not.toContain("processing"));
    }
  });
});

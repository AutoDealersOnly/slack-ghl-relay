import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  acknowledgeClaimedMailpieceImageJob,
  ARCHIVE_WARNING_MESSAGE,
  MONDAY_ARCHIVE_WARNING_MESSAGE,
  buildRelayKeepaliveResponse,
  getArchiveWarningMessage,
  processClaimedMailpieceImageJob,
  type ClaimedMailpieceImageJobDependencies,
} from "./scheduled-routes";

describe("campaign archive warning", () => {
  it("uses the approved admin-contact wording without changing the archive rule", () => {
    expect(ARCHIVE_WARNING_MESSAGE).toBe("This channel is scheduled to archive tomorrow. Contact admin if the campaign needs to remain open.");
    expect(ARCHIVE_WARNING_MESSAGE).not.toContain("operations channel");
  });

  it("names Monday when a weekend archive hold moved the archive date", () => {
    expect(getArchiveWarningMessage(new Date("2026-09-14T12:00:00.000Z"))).toBe(MONDAY_ARCHIVE_WARNING_MESSAGE);
    expect(getArchiveWarningMessage(new Date("2026-09-15T12:00:00.000Z"))).toBe(ARCHIVE_WARNING_MESSAGE);
  });
});

describe("relay availability keepalive", () => {
  it("is a lightweight acknowledgement and cannot perform archive work", () => {
    expect(buildRelayKeepaliveResponse()).toEqual({ ok: true, service: "relay" });
  });
});

describe("durable mailpiece scheduler acknowledgement", () => {
  it("answers the scheduler before starting long-running image work", async () => {
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    let releaseWork: (() => void) | undefined;
    const work = vi.fn(() => new Promise<void>(resolve => { releaseWork = resolve; }));

    acknowledgeClaimedMailpieceImageJob(response, work);

    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith({ ok: true, accepted: "mailpiece_image_job" });
    expect(work).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(work).toHaveBeenCalledOnce());
    releaseWork?.();
  });

  it("completes the already-claimed work after acknowledgement and records every stage", async () => {
    const campaign = { id: 71, channelName: "2609-abc-test-ame", channelId: "test-channel", dealershipRecordId: "dealer" };
    const dependencies: ClaimedMailpieceImageJobDependencies = {
      getCampaign: vi.fn(async () => campaign),
      fetchProduction: vi.fn(async () => ({ id: "production", properties: {} })),
      uploadImages: vi.fn(async input => {
        await input.onStage?.("media-upload-front");
        return { frontUrl: "https://example.test/front.jpg", backUrl: "https://example.test/back.jpg" };
      }),
      completeJob: vi.fn(async () => undefined),
      deleteTask: vi.fn(async () => undefined),
      logAction: vi.fn(async () => undefined),
      touchJob: vi.fn(async () => undefined),
      failJob: vi.fn(async () => undefined),
    };

    await processClaimedMailpieceImageJob({ taskUid: "task-71", job: { campaignId: 71, attemptCount: 1 } as never }, dependencies);

    expect(dependencies.fetchProduction).toHaveBeenCalledWith("2609-abc-test-ame");
    expect(dependencies.touchJob).toHaveBeenCalledWith("task-71");
    expect(dependencies.completeJob).toHaveBeenCalledWith({ taskUid: "task-71" });
    expect(dependencies.deleteTask).toHaveBeenCalledWith("task-71", "");
    expect(dependencies.failJob).not.toHaveBeenCalled();
  });

  it("records a background failure without changing the already-issued scheduler acknowledgement", async () => {
    const campaign = { id: 72, channelName: "2609-abc-test-ame", channelId: "test-channel", dealershipRecordId: "dealer" };
    const dependencies: ClaimedMailpieceImageJobDependencies = {
      getCampaign: vi.fn(async () => campaign),
      fetchProduction: vi.fn(async () => { throw new Error("temporary production lookup failure"); }),
      uploadImages: vi.fn(),
      completeJob: vi.fn(async () => undefined),
      deleteTask: vi.fn(async () => undefined),
      logAction: vi.fn(async () => undefined),
      touchJob: vi.fn(async () => undefined),
      failJob: vi.fn(async () => undefined),
    };

    await processClaimedMailpieceImageJob({ taskUid: "task-72", job: { campaignId: 72, attemptCount: 1 } as never }, dependencies);

    expect(dependencies.completeJob).not.toHaveBeenCalled();
    expect(dependencies.failJob).toHaveBeenCalledWith(expect.objectContaining({ taskUid: "task-72" }));
  });
});

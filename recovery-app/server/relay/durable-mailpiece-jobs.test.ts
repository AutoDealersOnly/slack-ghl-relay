import { describe, expect, it, vi } from "vitest";
import {
  getDatabaseAffectedRows,
  isDuplicateDatabaseEntryError,
  isMailpieceImageJobRunEligible,
  isMailpieceImageJobSchedulingEligible,
  shouldRecoverMailpieceImageJobWithBackstop,
} from "./db";
import { isAuthenticatedCronTask } from "./scheduled-routes";
import { postProofNoticeThenProcessMailpieceImages, queueSentToPrintMailpieceImages } from "./workflows";

describe("Sent-to-Print BDC image processing", () => {
  it("hands Sent-to-Print image work to the existing durable queue instead of rendering in the acknowledged webhook", async () => {
    const enqueue = vi.fn(async () => "scheduled" as const);

    await expect(
      queueSentToPrintMailpieceImages({ id: 42, channelName: "2609-abc-test-ame" }, enqueue)
    ).resolves.toBe("scheduled");

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({ id: 42, channelName: "2609-abc-test-ame", requeueCompleted: true });
  });

  it("posts and logs the original Sent to Print notice before image work", async () => {
    const steps: string[] = [];
    await postProofNoticeThenProcessMailpieceImages({
      isSentToPrint: true,
      postNotice: async () => void steps.push("notice"),
      logNotice: async () => void steps.push("notice-log"),
      processMailpieceImages: async () => void steps.push("process"),
      logMailpieceProcessingFailure: async () => void steps.push("failure-log"),
    });

    expect(steps).toEqual(["notice", "notice-log", "process"]);
  });

  it("keeps the original notice successful when image processing fails", async () => {
    const steps: string[] = [];
    const processingError = new Error("temporary image processing problem");
    await expect(
      postProofNoticeThenProcessMailpieceImages({
        isSentToPrint: true,
        postNotice: async () => void steps.push("notice"),
        logNotice: async () => void steps.push("notice-log"),
        processMailpieceImages: vi.fn(async () => {
          steps.push("process");
          throw processingError;
        }),
        logMailpieceProcessingFailure: async error => {
          expect(error).toBe(processingError);
          steps.push("failure-log");
        },
      })
    ).resolves.toBeUndefined();

    expect(steps).toEqual(["notice", "notice-log", "process", "failure-log"]);
  });

  it("does not process BDC images for other proof stages", async () => {
    const processMailpieceImages = vi.fn();
    await postProofNoticeThenProcessMailpieceImages({
      isSentToPrint: false,
      postNotice: async () => undefined,
      logNotice: async () => undefined,
      processMailpieceImages,
      logMailpieceProcessingFailure: async () => undefined,
    });
    expect(processMailpieceImages).not.toHaveBeenCalled();
  });

  it("recognizes the MySQL affected-row result whether it is direct or tuple-wrapped", () => {
    expect(getDatabaseAffectedRows({ affectedRows: 1 })).toBe(1);
    expect(getDatabaseAffectedRows([{ affectedRows: 1 }, []])).toBe(1);
    expect(getDatabaseAffectedRows([{ affectedRows: 0 }, []])).toBe(0);
  });

  it("recognizes duplicate-key errors even when the database layer wraps their cause", () => {
    expect(isDuplicateDatabaseEntryError({ code: "ER_DUP_ENTRY" })).toBe(true);
    expect(isDuplicateDatabaseEntryError({ message: "Failed query", cause: { code: "ER_DUP_ENTRY" } })).toBe(true);
    expect(isDuplicateDatabaseEntryError(new Error("network unavailable"))).toBe(false);
  });

  it("allows a retry only after a failed or stale job, never while a fresh job is processing", () => {
    const now = new Date("2026-09-11T14:20:00.000Z");
    expect(isMailpieceImageJobRunEligible({ status: "scheduled", updatedAt: now, now })).toBe(true);
    expect(isMailpieceImageJobRunEligible({ status: "failed", updatedAt: now, now })).toBe(true);
    expect(isMailpieceImageJobRunEligible({ status: "processing", updatedAt: new Date("2026-09-11T14:18:00.000Z"), now })).toBe(false);
    expect(isMailpieceImageJobRunEligible({ status: "processing", updatedAt: new Date("2026-09-11T14:09:59.000Z"), now })).toBe(true);
    expect(isMailpieceImageJobRunEligible({ status: "completed", updatedAt: now, now })).toBe(false);
  });

  it("re-schedules only failed or stale processing jobs after a missed platform callback", () => {
    const now = new Date("2026-09-11T14:20:00.000Z");
    expect(isMailpieceImageJobSchedulingEligible({ status: "failed", updatedAt: now, now })).toBe(true);
    expect(isMailpieceImageJobSchedulingEligible({ status: "processing", updatedAt: new Date("2026-09-11T14:19:00.000Z"), now })).toBe(false);
    expect(isMailpieceImageJobSchedulingEligible({ status: "processing", updatedAt: new Date("2026-09-11T14:09:59.000Z"), now })).toBe(true);
    expect(isMailpieceImageJobSchedulingEligible({ status: "scheduled", updatedAt: now, now })).toBe(false);
  });

  it("uses the backstop only for an overdue ABC Test job and never a completed or live campaign", () => {
    const now = new Date("2026-10-20T18:20:00.000Z");
    const base = { channelName: "2609-abc-test-ame", updatedAt: new Date("2026-10-20T18:00:00.000Z") };

    expect(shouldRecoverMailpieceImageJobWithBackstop({ ...base, status: "scheduled", scheduledFor: new Date("2026-10-20T18:14:59.000Z") }, now)).toBe(true);
    expect(shouldRecoverMailpieceImageJobWithBackstop({ ...base, status: "scheduled", scheduledFor: new Date("2026-10-20T18:15:00.000Z") }, now)).toBe(false);
    expect(shouldRecoverMailpieceImageJobWithBackstop({ ...base, status: "failed", scheduledFor: null }, now)).toBe(true);
    expect(shouldRecoverMailpieceImageJobWithBackstop({ ...base, status: "processing", scheduledFor: null }, now)).toBe(true);
    expect(shouldRecoverMailpieceImageJobWithBackstop({ ...base, status: "completed", scheduledFor: null }, now)).toBe(false);
    expect(shouldRecoverMailpieceImageJobWithBackstop({ ...base, status: "pending", scheduledFor: null }, now)).toBe(false);
    expect(shouldRecoverMailpieceImageJobWithBackstop({ ...base, channelName: "2610-live-dealer-ame", status: "failed", scheduledFor: null }, now)).toBe(false);
  });

  it("rejects non-scheduled callers and requires a trusted task identity", () => {
    expect(isAuthenticatedCronTask({ isCron: false, taskUid: "task-1" })).toBe(false);
    expect(isAuthenticatedCronTask({ isCron: true, taskUid: "" })).toBe(false);
    expect(isAuthenticatedCronTask({ isCron: true, taskUid: "task-1" })).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ABC_MAILPIECE_OBSERVATION_CHANNEL, createAbcMailpieceStageObserver } from "./mailpiece-stage-observer";
const campaign = { id: 42, channelName: ABC_MAILPIECE_OBSERVATION_CHANNEL };
afterEach(() => vi.useRealTimers());

describe("ABC-only automatic mailpiece stage observation", () => {
  it.each(["2611-live-campaign", "2609-abc-test-ame-copy", "ABC Test", ""])("does not attach to another channel: %s", channelName => {
    const logAction = vi.fn();
    expect(createAbcMailpieceStageObserver({ campaign: { ...campaign, channelName }, isSentToPrint: true, logAction })).toBeUndefined();
    expect(logAction).not.toHaveBeenCalled();
  });
  it("does not attach to a non-print proof stage", () => {
    const logAction = vi.fn();
    expect(createAbcMailpieceStageObserver({ campaign, isSentToPrint: false, logAction })).toBeUndefined();
    expect(logAction).not.toHaveBeenCalled();
  });
  it("logs only fixed stages and elapsed time, without submitted data", async () => {
    let time = 100;
    const logAction = vi.fn().mockResolvedValue(undefined);
    const observer = createAbcMailpieceStageObserver({ campaign, isSentToPrint: true, logAction, now: () => time })!;
    time = 350;
    await observer("pdf-render-front");
    expect(logAction).toHaveBeenCalledOnce();
    expect(logAction).toHaveBeenCalledWith({
      campaignId: 42, action: "bdc_mailpiece_image_stage", outcome: "success",
      detail: "ABC automatic BDC image action reached stage: pdf-render-front; elapsed 250 ms.",
    });
    await observer("untrusted-submitted-data");
    expect(logAction).toHaveBeenCalledOnce();
  });
  it("does not propagate a rejected diagnostic write", async () => {
    const logAction = vi.fn().mockRejectedValue(new Error("ABC diagnostic unavailable"));
    const observer = createAbcMailpieceStageObserver({ campaign, isSentToPrint: true, logAction })!;
    await expect(observer("media-upload-front")).resolves.toBeUndefined();
  });
  it("does not propagate a synchronous diagnostic exception", async () => {
    const logAction = vi.fn(() => { throw new Error("ABC diagnostic unavailable"); });
    const observer = createAbcMailpieceStageObserver({ campaign, isSentToPrint: true, logAction })!;
    await expect(observer("media-upload-front")).resolves.toBeUndefined();
  });
  it("returns after one second if the diagnostic writer never returns", async () => {
    vi.useFakeTimers();
    const logAction = vi.fn(() => new Promise<void>(() => undefined));
    const observer = createAbcMailpieceStageObserver({ campaign, isSentToPrint: true, logAction })!;
    let returned = false;
    const work = observer("pdf-render-back").then(() => { returned = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(returned).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await work;
    expect(returned).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears the observation timer after a successful write", async () => {
    vi.useFakeTimers();
    const logAction = vi.fn().mockResolvedValue(undefined);
    const observer = createAbcMailpieceStageObserver({ campaign, isSentToPrint: true, logAction })!;
    await observer("custom-values");
    expect(vi.getTimerCount()).toBe(0);
  });
});

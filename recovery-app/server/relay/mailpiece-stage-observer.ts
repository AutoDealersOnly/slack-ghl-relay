export const ABC_MAILPIECE_OBSERVATION_CHANNEL = "2609-abc-test-ame";
const OBSERVER_WAIT_LIMIT_MS = 1_000;
const SAFE_STAGES = new Set([
  "dealership-lookup", "slack-file-list", "pdf-page-count",
  "pdf-download-front", "pdf-render-front", "media-upload-front",
  "pdf-download-back", "pdf-render-back", "media-upload-back",
  "custom-values", "slack-confirmation",
]);

type StageLogWriter = (entry: {
  campaignId: number;
  action: "bdc_mailpiece_image_stage";
  outcome: "success";
  detail: string;
}) => Promise<unknown>;

/** Observation only: never changes claims, images, values, messages, or receipts. */
export function createAbcMailpieceStageObserver(input: {
  campaign: { id: number; channelName: string };
  isSentToPrint: boolean;
  logAction: StageLogWriter;
  now?: () => number;
}): ((stage: string) => Promise<void>) | undefined {
  if (input.campaign.channelName !== ABC_MAILPIECE_OBSERVATION_CHANNEL || !input.isSentToPrint) return undefined;
  const now = input.now ?? Date.now;
  const startedAt = now();
  return async stage => {
    // Only fixed internal stage labels may enter this diagnostic log.
    if (!SAFE_STAGES.has(stage)) return;
    const elapsedMs = Math.max(0, now() - startedAt);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => input.logAction({
          campaignId: input.campaign.id,
          action: "bdc_mailpiece_image_stage",
          outcome: "success",
          detail: `ABC automatic BDC image action reached stage: ${stage}; elapsed ${elapsedMs} ms.`,
        })),
        new Promise<void>(resolve => { timeout = setTimeout(resolve, OBSERVER_WAIT_LIMIT_MS); }),
      ]);
    } catch {
      // A diagnostic write must never stop the existing image action.
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  };
}

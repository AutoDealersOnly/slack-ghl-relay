export async function runOncePerWebhook(
  claimReceipt: () => Promise<{ accepted: boolean }>,
  process: () => Promise<void>,
  finish: (outcome: "processed" | "failed") => Promise<void>
): Promise<"processed" | "duplicate"> {
  const receipt = await claimReceipt();
  if (!receipt.accepted) return "duplicate";
  try {
    await process();
    await finish("processed");
    return "processed";
  } catch (error) {
    await finish("failed");
    throw error;
  }
}

/**
 * Production Canvas refreshes are intentionally processed for every delivery.
 *
 * The original GHL workflow sent the Production name on each record save. That
 * payload is unchanged across many legitimate edits, so permanently storing a
 * receipt for it would suppress all later Canvas updates. Slack Canvas edits
 * are safe to repeat and update the same saved Canvas rather than creating a
 * second tab. Other workflow events, especially proof-stage messages, retain
 * their receipt protection.
 */
export const shouldDeduplicateRelayEvent = (eventType: string): boolean => eventType !== "production_update";

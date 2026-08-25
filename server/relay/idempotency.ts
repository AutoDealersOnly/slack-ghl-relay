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

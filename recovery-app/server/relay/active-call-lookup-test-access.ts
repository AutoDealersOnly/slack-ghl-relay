import { createHmac, timingSafeEqual } from "node:crypto";

function activeCallTestAccessToken(): string {
  const signingSecret = process.env.JWT_SECRET?.trim() ?? "";
  if (!signingSecret) return "";
  return createHmac("sha256", signingSecret).update("ado-active-call-lookup-test-link-v1").digest("base64url");
}

/**
 * Separate from PIN Code Lookup access by design. No live PIN Code Lookup
 * link, setting, or page is used to enter or authorize the active-call test.
 */
export function hasActiveCallLookupTestAccess(candidate: unknown): boolean {
  const expected = activeCallTestAccessToken();
  const supplied = typeof candidate === "string" ? candidate.trim() : "";
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

/** Available only to server-side recovery-vault update code; never rendered or logged. */
export function buildActiveCallLookupTestUrl(): string {
  const token = activeCallTestAccessToken();
  if (!token) throw new Error("The separate active-call test link is unavailable.");
  return `https://ghl-slackrel-knvzqxuh.manus.space/pin-code-lookup-active-call-test?access=${encodeURIComponent(token)}`;
}

/** Static provider validation value for the separate test subscription, never sent to the browser. */
export function activeCallWebhookValidationToken(): string {
  const signingSecret = process.env.JWT_SECRET?.trim() ?? "";
  if (!signingSecret) throw new Error("The separate active-call test link is unavailable.");
  // RingCentral rejects the longer URL-safe/Base64 forms here; retain 128 bits of a hexadecimal HMAC.
  return createHmac("sha256", signingSecret).update("ado-active-call-office-at-hand-webhook-v1").digest("hex").slice(0, 32);
}

export function hasActiveCallWebhookValidationToken(candidate: unknown): boolean {
  const expected = activeCallWebhookValidationToken();
  const supplied = typeof candidate === "string" ? candidate.trim() : "";
  if (!supplied || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

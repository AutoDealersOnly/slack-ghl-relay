import crypto from "crypto";

const normalizeAuthorization = (value: string | undefined): string => {
  if (!value) return "";
  const trimmed = value.trim();
  return trimmed.toLowerCase().startsWith("bearer ") ? trimmed.slice(7).trim() : trimmed;
};

export const isAuthorizedGhlWebhook = (
  authorizationHeader: string | undefined,
  sharedSecret: string
): boolean => {
  const received = normalizeAuthorization(authorizationHeader);
  if (!received || !sharedSecret) return false;

  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(sharedSecret, "utf8");
  if (receivedBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
};

export const isAuthorizedSlackRequest = (input: {
  signingSecret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string | undefined;
  nowMs?: number;
}): boolean => {
  const { signingSecret, timestamp, signature, rawBody } = input;
  if (!signingSecret || !timestamp || !signature || rawBody === undefined) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowMs = input.nowMs ?? Date.now();
  if (Math.abs(nowMs - timestampSeconds * 1000) > 5 * 60 * 1000) return false;

  const expected = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
};

export const redactErrorDetail = (value: unknown): string => {
  const message = value instanceof Error ? value.message : String(value ?? "Unknown error");
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/xox[baprs]-[A-Za-z0-9-]+/gi, "[redacted]")
    .replace(/https:\/\/hook\.[^\s)]+/gi, "[redacted webhook]")
    .slice(0, 500);
};

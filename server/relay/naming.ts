import crypto from "crypto";

export const normalizeCampaignChannelName = (productionName: string): string => {
  const normalized = productionName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized.slice(0, 80);
};

export const makeWebhookDeliveryKey = (eventType: string, payload: unknown): string => {
  const payloadHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return `${eventType}:${payloadHash}`;
};

export const makePayloadHash = (payload: unknown): string =>
  crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

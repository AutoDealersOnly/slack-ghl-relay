import { getRelayConfig } from "./config";
import { ghlHeaders } from "./ghl";
import { activeCallWebhookValidationToken, hasActiveCallLookupTestAccess } from "./active-call-lookup-test-access";
import { refreshOfficeAtHandTestAuthorization } from "./office-at-hand-oauth";
import { getCurrentOfficeAtHandTestSubscription, saveOfficeAtHandTestSubscription } from "./db";
import type { DealershipProperties, GhlCustomObjectRecord } from "./types";
import { z } from "zod";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const RINGCENTRAL_BASE_URL = "https://platform.ringcentral.com";
export const OFFICE_AT_HAND_EVENT_URL = "https://ghl-slackrel-knvzqxuh.manus.space/api/office-at-hand/events";
const TEST_SUBSCRIPTION_TTL_SECONDS = 60 * 60;
const ACTIVE_EVENT_STATUSES = ["Setup", "Proceeding", "Answered", "Disconnected"] as const;
const ABC_TEST_DEALERSHIP_NAME = "abc dealer";

type DealerRecord = GhlCustomObjectRecord<DealershipProperties>;
type ProviderSubscriptionResponse = { id?: unknown; status?: unknown; expirationTime?: unknown; disabledFilters?: unknown };
type ProviderErrorResponse = { errorCode?: unknown; message?: unknown };

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

export function isOfficeAtHandAbcTestDealerName(value: unknown): boolean {
  return asText(value).toLocaleLowerCase() === ABC_TEST_DEALERSHIP_NAME;
}

function safeProviderErrorMessage(value: unknown): string {
  return asText(value)
    .replace(/https?:\/\/[^\s"']+/gi, "[address]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]")
    .replace(/[^A-Za-z0-9 .,:;_()[\]-]/g, "")
    .slice(0, 180);
}

export function normalizeOfficeAtHandPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return "";
}

export function buildAbcOnlyTelephonyEventFilters(trackingNumbers: string[]): string[] {
  const phoneNumbers = Array.from(new Set(trackingNumbers.map(normalizeOfficeAtHandPhoneNumber).filter(Boolean)));
  if (!phoneNumbers.length || phoneNumbers.length > 2) throw new Error("ABC Dealer does not have one or two valid tracking numbers for the separate test.");
  return phoneNumbers.flatMap(phoneNumber => ACTIVE_EVENT_STATUSES.map(status => {
    const query = new URLSearchParams({ direction: "Inbound", phoneNumber, statusCode: status });
    return `/restapi/v1.0/account/~/telephony/sessions?${query.toString()}`;
  }));
}

async function loadOfficeAtHandTestDealerRecords(fetcher: typeof fetch): Promise<DealerRecord[]> {
  const config = getRelayConfig();
  if (!config.ghlApiKey || !config.ghlLocationId) throw new Error("ADO dealership lookup is unavailable.");
  const records: DealerRecord[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetcher(`${GHL_BASE_URL}/objects/custom_objects.dealerships/records/search`, {
      method: "POST",
      headers: ghlHeaders(config.ghlApiKey, "2021-07-28", config.ghlLocationId),
      body: JSON.stringify({ locationId: config.ghlLocationId, page, pageLimit: 100, query: "", searchAfter: [] }),
    });
    if (!response.ok) throw new Error("ADO could not load the ABC Dealer test configuration.");
    const pageRecords = ((await response.json()) as { records?: DealerRecord[] }).records ?? [];
    records.push(...pageRecords);
    if (pageRecords.length < 100) break;
  }
  return records;
}

export const activeCallTestDealersInput = z.object({ access: z.string().trim().min(1).max(256) });
export const activeCallTestSubscriptionInput = activeCallTestDealersInput.extend({ dealershipRecordId: z.string().trim().min(1).max(128) });

function requireActiveCallTestAccess(access: string) {
  if (!hasActiveCallLookupTestAccess(access)) throw new Error("The separate active-call test link is not authorized.");
}

export async function listOfficeAtHandTestDealers(access: string, fetcher: typeof fetch = fetch) {
  requireActiveCallTestAccess(access);
  return (await loadOfficeAtHandTestDealerRecords(fetcher))
    .filter(record => isOfficeAtHandAbcTestDealerName(record.properties?.dealership_name))
    .map(record => ({
      dealershipRecordId: asText(record.id),
      dealershipName: asText(record.properties?.dealership_name) || "Unnamed dealership",
      trackingLineCount: [record.properties?.tracking, record.properties?.tracking__2]
        .map(asText)
        .map(normalizeOfficeAtHandPhoneNumber)
        .filter(Boolean).length,
    }))
    .filter(record => Boolean(record.dealershipRecordId) && record.trackingLineCount >= 1 && record.trackingLineCount <= 2)
    .sort((a, b) => a.dealershipName.localeCompare(b.dealershipName));
}

export function toOfficeAtHandTestFeedStatus(current: { dealerRecordId: string; expiresAt: Date } | null) {
  return current
    ? { active: true as const, expiresAt: current.expiresAt, dealershipRecordId: current.dealerRecordId }
    : { active: false as const, expiresAt: null, dealershipRecordId: null };
}

/** Returns only the separate test feed state; it does not call the provider or reveal a tracking number. */
export async function getOfficeAtHandTestFeedStatus(access: string) {
  requireActiveCallTestAccess(access);
  return toOfficeAtHandTestFeedStatus(await getCurrentOfficeAtHandTestSubscription());
}

/**
 * Creates one time-limited, selected-dealership-tracking-number-only notification subscription.
 * It deliberately has no call-control, number, queue, routing, recording, or user-management request.
 */
export async function createOfficeAtHandTestSubscription(input: { access: string; dealershipRecordId: string }, fetcher: typeof fetch = fetch) {
  requireActiveCallTestAccess(input.access);
  const existing = await getCurrentOfficeAtHandTestSubscription();
  if (existing) return { expiresAt: existing.expiresAt, alreadyActive: true };
  const dealership = (await loadOfficeAtHandTestDealerRecords(fetcher)).find(record =>
    asText(record.id) === input.dealershipRecordId && isOfficeAtHandAbcTestDealerName(record.properties?.dealership_name)
  );
  if (!dealership) throw new Error("The selected test dealership is not available.");
  const trackingNumbers = [asText(dealership.properties?.tracking), asText(dealership.properties?.tracking__2)].filter(Boolean);
  const eventFilters = buildAbcOnlyTelephonyEventFilters(trackingNumbers);
  const { accessToken } = await refreshOfficeAtHandTestAuthorization(fetcher);
  const response = await fetcher(`${RINGCENTRAL_BASE_URL}/restapi/v1.0/subscription`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      eventFilters,
      expiresIn: TEST_SUBSCRIPTION_TTL_SECONDS,
      deliveryMode: { transportType: "WebHook", address: OFFICE_AT_HAND_EVENT_URL, verificationToken: activeCallWebhookValidationToken() },
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ProviderErrorResponse;
    const code = asText(body.errorCode).replace(/[^A-Z0-9-]/g, "").slice(0, 32);
    const detail = safeProviderErrorMessage(body.message);
    throw new Error(`OfficeAtHand could not start the separate ABC active-call test feed (status ${response.status}${code ? `, ${code}` : ""}${detail ? `: ${detail}` : ""}).`);
  }
  const payload = (await response.json()) as ProviderSubscriptionResponse;
  const providerSubscriptionId = asText(payload.id);
  const expirationTime = asText(payload.expirationTime);
  const expiresAt = new Date(expirationTime);
  if (!providerSubscriptionId || Number.isNaN(expiresAt.getTime()) || (Array.isArray(payload.disabledFilters) && payload.disabledFilters.length > 0)) {
    throw new Error("OfficeAtHand did not create the complete limited ABC test feed.");
  }
  await saveOfficeAtHandTestSubscription({ providerSubscriptionId, dealershipRecordId: input.dealershipRecordId, status: asText(payload.status) || "Active", expiresAt });
  return { expiresAt, alreadyActive: false };
}

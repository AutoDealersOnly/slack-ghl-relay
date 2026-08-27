import { getRelayConfig } from "./config";
import type { DealershipProperties, GhlCustomObjectRecord, ProductionProperties } from "./types";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_CURRENT_TOKEN_VERSION = "2021-07-28";

const requireGhlConfig = () => {
  const config = getRelayConfig();
  if (!config.ghlApiKey || !config.ghlLocationId) {
    throw new Error("ADO GoHighLevel connection is not configured");
  }
  return config;
};

export const ghlHeaders = (token: string, version = "v3", locationId?: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  Version: version,
  ...(locationId ? { LocationId: locationId } : {}),
  "Content-Type": "application/json",
});

async function readJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`GoHighLevel ${action} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchDealership(recordId: string): Promise<GhlCustomObjectRecord<DealershipProperties> | null> {
  const { ghlApiKey, ghlLocationId } = requireGhlConfig();
  const response = await fetch(
    `${GHL_BASE_URL}/objects/custom_objects.dealerships/records/${encodeURIComponent(recordId)}`,
    { headers: ghlHeaders(ghlApiKey, GHL_CURRENT_TOKEN_VERSION, ghlLocationId) }
  );
  const data = await readJson<{ record?: GhlCustomObjectRecord<DealershipProperties> }>(response, "dealership lookup");
  return data.record ?? null;
}

export async function fetchProductionRecord(
  searchTerm: string
): Promise<GhlCustomObjectRecord<ProductionProperties> | null> {
  const { ghlApiKey, ghlLocationId } = requireGhlConfig();
  const response = await fetch(`${GHL_BASE_URL}/objects/custom_objects.production/records/search`, {
    method: "POST",
    headers: ghlHeaders(ghlApiKey, GHL_CURRENT_TOKEN_VERSION, ghlLocationId),
    body: JSON.stringify({
      locationId: ghlLocationId,
      page: 1,
      pageLimit: 1,
      query: searchTerm,
    }),
  });
  const data = await readJson<{ records?: Array<GhlCustomObjectRecord<ProductionProperties>> }>(
    response,
    "production lookup"
  );
  return data.records?.[0] ?? null;
}

type CustomValue = { id: string; name: string; fieldKey: string; value: string };

const normalizeCustomValueKey = (fieldKey: string): string =>
  fieldKey.replace(/\{\{\s*/g, "").replace(/\s*\}\}/g, "").trim();

export async function syncCustomValues(
  locationId: string,
  apiKey: string,
  values: Record<string, string>
): Promise<{ updated: number; skipped: number }> {
  const listResponse = await fetch(`${GHL_BASE_URL}/locations/${encodeURIComponent(locationId)}/customValues`, {
    headers: ghlHeaders(apiKey, "2021-07-28"),
  });
  const listData = await readJson<{ customValues?: CustomValue[] }>(listResponse, "custom-value lookup");
  const existingValues = listData.customValues ?? [];
  let updated = 0;
  let skipped = 0;

  for (const [key, value] of Object.entries(values)) {
    if (!value) {
      skipped += 1;
      continue;
    }
    const existing = existingValues.find(item => normalizeCustomValueKey(item.fieldKey) === `custom_values.${key}`);
    if (!existing) {
      skipped += 1;
      continue;
    }

    const updateResponse = await fetch(
      `${GHL_BASE_URL}/locations/${encodeURIComponent(locationId)}/customValues/${encodeURIComponent(existing.id)}`,
      {
        method: "PUT",
        headers: ghlHeaders(apiKey, "2021-07-28"),
        body: JSON.stringify({ name: existing.name, value }),
      }
    );
    await readJson(updateResponse, "custom-value update");
    updated += 1;
  }

  return { updated, skipped };
}

const formatPhone = (value: string | undefined): string => {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return normalized.length === 10
    ? `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`
    : value;
};

export function dealershipCustomValues(properties: DealershipProperties): Record<string, string> {
  const address = [properties.street_address, properties.city, properties.state, properties.zip]
    .filter(Boolean)
    .join(", ");
  const alias = properties.alias ?? "";
  return {
    dealership_name: properties.dealership_name ?? "",
    dealership_address: address,
    dealership_address_full: address,
    dealer_website: properties.website ?? "",
    dealership_tracking_number: formatPhone(properties.tracking),
    dealership_tracking_number_2: formatPhone(properties.tracking__2),
    our_hours: properties.hours ?? "",
    crm_email: properties.crm_email ?? "",
    alias_name: alias,
    alias_1st_name: alias.split(" ")[0] ?? "",
    alias_position: properties.alias_position ?? "",
    brand: properties.brand ?? "",
    crm_link: properties.crm_link ?? "",
    passcode: properties.passcode ?? "",
  };
}

const formatMonthDay = (value: string | undefined): string => {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day))
  );
};

export function campaignCustomValues(properties: ProductionProperties): Record<string, string> {
  const start = formatMonthDay(properties.event_start);
  const end = formatMonthDay(properties.event_end);
  const endDay = properties.event_end?.split("-")[2]?.replace(/^0/, "") ?? "";
  const team = [properties.closer, properties.greeter].filter(Boolean).join(", ");
  return {
    campaign_dates: start && end ? `${start}-${endDay}` : start || end,
    campaign_start_date: start,
    campaign_end_date: end,
    kbb_ed: start.split(" ")[0] ?? "",
    ask_for: team,
    event_coodinator: team,
  };
}

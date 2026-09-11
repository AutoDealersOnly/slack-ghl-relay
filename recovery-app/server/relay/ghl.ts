import { getRelayConfig } from "./config";
import { normalizeCampaignChannelName } from "./naming";
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

async function readGhlWriteResponse<T>(response: Response, action: string): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let suffix = "";
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown; code?: unknown; errors?: unknown };
    const safeText = (value: unknown): string => {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value.filter(item => typeof item === "string").join("; ");
      if (value && typeof value === "object") {
        return Object.entries(value)
          .filter(([, item]) => typeof item === "string" || Array.isArray(item))
          .map(([key, item]) => `${key}: ${safeText(item)}`)
          .join("; ");
      }
      return "";
    };
    const detail = safeText(body.message) || safeText(body.errors) || safeText(body.error) || safeText(body.code);
    if (detail) suffix = `: ${detail.slice(0, 240)}`;
  } catch {
    // A non-JSON error body is deliberately not logged because it may echo submitted file data.
  }
  throw new Error(`GoHighLevel ${action} failed with status ${response.status}${suffix}`);
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
      pageLimit: 100,
      query: searchTerm,
    }),
  });
  const data = await readJson<{ records?: Array<GhlCustomObjectRecord<ProductionProperties>> }>(
    response,
    "production lookup"
  );
  return selectExactProductionRecord(data.records ?? [], searchTerm);
}

/**
 * Searches can return partial historical matches. The relay must only use the
 * record whose Production name normalizes exactly to the channel/search term.
 * Ambiguous exact records are intentionally rejected rather than selecting one
 * and scheduling an archive from the wrong Event End date.
 */
export function selectExactProductionRecord(
  records: Array<GhlCustomObjectRecord<ProductionProperties>>,
  searchTerm: string
): GhlCustomObjectRecord<ProductionProperties> | null {
  const expectedName = normalizeCampaignChannelName(searchTerm);
  const exactMatches = records.filter(record => normalizeCampaignChannelName(record.properties.production ?? "") === expectedName);
  if (exactMatches.length > 1) {
    throw new Error(`Ambiguous Production record match for ${expectedName}`);
  }
  return exactMatches[0] ?? null;
}

export type ProductionProofFile = { url: string; meta: { name: string; extension: string; size: number } };

/** The object schema stays in the endpoint path; the FILE_UPLOAD writer accepts an array of media URLs. */
export const buildProductionProofUpdatePayload = (proofFiles: ProductionProofFile[]) => ({
  properties: { proof: proofFiles.map(file => file.url) },
});

export const productionProofExtension = (fileName: string): string => {
  const suffix = fileName.split(".").pop()?.trim().toLowerCase() || "pdf";
  return `.${suffix}`;
};

export const buildAutomatedProofLinksUpdatePayload = (links: string) => ({
  properties: { automated_proof_links: links },
});

export const appendAutomatedProofLink = (existingLinks: string | undefined, fileName: string, url: string, now = new Date()): string => {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const entry = `${date} — ${fileName}\n${url}`;
  return [existingLinks?.trim(), entry].filter(Boolean).join("\n\n");
};

/** Uploads a PDF into ADO media storage and appends its file descriptor to the Production Proof field. */
/** Uploads a PDF into ADO media storage and appends its dated URL to Automated Proof Links. */
export async function appendProductionAutomatedProofLink(input: {
  recordId: string;
  existingLinks?: string;
  fileName: string;
  bytes: Uint8Array;
}): Promise<{ url: string; links: string }> {
  const { ghlApiKey, ghlLocationId } = requireGhlConfig();
  if (input.bytes.byteLength > 25 * 1024 * 1024) throw new Error("PDF exceeds the 25 MB GoHighLevel media limit");
  const fileBuffer = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength
  ) as ArrayBuffer;
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "application/pdf" }), input.fileName);
  form.append("hosted", "false");
  form.append("name", input.fileName);
  const uploadResponse = await fetch(`${GHL_BASE_URL}/medias/upload-file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ghlApiKey}`, Version: "v3", LocationId: ghlLocationId },
    body: form,
  });
  const upload = await readGhlWriteResponse<{ url?: string }>(uploadResponse, "Proof PDF media upload");
  if (!upload.url) throw new Error("GoHighLevel media upload returned no file URL");
  const links = appendAutomatedProofLink(input.existingLinks, input.fileName, upload.url);
  const updateResponse = await fetch(
    `${GHL_BASE_URL}/objects/custom_objects.production/records/${encodeURIComponent(input.recordId)}?locationId=${encodeURIComponent(ghlLocationId)}`,
    {
      method: "PUT",
      headers: ghlHeaders(ghlApiKey, "v3", ghlLocationId),
      body: JSON.stringify(buildAutomatedProofLinksUpdatePayload(links)),
    }
  );
  await readGhlWriteResponse(updateResponse, "Production Automated Proof Links update");
  return { url: upload.url, links };
}

type CustomValue = { id: string; name: string; fieldKey: string; value: string };

const normalizeCustomValueKey = (fieldKey: string): string =>
  fieldKey.replace(/\{\{\s*/g, "").replace(/\s*\}\}/g, "").trim();

async function listLocationCustomValues(locationId: string, apiKey: string): Promise<CustomValue[]> {
  const listResponse = await fetch(`${GHL_BASE_URL}/locations/${encodeURIComponent(locationId)}/customValues`, {
    headers: ghlHeaders(apiKey, "2021-07-28"),
  });
  const listData = await readJson<{ customValues?: CustomValue[] }>(listResponse, "custom-value lookup");
  return listData.customValues ?? [];
}

async function updateLocationCustomValue(locationId: string, apiKey: string, value: CustomValue, nextValue: string): Promise<void> {
  const updateResponse = await fetch(
    `${GHL_BASE_URL}/locations/${encodeURIComponent(locationId)}/customValues/${encodeURIComponent(value.id)}`,
    {
      method: "PUT",
      headers: ghlHeaders(apiKey, "2021-07-28"),
      body: JSON.stringify({ name: value.name, value: nextValue }),
    }
  );
  await readJson(updateResponse, "custom-value update");
}

/** Uploads a JPEG to the associated dealership subaccount's Media library and returns its hosted URL. */
export async function uploadDealershipMediaImage(input: {
  locationId: string;
  apiKey: string;
  fileName: string;
  bytes: Uint8Array;
}): Promise<string> {
  if (input.bytes.byteLength > 20 * 1024 * 1024) throw new Error("Rendered mailpiece JPEG exceeds the 20 MB media upload limit");
  const fileBuffer = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "image/jpeg" }), input.fileName);
  form.append("hosted", "false");
  form.append("name", input.fileName);
  let response: Response;
  try {
    response = await fetch(`${GHL_BASE_URL}/medias/upload-file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}`, Version: "v3", LocationId: input.locationId },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("GoHighLevel dealership media upload timed out after 45 seconds");
    }
    throw error;
  }
  const upload = await readGhlWriteResponse<{ url?: string }>(response, "dealership mailpiece JPEG upload");
  if (!upload.url) throw new Error("GoHighLevel media upload returned no image URL");
  return upload.url;
}

/** Updates all required campaign image custom values only after confirming every target field exists. */
export async function syncRequiredCustomValues(locationId: string, apiKey: string, values: Record<string, string>): Promise<void> {
  const existingValues = await listLocationCustomValues(locationId, apiKey);
  const updates = Object.entries(values).map(([key, value]) => {
    const existing = existingValues.find(item => normalizeCustomValueKey(item.fieldKey) === `custom_values.${key}`);
    if (!existing) throw new Error(`Required dealership custom value ${key} was not found`);
    return { existing, value };
  });
  for (const update of updates) {
    await updateLocationCustomValue(locationId, apiKey, update.existing, update.value);
  }
}

export async function syncCustomValues(
  locationId: string,
  apiKey: string,
  values: Record<string, string>
): Promise<{ updated: number; skipped: number }> {
  const existingValues = await listLocationCustomValues(locationId, apiKey);
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

    await updateLocationCustomValue(locationId, apiKey, existing, value);
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

export function campaignCustomValues(
  properties: ProductionProperties,
  dealership: DealershipProperties
): Record<string, string> {
  const start = formatMonthDay(properties.event_start);
  const end = formatMonthDay(properties.event_end);
  const startMonth = start.split(" ")[0] ?? "";
  const endMonth = end.split(" ")[0] ?? "";
  const endDay = properties.event_end?.split("-")[2]?.replace(/^0/, "") ?? "";
  const team = [properties.closer, properties.greeter].filter(Boolean).join(", ");
  const alias = dealership.alias?.trim() ?? "";
  const aliasFirstName = alias.split(/\s+/)[0] ?? "";
  const campaignDates =
    start && end
      ? startMonth === endMonth
        ? `${start}-${endDay}`
        : `${start}-${end}`
      : start || end;
  return {
    campaign_dates: campaignDates,
    campaign_start_date: start,
    campaign_end_date: end,
    ask_for: alias,
    alias_name: alias,
    alias_1st_name: aliasFirstName,
    alias_position: dealership.alias_position ?? "",
    kbb_ed: startMonth,
    event_coodinator: team,
    campaign_theme: [properties.mailer, properties.mailer_2].filter(Boolean).join(" / "),
  };
}

import { Router, Request, Response } from "express";
import { upsertCanvasLog, getCanvasByChannelName, clearCanvasLog, insertChannelArchiveJob, updateChannelArchiveJobTaskUid, getPendingArchiveJobs, updateChannelArchiveJobStatus } from "./db";
import { createHeartbeatJob } from "./_core/heartbeat";

export const GHL_API_KEY = "pit-4ceff49d-22c5-42df-bc34-8fb8a6a29fe2";
export const GHL_LOCATION_ID = "UGJmliC4GETAgeO6IDXa";
export const SLACK_BOT_TOKEN = "xoxb-414532258742-11486505580721-34wVikPoiBR6MR8ZIRLb8hOr";

interface DealershipProperties {
  dealership_name?: string;
  street_address?: string;
  city?: string;
  state?: string;
  zip?: number | string;
  tracking?: string;
  tracking__2?: string;
  website?: string;
  alias?: string;
  alias_position?: string;
  hours?: string;
  crm_email?: string;
  brand?: string;
  crm_link?: string;
  passcode?: string;
  loc_id?: string;
  verified?: string;
  phone?: string;
  coop_dealer?: string;
  contact_owner?: string;
  api_key?: string;
}

interface ProductionProperties {
  production?: string;
  event_start?: string;
  event_end?: string;
  scf_date?: string;
  deal_stage?: string;
  mailer?: string;
  mailer_2?: string;
  mail_count?: number | string;
  job_numbers?: string;
  sales_rep?: string;
  closer?: string;
  greeter?: string;
  price?: { value?: number } | number | string;
  pin_code_ranges?: string;
}

interface GHLRelation {
  objectKey: string;
  recordId: string;
}

// Format date from YYYY-MM-DD to M/D/YYYY
function fmtDate(s?: string): string {
  if (!s) return "";
  const parts = s.split("-");
  if (parts.length !== 3) return s;
  return `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
}

// Format tracking/phone to xxx-xxx-xxxx
function fmtPhone(s?: string): string {
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  const d10 = digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
  if (d10.length === 10) return `${d10.slice(0, 3)}-${d10.slice(3, 6)}-${d10.slice(6)}`;
  return s;
}

export async function fetchDealership(recordId: string): Promise<DealershipProperties | null> {
  try {
    const resp = await fetch(
      `https://services.leadconnectorhq.com/objects/custom_objects.dealerships/records/${recordId}`,
      {
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          Version: "v3",
        },
      }
    );
    const data = (await resp.json()) as { record?: { properties?: DealershipProperties } };
    return data.record?.properties ?? null;
  } catch {
    return null;
  }
}

export async function fetchProductionRecord(channelName: string): Promise<{
  properties: ProductionProperties;
  relations?: GHLRelation[];
} | null> {
  const resp = await fetch(
    "https://services.leadconnectorhq.com/objects/custom_objects.production/records/search",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        Version: "v3",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locationId: GHL_LOCATION_ID,
        page: 1,
        pageLimit: 1,
        query: channelName,
      }),
    }
  );
  const data = (await resp.json()) as {
    records?: Array<{ properties: ProductionProperties; relations?: GHLRelation[] }>;
  };
  return data.records?.[0] ?? null;
}

export function buildCanvasMarkdown(
  p: ProductionProperties,
  d: DealershipProperties,
  channelName: string
): string {
  const address = [d.street_address, d.city, d.state, d.zip].filter(Boolean).join(", ");
  return `# GHL Production Details

| Field | Value |
|:---|---|
| **━━━ CAMPAIGN INFO ━━━** | |
| Production | ${p.production ?? ""} |
| Dealership | ${d.dealership_name ?? ""} |
| Event Start | ${fmtDate(p.event_start)} |
| Event End | ${fmtDate(p.event_end)} |
| SCF Date | ${fmtDate(p.scf_date)} |
| **━━━ DEALERSHIP INFO ━━━** | |
| Address | ${address} |
| Sales Hours | ${d.hours ?? ""} |
| Tracking # | ${fmtPhone(d.tracking)} |
| Tracking # 2 | ${fmtPhone(d.tracking__2)} |
| Website | ${d.website ?? ""} |
| Alias | ${d.alias ?? ""} |
| Position | ${d.alias_position ?? ""} |
| **━━━ PRODUCTION DETAILS ━━━** | |
| Mailer | ${p.mailer ?? ""} |
| Mailer 2 | ${p.mailer_2 ?? ""} |
| Mail Count | ${p.mail_count ?? ""} |
| Job # | ${p.job_numbers ?? ""} |
| Pin Code Ranges | ${p.pin_code_ranges ?? ""} |
| **━━━ TEAM ━━━** | |
| Sales Rep | ${p.sales_rep ?? ""} |
| Closer | ${p.closer ?? ""} |
| Greeter | ${p.greeter ?? ""} |

---
*Last updated: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}*`;
}

/**
 * Create or update a Slack canvas in a channel.
 * If an existing canvas ID is provided, it is updated in place (no ghost tabs).
 * Slack's canvases.edit returns ok:true even for deleted canvases, so we verify
 * the canvas is still accessible via canvases.sections.lookup after editing.
 * If it's gone, we clear the stale DB record and create a fresh canvas.
 */
export async function createOrReplaceCanvas(
  channelId: string,
  channelName: string,
  markdown: string,
  existingCanvasId?: string | null
): Promise<string | null> {
  // If we have an existing canvas, try to update it in place using canvases.edit
  if (existingCanvasId) {
    const editResp = await fetch("https://slack.com/api/canvases.edit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        canvas_id: existingCanvasId,
        changes: [
          {
            operation: "replace",
            document_content: {
              type: "markdown",
              markdown,
            },
          },
        ],
      }),
    });
    const editData = (await editResp.json()) as { ok: boolean; error?: string };

    if (editData.ok) {
      console.log(`[ghl] Canvas updated in place: ${existingCanvasId} in channel ${channelId}`);
      return existingCanvasId;
    }
    // If edit fails (e.g. canvas was manually deleted), fall through to create a new one
    console.warn(`[ghl] Canvas edit failed (${editData.error}), creating new canvas`);
  }

  const canvasResp = await fetch("https://slack.com/api/canvases.create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel_id: channelId,
      title: "Production",
      document_content: {
        type: "markdown",
        markdown,
      },
    }),
  });

  const canvasData = (await canvasResp.json()) as {
    ok: boolean;
    error?: string;
    canvas_id?: string;
  };

  if (canvasData.ok && canvasData.canvas_id) {
    console.log(`[ghl] Canvas created: ${canvasData.canvas_id} in channel ${channelId}`);
    await upsertCanvasLog(channelId, channelName, canvasData.canvas_id);
    return canvasData.canvas_id;
  } else {
    console.error(`[ghl] Canvas creation failed: ${canvasData.error}`);
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        text: `⚠️ Could not create GHL canvas: ${canvasData.error}`,
      }),
    });
    return null;
  }
}

export const ghlRouter = Router();

// POST /slack/ghl — Slack slash command handler
ghlRouter.post("/ghl", async (req: Request, res: Response) => {
  const body = req.body as Record<string, string>;
  const channelId = body.channel_id;
  const channelName = body.channel_name;

  if (!channelId || !channelName) {
    res.status(400).send("Missing channel_id or channel_name");
    return;
  }

  // Acknowledge Slack immediately (must respond within 3s)
  res.status(200).send("");

  try {
    // Join the channel
    await fetch("https://slack.com/api/conversations.join", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: channelId }),
    });

    // Fetch production record
    const record = await fetchProductionRecord(channelName);

    let markdown: string;

    if (!record) {
      markdown = `# GHL Production Details\n\n> No production record found for channel \`${channelName}\`.\n\n*Generated by /ghl*`;
    } else {
      const p = record.properties;
      const dealershipRelation = record.relations?.find(
        (r) => r.objectKey === "custom_objects.dealerships"
      );
      const d: DealershipProperties = dealershipRelation
        ? (await fetchDealership(dealershipRelation.recordId)) ?? {}
        : {};
      markdown = buildCanvasMarkdown(p, d, channelName);
    }

    // Get existing canvas ID to replace if present
    const existingCanvasId = await getCanvasByChannelName(channelName);
    await createOrReplaceCanvas(channelId, channelName, markdown, existingCanvasId);
  } catch (err) {
    console.error("[ghl] Error:", err);
  }
});

// POST /slack/proof-status — GHL proof stage dropdown webhook
ghlRouter.post("/proof-status", async (req: Request, res: Response) => {
  res.status(200).send("ok");

  try {
    const payload = req.body as Record<string, string>;
    console.log("[proof-status] Received payload:", JSON.stringify(payload));

    // Expected fields from GHL workflow:
    // production_name, proof_stage, mailer, mailer_2, event_start, event_end, dealership_name, job_numbers
    // channel_name is derived from production_name if not provided
    let channelName = payload.channel_name;
    if (!channelName && payload.production_name) {
      channelName = payload.production_name.toLowerCase().replace(/\s+/g, "-");
    }
    if (!channelName) {
      console.warn("[proof-status] No channel_name or production_name — skipping");
      return;
    }

    // Look up channel ID from DB
    const { getDb } = await import("./db");
    const { canvasLog } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) {
      console.warn("[proof-status] No DB connection");
      return;
    }
    const rows = await db
      .select()
      .from(canvasLog)
      .where(eq(canvasLog.channelName, channelName))
      .limit(1);
    if (rows.length === 0) {
      console.warn(`[proof-status] No channel ID found for ${channelName} — run /ghl first`);
      return;
    }
    const channelId = rows[0].channelId;

    const stage = (payload.proof_stage ?? "").trim();

    // Fetch fresh production record from GHL to get all fields + dealership name
    const record = await fetchProductionRecord(channelName);
    const p = record?.properties ?? {};
    const dealershipRelation = record?.relations?.find(
      (r) => r.objectKey === "custom_objects.dealerships"
    );
    const d = dealershipRelation
      ? (await fetchDealership(dealershipRelation.recordId)) ?? {}
      : {};

    const mailer = p.mailer ?? payload.mailer ?? "";
    const mailer2 = p.mailer_2 ?? payload.mailer_2 ?? "";
    const eventStart = fmtDate(p.event_start ?? payload.event_start);
    const eventEnd = fmtDate(p.event_end ?? payload.event_end);
    const dealership = d.dealership_name ?? payload.dealership_name ?? "";
    const jobNumbers = p.job_numbers ?? payload.job_numbers ?? "";

    // Build mailpiece string
    const mailpieces = [mailer, mailer2].filter(Boolean).join(" / ");

    type SlackBlock = {
      type: string;
      text?: { type: string; text: string; emoji?: boolean };
    };

    let color = "#0000FF";
    let headerText = "";
    const blocks: SlackBlock[] = [];

    if (stage === "request_proof" || stage === "Request Proof") {
      color = "#0066CC"; // blue
      headerText = "🖨️ Proof Request";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🖨️ Proof Request*\n<@U014TE8F60Z> Proof request *${mailpieces}* ${eventStart} - ${eventEnd} for *${dealership}*`,
        },
      });
    } else if (stage === "proofing_needed" || stage === "Proofing Needed") {
      color = "#CC0000"; // red
      headerText = "📋 Proofing Needed";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📋 Proofing Needed*\n<!subteam^S014MV4QKLN> proofing needed on the mailpiece(s) above. Thanks!!!`,
        },
      });
    } else if (stage === "approved_to_upload" || stage === "Approved to Upload") {
      color = "#FFB300"; // yellow/amber
      headerText = "✅ Approved to Upload";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*✅ Approved to Upload*\n<@U014TE8F60Z> approved to upload Job #*${jobNumbers}*`,
        },
      });
    } else if (stage === "sent_to_print" || stage === "Sent to Print") {
      color = "#2EB67D"; // green
      headerText = "📤 Sent to Print";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📤 Sent to Print*\nUploaded to MBI 📤 <@U01403J8J3H>`,
        },
      });
    } else {
      console.warn(`[proof-status] Unknown stage: "${stage}" — skipping`);
      return;
    }

    const msgResp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        attachments: [
          {
            color,
            blocks,
          },
        ],
      }),
    });
    const msgData = (await msgResp.json()) as { ok: boolean; error?: string };
    if (msgData.ok) {
      console.log(`[proof-status] Posted "${stage}" to channel ${channelId}`);
    } else {
      console.error(`[proof-status] Failed to post message: ${msgData.error}`);
    }
  } catch (err) {
    console.error("[proof-status] Error:", err);
  }
});

// POST /dealership-sync — fires when Dealership Verified field is set to "verified"
ghlRouter.post("/dealership-sync", async (req: Request, res: Response) => {
  res.status(200).send("ok");

  try {
    const payload = req.body as Record<string, string>;
    console.log("[dealership-sync] Received payload:", JSON.stringify(payload));

    const verifiedValue = (payload.verified ?? "").trim().toLowerCase();
    if (verifiedValue !== "verified") {
      console.log(`[dealership-sync] Verified = "${verifiedValue}" — skipping`);
      return;
    }

    const recordId = payload.record_id;
    if (!recordId) {
      console.warn("[dealership-sync] No record_id in payload — skipping");
      return;
    }

    // Fetch full dealership record from ADO GHL
    const resp = await fetch(
      `https://services.leadconnectorhq.com/objects/custom_objects.dealerships/records/${recordId}`,
      {
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          Version: "v3",
        },
      }
    );
    const data = (await resp.json()) as { record?: { properties?: DealershipProperties } };
    const d = data.record?.properties;
    if (!d) {
      console.warn(`[dealership-sync] No dealership record found for ${recordId}`);
      return;
    }

    const locId = d.loc_id?.trim();
    if (!locId) {
      console.warn(`[dealership-sync] No loc_id on dealership record ${recordId} — skipping`);
      return;
    }

    const subApiKey = (d as any).api_key?.trim();
    if (!subApiKey) {
      console.warn(`[dealership-sync] No api_key on dealership record ${recordId} — skipping`);
      return;
    }

    // Build address strings
    const addressParts = [d.street_address, d.city, d.state, String(d.zip ?? "").trim()].filter(Boolean);
    const addressFull = addressParts.join(", ");

    // Split alias into first name + full name
    const aliasName = d.alias ?? "";
    const aliasFirstName = aliasName.split(" ")[0] ?? "";

    // Map ADO fields → subaccount custom value keys
    const customValueUpdates: Record<string, string> = {
      dealership_name: d.dealership_name ?? "",
      dealership_address: addressFull,
      dealership_address_full: addressFull,
      dealer_website: d.website ?? "",
      dealership_tracking_number: fmtPhone(d.tracking),
      dealership_tracking_number_2: fmtPhone(d.tracking__2),
      our_hours: d.hours ?? "",
      crm_email: d.crm_email ?? "",
      alias_name: aliasName,
      alias_1st_name: aliasFirstName,
      alias_position: d.alias_position ?? "",
      brand: d.brand ?? "",
      crm_link: d.crm_link ?? "",
      passcode: d.passcode ?? "",
    };

    // Fetch existing custom values for the subaccount
    const cvResp = await fetch(
      `https://services.leadconnectorhq.com/locations/${locId}/customValues`,
        {
          headers: {
            Authorization: `Bearer ${subApiKey}`,
            Version: "2021-07-28",
          },
      }
    );
    const cvData = (await cvResp.json()) as {
      customValues?: Array<{ id: string; name: string; fieldKey: string; value: string }>;
    };
    const existingValues = cvData.customValues ?? [];

    // Update each custom value by matching on fieldKey
    let updated = 0;
    let skipped = 0;
    for (const [key, value] of Object.entries(customValueUpdates)) {
      if (!value) { skipped++; continue; }
      // GHL returns fieldKey wrapped in template syntax: "{{ custom_values.key }}"
      // Normalize by stripping {{ }} and whitespace before matching
      const normalizedKey = `custom_values.${key}`;
      const existing = existingValues.find((cv) => {
        const normalized = cv.fieldKey.replace(/\{\{\s*/g, '').replace(/\s*\}\}/g, '').trim();
        return normalized === normalizedKey;
      });
      if (!existing) {
        console.warn(`[dealership-sync] No custom value found for key custom_values.${key} in loc ${locId}`);
        skipped++;
        continue;
      }
      const updateResp = await fetch(
        `https://services.leadconnectorhq.com/locations/${locId}/customValues/${existing.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${subApiKey}`,
            Version: "2021-07-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: existing.name, value }),
        }
      );
      const updateData = (await updateResp.json()) as { customValue?: { id: string } };
      if (updateData.customValue?.id) {
        updated++;
      } else {
        console.warn(`[dealership-sync] Failed to update custom_values.${key}:`, JSON.stringify(updateData));
        skipped++;
      }
    }

    console.log(`[dealership-sync] Done for loc ${locId}: ${updated} updated, ${skipped} skipped`);

    // Post confirmation message to notification channel
    const notifyChannelId = "C0ADXCMLS4W"; // GHL New Subaccounts channel
    const dealershipName = d.dealership_name ?? locId;
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: notifyChannelId,
        text: `Dealership Custom Values have been updated in *${dealershipName}*. Please review. <@U014TE8F60Z> <@U01403J8J3H>`,
      }),
    });
  } catch (err) {
    console.error("[dealership-sync] Error:", err);
  }
});

// POST /ghl-webhook — GHL workflow webhook (fires when production record is updated)
ghlRouter.post("/ghl-webhook", async (req: Request, res: Response) => {
  // Respond immediately so GHL doesn't retry
  res.status(200).send("ok");

  try {
    const payload = req.body as Record<string, string>;
    console.log("[ghl-webhook] Received payload:", JSON.stringify(payload));

    // GHL sends the production name and channel name as custom data fields
    // We expect: production_name (e.g. "2607 Westshore Honda AME")
    // and optionally channel_name (e.g. "2607-westshore-honda-ame")
    // If channel_name not provided, derive it from production_name
    let channelName = payload.channel_name;
    if (!channelName && payload.production_name) {
      channelName = payload.production_name.toLowerCase().replace(/\s+/g, "-");
    }

    if (!channelName) {
      console.warn("[ghl-webhook] No channel_name or production_name in payload — skipping");
      return;
    }

    // Look up the Slack channel ID from our canvas log
    // We need the channel_id to create the canvas — GHL must send it or we derive from DB
    let channelId = payload.channel_id;
    if (!channelId) {
      // Try to get it from our DB (stored when canvas was first created via /ghl)
      const { getDb } = await import("./db");
      const { canvasLog } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const rows = await db
          .select()
          .from(canvasLog)
          .where(eq(canvasLog.channelName, channelName))
          .limit(1);
        if (rows.length > 0) {
          channelId = rows[0].channelId;
        }
      }
    }

    if (!channelId) {
      console.warn(`[ghl-webhook] No channel_id found for channel ${channelName} — skipping`);
      return;
    }

    // Fetch fresh production record from GHL
    const record = await fetchProductionRecord(channelName);
    if (!record) {
      console.warn(`[ghl-webhook] No production record found for ${channelName}`);
      return;
    }

    const p = record.properties;
    console.log(`[ghl-webhook] Production properties for ${channelName}:`, JSON.stringify(p));
    const dealershipRelation = record.relations?.find(
      (r) => r.objectKey === "custom_objects.dealerships"
    );
    const d: DealershipProperties = dealershipRelation
      ? (await fetchDealership(dealershipRelation.recordId)) ?? {}
      : {};

    const markdown = buildCanvasMarkdown(p, d, channelName);
    const existingCanvasId = await getCanvasByChannelName(channelName);
    await createOrReplaceCanvas(channelId, channelName, markdown, existingCanvasId);

    console.log(`[ghl-webhook] Canvas refreshed for ${channelName}`);
  } catch (err) {
    console.error("[ghl-webhook] Error:", err);
  }
});

// Helper: format a date string (YYYY-MM-DD) as "Month D" e.g. "July 16"
function fmtMonthDay(s?: string): string {
  if (!s) return "";
  const parts = s.split("-");
  if (parts.length !== 3) return s;
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const month = months[parseInt(parts[1]) - 1] ?? "";
  const day = parseInt(parts[2]);
  return `${month} ${day}`;
}

// Helper: format date range as "Month D-D" e.g. "July 16-20"
function fmtCampaignDates(start?: string, end?: string): string {
  if (!start) return "";
  const startFmt = fmtMonthDay(start);
  if (!end) return startFmt;
  const endDay = parseInt((end.split("-")[2] ?? "0"));
  return `${startFmt}-${endDay}`;
}

// Helper: build ask_for / event_coordinator from closer + greeter (non-empty only)
function fmtTeamNames(closer?: string, greeter?: string): string {
  return [closer, greeter].filter(Boolean).join(", ");
}

// POST /slack/push-campaign-values — push campaign custom values to subaccount
// Triggered by GHL workflow when Production status → "production"
ghlRouter.post("/push-campaign-values", async (req: Request, res: Response) => {
  res.status(200).send("ok");

  try {
    const payload = req.body as Record<string, string>;
    console.log("[push-campaign-values] Received payload:", JSON.stringify(payload));

    // Derive production name
    const productionName = payload.production_name;
    if (!productionName) {
      console.warn("[push-campaign-values] No production_name in payload — skipping");
      return;
    }

    const channelName = productionName.toLowerCase().replace(/\s+/g, "-");

    // Fetch fresh production record from GHL ADO account
    const record = await fetchProductionRecord(channelName);
    if (!record) {
      console.warn(`[push-campaign-values] No production record found for ${channelName}`);
      return;
    }

    const p = record.properties;

    // Get linked dealership to retrieve subaccount api_key and loc_id
    const dealershipRelation = record.relations?.find(
      (r) => r.objectKey === "custom_objects.dealerships"
    );
    if (!dealershipRelation) {
      console.warn(`[push-campaign-values] No dealership relation on production record ${channelName}`);
      return;
    }

    const d = await fetchDealership(dealershipRelation.recordId);
    if (!d) {
      console.warn(`[push-campaign-values] Could not fetch dealership for ${channelName}`);
      return;
    }

    const locId = d.loc_id?.trim();
    const subApiKey = (d as any).api_key?.trim();

    if (!locId || !subApiKey) {
      console.warn(`[push-campaign-values] Missing loc_id or api_key for dealership linked to ${channelName}`);
      return;
    }

    // Build campaign custom value updates
    const startDate = p.event_start;
    const endDate = p.event_end;
    const closer = p.closer ?? "";
    const greeter = p.greeter ?? "";

    const campaignDates = fmtCampaignDates(startDate, endDate);
    const campaignStartDate = fmtMonthDay(startDate);
    const campaignEndDate = fmtMonthDay(endDate);
    const kbbEd = startDate ? fmtMonthDay(startDate).split(" ")[0] ?? "" : ""; // just the month
    const teamNames = fmtTeamNames(closer, greeter);

    const customValueUpdates: Record<string, string> = {
      campaign_dates: campaignDates,
      campaign_start_date: campaignStartDate,
      campaign_end_date: campaignEndDate,
      kbb_ed: kbbEd,
      ask_for: teamNames,
      event_coodinator: teamNames, // note: GHL field key has typo "coodinator"
    };

    // Fetch existing custom values for the subaccount
    const cvResp = await fetch(
      `https://services.leadconnectorhq.com/locations/${locId}/customValues`,
      {
        headers: {
          Authorization: `Bearer ${subApiKey}`,
          Version: "2021-07-28",
        },
      }
    );
    if (!cvResp.ok) {
      const errText = await cvResp.text().catch(() => "");
      console.error(`[push-campaign-values] GHL customValues fetch failed (${cvResp.status}) for loc ${locId}: ${errText}`);
      return;
    }
    const cvData = (await cvResp.json()) as {
      customValues?: Array<{ id: string; name: string; fieldKey: string; value: string }>;
    };
    const existingValues = cvData.customValues ?? [];

    let updated = 0;
    let skipped = 0;
    for (const [key, value] of Object.entries(customValueUpdates)) {
      if (!value) { skipped++; continue; }
      const normalizedKey = `custom_values.${key}`;
      const existing = existingValues.find((cv) => {
        const normalized = cv.fieldKey.replace(/\{\{\s*/g, "").replace(/\s*\}\}/g, "").trim();
        return normalized === normalizedKey;
      });
      if (!existing) {
        console.warn(`[push-campaign-values] No custom value found for key custom_values.${key} in loc ${locId}`);
        skipped++;
        continue;
      }
      const updateResp = await fetch(
        `https://services.leadconnectorhq.com/locations/${locId}/customValues/${existing.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${subApiKey}`,
            Version: "2021-07-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: existing.name, value }),
        }
      );
      const updateData = (await updateResp.json()) as { customValue?: { id: string } };
      if (updateData.customValue?.id) {
        updated++;
      } else {
        console.warn(`[push-campaign-values] Failed to update custom_values.${key}:`, JSON.stringify(updateData));
        skipped++;
      }
    }

    console.log(`[push-campaign-values] Done for ${productionName} (loc ${locId}): ${updated} updated, ${skipped} skipped`);

    // Post confirmation to Slack notification channel
    const notifyChannelId = "C0ADXCMLS4W";
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: notifyChannelId,
        text: `Campaign custom values updated in *${d.dealership_name ?? productionName}* subaccount. Campaign: *${campaignDates}* | Team: *${teamNames || "—"}* <@U014TE8F60Z>`,
      }),
    });
  } catch (err) {
    console.error("[push-campaign-values] Error:", err);
  }
});

// POST /slack/create-channel — auto-create Slack channel when Production status → "production"
// GHL workflow sends: production_name
ghlRouter.post("/create-channel", async (req: Request, res: Response) => {
  res.status(200).send("ok");

  try {
    const payload = req.body as Record<string, string>;
    console.log("[create-channel] Received payload:", JSON.stringify(payload));

    const productionName = payload.production_name;
    if (!productionName) {
      console.warn("[create-channel] No production_name in payload — skipping");
      return;
    }

    const channelName = productionName.toLowerCase().replace(/\s+/g, "-");

    // Check if channel already exists in our DB (avoid duplicates)
    const existingCanvasId = await getCanvasByChannelName(channelName);
    if (existingCanvasId) {
      console.log(`[create-channel] Channel ${channelName} already exists in DB — skipping creation`);
      return;
    }

    // Create the Slack channel
    const createResp = await fetch("https://slack.com/api/conversations.create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: channelName, is_private: false }),
    });
    const createData = (await createResp.json()) as {
      ok: boolean;
      error?: string;
      channel?: { id: string; name: string };
    };

    // Fetch production record to get event_end for archive scheduling
    const prodRecord = await fetchProductionRecord(channelName);
    const eventEndDate = prodRecord?.properties?.event_end;

    if (!createData.ok) {
      // Channel may already exist in Slack but not in our DB
      if (createData.error === "name_taken") {
        console.warn(`[create-channel] Channel ${channelName} already exists in Slack — will try to find it`);
        // Look up the existing channel
        const listResp = await fetch(
          `https://slack.com/api/conversations.list?limit=1000&exclude_archived=true`,
          { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
        );
        const listData = (await listResp.json()) as {
          ok: boolean;
          channels?: Array<{ id: string; name: string }>;
        };
        const existing = listData.channels?.find((c) => c.name === channelName);
        if (!existing) {
          console.error(`[create-channel] Could not find existing channel ${channelName}`);
          return;
        }
        // Fall through with existing channel ID
        const channelId = existing.id;
        await joinAndSetupChannel(channelId, channelName, productionName, eventEndDate);
        return;
      }
      console.error(`[create-channel] Failed to create channel ${channelName}: ${createData.error}`);
      return;
    }

    const channelId = createData.channel!.id;
    console.log(`[create-channel] Created channel ${channelName} (${channelId})`);

    await joinAndSetupChannel(channelId, channelName, productionName, eventEndDate);
  } catch (err) {
    console.error("[create-channel] Error:", err);
  }
});

// POST /api/scheduled/archive-channel — heartbeat callback to archive channels past their archiveAfter date
// Mounted at /api in index.ts, so path here is /scheduled/archive-channel
ghlRouter.post("/scheduled/archive-channel", async (req: Request, res: Response) => {
  res.status(200).send("ok");
  try {
    const jobs = await getPendingArchiveJobs();
    if (jobs.length === 0) {
      console.log("[archive-channel] No pending archive jobs due");
      return;
    }
    console.log(`[archive-channel] Processing ${jobs.length} pending archive job(s)`);
    for (const job of jobs) {
      try {
        const archiveResp = await fetch("https://slack.com/api/conversations.archive", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ channel: job.channelId }),
        });
        const archiveData = (await archiveResp.json()) as { ok: boolean; error?: string };
        if (archiveData.ok) {
          await updateChannelArchiveJobStatus(job.id, "archived");
          console.log(`[archive-channel] Archived channel ${job.channelName} (${job.channelId})`);
          // Notify Slack
          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: "C0ADXCMLS4W",
              text: `🗄️ Channel *#${job.channelName}* has been auto-archived (3 days after campaign end date).`,
            }),
          });
        } else {
          console.error(`[archive-channel] Failed to archive ${job.channelName}: ${archiveData.error}`);
          await updateChannelArchiveJobStatus(job.id, "failed");
        }
      } catch (jobErr) {
        console.error(`[archive-channel] Error processing job ${job.id}:`, jobErr);
        await updateChannelArchiveJobStatus(job.id, "failed");
      }
    }
  } catch (err) {
    console.error("[archive-channel] Error:", err);
  }
});

// Helper: join channel, invite @deals group, create canvas, post welcome message
async function joinAndSetupChannel(channelId: string, channelName: string, productionName: string, eventEndDate?: string): Promise<void> {
  // Bot joins the channel
  await fetch("https://slack.com/api/conversations.join", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId }),
  });

  // Invite the @deals usergroup members
  // First get the usergroup members
  const ugResp = await fetch(
    "https://slack.com/api/usergroups.users.list?usergroup=S014MV4QKLN",
    { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
  );
  const ugData = (await ugResp.json()) as { ok: boolean; users?: string[] };
  if (ugData.ok && ugData.users && ugData.users.length > 0) {
    await fetch("https://slack.com/api/conversations.invite", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: channelId, users: ugData.users.join(",") }),
    });
    console.log(`[create-channel] Invited ${ugData.users.length} @deals members to ${channelName}`);
  }

  // Fetch production record and build canvas
  const record = await fetchProductionRecord(channelName);
  let markdown: string;
  if (!record) {
    markdown = `# GHL Production Details\n\n> No production record found for channel \`${channelName}\`.\n\n*Generated automatically*`;
  } else {
    const p = record.properties;
    const dealershipRelation = record.relations?.find(
      (r) => r.objectKey === "custom_objects.dealerships"
    );
    const d: DealershipProperties = dealershipRelation
      ? (await fetchDealership(dealershipRelation.recordId)) ?? {}
      : {};
    markdown = buildCanvasMarkdown(p, d, channelName);
  }

  // Create the canvas
  await createOrReplaceCanvas(channelId, channelName, markdown, null);

  // Post welcome message
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      text: `📋 Channel created for *${productionName}*. Production canvas has been generated above.`,
    }),
  });

  // Schedule auto-archive: 3 days after campaign end date
  if (eventEndDate) {
    try {
      // Parse YYYY-MM-DD using Date.UTC to avoid timezone issues
      const endParts = eventEndDate.split("-").map(Number);
      if (endParts.length === 3 && !isNaN(endParts[0]) && !isNaN(endParts[1]) && !isNaN(endParts[2])) {
        // Use Date object arithmetic so month-end rollover is handled automatically
        const archiveDate = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2] + 3, 12, 0, 0));
        const archiveDay = archiveDate.getUTCDate();
        const archiveMonth = archiveDate.getUTCMonth() + 1; // 1-indexed
        const archiveYear = archiveDate.getUTCFullYear();
        // Insert DB record first (before creating heartbeat job)
        await insertChannelArchiveJob(channelId, channelName, archiveDate);
        // Build cron: fire at noon UTC on the exact archive date
        // Format: "0 sec min hour dom mon dow" — 6-field with seconds
        const cron = `0 0 12 ${archiveDay} ${archiveMonth} *`;
        const jobResult = await createHeartbeatJob(
          {
            name: `archive-${channelId}`,
            cron,
            path: "/api/scheduled/archive-channel",
            method: "POST",
            payload: { channel_id: channelId },
            description: `Auto-archive #${channelName} on ${archiveYear}-${String(archiveMonth).padStart(2,'0')}-${String(archiveDay).padStart(2,'0')} (3 days after campaign end)`,
          },
          "" // empty string = owner identity
        );
        await updateChannelArchiveJobTaskUid(channelId, jobResult.taskUid);
        console.log(`[create-channel] Scheduled archive for ${channelName} on ${archiveDate.toISOString()} (taskUid: ${jobResult.taskUid})`);
      } else {
        console.warn(`[create-channel] Invalid event_end date format: ${eventEndDate} — skipping archive scheduling`);
      }
    } catch (archiveErr) {
      console.error(`[create-channel] Failed to schedule archive for ${channelName}:`, archiveErr);
    }
  }

  console.log(`[create-channel] Setup complete for ${channelName} (${channelId})`);
}

// POST /slack/backfill-archive-jobs — schedule archive jobs for existing channels that were
// created before the auto-archive feature existed.
// Body: { channels: ["2607-airport-chrysler-1c", "2607-kia-south-atlanta-1c", ...] }
// Or omit body / send {} to process all channels in canvas_log that have no archive job yet.
ghlRouter.post("/backfill-archive-jobs", async (req: Request, res: Response) => {
  res.status(200).send("ok");
  try {
    const payload = req.body as { channels?: string[] };
    const channelList: string[] = payload.channels ?? [];

    // If no list provided, pull all channels from canvas_log
    let targets: Array<{ channelId: string; channelName: string }> = [];
    if (channelList.length === 0) {
      const { getDb: getDb2 } = await import("./db");
      const db = await getDb2();
      if (!db) {
        console.error("[backfill-archive-jobs] DB not available");
        return;
      }
      const { canvasLog: clTable } = await import("../drizzle/schema");
      const rows = await db.select().from(clTable);
      targets = rows.map((r) => ({ channelId: r.channelId, channelName: r.channelName }));
    } else {
      // Look up channelIds from canvas_log for the provided names
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) {
        console.error("[backfill-archive-jobs] DB not available");
        return;
      }
      const { canvasLog: clTable } = await import("../drizzle/schema");
      const { inArray } = await import("drizzle-orm");
      const rows = await db.select().from(clTable).where(inArray(clTable.channelName, channelList));
      targets = rows.map((r) => ({ channelId: r.channelId, channelName: r.channelName }));
      // For any channel names not in canvas_log, we still need to process them
      // (they may not have a canvas yet — use a placeholder channelId of "unknown")
      for (const name of channelList) {
        if (!targets.find((t) => t.channelName === name)) {
          targets.push({ channelId: "unknown", channelName: name });
        }
      }
    }

    console.log(`[backfill-archive-jobs] Processing ${targets.length} channel(s)`);

    const results: Array<{ channelName: string; status: string; archiveDate?: string }> = [];

    for (const target of targets) {
      const { channelName, channelId } = target;
      try {
        // Fetch production record to get event_end
        const record = await fetchProductionRecord(channelName);
        if (!record) {
          console.warn(`[backfill-archive-jobs] No GHL record found for ${channelName}`);
          results.push({ channelName, status: "no_ghl_record" });
          continue;
        }
        const eventEndDate = record.properties.event_end;
        if (!eventEndDate) {
          console.warn(`[backfill-archive-jobs] No event_end on GHL record for ${channelName}`);
          results.push({ channelName, status: "no_event_end" });
          continue;
        }

        // Parse and compute archive date
        const endParts = eventEndDate.split("-").map(Number);
        if (endParts.length !== 3 || isNaN(endParts[0]) || isNaN(endParts[1]) || isNaN(endParts[2])) {
          console.warn(`[backfill-archive-jobs] Invalid event_end format for ${channelName}: ${eventEndDate}`);
          results.push({ channelName, status: "invalid_date" });
          continue;
        }

        const archiveDate = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2] + 3, 12, 0, 0));
        const archiveDay = archiveDate.getUTCDate();
        const archiveMonth = archiveDate.getUTCMonth() + 1;
        const archiveYear = archiveDate.getUTCFullYear();

        // If archive date is already in the past, skip scheduling but log it
        if (archiveDate < new Date()) {
          console.log(`[backfill-archive-jobs] Archive date ${archiveDate.toISOString()} is in the past for ${channelName} — skipping`);
          results.push({ channelName, status: "past_date", archiveDate: archiveDate.toISOString() });
          continue;
        }

        // Resolve channelId if we only have "unknown"
        let resolvedChannelId = channelId;
        if (resolvedChannelId === "unknown") {
          // Try to look up from Slack
          const listResp = await fetch(
            `https://slack.com/api/conversations.list?limit=1000&exclude_archived=true`,
            { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
          );
          const listData = (await listResp.json()) as {
            ok: boolean;
            channels?: Array<{ id: string; name: string }>;
          };
          const found = listData.channels?.find((c) => c.name === channelName);
          if (!found) {
            console.warn(`[backfill-archive-jobs] Could not find Slack channel ${channelName}`);
            results.push({ channelName, status: "slack_channel_not_found" });
            continue;
          }
          resolvedChannelId = found.id;
        }

        // Insert DB record
        await insertChannelArchiveJob(resolvedChannelId, channelName, archiveDate);

        // Schedule heartbeat job
        const cron = `0 0 12 ${archiveDay} ${archiveMonth} *`;
        const jobResult = await createHeartbeatJob(
          {
            name: `archive-${resolvedChannelId}`,
            cron,
            path: "/api/scheduled/archive-channel",
            method: "POST",
            payload: { channel_id: resolvedChannelId },
            description: `Auto-archive #${channelName} on ${archiveYear}-${String(archiveMonth).padStart(2, "0")}-${String(archiveDay).padStart(2, "0")} (3 days after campaign end)`,
          },
          ""
        );
        await updateChannelArchiveJobTaskUid(resolvedChannelId, jobResult.taskUid);

        const archiveDateStr = `${archiveYear}-${String(archiveMonth).padStart(2, "0")}-${String(archiveDay).padStart(2, "0")}`;
        console.log(`[backfill-archive-jobs] Scheduled ${channelName} for archive on ${archiveDateStr} (taskUid: ${jobResult.taskUid})`);
        results.push({ channelName, status: "scheduled", archiveDate: archiveDateStr });
      } catch (err) {
        console.error(`[backfill-archive-jobs] Error processing ${channelName}:`, err);
        results.push({ channelName, status: "error" });
      }
    }

    // Post summary to Slack notification channel
    const scheduled = results.filter((r) => r.status === "scheduled");
    const skipped = results.filter((r) => r.status !== "scheduled");
    const summaryLines = [
      `*Archive job backfill complete* — ${scheduled.length} scheduled, ${skipped.length} skipped`,
      ...scheduled.map((r) => `  ✅ #${r.channelName} → archive on ${r.archiveDate}`),
      ...skipped.map((r) => {
        const label =
          r.status === "no_event_end" ? "no end date — channel stays in Slack" :
          r.status === "no_ghl_record" ? "no GHL record found" :
          r.status === "past_date" ? `end date already passed (${r.archiveDate}) — channel stays in Slack` :
          r.status === "slack_channel_not_found" ? "Slack channel not found" :
          r.status === "invalid_date" ? "invalid event_end date format" :
          r.status === "error" ? "unexpected error" :
          r.status;
        return `  ⚠️ #${r.channelName} → ${label}`;
      }),
    ];
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: "C0ADXCMLS4W",
        text: summaryLines.join("\n"),
      }),
    });
  } catch (err) {
    console.error("[backfill-archive-jobs] Error:", err);
  }
});

import crypto from "node:crypto";
import { createHeartbeatJob } from "../_core/heartbeat";
import {
  claimActivityDashboardCanvasCreation,
  completeActivityDashboardCanvasCreation,
  getActivityDashboard,
  getActivityDashboardRefreshJob,
  getCampaignActivityMetrics,
  listActivityDashboardRefreshCandidates,
  logRelayAction,
  registerActivityDashboard,
  saveActivityDashboardRefreshJob,
} from "./db";
import { normalizeCampaignChannelName } from "./naming";
import { redactErrorDetail } from "./security";
import { getRelayConfig } from "./config";
import { fetchDealership, listDealershipContactIdsByTag } from "./ghl";
import {
  createActivityDashboardCanvas,
  refreshKnownActivityDashboardCanvas,
  setSlackCanvasChannelReadAccess,
} from "./slack";

/**
 * The Activity Dashboard is intentionally restricted to the agreed ABC Test
 * campaign until its separate Canvas and counted results are visually proven.
 * A later, explicit release can widen this guard without changing the normal
 * Production Canvas or another campaign's data.
 */
export const ACTIVITY_DASHBOARD_TEST_CHANNEL = "2609-abc-test-ame";
export const ACTIVITY_DASHBOARD_REFRESH_JOB_KEY = "activity_dashboard_refresh";
export const ACTIVITY_DASHBOARD_REFRESH_CRON = "0 */15 * * * *";

export const ACTIVITY_SOURCES = [
  "qr_visit",
  "qr_appointment",
  "phone_appointment",
  "sms_appointment",
  "oneclick_appointment",
  "ai_booked_appointment",
  "qr_show",
] as const;

export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

type ActivityDashboardRefreshCandidate = Awaited<ReturnType<typeof listActivityDashboardRefreshCandidates>>[number];

type CampaignForActivity = {
  id: number;
  productionName: string;
  channelName: string;
  channelId: string | null;
  dealershipRecordId?: string | null;
  dealershipLocationId?: string | null;
  eventStartDate: string | null;
  archiveStatus: "not_scheduled" | "scheduled" | "cancelled" | "archived" | "failed";
};

type ActivityMetrics = {
  qrScans: number;
  qrAppointments: number;
  qrVisitsNotYetScheduled: number;
  phoneAppointments: number;
  smsAppointments: number;
  oneclickAppointments: number;
  aiBookedAppointments: number;
  qrShows: number;
};

const sourceLabels: Record<ActivitySource, string> = {
  qr_visit: "QR visits",
  qr_appointment: "QR appointments",
  phone_appointment: "Phone appointments",
  sms_appointment: "SMS appointments",
  oneclick_appointment: "OneClick / Facebook appointments",
  ai_booked_appointment: "AI Booked Appointments",
  qr_show: "QR Shows",
};

/** Current tags count operator-applied changes as well as workflow notices. */
const manualTagSources: ReadonlyArray<{ tag: string; source: ActivitySource }> = [
  { tag: "qr visit", source: "qr_visit" },
  { tag: "qr appointment", source: "qr_appointment" },
  { tag: "phone", source: "phone_appointment" },
  { tag: "sms", source: "sms_appointment" },
  { tag: "1click", source: "oneclick_appointment" },
  { tag: "ai booked appointment", source: "ai_booked_appointment" },
  { tag: "qr show", source: "qr_show" },
  { tag: "qr check in", source: "qr_show" },
];

const asDateOnly = (value: string | null | undefined): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
};

export function getActivityCollectionStart(eventStartDate: string | null | undefined): Date | null {
  const start = asDateOnly(eventStartDate);
  if (!start) return null;
  start.setUTCDate(start.getUTCDate() - 7);
  return start;
}

export function isActivityDashboardTestCampaign(channelName: string): boolean {
  return normalizeCampaignChannelName(channelName) === ACTIVITY_DASHBOARD_TEST_CHANNEL;
}

export function isActivityCollectionOpen(campaign: Pick<CampaignForActivity, "channelName" | "eventStartDate" | "archiveStatus">, now = new Date()): boolean {
  const startsAt = getActivityCollectionStart(campaign.eventStartDate);
  return Boolean(startsAt && now >= startsAt && campaign.archiveStatus !== "archived" && isActivityDashboardTestCampaign(campaign.channelName));
}

export function buildActivityContactFingerprint(contactId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`activity-contact:${contactId.trim()}`).digest("hex");
}

export function buildActivityEventFingerprint(source: ActivitySource, stableReference: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`activity-event:${source}:${stableReference.trim()}`).digest("hex");
}

export function buildActivityDashboardMarkdown(input: {
  campaignName: string;
  eventStartDate: string | null;
  eventEndDate: string | null;
  metrics: ActivityMetrics;
  refreshedAt?: Date;
}): string {
  const updatedAt = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(input.refreshedAt ?? new Date());
  const formatDate = (value: string | null) => {
    const parsed = asDateOnly(value);
    return parsed
      ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed)
      : "Not set";
  };

  return [
    `> **ABC Test only while this new dashboard is being verified.** It is separate from the Production Canvas and does not change campaign records, dates, or channel archive rules.`,
    "",
    "> This board updates every 15 minutes while campaign is active including 7 days prior to the event start date.",
    "",
    "| Campaign | Event Start | Event End | Collection period |",
    "|:---|:---|:---|:---|",
    `| ${input.campaignName.replace(/\|/g, "\\|")} | ${formatDate(input.eventStartDate)} | ${formatDate(input.eventEndDate)} | Seven days before Event Start through channel archive |`,
    "",
    "## QR activity",
    "",
    "| Measure | Current total | What is counted |",
    "|:---|---:|:---|",
    `| **QR scans** | **${input.metrics.qrScans}** | Each person who reached the QR funnel during this campaign's collection period. |`,
    `| **QR appointments** | **${input.metrics.qrAppointments}** | Each actual appointment scheduled through the QR route. |`,
    `| **QR visits not yet scheduled** | **${input.metrics.qrVisitsNotYetScheduled}** | QR visitors who have not moved to the QR appointment group. |`,
    "",
    "## Appointment source activity",
    "",
    "| Source | Current total | Status |",
    "|:---|---:|:---|",
    `| Phone | ${input.metrics.phoneAppointments} | Counted from the phone tag. |`,
    `| SMS | ${input.metrics.smsAppointments} | Counted from the sms tag. |`,
    `| OneClick / Facebook | ${input.metrics.oneclickAppointments} | Counted from the 1click tag. |`,
    "",
    "## AI Booked Appointments",
    "",
    "| Measure | Current total | What is counted |",
    "|:---|---:|:---|",
    `| **AI Booked Appointments** | **${input.metrics.aiBookedAppointments}** | Each actual appointment marked with the AI Booked Appointment tag. |`,
    "",
    "## Shows",
    "",
    "| Measure | Current total | What is counted |",
    "|:---|---:|:---|",
    `| **QR Shows** | **${input.metrics.qrShows}** | Each customer who checks in with their QR code and receives either the QR Show or QR Check In tag. |`,
    "",
    "> QR Visit is removed when QR Appointment is added. The dashboard retains the earlier QR scan record, so a person is not counted twice in the QR visit breakdown. Operator-applied tags are included on the next refresh.",
    "",
    `*Last refreshed: ${updatedAt}. Automatic refresh checks every 15 minutes while this channel remains open.*`,
  ].join("\n");
}

export function calculateActivityMetrics(rows: Array<{ source: ActivitySource; captureMethod: "workflow" | "manual_tag"; contactFingerprint: string }>): ActivityMetrics {
  const qrVisitors = new Set<string>();
  const qrAppointmentContacts = new Set<string>();
  const qrShowContacts = new Set<string>();
  const appointmentSources: Array<Exclude<ActivitySource, "qr_visit" | "qr_show">> = ["qr_appointment", "phone_appointment", "sms_appointment", "oneclick_appointment", "ai_booked_appointment"];
  const workflowCounts = new Map<ActivitySource, number>(appointmentSources.map(source => [source, 0]));
  const workflowContacts = new Set<string>();
  const manualContacts = new Map<ActivitySource, Set<string>>(appointmentSources.map(source => [source, new Set<string>()]));

  for (const row of rows) {
    if (row.source === "qr_visit") {
      qrVisitors.add(row.contactFingerprint);
      continue;
    }
    if (row.source === "qr_show") {
      qrShowContacts.add(row.contactFingerprint);
      continue;
    }
    if (row.source === "qr_appointment") qrAppointmentContacts.add(row.contactFingerprint);
    if (row.captureMethod === "workflow") {
      workflowCounts.set(row.source, (workflowCounts.get(row.source) ?? 0) + 1);
      workflowContacts.add(`${row.source}:${row.contactFingerprint}`);
    } else {
      manualContacts.get(row.source)?.add(row.contactFingerprint);
    }
  }

  const countSource = (source: Exclude<ActivitySource, "qr_visit" | "qr_show">): number => {
    let manualOnly = 0;
    manualContacts.get(source)?.forEach(contact => {
      if (!workflowContacts.has(`${source}:${contact}`)) manualOnly += 1;
    });
    return (workflowCounts.get(source) ?? 0) + manualOnly;
  };
  let qrVisitsNotYetScheduled = 0;
  qrVisitors.forEach(contact => {
    if (!qrAppointmentContacts.has(contact)) qrVisitsNotYetScheduled += 1;
  });
  return {
    qrScans: qrVisitors.size,
    qrAppointments: countSource("qr_appointment"),
    qrVisitsNotYetScheduled,
    phoneAppointments: countSource("phone_appointment"),
    smsAppointments: countSource("sms_appointment"),
    oneclickAppointments: countSource("oneclick_appointment"),
    aiBookedAppointments: countSource("ai_booked_appointment"),
    qrShows: qrShowContacts.size,
  };
}

/** Captures currently present ABC Test tags without customer information leaving GoHighLevel. */
async function collectCurrentManualTags(candidate: ActivityDashboardRefreshCandidate): Promise<void> {
  if (!candidate.dealershipRecordId || !candidate.dealershipLocationId) return;
  const dealership = await fetchDealership(candidate.dealershipRecordId);
  const apiKey = dealership?.properties.api_key?.trim();
  const locationId = dealership?.properties.loc_id?.trim();
  if (!apiKey || !locationId || locationId !== candidate.dealershipLocationId) {
    throw new Error("Linked ABC Test dealership contact connection is unavailable for Activity Dashboard tag collection");
  }
  const secret = getRelayConfig().ghlWebhookSharedSecret;
  if (!secret) throw new Error("Activity Dashboard protected collection secret is unavailable");
  for (const tracked of manualTagSources) {
    const contactIds = await listDealershipContactIdsByTag({ locationId, apiKey, tag: tracked.tag });
    for (const contactId of contactIds) {
      await recordCampaignActivity({
        campaign: {
          id: candidate.campaignId,
          productionName: candidate.productionName,
          channelName: candidate.channelName,
          channelId: candidate.channelId,
          eventStartDate: candidate.eventStartDate,
          archiveStatus: candidate.archiveStatus,
        },
        source: tracked.source,
        contactId,
        stableReference: `manual-tag:${tracked.source}:${contactId}`,
        secret,
        captureMethod: "manual_tag",
      });
    }
  }
}

async function renderOneActivityDashboard(candidate: ActivityDashboardRefreshCandidate): Promise<"refreshed" | "skipped" | "failed"> {
  if (!isActivityCollectionOpen(candidate)) return "skipped";
  if (!candidate.canvasId) return "skipped";
  const collectionStart = getActivityCollectionStart(candidate.eventStartDate);
  if (!collectionStart) return "skipped";

  try {
    await collectCurrentManualTags(candidate);
    const rows = await getCampaignActivityMetrics(candidate.campaignId, collectionStart);
    const markdown = buildActivityDashboardMarkdown({
      campaignName: candidate.productionName,
      eventStartDate: candidate.eventStartDate,
      eventEndDate: candidate.eventEndDate,
      metrics: calculateActivityMetrics(rows),
    });
    const edited = await refreshKnownActivityDashboardCanvas(candidate.canvasId, markdown);
    if (!edited) {
      await logRelayAction({ campaignId: candidate.campaignId, action: "activity_dashboard_refresh", outcome: "failed", detail: "Saved Activity Dashboard Canvas link is unavailable; no replacement Canvas was created." });
      return "failed";
    }
    await completeActivityDashboardCanvasCreation({ campaignId: candidate.campaignId, canvasId: candidate.canvasId, refreshedAt: new Date() });
    await logRelayAction({ campaignId: candidate.campaignId, action: "activity_dashboard_refresh", outcome: "success", detail: "Saved Activity Dashboard Canvas refreshed in place." });
    return "refreshed";
  } catch (error) {
    await logRelayAction({ campaignId: candidate.campaignId, action: "activity_dashboard_refresh", outcome: "failed", detail: redactErrorDetail(error) }).catch(() => undefined);
    return "failed";
  }
}

/** Creates the first separate Canvas only for ABC Test. Saved Canvases are edited in place and never recreated. */
export async function ensureCampaignActivityDashboard(campaign: CampaignForActivity & { eventEndDate: string | null }): Promise<"created" | "refreshed" | "skipped" | "failed"> {
  if (!isActivityDashboardTestCampaign(campaign.channelName) || !campaign.channelId || !campaign.eventStartDate) return "skipped";
  const dashboard = await registerActivityDashboard(campaign.id);
  if (dashboard.canvasId) {
    return renderOneActivityDashboard({
      ...dashboard,
      campaignId: campaign.id,
      productionName: campaign.productionName,
      channelName: campaign.channelName,
      channelId: campaign.channelId,
      dealershipRecordId: campaign.dealershipRecordId ?? null,
      dealershipLocationId: campaign.dealershipLocationId ?? null,
      eventStartDate: campaign.eventStartDate,
      eventEndDate: campaign.eventEndDate,
      archiveStatus: campaign.archiveStatus,
    });
  }
  if (dashboard.canvasStatus === "creating") return "skipped";
  const claimed = await claimActivityDashboardCanvasCreation(campaign.id);
  if (!claimed) return "skipped";

  try {
    const markdown = buildActivityDashboardMarkdown({
      campaignName: campaign.productionName,
      eventStartDate: campaign.eventStartDate,
      eventEndDate: campaign.eventEndDate,
      metrics: { qrScans: 0, qrAppointments: 0, qrVisitsNotYetScheduled: 0, phoneAppointments: 0, smsAppointments: 0, oneclickAppointments: 0, aiBookedAppointments: 0, qrShows: 0 },
    });
    const canvasId = await createActivityDashboardCanvas(campaign.channelId, markdown);
    await completeActivityDashboardCanvasCreation({ campaignId: campaign.id, canvasId, refreshedAt: new Date() });
    try {
      await setSlackCanvasChannelReadAccess(canvasId, campaign.channelId);
    } catch (error) {
      await logRelayAction({ campaignId: campaign.id, action: "activity_dashboard_access", outcome: "failed", detail: redactErrorDetail(error) });
    }
    await logRelayAction({ campaignId: campaign.id, action: "activity_dashboard_create", outcome: "success", detail: "Separate Activity Dashboard Canvas created for ABC Test." });
    return "created";
  } catch (error) {
    await completeActivityDashboardCanvasCreation({ campaignId: campaign.id, canvasId: null, failureDetail: redactErrorDetail(error) }).catch(() => undefined);
    await logRelayAction({ campaignId: campaign.id, action: "activity_dashboard_create", outcome: "failed", detail: redactErrorDetail(error) }).catch(() => undefined);
    return "failed";
  }
}

export async function recordCampaignActivity(input: {
  campaign: CampaignForActivity;
  source: ActivitySource;
  contactId: string;
  stableReference: string;
  secret: string;
  captureMethod?: "workflow" | "manual_tag";
}): Promise<"recorded" | "duplicate" | "out_of_window" | "not_allowed"> {
  if (!isActivityDashboardTestCampaign(input.campaign.channelName)) return "not_allowed";
  if (!isActivityCollectionOpen(input.campaign)) return "out_of_window";
  const { recordCampaignActivityEvent } = await import("./db");
  const inserted = await recordCampaignActivityEvent({
    campaignId: input.campaign.id,
    source: input.source,
    captureMethod: input.captureMethod ?? "workflow",
    contactFingerprint: buildActivityContactFingerprint(input.contactId, input.secret),
    eventFingerprint: buildActivityEventFingerprint(input.source, input.stableReference, input.secret),
    occurredAt: new Date(),
  });
  await logRelayAction({
    campaignId: input.campaign.id,
    action: "activity_dashboard_event",
    outcome: "success",
    detail: inserted ? `${sourceLabels[input.source]} recorded for the Activity Dashboard.` : `${sourceLabels[input.source]} duplicate was ignored.`,
  });
  return inserted ? "recorded" : "duplicate";
}

/** Refreshes all saved, eligible Activity Dashboard Canvases. During ABC verification this can only reach ABC Test. */
export async function refreshOpenActivityDashboards(): Promise<{ refreshed: number; skipped: number; failed: number }> {
  const candidates = await listActivityDashboardRefreshCandidates();
  const summary = { refreshed: 0, skipped: 0, failed: 0 };
  for (const candidate of candidates) {
    const result = await renderOneActivityDashboard(candidate);
    if (result === "refreshed") summary.refreshed += 1;
    else if (result === "failed") summary.failed += 1;
    else summary.skipped += 1;
  }
  return summary;
}

/** Creates the one project-level fifteen-minute refresh only after the deployed ABC Test Canvas is first initialized. */
export async function ensureActivityDashboardRefreshSchedule(): Promise<void> {
  const existing = await getActivityDashboardRefreshJob();
  if (existing?.taskUid && existing.isEnabled) return;
  const scheduled = await createHeartbeatJob({
    name: "relay-activity-dashboard-refresh",
    cron: ACTIVITY_DASHBOARD_REFRESH_CRON,
    path: "/api/scheduled/relay/activity-dashboard-refresh",
    method: "POST",
    description: "Refresh saved Activity Dashboard Canvases every 15 minutes while their test campaign channels remain open.",
  }, "");
  await saveActivityDashboardRefreshJob({ taskUid: scheduled.taskUid, cronExpression: ACTIVITY_DASHBOARD_REFRESH_CRON, isEnabled: true });
}

export async function getActivityDashboardForCampaign(campaignId: number) {
  return getActivityDashboard(campaignId);
}

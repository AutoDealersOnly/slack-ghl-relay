import { describe, expect, it } from "vitest";
import {
  ACTIVITY_DASHBOARD_TEST_CHANNEL,
  buildActivityContactFingerprint,
  buildActivityDashboardMarkdown,
  buildActivityEventFingerprint,
  calculateActivityMetrics,
  getActivityCollectionStart,
  isActivityCollectionOpen,
  isActivityDashboardTestCampaign,
} from "./activity-dashboard";
import { activityDashboardWebhookPayloadSchema } from "./types";

describe("Activity Dashboard safety boundary", () => {
  it("limits the new Canvas and incoming activity to the exact ABC Test campaign", () => {
    expect(ACTIVITY_DASHBOARD_TEST_CHANNEL).toBe("2609-abc-test-ame");
    expect(isActivityDashboardTestCampaign("2609 ABC Test AME")).toBe(true);
    expect(isActivityDashboardTestCampaign("2610 Kia Wesley Chapel")).toBe(false);
  });

  it("opens collection seven days before Event Start and stops it after the channel archive", () => {
    expect(getActivityCollectionStart("2026-09-20")?.toISOString()).toBe("2026-09-13T00:00:00.000Z");
    const base = { channelName: "2609-abc-test-ame", eventStartDate: "2026-09-20" as const };
    expect(isActivityCollectionOpen({ ...base, archiveStatus: "scheduled" }, new Date("2026-09-12T23:59:59.999Z"))).toBe(false);
    expect(isActivityCollectionOpen({ ...base, archiveStatus: "scheduled" }, new Date("2026-09-13T00:00:00.000Z"))).toBe(true);
    expect(isActivityCollectionOpen({ ...base, archiveStatus: "archived" }, new Date("2026-10-01T00:00:00.000Z"))).toBe(false);
  });

  it("uses one-way, stable fingerprints rather than storing contact identifiers", () => {
    const contactFingerprint = buildActivityContactFingerprint("contact-123", "test-secret");
    expect(contactFingerprint).toHaveLength(64);
    expect(contactFingerprint).not.toContain("contact-123");
    expect(buildActivityEventFingerprint("qr_appointment", "appointment-456", "test-secret")).toHaveLength(64);
    expect(buildActivityEventFingerprint("qr_appointment", "appointment-456", "test-secret"))
      .toBe(buildActivityEventFingerprint("qr_appointment", "appointment-456", "test-secret"));
  });
});

describe("Activity Dashboard Canvas content", () => {
  it("shows separate QR visit and appointment totals without counting a converted QR visitor twice", () => {
    const markdown = buildActivityDashboardMarkdown({
      campaignName: "2609 ABC Test AME",
      eventStartDate: "2026-09-20",
      eventEndDate: "2026-09-23",
      refreshedAt: new Date("2026-09-17T16:30:00.000Z"),
      metrics: { qrScans: 12, qrAppointments: 5, qrVisitsNotYetScheduled: 7, phoneAppointments: 0, smsAppointments: 0, oneclickAppointments: 0, aiBookedAppointments: 4, qrShows: 3 },
    });
    expect(markdown).not.toContain("# Activity Dashboard");
    expect(markdown).toContain("**12**");
    expect(markdown).toContain("**5**");
    expect(markdown).toContain("**7**");
    expect(markdown).toContain("Counted from the phone tag.");
    expect(markdown).toContain("ABC Test only while this new dashboard is being verified");
    expect(markdown).toContain("does not change campaign records, dates, or channel archive rules");
    expect(markdown).toContain("This board updates every 15 minutes while campaign is active including 7 days prior to the event start date.");
    expect(markdown).toContain("## Shows");
    expect(markdown).toContain("**QR Shows** | **3**");
    expect(markdown).toContain("either the QR Show or QR Check In tag");
    expect(markdown).toContain("## AI Booked Appointments");
    expect(markdown).toContain("**AI Booked Appointments** | **4**");
    expect(markdown).toContain("Counted from the phone tag.");
    expect(markdown).toContain("Counted from the sms tag.");
    expect(markdown).toContain("Counted from the 1click tag.");
    expect(markdown).toContain("Operator-applied tags are included on the next refresh.");
  });
});

describe("Activity Dashboard incoming notices", () => {
  it("requires an appointment reference before an appointment can be counted", () => {
    expect(activityDashboardWebhookPayloadSchema.safeParse({
      location_id: "location-123", contact_id: "contact-123", source: "qr_appointment",
    }).success).toBe(false);
    expect(activityDashboardWebhookPayloadSchema.safeParse({
      location_id: "location-123", contact_id: "contact-123", source: "qr_appointment", appointment_id: "appointment-123",
    }).success).toBe(true);
  });

  it("allows a QR visit to be represented once by its contact reference", () => {
    expect(activityDashboardWebhookPayloadSchema.safeParse({
      location_id: "location-123", contact_id: "contact-123", source: "qr_visit",
    }).success).toBe(true);
  });

  it("allows a QR Show tag to be represented once by its contact reference", () => {
    expect(activityDashboardWebhookPayloadSchema.safeParse({
      location_id: "location-123", contact_id: "contact-123", source: "qr_show",
    }).success).toBe(true);
  });

  it("requires an appointment reference for an AI booked appointment", () => {
    expect(activityDashboardWebhookPayloadSchema.safeParse({
      location_id: "location-123", contact_id: "contact-123", source: "ai_booked_appointment",
    }).success).toBe(false);
    expect(activityDashboardWebhookPayloadSchema.safeParse({
      location_id: "location-123", contact_id: "contact-123", source: "ai_booked_appointment", appointment_id: "appointment-123",
    }).success).toBe(true);
  });
});

describe("Activity Dashboard tag collection", () => {
  it("counts operator-applied phone, sms, 1click, AI, and QR Show tags once per customer", () => {
    const metrics = calculateActivityMetrics([
      { source: "phone_appointment", captureMethod: "manual_tag", contactFingerprint: "a" },
      { source: "phone_appointment", captureMethod: "manual_tag", contactFingerprint: "a" },
      { source: "sms_appointment", captureMethod: "manual_tag", contactFingerprint: "b" },
      { source: "oneclick_appointment", captureMethod: "manual_tag", contactFingerprint: "c" },
      { source: "ai_booked_appointment", captureMethod: "manual_tag", contactFingerprint: "d" },
      { source: "qr_show", captureMethod: "manual_tag", contactFingerprint: "e" },
      { source: "qr_show", captureMethod: "manual_tag", contactFingerprint: "e" },
    ]);
    expect(metrics).toMatchObject({ phoneAppointments: 1, smsAppointments: 1, oneclickAppointments: 1, aiBookedAppointments: 1, qrShows: 1 });
  });

  it("lets a confirmed workflow appointment take priority over the same person’s manual tag", () => {
    const metrics = calculateActivityMetrics([
      { source: "qr_appointment", captureMethod: "manual_tag", contactFingerprint: "a" },
      { source: "qr_appointment", captureMethod: "workflow", contactFingerprint: "a" },
      { source: "qr_appointment", captureMethod: "workflow", contactFingerprint: "b" },
    ]);
    expect(metrics.qrAppointments).toBe(2);
  });
});

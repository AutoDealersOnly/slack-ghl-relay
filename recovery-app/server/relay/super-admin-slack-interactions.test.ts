import { describe, expect, it } from "vitest";
import {
  SUPER_ADMIN_KEEP_OPEN_ACTION,
  SUPER_ADMIN_MANAGE_ARCHIVES_ACTION,
  SUPER_ADMIN_REPAIR_CANVAS_ACTION,
} from "./super-admin";
import {
  parseKeepOpenInteraction,
  parseSuperAdminCampaignSubmission,
  parseSuperAdminLauncherInteraction,
} from "./super-admin-slack-interactions";

describe("Super Admin Slack interaction parser", () => {
  it("accepts only the exact legacy Keep Open action while legacy cards are being removed", () => {
    const result = parseKeepOpenInteraction(JSON.stringify({
      type: "block_actions",
      channel: { id: "C-super-admin" },
      actions: [{ action_id: SUPER_ADMIN_KEEP_OPEN_ACTION, value: "42" }],
    }));
    expect(result).toEqual({ superAdminChannelId: "C-super-admin", campaignId: 42 });
  });

  it.each([
    "not-json",
    JSON.stringify({ type: "shortcut" }),
    JSON.stringify({ type: "block_actions", channel: { id: "C1" }, actions: [{ action_id: "other", value: "1" }] }),
    JSON.stringify({ type: "block_actions", channel: { id: "C1" }, actions: [{ action_id: SUPER_ADMIN_KEEP_OPEN_ACTION, value: "0" }] }),
  ])("rejects anything other than the exact permitted Keep Open action", payload => {
    expect(parseKeepOpenInteraction(payload)).toBeNull();
  });

  it("accepts the permanent Archive Manager launcher only with its exact action and a trigger", () => {
    const result = parseSuperAdminLauncherInteraction(JSON.stringify({
      type: "block_actions",
      channel: { id: "C-super-admin" },
      trigger_id: "trigger",
      actions: [{ action_id: SUPER_ADMIN_MANAGE_ARCHIVES_ACTION }],
    }), SUPER_ADMIN_MANAGE_ARCHIVES_ACTION);
    expect(result).toEqual({ superAdminChannelId: "C-super-admin", triggerId: "trigger" });
  });

  it("accepts one selected archive-manager campaign from the signed private-channel modal", () => {
    const result = parseSuperAdminCampaignSubmission(
      JSON.stringify({
        type: "view_submission",
        view: {
          callback_id: "super_admin_manage_pending_archives_submit",
          private_metadata: JSON.stringify({ superAdminChannelId: "C-super-admin" }),
          state: { values: { super_admin_pending_archive_campaign: { super_admin_pending_archive_campaign_select: { selected_option: { value: "42" } } } } },
        },
      }),
      "super_admin_manage_pending_archives_submit",
      "super_admin_pending_archive_campaign",
      "super_admin_pending_archive_campaign_select"
    );
    expect(result).toEqual({ superAdminChannelId: "C-super-admin", campaignId: 42 });
  });

  it("accepts the all-channel direct Canvas refresh launcher and one positive saved-Canvas selection", () => {
    const launcher = parseSuperAdminLauncherInteraction(JSON.stringify({
      type: "block_actions",
      channel: { id: "C-super-admin" },
      trigger_id: "trigger",
      actions: [{ action_id: SUPER_ADMIN_REPAIR_CANVAS_ACTION }],
    }), SUPER_ADMIN_REPAIR_CANVAS_ACTION);
    const submission = parseSuperAdminCampaignSubmission(
      JSON.stringify({
        type: "view_submission",
        view: {
          callback_id: "super_admin_repair_production_canvas_submit",
          private_metadata: JSON.stringify({ superAdminChannelId: "C-super-admin" }),
          state: { values: { super_admin_canvas_repair_campaign: { super_admin_canvas_repair_campaign_select: { selected_option: { value: "42" } } } } },
        },
      }),
      "super_admin_repair_production_canvas_submit",
      "super_admin_canvas_repair_campaign",
      "super_admin_canvas_repair_campaign_select"
    );
    expect(launcher).toEqual({ superAdminChannelId: "C-super-admin", triggerId: "trigger" });
    expect(submission).toEqual({ superAdminChannelId: "C-super-admin", campaignId: 42 });
  });

  it("rejects malformed or unrelated permanent-launcher and modal submissions", () => {
    expect(parseSuperAdminLauncherInteraction("not-json", SUPER_ADMIN_MANAGE_ARCHIVES_ACTION)).toBeNull();
    expect(parseSuperAdminLauncherInteraction(JSON.stringify({ type: "block_actions", channel: { id: "C1" }, actions: [{ action_id: SUPER_ADMIN_MANAGE_ARCHIVES_ACTION }] }), SUPER_ADMIN_MANAGE_ARCHIVES_ACTION)).toBeNull();
    expect(parseSuperAdminCampaignSubmission(JSON.stringify({ type: "view_submission", view: { callback_id: "other", private_metadata: "{}" } }), "super_admin_manage_pending_archives_submit", "block", "action")).toBeNull();
  });
});

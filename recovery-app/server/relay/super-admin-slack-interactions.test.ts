import { describe, expect, it } from "vitest";
import { SUPER_ADMIN_KEEP_OPEN_ACTION, SUPER_ADMIN_REFRESH_ABC_TEST_CANVAS_ACTION, SUPER_ADMIN_REPAIR_CANVAS_ACTION } from "./super-admin";
import { parseAbcTestCanvasRefreshInteraction, parseCanvasRepairLauncherInteraction, parseCanvasRepairSubmission, parseKeepOpenInteraction } from "./super-admin-slack-interactions";

describe("Super Admin Slack interaction parser", () => {
  it("accepts only the exact Keep Open block action with one positive campaign ID", () => {
    const result = parseKeepOpenInteraction(JSON.stringify({
      type: "block_actions",
      channel: { id: "C-super-admin" },
      message: { ts: "123.456" },
      actions: [{ action_id: SUPER_ADMIN_KEEP_OPEN_ACTION, value: "42" }],
    }));
    expect(result).toEqual({ superAdminChannelId: "C-super-admin", campaignId: 42, messageTs: "123.456" });
  });

  it.each([
    "not-json",
    JSON.stringify({ type: "shortcut" }),
    JSON.stringify({ type: "block_actions", channel: { id: "C1" }, message: { ts: "1" }, actions: [{ action_id: "other", value: "1" }] }),
    JSON.stringify({ type: "block_actions", channel: { id: "C1" }, message: { ts: "1" }, actions: [{ action_id: SUPER_ADMIN_KEEP_OPEN_ACTION, value: "0" }] }),
  ])("rejects anything other than the exact permitted action", payload => {
    expect(parseKeepOpenInteraction(payload)).toBeNull();
  });
});

describe("Super Admin Canvas repair interaction parser", () => {
  it("accepts only the ABC Test-only direct-refresh action from a channel context", () => {
    const result = parseAbcTestCanvasRefreshInteraction(JSON.stringify({
      type: "block_actions",
      channel: { id: "C-super-admin" },
      actions: [{ action_id: SUPER_ADMIN_REFRESH_ABC_TEST_CANVAS_ACTION }],
    }));
    expect(result).toEqual({ superAdminChannelId: "C-super-admin" });
  });

  it("accepts only the exact signed-channel repair launcher action with a trigger", () => {
    const result = parseCanvasRepairLauncherInteraction(JSON.stringify({
      type: "block_actions",
      channel: { id: "C-super-admin" },
      trigger_id: "trigger",
      actions: [{ action_id: SUPER_ADMIN_REPAIR_CANVAS_ACTION }],
    }));
    expect(result).toEqual({ superAdminChannelId: "C-super-admin", triggerId: "trigger" });
  });

  it("accepts only a submitted repair modal that carries one positive campaign selection and private channel context", () => {
    const result = parseCanvasRepairSubmission(JSON.stringify({
      type: "view_submission",
      view: {
        callback_id: "super_admin_repair_production_canvas_submit",
        private_metadata: JSON.stringify({ superAdminChannelId: "C-super-admin" }),
        state: { values: { super_admin_canvas_repair_campaign: { super_admin_canvas_repair_campaign_select: { selected_option: { value: "42" } } } } },
      },
    }));
    expect(result).toEqual({ superAdminChannelId: "C-super-admin", campaignId: 42 });
  });

  it.each([
    JSON.stringify({ type: "block_actions", channel: { id: "C1" }, actions: [{ action_id: SUPER_ADMIN_REPAIR_CANVAS_ACTION }] }),
    JSON.stringify({ type: "view_submission", view: { callback_id: "other", private_metadata: "{}" } }),
    "not-json",
  ])("rejects malformed or unrelated repair interaction payloads", payload => {
    expect(parseCanvasRepairLauncherInteraction(payload)).toBeNull();
    expect(parseCanvasRepairSubmission(payload)).toBeNull();
  });
});

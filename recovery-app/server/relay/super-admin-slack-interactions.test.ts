import { describe, expect, it } from "vitest";
import { SUPER_ADMIN_KEEP_OPEN_ACTION } from "./super-admin";
import { parseKeepOpenInteraction } from "./super-admin-slack-interactions";

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

import { getRelayConfig } from "./config";

type SlackResponse<T> = { ok: boolean; error?: string } & T;

const SLACK_API_URL = "https://slack.com/api";

const requireSlackToken = () => {
  const token = getRelayConfig().slackBotToken;
  if (!token) throw new Error("Slack bot token is not configured");
  return token;
};

async function slackApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = requireSlackToken();
  const response = await fetch(`${SLACK_API_URL}/${method}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Slack ${method} failed with status ${response.status}`);
  const data = (await response.json()) as SlackResponse<T>;
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error ?? "unknown error"}`);
  return data;
}

/** Matches the preserved `/ghl` command: join the target channel before Canvas work. */
export async function joinSlackChannel(channelId: string): Promise<void> {
  await slackApi("conversations.join", { channel: channelId });
}

export async function ensureCampaignChannel(channelName: string): Promise<{ id: string; created: boolean }> {
  try {
    const data = await slackApi<{ channel: { id: string } }>("conversations.create", {
      name: channelName,
      is_private: false,
    });
    return { id: data.channel.id, created: true };
  } catch (error) {
    if (!String(error).includes("name_taken")) throw error;
    const token = requireSlackToken();
    const response = await fetch(`${SLACK_API_URL}/conversations.list?limit=1000&exclude_archived=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Slack conversations.list failed with status ${response.status}`);
    const data = (await response.json()) as SlackResponse<{ channels?: Array<{ id: string; name: string }> }>;
    const existing = data.channels?.find(channel => channel.name === channelName);
    if (!data.ok || !existing) throw new Error("Slack channel already exists but could not be located");
    return { id: existing.id, created: false };
  }
}

export async function joinAndInviteCampaignChannel(channelId: string): Promise<void> {
  await joinSlackChannel(channelId);
  const config = getRelayConfig();
  const invitees = new Set(config.slackAlwaysInviteeUserIds);
  if (config.slackDealsUserGroupId) {
    const token = requireSlackToken();
    const response = await fetch(
      `${SLACK_API_URL}/usergroups.users.list?usergroup=${encodeURIComponent(config.slackDealsUserGroupId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (response.ok) {
      const data = (await response.json()) as SlackResponse<{ users?: string[] }>;
      if (data.ok) data.users?.forEach(user => invitees.add(user));
    }
  }
  if (invitees.size > 0) {
    try {
      await slackApi("conversations.invite", { channel: channelId, users: Array.from(invitees).join(",") });
    } catch (error) {
      if (!String(error).includes("already_in_channel")) throw error;
    }
  }
}

async function getAttachedChannelCanvasId(channelId: string): Promise<string | null> {
  const token = requireSlackToken();
  const response = await fetch(`${SLACK_API_URL}/conversations.info?channel=${encodeURIComponent(channelId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Slack conversations.info failed with status ${response.status}`);
  const data = (await response.json()) as SlackResponse<{ channel?: { properties?: { canvas?: { id?: string } } } }>;
  if (!data.ok) throw new Error(`Slack conversations.info failed: ${data.error ?? "unknown error"}`);
  return data.channel?.properties?.canvas?.id ?? null;
}

export async function createOrUpdateProductionCanvas(
  channelId: string,
  markdown: string,
  existingCanvasId?: string | null
): Promise<string> {
  if (existingCanvasId) {
    try {
      await slackApi("canvases.edit", {
        canvas_id: existingCanvasId,
        changes: [{ operation: "replace", document_content: { type: "markdown", markdown } }],
      });
      return existingCanvasId;
    } catch {
      // A manually deleted or inaccessible canvas is safely replaced below.
    }
  }
  try {
    const data = await slackApi<{ canvas_id: string }>("canvases.create", {
      channel_id: channelId,
      title: "Production",
      document_content: { type: "markdown", markdown },
    });
    return data.canvas_id;
  } catch (error) {
    if (!String(error).includes("channel_canvas_already_exists")) throw error;
    const canvasId = await getAttachedChannelCanvasId(channelId);
    if (!canvasId) throw new Error("Existing Slack channel canvas could not be linked");
    await slackApi("canvases.edit", {
      canvas_id: canvasId,
      changes: [{ operation: "replace", document_content: { type: "markdown", markdown } }],
    });
    return canvasId;
  }
}

export async function postSlackMessage(channelId: string, text: string): Promise<void> {
  await slackApi("chat.postMessage", { channel: channelId, text });
}

export async function archiveSlackChannel(channelId: string): Promise<void> {
  try {
    await slackApi("conversations.join", { channel: channelId });
  } catch {
    // Archiving may still be allowed if the bot is already a member.
  }
  try {
    await slackApi("conversations.archive", { channel: channelId });
  } catch (error) {
    if (!String(error).includes("already_archived")) throw error;
  }
}

import { getRelayConfig } from "./config";

type SlackResponse<T> = { ok: boolean; error?: string } & T;

export type ActiveSlackCampaignChannel = { id: string; name: string };
export type SlackChannelFile = {
  id: string;
  name: string;
  filetype?: string;
  mimetype?: string;
  size?: number;
  created?: number;
  channels?: string[];
  url_private?: string;
  url_private_download?: string;
  is_external?: boolean;
};

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

export function selectCurrentChannelPdfs(channelId: string, files: SlackChannelFile[]): SlackChannelFile[] {
  const pdfs = files.filter(file => {
    const isPdf =
      file.filetype?.toLowerCase() === "pdf" ||
      file.mimetype?.toLowerCase() === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    return isPdf && file.channels?.includes(channelId) && Boolean(file.url_private_download) && !file.is_external;
  });
  const newestByName = new Map<string, SlackChannelFile>();
  for (const file of pdfs) {
    const nameKey = file.name.trim().toLowerCase();
    const current = newestByName.get(nameKey);
    if (!current || (file.created ?? 0) > (current.created ?? 0)) {
      newestByName.set(nameKey, file);
    }
  }
  return Array.from(newestByName.values()).sort((left, right) => (left.created ?? 0) - (right.created ?? 0));
}

/** Selects only mailpiece PDFs. Envelope PDFs are intentionally excluded by filename. */
export function selectCurrentChannelMailpiecePdfs(channelId: string, files: SlackChannelFile[]): SlackChannelFile[] {
  return selectCurrentChannelPdfs(
    channelId,
    files.filter(file => !file.name.toLowerCase().includes("env"))
  );
}

async function listChannelFiles(channelId: string): Promise<SlackChannelFile[]> {
  const token = requireSlackToken();
  const files: SlackChannelFile[] = [];
  let page = 1;
  let pages = 1;
  do {
    const url = new URL(`${SLACK_API_URL}/files.list`);
    url.searchParams.set("channel", channelId);
    url.searchParams.set("count", "100");
    url.searchParams.set("page", String(page));
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Slack files.list failed with status ${response.status}`);
    const data = (await response.json()) as SlackResponse<{ files?: SlackChannelFile[]; paging?: { pages?: number } }>;
    if (!data.ok) throw new Error(`Slack files.list failed: ${data.error ?? "unknown error"}`);
    files.push(...(data.files ?? []));
    pages = Math.min(Math.max(data.paging?.pages ?? 1, 1), 20);
    page += 1;
  } while (page <= pages);
  return files;
}

/** Lists all qualifying hosted PDFs from one exact Slack campaign channel, retaining only the newest same-name version. */
export async function getCurrentChannelPdfs(channelId: string): Promise<SlackChannelFile[]> {
  return selectCurrentChannelPdfs(channelId, await listChannelFiles(channelId));
}

/** Lists qualifying non-envelope PDFs from one exact campaign channel, keeping only newest duplicate filenames. */
export async function getCurrentChannelMailpiecePdfs(channelId: string): Promise<SlackChannelFile[]> {
  return selectCurrentChannelMailpiecePdfs(channelId, await listChannelFiles(channelId));
}

export async function downloadSlackPdf(file: SlackChannelFile): Promise<Uint8Array> {
  const fileUrl = file.url_private || file.url_private_download;
  if (!fileUrl) throw new Error("Slack PDF does not have a downloadable URL");
  const size = Number(file.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) throw new Error("Slack PDF does not report a usable file size");
  if (size > 25 * 1024 * 1024) throw new Error("Slack PDF exceeds the 25 MB GoHighLevel media limit");
  let response: Response;
  try {
    response = await fetch(fileUrl, {
      headers: { Authorization: `Bearer ${requireSlackToken()}` },
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    if ((error instanceof DOMException && error.name === "TimeoutError") || (error instanceof Error && error.name === "TimeoutError")) {
      throw new Error("Slack PDF download timed out after 120 seconds");
    }
    throw error;
  }
  if (!response.ok) throw new Error(`Slack PDF download failed with status ${response.status}`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > 25 * 1024 * 1024) throw new Error("Slack PDF exceeds the 25 MB GoHighLevel media limit");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("Slack PDF exceeds the 25 MB GoHighLevel media limit");
  return bytes;
}

/** Lists only active Slack channels whose normalized names begin with a four-digit campaign number. */
export async function listActiveCampaignChannels(): Promise<ActiveSlackCampaignChannel[]> {
  const token = requireSlackToken();
  const channels: ActiveSlackCampaignChannel[] = [];
  let cursor = "";

  do {
    const url = new URL(`${SLACK_API_URL}/conversations.list`);
    url.searchParams.set("limit", "200");
    url.searchParams.set("exclude_archived", "true");
    url.searchParams.set("types", "public_channel,private_channel");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Slack conversations.list failed with status ${response.status}`);
    const data = (await response.json()) as SlackResponse<{
      channels?: Array<{ id?: string; name?: string }>;
      response_metadata?: { next_cursor?: string };
    }>;
    if (!data.ok) throw new Error(`Slack conversations.list failed: ${data.error ?? "unknown error"}`);
    for (const channel of data.channels ?? []) {
      const name = channel.name?.trim() ?? "";
      const id = channel.id?.trim() ?? "";
      if (id && /^\d{4}-/.test(name)) channels.push({ id, name });
    }
    cursor = data.response_metadata?.next_cursor?.trim() ?? "";
  } while (cursor);

  return channels;
}

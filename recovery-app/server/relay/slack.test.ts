import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createActivityDashboardCanvas,
  createOrUpdateProductionCanvas,
  downloadSlackPdf,
  openProductionCanvasRepairModal,
  refreshKnownActivityDashboardCanvas,
  refreshKnownProductionCanvas,
  setSlackCanvasChannelReadAccess,
} from "./slack";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("Production Canvas linking", () => {
  it("updates a known saved Canvas without checking the channel-default Canvas or creating another tab", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(createOrUpdateProductionCanvas("C123", "# Production", "F123")).resolves.toBe("F123");
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("canvases.edit");
  });

  it("creates a channel Canvas only when the saved Canvas ID is truly unavailable", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "canvas_not_found" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, canvas_id: "F-new" }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(createOrUpdateProductionCanvas("C123", "# Production", "F-old")).resolves.toBe("F-new");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("canvases.edit");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("canvases.create");
  });

  it("never creates a Canvas from the ABC Test-only direct-refresh helper", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "canvas_not_found" }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(refreshKnownProductionCanvas("F-old", "# Production")).resolves.toBe(false);
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("canvases.edit");
  });

  it("relinks and refreshes a channel canvas that exists in Slack but not in the database", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "channel_canvas_already_exists" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, channel: { properties: { canvas: { id: "F456" } } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(createOrUpdateProductionCanvas("C123", "# Production")).resolves.toBe("F456");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("conversations.info");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("canvases.edit");
  });
});

describe("Super Admin Canvas repair picker", () => {
  it("opens one private-channel modal with the currently selectable campaign list", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, view: { id: "V1" } }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await openProductionCanvasRepairModal({
      triggerId: "trigger",
      superAdminChannelId: "C-super-admin",
      candidates: [{ id: 42, channelName: "2610-sample-dealer-ame", productionName: "2610 Sample Dealer AME" }],
    });

    expect(fetchMock.mock.calls[0]?.[0]).toContain("views.open");
    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(request.trigger_id).toBe("trigger");
    expect(JSON.parse(request.view.private_metadata)).toEqual({ superAdminChannelId: "C-super-admin" });
    expect(request.view.blocks[1].element.options[0].value).toBe("42");
  });
});

describe("separate Activity Dashboard Canvas", () => {
  it("creates a titled separate Canvas tab without touching the Production Canvas", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, canvas_id: "F-activity" }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(createActivityDashboardCanvas("C123", "# Activity Dashboard")).resolves.toBe("F-activity");
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("canvases.create");
    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(request.title).toBe("Activity Dashboard");
    expect(request.channel_id).toBe("C123");
  });

  it("edits a saved Activity Dashboard in place and never creates a replacement tab", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "canvas_not_found" }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(refreshKnownActivityDashboardCanvas("F-activity", "# Activity Dashboard")).resolves.toBe(false);
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("canvases.edit");
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("canvases.create");
  });

  it("makes the separate dashboard channel-readable after creation", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await setSlackCanvasChannelReadAccess("F-activity", "C123");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("canvases.access.set");
    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(request).toEqual({ canvas_id: "F-activity", access_level: "read", channel_ids: ["C123"] });
  });
});

describe("Slack PDF downloads", () => {
  it("prefers the standard authenticated private URL over the download URL", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(downloadSlackPdf({
      id: "F123",
      name: "mailpiece.pdf",
      size: 3,
      url_private: "https://files.slack.test/private",
      url_private_download: "https://files.slack.test/download",
    })).resolves.toEqual(new Uint8Array([1, 2, 3]));

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://files.slack.test/private");
  });
});

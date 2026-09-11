import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrUpdateProductionCanvas, downloadSlackPdf } from "./slack";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("Production Canvas linking", () => {
  it("updates a known canvas without creating another one", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(createOrUpdateProductionCanvas("C123", "# Production", "F123")).resolves.toBe("F123");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("canvases.edit");
  });

  it("creates a fresh channel Canvas when the saved Canvas ID was deleted", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "canvas_not_found" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, canvas_id: "F789" }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(createOrUpdateProductionCanvas("C123", "# Production", "F123")).resolves.toBe("F789");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("canvases.edit");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("canvases.create");
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

describe("Slack PDF downloads", () => {
  it("prefers the standard authenticated private URL over the download URL", async () => {
    process.env.SLACK_BOT_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(
      downloadSlackPdf({
        id: "F123",
        name: "mailpiece.pdf",
        size: 3,
        url_private: "https://files.slack.test/private",
        url_private_download: "https://files.slack.test/download",
      })
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://files.slack.test/private");
  });
});

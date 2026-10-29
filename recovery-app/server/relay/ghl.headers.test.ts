import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ghlHeaders,
  isRetryableGhlMediaUploadConnectionError,
  listDealershipContactIdsByTag,
  selectExactProductionRecord,
  uploadDealershipMediaImage,
} from "./ghl";

afterEach(() => vi.unstubAllGlobals());

describe("GHL object request headers", () => {
  it("carries the ADO location context without changing the bearer token format", () => {
    const headers = new Headers(ghlHeaders("test-token", "2021-07-28", "test-location"));

    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("version")).toBe("2021-07-28");
    expect(headers.get("locationid")).toBe("test-location");
  });

  it("uses only an exact normalized Production name match instead of the first broad search result", () => {
    const record = selectExactProductionRecord(
      [
        { properties: { production: "2608 Fayetteville Kia SD Archive", event_end: "2026-08-15" } },
        { properties: { production: "2608 Fayetteville Kia SD", event_end: "2026-09-20" } },
      ],
      "2608-fayetteville-kia-sd"
    );
    expect(record?.properties.event_end).toBe("2026-09-20");
  });

  it("refuses an ambiguous exact Production match rather than scheduling from an arbitrary record", () => {
    expect(() =>
      selectExactProductionRecord(
        [
          { properties: { production: "2608 Fayetteville Kia SD", event_end: "2026-09-05" } },
          { properties: { production: "2608 Fayetteville Kia SD", event_end: "2026-09-20" } },
        ],
        "2608-fayetteville-kia-sd"
      )
    ).toThrow("Ambiguous Production record match");
  });

  it("reads only contact references when collecting one dealership tag", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ contacts: [{ id: "contact-a" }, { id: "contact-a" }, { id: "contact-b" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listDealershipContactIdsByTag({ locationId: "dealer-location", apiKey: "dealer-key", tag: "phone" }))
      .resolves.toEqual(["contact-a", "contact-b"]);
    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(request).toMatchObject({
      locationId: "dealer-location",
      filters: [{ field: "tags", operator: "contains", value: "phone" }],
    });
    expect(JSON.stringify(request)).not.toContain("dealer-key");
  });

  it("retries one dropped Media Library connection with a fresh request body", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://media.example/image.jpg" }), { status: 200 }));

    await expect(uploadDealershipMediaImage({
      locationId: "dealer-location",
      apiKey: "dealer-key",
      fileName: "mailpiece.jpg",
      bytes: new Uint8Array([1, 2, 3]),
    }, { fetchImpl: fetchMock, retryDelayMs: 0 })).resolves.toBe("https://media.example/image.jpg");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).not.toBe((fetchMock.mock.calls[1]?.[1] as RequestInit).body);
  });

  it("does not retry a GoHighLevel HTTP permission response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "permission denied" }), { status: 401 }));

    await expect(uploadDealershipMediaImage({
      locationId: "dealer-location",
      apiKey: "dealer-key",
      fileName: "mailpiece.jpg",
      bytes: new Uint8Array([1, 2, 3]),
    }, { fetchImpl: fetchMock, retryDelayMs: 0 })).rejects.toThrow("status 401");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("classifies only pre-response connection errors as retryable", () => {
    expect(isRetryableGhlMediaUploadConnectionError(new TypeError("fetch failed"))).toBe(true);
    expect(isRetryableGhlMediaUploadConnectionError(new TypeError("invalid request body"))).toBe(false);
    expect(isRetryableGhlMediaUploadConnectionError(new Error("fetch failed"))).toBe(false);
  });
});

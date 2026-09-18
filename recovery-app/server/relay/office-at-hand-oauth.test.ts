import { afterEach, describe, expect, it, vi } from "vitest";

const { getAuthorization, saveAuthorization, decryptSecret, encryptSecret } = vi.hoisted(() => ({
  getAuthorization: vi.fn(),
  saveAuthorization: vi.fn(),
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn(),
}));

vi.mock("./db", () => ({
  getOfficeAtHandAuthorization: getAuthorization,
  saveOfficeAtHandAuthorization: saveAuthorization,
}));

vi.mock("./office-at-hand-crypto", () => ({
  decryptOfficeAtHandSecret: decryptSecret,
  encryptOfficeAtHandSecret: encryptSecret,
}));

import {
  OFFICE_AT_HAND_CALLBACK_URL,
  buildOfficeAtHandAuthorizationUrl,
  createOfficeAtHandAuthorizationState,
  isValidOfficeAtHandAuthorizationState,
  refreshOfficeAtHandTestAuthorization,
} from "./office-at-hand-oauth";

const originalSecret = process.env.JWT_SECRET;
const originalClientId = process.env.OFFICE_AT_HAND_CLIENT_ID;
const originalClientSecret = process.env.OFFICE_AT_HAND_CLIENT_SECRET;

afterEach(() => {
  process.env.JWT_SECRET = originalSecret;
  process.env.OFFICE_AT_HAND_CLIENT_ID = originalClientId;
  process.env.OFFICE_AT_HAND_CLIENT_SECRET = originalClientSecret;
  vi.clearAllMocks();
});

describe("OfficeAtHand test authorization callback", () => {
  it("creates a state value that only the initiating browser session can return", () => {
    process.env.JWT_SECRET = "test-only-state-key";
    const state = createOfficeAtHandAuthorizationState("one-time-nonce");
    expect(isValidOfficeAtHandAuthorizationState(state, "one-time-nonce")).toBe(true);
    expect(isValidOfficeAtHandAuthorizationState(state, "another-nonce")).toBe(false);
  });

  it("builds an authorization request that uses only the registered callback", () => {
    const url = new URL(buildOfficeAtHandAuthorizationUrl("public-client-id", "signed-state"));
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(OFFICE_AT_HAND_CALLBACK_URL);
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("client_secret")).toBeNull();
  });

  it("refreshes and replaces the encrypted test authorization without requesting call data", async () => {
    process.env.OFFICE_AT_HAND_CLIENT_ID = "test-client";
    process.env.OFFICE_AT_HAND_CLIENT_SECRET = "test-secret";
    getAuthorization.mockResolvedValue({ refreshTokenCiphertext: "encrypted-old", ownerId: "owner", grantedScope: "CallControl" });
    decryptSecret.mockReturnValue("refresh-old");
    encryptSecret.mockReturnValue("encrypted-new");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "access-token", refresh_token: "refresh-new", refresh_token_expires_in: 3600 })));

    await expect(refreshOfficeAtHandTestAuthorization(fetcher)).resolves.toEqual({ accessToken: "access-token" });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/restapi/oauth/token"), expect.objectContaining({ method: "POST" }));
    expect(saveAuthorization).toHaveBeenCalledWith(expect.objectContaining({ refreshTokenCiphertext: "encrypted-new" }));
  });
});

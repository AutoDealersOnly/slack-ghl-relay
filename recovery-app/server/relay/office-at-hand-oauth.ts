import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { Router } from "express";
import { hasActiveCallLookupTestAccess } from "./active-call-lookup-test-access";
import { decryptOfficeAtHandSecret, encryptOfficeAtHandSecret } from "./office-at-hand-crypto";
import { getOfficeAtHandAuthorization, saveOfficeAtHandAuthorization } from "./db";

const AUTHORIZATION_URL = "https://platform.ringcentral.com/restapi/oauth/authorize";
const TOKEN_URL = "https://platform.ringcentral.com/restapi/oauth/token";
export const OFFICE_AT_HAND_CALLBACK_PATH = "/api/office-at-hand/oauth/callback";
export const OFFICE_AT_HAND_CALLBACK_URL = `https://ghl-slackrel-knvzqxuh.manus.space${OFFICE_AT_HAND_CALLBACK_PATH}`;
const STATE_COOKIE = "office_at_hand_test_state";
const STATE_COOKIE_PATH = "/api/office-at-hand/oauth";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

type CallbackQuery = { code?: unknown; state?: unknown; error?: unknown };
type TokenResponse = { access_token?: unknown; refresh_token?: unknown; refresh_token_expires_in?: unknown; owner_id?: unknown; scope?: unknown };

function appCredentials() {
  const clientId = process.env.OFFICE_AT_HAND_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.OFFICE_AT_HAND_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) throw new Error("The separate OfficeAtHand test app is not configured yet.");
  return { clientId, clientSecret };
}

function stateSignature(nonce: string) {
  const signingSecret = process.env.JWT_SECRET?.trim() ?? "";
  if (!signingSecret) throw new Error("The server state-signing key is unavailable.");
  return createHmac("sha256", signingSecret).update(`office-at-hand-test:${nonce}`).digest("base64url");
}

export function createOfficeAtHandAuthorizationState(nonce: string): string {
  return `${nonce}.${stateSignature(nonce)}`;
}

export function isValidOfficeAtHandAuthorizationState(state: string, expectedNonce: string): boolean {
  const [nonce, signature, extra] = state.split(".");
  if (!nonce || !signature || extra || !expectedNonce) return false;
  const expectedSignature = stateSignature(expectedNonce);
  if (nonce.length !== expectedNonce.length || signature.length !== expectedSignature.length) return false;
  return timingSafeEqual(Buffer.from(nonce), Buffer.from(expectedNonce)) && timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

export function buildOfficeAtHandAuthorizationUrl(clientId: string, state: string): string {
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", OFFICE_AT_HAND_CALLBACK_URL);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeOfficeAtHandAuthorizationCode(code: string, fetcher: typeof fetch = fetch): Promise<{
  encryptedRefreshToken: string;
  refreshTokenExpiresAt: Date | null;
  ownerId: string | null;
  grantedScope: string | null;
}> {
  const { clientId, clientSecret } = appCredentials();
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: OFFICE_AT_HAND_CALLBACK_URL }).toString(),
  });
  if (!response.ok) throw new Error("OfficeAtHand did not accept the test-app authorization.");
  const payload = (await response.json()) as TokenResponse;
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : "";
  if (!refreshToken) throw new Error("OfficeAtHand did not return a renewable test-app authorization.");
  const lifetimeSeconds = typeof payload.refresh_token_expires_in === "number" ? payload.refresh_token_expires_in : 0;
  return {
    encryptedRefreshToken: encryptOfficeAtHandSecret(refreshToken),
    refreshTokenExpiresAt: lifetimeSeconds > 0 ? new Date(Date.now() + lifetimeSeconds * 1000) : null,
    ownerId: typeof payload.owner_id === "string" ? payload.owner_id : null,
    grantedScope: typeof payload.scope === "string" ? payload.scope : null,
  };
}

/**
 * Exchanges only the encrypted test-app refresh token for a short-lived token.
 * It does not access telephony data or establish any event subscription itself.
 */
export async function refreshOfficeAtHandTestAuthorization(fetcher: typeof fetch = fetch): Promise<{ accessToken: string }> {
  const authorization = await getOfficeAtHandAuthorization();
  if (!authorization) throw new Error("The separate OfficeAtHand test app has not been authorized.");
  const { clientId, clientSecret } = appCredentials();
  const refreshToken = decryptOfficeAtHandSecret(authorization.refreshTokenCiphertext);
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
  });
  if (!response.ok) throw new Error("OfficeAtHand could not refresh the separate test authorization.");
  const payload = (await response.json()) as TokenResponse;
  const nextRefreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : "";
  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!nextRefreshToken || !accessToken) {
    throw new Error("OfficeAtHand returned an incomplete test authorization refresh.");
  }
  const lifetimeSeconds = typeof payload.refresh_token_expires_in === "number" ? payload.refresh_token_expires_in : 0;
  await saveOfficeAtHandAuthorization({
    refreshTokenCiphertext: encryptOfficeAtHandSecret(nextRefreshToken),
    refreshTokenExpiresAt: lifetimeSeconds > 0 ? new Date(Date.now() + lifetimeSeconds * 1000) : null,
    ownerId: typeof payload.owner_id === "string" ? payload.owner_id : authorization.ownerId,
    grantedScope: typeof payload.scope === "string" ? payload.scope : authorization.grantedScope,
  });
  return { accessToken };
}

function callbackValue(query: CallbackQuery, key: keyof CallbackQuery): string {
  const value = query[key];
  return typeof value === "string" ? value.trim() : "";
}

export const officeAtHandOAuthRouter = Router();

officeAtHandOAuthRouter.get("/oauth/start", (req, res) => {
  if (!hasActiveCallLookupTestAccess(req.query.access)) {
    res.status(403).type("text/plain").send("This OfficeAtHand test authorization link is not authorized.");
    return;
  }
  try {
    const nonce = randomBytes(24).toString("base64url");
    const state = createOfficeAtHandAuthorizationState(nonce);
    const { clientId } = appCredentials();
    res.cookie(STATE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", maxAge: STATE_MAX_AGE_MS, path: STATE_COOKIE_PATH });
    res.redirect(302, buildOfficeAtHandAuthorizationUrl(clientId, state));
  } catch {
    res.status(503).type("text/plain").send("The separate OfficeAtHand test app is not configured yet.");
  }
});

officeAtHandOAuthRouter.get("/oauth/callback", async (req, res) => {
  const providerError = callbackValue(req.query, "error");
  const code = callbackValue(req.query, "code");
  const state = callbackValue(req.query, "state");
  const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[STATE_COOKIE] ?? "";
  res.clearCookie(STATE_COOKIE, { httpOnly: true, secure: true, sameSite: "lax", path: STATE_COOKIE_PATH });

  if (providerError || !code || !state) {
    res.status(400).type("text/plain").send("OfficeAtHand test authorization was not completed.");
    return;
  }
  try {
    if (!isValidOfficeAtHandAuthorizationState(state, expectedNonce)) {
      res.status(403).type("text/plain").send("OfficeAtHand test authorization could not be verified.");
      return;
    }
    const authorization = await exchangeOfficeAtHandAuthorizationCode(code);
    await saveOfficeAtHandAuthorization({
      refreshTokenCiphertext: authorization.encryptedRefreshToken,
      refreshTokenExpiresAt: authorization.refreshTokenExpiresAt,
      ownerId: authorization.ownerId,
      grantedScope: authorization.grantedScope,
    });
    res.redirect(302, "/pin-code-lookup-active-call-test?officeAtHand=connected");
  } catch {
    res.status(502).type("text/plain").send("OfficeAtHand test authorization could not be completed. No call-center setting was changed.");
  }
});

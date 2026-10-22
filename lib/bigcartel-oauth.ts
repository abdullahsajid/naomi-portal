import { createHmac, timingSafeEqual } from "node:crypto";
import { env, siteUrl } from "./env";

// OAuth 2.0 with Big Cartel: the owner clicks "Authorize" on Big Cartel's own page, so the portal never
// sees or stores her password. The URLs can be overridden for tests only.
const AUTHORIZE_URL = process.env.BIGCARTEL_OAUTH_AUTHORIZE_URL ?? "https://my.bigcartel.com/oauth/authorize";
const TOKEN_URL = process.env.BIGCARTEL_OAUTH_TOKEN_URL ?? "https://api.bigcartel.com/oauth/token";

export const oauthConfigured = () => !!(process.env.BIGCARTEL_CLIENT_ID && process.env.BIGCARTEL_CLIENT_SECRET);
export const redirectUri = () => siteUrl("/api/bigcartel/callback");

export function authorizeUrl(state: string): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", env("BIGCARTEL_CLIENT_ID"));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_uri", redirectUri());
  return u.toString();
}

/** Trade the one-time code for an access token. */
export async function exchangeCode(code: string): Promise<{ accessToken: string; accountId: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": env("BIGCARTEL_USER_AGENT"),
    },
    body: new URLSearchParams({
      client_id: env("BIGCARTEL_CLIENT_ID"),
      client_secret: env("BIGCARTEL_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => null);
  console.log(`[BC] POST oauth/token -> ${res.status}`); // never log the token itself
  if (!res.ok || !json?.access_token) throw new Error(`Big Cartel token exchange failed (${res.status})`);
  return { accessToken: String(json.access_token), accountId: String(json.account_id ?? "") };
}

/** Webhooks are signed with HMAC-SHA256 of the raw body, keyed with the app's client secret. */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", env("BIGCARTEL_CLIENT_SECRET")).update(rawBody).digest("hex"));
  const given = Buffer.from(signature.trim().toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

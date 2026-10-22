import { cookies } from "next/headers";
import { isAdmin } from "@/lib/admin-auth";
import { exchangeCode } from "@/lib/bigcartel-oauth";
import { siteUrl } from "@/lib/env";
import { esc } from "@/lib/email-templates";

const page = (body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Big Cartel connection</title></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;line-height:1.5;color:#1c1c1f">${body}</body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
      },
    },
  );

/**
 * Big Cartel sends the owner back here with a one-time code. We trade it for an access token and show it
 * ONCE for her to put into Netlify. It is not stored, not logged and not emailed.
 */
export async function GET(request: Request) {
  if (!(await isAdmin())) return Response.redirect(siteUrl("/admin/login"), 302);

  const url = new URL(request.url);
  const store = await cookies();
  const expected = store.get("bc_oauth_state")?.value;
  store.delete("bc_oauth_state");

  const oauthError = url.searchParams.get("error");
  if (oauthError === "access_denied") {
    return page(`<h1>Big Cartel connection cancelled</h1><p>Nothing was changed.</p><p><a href="${esc(siteUrl("/admin/bigcartel"))}">Back</a></p>`);
  }
  if (oauthError) {
    // invalid_client_id, invalid_redirect_uri, ...: a problem with the app settings, not a choice by the owner.
    return page(`<h1>Big Cartel couldn't start the sign-in</h1><p>Big Cartel reported: <strong>${esc(oauthError)}</strong>. This points to the app settings (client id, secret or redirect address). Please tell your developer.</p><p><a href="${esc(siteUrl("/admin/bigcartel"))}">Back</a></p>`, 400);
  }
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) {
    return page(`<h1>That didn't work</h1><p>The sign-in link expired or didn't match. Please start again from the admin page.</p><p><a href="${esc(siteUrl("/admin/bigcartel"))}">Back</a></p>`, 400);
  }

  try {
    const { accessToken, accountId } = await exchangeCode(code);
    return page(`<h1>Big Cartel is connected</h1>
<p>Copy these two values into <strong>Netlify</strong> (Site configuration, Environment variables), tick <em>Contains secret values</em> for the token, then redeploy.</p>
<p><strong>BIGCARTEL_ACCESS_TOKEN</strong></p>
<textarea readonly rows="3" style="width:100%;font-family:monospace" onclick="this.select()">${esc(accessToken)}</textarea>
<p><strong>BIGCARTEL_ACCOUNT_ID</strong></p>
<input readonly value="${esc(accountId)}" style="width:100%;font-family:monospace" onclick="this.select()">
<p style="color:#5d5d63">This is the only time the token is shown. It is not stored anywhere else. You don't need your Big Cartel password in the portal, and you can remove the old BIGCARTEL_PASSWORD variable.</p>`);
  } catch (e) {
    console.error("[oauth] callback failed", (e as Error).message);
    return page(`<h1>Big Cartel didn't accept the sign-in</h1><p>Please try again. If it keeps happening, tell your developer.</p><p><a href="${esc(siteUrl("/admin/bigcartel"))}">Back</a></p>`, 502);
  }
}

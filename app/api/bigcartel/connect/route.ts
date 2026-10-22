import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { isAdmin } from "@/lib/admin-auth";
import { authorizeUrl, oauthConfigured } from "@/lib/bigcartel-oauth";
import { siteUrl } from "@/lib/env";

/** Admin only: send the owner to Big Cartel's own "Authorize" page. */
export async function GET() {
  if (!(await isAdmin())) return Response.redirect(siteUrl("/admin/login"), 302);
  if (!oauthConfigured()) return Response.redirect(siteUrl("/admin/bigcartel?error=not-configured"), 302);

  const state = randomBytes(16).toString("hex");
  (await cookies()).set("bc_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return Response.redirect(authorizeUrl(state), 302);
}

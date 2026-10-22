import { btnDark } from "@/components/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { bcGet, bigCartelMode } from "@/lib/bigcartel";
import { oauthConfigured, redirectUri } from "@/lib/bigcartel-oauth";

export default async function BigCartelPage({ searchParams }: PageProps<"/admin/bigcartel">) {
  await requireAdmin();
  const { error } = await searchParams;
  const mode = bigCartelMode();

  let status: "ok" | "failed" | "not-set" = "not-set";
  if (mode !== "none") {
    try {
      await bcGet("");
      status = "ok";
    } catch {
      status = "failed";
    }
  }

  return (
    <>
      <h1 className="font-heading text-2xl mb-5">Big Cartel connection</h1>

      <section className="rounded-xl border border-line bg-card p-4 max-w-2xl text-sm space-y-2">
        <div>
          <span className="text-muted">Signed in with: </span>
          <strong>{mode === "oauth" ? "OAuth access token (no password)" : mode === "password" ? "Store password" : "nothing yet"}</strong>
        </div>
        <div>
          <span className="text-muted">Connection: </span>
          <strong className={status === "ok" ? "text-green-700" : "text-accent-strong"}>
            {status === "ok" ? "Working" : status === "failed" ? "Big Cartel is not accepting it. Reconnect below." : "Not set up"}
          </strong>
        </div>
      </section>

      {error === "not-configured" && (
        <p className="mt-4 rounded-lg bg-accent-soft px-4 py-3 text-sm max-w-2xl">
          The Big Cartel app isn&rsquo;t set up on this portal yet (BIGCARTEL_CLIENT_ID and BIGCARTEL_CLIENT_SECRET).
        </p>
      )}

      <section className="mt-6 max-w-2xl text-sm space-y-3">
        <h2 className="font-semibold">Connect without sharing your password</h2>
        <p>
          You sign in on Big Cartel&rsquo;s own page and press <strong>Authorize</strong>. The portal then gets an access
          token instead of your password. You&rsquo;ll be shown the token once, to paste into Netlify. Changing your Big
          Cartel password later doesn&rsquo;t affect the token, and you can remove the portal&rsquo;s access from Big Cartel at any
          time.
        </p>
        {oauthConfigured() ? (
          <a href="/api/bigcartel/connect" className={`${btnDark} inline-block`}>
            Connect Big Cartel
          </a>
        ) : (
          <p className="text-muted">
            Available once Big Cartel has approved the app. Redirect address for the app settings:{" "}
            <code className="break-all">{redirectUri()}</code>
          </p>
        )}
      </section>
    </>
  );
}

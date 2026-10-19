// Simultaneous-reservation test through the real verification path.
//   npm run race-test -- <product_id> [base_url]
// Needs `npm run dev` running, plus Supabase/CRON/SESSION_SECRET env vars.
// Plants 5 pending email verifications (known code 123456), confirms all 5 at once, and expects
// exactly 1x200 and 4x409. Then checks the product got hidden, force-expires the winner through the
// cron route, and checks the original Big Cartel status is restored. Cleans up its test rows.
import { createHmac, randomUUID } from "node:crypto";

const { BIGCARTEL_SUBDOMAIN, BIGCARTEL_PASSWORD, BIGCARTEL_ACCOUNT_ID, BIGCARTEL_USER_AGENT } = process.env;
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, SESSION_SECRET } = process.env;
for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, SESSION_SECRET, BIGCARTEL_PASSWORD })) {
  if (!v) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
}

const productId = process.argv[2];
const base = process.argv[3] ?? "http://localhost:3000";
if (!productId) {
  console.error("Usage: npm run race-test -- <product_id> [base_url]");
  process.exit(1);
}

const rest = `${new URL(NEXT_PUBLIC_SUPABASE_URL!).origin}/rest/v1`;
const sb = {
  apikey: SUPABASE_SERVICE_ROLE_KEY!,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function bcStatus(): Promise<string> {
  const auth = Buffer.from(`${BIGCARTEL_SUBDOMAIN}:${BIGCARTEL_PASSWORD}`).toString("base64");
  const res = await fetch(`https://api.bigcartel.com/v1/accounts/${BIGCARTEL_ACCOUNT_ID}/products/${productId}`, {
    headers: { Accept: "application/vnd.api+json", "User-Agent": BIGCARTEL_USER_AGENT!, Authorization: `Basic ${auth}` },
  });
  return (await res.json()).data.attributes.status;
}

const hmac = (v: string) => createHmac("sha256", SESSION_SECRET!).update(v).digest("hex");

async function main() {
  const startStatus = await bcStatus();
  console.log(`Big Cartel status before: ${startStatus}`);
  if (startStatus !== "active") {
    console.error("Product must be active to run this test.");
    process.exit(1);
  }

  // Plant 5 verifications with a known code.
  const rows = [1, 2, 3, 4, 5].map((i) => {
    const id = randomUUID();
    const email = `race${i}@example.com`;
    return {
      id,
      email,
      ip_hash: `race-test-${i}`,
      product_id: productId,
      payload: {
        productId, name: `Race Tester ${i}`, email, phone: "+61412345678",
        street: "1 Test Street", suburb: "Sydney", state: "NSW", postcode: "2000", country: "Australia", terms: true,
      },
      code_hash: hmac(`code:${id}:123456`),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
  });
  const ins = await fetch(`${rest}/email_verifications`, { method: "POST", headers: sb, body: JSON.stringify(rows) });
  if (!ins.ok) {
    console.error("Could not plant verifications. Did you run supabase/migration-002-email-verification.sql?", await ins.text());
    process.exit(1);
  }

  const t0 = Date.now();
  const results = await Promise.all(
    rows.map(async (r, i) => {
      const res = await fetch(`${base}/api/verify/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId: r.id, code: "123456" }),
      });
      return { i: i + 1, status: res.status, json: await res.json() };
    }),
  );
  console.log(`5 confirmations finished in ${Date.now() - t0}ms`);
  for (const r of results) console.log(`  #${r.i} -> ${r.status} ${JSON.stringify(r.json)}`);

  const wins = results.filter((r) => r.status === 200);
  const conflicts = results.filter((r) => r.status === 409);
  const pass1 = wins.length === 1 && conflicts.length === 4;
  console.log(pass1 ? "PASS: exactly 1 winner, 4 conflicts" : "FAIL: expected 1x200 and 4x409");

  const hidden = await bcStatus();
  console.log(`Big Cartel status after reserve: ${hidden}`, hidden === "hidden" ? "(PASS)" : "(FAIL)");

  // Cleanup: backdate the winner's expiry, let the cron expire it (restores status), then delete test rows.
  let pass2 = false;
  if (wins[0]) {
    await fetch(`${rest}/reservations?id=eq.${wins[0].json.id}`, {
      method: "PATCH",
      headers: sb,
      body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
    });
    const cron = await fetch(`${base}/api/cron/expire`, { method: "POST", headers: { "x-cron-secret": CRON_SECRET! } });
    console.log(`cron/expire -> ${cron.status} ${await cron.text()}`);
    const restored = await bcStatus();
    pass2 = restored === startStatus;
    console.log(`Big Cartel status after expiry: ${restored}`, pass2 ? "(PASS, original restored)" : "(FAIL)");
  }
  await fetch(`${rest}/reservations?customer_email=like.race*@example.com`, { method: "DELETE", headers: sb });
  await fetch(`${rest}/email_verifications?email=like.race*@example.com`, { method: "DELETE", headers: sb });
  process.exit(pass1 && hidden === "hidden" && pass2 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};

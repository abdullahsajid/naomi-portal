// Simultaneous-reservation test through the real verification path.
//   npm run race-test -- <product_id> [base_url]
// Needs `npm run dev` running, plus Supabase/CRON/SESSION_SECRET env vars.
// Reads the artwork's stock (N) from Big Cartel, plants N+3 pending email verifications (known code
// 123456) and confirms them all at once. Exactly N must win and 3 must be told it is reserved. When
// all N units are taken the artwork must be hidden. Then every winner is force-expired through the
// cron route and the original Big Cartel status must come back. Test rows are cleaned up.
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

async function bcProduct(): Promise<{ status: string; units: number }> {
  const auth = Buffer.from(`${BIGCARTEL_SUBDOMAIN}:${BIGCARTEL_PASSWORD}`).toString("base64");
  const res = await fetch(
    `https://api.bigcartel.com/v1/accounts/${BIGCARTEL_ACCOUNT_ID}/products/${productId}?include=options`,
    { headers: { Accept: "application/vnd.api+json", "User-Agent": BIGCARTEL_USER_AGENT!, Authorization: `Basic ${auth}` } },
  );
  const j = await res.json();
  const options = (j.included ?? []).filter((i: any) => i.type === "product_options");
  const units = options.reduce((n: number, o: any) => n + (o.attributes?.quantity == null ? 1 : Number(o.attributes.quantity)), 0);
  return { status: j.data.attributes.status, units };
}

const hmac = (v: string) => createHmac("sha256", SESSION_SECRET!).update(v).digest("hex");

async function main() {
  const start = await bcProduct();
  console.log(`Big Cartel before: status ${start.status}, stock ${start.units}`);
  if (start.status !== "active" || start.units < 1) {
    console.error("The artwork must be active with stock of at least 1 to run this test.");
    process.exit(1);
  }
  const units = start.units;
  const total = units + 3;

  const rows = Array.from({ length: total }, (_, k) => {
    const i = k + 1;
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
    console.error("Could not plant verifications. Did you run the SQL migrations in supabase/?", await ins.text());
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
  console.log(`${total} confirmations (stock ${units}) finished in ${Date.now() - t0}ms`);
  for (const r of results) console.log(`  #${r.i} -> ${r.status} ${JSON.stringify(r.json)}`);

  const wins = results.filter((r) => r.status === 200);
  const conflicts = results.filter((r) => r.status === 409);
  const pass1 = wins.length === units && conflicts.length === 3;
  console.log(pass1 ? `PASS: exactly ${units} winner(s), 3 told it is reserved` : `FAIL: expected ${units}x200 and 3x409`);

  const after = await bcProduct();
  console.log(`Big Cartel after reserve: ${after.status}`, after.status === "hidden" ? "(PASS: every unit held, so hidden)" : "(FAIL)");

  // Cleanup: backdate every winner, let the cron expire them (frees the units, restores the status).
  let pass2 = false;
  if (wins.length) {
    for (const w of wins) {
      await fetch(`${rest}/reservations?id=eq.${w.json.id}`, {
        method: "PATCH",
        headers: sb,
        body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
      });
    }
    const cron = await fetch(`${base}/api/cron/expire`, { method: "POST", headers: { "x-cron-secret": CRON_SECRET! } });
    console.log(`cron/expire -> ${cron.status} ${await cron.text()}`);
    const restored = await bcProduct();
    pass2 = restored.status === start.status;
    console.log(`Big Cartel after expiry: ${restored.status}`, pass2 ? "(PASS, original restored)" : "(FAIL)");
  }
  await fetch(`${rest}/reservations?customer_email=like.race*@example.com`, { method: "DELETE", headers: sb });
  await fetch(`${rest}/email_verifications?email=like.race*@example.com`, { method: "DELETE", headers: sb });
  process.exit(pass1 && after.status === "hidden" && pass2 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};

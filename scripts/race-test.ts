// Simultaneous-reservation test. Needs `npm run dev` running and Supabase/CRON env vars set.
//   npm run race-test -- <product_id> [base_url]
// Fires 5 reserve requests at once, expects exactly 1x 200 and 4x 409, checks the product got
// hidden on Big Cartel, then force-expires the winner via the cron route and checks the original
// status is restored.

const { BIGCARTEL_SUBDOMAIN, BIGCARTEL_PASSWORD, BIGCARTEL_ACCOUNT_ID, BIGCARTEL_USER_AGENT } = process.env;
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET } = process.env;
for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, BIGCARTEL_PASSWORD })) {
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

async function bcStatus(): Promise<string> {
  const auth = Buffer.from(`${BIGCARTEL_SUBDOMAIN}:${BIGCARTEL_PASSWORD}`).toString("base64");
  const res = await fetch(`https://api.bigcartel.com/v1/accounts/${BIGCARTEL_ACCOUNT_ID}/products/${productId}`, {
    headers: { Accept: "application/vnd.api+json", "User-Agent": BIGCARTEL_USER_AGENT!, Authorization: `Basic ${auth}` },
  });
  return (await res.json()).data.attributes.status;
}

async function main() {
  const startStatus = await bcStatus();
  console.log(`Big Cartel status before: ${startStatus}`);
  if (startStatus !== "active") {
    console.error("Product must be active to run this test.");
    process.exit(1);
  }

  const body = (i: number) =>
    JSON.stringify({
      productId,
      name: `Race Tester ${i}`,
      email: `race${i}@example.com`,
      address: "1 Test Street, Sydney NSW 2000, Australia",
      terms: true,
    });
  const t0 = Date.now();
  const results = await Promise.all(
    [1, 2, 3, 4, 5].map(async (i) => {
      const res = await fetch(`${base}/api/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body(i),
      });
      return { i, status: res.status, json: await res.json() };
    }),
  );
  console.log(`5 requests finished in ${Date.now() - t0}ms`);
  for (const r of results) console.log(`  #${r.i} -> ${r.status} ${JSON.stringify(r.json)}`);

  const wins = results.filter((r) => r.status === 200);
  const conflicts = results.filter((r) => r.status === 409);
  const pass1 = wins.length === 1 && conflicts.length === 4;
  console.log(pass1 ? "PASS: exactly 1 winner, 4 conflicts" : "FAIL: expected 1x200 and 4x409");

  const hidden = await bcStatus();
  console.log(`Big Cartel status after reserve: ${hidden}`, hidden === "hidden" ? "(PASS)" : "(FAIL)");

  // Cleanup: backdate the winner's expiry, then let the cron expire it and restore status.
  let pass2 = false;
  if (wins[0]) {
    const rest = `${new URL(NEXT_PUBLIC_SUPABASE_URL!).origin}/rest/v1/reservations?id=eq.${wins[0].json.id}`;
    await fetch(rest, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
    });
    const cron = await fetch(`${base}/api/cron/expire`, { method: "POST", headers: { "x-cron-secret": CRON_SECRET! } });
    console.log(`cron/expire -> ${cron.status} ${await cron.text()}`);
    const restored = await bcStatus();
    pass2 = restored === startStatus;
    console.log(`Big Cartel status after expiry: ${restored}`, pass2 ? "(PASS, original restored)" : "(FAIL)");
  }
  process.exit(pass1 && hidden === "hidden" && pass2 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};

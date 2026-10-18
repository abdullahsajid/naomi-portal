// Big Cartel API probe. Usage:
//   npm run bc-test -- <product_id>
// Prints the raw product JSON, sets status to hidden (the reservation lock), then restores it.

const {
  BIGCARTEL_SUBDOMAIN,
  BIGCARTEL_PASSWORD,
  BIGCARTEL_ACCOUNT_ID,
  BIGCARTEL_USER_AGENT,
} = process.env;

if (!BIGCARTEL_SUBDOMAIN || !BIGCARTEL_PASSWORD || !BIGCARTEL_ACCOUNT_ID || !BIGCARTEL_USER_AGENT) {
  console.error("Missing BIGCARTEL_* env vars in .env.local");
  process.exit(1);
}

const BASE = "https://api.bigcartel.com/v1";
const auth = "Basic " + Buffer.from(`${BIGCARTEL_SUBDOMAIN}:${BIGCARTEL_PASSWORD}`).toString("base64");

async function bc(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.api+json",
      ...(body ? { "Content-Type": "application/vnd.api+json" } : {}),
      "User-Agent": BIGCARTEL_USER_AGENT!,
      Authorization: auth,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  console.log(`[BC] ${method} ${path} -> ${res.status}`);
  return { ok: res.ok, status: res.status, json, text };
}

const accountPath = `/accounts/${BIGCARTEL_ACCOUNT_ID}`;

async function getProduct(productId: string) {
  return bc("GET", `${accountPath}/products/${productId}?include=options`);
}

function findOption(json: any) {
  const included = (json?.included ?? []) as any[];
  return included.find((i) => i.type === "product_options") ?? included[0];
}

async function main() {
  const productId = process.argv[2];
  if (!productId) {
    const list = await bc("GET", `${accountPath}/products?page[size]=5`);
    const first = list.json?.data ?? [];
    console.log("No product id given. Available products:");
    for (const p of first) console.log(`  ${p.id}  ${p.attributes?.name}`);
    console.log("Re-run with: npm run bc-test -- <product_id>");
    return;
  }

  const before = await getProduct(productId);
  console.log("---- RAW PRODUCT JSON ----");
  console.log(JSON.stringify(before.json ?? before.text, null, 2));
  if (!before.ok) process.exit(1);

  const option = findOption(before.json);
  if (!option) {
    console.error("No option found in response (check the raw JSON above).");
    process.exit(1);
  }
  const optionId = option.id as string;
  const original = option.attributes?.quantity;
  console.log(`Option ${optionId} quantity = ${original}`);

  // Option quantity is read-only in the v1 API; we lock artworks via product status instead.
  const originalStatus = before.json.data.attributes.status as string;
  const setStatus = (status: string) =>
    bc("PATCH", `${accountPath}/products/${productId}`, {
      data: { id: productId, type: "products", attributes: { status } },
    });
  const readStatus = async () => (await getProduct(productId)).json?.data?.attributes?.status;

  for (const status of ["hidden", originalStatus]) {
    const r = await setStatus(status);
    console.log(`PATCH status=${status} -> ${r.status}; now: ${await readStatus()}`);
    if (!r.ok) console.log(r.text);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};

// Prints the Big Cartel account id for the store in .env.local (subdomain + password).
//   npm run bc-account
// Copy the id into BIGCARTEL_ACCOUNT_ID. Nothing secret is printed.
const { BIGCARTEL_SUBDOMAIN, BIGCARTEL_PASSWORD, BIGCARTEL_USER_AGENT } = process.env;

if (!BIGCARTEL_SUBDOMAIN || !BIGCARTEL_PASSWORD) {
  console.error("Set BIGCARTEL_SUBDOMAIN and BIGCARTEL_PASSWORD in .env.local first.");
  process.exit(1);
}

const res = await fetch("https://api.bigcartel.com/v1/accounts", {
  headers: {
    Accept: "application/vnd.api+json",
    "User-Agent": BIGCARTEL_USER_AGENT ?? "NaomiKatzPortal/1.0 (hello@naomikatzart.com)",
    Authorization: "Basic " + Buffer.from(`${BIGCARTEL_SUBDOMAIN}:${BIGCARTEL_PASSWORD}`).toString("base64"),
  },
});

if (!res.ok) {
  console.error(`Big Cartel answered ${res.status}. Check the subdomain and password.`);
  process.exit(1);
}

const json = await res.json();
for (const a of json.data ?? []) {
  console.log(`BIGCARTEL_ACCOUNT_ID=${a.id}   (store: ${a.attributes?.subdomain})`);
}

export {};

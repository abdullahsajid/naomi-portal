import { env } from "./env";

const BASE = "https://api.bigcartel.com/v1";

export type BcStatus = "active" | "hidden" | (string & {});

export type BcProduct = {
  id: string;
  name: string;
  status: BcStatus;
  price: number;
  imageUrl: string | null;
  url: string | null;
  optionId: string | null;
  quantity: number;
};

/** status 0 = the request never got an answer (timeout, network). */
export class BcError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const TIMEOUT_MS = 8000; // Netlify functions stop at ~10s, so fail fast and show a friendly message

async function bc(method: string, path: string, body?: unknown) {
  // Read config first so a missing variable is reported as that, not as "no response".
  const auth = Buffer.from(`${env("BIGCARTEL_SUBDOMAIN")}:${env("BIGCARTEL_PASSWORD")}`).toString("base64");
  const headers: Record<string, string> = {
    Accept: "application/vnd.api+json",
    "User-Agent": env("BIGCARTEL_USER_AGENT"),
    Authorization: `Basic ${auth}`,
  };
  if (body) headers["Content-Type"] = "application/vnd.api+json";

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    console.log(`[BC] ${method} ${path} -> no response (${(e as Error).name})`);
    throw new BcError(0, `Big Cartel ${method} ${path} got no response`);
  }
  const text = await res.text();
  console.log(`[BC] ${method} ${path} -> ${res.status}${res.ok ? "" : " " + text.slice(0, 300)}`);
  if (!res.ok) throw new BcError(res.status, `Big Cartel ${method} ${path} failed (${res.status})`);
  return text ? JSON.parse(text) : null;
}

const account = () => `/accounts/${env("BIGCARTEL_ACCOUNT_ID")}`;

/** GET anything under the account, e.g. bcGet("/orders?sort=-created_at"). */
export const bcGet = (path: string) => bc("GET", `${account()}${path}`);

function parseProduct(data: any, included: any[] = []): BcProduct {
  const option = included.find((i) => i.type === "product_options");
  return {
    id: data.id,
    name: data.attributes.name,
    status: data.attributes.status,
    price: Number(option?.attributes?.price ?? data.attributes.default_price),
    imageUrl: data.attributes.primary_image_url ?? null,
    url: data.attributes.url ?? null,
    optionId: option?.id ?? null,
    quantity: Number(option?.attributes?.quantity ?? 0),
  };
}

export async function getProduct(productId: string): Promise<BcProduct> {
  const json = await bc("GET", `${account()}/products/${encodeURIComponent(productId)}?include=options`);
  return parseProduct(json.data, json.included);
}

export async function listProducts(): Promise<BcProduct[]> {
  const json = await bc("GET", `${account()}/products?include=options&page[size]=100`);
  return (json.data as any[]).map((d) => {
    const optionIds = new Set((d.relationships?.options?.data ?? []).map((o: any) => o.id));
    return parseProduct(d, (json.included ?? []).filter((i: any) => optionIds.has(i.id) || i.type !== "product_options"));
  });
}

/** Option quantity is read-only in the API; we lock artworks via product status. */
export async function setProductStatus(productId: string, status: BcStatus): Promise<void> {
  await bc("PATCH", `${account()}/products/${encodeURIComponent(productId)}`, {
    data: { id: productId, type: "products", attributes: { status } },
  });
}

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const reservationMinutes = () => Number(process.env.RESERVATION_MINUTES) || 15;

/** Public store address for "back to the store" links. STORE_URL wins, else the Big Cartel subdomain. */
export function storeUrl(): string {
  const url = process.env.STORE_URL;
  if (url) return url.replace(/\/$/, "");
  const sub = process.env.BIGCARTEL_SUBDOMAIN;
  return sub ? `https://${sub}.bigcartel.com` : "/";
}

/** Absolute address on this portal, e.g. siteUrl("/admin"). */
export const siteUrl = (path = "") => `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}${path}`;

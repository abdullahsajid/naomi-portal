const COLORS: Record<string, string> = {
  locking: "bg-gray-100 text-gray-700",
  active: "bg-amber-100 text-amber-800",
  receipt_uploaded: "bg-blue-100 text-blue-800",
  sold: "bg-green-100 text-green-800",
  expired: "bg-gray-100 text-gray-600",
  released: "bg-gray-100 text-gray-600",
  failed: "bg-red-100 text-red-700",
  hidden: "bg-gray-100 text-gray-700",
};

export function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLORS[value] ?? "bg-gray-100"}`}>
      {value.replace("_", " ")}
    </span>
  );
}

export function timeLeft(expiresAt: string | null, status: string) {
  if (status !== "active" || !expiresAt) return "–";
  const s = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (s <= 0) return "expiring";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "–";

export const money = (n: number | null) => (n == null ? "–" : `A$${Number(n).toFixed(2)}`);

export const btn = "rounded-lg px-4 py-2.5 text-sm font-semibold";
export const btnDark = `${btn} bg-ink text-white`;
export const btnLight = `${btn} border border-line bg-white`;
export const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent";

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const field =
  "mt-2 w-full rounded-lg border border-line bg-white px-3.5 py-3 text-base outline-none focus:border-accent";
const label = "block text-xs font-semibold tracking-[0.15em] text-muted uppercase mt-5";

export function DetailsForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          name: f.get("name"),
          email: f.get("email"),
          address: f.get("address"),
          terms: f.get("terms") === "on",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        if (res.status === 409) router.refresh(); // page re-renders as "currently reserved"
        setBusy(false);
        return;
      }
      router.push(`/reservation/${json.id}`);
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2">
      <label className={label} htmlFor="name">Full name</label>
      <input id="name" name="name" required autoComplete="name" className={field} />

      <label className={label} htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" required autoComplete="email" className={field} />

      <label className={label} htmlFor="address">Shipping address</label>
      <textarea id="address" name="address" required rows={4} autoComplete="street-address" className={field} />

      <label className="mt-6 flex items-start gap-3 text-sm leading-relaxed">
        <input type="checkbox" name="terms" required className="mt-1 h-5 w-5 accent-[#b3123f] shrink-0" />
        <span>
          I understand my reservation is confirmed once I upload proof of payment, and my purchase is final once
          payment clears.
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-lg bg-ink text-white py-3.5 font-semibold disabled:opacity-60"
      >
        {busy ? "Reserving…" : "Reserve artwork & view bank details →"}
      </button>
    </form>
  );
}

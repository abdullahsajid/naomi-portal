"use client";

import { Shell } from "@/components/Shell";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Shell>
      <h1 className="font-heading text-3xl text-center leading-tight">Something went wrong</h1>
      <p className="mt-4 text-center text-muted">
        Sorry about that. Nothing has been charged or reserved by this page. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 w-full rounded-lg bg-ink text-white py-3.5 font-semibold"
      >
        Try again
      </button>
    </Shell>
  );
}

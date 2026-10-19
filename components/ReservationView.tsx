"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArtworkHeader, Shell } from "./Shell";

export type View = {
  id: string;
  reference: string;
  status: "locking" | "active" | "receipt_uploaded" | "sold" | "expired" | "released" | "failed";
  productName: string | null;
  productImage: string | null;
  amount: number | null;
  expiresAt: string | null;
  serverNow: string;
  storeUrl: string;
  bank?: {
    bankName?: string | null;
    accountName?: string | null;
    accountNumber?: string | null;
    swiftCode?: string | null;
    bsb?: string | null;
    instructions?: string | null;
  } | null;
};

const money = (n: number) =>
  `A$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const remaining = (v: View) =>
  v.expiresAt ? new Date(v.expiresAt).getTime() - new Date(v.serverNow).getTime() : 0;

export function ReservationView({ initial }: { initial: View }) {
  const [view, setView] = useState(initial);
  // Countdown runs off the server's clock: remaining ms at fetch time, anchored to a local deadline.
  const [msLeft, setMsLeft] = useState(() => remaining(initial));
  const deadline = useRef(0);
  const statusRef = useRef(view.status);

  const apply = useCallback((v: View) => {
    deadline.current = Date.now() + remaining(v);
    statusRef.current = v.status;
    setMsLeft(remaining(v));
    setView(v);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservation/${initial.id}`, { cache: "no-store" });
      if (res.ok) apply(await res.json());
    } catch {}
  }, [initial.id, apply]);

  useEffect(() => {
    deadline.current = Date.now() + remaining(initial);
    let sinceRefresh = 0;
    const t = setInterval(() => {
      setMsLeft(deadline.current - Date.now());
      sinceRefresh++;
      const s = statusRef.current;
      const live = s === "active" || s === "receipt_uploaded" || s === "locking";
      const timeUp = s === "active" && deadline.current - Date.now() <= 0;
      // Keep status fresh (admin marks sold, cron expires); confirm immediately when the timer hits zero.
      if (live && (timeUp ? sinceRefresh >= 3 : sinceRefresh >= 20)) {
        sinceRefresh = 0;
        refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [initial, refresh]);

  const timeUp = view.status === "active" && msLeft <= 0;

  if (view.status === "active" && !timeUp) {
    return <ActiveState view={view} msLeft={msLeft} onUploaded={refresh} />;
  }
  if (view.status === "receipt_uploaded") {
    return (
      <Shell>
        <ArtworkHeader name={view.productName} image={view.productImage} />
        <Message
          title="Thank you, receipt received"
          body="Your artwork is reserved while we verify your payment. We'll email you once it's confirmed."
        />
        <Reference value={view.reference} />
      </Shell>
    );
  }
  if (view.status === "sold") {
    return (
      <Shell>
        <ArtworkHeader name={view.productName} image={view.productImage} />
        <Message title="Payment confirmed" body="Thank you! Your artwork is yours. We'll be in touch about shipping." />
        <Reference value={view.reference} />
      </Shell>
    );
  }
  if (view.status === "locking") {
    return (
      <Shell>
        <Message title="Reserving your artwork…" body="This only takes a moment. Please refresh the page in a few seconds." />
      </Shell>
    );
  }
  // expired | released | failed (or the timer just ran out)
  return (
    <Shell>
      <ArtworkHeader name={view.productName} image={view.productImage} />
      <Message
        title={view.status === "failed" ? "We couldn't reserve this artwork" : "This reservation has ended"}
        body="The artwork is not held for you any more. If it's still available you're welcome to reserve it again."
      />
      <a
        href={view.storeUrl}
        className="mt-6 flex items-center justify-center rounded-lg bg-ink text-white py-3.5 font-semibold"
      >
        Back to the store
      </a>
    </Shell>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center">
      <h1 className="font-heading text-3xl leading-tight">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
    </div>
  );
}

function Reference({ value }: { value: string }) {
  return (
    <p className="mt-6 text-center text-sm text-muted">
      Payment reference: <span className="font-semibold text-ink">{value}</span>
    </p>
  );
}

function ActiveState({ view, msLeft, onUploaded }: { view: View; msLeft: number; onUploaded: () => void }) {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  const bank = view.bank;
  const rows: [string, string | null | undefined][] = [
    ["Bank", bank?.bankName],
    ["Account number", bank?.accountNumber],
    ["Account name", bank?.accountName],
    ["BSB", bank?.bsb],
    ["SWIFT code", bank?.swiftCode],
    ["Payment reference", view.reference],
  ];

  return (
    <main className="flex-1 w-full max-w-md mx-auto px-4 py-4 space-y-3">
      <section className="rounded-2xl bg-accent-soft px-4 py-5 text-center">
        <svg className="mx-auto text-accent-strong" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" />
        </svg>
        <div className="text-6xl font-extrabold tabular-nums tracking-tight" aria-live="off">
          {mm}:{ss}
        </div>
        <p className="mt-1 font-semibold">Upload your payment receipt before the timer expires.</p>
        <p className="text-sm">Your artwork is temporarily reserved.</p>
      </section>

      <ArtworkHeader name={view.productName} image={view.productImage} />

      <section className="rounded-2xl bg-accent-soft px-4 py-4 flex items-center gap-4 text-accent-strong">
        <span className="shrink-0 grid place-items-center h-14 w-14 rounded-full bg-accent text-white text-3xl font-bold">!</span>
        <div className="text-center flex-1">
          <div className="text-3xl font-extrabold leading-none">PAY IN AUD ONLY</div>
          <p className="mt-2 font-semibold text-[15px] leading-snug">
            Select Australian dollars as your transfer currency, even when paying from overseas. Cover all transfer
            fees so the full amount is received.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card px-4 py-4 flex items-center justify-between">
        <span className="font-semibold text-lg">Amount to transfer</span>
        <span className="text-3xl font-extrabold">{view.amount != null ? money(view.amount) : "–"}</span>
      </section>

      <section className="rounded-2xl border border-line bg-card px-4 py-4">
        <h2 className="text-xl font-bold mb-3">Bank details</h2>
        <div className="space-y-2">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft/40 border border-line px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm text-muted">{k}</div>
                  <div className="font-bold text-lg break-words">{v}</div>
                </div>
                <CopyButton value={v!} />
              </div>
            ))}
        </div>
        {bank?.instructions && <p className="mt-3 text-sm whitespace-pre-line">{bank.instructions}</p>}
      </section>

      <UploadCard id={view.id} onUploaded={onUploaded} />

      <section className="rounded-2xl bg-accent-soft px-4 py-4 flex gap-3 text-sm leading-relaxed">
        <svg className="shrink-0 text-accent-strong" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7.5v.5" strokeLinecap="round" />
        </svg>
        <p>
          Your payment does not need to arrive within 15 minutes. Once your receipt is uploaded, your artwork stays
          reserved while we verify payment. If no receipt is uploaded before the timer expires, the artwork
          automatically becomes available again.
        </p>
      </section>
    </main>
  );
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const t = document.createElement("textarea");
      t.value = value;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-lg bg-accent-soft px-3 py-2 text-sm font-semibold min-w-[72px]"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function UploadCard({ id, onUploaded }: { id: string; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/reservation/${id}/receipt`, { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Upload failed. Please try again.");
        setBusy(false);
        if (res.status === 409) onUploaded();
        return;
      }
      onUploaded();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-card px-4 py-4">
      <h2 className="text-xl font-bold mb-3">Upload your payment receipt</h2>
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-accent/40 px-4 py-8 text-center">
        <svg className="mx-auto text-accent-strong" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7Z" strokeLinejoin="round" />
          <path d="M12 16v-6m0 0-2.5 2.5M12 10l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="mt-1 font-medium break-all">{file ? file.name : "Choose a screenshot or PDF"}</div>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-strong">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={upload}
        disabled={!file || busy}
        className="mt-4 w-full rounded-lg bg-ink text-white py-3.5 font-semibold disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Upload receipt"}
      </button>
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const field =
  "mt-2 w-full rounded-lg border border-line bg-white px-3.5 py-3 text-base outline-none focus:border-accent";
const label = "block text-xs font-semibold tracking-[0.15em] text-muted uppercase mt-5";
const RESEND_SECONDS = 60;

type Details = Record<string, string | boolean>;

function Input({
  id,
  text,
  type = "text",
  autoComplete,
  placeholder,
  inputMode,
}: {
  id: string;
  text: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  inputMode?: "tel" | "email" | "text";
}) {
  return (
    <div>
      <label className={label} htmlFor={id}>
        {text}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        inputMode={inputMode}
        className={field}
      />
    </div>
  );
}

export function DetailsForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"details" | "code">("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const details = useRef<Details>({});
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  function startCooldown() {
    if (timer.current) clearInterval(timer.current);
    let left = RESEND_SECONDS;
    setCooldown(left);
    timer.current = setInterval(() => {
      left -= 1;
      setCooldown(left);
      if (left <= 0 && timer.current) clearInterval(timer.current);
    }, 1000);
  }

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, json: await res.json().catch(() => ({})) };
  }

  async function sendCode(d: Details) {
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await post("/api/verify/start", { productId, ...d });
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        if (res.status === 409) router.refresh(); // page re-renders as "currently reserved"
        return false;
      }
      setVerificationId(json.verificationId);
      setEmail(String(d.email));
      setStep("code");
      startCooldown();
      return true;
    } catch {
      setError("Network error. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function onDetails(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const d: Details = { terms: f.get("terms") === "on" };
    for (const [k, v] of f.entries()) if (k !== "terms") d[k] = String(v);
    details.current = d;
    sendCode(d);
  }

  async function onCode(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !verificationId) return;
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await post("/api/verify/confirm", { verificationId, code });
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        if (res.status === 409) router.refresh();
        setBusy(false);
        return;
      }
      router.push(`/reservation/${json.id}`);
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  const errorBox = error && (
    <p role="alert" className="mt-4 rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-strong">
      {error}
    </p>
  );

  return (
    <>
      {/* Kept mounted (just hidden) while the code step shows, so "Change details" keeps what was typed. */}
      <form onSubmit={onDetails} className={step === "details" ? "mt-2" : "hidden"}>
        <Input id="name" text="Full name" autoComplete="name" />
        <Input id="email" text="Email address" type="email" autoComplete="email" inputMode="email" />
        <Input id="phone" text="Mobile phone (with country code)" type="tel" autoComplete="tel" inputMode="tel" placeholder="+61 412 345 678" />
        <Input id="street" text="Street address" autoComplete="address-line1" />
        <div className="grid grid-cols-2 gap-3">
          <Input id="suburb" text="Suburb / city" autoComplete="address-level2" />
          <Input id="state" text="State / province" autoComplete="address-level1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input id="postcode" text="Postcode / ZIP" autoComplete="postal-code" />
          <Input id="country" text="Country" autoComplete="country-name" />
        </div>

        {/* Honeypot: invisible to people, bots fill it in. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label>
            Website <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <label className="mt-6 flex items-start gap-3 text-sm leading-relaxed">
          <input type="checkbox" name="terms" required className="mt-1 h-5 w-5 accent-[#d64fe7] shrink-0" />
          <span>
            I understand my reservation is confirmed once I upload proof of payment, and my purchase is final once
            payment clears.
          </span>
        </label>

        {step === "details" && errorBox}

        <button type="submit" disabled={busy} className="mt-6 w-full rounded-lg bg-ink text-white py-3.5 font-semibold disabled:opacity-60">
          {busy ? "Sending code…" : "Email me a verification code →"}
        </button>
        <p className="mt-3 text-center text-xs text-muted">
          We&apos;ll email you a 6-digit code. Nothing is reserved until you enter it.
        </p>
      </form>

      {step === "code" && (
        <form onSubmit={onCode} className="mt-2">
          <h2 className="font-heading text-2xl">Check your email</h2>
          <p className="mt-2 text-sm text-muted">
            We sent a 6-digit code to <strong className="text-ink">{email}</strong>. Enter it to reserve your artwork
            and see the bank details. Your 15-minute timer starts once the code is confirmed.
          </p>

          <label className={label} htmlFor="code">Verification code</label>
          <input
            id="code"
            name="code"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            className={`${field} text-center text-2xl tracking-[0.5em] tabular-nums`}
          />

          {errorBox}

          <button type="submit" disabled={busy} className="mt-6 w-full rounded-lg bg-ink text-white py-3.5 font-semibold disabled:opacity-60">
            {busy ? "Verifying…" : "Verify & view bank details →"}
          </button>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => sendCode(details.current)}
              className="text-accent-strong underline disabled:opacity-50 disabled:no-underline"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("details");
                setError(null);
              }}
              className="text-muted underline"
            >
              Change details
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">Can&apos;t see it? Check your spam folder.</p>
        </form>
      )}
    </>
  );
}

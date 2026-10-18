"use client";

import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action}>
      <label className="block text-sm font-semibold" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoFocus
        className="mt-2 w-full rounded-lg border border-line bg-white px-3.5 py-3 outline-none focus:border-accent"
      />
      {state?.error && <p className="mt-3 text-sm text-accent">{state.error}</p>}
      <button disabled={pending} className="mt-4 w-full rounded-lg bg-ink text-white py-3 font-semibold disabled:opacity-60">
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}

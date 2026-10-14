"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [err, setErr] = useState("");

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(window.location.search).get("next") ?? "/settings";
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) { setErr(error.message); setState("error"); } else setState("sent");
  }

  if (!configured) return <p className="card mx-auto max-w-md p-5 text-sm">Sign-in is unavailable in demo mode. Configure Supabase (see README) to enable accounts and alerts.</p>;
  return (
    <form onSubmit={go} className="card mx-auto max-w-md space-y-3 p-5">
      <h1 className="text-xl font-extrabold text-brand-900">Sign in to manage alerts</h1>
      <p className="text-sm text-slate-600">We&apos;ll email you a one-time sign-in link. No password needed.</p>
      <div><label htmlFor="email" className="label">Email address</label><input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
      <button className="btn-primary w-full">Email me a link</button>
      {state === "sent" && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Check your inbox for the sign-in link.</p>}
      {state === "error" && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{err}</p>}
    </form>
  );
}

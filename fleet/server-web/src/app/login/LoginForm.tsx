"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("admin@fleet.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Login failed");
        return;
      }
      router.replace(params.get("next") || "/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ fontSize: 22 }}>
          Fleet<span>OS</span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Sign in to the admin console</p>

        <label className="login-label">Email</label>
        <input className="login-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />

        <label className="login-label">Password</label>
        <input
          className="login-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}

        <button className="btn" style={{ marginTop: 8, padding: "10px" }} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Dev seed: admin@fleet.local / admin1234
        </p>
      </form>
    </div>
  );
}

"use client";

import { signIn } from "next-auth/react";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell loading />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-redirect: if the dashboard is accessible without login
  // (AUTH_DEV_OPEN=1), just go straight there.
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (s?.user?.id) {
          router.push(callbackUrl);
          return;
        }
      })
      .catch(() => {});

    // Also try hitting the dashboard directly — if dev-open mode is on,
    // the middleware lets us through without a session.
    fetch(callbackUrl, { method: "HEAD", redirect: "manual" })
      .then((r) => {
        // If we get 200 (not a redirect to /login), we can go there
        if (r.ok || r.status === 200) {
          router.push(callbackUrl);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <LoginShell
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      error={error}
      loading={loading}
      onSubmit={onSubmit}
    />
  );
}

type ShellProps = {
  loading?: boolean;
  email?: string;
  setEmail?: (v: string) => void;
  password?: string;
  setPassword?: (v: string) => void;
  error?: string | null;
  onSubmit?: (e: React.FormEvent) => void;
};

function LoginShell(props: ShellProps) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={props.onSubmit}
        className="w-full max-w-sm bg-[var(--color-surface)] border rounded-2xl p-8 shadow-xl"
      >
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Creator OS</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Sign in to your dashboard.
          </p>
        </div>

        <label htmlFor="login-email" className="block text-sm mb-1">Email</label>
        <input
          id="login-email"
          type="email"
          value={props.email ?? ""}
          onChange={(e) => props.setEmail?.(e.target.value)}
          required
          autoComplete="email"
          disabled={props.loading || !props.setEmail}
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] mb-4"
        />

        <label htmlFor="login-password" className="block text-sm mb-1">Password</label>
        <input
          id="login-password"
          type="password"
          value={props.password ?? ""}
          onChange={(e) => props.setPassword?.(e.target.value)}
          required
          autoComplete="current-password"
          disabled={props.loading || !props.setPassword}
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] mb-6"
        />

        {props.error && <p className="text-sm text-red-800 mb-4">{props.error}</p>}

        <button
          type="submit"
          disabled={props.loading || !props.onSubmit}
          className="w-full py-2 rounded-lg bg-[var(--color-accent)] text-black font-semibold disabled:opacity-50"
        >
          {props.loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

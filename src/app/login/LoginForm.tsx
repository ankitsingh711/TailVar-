"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import type { SessionUser } from "@/lib/types";

// Fictional demo accounts from the assignment brief, offered as one-click fill-ins for reviewers.
const DEMO = [
  { username: "admin", password: "Admin@Demo26", name: "Administrator", role: "Issues policies, decides claims", initials: "AD" },
  { username: "customer1", password: "Customer1@Demo26", name: "Customer One", role: "Customer", initials: "C1" },
  { username: "customer2", password: "Customer2@Demo26", name: "Customer Two", role: "Customer", initials: "C2" },
];

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: SessionUser }>("/api/auth/login", { body: { username, password } });
      router.replace(user.role === "admin" ? "/admin" : "/customer");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function fill(d: (typeof DEMO)[number]) {
    setUsername(d.username);
    setPassword(d.password);
    setError(null);
    submitRef.current?.focus();
  }

  return (
    <>
      <form onSubmit={onSubmit} className="form-stack" noValidate>
        <div className="field">
          <label className="field-label" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <div className="input-wrap">
            <input
              id="password"
              className="input"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm input-action"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        {error && (
          <div className="callout callout-error" role="alert">
            <CircleAlert size={16} />
            <span>{error}</span>
          </div>
        )}
        <button ref={submitRef} type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? <LoaderCircle size={18} className="spin" /> : null}
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="demo">
        <div className="demo-head">
          <span className="eyebrow">Demo accounts</span>
        </div>
        <div className="demo-list">
          {DEMO.map((d) => (
            <button key={d.username} type="button" className="demo-item" onClick={() => fill(d)}>
              <span className="avatar" aria-hidden="true">
                {d.initials}
              </span>
              <span className="who-text">
                <strong>{d.name}</strong>
                <span>
                  <span className="mono">{d.username}</span> · {d.role}
                </span>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

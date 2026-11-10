import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

type LoginProps = {
  onLogin: (email: string) => void;
  onError: (message: string) => void;
};

function Login({ onLogin, onError }: LoginProps) {
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError("");
    const form = new FormData(event.currentTarget);
    try {
      const user = await api<{ email: string; payassureError?: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      onLogin(user.email);
      if (user.payassureError) onError(`PayAssure sign-in failed: ${user.payassureError}`);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand login-brand"><span className="brand-mark">Z</span><span>Zion Chemist <strong>POS</strong></span></div>
        <p className="eyebrow">PRIVATE SHOP ACCESS</p>
        <h1>Welcome back</h1>
        <p className="subtitle">Sign in with your provisioned account.</p>
        <label>Email<input name="email" required type="email" autoComplete="username" /></label>
        <label className="login-password-label">
          Password
          <span className="login-password-field">
            <input
              name="password"
              required
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
            />
            <button
              className="login-password-toggle"
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                  <path d="M9.9 5.2A10.8 10.8 0 0112 5c5.5 0 9 7 9 7a15.7 15.7 0 01-3 3.8M6.2 6.2C3.9 7.7 2 12 2 12s3.5 7 10 7a10.7 10.7 0 004.1-.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </span>
        </label>
        <button className="button button-primary login-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="helper-text login-note">Accounts are created privately by your administrator.</p>
      </form>
    </main>
  );
}

export default Login;

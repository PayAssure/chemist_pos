import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

type LoginProps = {
  onLogin: (email: string) => void;
  onError: (message: string) => void;
};

function Login({ onLogin, onError }: LoginProps) {
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError("");
    const form = new FormData(event.currentTarget);
    try {
      const user = await api<{ email: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      onLogin(user.email);
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
        <label>Password<input name="password" required type="password" autoComplete="current-password" /></label>
        <button className="button button-primary login-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="helper-text login-note">Accounts are created privately by your administrator.</p>
      </form>
    </main>
  );
}

export default Login;

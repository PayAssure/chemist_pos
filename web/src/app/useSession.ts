import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function useSession() {
  const [email, setEmail] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    api<{ email: string }>("/api/auth/me")
      .then((user) => setEmail(user.email))
      .catch(() => setEmail(null))
      .finally(() => setCheckingSession(false));
  }, []);
  return { email, setEmail, checkingSession };
}

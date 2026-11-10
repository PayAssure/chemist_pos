import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { RetailerFloatBalance, RetailerFloatData } from "../types";

export function useRetailerFloat(email: string | null) {
  const [retailerFloat, setRetailerFloat] = useState<RetailerFloatData | null>(null);
  const [balance, setBalance] = useState<RetailerFloatBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<RetailerFloatData>("/api/payassure/float", { cache: "no-store" });
      setRetailerFloat(data);
      setCheckedAt(new Date().toISOString());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load PayAssure float");
    } finally {
      setLoading(false);
    }
  }, []);

  const checkBalance = useCallback(async () => {
    setChecking(true);
    setError("");
    try {
      const next = await api<RetailerFloatBalance>("/api/payassure/float/balance", {
        method: "POST", cache: "no-store",
      });
      setBalance(next);
      setCheckedAt(next.asOf);
      setRetailerFloat((current) => current ? { ...current, ...next } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not check PayAssure float balance");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!email) {
      setRetailerFloat(null);
      setBalance(null);
      setError("");
      return;
    }
    void refresh();
  }, [email, refresh]);

  return { retailerFloat, balance, loading, checking, error, checkedAt, refresh, checkBalance };
}

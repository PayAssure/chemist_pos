import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type {
  RetailerFloatBalance,
  RetailerFloatBalanceUpdate,
  RetailerFloatData,
} from "../types";
import { openRetailerFloatBalanceStream } from "./floatBalanceApi";

export function useRetailerFloat(email: string | null) {
  const balanceAsOf = useRef(0);
  const [retailerFloat, setRetailerFloat] = useState<RetailerFloatData | null>(null);
  const [balance, setBalance] = useState<RetailerFloatBalance | null>(null);
  const [liveBalance, setLiveBalance] = useState<RetailerFloatBalanceUpdate | null>(null);
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
      const updatedAt = Date.parse(data.updatedAt);
      if (Number.isFinite(updatedAt)) {
        balanceAsOf.current = Math.max(balanceAsOf.current, updatedAt);
      }
      setLiveBalance((current) => (
        current && Date.parse(current.asOf) > (Number.isFinite(updatedAt) ? updatedAt : 0)
          ? current
          : null
      ));
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
      const checkedAtTime = Date.parse(next.asOf);
      const hasNewerBalance = Number.isFinite(checkedAtTime) &&
        balanceAsOf.current > checkedAtTime;
      if (Number.isFinite(checkedAtTime)) {
        balanceAsOf.current = Math.max(balanceAsOf.current, checkedAtTime);
      }
      if (!hasNewerBalance) setCheckedAt(next.asOf);
      setRetailerFloat((current) => current ? { ...current, ...next } : current);
      setLiveBalance((current) => (
        current && Date.parse(current.asOf) > Date.parse(next.asOf) ? current : null
      ));
      return next;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not check PayAssure float balance");
      return null;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!email) {
      setRetailerFloat(null);
      setBalance(null);
      setLiveBalance(null);
      balanceAsOf.current = 0;
      setError("");
      return;
    }
    let active = true;
    let stream: ReturnType<typeof openRetailerFloatBalanceStream> | null = null;
    balanceAsOf.current = 0;
    setLiveBalance(null);
    void refresh().finally(() => {
      if (!active) return;
      stream = openRetailerFloatBalanceStream(
        (update) => {
          const updateAsOf = Date.parse(update.asOf);
          if (updateAsOf <= balanceAsOf.current) return;
          balanceAsOf.current = updateAsOf;
          setLiveBalance((current) => (
            current && Date.parse(current.asOf) > Date.parse(update.asOf) ? current : update
          ));
          setCheckedAt(update.asOf);
          setRetailerFloat((current) => current
            ? {
                ...current,
                availableBalance: update.availableBalance,
                currency: update.currency,
                updatedAt: update.asOf,
              }
            : current);
          setBalance((current) => current
            ? {
                ...current,
                availableBalance: update.availableBalance,
                currency: update.currency,
                asOf: update.asOf,
              }
            : current);
        },
        (reason) => {
          console.error("[PayAssure] Could not read live retailer float balance", reason);
        },
      );
    });
    return () => {
      active = false;
      stream?.close();
    };
  }, [email, refresh]);

  return {
    retailerFloat,
    balance,
    liveBalance,
    loading,
    checking,
    error,
    checkedAt,
    refresh,
    checkBalance,
  };
}

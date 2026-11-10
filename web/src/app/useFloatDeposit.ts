import { useCallback, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { RetailerFloatDeposit } from "../types";

export function useFloatDeposit(
  refreshFloat: () => Promise<void>,
  setError: (message: string) => void,
  setNotice: (message: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setLocalError] = useState("");
  const [loading, setLoading] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0 || !phone.trim()) {
      setLocalError("Enter a positive whole-KES amount and payer phone number.");
      return;
    }
    setLocalError("");
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const deposit = await api<RetailerFloatDeposit>("/api/payassure/float/deposits", {
        method: "POST",
        body: JSON.stringify({ amount: value, payerPhoneNumber: phone.trim() }),
      });
      setNotice(`Float deposit request ${deposit.status.toLowerCase()}. The balance changes only after PayAssure confirms the deposit.`);
      await refreshFloat();
      setAmount("");
      setPhone("");
      setOpen(false);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not submit float deposit";
      setError(message);
      setLocalError(message);
    } finally {
      setLoading(false);
    }
  }, [amount, phone, refreshFloat, setError, setNotice]);
  return {
    open, setOpen, amount, setAmount, phone, setPhone,
    error, setError: setLocalError, loading, close, submit,
  };
}

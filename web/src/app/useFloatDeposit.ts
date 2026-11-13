import { useCallback, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { currencyAmount } from "../lib/money";
import type { RetailerFloatBalance, RetailerFloatDeposit } from "../types";
import { openFloatDepositStatusStream } from "./floatDepositApi";

export function useFloatDeposit(
  checkFloatBalance: () => Promise<RetailerFloatBalance | null>,
  setError: (message: string) => void,
  setNotice: (message: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setLocalError] = useState("");
  const [loading, setLoading] = useState(false);
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);
  const [pendingDeposit, setPendingDeposit] = useState<{ depositId: string; amount: number } | null>(null);
  const close = useCallback(() => {
    if (!loading && !awaitingWebhook && !pendingDeposit) setOpen(false);
  }, [awaitingWebhook, loading, pendingDeposit]);
  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError("");
    setError("");
    let activeDeposit = pendingDeposit;
    try {
      if (!activeDeposit) {
        const value = Number(amount);
        if (!Number.isSafeInteger(value) || value <= 0 || !phone.trim()) {
          setLocalError("Enter a positive whole-KES amount and payer phone number.");
          return;
        }
        setLoading(true);
        setNotice("");
        const deposit = await api<RetailerFloatDeposit>("/api/payassure/float/deposits", {
          method: "POST",
          body: JSON.stringify({ amount: value, payerPhoneNumber: phone.trim() }),
        });
        activeDeposit = { depositId: deposit.depositId, amount: deposit.amount };
        setPendingDeposit(activeDeposit);
        setLoading(false);
        setAmount("");
        setPhone("");
      }

      setAwaitingWebhook(true);
      const statusStream = openFloatDepositStatusStream(activeDeposit.depositId);
      try {
        await statusStream.ready;
        const confirmation = await statusStream.waitForConfirmation();
        if (confirmation.amount !== activeDeposit.amount || confirmation.currency !== "KES") {
          throw new Error("PayAssure confirmed a float deposit with an unexpected amount or currency.");
        }
        const balance = await checkFloatBalance();
        setPendingDeposit(null);
        setOpen(false);
        if (!balance) {
          setError("PayAssure confirmed the deposit, but the new balance could not be loaded. Use Check balance to refresh it.");
          return;
        }
        setNotice(
          `Float deposit of ${currencyAmount(confirmation.amount, confirmation.currency)} confirmed` +
          `${confirmation.receiptNumber ? ` (receipt ${confirmation.receiptNumber})` : ""}. ` +
          `New available balance: ${currencyAmount(balance.availableBalance, balance.currency)}.`,
        );
      } finally {
        statusStream.close();
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not submit float deposit";
      setError(message);
      setLocalError(message);
    } finally {
      setLoading(false);
      setAwaitingWebhook(false);
    }
  }, [amount, checkFloatBalance, pendingDeposit, phone, setError, setNotice]);
  return {
    open, setOpen, amount, setAmount, phone, setPhone,
    error, setError: setLocalError, loading, awaitingWebhook, pendingDeposit,
    close, submit,
  };
}

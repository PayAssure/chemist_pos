import { useCallback, useEffect, useState } from "react";

export function useNotifications() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!error && !notice) return;
    const timer = window.setTimeout(() => {
      setError("");
      setNotice("");
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [error, notice]);
  const dismiss = useCallback(() => {
    setError("");
    setNotice("");
  }, []);
  return { error, setError, notice, setNotice, dismiss };
}

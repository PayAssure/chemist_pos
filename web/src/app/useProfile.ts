import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type {
  PayassureParticipant, PayassureParticipantUpdate, RetailerProfileData,
} from "../types";
import { emptyRetailerProfile, mapPayassureParticipant } from "./profile";

export function useProfile(
  email: string | null,
  setError: (message: string) => void,
  setNotice: (message: string) => void,
) {
  const [profile, setProfile] = useState(() => emptyRetailerProfile(email ?? ""));
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!email) return;
    setProfile((current) => ({ ...current, email }));
    let active = true;
    setLoading(true);
    api<PayassureParticipant | PayassureParticipant[]>("/api/payassure/me")
      .then((response) => {
        const participant = Array.isArray(response) ? response[0] : response;
        if (!participant) throw new Error("PayAssure returned no participant data");
        if (active) setProfile(mapPayassureParticipant(participant, email));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load PayAssure data");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [email, setError]);

  const save = useCallback(async (update: PayassureParticipantUpdate): Promise<RetailerProfileData> => {
    setError("");
    setNotice("");
    try {
      const response = await api<PayassureParticipant | PayassureParticipant[]>(
        "/api/payassure/me", { method: "PATCH", body: JSON.stringify(update) },
      );
      const participant = Array.isArray(response) ? response[0] : response;
      if (!participant) throw new Error("PayAssure returned no updated participant data");
      const next = mapPayassureParticipant(participant, email ?? "");
      setProfile(next);
      setNotice("PayAssure participant updated.");
      return next;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update PayAssure participant");
      throw reason;
    }
  }, [email, setError, setNotice]);

  return { profile, setProfile, loading, save };
}

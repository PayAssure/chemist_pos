import { useState, type FormEvent } from "react";
import type {
  PayassureParticipantUpdate, RetailerPaymentData, RetailerProfileData,
} from "../types";
import { emptyPayment, profileFields, type CardSection, type ProfileField } from "./payassureUtils";

export function usePayassureEditor(
  profile: RetailerProfileData,
  onSave: (update: PayassureParticipantUpdate) => Promise<RetailerProfileData>,
) {
  const [editing, setEditing] = useState<CardSection | null>(null);
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);

  function beginEdit(section: CardSection) {
    setDraft(profile);
    if (section === "payment" && !profile.payment) {
      setDraft({ ...profile, payment: emptyPayment() });
    }
    setEditing(section);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    let update: PayassureParticipantUpdate;
    if (editing === "payment") {
      const payment = draft.payment ?? emptyPayment();
      update = {
        settlementMethod: payment.type,
        settlementAccount: payment.type === "BANK" ? payment.accountNumber : payment.phoneNumber,
        payment: {
          type: payment.type, accountName: payment.accountName,
          ...(payment.type === "BANK"
            ? { bankCode: payment.bankCode, accountNumber: payment.accountNumber, shortcode: payment.shortcode }
            : { phoneNumber: payment.phoneNumber }),
          provider: payment.provider,
        },
      };
    } else {
      update = Object.fromEntries(profileFields
        .filter(({ key }) => draft[key] !== profile[key])
        .map(({ key }) => [key, draft[key]])) as PayassureParticipantUpdate;
    }
    if (Object.keys(update).length === 0) {
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      const updatedProfile = await onSave(update);
      setDraft(updatedProfile);
      setEditing(null);
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setDraft(profile);
    setEditing(null);
  }

  function updateProfileField(key: ProfileField, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updatePaymentField(key: keyof RetailerPaymentData, value: string | boolean) {
    setDraft((current) => {
      const payment = current.payment ?? emptyPayment();
      return { ...current, payment: { ...payment, [key]: value } };
    });
  }

  function setPaymentType(type: RetailerPaymentData["type"]) {
    setDraft((current) => ({ ...current, payment: { ...emptyPayment(), type } }));
  }

  return {
    editing, draft, saving, beginEdit, saveEdit, cancelEdit,
    updateProfileField, updatePaymentField, setPaymentType,
  };
}

export type PayassureEditor = ReturnType<typeof usePayassureEditor>;

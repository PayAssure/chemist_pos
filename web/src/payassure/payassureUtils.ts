import type { RetailerPaymentData } from "../types";

export type ProfileField = "businessName" | "businessType" | "contactName" | "email";
export type CardSection = "profile" | "payment";
export type FieldDefinition = { key: ProfileField; label: string };

export const profileFields: FieldDefinition[] = [
  { key: "businessName", label: "Business name" },
  { key: "businessType", label: "Business type" },
  { key: "contactName", label: "Contact name" },
  { key: "email", label: "Email" },
];

export const emptyPayment = (): RetailerPaymentData => ({
  type: "MPESA", accountName: "", phoneNumber: "", bankCode: "",
  accountNumber: "", shortcode: "", provider: "", status: "", isVerified: false,
});

export function display(value: string | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

export function displayDateTime(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return display(value);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

import type { PayassureParticipant, RetailerProfileData } from "../types";

export function emptyRetailerProfile(email: string): RetailerProfileData {
  return {
    id: "",
    participantType: "RETAILER",
    businessName: "",
    businessType: "",
    contactName: "",
    email,
    status: "DRAFT",
    createdAt: "",
    updatedAt: "",
    integration: null,
    payment: null,
  };
}

export function mapPayassureParticipant(
  participant: PayassureParticipant,
  fallbackEmail: string,
): RetailerProfileData {
  return {
    ...emptyRetailerProfile(fallbackEmail),
    id: participant.id ?? "",
    participantType: participant.participantType === "SUPPLIER" ? "SUPPLIER" : "RETAILER",
    businessName: participant.businessName ?? "",
    businessType: participant.businessType ?? "",
    contactName: participant.contactName ?? "",
    email: participant.email ?? fallbackEmail,
    status: participant.status ?? "DRAFT",
    createdAt: participant.createdAt ?? "",
    updatedAt: participant.updatedAt ?? "",
    integration: participant.integration ? {
      apiKey: participant.integration.apiKey ?? "",
      apiSecret: participant.integration.apiSecret ?? "",
      merchantId: participant.integration.merchantId ?? "",
      environment: participant.integration.environment ?? "",
      isActive: participant.integration.isActive ?? false,
      createdAt: participant.integration.createdAt ?? "",
    } : null,
    payment: participant.payment ? {
      type: participant.payment.type === "BANK" ? "BANK" : "MPESA",
      accountName: participant.payment.accountName ?? "",
      phoneNumber: participant.payment.phoneNumber ?? "",
      bankCode: participant.payment.bankCode ?? "",
      accountNumber: participant.payment.accountNumber ?? "",
      shortcode: participant.payment.shortcode ?? "",
      provider: participant.payment.provider ?? "",
      status: participant.payment.status ?? "",
      isVerified: participant.payment.isVerified ?? false,
    } : null,
  };
}

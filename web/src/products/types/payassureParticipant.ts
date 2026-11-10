export type PayassureParticipant = {
  id?: string;
  participantType?: string;
  businessName?: string;
  businessType?: string;
  contactName?: string;
  email?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  integration?: {
    apiKey?: string | null;
    apiSecret?: string | null;
    merchantId?: string | null;
    environment?: string | null;
    isActive?: boolean | null;
    createdAt?: string | null;
  } | null;
  payment?: {
    type?: string | null;
    accountName?: string | null;
    phoneNumber?: string | null;
    bankCode?: string | null;
    accountNumber?: string | null;
    shortcode?: string | null;
    provider?: string | null;
    status?: string | null;
    isVerified?: boolean | null;
  } | null;
};

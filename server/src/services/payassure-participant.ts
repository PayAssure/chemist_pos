export function safePayassureParticipant(value: unknown): unknown {
  function sanitize(participantValue: unknown): unknown {
    if (!participantValue || typeof participantValue !== "object" || Array.isArray(participantValue)) {
      return participantValue;
    }
    const participant = participantValue as Record<string, unknown>;
    const integrationValue = participant.integration;
    const integration =
      integrationValue && typeof integrationValue === "object"
        ? integrationValue as Record<string, unknown>
        : null;
    const paymentValue = participant.payment;
    const payment =
      paymentValue && typeof paymentValue === "object"
        ? paymentValue as Record<string, unknown>
        : null;
    return {
      id: participant.id,
      participantType: participant.participantType,
      businessName: participant.businessName,
      businessType: participant.businessType,
      contactName: participant.contactName,
      email: participant.email,
      status: participant.status,
      createdAt: participant.createdAt,
      updatedAt: participant.updatedAt,
      integration: integration
        ? {
            apiKey: integration.apiKey,
            apiSecret: integration.apiSecret,
            merchantId: integration.merchantId,
            environment: integration.environment,
            isActive: integration.isActive,
            createdAt: integration.createdAt,
          }
        : null,
      payment: payment
        ? {
            type: payment.type,
            accountName: payment.accountName,
            status: payment.status,
            isVerified: payment.isVerified,
            provider: payment.provider,
            bankCode: payment.bankCode,
            accountNumber: payment.accountNumber,
            shortcode: payment.shortcode,
            phoneNumber: payment.phoneNumber,
          }
        : null,
    };
  }
  return Array.isArray(value) ? value.map(sanitize) : sanitize(value);
}

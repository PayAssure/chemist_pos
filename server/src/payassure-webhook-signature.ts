import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyPayassureWebhookSignature(
  rawBody: Buffer,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!timestampHeader || !/^\d+$/.test(timestampHeader) || !signatureHeader) return false;
  const signatureParts = new Map<string, string>();
  for (const part of signatureHeader.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    signatureParts.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  const timestamp = signatureParts.get("t");
  const suppliedHex = signatureParts.get("v1");
  if (timestamp !== timestampHeader || !suppliedHex || !/^[a-f0-9]{64}$/i.test(suppliedHex)) {
    return false;
  }

  const receivedAt = Number(timestampHeader);
  if (!Number.isSafeInteger(receivedAt) || Math.abs(nowSeconds - receivedAt) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestampHeader}.${rawBody.toString("utf8")}`)
    .digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

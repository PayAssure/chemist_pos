

export function getPayassureWebhookUrl(): string | null {
  const configuredUrl = process.env.PAYASSURE_WEBHOOK_URL?.trim();
  if (!configuredUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new Error("PAYASSURE_WEBHOOK_URL must be an absolute HTTP or HTTPS URL ending in /webhook");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/webhook"
  ) {
    throw new Error("PAYASSURE_WEBHOOK_URL must be an absolute HTTP or HTTPS URL ending in /webhook");
  }
  return parsed.toString().replace(/\/$/, "");
}

let registeredPayassureWebhookUrl: string | null = null;

export function setRegisteredPayassureWebhookUrl(url: string | null): void {
  registeredPayassureWebhookUrl = url;
}

export function getRegisteredPayassureWebhookUrl(): string | null {
  return registeredPayassureWebhookUrl;
}

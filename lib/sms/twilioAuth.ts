/**
 * Server-side Twilio REST credentials.
 *
 * Outbound Twilio REST calls use an API Key SID + API Key Secret.
 * The master Account SID identifies the Verexa-owned Twilio account.
 *
 * Keep this module server-only: never import it from client components.
 */
export type TwilioApiCredentials = {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
};

export function getTwilioApiCredentials(): TwilioApiCredentials | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;

  if (!accountSid || !apiKeySid || !apiKeySecret) {
    return null;
  }

  return { accountSid, apiKeySid, apiKeySecret };
}

export function getTwilioApiAuthHeader(): string | null {
  const credentials = getTwilioApiCredentials();
  if (!credentials) return null;

  return `Basic ${Buffer.from(
    `${credentials.apiKeySid}:${credentials.apiKeySecret}`
  ).toString("base64")}`;
}

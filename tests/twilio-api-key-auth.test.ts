import { afterEach, describe, expect, it } from "vitest";
import {
  getTwilioApiAuthHeader,
  getTwilioApiCredentials,
} from "../lib/sms/twilioAuth";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Twilio API key authentication", () => {
  it("requires the master Account SID, API Key SID, and API Key Secret", () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_TEST";
    process.env.TWILIO_API_KEY_SID = "SK_TEST";
    delete process.env.TWILIO_API_KEY_SECRET;

    expect(getTwilioApiCredentials()).toBeNull();
    expect(getTwilioApiAuthHeader()).toBeNull();
  });

  it("returns the server-side credentials when all three are configured", () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_TEST";
    process.env.TWILIO_API_KEY_SID = "SK_TEST";
    process.env.TWILIO_API_KEY_SECRET = "SECRET_TEST";

    expect(getTwilioApiCredentials()).toEqual({
      accountSid: "AC_TEST",
      apiKeySid: "SK_TEST",
      apiKeySecret: "SECRET_TEST",
    });
  });

  it("builds Basic auth from API Key SID + API Key Secret, not Account SID", () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_TEST";
    process.env.TWILIO_API_KEY_SID = "SK_TEST";
    process.env.TWILIO_API_KEY_SECRET = "SECRET_TEST";

    const header = getTwilioApiAuthHeader();
    expect(header).toBe(
      `Basic ${Buffer.from("SK_TEST:SECRET_TEST").toString("base64")}`
    );
    expect(header).not.toContain(Buffer.from("AC_TEST:").toString("base64"));
  });
});

import { google, type gmail_v1 } from "googleapis";

import { getGoogleAuthClient } from "@/lib/google/auth";

export { GoogleAuthRequiredError } from "@/lib/google/auth";

export async function getGmailClient(): Promise<gmail_v1.Gmail> {
  const auth = await getGoogleAuthClient();
  return google.gmail({ version: "v1", auth });
}

import { randomBytes } from "node:crypto";
import type { NewCredential } from "./types";

export function expiryDate(daysFromToday: number): string {
  return new Date(Date.now() + daysFromToday * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function generatedPassword(): string {
  return randomBytes(18).toString("base64url");
}

export function printNewCredentials(credentials: NewCredential[]): void {
  if (!credentials.length) return;
  console.log("\nOne-time sample user credentials:");
  for (const credential of credentials) {
    console.log(`${credential.email}  ${credential.password}`);
  }
  console.log("Save these credentials now; passwords are not stored in recoverable form.");
}

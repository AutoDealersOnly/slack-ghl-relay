import { z } from "zod";
import { hasActiveCallLookupTestAccess, hasActiveCallWebhookValidationToken } from "./active-call-lookup-test-access";
import { decryptOfficeAtHandSecret, encryptOfficeAtHandSecret } from "./office-at-hand-crypto";
import {
  loadPinLookupContactForDealershipRecord,
  pinLookupContactFormInput,
  savePinLookupContactForDealershipRecord,
  searchPinCodeForDealershipRecord,
  searchPinLookupByPhoneForDealershipRecord,
} from "./pin-code-lookup";
import {
  getCurrentOfficeAtHandTestSubscription,
  hasCurrentOfficeAtHandTestSubscription,
  listCurrentOfficeAtHandActiveCalls,
  removeOfficeAtHandActiveCall,
  upsertOfficeAtHandActiveCall,
} from "./db";

const ACTIVE_STATUSES = new Set(["Setup", "Proceeding", "Answered"]);
const TERMINAL_STATUSES = new Set(["Disconnected", "Gone", "Voicemail", "FaxReceive"]);
const ACTIVE_CALL_TTL_MS = 15 * 60 * 1000;

const partySchema = z.object({
  id: z.string().trim().min(1).max(512),
  direction: z.string().trim(),
  from: z.object({ phoneNumber: z.string().trim().min(1).max(64) }).optional(),
  to: z.object({ phoneNumber: z.string().trim().min(1).max(64) }).optional(),
  status: z.object({ code: z.string().trim().min(1).max(32) }).optional(),
});
const notificationSchema = z.object({
  subscriptionId: z.string().trim().min(1).max(128),
  body: z.object({
    telephonySessionId: z.string().trim().min(1).max(512),
    sequence: z.number().int().nonnegative(),
    parties: z.array(partySchema).max(32),
  }),
});

export type ActiveCallTestEntry = {
  id: string;
  callerPhone: string;
  dialedPhone: string;
  status: "Ringing" | "Active";
  receivedAt: Date;
};

const activeCallIdInput = z.string().trim().regex(/^\d{1,20}$/, "Invalid active-call reference.");
const contactIdInput = z.string().trim().regex(/^[A-Za-z0-9_-]{6,255}$/, "Invalid contact reference.");

function userFacingStatus(status: string): "Ringing" | "Active" {
  return status === "Answered" ? "Active" : "Ringing";
}

export async function receiveOfficeAtHandActiveCallNotification(input: {
  validationToken: unknown;
  payload: unknown;
}): Promise<{ accepted: boolean; processed: number }> {
  if (!hasActiveCallWebhookValidationToken(input.validationToken)) return { accepted: false, processed: 0 };
  const parsed = notificationSchema.safeParse(input.payload);
  if (!parsed.success) return { accepted: true, processed: 0 };
  if (!(await hasCurrentOfficeAtHandTestSubscription(parsed.data.subscriptionId))) return { accepted: false, processed: 0 };

  let processed = 0;
  for (const party of parsed.data.body.parties) {
    if (party.direction !== "Inbound" || !party.from?.phoneNumber || !party.to?.phoneNumber || !party.status?.code) continue;
    const status = party.status.code;
    if (TERMINAL_STATUSES.has(status)) {
      await removeOfficeAtHandActiveCall(parsed.data.body.telephonySessionId, party.id);
      processed += 1;
      continue;
    }
    if (!ACTIVE_STATUSES.has(status)) continue;
    await upsertOfficeAtHandActiveCall({
      sessionId: parsed.data.body.telephonySessionId,
      partyId: party.id,
      sequence: parsed.data.body.sequence,
      status,
      callerPhoneCiphertext: encryptOfficeAtHandSecret(party.from.phoneNumber),
      dialedPhoneCiphertext: encryptOfficeAtHandSecret(party.to.phoneNumber),
      expiresAt: new Date(Date.now() + ACTIVE_CALL_TTL_MS),
    });
    processed += 1;
  }
  return { accepted: true, processed };
}

export async function getActiveCallLookupTestEntries(access: string): Promise<ActiveCallTestEntry[]> {
  if (!hasActiveCallLookupTestAccess(access)) throw new Error("This separate Active Call Lookup test link is not authorized.");
  const records = await listCurrentOfficeAtHandActiveCalls();
  return records
    .filter(record => ACTIVE_STATUSES.has(record.status))
    .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime())
    .map(record => ({
      id: String(record.id),
      callerPhone: decryptOfficeAtHandSecret(record.callerPhoneCiphertext),
      dialedPhone: decryptOfficeAtHandSecret(record.dialedPhoneCiphertext),
      status: userFacingStatus(record.status),
      receivedAt: record.receivedAt,
    }));
}

export const activeCallLookupTestInput = z.object({ access: z.string().trim().min(1).max(512) });
export const activeCallLookupTestSelectionInput = activeCallLookupTestInput.extend({ callId: activeCallIdInput });
export const activeCallLookupTestPinInput = activeCallLookupTestSelectionInput.extend({ pin: z.string().trim().min(1).max(128) });
export const activeCallLookupTestContactInput = activeCallLookupTestSelectionInput.extend({ contactId: contactIdInput });
export const activeCallLookupTestSaveInput = activeCallLookupTestContactInput.extend({ form: pinLookupContactFormInput });

async function requireSelectedCurrentTestCall(access: string, callId: string) {
  if (!hasActiveCallLookupTestAccess(access)) throw new Error("This separate Active Call Lookup test link is not authorized.");
  const subscription = await getCurrentOfficeAtHandTestSubscription();
  if (!subscription) throw new Error("The separate ABC test feed is no longer active.");
  const records = await listCurrentOfficeAtHandActiveCalls();
  const record = records.find(item => String(item.id) === callId && ACTIVE_STATUSES.has(item.status));
  if (!record) throw new Error("That incoming test call is no longer active.");
  return {
    dealershipRecordId: subscription.dealerRecordId,
    callerPhone: decryptOfficeAtHandSecret(record.callerPhoneCiphertext),
  };
}

/** Searches only the caller number from an operator-selected current test call. */
export async function searchSelectedActiveCallByPhone(access: string, callId: string) {
  const selection = await requireSelectedCurrentTestCall(access, callId);
  return searchPinLookupByPhoneForDealershipRecord(selection.dealershipRecordId, selection.callerPhone);
}

/** Looks up a caller-provided PIN only after the operator selects a current test call. */
export async function searchSelectedActiveCallByPin(access: string, callId: string, pin: string) {
  const selection = await requireSelectedCurrentTestCall(access, callId);
  return searchPinCodeForDealershipRecord(selection.dealershipRecordId, pin);
}

/** Loads an existing ABC contact only after the operator selects a current test call. */
export async function loadSelectedActiveCallContact(access: string, callId: string, contactId: string) {
  const selection = await requireSelectedCurrentTestCall(access, callId);
  return loadPinLookupContactForDealershipRecord(selection.dealershipRecordId, contactId);
}

/** Updates an existing ABC contact only after the operator selects a current test call. It never creates a contact. */
export async function saveSelectedActiveCallContact(
  access: string,
  callId: string,
  contactId: string,
  form: z.infer<typeof pinLookupContactFormInput>
) {
  const selection = await requireSelectedCurrentTestCall(access, callId);
  return savePinLookupContactForDealershipRecord(selection.dealershipRecordId, contactId, form);
}

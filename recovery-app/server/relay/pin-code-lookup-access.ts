import { timingSafeEqual } from "node:crypto";
import { Router } from "express";

const accessToken = (): string => process.env.PIN_CODE_LOOKUP_ACCESS_TOKEN?.trim() ?? "";

/**
 * Checks the private menu-link value without returning it or logging it.
 * This is intentionally separate from the QR Builder access value so an
 * exposed menu link cannot grant access to another internal tool.
 */
export function hasPinCodeLookupAccess(candidate: unknown): boolean {
  const expected = accessToken();
  const supplied = typeof candidate === "string" ? candidate.trim() : "";
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export const pinCodeLookupAccessRouter = Router();

/** A minimal no-login check for the private GHL custom-menu link. */
pinCodeLookupAccessRouter.get("/access-check", (req, res) => {
  if (!hasPinCodeLookupAccess(req.query.access)) {
    res.status(403).json({ ok: false });
    return;
  }
  res.json({ ok: true });
});

import { timingSafeEqual } from "node:crypto";
import { Router } from "express";

const accessToken = (): string => process.env.QR_PASS_BUILDER_ACCESS_TOKEN?.trim() ?? "";

export function hasQrPassBuilderAccess(candidate: unknown): boolean {
  const expected = accessToken();
  const supplied = typeof candidate === "string" ? candidate.trim() : "";
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export const qrPassAccessRouter = Router();

/**
 * A minimal no-login check used by the GHL custom-menu page before the
 * builder returns any selected dealership's copy-ready code.
 */
qrPassAccessRouter.get("/access-check", (req, res) => {
  if (!hasQrPassBuilderAccess(req.query.access)) {
    res.status(403).json({ ok: false });
    return;
  }
  res.json({ ok: true });
});

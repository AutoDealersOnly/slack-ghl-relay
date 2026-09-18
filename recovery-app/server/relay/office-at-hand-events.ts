import { Router } from "express";
import { receiveOfficeAtHandActiveCallNotification } from "./office-at-hand-active-calls";

export const officeAtHandEventsRouter = Router();

/**
 * Separate provider-only endpoint. It echoes initial validation challenges and
 * rejects all event payloads that do not carry the stored provider token.
 */
officeAtHandEventsRouter.post("/events", async (req, res) => {
  const validationToken = req.header("Validation-Token");
  const payload = req.body && typeof req.body === "object" ? req.body : null;
  if (!payload || Object.keys(payload).length === 0) {
    if (validationToken) res.setHeader("Validation-Token", validationToken);
    res.status(200).type("application/json").send();
    return;
  }
  try {
    const result = await receiveOfficeAtHandActiveCallNotification({ validationToken, payload });
    if (!result.accepted) {
      res.status(401).type("text/plain").send("Unauthorized");
      return;
    }
    res.status(200).type("text/plain").send("OK");
  } catch {
    // Return a bounded failure without provider details or event data.
    res.status(503).type("text/plain").send("Unavailable");
  }
});

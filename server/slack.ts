import crypto from "crypto";
import { Router, Request, Response } from "express";

const MAKE_WEBHOOK_URL =
  "https://hook.us1.make.com/uqhynmlgfl2c1f6n616xwhqtqkay6a45";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? "";

/**
 * Verify that the incoming request was signed by Slack.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
function verifySlackSignature(req: Request): boolean {
  if (!SLACK_SIGNING_SECRET) {
    console.warn("[slack] SLACK_SIGNING_SECRET is not set — skipping verification");
    return false;
  }

  const timestamp = req.headers["x-slack-request-timestamp"] as string | undefined;
  const slackSignature = req.headers["x-slack-signature"] as string | undefined;

  if (!timestamp || !slackSignature) return false;

  // Reject requests older than 5 minutes to prevent replay attacks
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 5 * 60;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) return false;

  const rawBody: Buffer = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from("");
  const sigBaseString = `v0:${timestamp}:${rawBody.toString("utf8")}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", SLACK_SIGNING_SECRET)
      .update(sigBaseString)
      .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(mySignature, "utf8"),
      Buffer.from(slackSignature, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Forward the event payload to the Make webhook.
 */
async function forwardToMake(payload: unknown): Promise<void> {
  const response = await fetch(MAKE_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`[slack] Make webhook responded ${response.status}: ${text}`);
  } else {
    console.log("[slack] Event forwarded to Make successfully");
  }
}

export const slackRouter = Router();

slackRouter.post("/events", (req: Request, res: Response) => {
  // Signature verification
  if (!verifySlackSignature(req)) {
    res.status(401).send("Unauthorized");
    return;
  }

  const body = req.body as Record<string, unknown>;

  // Slack URL verification handshake
  if (body.type === "url_verification") {
    res.setHeader("Content-Type", "text/plain");
    res.send(body.challenge as string);
    return;
  }

  // Acknowledge receipt immediately (Slack requires a 200 within 3 s)
  res.sendStatus(200);

  // Only forward member_joined_channel bot events
  const event = body.event as Record<string, unknown> | undefined;
  if (body.type === "event_callback" && event?.type === "member_joined_channel") {
    forwardToMake(body).catch((err) =>
      console.error("[slack] Failed to forward event to Make:", err)
    );
  } else {
    console.log(`[slack] Ignoring event type: ${event?.type ?? body.type}`);
  }
});

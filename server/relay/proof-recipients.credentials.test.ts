import { describe, expect, it } from "vitest";

const slackGet = async (path: string, token: string) => {
  const response = await fetch(`https://slack.com/api/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { ok?: boolean; error?: string };
};

describe("proof-stage recipient settings", () => {
  const runLiveRecipientCheck = process.env.RUN_LIVE_PROOF_RECIPIENT_CHECK === "true";

  (runLiveRecipientCheck ? it : it.skip)("can read the approved users and group without posting to Slack", async () => {
    const token = process.env.SLACK_BOT_TOKEN;
    const davidForRequest = process.env.SLACK_PROOF_REQUEST_USER_ID;
    const dealsGroup = process.env.SLACK_PROOFING_NEEDED_USERGROUP_ID;
    const davidForApproval = process.env.SLACK_PROOF_APPROVED_USER_ID;
    const brianForPrint = process.env.SLACK_PROOF_SENT_TO_PRINT_USER_ID;

    expect(token).toBeTruthy();
    expect(davidForRequest).toBeTruthy();
    expect(dealsGroup).toBeTruthy();
    expect(davidForApproval).toBeTruthy();
    expect(brianForPrint).toBeTruthy();

    const [requestUser, proofingGroup, approvalUser, printUser] = await Promise.all([
      slackGet(`users.info?user=${encodeURIComponent(davidForRequest!)}`, token!),
      slackGet(`usergroups.users.list?usergroup=${encodeURIComponent(dealsGroup!)}`, token!),
      slackGet(`users.info?user=${encodeURIComponent(davidForApproval!)}`, token!),
      slackGet(`users.info?user=${encodeURIComponent(brianForPrint!)}`, token!),
    ]);

    const failures = [requestUser, proofingGroup, approvalUser, printUser]
      .filter(result => !result.ok)
      .map(result => result.error ?? "unknown_error");
    // The existing app can post direct mentions without directory-read scopes.
    // If directory reads are unavailable, Slack returns missing_scope; any other
    // error means the protected recipient setting needs attention.
    expect(failures.every(error => error === "missing_scope")).toBe(true);
  }, 20_000);
});

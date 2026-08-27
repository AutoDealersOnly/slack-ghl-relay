import { describe, expect, it } from "vitest";
import { buildProofStageMessage } from "./workflows";

const config = {
  ghlApiKey: "",
  ghlLocationId: "",
  slackBotToken: "",
  slackSigningSecret: "",
  ghlWebhookSharedSecret: "",
  slackNotificationChannelId: "",
  slackDealsUserGroupId: "",
  slackAlwaysInviteeUserIds: [],
  slackProofRequestUserId: "U_REQUEST",
  slackProofingNeededUserGroupId: "S_DEALS",
  slackProofApprovedUserId: "U_APPROVED",
  slackProofSentToPrintUserId: "U_PRINT",
};

describe("proof-stage messages", () => {
  it("restores request-proof details and only uses a protected recipient setting", () => {
    const message = buildProofStageMessage(
      "Request Proof",
      { mailer: "Letter", mailer_2: "Postcard", event_start: "2026-09-01", event_end: "2026-09-07" },
      { dealership_name: "ABC Dealer" },
      config
    );

    expect(message).toContain("<@U_REQUEST>");
    expect(message).toContain("Letter / Postcard");
    expect(message).toContain("ABC Dealer");
  });

  it("restores the approved-upload and sent-to-print operational wording", () => {
    expect(buildProofStageMessage("Approved to Upload", { job_numbers: "12345" }, {}, config)).toContain("Job #*12345*");
    expect(buildProofStageMessage("Sent to Print", {}, {}, config)).toContain("Uploaded to MBI");
  });
});

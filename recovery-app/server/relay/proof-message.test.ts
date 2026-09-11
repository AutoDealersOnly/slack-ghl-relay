import { describe, expect, it } from "vitest";
import { getRelayConfig } from "./config";
import { buildProofStageMessage, isSentToPrintProofStage } from "./workflows";

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

  it("uses the saved protected BDC group reference while preserving the exact Proofing Needed wording", () => {
    const configured = getRelayConfig();
    const message = buildProofStageMessage("Proofing Needed", {}, {}, configured);
    expect(configured.slackProofingNeededUserGroupId).toBeTruthy();
    expect(message).toBe(
      `*📋 Proofing Needed*\n<!subteam^${configured.slackProofingNeededUserGroupId}> proofing needed on the mailpiece(s) above. Thanks!!!`
    );
  });

  it("runs BDC mailpiece processing only for sent-to-print stage variations", () => {
    expect(isSentToPrintProofStage("Sent to Print")).toBe(true);
    expect(isSentToPrintProofStage("sent_to_print")).toBe(true);
    expect(isSentToPrintProofStage("Approved to Upload")).toBe(false);
  });
});

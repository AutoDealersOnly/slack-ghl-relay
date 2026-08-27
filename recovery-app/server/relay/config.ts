export const RELAY_SETTING_KEYS = [
  "GHL_API_KEY",
  "GHL_LOCATION_ID",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "GHL_WEBHOOK_SHARED_SECRET",
  "SLACK_NOTIFICATION_CHANNEL_ID",
  "SLACK_DEALS_USERGROUP_ID",
  "SLACK_ALWAYS_INVITEE_USER_IDS",
  "SLACK_PROOF_REQUEST_USER_ID",
  "SLACK_PROOFING_NEEDED_USERGROUP_ID",
  "SLACK_PROOF_APPROVED_USER_ID",
  "SLACK_PROOF_SENT_TO_PRINT_USER_ID",
] as const;

export type RelaySettingKey = (typeof RELAY_SETTING_KEYS)[number];

export type RelayConfig = {
  ghlApiKey: string;
  ghlLocationId: string;
  slackBotToken: string;
  slackSigningSecret: string;
  ghlWebhookSharedSecret: string;
  slackNotificationChannelId: string;
  slackDealsUserGroupId: string;
  slackAlwaysInviteeUserIds: string[];
  slackProofRequestUserId: string;
  slackProofingNeededUserGroupId: string;
  slackProofApprovedUserId: string;
  slackProofSentToPrintUserId: string;
};

/** GoHighLevel private integration tokens use a lowercase `pit-` prefix. */
export const normalizeGhlPrivateIntegrationToken = (value: string): string =>
  value.replace(/^pit-/i, "pit-");

export const getRelayConfig = (): RelayConfig => ({
  ghlApiKey: normalizeGhlPrivateIntegrationToken(process.env.GHL_API_KEY?.trim() ?? ""),
  ghlLocationId: process.env.GHL_LOCATION_ID?.trim() ?? "",
  slackBotToken: process.env.SLACK_BOT_TOKEN?.trim() ?? "",
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET?.trim() ?? "",
  ghlWebhookSharedSecret: process.env.GHL_WEBHOOK_SHARED_SECRET?.trim() ?? "",
  slackNotificationChannelId: process.env.SLACK_NOTIFICATION_CHANNEL_ID?.trim() ?? "",
  slackDealsUserGroupId: process.env.SLACK_DEALS_USERGROUP_ID?.trim() ?? "",
  slackAlwaysInviteeUserIds: (process.env.SLACK_ALWAYS_INVITEE_USER_IDS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
  slackProofRequestUserId: process.env.SLACK_PROOF_REQUEST_USER_ID?.trim() ?? "",
  slackProofingNeededUserGroupId: process.env.SLACK_PROOFING_NEEDED_USERGROUP_ID?.trim() ?? "",
  slackProofApprovedUserId: process.env.SLACK_PROOF_APPROVED_USER_ID?.trim() ?? "",
  slackProofSentToPrintUserId: process.env.SLACK_PROOF_SENT_TO_PRINT_USER_ID?.trim() ?? "",
});

export type RelayReadiness = {
  key: RelaySettingKey;
  label: string;
  configured: boolean;
};

const settingLabels: Record<RelaySettingKey, string> = {
  GHL_API_KEY: "ADO GoHighLevel API key",
  GHL_LOCATION_ID: "ADO GoHighLevel location ID",
  SLACK_BOT_TOKEN: "Slack bot token",
  SLACK_SIGNING_SECRET: "Slack signing secret",
  GHL_WEBHOOK_SHARED_SECRET: "GoHighLevel webhook shared secret",
  SLACK_NOTIFICATION_CHANNEL_ID: "Slack notification channel",
  SLACK_DEALS_USERGROUP_ID: "Slack deals user group",
  SLACK_ALWAYS_INVITEE_USER_IDS: "Always-invite Slack users",
  SLACK_PROOF_REQUEST_USER_ID: "Proof request Slack recipient",
  SLACK_PROOFING_NEEDED_USERGROUP_ID: "Proofing-needed Slack group",
  SLACK_PROOF_APPROVED_USER_ID: "Approved-upload Slack recipient",
  SLACK_PROOF_SENT_TO_PRINT_USER_ID: "Sent-to-print Slack recipient",
};

export const getRelayReadiness = (): RelayReadiness[] => {
  const config = getRelayConfig();
  const configured: Record<RelaySettingKey, boolean> = {
    GHL_API_KEY: Boolean(config.ghlApiKey),
    GHL_LOCATION_ID: Boolean(config.ghlLocationId),
    SLACK_BOT_TOKEN: Boolean(config.slackBotToken),
    SLACK_SIGNING_SECRET: Boolean(config.slackSigningSecret),
    GHL_WEBHOOK_SHARED_SECRET: Boolean(config.ghlWebhookSharedSecret),
    SLACK_NOTIFICATION_CHANNEL_ID: Boolean(config.slackNotificationChannelId),
    SLACK_DEALS_USERGROUP_ID: Boolean(config.slackDealsUserGroupId),
    SLACK_ALWAYS_INVITEE_USER_IDS: config.slackAlwaysInviteeUserIds.length > 0,
    SLACK_PROOF_REQUEST_USER_ID: Boolean(config.slackProofRequestUserId),
    SLACK_PROOFING_NEEDED_USERGROUP_ID: Boolean(config.slackProofingNeededUserGroupId),
    SLACK_PROOF_APPROVED_USER_ID: Boolean(config.slackProofApprovedUserId),
    SLACK_PROOF_SENT_TO_PRINT_USER_ID: Boolean(config.slackProofSentToPrintUserId),
  };

  return RELAY_SETTING_KEYS.map(key => ({
    key,
    label: settingLabels[key],
    configured: configured[key],
  }));
};

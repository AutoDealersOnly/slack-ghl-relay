# ADO GHL–Slack Relay Recovery Index

## What to use after a loss

This index connects each operational function to its company GitHub backup and the surviving GoHighLevel or Slack setting that points to it. It deliberately contains **no API keys, bot tokens, signing secrets, user IDs, or other credential values**. Those stay in the private recovery-vault Google document.

> **Recovery rule:** Connect GitHub, use the company repository and recovery branch below, restore the `recovery-app` folder, enter the protected settings from the private vault, publish the site, and replace only the dead workflow or Slack destination address listed for the function being restored. Do not create a replacement workflow when the named existing workflow or Slack command is still present.

| Backup location | Value |
|---|---|
| Company repository | [AutoDealersOnly/slack-ghl-relay](https://github.com/AutoDealersOnly/slack-ghl-relay) |
| Recovery branch | `secure-recovery-relay-20260826` |
| Restored application folder | `recovery-app` |
| Current published relay | `https://ghl-slackrel-knvzqxuh.manus.space` |
| Credentials | Private recovery-vault Google document only; never GitHub or this index. |

## Restored functions

| Function | Existing connection that remains in GHL or Slack | Replacement destination or command address | Result to verify after recovery |
|---|---|---|---|
| Manual Production Canvas | Slack `/ghl` command | `/api/slack/commands/ghl` | Creates or updates one populated Production Canvas tab in the current campaign channel. |
| Automatic Production Canvas refresh | **Production Update GHL to Slack** Custom Webhook | `/api/relay/ghl/production_update` | Updates the existing Production Canvas; does not create a duplicate tab. The current workflow triggers for its configured field changes. |
| Proof-stage messages | **GHL Production Message to Slack** Custom Webhook | `/api/relay/ghl/proof_status` | Sends the approved Proof Request, Proofing Needed, Approved to Upload, and Sent to Print messages in the campaign channel. |
| Channel creation and scheduled archive | **Create Slack Channel** Custom Webhook | `/api/relay/ghl/create_channel` | Creates or reuses the campaign channel and schedules archive exactly three days after Event End. |
| Campaign custom-value update | **Push Campaign Custom Values** Custom Webhook; Production Status is `post_production` | `/api/relay/ghl/push_campaign_values` | Updates only the approved campaign values in the Production record’s linked dealership subaccount and posts the campaign-channel confirmation. |
| Dealership-information custom-value update | **Dealership Object to Subaccount Custom Values**; Dealership Status is `VERIFIED` | **Not yet restored** | Future task: update dealership-information custom values and notify GHL New Subaccounts. |

Each destination above is appended to the published relay URL. The Custom Webhooks retain their existing **POST**, body, headers, and authorization behavior unless the function’s recovery guide explicitly says otherwise.

## Simple rebuild procedure

First, open the private recovery-vault Google document and this Recovery Index. Then connect the company GitHub account, clone the company repository, and check out the recovery branch shown above. The `recovery-app` folder contains the secret-free source, tests, database schema, workflow maps, and recovery instructions.

Next, create a replacement relay deployment from that folder. Enter the current protected settings from the private vault; do not copy credentials into source files, GitHub, chat, or the status page. Once the replacement has passed its tests, update the one existing Slack command or GoHighLevel Custom Webhook address listed in the table. Test in ABC Dealer before approving broader use.

Finally, document the new published relay URL and the test result in the private recovery-vault Google document. Commit and push the secret-free updated source and recovery instructions to the same GitHub branch before moving to the next automation.

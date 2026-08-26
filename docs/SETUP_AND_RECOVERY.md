# ADO GHL–Slack Relay: Setup and Recovery Guide

This guide is written for the person restoring or operating the relay. It explains what must be in place before a live workflow is turned on, what each setting controls, and how to recover safely after an interruption. It intentionally names settings but never contains their values.

> **Rule of operation:** A tested change is not finished until the source, setup guide, workflow map, and database migration are safely backed up in company GitHub. Access values belong only in the designated private recovery vault and protected project settings.

## 1. What this relay does

The relay receives selected changes from the **ADO** GoHighLevel account. It verifies the workflow’s protected request header, reads the fresh Production and related Dealership records, and performs the matching Slack operation. It can create a campaign channel, invite the designated team, create or refresh the Production Canvas, post proof-stage notices, sync approved values to the dealership subaccount, and schedule the channel warning and archive actions.

The relay’s own database remembers each campaign channel, its Production Canvas, duplicate webhook receipt, archive state, and safe result history. Restarting the service does not remove that record.

## 2. Protected settings checklist

Add these values in the project’s protected settings area. Do **not** place them in GitHub, source code, chat, browser notes, workflow URLs, or the status page.

| Protected setting | What it is for | Where the value comes from |
|---|---|---|
| `GHL_API_KEY` | Lets the relay read ADO Production and Dealership custom objects. | ADO GoHighLevel API credentials. |
| `GHL_LOCATION_ID` | Tells the relay which ADO location owns the Production records. | ADO subaccount/location settings. |
| `SLACK_BOT_TOKEN` | Lets the relay create channels and canvases, invite members, message, and archive. | Slack API app → **OAuth & Permissions**. |
| `SLACK_SIGNING_SECRET` | Verifies any future requests that originate in Slack. | Slack API app → **Basic Information**. |
| `GHL_WEBHOOK_SHARED_SECRET` | Proves that a relay request came from a rebuilt GHL workflow. | Create a new long random value; store it in the private recovery vault. |
| `SLACK_NOTIFICATION_CHANNEL_ID` | Receives the operational completion and archive notices. | Open the selected Slack channel and copy its channel ID. |
| `SLACK_DEALS_USERGROUP_ID` | Identifies the Slack group invited to new campaign channels. | Slack workspace user-group administration. |
| `SLACK_ALWAYS_INVITEE_USER_IDS` | Comma-separated people who are always invited to new campaign channels. | Each person’s Slack member ID. |
| `SLACK_PROOF_REQUEST_USER_ID` | Slack member who receives Request Proof notices. | David’s Slack member ID in the private recovery vault. |
| `SLACK_PROOFING_NEEDED_USERGROUP_ID` | Slack group tagged when Proofing Needed is selected. | The Deals user-group ID in the private recovery vault. |
| `SLACK_PROOF_APPROVED_USER_ID` | Slack member who receives Approved to Upload notices. | David’s Slack member ID in the private recovery vault. |
| `SLACK_PROOF_SENT_TO_PRINT_USER_ID` | Slack member who receives Sent to Print notices. | Brian’s Slack member ID in the private recovery vault. |

### Recovering the Slack values

Open [Slack API — Your Apps](https://api.slack.com/apps), select the **GHL** app in the ADO workspace, and use the following pages.

| Needed item | Click-by-click location | Important note |
|---|---|---|
| Slack Signing Secret | **Basic Information** → **App Credentials** → **Signing Secret** → **Show** | Record it only in the private recovery vault and protected settings. Never regenerate it until the replacement has been updated everywhere that uses it. |
| Slack Bot Token | **OAuth & Permissions** → **Bot User OAuth Token** | Copy it only into protected settings and the private recovery vault. Reinstall the app after scope changes. |
| Notification Channel ID | Open the channel in Slack → channel name → **About** → channel ID, or copy the channel link and use the final channel identifier. | This is an identifier, not a secret, but it still does not belong in public code. |
| Deals User Group ID | Slack administration → user groups → open the group → copy its ID or its administrative URL identifier. | Use the **@deals** group only if that remains the correct operating group. |
| Always-invite User IDs | Open each person’s Slack profile → **More** → **Copy member ID**. | Separate IDs with commas in protected settings. |

The Slack app must have the permissions necessary for its actual actions: sending messages, creating and joining channels, reading and inviting channel members, reading user groups, managing canvases, and archiving channels. Slack’s method pages show the required scopes for each action. [1]

## 3. Rebuilt GoHighLevel workflows

Every workflow uses **Custom Webhook**, method **POST**, Content-Type **application/json**, and this header:

```text
Authorization: Bearer <the GHL_WEBHOOK_SHARED_SECRET>
```

Do not put this shared secret in the webhook URL. The protected status page will show only whether the relay has a matching value, never the value itself.

| Workflow purpose | GHL trigger | Relay path after deployment | Minimum JSON body |
|---|---|---|---|
| Proof-stage notice | Production Changed → Proof Stage has changed | `/api/relay/ghl/proof_status` | `production_name`, `proof_stage` |
| Create channel and Production Canvas | Production stage becomes the approved production stage | `/api/relay/ghl/create_channel` | `production_name` |
| Refresh Production Canvas | Production record changes | `/api/relay/ghl/production_update` | `production_name` |
| Dealership custom-value sync | Dealership record reaches the approved verification condition | `/api/relay/ghl/dealership_sync` | `production_name` or the related production/channel reference |
| Campaign custom-value sync | Production reaches the campaign-ready stage | `/api/relay/ghl/push_campaign_values` | `production_name` |
| Cancel archive | A campaign is cancelled or held open | `/api/relay/ghl/cancel_archive` | `production_name` |
| Reschedule archive | Campaign end date changes | `/api/relay/ghl/reschedule_archive` | `production_name` |

The original proof-stage workflow used a **Production Changed** trigger, filtered to **Proof Stage has changed**, with a JSON body holding `production_name` and `proof_stage`. Retain that business rule. The only intentional change is the new protected relay path and header.

GoHighLevel Custom Webhook supports custom JSON bodies and headers, and its workflow test tool should be used before publishing a live trigger. [2]

## 4. Safe test sequence

1. Add the protected settings and confirm the recovery dashboard changes each setting from **Needed** to **Configured**. The values will remain hidden.
2. Ensure the Slack app is installed in the ADO workspace with the necessary scopes.
3. Create a temporary Slack test channel and use **ABC Dealer** / a non-production Production record.
4. Configure only the **Proof-stage notice** workflow first. Use the test control in GHL. Confirm the relay records one safe activity result and does not create a duplicate when the identical test is repeated.
5. Test channel creation and Canvas refresh with a clearly marked non-production Production record. Confirm one channel, one Production Canvas, and a matching record in the recovery dashboard.
6. Test Dealership and Campaign custom-value sync only against **ABC Dealer**. Verify the updated values in the test subaccount before using a production dealership.
7. After the site has been published, test the archive warning and archive schedule with a short-lived test record. The hosting platform must be deployed before a managed schedule can call the relay. [3]
8. Review the recovery dashboard for failed actions. Do not activate the same live workflow twice until the test result is understood.

## 5. Archive behavior

The relay schedules the archive action for **12:00 UTC, three days after the Production end date** and schedules a warning for **12:00 UTC on the preceding day**. Each scheduled callback is authenticated by the platform and looks up the campaign by the schedule’s own identifier, not by a value supplied in the request body. A completed, cancelled, or unknown schedule ends safely without re-archiving a channel. The platform retries temporary 5xx or rate-limit failures. [3]

If the campaign end date changes, send the **Reschedule archive** workflow. If the campaign should stay open, send **Cancel archive**. Both actions are recorded in the relay database.

## 6. Rotation and incident response

If a token or key is believed to be exposed, replace it in this order: create the replacement in the source system, update the protected project setting, test the relay against **ABC Dealer**, update the private recovery vault with the new value and rotation date, and only then revoke the old value. Never write the old or new value into GitHub.

For a failed live action, first review the status page’s safe message. Then check the matching workflow name, the protected-setting readiness, the record relationship between Production and Dealership, and the Slack app’s scopes. If the action must be retried, change the underlying cause first; replaying an unchanged failure only adds noise.

## 7. Restore after a loss

1. Clone the approved company GitHub repository.
2. Restore the database schema using the tracked migration files in `drizzle/`.
3. Add the protected settings from the private recovery vault; do not copy values from GitHub because they are deliberately absent.
4. Deploy the project, then confirm the private status page can load.
5. Recreate the GHL workflows from the table in this guide using the new deployed relay address and the shared-secret header.
6. Run the safe test sequence in ABC Dealer before enabling a live ADO workflow.
7. Confirm the final source, guide, and workflow map are committed to GitHub.

## References

[1]: https://docs.slack.dev/ "Slack Developer Documentation"
[2]: https://help.gohighlevel.com/support/solutions/articles/155000003305-workflow-action-custom-webhook "HighLevel — Workflow Action: Custom Webhook"
[3]: https://docs.manus.im/ "Manus documentation — project scheduling and deployment"

# ADO GHL–Slack Relay Recovery Index

## What to use after a loss

This index connects each operational function to its company GitHub backup and the surviving GoHighLevel or Slack setting that points to it. It deliberately contains **no API keys, bot tokens, signing secrets, user IDs, or other credential values**. Those stay in the Manus Keys and Codes.

> **Recovery rule:** Connect GitHub, use the company repository and recovery branch below, restore the `recovery-app` folder, enter the protected settings from the Manus Keys and Codes, publish the site, and replace only the dead workflow or Slack destination address listed for the function being restored. Do not create a replacement workflow when the named existing workflow or Slack command is still present.

| Backup location | Value |
|---|---|
| Company repository | [AutoDealersOnly/slack-ghl-relay](https://github.com/AutoDealersOnly/slack-ghl-relay) |
| Recovery branch | `secure-recovery-relay-20260826` |
| Restored application folder | `recovery-app` |
| Current published relay | `https://ghl-slackrel-knvzqxuh.manus.space` |
| Credentials | **Manus Keys and Codes** Google document only; never GitHub or this index. |

## Restored functions

| Function | Existing connection that remains in GHL or Slack | Replacement destination or command address | Result to verify after recovery |
|---|---|---|---|
| Manual Production Canvas | Slack `/ghl` command | `/api/slack/commands/ghl` | Creates or updates one populated Production Canvas tab in the current campaign channel. Before editing a saved Canvas, the relay verifies that Slack still shows that Canvas in the same channel; a detached link is safely relinked or replaced only for that channel. A protected one-minute relay availability check keeps the command ready for Slack’s short response window; it performs no Slack, GoHighLevel, archive, warning, or campaign action. |
| Super Admin controls | User-created private `#super-admin` channel plus the existing Slack app’s Interactivity Request URL | `/api/slack/interactions` | Shows the plain-language automation Canvas and a **Keep Open** control for a matching pending archive. Verified in ABC Test: Keep Open cancelled one temporary far-future ABC Test schedule and changed its message to kept open, without changing the event date or any live campaign. Archive messages are added at schedule time, refreshed on reschedule, and changed to final status when kept open or archived. **Refresh ABC Test Production Canvas** is separately verified: it updates ABC Test’s existing saved Canvas directly and cannot create or relink a Canvas. The generic repair control remains blocked for active staff channels. The private channel’s membership is the control gate. |
| Automation testing rule | ABC Test only | N/A | Test every Slack–GHL automation change in ABC Test. Active campaign channels are hands-off for testing unless David explicitly approves that exact exception. |
| Automatic Production Canvas refresh | **Production Update GHL to Slack** Custom Webhook | `/api/relay/ghl/production_update` | Updates the existing Production Canvas; does not create a duplicate tab. The current workflow triggers for its configured field changes. |
| Proof-stage messages | **GHL Production Message to Slack** Custom Webhook | `/api/relay/ghl/proof_status` | Sends the approved Proof Request, Proofing Needed, Approved to Upload, and Sent to Print messages in the campaign channel. |
| BDC mailpiece images | Existing **GHL Production Message to Slack** Sent to Print event | `/api/relay/ghl/proof_status` | Posts the original Sent to Print notice first. Two PDF mailpieces use each first page; one two-page PDF uses pages 1 and 2; one one-page PDF sets the front image and intentionally clears the back BDC image value. ENV PDFs are excluded. Verified in ABC Dealer and on a live one-page campaign retry. See `BDC_MAILPIECE_IMAGES.md`. |
| Activity Dashboard | Separate saved **Activity Dashboard** Slack Canvas in ABC Test, plus the managed fifteen-minute refresh | `/api/scheduled/relay/activity-dashboard-refresh` | Reads current lower-case GoHighLevel tags every fifteen minutes from seven days before Event Start until the channel is archived. The current ABC-only sources are `qr visit`, `qr appointment`, `phone`, `sms`, `1click`, `ai booked appointment`, `qr show`, and `qr check in`; QR Show and QR Check In are one combined total. `/ghl` in ABC Test also refreshes the existing Activity Dashboard after the Production Canvas. The saved tab is edited in place; it never creates another Activity Dashboard tab. A partial GoHighLevel response cannot erase the saved dates, dealership connection, channel, or Canvas link. See `ACTIVITY_DASHBOARD_PHONE_SMS_WORKFLOW_SETUP.md`. |
| Channel creation and scheduled archive | **Create Slack Channel** Custom Webhook plus the daily reconciliation guard | `/api/relay/ghl/create_channel` and `/api/scheduled/relay/archive-reconcile` | Creates or reuses the campaign channel and schedules archive exactly three calendar days after Event End. **No archive activity runs Saturday or Sunday in Eastern time:** weekend archive dates move to Monday; Monday’s warning moves to Friday and says it will archive Monday. The archive, warning, and daily guard all refuse weekend work as a second safeguard. An administrator cancels only that campaign’s matching pending archive job; there is no Slack reply command or operations-channel path. The daily guard restores missing future schedules and presents overdue channels for approval; it never silently bulk-archives overdue channels. On September 21, 2026, 15 pending records were updated for this rule and all active pending archive/warning jobs were verified weekday-only. See `AUTOMATIC_ARCHIVE_RECONCILIATION_2026-09-08.md`. |
| Campaign custom-value update | **Push Campaign Custom Values** Custom Webhook; Production Status is `post_production` | `/api/relay/ghl/push_campaign_values` | Updates only the approved campaign values in the Production record’s linked dealership subaccount and posts the campaign-channel confirmation. |
| Dealership-information custom-value update | **Dealership Object to Subaccount Custom Values**; Dealership Status is `VERIFIED` | `/api/relay/ghl/dealership_sync` | Updates the linked subaccount’s dealership-information custom values and posts confirmation in GHL New Subaccounts. Verified in ABC Dealer. |
| QR Pass Page Builder | ADO GHL custom-menu link | `/qr-pass-builder?access=[private value]` | Selects a dealership and produces four copy-ready QR Pass Page blocks plus the appointment-SMS QR URL. Exact private menu link: Manus Keys and Codes only. |
| PIN Code Lookup Tool | GHL custom-menu link in each dealership subaccount | `/pin-code-lookup?locationId={{location.id}}&access=[private value]` | Uses the active dealership context for PIN lookup, PIN retry, phone/name fallback, manual entry, contact/vehicle editing, and duplicate-safe contact updates. Verified in ABC Dealer. Exact protected link: Manus Keys and Codes only. Customer-specific opportunity visibility is deferred pending a future approved `opportunities.readonly` access review. |

Each destination above is appended to the published relay URL. The Custom Webhooks retain their existing **POST**, body, headers, and authorization behavior unless the function’s recovery guide explicitly says otherwise.

## Simple rebuild procedure

First, open **Manus Keys and Codes** and this Recovery Index. Then connect the company GitHub account, clone the company repository, and check out the recovery branch shown above. The `recovery-app` folder contains the secret-free source, tests, database schema, workflow maps, and recovery instructions.

Next, create a replacement relay deployment from that folder. Enter the current protected settings from **Manus Keys and Codes**; do not copy credentials into source files, GitHub, chat, or the status page. Once the replacement has passed its tests, update the one existing Slack command or GoHighLevel Custom Webhook address listed in the table. Test in ABC Dealer before approving broader use.

Finally, document the new published relay URL and the test result in **Manus Keys and Codes**. Commit and push the secret-free updated source and recovery instructions to the same GitHub branch before moving to the next automation.

## Future adjustments

Use `FUTURE_CHANGE_PROCEDURE.md` for every requested change to a restored function. It sets the required sequence: start from this index and the private Manus Keys and Codes, make only the requested adjustment, test in ABC Dealer when a live operation is affected, obtain visual confirmation where relevant, update the private record, and push the tested secret-free change to the recovery branch.

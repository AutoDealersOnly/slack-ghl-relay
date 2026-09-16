# Super Admin Slack Channel — Automation Inventory

## Purpose

The private **Super Admin** Slack channel will be the plain-language reference point for the automations between GoHighLevel and Slack. It will explain what each automation does and, only where it is safe, provide a simple control for one narrowly defined action. It will never show API keys, passwords, private links, location IDs, or other protected settings.

> **Testing rule:** All Slack–GHL automation tests use **ABC Test only**. Every active campaign channel is hands-off for testing unless David explicitly approves that exact exception.

> **First-version rule:** The active actions are **Keep Open** for one selected pending archive and **Refresh ABC Test Production Canvas**. The Canvas refresh is hard-limited to ABC Test, edits its saved Canvas directly, and cannot create or relink a Canvas. Every other item remains instructions and read-only status until its own safe control is separately designed, tested, and approved.

## What the Canvas will explain

| Automation | What it normally does | What Super Admin can safely do at first | What stays outside Slack controls |
|---|---|---|---|
| Production Canvas | Creates or refreshes the Production Canvas in the campaign channel when `/ghl` is used or the linked Production record changes. | **Refresh ABC Test Production Canvas** only. It edits ABC Test’s saved Canvas directly. | No active-campaign repair control. Active staff campaign channels must never be used for Canvas repair or testing. |
| Proof-stage messages | Posts the correct channel message when a Production record enters a proof stage. | Show the stage-to-message purpose. | No changing recipients, mentions, wording, or proof stage from Slack. |
| BDC mailpiece images | After Sent to Print, uses qualifying PDFs to update the linked dealership’s BDC mailpiece images and values. | Show the expected successful result and the Media-permission prerequisite. | No rerun, image replacement, or custom-value edit button. |
| Campaign channel archive | Warns one day before archive and archives three calendar days after Event End. | List pending archives and let an authorized admin choose **Keep Open** for one channel. | No bulk archive, no change to Event End, and no effect on another campaign. |
| Campaign custom-value update | When a Production record moves to Post Production, updates approved campaign values in its linked dealership subaccount. | Explain the trigger and confirmation. | No subaccount value edits or status changes from Slack. |
| Dealership custom-value update | When an ADO Dealership record becomes Verified, updates approved dealership values in its linked subaccount. | Explain the trigger and confirmation. | No dealership verification or protected dealership-connection changes from Slack. |
| QR Pass Page Builder | Generates dealership-specific copy-ready landing-page and QR code blocks from the authorized ADO menu link. | Provide the plain-language purpose and where admins use the existing tool. | No API-key display or protected-link change in Slack. |
| PIN Code Lookup | Lets staff safely find and update a customer in the active dealership subaccount. | Provide the plain-language purpose and normal entry point. | No protected-link change, permission change, or opportunity action. |
| Active Call Lookup — Test | Separate ABC-only test for a future live incoming-call lookup. | Mark it as a separate test that is not a live call-center control. | No test-feed start, call action, routing, number, queue, user, recording, or PIN-page change without separate approval. |

## How the first control works

The scheduled warning still appears in the affected campaign channel. The Super Admin channel also receives one private message for each upcoming archive. When a new campaign receives an archive schedule, its message is added. When its event date is rescheduled, the same message is refreshed. When it is kept open or archived normally, that message changes to show the final result. An authorized administrator can select **Keep Open** on that specific pending message.

The relay will verify that the Slack request is authentic, verify that the button originated in the saved private Super Admin channel, and re-check that the exact campaign still has that pending archive job. Only then will it cancel that one scheduled archive and change the message to show the channel is being kept open. A repeat click, an expired job, a mismatched campaign, or an action from outside the private channel will make no change.

> **Verified:** The private Super Admin channel, Canvas, and Keep Open button were tested with one temporary far-future schedule in **ABC Test only**. The button cancelled that one temporary schedule and changed its message to kept open. ABC Test was not archived, its Event End date was not changed, and no active campaign channel was used.

The original generic Production Canvas repair remains disabled in Super Admin. A live staff campaign channel cannot be used to diagnose, test, create, relink, or refresh a Canvas because a second or temporary Canvas would confuse staff. The separate **Refresh ABC Test Production Canvas** button has been verified to update ABC Test’s one existing Production Canvas in place without adding another Canvas. It intentionally has no create or relink path. It remains ABC Test-only unless David explicitly approves a wider release.

## What still requires a person with the right access

The first live setup requires two deliberate Slack changes by an authorized Slack app administrator: create or identify the private Super Admin channel and turn on the existing Slack app’s **Interactivity** setting with the dedicated request address. Neither change replaces the bot token, changes current message behavior, or adds a new Slack scope. The private channel’s membership is the administrator gate, so no separate named-user list is stored or maintained.

Once that is complete, the Super Admin Canvas can be kept as the shared instructions page. Future controls will be added one automation at a time, each with its own ABC Test verification and approval.

## References

[1]: https://docs.slack.dev/interactivity/handling-user-interaction "Handling user interaction in Slack apps"
[2]: https://docs.slack.dev/authentication/verifying-requests-from-slack "Verifying requests from Slack"
[3]: https://docs.slack.dev/surfaces/app-home "Slack App Home"
[4]: https://docs.slack.dev/surfaces/modals "Slack Modals"
[5]: https://docs.slack.dev/reference/interaction-payloads/view-interactions-payload "Slack view-submission payloads"

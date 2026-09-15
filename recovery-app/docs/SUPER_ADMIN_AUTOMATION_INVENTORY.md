# Super Admin Slack Channel — Automation Inventory

## Purpose

The private **Super Admin** Slack channel will be the plain-language reference point for the automations between GoHighLevel and Slack. It will explain what each automation does and, only where it is safe, provide a simple control for one narrowly defined action. It will never show API keys, passwords, private links, location IDs, or other protected settings.

> **First-version rule:** The only action button will be **Keep Open** for one selected campaign channel that has a pending archive. Every other item is instructions and read-only status until its own safe control is separately designed, tested, and approved.

## What the Canvas will explain

| Automation | What it normally does | What Super Admin can safely do at first | What stays outside Slack controls |
|---|---|---|---|
| Production Canvas | Creates or refreshes the Production Canvas in the campaign channel when `/ghl` is used or the linked Production record changes. | Show the normal trigger and recovery direction. | No editing of Production data, Canvas data, or workflow destinations. |
| Proof-stage messages | Posts the correct channel message when a Production record enters a proof stage. | Show the stage-to-message purpose. | No changing recipients, mentions, wording, or proof stage from Slack. |
| BDC mailpiece images | After Sent to Print, uses qualifying PDFs to update the linked dealership’s BDC mailpiece images and values. | Show the expected successful result and the Media-permission prerequisite. | No rerun, image replacement, or custom-value edit button. |
| Campaign channel archive | Warns one day before archive and archives three calendar days after Event End. | List pending archives and let an authorized admin choose **Keep Open** for one channel. | No bulk archive, no change to Event End, and no effect on another campaign. |
| Campaign custom-value update | When a Production record moves to Post Production, updates approved campaign values in its linked dealership subaccount. | Explain the trigger and confirmation. | No subaccount value edits or status changes from Slack. |
| Dealership custom-value update | When an ADO Dealership record becomes Verified, updates approved dealership values in its linked subaccount. | Explain the trigger and confirmation. | No dealership verification or protected dealership-connection changes from Slack. |
| QR Pass Page Builder | Generates dealership-specific copy-ready landing-page and QR code blocks from the authorized ADO menu link. | Provide the plain-language purpose and where admins use the existing tool. | No API-key display or protected-link change in Slack. |
| PIN Code Lookup | Lets staff safely find and update a customer in the active dealership subaccount. | Provide the plain-language purpose and normal entry point. | No protected-link change, permission change, or opportunity action. |
| Active Call Lookup — Test | Separate ABC-only test for a future live incoming-call lookup. | Mark it as a separate test that is not a live call-center control. | No test-feed start, call action, routing, number, queue, user, recording, or PIN-page change without separate approval. |

## How the first control works

The scheduled warning still appears in the affected campaign channel. The Super Admin channel will also receive a private message for each upcoming archive. An authorized administrator can select **Keep Open** on that specific message.

The relay will verify that the Slack request is authentic, verify that the person who selected the button is on the protected Super Admin list, and re-check that the exact campaign still has that pending archive job. Only then will it cancel that one scheduled archive and change the message to show the channel is being kept open. A repeat click, an expired job, a mismatched campaign, or an unauthorized person will make no change.

## What still requires a person with the right access

The first live setup requires two deliberate Slack changes by an authorized Slack app administrator: create or identify the private Super Admin channel and turn on the existing Slack app’s **Interactivity** setting with the dedicated request address. Neither change replaces the bot token, changes current message behavior, or adds a new Slack scope. The administrator list must also be agreed before a control button is activated.

Once that is complete, the Super Admin Canvas can be kept as the shared instructions page. Future controls will be added one automation at a time, each with its own test and approval.

## References

[1]: https://docs.slack.dev/interactivity/handling-user-interaction "Handling user interaction in Slack apps"
[2]: https://docs.slack.dev/authentication/verifying-requests-from-slack "Verifying requests from Slack"
[3]: https://docs.slack.dev/surfaces/app-home "Slack App Home"

# ABC Production Canvas Verification

## Confirmed Working as of 2026-08-26

The existing Slack `/ghl` command now creates one real **Production** Canvas tab in `#2609-abc-test-ame` and fills it with the current ADO Production and related Dealership data. A repeated `/ghl` command updates that same tab in place without creating another tab.

The existing **Production Update GHL to Slack** workflow was restored by replacing only its dead Custom Webhook destination. The user then made one controlled saved change to the ABC Production record and visually confirmed that the **same existing Production Canvas updated correctly in place**. No duplicate Canvas was created.

## Renamed-channel Canvas recovery

On 2026-09-15, a campaign channel was first created with a misspelled name and then corrected. The initial `/ghl` run used the original no-record-found fallback. After the name was corrected, `/ghl` found the right Production record, but its saved Canvas link pointed to a Canvas that Slack no longer displayed in that channel.

The relay now verifies that a saved Canvas is still attached to the exact Slack channel before it edits that Canvas. If the saved link is detached, the existing proven Canvas path reuses the channel’s visible Canvas when Slack has one, or creates one only when none exists. This does not alter the Proof Requested relay, any GoHighLevel workflow, the channel itself, or another campaign.

The corrected campaign then received one controlled `/ghl` run. The user visually confirmed that the visible Production Canvas appeared with the complete campaign information. Its secret-free relay action record also recorded a successful Production Canvas refresh.

## Remaining Verification

The separate **GHL Production Message to Slack** proof-stage workflow must be reconnected and tested independently. It must not change the Canvas-refresh behavior verified above.

## Proof-stage Slack message acceptance format

The user supplied prior working Slack examples as the acceptance standard for the separate proof-stage flow. The restored messages must retain the existing operational styling and text pattern:

| Proof stage | Visual treatment | Required message pattern |
|---|---|---|
| Proof Request | Blue accent | **🖨️ Proof Request** followed by a David mention and the mailpiece/date/dealership request line. |
| Proofing Needed | Red accent | **📋 Proofing Needed** followed by the BDC mention and the proofing-needed line. |
| Approved to Upload | Yellow accent | **✅ Approved to Upload** followed by a David mention, upload wording, and the job number. |
| Sent to Print | Green accent | **📤 Sent to Print** followed by the MBI upload wording and Brian mention. |

The existing workflow **GHL Production Message to Slack** is open in the connected browser for read-only inspection. Its builder has not yet exposed the Custom Webhook configuration to the browser reader, and no setting has been changed.

## Proof-stage delivery verification

The existing **GHL Production Message to Slack** workflow was preserved and its dead Custom Webhook address was replaced. Its workflow execution log then confirmed that the ABC Custom Webhook action executed. The first delivery exposed a relay routing defect: an unprotected proof-status delivery was incorrectly using the Canvas-refresh handler. That path was corrected without changing the workflow.

After the correction, an ABC change to **Proofing Needed** posted successfully to `#2609-abc-test-ame`. The user visually confirmed the red-accent message with **📋 Proofing Needed**, the **@deals** group mention, and the original wording. The relay’s secret-free action record also confirms `proof_stage_notice` completed successfully. The other stage strings remain covered by the preserved message-format tests and the user-provided former working examples; they have not yet been individually re-triggered in this recovery session.

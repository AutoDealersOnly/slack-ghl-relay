# Activity Dashboard: Phone and SMS Appointment Tags

## Purpose and test boundary

This guide sets up the two lower-case GoHighLevel tags used by the **ABC Test Activity Dashboard**:

| Dashboard row | Tag | What qualifies |
| --- | --- | --- |
| Phone | `phone` | An appointment is actually set after an incoming phone call. |
| SMS | `sms` | An appointment is actually set through an SMS conversation or an SMS booking process. |

> **Use ABC Dealer only.** Do not copy either workflow into another dealership or snapshot until the ABC dashboard totals have been verified. These workflows must not alter the Production Canvas, Event Start or Event End, channel archive schedule, proof relays, or OfficeAtHand calling setup.

The Activity Dashboard re-reads the current lower-case tags every fifteen minutes. A tag applied by a workflow or manually by an operator will appear on the next refresh. The dashboard is intentionally active only for ABC Test while this feature is being verified.

## Phone appointment workflow

ABC Dealer already has a published workflow named **Call Dispositions Appointment Set**. Its published status confirms that call-disposition tracking is an established pattern in this account. Create a separate ABC-only tracking workflow rather than modifying that working workflow.

1. In **ABC Dealer**, go to **Automation → Workflows**, then choose **Create Workflow → Start from Scratch**. Name it **Activity Dashboard - Phone Appointment Tag**.
2. Add the **Call Details** trigger.
3. Set the trigger filters as follows:

   | Filter | Setting |
   | --- | --- |
   | Call Direction | **Incoming** |
   | Custom Disposition | Select the exact appointment-set disposition already used by the published **Call Dispositions Appointment Set** workflow. Do not guess or create a new disposition. |
   | In Phone Number | Optional but recommended if only specific ABC Test tracking number(s) should count. Leave it blank only if every ABC Dealer inbound appointment call should count. |

4. Add one action: **Add Contact Tag**. Select or create the tag exactly as `phone` in lowercase.
5. In workflow settings, allow re-entry after a completed run. This lets a person who later calls back and legitimately sets another appointment go through the source-label step again. It does not change any existing appointment workflow.
6. Save it as a draft. Do **not** publish it yet.
7. For the controlled test, use an ABC Test call where the agent sets the same appointment-set disposition used in the filter. Confirm that the contact receives the `phone` tag. The Activity Dashboard should increase its Phone total on the next 15-minute refresh or after `/ghl` is run in the ABC Test Slack channel.
8. Check the workflow’s execution log. If the tag does not appear, compare the real call log’s direction and disposition to the trigger filters before changing anything else.

> Do not use a call-status filter such as **Completed** by itself. A completed call does not prove that an appointment was set. The specific appointment-set custom disposition is the safe marker.

## SMS appointment workflow

A general “customer replied” workflow cannot safely add `sms`, because most SMS replies do not produce an appointment. The tag must be added only in the workflow or operator step that actually creates the appointment.

### If an SMS-specific booking workflow creates the appointment

1. In ABC Dealer, find the **published workflow that actually creates the appointment from SMS**. The existing **Appointment QR Code SMS** and **QR Visit SMS Follow-Up** workflows should not be assumed to do that; review the action that creates the appointment first.
2. Immediately after its **Create/Update Appointment** action, add **Add Contact Tag** and select `sms` in lowercase.
3. Save as a draft, run one ABC Test appointment through that SMS process, verify that the tag is placed only on the booked contact, then publish it.

### If a human operator creates the appointment while texting

Use the same `sms` tag immediately after the appointment is set. The cleanest first ABC Test is to apply the lower-case `sms` tag manually to the booked contact after creating the appointment. That proves the dashboard count without adding a broad workflow that would tag every text conversation.

Once that is proven, ADO can decide whether the operators should use an existing appointment-set workflow, a small internal checklist, or an added source field to apply the tag consistently. A broad rule that adds `sms` merely because a customer texted should not be used.

## Counting rule

While the dashboard is running in tag-based mode, each source tag counts a contact once in the ABC event window. This protects the total from duplicate tag actions. If a future source workflow sends the confirmed appointment reference at the instant the appointment is created, the dashboard can count every separate booked appointment and uses that confirmed record in preference to the contact’s tag.

## Safe manual refresh

The standard automatic check runs every fifteen minutes while the ABC Test channel remains open. For ABC Test, `/ghl` also refreshes the existing Activity Dashboard after refreshing the Production Canvas. It edits the saved dashboard tab in place and does not create another tab.

## Test record

Record the following after the first two controlled tests:

| Test | Expected result |
| --- | --- |
| Phone disposition test | Only a qualifying incoming call with the established appointment-set disposition receives `phone`; the Phone total increases on refresh. |
| SMS booking test | Only a contact whose appointment was actually set through the SMS route receives `sms`; the SMS total increases on refresh. |
| Safety check | No Production Canvas changes, no Event Start or Event End change, no Slack channel archive change, and no OfficeAtHand setting change. |

After both ABC-only tests are confirmed, document the final workflow names and add the tested setup to **Manus Keys and Codes** before copying it to any other dealership.

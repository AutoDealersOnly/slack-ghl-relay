# Activity Dashboard Plan

## Purpose

The **Activity Dashboard** will be a separate Slack Canvas tab in each campaign channel. It will sit beside the existing Production Canvas without replacing, relinking, or editing that Canvas. Slack supports adding a separate Canvas to a channel as a tab, and allows up to fifteen channel tabs for Canvases, lists, workflows, messages, links, and files on eligible plans.[1][2] The first live test will be limited to **ABC Test**.

The dashboard will present campaign activity for one defined period: from **seven calendar days before the Event Start date** through the normal channel archive, which is currently scheduled three days after Event End. It will refresh automatically every fifteen minutes while the campaign is inside that period. When the normal archive process closes the channel, the activity refresh is removed with it. No campaign activity will be collected before its seven-day window or after its channel has been archived.

## How the QR count stays accurate

The existing contact tags will remain the visible operating tags:

| Activity | GoHighLevel tag | Dashboard treatment |
| --- | --- | --- |
| Customer opens the QR funnel | `qr visit` | Saves one QR-scan record for that contact and campaign. |
| Customer schedules using the QR route | `qr appointment` | Saves one QR-appointment record, then removes `qr visit` from that contact. |
| Customer checks in using the QR route | `qr show` or `qr check in` | Saves one show record for that contact and campaign. The two tag names are interchangeable for this one total. |
| Appointment set by the AI appointment process | `ai booked appointment` | Saves one AI-booked appointment record for the separate AI Booked Appointments module. |
| Appointment set through an incoming call | `phone` | Counts in the Phone row after the operator or a future workflow applies the tag. |
| Appointment set through SMS | `sms` | Counts in the SMS row after the operator or a future workflow applies the tag. |
| Appointment set through Facebook / OneClick | `1click` | Counts in the OneClick / Facebook row after the operator or a future workflow applies the tag. |

The removal of `QR Visit` is correct and will be part of the QR appointment workflow. However, a tag alone cannot preserve when it was applied, and removing that tag would otherwise erase the scan from a later count. Therefore, the durable design records the timestamped QR visit when it happens. The dashboard will then show the following mutually exclusive view:

| Dashboard figure | Meaning |
| --- | --- |
| QR scans | Unique people who reached the QR funnel during the campaign window, including people who later scheduled. The current tags are re-read every fifteen minutes, including operator-applied tags. |
| QR appointments | Each actual appointment scheduled through the QR route during the campaign window. |
| QR visits not yet scheduled | QR scans minus QR appointments. This is the current `QR Visit` group, after scheduled people have been moved out. |
| QR Shows | Unique customers who check in with their QR code and receive either the `QR Show` or `QR Check In` tag. |
| AI Booked Appointments | Each actual appointment marked with the `AI Booked Appointment` tag. This has its own Canvas module. |

Every fifteen minutes, the dashboard also reads the current ABC Test tags. This means an operator’s manual tag change is included without waiting for a workflow. A repeat tag or workflow run for the same person and campaign will not inflate a tag-based count. If the future workflow sends the same source with a confirmed appointment reference, that confirmed appointment takes priority over the same person’s manual tag entry. The dashboard stores only the minimum information needed for the total: the campaign, source, timestamp, and a protected one-way contact reference. It will not place customer names, phone numbers, appointment details, API keys, or other protected information in Slack.

## Appointment-source choices

Two approaches can produce the remaining appointment totals. Each preserves the current Production Canvas and live Slack relays.

| Approach | Tradeoffs | Cost | Setup complexity |
| --- | --- | --- | --- |
| **Tags only** | Adds a source tag for each appointment route, and the dashboard counts currently tagged people. It is quicker, but a tag does not show when it was applied. To obey the exact seven-day-to-archive period, tags must be cleared at the right time and one person can be counted only once. | No additional service cost. | Lower. |
| **Timestamped activity records** | The appropriate GoHighLevel workflow keeps its normal source tag and sends a small, protected notice to the relay at the moment the source is known. The relay saves the time and counts only records within this campaign’s exact window. It remains accurate even when operating tags are removed or later reused. | No additional service cost. | Moderate; one small workflow step per source. |

## Recommended tracking rules to configure in ABC Test

The following rules make the five figures clear and prevent double-counting. The final source names will be confirmed before any live workflow is changed.

| Dashboard figure | Trigger to use | Initial source label | Double-count protection |
| --- | --- | --- | --- |
| QR scans | QR funnel visit adds `QR Visit` | QR Visit | One person is counted once per campaign. |
| QR appointments | A QR visitor books an appointment | QR Appointment | Add `QR Appointment`, remove `QR Visit`, and record the appointment once. |
| Phone appointments | Appointment is set by the incoming-call process | phone | Count the currently tagged person once; a later confirmed appointment record takes priority. |
| SMS appointments | Appointment is set from the SMS conversation or SMS workflow | sms | Count the currently tagged person once; a later confirmed appointment record takes priority. |
| Facebook appointments | Appointment is set from the OneClick / Facebook path | 1click | Count the currently tagged person once; a later confirmed appointment record takes priority. |
| QR shows | Customer checks in using a QR code | QR Show or QR Check In | Count the customer once even if either interchangeable tag is applied more than once. |
| AI Booked Appointments | An appointment receives `AI Booked Appointment` | AI Booked Appointment | Record one appointment only when the confirmed AI appointment workflow applies that tag. |

The source workflows will be set so one scheduled appointment has one source. If a customer is rescheduled, the default proposal is to retain the original source and avoid adding another appointment count. A different rule can be used if ADO instead wants every new booking attempt counted.

## What will be built

The ABC Test implementation will add an Activity Dashboard record to the relay, a separate Slack Canvas titled **Activity Dashboard**, safe Canvas updates, a managed fifteen-minute refresh, and short activity notices from the tested workflows. Slack displays the Canvas title itself, so the Canvas page will not repeat that title as a second heading. The Canvas will show the campaign window, current totals, which source labels are active, the QR Shows section at the bottom, and its last update time.

The dashboard will use the linked dealership connection only on the server. It will fail safely if it cannot identify exactly one matching active campaign. It will never create a duplicate Production Canvas, alter a Production record, change Event Start or Event End, archive a channel, alter a proof-stage relay, or touch the separate OfficeAtHand / call-center work.

After ABC Test proves the figures and the separate Canvas visually, the instructions will be added to **Manus Keys and Codes** and the secret-free source, tests, database update, and instructions will be backed up to the company GitHub recovery branch.

## Decisions still needed

The user confirmed that appointment totals mean **every newly booked appointment** when an exact appointment reference is available. In the meantime, operator-applied and workflow-applied tags are counted once per person per source: `phone`, `sms`, `1click`, and `AI Booked Appointment`. A future confirmed appointment-record notice takes priority for the same person and source.

## Sources

[1] [Slack developer documentation: `canvases.create`](https://docs.slack.dev/reference/methods/canvases.create)

[2] [Slack help: Add and manage tabs in channels and direct messages](https://slack.com/help/articles/32562841868307-Add-and-manage-tabs-in-channels-and-direct-messages)

[3] [GoHighLevel help: Customer Booked Appointment workflow trigger](https://help.gohighlevel.com/support/solutions/articles/155000002675-workflow-trigger-customer-booked-appointment)

[4] [GoHighLevel help: Add Contact Tag workflow action](https://help.gohighlevel.com/support/solutions/articles/155000003111-workflow-action-add-contact-tag)

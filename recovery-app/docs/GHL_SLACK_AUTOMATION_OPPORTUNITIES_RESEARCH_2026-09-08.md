# GoHighLevel–Slack Automation Opportunities — Research Notes

## Current platform capabilities confirmed

HighLevel’s Slack Premium action can send a workflow message to an assigned user, custom-email-matched user, internal user, named Slack user, public channel, or private channel. It is a paid per-execution feature beyond its included allowance. Private-channel messages appear as the user who configured the integration rather than the bot.

HighLevel supports workflow triggers for appointment status changes, customer replies, task events, contact changes, opportunity changes, stale opportunities, forms, call details, messaging errors, reviews, and scheduled contactless operations. Appointment workflows can be filtered by status, calendar, calendar group, tag, and modifier. Opportunity Changed can filter for assignment, stage, pipeline, value, status, lost reason, and selected custom-field changes.

## Practical implication for ADO

Use a direct native Slack message for simple, per-subaccount notifications where cost and formatting are acceptable. Use the existing ADO relay for agency-wide coordination, campaign-channel routing, richer formatting, protected cross-subaccount lookup, channel lifecycle controls, deduplication, and audits.

## Sources

1. HighLevel, *Guide to Slack Workflow Action*, modified March 24, 2025.
2. HighLevel, *Workflow Trigger – Appointment Status*, modified April 6, 2026.
3. HighLevel, *Workflow Trigger – Opportunity Changed*, modified May 9, 2026.
4. HighLevel, *A List of Workflow Triggers*, modified June 19, 2026.
5. HighLevel, *Workflow Trigger – Scheduler*, modified November 5, 2025.

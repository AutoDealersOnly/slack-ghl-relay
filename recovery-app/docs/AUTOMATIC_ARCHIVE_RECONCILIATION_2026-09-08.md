# Automatic Slack Archive Repair — September 8, 2026

## What failed

The normal archive callback and Slack archive operation were healthy. The gap was that active campaign channels present during the service disruption had never reached the restored **Create Slack Channel** or Production-update receiver. Therefore, they had no `relay_campaigns` record and no associated warning or archive task. There was no scheduled job available to archive them.

## Repair now in place

The ordinary rule remains unchanged: a campaign channel is scheduled to archive **three calendar days after the ADO Production record’s Event End date**.

In addition, a platform-managed daily reconciliation runs at **00:10 UTC**. It reads current active campaign channels and matches them only to an exactly normalized ADO Production record. Its actions are deliberately limited:

| Condition | Daily reconciliation action |
|---|---|
| A current exact Production match has a future archive date but no valid archive schedule | Restores the normal warning and archive schedules. |
| A current exact Production match is already overdue | Records it for a separate user-approved catch-up list; it does **not** archive it automatically. |
| No exact Production match, no Event End, an archived/cancelled campaign, or an ambiguous exact match | Skips it and records the safe reason. |

The precise-match safeguard prevents a partial historical search result from becoming an archive decision. A potential ambiguous matching result is rejected rather than silently selecting a record.

## Verification

A short-lived live test ran successfully on September 8. It inspected 29 active campaign channels, restored four future schedules, flagged nine overdue records for approval, and archived no channel. The temporary test schedule was removed. The permanent daily schedule is active.

## Approved overdue catch-up

After the user reviewed the list and confirmed the ADO Production `event_end` values as authoritative, the following channels were archived and then read-only verified as archived:

| Channel | Event End |
|---|---:|
| `#2606-beaver-mitsubishi-p` | July 22, 2026 |
| `#2608-brandon-hyundai-ame` | August 30, 2026 |
| `#2608-ford-port-richey-ame` | August 30, 2026 |
| `#2608-genesis-tampa-ame-2` | August 30, 2026 |
| `#2608-toyota-tampa-ame` | August 30, 2026 |
| `#2607-hill-nissan-sm` | August 31, 2026 |
| `#2608-fayetteville-kia-sd` | September 5, 2026 |
| `#2608-garvey-hyundai-p` | September 5, 2026 |
| `#2608-garvey-nissan-p` | September 5, 2026 |

The initial Beaver Mitsubishi archive response showed that the bot was not a member of that public channel. The approved retry joined the channel, archived it, and posted the required supplemental confirmation. A GHL New Subaccounts confirmation named the successfully archived channels. No record or channel outside the approved list was changed.

## Future recovery and adjustment procedure

When restoring this function, deploy the application before creating or editing the daily platform schedule. Restore the durable daily job record with the schedule’s platform task identifier. Verify its callback first with a short-lived test that cannot archive a real channel. Remove that test schedule immediately after success.

For an overdue backlog, run the reconciliation first, present its channel list with the Event End values, and obtain explicit user approval before archiving. The daily task is intentionally not a bulk automatic catch-up tool.

Protected Slack, GoHighLevel, and schedule identifiers remain in the private recovery vault; they are not stored in this guide.

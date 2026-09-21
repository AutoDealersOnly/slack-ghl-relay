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

## Archive warning and keeping one channel open

The scheduled warning sent in the campaign channel is exactly:

> This channel is scheduled to archive tomorrow. Contact admin if the campaign needs to remain open.

There is no "operations channel" reply path and no Slack reply command that cancels an archive. When a campaign must remain open, an ADO administrator must identify the campaign channel and cancel **only its matching pending archive job**. The administrator then clears that campaign’s saved archive and warning-job references and marks its archive status as cancelled. This does not change the Event End date or any other campaign’s schedule.

On September 14, 2026, the pending ABC Test archive job was cancelled at the administrator’s request. Its saved archive and warning-job references were cleared, and no channel was archived or otherwise changed.

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

Protected Slack, GoHighLevel, and schedule identifiers remain in the Manus Keys and Codes; they are not stored in this guide.

## Emergency global pause — September 20, 2026

At David’s direction, every pending campaign archive and warning job was removed and the daily reconciliation job was paused. This stops all automatic Slack archive and warning activity while the schedule behavior is reviewed. The relay now treats that paused daily job as a global safety switch: it will not create a new archive or warning job while paused, and a surviving scheduled callback will safely exit without archiving or warning a channel.

The immediate investigation found a next-event Sun Toyota record whose Event Start date is in October while its Event End date is in September. The relay had therefore calculated an archive for the following day. The Production record’s dates were not edited during the emergency stop. Do not resume automatic archiving until the date inconsistency and the requested weekend-pausing rule have been reviewed and tested in ABC Test.

## Normal operation restored — September 21, 2026

David corrected the Sun Toyota Event End date and confirmed that the prior archive rule should resume without a new weekend or date rule. The daily reconciliation registration was re-enabled. A one-time normal reconciliation then inspected 23 current active channels, restored 15 future archive schedules, recorded one overdue channel for separate approval, skipped seven safe cases, and archived no channel. The two Sun Toyota Production records were read-only checked: the September campaign retains its September dates, and the October campaign now has matching October dates.

The ABC Test command verification created an archive entry only because its historical Event End date is already past. That ABC-only entry was immediately cancelled; no live campaign schedule was changed by the verification. The normal daily reconciliation continues to skip overdue campaigns for approval rather than archiving them automatically.

## Eastern-time weekend hold — September 21, 2026

At David’s direction, **no automatic archive activity is permitted on Saturday or Sunday in Eastern time**. The ordinary three-calendar-day rule still determines the first planned archive date, but a date that falls on Saturday or Sunday automatically moves to Monday. If that move makes the archive date Monday, its warning is sent on Friday and says that the channel is scheduled to archive on Monday.

This rule applies to all three automatic paths: the channel archive itself, its warning message, and the daily schedule-rebuild check. As a second safeguard, a callback that somehow reaches the relay on an Eastern-time weekend exits without archiving, posting a warning, or rebuilding schedules.

Immediately after the rule was added, all 15 pending campaign archive records were reviewed and updated. The 32 active pending archive and warning jobs were checked afterward: none is scheduled for an Eastern-time Saturday or Sunday. No channel was archived, no Production record was changed, and no campaign date was edited during this update.

# 📖 How To — Slack & GHL Automations

This canvas explains every automation we have set up between Slack and GHL (GoHighLevel). Read this if something isn't working, if you're new to the team, or if you just want to understand how it all fits together.

---

## 1. Create Slack Channel (Automatic)

**What it does:**
When a Production record in GHL has its Deal Stage changed to **"Production"**, a new Slack channel is automatically created for that campaign. You do not need to do anything manually.

**What gets created automatically:**
- A new Slack channel named after the production record (e.g. `#2607-westshore-honda-ame`)
- A Production Canvas inside the channel with all the campaign details pulled from GHL
- The **@deals** user group is invited to the channel
- **David** and **Brian Shaw** are added to the channel automatically

**What triggers it:**
A GHL workflow called **"Create Slack Channel"** watches for any Production record where the Deal Stage changes to "Production" and sends the production name to our relay app.

**What to do if the channel wasn't created:**
1. Check that the GHL workflow "Create Slack Channel" is published and active
2. Make sure the Production record's name does not contain special characters (apostrophes, slashes, etc.)
3. Check `#ghl-new-subaccounts` — the relay app posts a message there every time a channel is created or if it fails

---

## 2. Push Campaign Custom Values (Automatic)

**What it does:**
When a Production record's Deal Stage changes to **"Live Active"**, the relay app automatically pushes campaign information into the dealership's subaccount custom values in GHL. This means the subaccount's email/SMS templates automatically have the correct campaign dates, coordinator name, and other details without anyone having to type them in manually.

**What gets updated in the subaccount:**

| Custom Value | What it contains | Example |
|---|---|---|
| `campaign_dates` | Full date range of the campaign | July 14–16 |
| `campaign_start_date` | First day of the campaign | July 14 |
| `campaign_end_date` | Last day of the campaign | July 16 |
| `kbb_ed` | Month of the campaign (for KBB/ED templates) | July |
| `ask_for` | Staff members to ask for at the dealership | Closer, Greeter |
| `event_coordinator` | Same as ask_for | Closer, Greeter |

**What triggers it:**
A GHL workflow called **"Push Campaign Values"** watches for any Production record where the Deal Stage changes to "Live Active."

**What to do if the values weren't updated:**
1. Check that the GHL workflow "Push Campaign Values" is published and active
2. Confirm the Production record has a linked dealership subaccount
3. Check `#ghl-new-subaccounts` for any error messages from the relay app

---

## 3. Auto-Archive Slack Channels (Automatic)

**What it does:**
Every Slack campaign channel is automatically archived 3 days after the campaign's end date. You do not need to archive channels manually.

**How it works step by step:**
1. When the Slack channel is created (see Section 1), the relay app reads the `event_end` date from the GHL Production record
2. It calculates: archive date = event_end + 3 days
3. It schedules two automatic jobs:
   - **Day before archive:** A warning message is posted inside the channel so anyone still active in it knows it's about to close
   - **Archive day:** The channel is archived at noon UTC

**The warning message looks like this:**
> ⚠️ Heads up! This channel will be automatically archived by GHL tomorrow (2026-07-22). The campaign has ended. If you need to keep this channel open, please contact an admin.

**What to do if a channel wasn't archived on time:**
1. Check the Manus Schedules panel — the heartbeat job for that channel should appear there
2. If the campaign had no end date in GHL when the channel was created, no archive job was scheduled — the channel will stay open until manually archived or until the end date is added and a new channel is created

---

## 4. Cancel an Auto-Archive

**What it does:**
If a campaign is cancelled before its end date and you don't want the channel to be archived automatically, you can cancel the archive job. The channel will stay open indefinitely.

**How to cancel an archive:**
Send a webhook call to the relay app with the production name. You can do this from a GHL workflow or by calling the URL directly.

**Webhook details:**
- URL: `https://slackrelay-67pts7pe.manus.space/slack/cancel-archive`
- Method: POST
- Body:
```
{"production_name": "2607-westshore-honda-ame"}
```

**What happens when you cancel:**
- The archive heartbeat job is disabled
- The warning heartbeat job is disabled
- A message is posted to `#ghl-new-subaccounts` confirming the cancellation
- The Archive Schedule Canvas on this channel is updated to remove the channel

**Note:** Cancelling an archive does not unarchive a channel that has already been archived. If a channel was archived by mistake, it must be unarchived manually in Slack (Settings → Manage → Archived Channels).

---

## 5. Archive Schedule Canvas (This Channel)

**What it does:**
There is a canvas pinned to this channel (`#ghl-new-subaccounts`) called **📅 Upcoming Channel Archives**. It shows a live list of all Slack campaign channels that are scheduled to be archived, sorted by date.

**How to read it:**

| Column | What it means |
|---|---|
| Channel | The Slack channel name |
| Archive Date | The date the channel will be archived (campaign end + 3 days) |
| Days Until Archive | How many days until the archive happens |

**When it updates:**
The canvas automatically refreshes every time a channel is archived or an archive is cancelled. You can also force a refresh at any time by calling:
- URL: `https://slackrelay-67pts7pe.manus.space/slack/refresh-archive-canvas`
- Method: POST
- Body: `{}`

---

## 6. Proof Stage Canvas Update (Automatic)

**What it does:**
When a Production record's Proof Stage is updated in GHL, the Production Canvas inside the corresponding Slack channel is automatically updated to reflect the new proof status.

**What triggers it:**
The GHL webhook sends a proof status update to the relay app, which finds the correct Slack channel and updates the canvas in place. It does not create a new canvas — it updates the existing one.

**What to do if the canvas wasn't updated:**
1. Make sure the Slack channel name matches the Production record name exactly (same naming convention)
2. Check `#ghl-new-subaccounts` for error messages
3. If the canvas was deleted and recreated manually, the relay app may have lost track of the canvas ID — run `/ghl` in the channel to re-link it

---

## 7. Backfill Tools (Admin Use Only)

These are tools used to catch up channels that were created before the automations existed, or to fix missing jobs. You should only need these if something went wrong or if new automations were added to existing channels.

**Backfill Archive Jobs** — schedules archive heartbeat jobs for channels that don't have one yet
- URL: `https://slackrelay-67pts7pe.manus.space/slack/backfill-archive-jobs`
- Method: POST
- Body: `{"channels": ["2607-westshore-honda-ame", "2607-sun-toyota-ame"]}` (list of channel names)

**Backfill Warning Jobs** — schedules the day-before warning heartbeat for channels that already have an archive job but no warning job
- URL: `https://slackrelay-67pts7pe.manus.space/slack/backfill-warning-jobs`
- Method: POST
- Body: `{}` (processes all pending archive jobs automatically)

**Results:** Both backfill tools post a summary to `#ghl-new-subaccounts` when they finish, showing which channels were scheduled and which were skipped.

---

## Quick Reference — All Webhook URLs

| What it does | URL | Trigger |
|---|---|---|
| Create Slack channel | `/slack/create-channel` | GHL: Deal Stage → Production |
| Push campaign custom values | `/slack/push-campaign-values` | GHL: Deal Stage → Live Active |
| Archive a channel (heartbeat) | `/api/scheduled/archive-channel` | Automatic (heartbeat) |
| Warn before archive (heartbeat) | `/api/scheduled/warn-channel-archive` | Automatic (heartbeat) |
| Cancel an archive | `/slack/cancel-archive` | Manual or GHL workflow |
| Refresh archive canvas | `/slack/refresh-archive-canvas` | Manual |
| Backfill archive jobs | `/slack/backfill-archive-jobs` | Manual (admin only) |
| Backfill warning jobs | `/slack/backfill-warning-jobs` | Manual (admin only) |

All URLs are prefixed with: `https://slackrelay-67pts7pe.manus.space`

---

*Last updated: July 2026 — maintained by the ADO automation team*

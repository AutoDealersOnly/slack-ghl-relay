# Slack → Make Relay TODO

- [x] POST /slack/events route with Slack URL verification challenge handler
- [x] Forward member_joined_channel events to Make webhook
- [x] Validate Slack request signatures (reject invalid with 401)
- [x] Root route GET / with minimal health indicator
- [x] Slack signing secret injected via environment variable
- [x] Build /slack/ghl endpoint — calls GHL directly, creates Slack canvas (bypasses Make entirely)
- [x] Update Slack app slash command URL to permanent production URL after publish
- [x] Add canvas_log DB table to store channelId → canvasId mappings
- [x] /slack/ghl saves canvas_id to DB after creation
- [x] Build /slack/ghl-webhook endpoint for GHL workflow auto-update trigger
- [x] Set up GHL Production workflow to call /slack/ghl-webhook on record update
- [x] Switch canvas update to in-place edit (canvases.edit) to eliminate ghost Deleted file tabs
- [x] Add /slack/push-campaign-values endpoint — push campaign dates, ask_for, event_coordinator, kbb_ed to subaccount custom values when Production status → "production"
- [x] Add /slack/create-channel endpoint — auto-create Slack channel + canvas when Production status → "production"
- [x] Add channel_archive_jobs DB table to store channelId, channelName, archiveAfter date, taskUid
- [x] Add /api/scheduled/archive-channel endpoint — archives channel when called by heartbeat job
- [x] Schedule heartbeat job per channel to fire 3 days after campaign end date

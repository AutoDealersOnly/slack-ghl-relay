# Slack → Make Relay TODO

- [x] POST /slack/events route with Slack URL verification challenge handler
- [x] Forward member_joined_channel events to Make webhook
- [x] Validate Slack request signatures (reject invalid with 401)
- [x] Root route GET / with minimal health indicator
- [x] Slack signing secret injected via environment variable
- [x] Build /slack/ghl endpoint — calls GHL directly, creates Slack canvas (bypasses Make entirely)
- [ ] Update Slack app slash command URL to permanent production URL after publish

# Slack Super Admin Control — Capability Notes

## Supported approach

Slack Block Kit messages can contain interactive buttons and menus. For an individual archive hold, the relay can post a private **Super Admin** channel message listing an upcoming archive and a single **Keep Open** button. Slack sends button clicks to the app’s configured Interactivity Request URL as a form-encoded `payload`; the relay must verify the request signature and acknowledge it within three seconds. [1] [2]

The action handler must re-check the signed Slack request, the clicking administrator’s protected Slack member authorization, and the exact pending campaign schedule before cancelling only that campaign’s archive job. It must not accept a campaign name, schedule identifier, or administrator identity solely from a button value. The action should update the original bot message to show that the selected channel is being kept open. Slack supports updating a bot-authored message with `chat.update` using the existing `chat:write` scope. [1] [3]

## Recommended first version

Use one private channel named **Super Admin** rather than a Canvas as the first control surface. It keeps actions visible to the authorized administrators and works with the current bot’s message capability. No existing production message, canvas, channel-creation flow, or archive timing needs to change. A later App Home dashboard is possible but requires enabling the app’s Home tab and publishing individual per-user views; it is not needed for the first archive-control use case. [4]

## Required app-setting change before live controls

The existing Slack app must have **Interactivity** enabled and its single **Request URL** set to the published relay’s dedicated interaction endpoint. This must be done only with explicit administrator approval. It is an app setting, not a token replacement or a Slack scope change. The endpoint will use the existing protected signing secret; no secret belongs in source control, messages, or documentation. [1] [2]

## References

[1]: https://docs.slack.dev/interactivity/handling-user-interaction "Handling user interaction in Slack apps"
[2]: https://docs.slack.dev/authentication/verifying-requests-from-slack "Verifying requests from Slack"
[3]: https://docs.slack.dev/reference/methods/chat.update "Slack chat.update method"
[4]: https://docs.slack.dev/surfaces/app-home "Slack App Home"

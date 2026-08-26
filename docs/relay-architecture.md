# ADO GHL–Slack Relay Recovery Architecture

The relay will be a private internal service. GoHighLevel workflows will send only the minimum event details needed to the relay, together with a shared authorization value placed in the request header. The relay will reject a request that does not present the correct value before it reads a campaign record, updates a dealer subaccount, or sends anything to Slack.

The relay will hold campaign-channel and canvas links in its own database. It will also keep a safe action history, archive schedule information, and duplicate-detection records. This allows a canvas update, cancellation, archive warning, or re-scheduled archive to survive a restart without relying on a conversation history or a manually maintained spreadsheet.

All real credentials and workspace identifiers will be supplied as protected server-side settings. The internal status page will report only whether each required setting is configured; it will never show the setting value. GitHub will contain a setting-name template and recovery instructions, never keys, tokens, direct automation webhook addresses, or Slack identifiers that are not meant to be public.

Archive warnings and final archive actions will use authenticated platform-managed scheduled callbacks. Each job will be linked to the campaign record by its scheduler-issued identifier. A callback will look up the campaign by that identifier, which prevents a request body from choosing a different campaign or channel.

## External Platform Requirements

GoHighLevel’s Custom Webhook workflow action supports POST requests with custom headers and JSON payloads. The rebuilt GHL workflows will use a dedicated header containing the relay’s shared secret rather than placing an authorization value in a URL. Official guidance also supports testing workflow webhooks before publishing. [1]

Slack canvases can be created or updated using Markdown content, and a channel canvas requires the `canvases:write` permission. The relay’s Slack app must also have the permissions needed for messages, channel creation, membership management, and channel archiving before the live test. [2]

Slack signs its own incoming requests using the app signing secret. The relay will use that signing secret only for genuine Slack-originated requests. GHL-originated requests will use their separate shared-secret header. [3]

## References

[1]: https://help.gohighlevel.com/support/solutions/articles/155000003305-workflow-action-custom-webhook "HighLevel — Workflow Action: Custom Webhook"
[2]: https://docs.slack.dev/reference/methods/conversations.canvases.create "Slack Developer Docs — conversations.canvases.create"
[3]: https://docs.slack.dev/authentication/verifying-requests-from-slack "Slack Developer Docs — Verifying requests from Slack"

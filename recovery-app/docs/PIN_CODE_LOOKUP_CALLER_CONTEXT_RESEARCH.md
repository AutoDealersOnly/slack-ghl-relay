# PIN Code Lookup: Caller-Phone Detection Research

## Documented custom-menu context

HighLevel documents that embedded custom pages and custom-menu URLs receive user, location, location-owner, and custom-value variables. The supported list includes `{{location.id}}`, which supports the universal PIN Code Lookup design, but it does **not** list an active call, conversation, contact, or caller-phone value.[1]

HighLevel also documents that custom pages are externally hosted iframes and may request camera or microphone permissions. That permission is for the page’s own media capture; it is not documented as access to HighLevel’s active-call state or caller ID.[1]

## Initial conclusion

The standard custom-menu link cannot be assumed to know the incoming caller’s phone number. The documented custom-page context has no active-call or caller-phone variable.[1] HighLevel’s documented call-log endpoint is specifically for **Voice AI agent** calls, rather than the general live inbound call occurring in the existing dealership phone workflow.[2]

HighLevel’s documented Call Provider module is also not a live-call bridge: it is for recording inbound or outbound call logs in Conversations and explicitly does not replace the voice/SIP connection.[3] It therefore does not supply a reliable “current caller” value to this page without replacing or separately integrating the phone provider—an out-of-scope change to the current call workflow.

The recovered PIN lookup must not display a misleading **Detect Phone Number** button. The present manual PIN, phone, and name searches remain the reliable baseline.

## Next research step

If the company later adopts an approved call provider with a signed inbound-call webhook, a separate project could securely retain the latest caller number for the specific subaccount and operator. That would require an explicit design decision, a new protected connection, privacy review, and ABC Dealer testing; it should not be added to this recovery task automatically.

## References

[1]: https://marketplace.gohighlevel.com/docs/marketplace-modules/CustomPages/ "HighLevel API: Custom Pages"
[2]: https://marketplace.gohighlevel.com/docs/ghl/voice-ai/get-call-logs/ "HighLevel API: List Voice AI Call Logs"
[3]: https://marketplace.gohighlevel.com/docs/marketplace-modules/ConversationProviders/ "HighLevel API: Conversation Providers"

## Opportunity visibility research — August 27, 2026

HighLevel's documented contact response does not guarantee that associated opportunities are included. The supported read-only alternative is `GET /opportunities/search` with both the active `locationId` and the exact selected `contactId` query parameters.[4] The endpoint requires the subaccount's Private Integration token to have the `opportunities.readonly` scope.[4]

The existing ABC connection successfully reads and updates contacts, but HighLevel returned an authorization response to the opportunity-pipeline endpoint. This is consistent with the opportunity permission not being available to the current PIN-tool connection, although the response alone does not justify changing a working key or any account setting. The next safe action is a server-only, read-only call to the documented exact-contact endpoint and then, only if HighLevel again rejects it, to request the user's approval to review the existing Private Integration's opportunity-read scope.

[4]: https://marketplace.gohighlevel.com/docs/ghl/opportunities/search-opportunity/ "HighLevel API: Search Opportunity"

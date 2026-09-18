# OfficeAtHand / RingCentral Active-Call Research

**Purpose:** Record the provider-verified design facts for the separate active-call PIN Lookup test. This record contains no account details, identifiers, or credentials.

RingCentral’s current documentation states that **Telephony Session Notifications** can report call-state changes at an account or extension level. Their notification payload includes a unique session identifier, the call direction, party state, caller (`from.phoneNumber`), and callee (`to.phoneNumber`). This supports the planned active-call board: use the caller number to look up a customer and the dialed tracking number to identify the correct dealership context. [1] [2]

The provider’s documentation says its `CallControl` permission is required to receive Telephony Session Notifications. For the ADO test design, this permission is used only for incoming event visibility; the application must not include any endpoint, UI control, or workflow that answers, hangs up, transfers, holds, routes, records, or otherwise changes calls. Event delivery also requires a webhook subscription. [1] [2]

The isolated test app must remain private. The existing production PIN Code Lookup page, existing GHL custom-menu link, tracking numbers, OfficeAtHand/RingCentral numbers, queues, call handling, recordings, users, and routing are out of scope and must not be changed. The first implementation is limited to a separate test route, protected authorization return, read-only active-call display, and operator-selected handoff into the current PIN/customer lookup logic. Appointment and opportunity writes remain deferred pending a separate approval and GoHighLevel permission review.

For the separate test, use the account-level event filter `/restapi/v1.0/account/{accountId}/telephony/sessions` with the documented `direction=Inbound`, `phoneNumber`, and `statusCode` query parameters. RingCentral supports a `phoneNumber` filter in E.164 form, allowing the ABC test subscription to receive only calls to one approved ABC dealership tracking number rather than account-wide calls. Separate filters are required for `Setup`, `Proceeding`, `Answered`, and `Disconnected` status notifications. The provider reports the caller number, dialed number, party state, and session identifiers in these events. No session-control endpoint or UI action is permitted in the test implementation. [2]

RingCentral validates a webhook address before subscription creation. The receiver must use TLS, return HTTP 200 within three seconds, echo the supplied `Validation-Token` header, and keep its response under 1024 bytes. It must reject events that do not carry the configured validation token, retain only the minimum active-call details needed for the test display, and return immediately. [3] [4]

RingCentral allows up to 30 subscriptions per user or extension for an application and supports subscription expiration settings. Although much longer subscriptions are possible, this test is deliberately one inbound-only ABC tracking-number subscription that expires after one hour and has no automatic renewal. The provider filter contains only the selected tracking number(s) in E.164 form and the inbound `Setup`, `Proceeding`, `Answered`, and `Disconnected` states. [2] [3]

During the approved ABC setup attempt, RingCentral safely rejected the receiver validation token before creating any subscription. Its standard response identified the required correction: the supplied URL-safe encoded token format was not accepted for `deliveryMode.verificationToken`. The receiver now derives a 32-character hexadecimal HMAC fragment for this provider field and still verifies the exact same value on incoming events. No call subscription, call data, or phone-system configuration changed during this diagnosis.

## References

[1] [RingCentral, “Telephony Session Notifications,” updated June 29, 2026](https://developers.ringcentral.com/guide/voice/telephony-session-notifications)

[2] [RingCentral, “Account Telephony Sessions Event,” updated June 29, 2026](https://developers.ringcentral.com/guide/notifications/event-filters/account-telephony-sessions)

[3] [RingCentral, “Creating Webhooks,” updated June 29, 2026](https://developers.ringcentral.com/guide/notifications/webhooks/creating-webhooks)

[4] [RingCentral, “Receiving Webhooks,” updated June 29, 2026](https://developers.ringcentral.com/guide/notifications/webhooks/receiving)

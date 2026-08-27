# ABC Relay Diagnosis

## Verified ADO Context

The connected ADO GoHighLevel session identifies the ADO subaccount location as `UGJmliC4GETAgeO6IDXa`. A safe local check confirmed that the recovery relay’s protected `GHL_LOCATION_ID` matches this ADO location. The location value is not shown in the recovery status page.

## Preserved Relay Behavior

The original relay handled Slack’s `/ghl` command at `/slack/ghl`. It immediately acknowledged Slack, joined the current channel with `conversations.join`, looked up the ADO Production record at `objects/custom_objects.production/records/search`, optionally loaded the related Dealership record from `objects/custom_objects.dealerships/records/:recordId`, and created or refreshed a Production Canvas. If the lookup did not return a record, it still created a Canvas containing the original no-record-found fallback.

## Current Test Findings

The published recovery relay now receives the `/ghl` command, joins the ABC test channel, and creates the Production Canvas. The remaining gap is data retrieval: the Canvas shows the preserved no-record-found fallback because the GoHighLevel custom-object request returns HTTP 401.

The recovery must not treat the user-confirmed fresh full-scope ADO API key as invalid or request a replacement. Current official GoHighLevel object-record documentation identifies `2021-07-28` as the current date-based request version for private-integration tokens, while the preserved relay used the legacy `v3` header. The recovery now retains the preserved custom-object paths and payloads while using `2021-07-28` for the Production and Dealership retrieval requests. The next ABC `/ghl` run will validate this narrow request-header correction.

## External Sources

- [GoHighLevel: Search Object Records](https://marketplace.gohighlevel.com/docs/ghl/objects/search-object-records/)
- [LeadConnector: Search Object Records](https://marketplace.leadconnectorhq.com/docs/leadconnector/objects/search-object-records)

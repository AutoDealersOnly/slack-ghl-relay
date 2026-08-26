# Rebuilt GHL Workflow Map

This table is the operational inventory for rebuilding the GHL workflows. It is intentionally safe to store in GitHub: it includes paths, event names, and field names but no relay address, token, key, header value, or Slack identifier.

| Workflow name | Trigger | Filter | Protected relay event | Expected outcome |
|---|---|---|---|---|
| GHL Production Message to Slack | Production Changed | Proof Stage has changed | `proof_status` | A mapped proof-stage message is posted in the linked campaign channel. |
| GHL Production Channel Creation | Production Changed | Production stage reaches its approved campaign-ready value | `create_channel` | A channel is created or recovered, members are invited, the Production Canvas is built, and an archive pair is scheduled. |
| GHL Production Canvas Update | Production Changed | A Canvas-relevant field changes | `production_update` | The existing Production Canvas updates in place; a missing channel is safely rebuilt. |
| GHL Dealership Value Sync | Dealership Changed | Verified reaches the approved value | `dealership_sync` | Dealer details update in the related dealership subaccount using the API key held only on that Dealership record. |
| GHL Campaign Value Sync | Production Changed | Campaign-ready production stage | `push_campaign_values` | Campaign date and team fields sync to the linked dealership subaccount. |
| GHL Campaign Archive Cancel | Production Changed | Campaign is cancelled or held open | `cancel_archive` | Scheduled warning and archive jobs are cancelled. |
| GHL Campaign Archive Reschedule | Production Changed | Event end date changes | `reschedule_archive` | Existing scheduled jobs are replaced using the new end date. |

## Standard Custom Webhook configuration

Every row above uses `POST`, `application/json`, and the same Authorization header. The relay paths follow this pattern after the deployed base address:

```text
/api/relay/ghl/<protected relay event>
```

At minimum, send:

```json
{
  "production_name": "{{custom_objects.production.production}}",
  "proof_stage": "{{custom_objects.production.proof_stage}}"
}
```

The proof-stage field is needed only for `proof_status`; other events can send just the production name. The relay fetches fresh source data from ADO rather than trusting an old workflow snapshot.

## Slack `/ghl` recovery command

The Slack app's `/ghl` command has a separate signed endpoint. It links the **existing** channel in which the command is run to the matching ADO Production record, refreshes that channel's Production Canvas, and records the channel/Canvas relationship. It does not create a second campaign channel.

```text
/api/slack/commands/ghl
```

# Rebuilt GHL Workflow Map

This table is the operational inventory for rebuilding the GHL workflows. It is intentionally safe to store in GitHub: it includes paths, event names, and field names but no relay address, token, key, header value, or Slack identifier.

| Workflow name | Trigger | Filter | Protected relay event | Expected outcome |
|---|---|---|---|---|
| GHL Production Message to Slack | Production Changed | Proof Stage has changed | `proof_status` | A mapped proof-stage message is posted in the linked campaign channel. The restored route accepts the former headerless Custom Webhook payload and directs it to the proof-message handler—not Canvas refresh—while protected deliveries continue to require the shared secret. |
| Create Slack Channel | Production Changed | Production stage reaches its approved campaign-ready value | `create_channel` | A channel is created or recovered, members are invited, the Production Canvas is built, and an archive pair is scheduled. |
| Production Update GHL to Slack | Production Changed | Current configured field-change triggers | `production_update` | The existing Production Canvas updates in place for configured Production updates; a missing channel is safely rebuilt. |
| GHL Dealership Value Sync | Dealership Changed | Verified reaches the approved value | `dealership_sync` | Dealer details update in the related dealership subaccount using the API key held only on that Dealership record. |
| GHL Campaign Value Sync | Production Changed | Campaign-ready production stage | `push_campaign_values` | Campaign date and team fields sync to the linked dealership subaccount. |
| GHL Campaign Archive Cancel | Production Changed | Campaign is cancelled or held open | `cancel_archive` | Scheduled warning and archive jobs are cancelled. |
| Archive reschedule receiver | A separate approved event-end update action, when configured | Event end date changes | `reschedule_archive` | Existing scheduled jobs are replaced using the new end date. |

## Legacy Production Canvas refresh connection

The existing **Production Update GHL to Slack** workflow retains its original trigger and payload. Its Custom Webhook should point to the rebuilt relay’s legacy-compatible receiver:

```text
/api/relay/ghl/production_update
```

It sends the existing `production_name` field and can optionally include `channel_name`. If the request does not match the relay’s protected shared-secret header, the route preserves the former immediate-acknowledgment Canvas-refresh behavior. A delivery that does match the protected shared secret retains the newer protected workflow behavior. In either case, the relay retrieves the current ADO Production and Dealership data itself, then edits the saved Production Canvas in place. No new workflow, trigger, header, or payload field is required for this restoration.

## Legacy Create Slack Channel connection

The existing **Create Slack Channel** workflow was visually confirmed to use the former headerless Custom Webhook contract. Its trigger, method, payload, publish state, and **Authorization: None** setting remain unchanged. Replace only its lost destination with this path after the deployed base address:

```text
/api/relay/ghl/create_channel
```

The restored receiver immediately acknowledges the workflow, then creates or reuses the linked campaign channel and Production Canvas. It reads the current Event End date and schedules the channel archive exactly three days later.

## Protected Custom Webhook configuration

Protected routes use `POST`, `application/json`, and the shared Authorization header. The relay paths follow this pattern after the deployed base address:

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

The proof-stage field is needed only for `proof_status`; other events can send just the production name. The relay fetches fresh source data from ADO rather than trusting an old workflow snapshot. The visually confirmed legacy **Create Slack Channel**, **Production Update GHL to Slack**, and **GHL Production Message to Slack** workflows keep their original headerless settings and use their documented compatibility paths.

## Slack `/ghl` recovery command

The Slack app's `/ghl` command has a separate signed endpoint. It links the **existing** channel in which the command is run to the matching ADO Production record, refreshes that channel's Production Canvas, and records the channel/Canvas relationship. It does not create a second campaign channel.

```text
/api/slack/commands/ghl
```

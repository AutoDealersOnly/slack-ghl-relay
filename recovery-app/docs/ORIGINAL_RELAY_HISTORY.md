# Recovered Original Relay History

The preserved relay repository history contains the following confirmed implementation milestones relevant to the ABC Canvas recovery.

| Commit | Recovered behavior |
|---|---|
| `d44f934` | Restored `createOrReplaceCanvas` to trust a successful Slack `canvases.edit` response and update the saved Canvas in place. An earlier section-lookup verification had falsely treated valid Canvases as deleted and created duplicates. |
| `4cd6e3e` | The original `/ghl-webhook` endpoint updated the existing Canvas in place after it received a record-change notification. The code comment described this as a workflow, but the code alone does not prove which external GoHighLevel mechanism delivered it. |
| `31edfb6` | The recovered commit message described field-change coverage for Closer, Greeter, PIN Code Ranges, and Job #. This is historical code metadata, not evidence that a current ADO workflow exists or should be created. |
| `f7af4375` | The original relay also recorded stable GHL field-change triggers, dealership sync, proof-status messages, and the Canvas timestamp footer. |
| `cc557ba` | Later additions for campaign values, automatic channel creation, and archiving were separate from the direct Canvas refresh behavior. |

The current recovery must use the original direct `canvases.edit` success behavior for repeat updates and restore the receiving behavior for Production-change notifications. The separate **GHL Production Message to Slack** proof-stage workflow must remain unchanged during this restoration.

## Read-only GoHighLevel investigation status

The ADO subaccount is available in the connected browser. A read-only API inventory returned the current ADO workflow list and did not show a Canvas-update workflow. The user has confirmed that nothing in GoHighLevel changed when the Manus site was lost: if such a workflow is absent, it did not exist. No GoHighLevel workflow, URL, trigger, filter, webhook setting, or other external configuration has been changed during this investigation.

The preserved relay code has one known automatic-refresh receiver, `/slack/ghl-webhook`, but its only runtime implementation is an inbound request handler. It contains no scheduled watcher or Make-based Production polling path. The remaining task is to identify the existing non-workflow integration that addressed that receiver before the former Manus site was lost. Do not create or alter any GoHighLevel workflow while tracing it.

The real ADO Automation page was located through the live navigation and opened read-only. At the time inspected, the page frame rendered but its workflow-list area contained no entries. No external settings were changed. The separate HighLevel API workflow-list response also omitted the user-known proof-stage workflow, so that API list cannot be treated as a complete inventory of ADO’s object-based automations.

After the page completed rendering, the live ADO Automation page showed its workflow folders, including **GHL to Slack Automations**. The next read-only step is limited to opening that existing folder and documenting what is already there. No workflow will be created, changed, published, moved, or deleted.

The folder list remains visible in the connected browser. The inspected folder was last updated June 30, 2026. No entry inside it has been opened or altered yet.

The connected browser subsequently opened **GHL to Slack Automations** read-only. HighLevel displayed its empty-state message: it contains no workflows or subfolders. This confirms the user’s statement. The existing **Production Update GHL to Slack** workflow, if it is the Canvas-refresh connection, must live elsewhere in the current ADO workflow inventory. No GoHighLevel setting was changed.

The user then opened the existing ADO workflow named **Production Update GHL to Slack**. Its browser address identifies the workflow record in the existing ADO configuration. The next change is authorized and strictly limited to replacing that workflow’s dead Custom Webhook destination; its trigger, payload, publication state, and every other workflow setting must remain untouched. The recovered handler uses the established `/api/relay/ghl/production_update` route. When the existing Custom Webhook calls it without an authorization header, the route preserves the original immediate-acknowledgment behavior; protected calls retain their existing protected behavior. No header or payload change is required.

After the user confirmed the Custom Webhook URL was updated and saved, the connected workflow builder was reopened read-only. Its page frame loaded but the workflow configuration did not render through the connected-browser reader. No additional GoHighLevel setting was changed. Final evidence therefore depends on the controlled ABC record-edit result and the user’s visual confirmation that the same Canvas refreshes in place.

# Campaign Custom-Value Sync Map

## Purpose and safety boundary

When an ADO Production record reaches **Post Production**, the relay will read the current Production record and its associated ADO Dealership record. It will then update only the approved campaign custom values in the linked dealership subaccount and post one confirmation in that campaign’s existing Slack channel.

The same relay logic is intended for every linked dealership subaccount. During restoration, the only permitted destination for a live write test is **ABC Dealer**.

## Approved value map

| Dealership custom value | Source | Required format |
|---|---|---|
| `campaign_dates` | Production Event Start and Event End | `Month DD-DD` when both dates are in one month; `Month DD-Month DD` when they cross months. |
| `campaign_start_date` | Production Event Start | `Month DD` |
| `campaign_end_date` | Production Event End | `Month DD` |
| `ask_for` | Related Dealership Alias | Full Alias |
| `alias_name` | Related Dealership Alias | Full Alias |
| `alias_1st_name` | Related Dealership Alias | First word of Alias |
| `alias_position` | Related Dealership Alias Position | Full position value |
| `kbb_ed` | Production Event Start | Month only |
| `event_coodinator` | Production Closer plus Production Greeter | Non-empty values joined with `, `. The GHL field key uses the existing `coodinator` spelling. |
| `campaign_theme` | Production Mailer and Mailer 2 | Non-empty mailpiece numbers joined with ` / `. |

## Slack confirmation

After the custom-value update completes, the relay posts this confirmation only in the existing linked campaign channel:

> GHL Campaign Custom Values have been updated in the **[Dealership]** subaccount.

It does not post a general notification, create a channel, create a Canvas, or alter archive dates.

## Existing workflow connection

The receiver accepts the same lightweight, headerless Custom Webhook pattern retained for the existing GHL workflows. It needs only the Production name in its body; the relay reads the current ADO Production and Dealership information itself. Once published, the destination to restore in the existing Post Production workflow is:

`https://ghl-slackrel-knvzqxuh.manus.space/api/relay/ghl/push_campaign_values`

The existing workflow’s trigger, method, body, headers, and other actions must remain unchanged.

## Verified ABC result

The existing **Push Campaign Custom Values** workflow was preserved. It remained published with its **Production Changed → Status is `post_production`** trigger, **POST** method, no authorization, and original lightweight `production_name` body. Only its former lost Custom Webhook address was replaced.

The user then ran a live workflow test with the ABC Production record and confirmed that the campaign updater worked correctly. The approved values updated in the linked ABC Dealer subaccount, and the confirmation posted in the linked ABC campaign Slack channel. No other dealership subaccount was used in the test. After that successful test, the user explicitly approved agency-wide activation. Each future Post Production update now targets only the dealership subaccount linked to that specific Production record.

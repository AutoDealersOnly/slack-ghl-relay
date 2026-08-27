# Dealership Object to Subaccount Custom Values

## Purpose

When an ADO Dealership record’s **Verified** value becomes `verified`, the existing GoHighLevel workflow sends that Dealership record’s ID to the relay. The relay retrieves that exact ADO Dealership record, uses its linked location and stored subaccount access, and updates only the dealership-information custom values in that one linked subaccount.

This function does not use the Production record, does not change campaign custom values, and does not create or change a Slack campaign channel.

## Confirmed workflow contract

| Item | Existing value |
|---|---|
| Workflow | **Dealership Object to Subaccount Custom Values** |
| Trigger | ADO Dealership record changes to **VERIFIED** |
| Required body fields | `record_id` and `verified` |
| Required value | `verified` must equal `verified`, ignoring upper/lower-case differences |
| Restored endpoint | `https://ghl-slackrel-knvzqxuh.manus.space/api/relay/ghl/dealership_sync` |
| Workflow action behavior | Keeps the existing POST method, body, headers, and no-authorization pattern; only the lost URL is replaced. |

## Approved dealership-information custom values

| Dealership custom value | Source on the linked ADO Dealership record | Formatting |
|---|---|---|
| `dealership_name` | Dealership Name | Direct value |
| `dealership_address` | Street Address, City, State, Zip | Comma-separated full address |
| `dealership_address_full` | Street Address, City, State, Zip | Comma-separated full address |
| `dealer_website` | Website | Direct value |
| `dealership_tracking_number` | Tracking# | Standard phone display format |
| `dealership_tracking_number_2` | Tracking # 2 | Standard phone display format |
| `our_hours` | Hours | Direct value |
| `crm_email` | CRM email | Direct value |
| `alias_name` | Alias | Full Alias |
| `alias_1st_name` | Alias | First word of Alias |
| `alias_position` | Alias Position | Direct value |
| `brand` | Brand | Direct value |
| `crm_link` | CRM Link | Direct value |
| `passcode` | Passcode | Direct value |

Blank source values are skipped rather than overwriting an existing dealership custom value with an empty value.

## Slack confirmation

After the subaccount values update successfully, the relay posts only in **GHL New Subaccounts**:

> Dealership Custom Values have been updated in **[Dealership]**. Please review.

The GHL New Subaccounts channel is stored as a protected setting; no Slack channel ID is placed in source, GitHub, or this document.

## ABC test plan

The first live test will use only the existing ABC Dealer Dealership record. After the existing workflow’s Custom Webhook address is replaced, a controlled VERIFIED update will be run. We will verify that the listed ABC Dealer dealership-information values updated and that one confirmation posted in GHL New Subaccounts. No other dealership will be used in the live test.

## Verified ABC result

The existing **Dealership Object to Subaccount Custom Values** workflow remained published with its **Dealership Changed → Verified is `verified`** trigger, **POST** method, no authorization, and original payload. Only its former lost Custom Webhook address was replaced.

The user ran the ABC Dealer test and confirmed the GHL New Subaccounts notification appeared. The relay recorded a successful dealership-value sync, with **13 values updated** and **1 blank source value skipped**. The test used only the exact ABC Dealer Dealership record supplied by the existing workflow and did not target another subaccount.

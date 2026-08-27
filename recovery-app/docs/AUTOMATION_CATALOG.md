# ADO GHL–Slack Relay Automation Catalog

This catalog is the working map for the relay rebuild. **Nothing in this document means an automation is live.** Each automation must be reviewed, configured with protected settings, tested in ABC Dealer, and approved before use in ADO or dealership operations.

## 1. Proof-Stage Message to Slack

**Purpose.** Keep the campaign team informed when the Proof Stage of an ADO Production record changes.

**Trigger.** The GHL workflow named **GHL Production Message to Slack** watches a Production record for a Proof Stage change. It sends the Production name and Proof Stage to the protected relay.

**What the relay does.** It finds the campaign's existing Slack channel, reads the current Production record and linked Dealership record, and posts a notice only in that campaign channel. It does not create a channel, update a Canvas, sync values, or change archive dates.

| Proof Stage | Notice content | Recipient |
|---|---|---|
| Request Proof | Mail piece(s), campaign dates, and dealership | David |
| Proofing Needed | Proofing-needed notice | @deals |
| Approved to Upload | Job number | David |
| Sent to Print | Upload-to-MBI confirmation | Brian |

**Test plan.** Use one ABC Dealer test Production record that already has a test Slack campaign channel. Change each Proof Stage once and confirm the correct message is posted only in that channel.

## 2. Campaign Channel and Production Canvas Setup

**Purpose.** Give each Production campaign one consistent Slack working space and one current Production Canvas.

**Trigger.** The original workflow was **Create Slack Channel**, which ran when a Production record's Deal Stage changed to **Production**.

**What the relay does.** It turns the Production name into a safe channel name, creates the channel only if it does not already exist, invites the approved group and always-invited team members, creates or updates the Production Canvas from the ADO Production record and its linked Dealership record, then saves the channel and Canvas IDs in the relay database. A repeated webhook updates the existing record rather than creating duplicates.

**Test plan.** Create one ABC Dealer test Production record, change its Deal Stage to Production, and confirm that exactly one test channel, one Production Canvas, the correct invitations, and one database record result. Run the trigger a second time and confirm no duplicate channel or Canvas is created.

## 3. Production Canvas Refresh

**Purpose.** Keep the Production Canvas accurate after campaign details change.

**Trigger.** A protected Production-update workflow webhook.

**What the relay does.** It re-reads the ADO Production record and related Dealership record, then updates the already-linked Production Canvas in place. It does not create a second Canvas.

**Test plan.** Change a non-critical ABC Dealer test Production field, run the update trigger, and verify the existing Canvas changes in place while its Canvas ID stays the same.

## 4. Dealer Custom-Value Sync

**Purpose.** Copy approved dealership information from the ADO Dealership record into the correct dealership subaccount.

**Trigger.** A protected dealer-sync workflow webhook or an approved operational action.

**What the relay does.** It reads the related ADO Dealership record, obtains that dealership's location ID and full-scope key from the record at run time, and updates only the mapped dealership custom values. It records the outcome without storing the dealership key in the relay database or GitHub.

**Test plan.** Use ABC Dealer only. Change one designated non-production custom value, run the sync, and confirm that exactly that mapped value updates in ABC Dealer.

## 5. Campaign Custom-Value Sync

**Purpose.** Push mapped Production/campaign values from ADO to the linked dealership subaccount.

**Trigger.** The existing ADO Post Production campaign-sync workflow sends the Production name to the relay. The recovered receiver supports the original immediate-acknowledgment Custom Webhook behavior as well as protected relay delivery.

**What the relay does.** It finds the linked Dealership record, uses its stored location ID and key only for that operation, updates only the approved campaign values, posts a confirmation in that campaign’s existing Slack channel, and records a safe success or failure result. The full approved mapping and date rules are in `CAMPAIGN_CUSTOM_VALUE_SYNC.md`.

**Test plan.** Use ABC Dealer only. Change one designated test campaign value, run the sync, and verify the correct matching value in ABC Dealer.

## 6. Scheduled Campaign-Channel Archive

**Purpose.** Close campaign Slack channels after a campaign is finished while preserving a clear warning and recovery record.

**Trigger.** Channel setup or an approved reschedule action reads the Production `event_end` date.

**What the relay does.** It schedules one warning **one day before the archive date** and one archive **three days after the campaign end date**. It stores those durable schedule IDs and archive state in the database. A cancellation removes both scheduled jobs; a changed or cleared event end date replaces or cancels them rather than creating duplicates. The archive action is authenticated and skips already completed or cancelled campaigns.

**Verified ABC result.** The existing **Create Slack Channel** workflow was reconnected by replacing only its former lost Custom Webhook address. A safe ABC workflow test reached the rebuilt receiver, reused the existing channel, and created no extra channel or archive action. The ABC Event End was September 13 and the durable archive job was corrected to September 16—exactly three days later. Its warning and archive jobs are enabled in the durable scheduler.

## Operating Rules

The relay must not show credentials on the status page, in logs, in GitHub, or in this catalog. Protected settings and the private recovery vault hold the values; GitHub holds only the source code, templates, tests, and recovery instructions. Each automation remains disabled until its individual ABC Dealer test is approved.

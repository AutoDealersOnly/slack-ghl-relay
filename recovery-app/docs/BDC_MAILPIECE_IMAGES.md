# BDC Mailpiece Images

> **November 6 status:** the confirmed September direct image handoff has been restored; a genuine automatic ABC Test workflow run is still required before calling that restoration operationally verified. Lakeland Toyota's separate image-only recovery is complete after David saved full scopes: both images, both BDC image values, and the normal completion message succeeded. It did not change Proof Stage or repeat Sent to Print.

## Purpose

This automation removes the manual BDC step of converting approved campaign mailpieces into dealership Media-library images and setting the campaign image custom values. It runs from the existing **GHL Production Message to Slack** proof-stage webhook when a Production record reaches **Sent to Print**.

The existing Sent to Print Slack notice remains the first action and keeps its established wording and recipient. The BDC image work starts only after that notice has posted successfully. No Production Proof field or Automated Proof Links field is changed by this automation.

## Required existing connections

| Item | Required state | Purpose |
|---|---|---|
| GoHighLevel workflow | Existing **GHL Production Message to Slack** Custom Webhook | Sends a headerless `POST` to `/api/relay/ghl/proof_status` with the Production name and proof stage. |
| Slack app | Bot token includes `files:read` | Lists and downloads PDFs from the exact linked campaign channel. |
| Dealership connection | Linked dealership subaccount connection includes **Media Library write** (`medias.write`) and custom-value access | Saves images to the correct dealership and writes the campaign values. |
| ADO Production record | Linked to a Dealership record and campaign Slack channel | Supplies the safe server-side relationship needed to resolve the destination. |

Protected connection values, Slack group references, location identifiers, and API credentials stay in the Manus Keys and Codes only.

## Mailpiece selection and mapping

The relay looks only in the **exact linked campaign Slack channel**. Campaign channels intentionally keep earlier PDFs. It therefore selects **one PDF only**: the newest non-envelope PDF in that channel. A filename containing `ENV` is excluded without regard to case. Older non-envelope PDFs are history and are not considered for the current BDC image update.

| Qualifying PDF set | `current_mailpiece_image` | `current_mailpiece_image_back` |
|---|---|---|
| One PDF with one page | Page 1 | Explicitly set empty |
| One PDF with two or more pages | Page 1 | Page 2 |
| Multiple historical PDFs | Page 1 of the newest non-envelope PDF | Page 2 of that same newest PDF, if it has a second page |

The relay uploads JPEGs to the linked dealership’s Media library. For a one-page mailpiece, the single front image and an intentionally empty back value are the complete result. For every other accepted mapping, it updates both values only after both required images are available. On full success, it posts:

> BDC Mailpiece images have been uploaded to the *subaccount name* media folder and the BDC Mailpiece custom values have been updated.

## Execution and safety rules

The November 6 source restoration keeps the original native PDF-to-JPEG renderer unchanged and restores the confirmed September direct call to `uploadCampaignMailpieceImages` immediately after the unchanged Sent to Print notice and its log. Sent-to-Print requests remain open while the existing image action runs; name-only legacy requests also remain open because their saved Proof Stage is read from the Production record. Explicit non-print proof stages retain immediate acknowledgement. The old fifty-five-second response race is not restored because it could acknowledge before unfinished image work ended. No new scheduled image task is created by this proof path. Existing scheduled jobs and the narrow backstop remain intact for previously queued work; archive scheduling remains entirely separate and unchanged. This request-lifetime restoration requires verification in the published site, not just a manual sandbox run.

Before it starts the work, the receiver saves a normal proof-status receipt. A retry of the same proof-stage delivery therefore stops safely without posting another Sent to Print notice or starting another image run. Each image upload is also guarded by campaign, Slack file, and page number, so an interrupted image run reuses a successful upload rather than adding duplicate Media files. If selection, download, rendering, upload, or a required image is incomplete, the Campaign Details values remain unchanged and no BDC completion message is sent. A failed image job clears its old worker reference before it is requeued, so the replacement worker can attach safely. A Media Library request that drops before GoHighLevel returns any response gets one short retry with a fresh upload request; a timeout or any GoHighLevel response, including a 401 permission/scope response, stops immediately without a retry. The only intentional single-image exception is a verified one-page single-PDF mailpiece, which clears the back value as described above.

## Verification record

ABC Dealer was the required test subaccount. On September 11, 2026, the live published Sent to Print path was confirmed with two non-ENV PDFs and an ENV PDF in the campaign channel. The original Sent to Print notice arrived first; both required JPEGs were created in ABC Dealer Media Storage; both BDC custom values were updated; and the revised completion message posted. The user visually confirmed the final two-image result.

On September 14, 2026, the 2609 Miracle Toyota P Sent to Print run confirmed the single-PDF one-page case. The initial action had fired but was blocked by that linked dealership connection lacking Media-upload permission. After the dealership permission was updated, the image-only retry proved the one-page condition and the minimal repair: the existing front image was retained, the back Campaign Details value was intentionally cleared, and the BDC completion message posted without changing Proof Stage or re-sending the original Sent to Print notice.

On September 23, 2026, the live 2610 Kia Wesley Chapel AME Sent to Print run confirmed the same connection safeguard on a two-image campaign. The original Sent to Print notice posted, but the first image upload was refused because that dealership connection did not include Media Library write permission. After David added `medias.write` to that subaccount’s existing connection, one administrator-approved image-only retry reused the PDFs already in the campaign channel. Both JPEGs uploaded, both Campaign Details image values were updated, and the normal BDC completion message posted. The retry did not re-send the Sent to Print notice or modify Proof Stage.

On September 30, 2026, repeated Sent to Print notices were traced to GoHighLevel retrying a webhook that stayed open while BDC image work ran. The proof-status receiver was repaired to acknowledge immediately and retain a proof-status receipt before it starts the unchanged notice and image work. The repair prevents a retry from posting an additional notice or starting another image run; it does not change the renderer, PDF selection, Media upload, Campaign Details values, proof stage, message wording, or recipient.

On October 1, 2026, several live Sent to Print image runs revealed that the image work could still hang when it was attempted inside the already-acknowledged background request. The remaining heavy work was therefore moved back to the existing durable worker. The notice still posts first, and the worker retains the same file mapping, duplicate safeguards, Media Library upload, custom-value update, and completion message. The 2610 Stokes Hodges Kia AME item that exposed the hang was recovered once using the existing exact image action; it completed with both images and the normal confirmation, without changing Proof Stage or re-sending the Sent to Print notice.

On October 2, 2026, a real Stokes Hodges Kia AME reprint showed that a webhook can arrive a few seconds before GoHighLevel makes its new Sent to Print value available to the relay. The receiver now waits briefly for the saved value, and each newly saved Sent to Print change receives its own protected receipt. **Every new move to Sent to Print runs the full image action again**: it posts the normal notice, reopens the completed durable image job for that reprint, reads the current channel PDFs, updates the dealership Media Library and BDC custom values, and posts the normal confirmation. This still rejects duplicate deliveries of the same saved change. The platform worker can start a few minutes after its scheduled minute; do not manually run a second action while its job is still scheduled or processing.

On October 29, 2026, the 2611 Kia LaGrange AME reprint exposed a platform timing fault: a worker created less than two minutes before its exact scheduled minute was missed and its next run was the following year. The repair provides at least five full minutes of registration lead time, adds a narrow backstop for a recently missed worker that never began, and clears a failed worker’s old task reference before a replacement is attached. The first approved exact recovery encountered a plain connection drop while uploading the front image; it produced no partial custom-value update or completion message. The next approved exact recovery completed both images, both BDC custom values, and the normal channel confirmation without changing Proof Stage or posting another Sent to Print notice. The Media Library request now retries that pre-response connection failure once only; it does not retry a timeout or a GoHighLevel permission/error response.

Later on October 29, 2026, 2611 Beaver Toyota AME showed a different platform fault: its worker started, loaded the Production record, rendered both pages, and uploaded the front image, but the scheduling service returned a 503 at its short callback deadline while the back image was still underway. The worker now immediately acknowledges the scheduler after its protected claim, then continues the same duplicate-safe image action. The administrator-approved exact Beaver recovery reused the saved front image, uploaded the back image, updated both BDC image values, and posted the normal completion message. It did not change Proof Stage or post another Sent to Print notice.

On November 6, 2026, Lakeland Toyota's scheduled attempt was found still marked processing hours after its final front-page rendering stage. The exact approved image recovery reached GoHighLevel Media upload and received `401: The token is not authorized for this scope`. This was the linked dealership's missing Media Library write permission, not an image-code failure. After David confirmed that full scopes were saved, one exact image-only retry uploaded both pages, wrote both BDC image values, and posted the normal completion message. A separate read-back matched both values to the saved uploaded images and confirmed the successful completion-message delivery record. Proof Stage, the GHL workflow, other campaign values, and other campaigns were untouched. Separately, comparison with the user-confirmed September source established that the uploader itself had not changed, but the direct call had been replaced by a queue and early acknowledgement. Only that handoff and the proof request's completion ordering were restored. Unit tests and a manual recovery are not evidence of a successful automatic run.

## Recovery and troubleshooting

**First step whenever David reports this mailpiece-image automation did not run:** ask exactly **"Did you set full scopes on the Private Integration?"** before inspecting, debugging, or changing code. David may have forgotten this on an older dealership subaccount. Do not assume every misfire is a code failure, and do not broaden this special question to unrelated automations.

1. Start from `docs/RECOVERY_INDEX.md` and the Manus Keys and Codes document.
2. Restore the secret-free application from the company recovery branch and enter protected settings only through the secure configuration screen.
3. Keep the existing proof-stage workflow and replace only its dead destination with `/api/relay/ghl/proof_status` under the current published relay URL.
4. Confirm the Slack bot retains `files:read` and the ABC Dealer connection includes **Media Library write** (`medias.write`) before testing.
5. Test all three supported cases in ABC Dealer when practical: two non-ENV PDFs plus an ENV PDF; one two-page non-ENV PDF; and one one-page non-ENV PDF. Verify the original notice, the expected image count, the front and back custom values, and the BDC completion message together.

For a Media upload 401, first remind David to restore the linked dealership's existing Media Library upload/write scope, especially for an older subaccount. After confirmation, retry only the affected campaign's image action once, without changing Proof Stage, another campaign, or the GHL workflow. Do not replace credentials or rewrite image code for that error. A successful proof receipt or a Sent to Print message alone does not establish that images completed; verify Media images, the two BDC image values, and the final BDC confirmation together. The separate **Push Campaign Custom Values** action remains tied to **Post Production** and is not added to Sent to Print by this repair.

> **Rollback reference:** checkpoint `f48c58da` is the known-good baseline for the original Sent to Print notice alone. Do not restore retired Production Proof or Automated Proof Links experiments when rebuilding this image automation.

## November 9 — Hill Nissan completion timeline

David confirmed full scopes before reporting 2611 Hill Nissan AME. The administrator-requested image-only action completed at 12:21 PM Eastern, reusing both already-uploaded image records, writing both BDC image values, and posting the normal completion message. Read-back matched both values to the current PDF's saved image URLs. No Proof Stage, workflow, credentials, other campaign values, or other campaign was changed, and no new image copies were created by this manual action.

The prior history showed a first-page claim created at 12:10:23 PM, the front image recorded uploaded at 12:16:12 PM, the back image at 12:16:17 PM, and a successful image/value/completion-message action at 12:16:19 PM, before the administrator-requested run. Another proof delivery was logged at 12:16 PM. Thus automatic processing completed after David's 12:13 PM report and before the manual image action. No scheduled image-job row existed for this campaign, and no mailpiece permission error was logged. The logs do not identify the exact cause of the earlier first-page processing pause; do not label it a proven renderer, upload, hosting, or permission fault, or make speculative source changes. This was observation and recovery for an explicitly requested active campaign, not an intentional active-campaign test; the separate ABC-only automatic workflow verification remains pending.

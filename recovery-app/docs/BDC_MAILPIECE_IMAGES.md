# BDC Mailpiece Images

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

The final implementation uses the original native PDF-to-JPEG renderer that was proven in the first ABC controlled run. The proof-status receiver first returns an immediate `ok` to GoHighLevel, then posts the unchanged Sent to Print notice and places the longer PDF, rendering, Media Library, and custom-value work into one durable worker. That worker is given at least five full minutes of platform-registration time before its exact scheduled minute. A separate authenticated fifteen-minute backstop can requeue only a recently scheduled worker that never started; it cannot select a campaign from request data, reopen historical work, or touch a completed, failed, pending, or processing job. This prevents a missed exact-minute task from rolling to the following year. Archive scheduling remains separate and unchanged.

Before it starts the work, the receiver saves a normal proof-status receipt. A retry of the same proof-stage delivery therefore stops safely without posting another Sent to Print notice or starting another image run. Each image upload is also guarded by campaign, Slack file, and page number, so an interrupted image run reuses a successful upload rather than adding duplicate Media files. If selection, download, rendering, upload, or a required image is incomplete, the Campaign Details values remain unchanged and no BDC completion message is sent. A failed image job clears its old worker reference before it is requeued, so the replacement worker can attach safely. A Media Library request that drops before GoHighLevel returns any response gets one short retry with a fresh upload request; a timeout or any GoHighLevel response, including a 401 permission/scope response, stops immediately without a retry. The only intentional single-image exception is a verified one-page single-PDF mailpiece, which clears the back value as described above.

## Verification record

ABC Dealer was the required test subaccount. On September 11, 2026, the live published Sent to Print path was confirmed with two non-ENV PDFs and an ENV PDF in the campaign channel. The original Sent to Print notice arrived first; both required JPEGs were created in ABC Dealer Media Storage; both BDC custom values were updated; and the revised completion message posted. The user visually confirmed the final two-image result.

On September 14, 2026, the 2609 Miracle Toyota P Sent to Print run confirmed the single-PDF one-page case. The initial action had fired but was blocked by that linked dealership connection lacking Media-upload permission. After the dealership permission was updated, the image-only retry proved the one-page condition and the minimal repair: the existing front image was retained, the back Campaign Details value was intentionally cleared, and the BDC completion message posted without changing Proof Stage or re-sending the original Sent to Print notice.

On September 23, 2026, the live 2610 Kia Wesley Chapel AME Sent to Print run confirmed the same connection safeguard on a two-image campaign. The original Sent to Print notice posted, but the first image upload was refused because that dealership connection did not include Media Library write permission. After David added `medias.write` to that subaccount’s existing connection, one administrator-approved image-only retry reused the PDFs already in the campaign channel. Both JPEGs uploaded, both Campaign Details image values were updated, and the normal BDC completion message posted. The retry did not re-send the Sent to Print notice or modify Proof Stage.

On September 30, 2026, repeated Sent to Print notices were traced to GoHighLevel retrying a webhook that stayed open while BDC image work ran. The proof-status receiver was repaired to acknowledge immediately and retain a proof-status receipt before it starts the unchanged notice and image work. The repair prevents a retry from posting an additional notice or starting another image run; it does not change the renderer, PDF selection, Media upload, Campaign Details values, proof stage, message wording, or recipient.

On October 1, 2026, several live Sent to Print image runs revealed that the image work could still hang when it was attempted inside the already-acknowledged background request. The remaining heavy work was therefore moved back to the existing durable worker. The notice still posts first, and the worker retains the same file mapping, duplicate safeguards, Media Library upload, custom-value update, and completion message. The 2610 Stokes Hodges Kia AME item that exposed the hang was recovered once using the existing exact image action; it completed with both images and the normal confirmation, without changing Proof Stage or re-sending the Sent to Print notice.

On October 2, 2026, a real Stokes Hodges Kia AME reprint showed that a webhook can arrive a few seconds before GoHighLevel makes its new Sent to Print value available to the relay. The receiver now waits briefly for the saved value, and each newly saved Sent to Print change receives its own protected receipt. **Every new move to Sent to Print runs the full image action again**: it posts the normal notice, reopens the completed durable image job for that reprint, reads the current channel PDFs, updates the dealership Media Library and BDC custom values, and posts the normal confirmation. This still rejects duplicate deliveries of the same saved change. The platform worker can start a few minutes after its scheduled minute; do not manually run a second action while its job is still scheduled or processing.

On October 29, 2026, the 2611 Kia LaGrange AME reprint exposed a platform timing fault: a worker created less than two minutes before its exact scheduled minute was missed and its next run was the following year. The repair provides at least five full minutes of registration lead time, adds a narrow backstop for a recently missed worker that never began, and clears a failed worker’s old task reference before a replacement is attached. The first approved exact recovery encountered a plain connection drop while uploading the front image; it produced no partial custom-value update or completion message. The next approved exact recovery completed both images, both BDC custom values, and the normal channel confirmation without changing Proof Stage or posting another Sent to Print notice. The Media Library request now retries that pre-response connection failure once only; it does not retry a timeout or a GoHighLevel permission/error response.

## Recovery and troubleshooting

1. Start from `docs/RECOVERY_INDEX.md` and the Manus Keys and Codes document.
2. Restore the secret-free application from the company recovery branch and enter protected settings only through the secure configuration screen.
3. Keep the existing proof-stage workflow and replace only its dead destination with `/api/relay/ghl/proof_status` under the current published relay URL.
4. Confirm the Slack bot retains `files:read` and the ABC Dealer connection includes **Media Library write** (`medias.write`) before testing.
5. Test all three supported cases in ABC Dealer when practical: two non-ENV PDFs plus an ENV PDF; one two-page non-ENV PDF; and one one-page non-ENV PDF. Verify the original notice, the expected image count, the front and back custom values, and the BDC completion message together.

> **Rollback reference:** checkpoint `f48c58da` is the known-good baseline for the original Sent to Print notice alone. Do not restore retired Production Proof or Automated Proof Links experiments when rebuilding this image automation.

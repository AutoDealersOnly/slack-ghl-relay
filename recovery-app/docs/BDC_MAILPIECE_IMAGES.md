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

The relay looks only in the **exact linked campaign Slack channel**. It selects PDFs only, excludes a filename containing `ENV` without regard to case, and keeps the newest version when the same filename was uploaded more than once.

| Qualifying PDF set | `current_mailpiece_image` | `current_mailpiece_image_back` |
|---|---|---|
| One PDF with one page | Page 1 | Explicitly set empty |
| One PDF with two or more pages | Page 1 | Page 2 |
| Two PDFs | First page of the first selected PDF | First page of the second selected PDF |
| More than two distinct PDFs | No values are changed | No values are changed |

The relay uploads JPEGs to the linked dealership’s Media library. For a one-page mailpiece, the single front image and an intentionally empty back value are the complete result. For every other accepted mapping, it updates both values only after both required images are available. On full success, it posts:

> BDC Mailpiece images have been uploaded to the *subaccount name* media folder and the BDC Mailpiece custom values have been updated.

## Execution and safety rules

The final implementation uses the original native PDF-to-JPEG renderer that was proven in the first ABC controlled run. It runs within the original Sent to Print request after the Slack notice, with a bounded request budget. The abandoned one-time BDC scheduler is not used for this workflow; archive scheduling remains separate and unchanged.

Each image upload is guarded by campaign, Slack file, and page number. A duplicate webhook therefore reuses a successful upload rather than adding duplicate Media files. If selection, download, rendering, upload, or a required image is incomplete, the Campaign Details values remain unchanged and no BDC completion message is sent. The only intentional single-image exception is a verified one-page single-PDF mailpiece, which clears the back value as described above.

## Verification record

ABC Dealer was the required test subaccount. On September 11, 2026, the live published Sent to Print path was confirmed with two non-ENV PDFs and an ENV PDF in the campaign channel. The original Sent to Print notice arrived first; both required JPEGs were created in ABC Dealer Media Storage; both BDC custom values were updated; and the revised completion message posted. The user visually confirmed the final two-image result.

On September 14, 2026, the 2609 Miracle Toyota P Sent to Print run confirmed the single-PDF one-page case. The initial action had fired but was blocked by that linked dealership connection lacking Media-upload permission. After the dealership permission was updated, the image-only retry proved the one-page condition and the minimal repair: the existing front image was retained, the back Campaign Details value was intentionally cleared, and the BDC completion message posted without changing Proof Stage or re-sending the original Sent to Print notice.

On September 23, 2026, the live 2610 Kia Wesley Chapel AME Sent to Print run confirmed the same connection safeguard on a two-image campaign. The original Sent to Print notice posted, but the first image upload was refused because that dealership connection did not include Media Library write permission. After David added `medias.write` to that subaccount’s existing connection, one administrator-approved image-only retry reused the PDFs already in the campaign channel. Both JPEGs uploaded, both Campaign Details image values were updated, and the normal BDC completion message posted. The retry did not re-send the Sent to Print notice or modify Proof Stage.

## Recovery and troubleshooting

1. Start from `docs/RECOVERY_INDEX.md` and the Manus Keys and Codes document.
2. Restore the secret-free application from the company recovery branch and enter protected settings only through the secure configuration screen.
3. Keep the existing proof-stage workflow and replace only its dead destination with `/api/relay/ghl/proof_status` under the current published relay URL.
4. Confirm the Slack bot retains `files:read` and the ABC Dealer connection includes **Media Library write** (`medias.write`) before testing.
5. Test all three supported cases in ABC Dealer when practical: two non-ENV PDFs plus an ENV PDF; one two-page non-ENV PDF; and one one-page non-ENV PDF. Verify the original notice, the expected image count, the front and back custom values, and the BDC completion message together.

> **Rollback reference:** checkpoint `f48c58da` is the known-good baseline for the original Sent to Print notice alone. Do not restore retired Production Proof or Automated Proof Links experiments when rebuilding this image automation.

# QR Mail Builder rebuild guide

**Verified:** September 25, 2026
**Live location:** ADO subaccount → Print Shop Tools funnel → QR Dashboard (Clone) while it is being reviewed; David will choose when to make the clone the working page.

## Purpose

QR Mail Builder prepares copy-ready QR-code URLs and print-shop instructions for current campaign records. It shows Production and Post Production campaigns by default, with an option to include Live Active campaigns.

## Preserved original behavior

The original page remains the foundation. It reads current ADO Production records, follows the linked Dealership record, displays the base QR URL, builds the PURL, and retains its Refresh, Copy, Test, Customize, Instructions, and Include Live Active controls.

## Verified September 2026 addition

The separate add-on file is `qr-mail-builder-two-qr-add-on.html`. It is intentionally an append-only block; it does not contain or replace the page's private connection.

| Addition | Behavior |
|---|---|
| QR 1 | Uses the Dealership field `qr_url`. |
| QR 2 | Uses the Dealership field `qr_url_2`. A visible QR 2 row remains even if this field is empty. |
| PIN Code | Always included in every generated PURL. |
| KBB Value | Optional Customize field using `kbb_book_value`. |
| Advertised Offer | Optional Customize field using `advertised_offer`. |
| Independent choices | QR 1 and QR 2 retain separate Customize and Instructions settings for the same campaign. |

## Rebuild procedure

1. In ADO, open the Print Shop Tools funnel and the intended QR Dashboard step. Do not change a working live step until a clone has been verified.
2. Restore the original QR Mail Builder code exactly as it was. Its private connection remains in that existing code and must never be committed to GitHub, copied into chat, or placed in general documentation.
3. Open the secret-free `qr-mail-builder-two-qr-add-on.html` file from the recovery repository.
4. Click at the very end of the existing original code and paste the entire add-on after the final character. Do not replace, cut, or edit the original code.
5. Save/publish the clone, then check a campaign with two dealership QR URLs and one with only the first URL.
6. Confirm QR 1 and QR 2 display, PIN Code is present by default, Customize offers KBB Value and Advertised Offer, and Copy, Test, Instructions, Refresh, and Include Live Active still work.
7. After David approves the clone, make it the working QR Mail Builder page through the normal funnel-step process.

## Safe rollback

Remove only the appended add-on block from the clone and save. The original QR Mail Builder behavior returns.

## Backup rule

GitHub stores the secret-free add-on, this guide, the current-state analysis, and the code map. The original page's private connection remains only in the protected GoHighLevel page and Manus Keys and Codes.

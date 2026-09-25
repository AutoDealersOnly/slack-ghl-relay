# QR Mail Builder add-on instructions

**Verified:** September 25, 2026

## What this file does

`docs/qr-mail-builder/qr-mail-builder-two-qr-add-on.html` is a **secret-free, append-only** addition to the working QR Mail Builder code. It does not contain the existing private GoHighLevel connection and does not replace it.

## How it was applied successfully

1. In ADO, David worked in **QR Dashboard (Clone)** under the Print Shop Tools funnel. The original QR Dashboard was left untouched.
2. The clone already contained the working original QR Mail Builder code.
3. Clicked at the absolute end of the code box and pasted the complete add-on file after the last existing character.
4. Saved/published the clone and confirmed that it worked.

> Do not replace the original code. Do not paste into the middle of it. Paste this one whole add-on block at the end of the existing working code.

## Result

| Addition | Behavior |
|---|---|
| QR 1 | Uses Dealership `qr_url`. |
| QR 2 | Uses Dealership `qr_url_2`; displays a clear no-URL message if it is not set. |
| PIN Code | Included in every generated PURL by default. |
| KBB Value | Available in Customize from `kbb_book_value`. |
| Advertised Offer | Available in Customize from `advertised_offer`. |
| Controls | QR 1 and QR 2 each retain their own Customize and Instructions controls. |

## Safe rollback

Remove only the one appended add-on block, then save/publish. The original QR Mail Builder behavior remains.

## Recovery safeguard

GitHub stores this add-on and rebuild guide only. The private connection is intentionally absent from GitHub and remains in the protected GoHighLevel code and Manus Keys and Codes.

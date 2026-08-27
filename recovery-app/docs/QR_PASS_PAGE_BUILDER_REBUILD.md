# QR Pass Page Builder Rebuild Guide

## What this function does

The QR Pass Page Builder is the internal ADO tool that produces five dealership-specific copy-ready outputs. A user selects or types a dealership name and receives four modular QR Pass Page blocks plus the appointment-SMS QR image URL. It is intended to be opened from the ADO GoHighLevel custom menu without a separate sign-in screen.

The builder’s outputs are intended for the following locations:

| Output | Where it is used | Important behavior |
|---|---|---|
| 1. Numeric PIN Gate | First QR Pass Page Custom JS/HTML element | Uses the fixed staff PIN **2026**. |
| 2. Appointment Pass Card | Immediately below Block 1 | Displays appointment/customer information from the existing QR parameter. |
| 3. Edit This Contact | Immediately below Block 2 | Contains the selected dealership’s location ID and API key. |
| 4. Campaign Reference | Immediately below Block 3 | Contains the selected dealership’s location ID and API key. |
| 5. Appointment-SMS QR URL | Appointment confirmation SMS QR image URL field | Uses the selected dealership’s saved QR Pass Page URL and preserves the original merge fields. |

## What remains private

The application source, status page, selector list, browser storage, and GitHub backup must never contain actual dealership API keys, location IDs, or the QR Pass Builder private access value. The final generated Block 3 and Block 4 may include the selected dealership’s API key because they are the intentional copy-ready output for that dealership page.

The exact custom-menu URL, including its private access value, is stored only in the private recovery-vault Google document under **QR PASS PAGE BUILDER — ACTIVE RECOVERY RECORD**. Do not paste that full URL into GitHub, shared documents, or chat.

## How to make a future page adjustment

Begin with the ADO GHL–Slack Relay Recovery Index and the company GitHub backup. Check out the `secure-recovery-relay-20260826` branch and open `recovery-app`. The QR Pass Builder files are:

| Need | File or setting |
|---|---|
| User-facing builder page | `client/src/pages/QrPassBuilder.tsx` |
| App route | `client/src/App.tsx` |
| Server-side dealership search and output generation | `server/relay/qr-pass-builder.ts` |
| Access check | `server/relay/qr-pass-access.ts` |
| Protected no-login value | `QR_PASS_BUILDER_ACCESS_TOKEN` in protected project settings and private vault only |
| Unit tests | `server/relay/qr-pass-builder.test.ts`, `server/relay/qr-pass-access.test.ts` |
| Read-only ABC generator check | `server/relay/qr-pass-builder.credentials.test.ts` |

Make only the requested change. If it changes an output block, compare it against the saved ABC reference blocks before publishing. Run the focused QR tests, the full suite, and TypeScript validation. Run the read-only ABC generator diagnostic before any user-visible check; it does not write to GoHighLevel or Slack.

After publication, open the builder from the ADO GHL custom-menu link, select ABC Dealer, and compare the five generated outputs with the approved reference. Confirm that the PIN gate uses **2026** and that no bulk-copy control is present. Update this guide and the private Recovery Index with the change, then commit and push the secret-free source to the company recovery branch.

## How to rebuild after a loss

Connect GitHub, clone [AutoDealersOnly/slack-ghl-relay](https://github.com/AutoDealersOnly/slack-ghl-relay), and check out `secure-recovery-relay-20260826`. Restore the `recovery-app` folder in a new project. Enter current protected settings from the private recovery vault, including `QR_PASS_BUILDER_ACCESS_TOKEN`. Publish the replacement, then update the existing ADO GHL custom-menu link using the newly recorded private builder URL. Test ABC Dealer before using the rebuilt page for another dealership.

> **Standard change rule for every restored function:** start from the Recovery Index, change only what was requested, test the affected operation, update the private record, and push the secret-free tested version to GitHub before starting another automation.

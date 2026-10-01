# QR Mail Builder — Current-State Analysis

**Reviewed:** September 25, 2026
**Current location:** The ADO subaccount's **Print Shop Tools** funnel
**Purpose:** Gives ADO staff a current campaign list and copy-ready QR-code URLs/instructions for the print shop.

> This document deliberately does **not** include the original page source or any protected connection information. The live page contains a browser-visible connection that must not be copied into source control, chat, or rebuild notes.

## What the current tool does

The QR Mail Builder is a single GoHighLevel funnel page that uses an embedded HTML/JavaScript block. It loads current ADO Production records, follows the linked Dealership record, and displays the dealership's stored QR URL.

It shows a table with:

| Column | Current behavior |
|---|---|
| Dealership | Uses the Production record's dealership name, with the linked Dealership record as a fallback. |
| Job #(s) | Shows the Production record's job-number field. |
| Status | Recognizes Production, Post Production, and Live Active. |
| Base QR URL | Uses the linked Dealership record's `qr_url` value; provides Copy and Test controls. |
| PURL for QR Code | Builds a copy-ready URL with selected placeholder fields; provides Copy, Customize, and Instructions controls. |

## Current campaign filtering

- **Default view:** Production and Post Production records.
- **Optional view:** A button adds Live Active records to the displayed table.
- **Summary row:** Shows totals for all three recognized stages.
- **Sorting:** Production first, then Post Production, then Live Active; within each stage, dealerships are alphabetical.
- **Refresh:** The page has a manual Refresh button. It reads current GoHighLevel data again; it does not edit records.

## PURL behavior

The default PURL includes placeholder values for:

- First name
- Last name
- Phone
- Email

The Customize control can also include or remove:

- PIN code
- Current vehicle year
- Current vehicle make
- Current vehicle model

Each row's customization is temporary. It works for the current browser visit only and resets if the user refreshes the page or returns later. That matches a one-off print-preparation tool, but it is important if future changes require saved defaults by dealership or campaign.

## Print-shop instructions

The Instructions control creates a copyable plain-language message containing:

1. The dealership name
2. The base QR URL
3. A sentence describing the selected PURL fields
4. The resulting copy-ready PURL

This is created in the page itself; it does not send an email or update a GoHighLevel record.

## What is already working well

- The layout is clear and focused on print-shop use.
- The user can test a QR destination before sending instructions.
- Missing QR URLs are shown clearly instead of producing a broken link.
- Copy actions provide immediate confirmation.
- The original page safely displays record text as text rather than allowing it to become page markup.
- The live page successfully loaded current campaign information during the review.

## Current connection and backup boundary

The existing Print Shop Tools page reads GoHighLevel directly from its page code. David confirmed that this is an intentionally admin-protected internal tool and does not want that working arrangement changed as part of this update.

**Implementation decision:** preserve the current connection and page structure. Future requested changes will be made directly to the existing QR Mail Builder page unless David specifically asks for a different arrangement.

The only backup boundary is that the protected connection itself is not copied into GitHub, chat, or general rebuild notes. Safe backups can still include the page layout, behavior map, field list, and rebuild instructions without including protected values.

## Backup recommendation

Keeping the page in GoHighLevel is useful because the working page remains with the ADO account and its funnel. It is **not** a replacement for a backup.

After a requested update is tested, the backup should include:

- A secret-free page template and behavior map
- The field/behavior map in this document
- Rebuild steps in Manus Keys and Codes
- A GitHub backup on the company recovery branch

The GitHub backup must never contain the original browser-visible connection or any other protected value.

## Current status

- The existing QR Mail Builder remains unchanged.
- The Print Shop Tools funnel remains the correct place to update it.
- The custom menu link does not need to be recreated.
- No GoHighLevel records, page settings, or menu links were edited during this review.

## Ready for the change list

The tool can be extended directly once the requested changes are listed. Changes will be made to the existing Print Shop Tools page while leaving the staff-facing QR Mail Builder menu link unchanged.

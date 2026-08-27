# QR Pass Page Builder Specification

## Purpose

The QR Pass Page Builder is an internal ADO tool launched from an ADO GoHighLevel custom-menu link. An authorized user selects or types a dealership name, generates five copy-ready outputs, and pastes them into the dealership’s QR Pass Page funnel and appointment SMS workflow.

## Five generated outputs

| Output | Placement or use | Dealership-specific replacement |
|---|---|---|
| 1. Numeric PIN Gate | First Custom JS/HTML element on the QR Pass Page | No dealership credential. The staff PIN is fixed at **2026**. |
| 2. Appointment Pass Card | QR Pass Page main card | No dealership credential. It reads the existing pipe-delimited customer/appointment QR parameter. |
| 3. Edit This Contact | Below the Appointment Pass Card | Dealer API key and dealer location ID. |
| 4. Campaign Reference | Below Edit This Contact | Dealer API key and dealer location ID. |
| 5. Appointment SMS QR URL | SMS workflow QR image URL | The dealership’s saved QR Pass Page URL replaces the ABC URL base; the existing customer, opportunity, appointment, and campaign merge fields remain unchanged. |

## ABC reference behavior to retain

The four supplied ABC modules are the source of truth for visible behavior. The only approved content change is replacing the old `1234` staff PIN with **`2026`**. The generator will retain the original block order, customer QR parameter structure, direct contact editing behavior, campaign-reference behavior, and SMS QR URL merge fields.

## Dealership lookup and output handling

The page will search ADO Dealership records by selected or typed dealership name. The server will read the selected Dealership’s stored location ID, full-access API key, and QR Pass Page URL only while generating the five outputs. No secret is listed in the selector, stored in browser storage, shown on a status dashboard, or committed to GitHub.

The user-requested generated Blocks 3 and 4 deliberately contain the selected dealership’s API key because they must be pasted into that dealership’s GHL page. The app will make those values visible only in the final copy-ready output for the selected dealership.

## Access boundary to confirm

The page will have **no separate login screen** and will be launched from the GHL custom menu, as requested. Because the generated page code contains dealership API keys, the final implementation still needs an agreed no-login protection for the external page URL. The minimum option is a protected, unguessable access value included only in the custom-menu URL; a stronger alternative is a normal sign-in requirement. This decision must be confirmed before the generator endpoint that returns dealership API keys is activated.

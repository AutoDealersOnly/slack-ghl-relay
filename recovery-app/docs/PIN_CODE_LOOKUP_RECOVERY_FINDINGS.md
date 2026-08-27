# PIN Code Lookup Tool: Initial Recovery Findings

## Supplied reference materials

The user supplied `/home/ubuntu/upload/pin_lookup_tool_v10.zip` and `/home/ubuntu/upload/PinCodeLookupindex.html`. The archive contains a small standalone project:

| Archive file | Initial role |
|---|---|
| `pin_lookup_tool_v10/index.html` | Standalone PIN lookup page implementation. |
| `pin_lookup_tool_v10/build.py` | Packaging or build utility; not run during inventory. |
| `pin_lookup_tool_v10/README.md` | Project notes to inspect read-only. |
| `pin_lookup_tool_v10/DEPLOYMENT_GUIDE.md` | Deployment notes to inspect read-only. |

## Observed user-facing behavior

The standalone HTML identifies the tool as **PIN Code Lookup**. It includes an initial PIN search, retry by PIN, fallback search by phone, name search, manual customer entry, customer detail display, an opportunity mini-card, and a PIN badge. It detects the placeholder PIN values `2003`, `2003*`, and `*2003` and guides the user through a fallback process.

The page dynamically retrieves the subaccount’s custom fields and uses their field keys to map contact data. It includes an action that writes a corrected PIN to an existing contact and an action that creates a contact when the customer cannot be found.

The archive README describes the tool as a call-center custom-menu item. It supports editable contact details across five work areas: contact information, current vehicle, desired vehicle, notes and status, and read-only opportunities. It resolves custom-field IDs dynamically, which is intended to allow a shared tool design across dealership subaccounts. The recovered reference also provides cascading make/model selections, saves contact changes to GHL, and opens the matching GHL contact record in a single reusable browser tab.

## Reference-version comparison

The archived `index.html` and the separately supplied `PinCodeLookupindex.html` have the same SHA-256 digest (`9681b61617943130f9d27fd1668e78318b73c964759038283b54e8d68efcbfea`), line count (1,547), byte count (325,307), and function set. They are therefore the same recoverable source version, despite the archive name indicating v10 while the README identifies the project notes as v8.

## Security constraint for recovery

The supplied standalone reference embeds subaccount access configuration in browser-side JavaScript. The recovery must preserve the tool’s lookup and contact-management behavior **without** embedding API keys or location IDs in page source, browser storage, or GitHub. The per-subaccount GHL custom-menu page needs a server-side configuration approach before implementation.

The original deployment advice relied on separately inserting a location ID and API key into each subaccount copy. That is unsuitable for the rebuilt central recovery application because any operator could retrieve those values through page source or browser developer tools. The current recovery application already has a server-side dealership lookup pattern and protected settings, which will be reused for a minimal, no-key-in-browser restoration.

## Approved universal-menu contract

The user approved a single shared PIN Code Lookup page for all dealership subaccounts. Every GHL custom-menu link will supply the active subaccount through `{{location.id}}`, a supported HighLevel menu-link value.[1] The page will also require its own private access value in the menu-link URL. The location ID identifies the dealership; the private value prevents the public page address alone from being used as an open customer-data lookup endpoint.

For each permitted request, the server will retrieve the matching dealership record from the ADO Dealership custom object, then use only that record’s stored subaccount API key to communicate with GHL. The server will return customer information for that exact subaccount only; it will not return the key, raw dealership record, or any other dealership’s data.

## Confirmed API requirements

The recovered reference uses location-scoped custom-field retrieval, contact search, contact-detail retrieval, contact update, and read-only opportunity display. Current HighLevel documentation confirms that custom-field retrieval is location-scoped and requires a subaccount token with `locations/customFields.readonly`; it also confirms that contact updates use `PUT /contacts/:contactId` and require `contacts.write`.[2] [3]

The rebuilt tool will keep the reference’s dynamic field-key behavior, but it will validate every requested location, contact ID, search term, and allowed field name on the server before a request reaches GHL. It will use the recovered placeholder PIN flow for `2003`, `2003*`, and `*2003`, while leaving actual customer searches and writes limited to the active dealership.

## Verified ABC behavior and deferred opportunity visibility

On August 27, 2026, ABC Dealer visually confirmed that PIN lookup opens the expected customer record, the dealership identity header is correct, and changing that loaded customer’s phone number saves to the **same contact record without creating a duplicate**. The universal page intentionally uses a contact-specific `PUT` update for a loaded record; it creates a contact only through the deliberate manual-entry path.[3]

Opportunity visibility is **not included in the current operator tool**. The supplied reference included a read-only opportunity area, but HighLevel did not include associated opportunities in the loaded ABC contact response. The documented exact-contact opportunity search requires the `opportunities.readonly` permission.[4] The user chose to defer that work rather than change any scope or account setting during this recovery. A future update can add a customer-specific, read-only Opportunities tab after the existing Private Integration’s opportunity-read permission is confirmed.

## Recovery boundary

The supplied archive is a functional reference only. Its `build.py` and any other archived executable remain unrun. No source file from the archive, including the browser-embedded configuration, will be copied directly into the recovered application or GitHub backup.

## References

[1]: https://help.gohighlevel.com/support/solutions/articles/48001185767-customizing-highlevel-menus-a-guide-to-custom-menu-links "HighLevel: Custom Menu Links"
[2]: https://marketplace.gohighlevel.com/docs/ghl/locations/get-custom-fields/ "HighLevel API: Get Custom Fields"
[3]: https://marketplace.gohighlevel.com/docs/ghl/contacts/update-contact/ "HighLevel API: Update Contact"
[4]: https://marketplace.gohighlevel.com/docs/ghl/opportunities/search-opportunity/ "HighLevel API: Search Opportunity"

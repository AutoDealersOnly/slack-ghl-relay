# BDC Mailpiece Color Validation

On September 11, 2026, a read-only comparison of the current ABC Slack first-page preview and the corrected PDFium WebAssembly JPEG render confirmed that the renderer now preserves the expected page colors. The Toyota header remains blue, the merge fields remain green, and the voucher divider remains red; the earlier blue-tinted output was caused by an unnecessary red/blue channel swap before JPEG encoding.

No campaign data, Media item, custom value, or Slack message was changed by this comparison. The next ABC run must still re-render both selected image slots and verify the complete two-image result before final acceptance.

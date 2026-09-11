# Sent-to-Print PDF Attachment — Research Notes

## Slack file access

Slack’s `files.list` response includes file creation time, MIME type, channel identifiers, and private download URLs. A bot token needs file-read access to list channel files and must authenticate when retrieving a private file URL. This supports selecting the newest PDF that is actually associated with the linked campaign channel.

## HighLevel upload question

HighLevel documents a file-upload endpoint for contact custom fields. It accepts PDF files and has a 50 MB size limit. That documentation does not establish the equivalent contract for an ADO **Production Custom Object** file field, so the implementation must first inspect the live Production field schema and confirm the custom-object record update/upload route. It must not assume a contact-only upload action will work for Production records.

## Required safety rules

The intended workflow must select only a PDF in the exact linked channel, ignore Slack canvases/images/other attachments, reject an oversized or inaccessible file, and leave the Production field unchanged when no unambiguous qualifying PDF exists. The Sent-to-Print workflow must still post its existing proof-stage message even if the file attachment fails.

## Sources

1. Slack Developer Docs, *files.list method*.
2. HighLevel Developer Docs, *Upload files to custom fields*.

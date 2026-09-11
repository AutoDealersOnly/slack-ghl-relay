import { describe, expect, it } from "vitest";
import { buildProofPdfAddedMessage } from "./workflows";
import { selectCurrentChannelPdfs } from "./slack";
import { appendAutomatedProofLink, buildAutomatedProofLinksUpdatePayload } from "./ghl";

describe("Sent to Print PDF selection", () => {
  it("keeps every downloadable PDF in the exact linked campaign channel", () => {
    const files = selectCurrentChannelPdfs("C_CAMPAIGN", [
      { id: "F_OTHER", name: "other.pdf", filetype: "pdf", channels: ["C_OTHER"], created: 300, url_private_download: "https://files.example/other" },
      { id: "F_OLD", name: "old-proof.pdf", mimetype: "application/pdf", channels: ["C_CAMPAIGN"], created: 100, url_private_download: "https://files.example/old" },
      { id: "F_LATEST", name: "final-proof.PDF", filetype: "pdf", channels: ["C_CAMPAIGN"], created: 200, url_private_download: "https://files.example/latest" },
    ]);
    expect(files.map(file => file.id)).toEqual(["F_OLD", "F_LATEST"]);
  });

  it("skips when a linked campaign channel has no downloadable PDF", () => {
    expect(selectCurrentChannelPdfs("C_CAMPAIGN", [{ id: "F_IMAGE", name: "proof.png", filetype: "png", channels: ["C_CAMPAIGN"], created: 200, url_private_download: "https://files.example/image" }])).toEqual([]);
  });

  it("retains only the newest PDF when the channel has repeated file names", () => {
    const files = selectCurrentChannelPdfs("C_CAMPAIGN", [
      { id: "F_OLD", name: "Proof.PDF", filetype: "pdf", channels: ["C_CAMPAIGN"], created: 100, url_private_download: "https://files.example/old" },
      { id: "F_NEW", name: "proof.pdf", filetype: "pdf", channels: ["C_CAMPAIGN"], created: 200, url_private_download: "https://files.example/new" },
      { id: "F_OTHER", name: "art.pdf", filetype: "pdf", channels: ["C_CAMPAIGN"], created: 150, url_private_download: "https://files.example/art" },
    ]);
    expect(files.map(file => file.id)).toEqual(["F_OTHER", "F_NEW"]);
  });

  it("uses the approved successful-attachment confirmation wording", () => {
    expect(buildProofPdfAddedMessage("final-proof.pdf")).toBe("*final-proof.pdf* PDF has been added to the production record.");
  });

  it("writes the separate Automated Proof Links field within the custom-object properties body", () => {
    expect(buildAutomatedProofLinksUpdatePayload("09/09/2026 — proof.pdf\nhttps://example.test/proof.pdf")).toEqual({
      properties: { automated_proof_links: "09/09/2026 — proof.pdf\nhttps://example.test/proof.pdf" },
    });
  });

  it("appends a dated named media URL without overwriting earlier automated proof links", () => {
    expect(appendAutomatedProofLink("09/08/2026 — existing.pdf\nhttps://example.test/existing.pdf", "Final-Proof.PDF", "https://example.test/final.pdf", new Date("2026-09-09T12:00:00Z"))).toBe(
      "09/08/2026 — existing.pdf\nhttps://example.test/existing.pdf\n\n09/09/2026 — Final-Proof.PDF\nhttps://example.test/final.pdf"
    );
  });
});

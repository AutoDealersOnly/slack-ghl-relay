import { describe, expect, it } from "vitest";
import { buildMailpieceImagePlan, buildBdcMailpieceImagesUpdatedMessage } from "./mailpiece-images";
import { selectCurrentChannelMailpiecePdfs } from "./slack";

const channelId = "C_CAMPAIGN";
const slackFile = (id: string, name: string, created: number) => ({
  id,
  name,
  filetype: "pdf",
  channels: [channelId],
  created,
  url_private_download: `https://files.example/${id}`,
});

describe("BDC mailpiece image planning", () => {
  it("ignores ENV PDFs and keeps only the newest duplicate filename", () => {
    const files = selectCurrentChannelMailpiecePdfs(channelId, [
      slackFile("F_ENV", "offer-env.pdf", 30),
      slackFile("F_OLD", "mailer.pdf", 10),
      slackFile("F_NEW", "Mailer.PDF", 20),
      slackFile("F_TWO", "second-piece.pdf", 15),
    ]);
    expect(files.map(file => file.id)).toEqual(["F_TWO", "F_NEW"]);
  });

  it("maps the first two pages of one mailpiece to front and back", () => {
    expect(buildMailpieceImagePlan([slackFile("F_ONE", "mailer.pdf", 10)])).toMatchObject([
      { pageNumber: 1, slot: "front" },
      { pageNumber: 2, slot: "back" },
    ]);
  });

  it("maps the first page of each two-mailpiece PDF to front and back", () => {
    expect(buildMailpieceImagePlan([slackFile("F_ONE", "mailer-a.pdf", 10), slackFile("F_TWO", "mailer-b.pdf", 20)])).toMatchObject([
      { pageNumber: 1, slot: "front" },
      { pageNumber: 1, slot: "back" },
    ]);
  });

  it("refuses to guess when more than two distinct non-ENV PDFs exist", () => {
    expect(() => buildMailpieceImagePlan([
      slackFile("F_ONE", "a.pdf", 10), slackFile("F_TWO", "b.pdf", 20), slackFile("F_THREE", "c.pdf", 30),
    ])).toThrow("More than two distinct non-ENV PDFs");
  });

  it("uses the approved campaign-channel confirmation wording", () => {
    expect(buildBdcMailpieceImagesUpdatedMessage("ABC Dealer")).toBe(
      "BDC Mailpiece images have been uploaded to the *ABC Dealer* media folder and the BDC Mailpiece custom values have been updated."
    );
  });
});

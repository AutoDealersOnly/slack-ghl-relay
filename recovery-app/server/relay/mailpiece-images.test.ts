import { describe, expect, it } from "vitest";
import { buildBdcMailpieceImageCustomValues, buildMailpieceImagePlan, buildBdcMailpieceImagesUpdatedMessage } from "./mailpiece-images";
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
  it("ignores ENV PDFs and uses only the newest non-envelope PDF in a campaign channel", () => {
    const files = selectCurrentChannelMailpiecePdfs(channelId, [
      slackFile("F_ENV", "offer-env.pdf", 30),
      slackFile("F_OLD", "mailer.pdf", 10),
      slackFile("F_NEW", "Mailer.PDF", 20),
      slackFile("F_LATEST", "newest-print.pdf", 25),
    ]);
    expect(files.map(file => file.id)).toEqual(["F_LATEST"]);
  });

  it("maps the first two pages of one mailpiece to front and back", () => {
    expect(buildMailpieceImagePlan([slackFile("F_ONE", "mailer.pdf", 10)])).toMatchObject([
      { pageNumber: 1, slot: "front" },
      { pageNumber: 2, slot: "back" },
    ]);
  });

  it("sets the front image and intentionally clears the back value for a single-page mailpiece", () => {
    expect(buildBdcMailpieceImageCustomValues({ front: "https://media.example/front.jpg" }, true)).toEqual({
      current_mailpiece_image: "https://media.example/front.jpg",
      current_mailpiece_image_back: "",
    });
  });

  it("does not clear the back value for a mailpiece that should have a second image", () => {
    expect(() => buildBdcMailpieceImageCustomValues({ front: "https://media.example/front.jpg" }, false))
      .toThrow("Both required mailpiece images are not available");
  });

  it("uses the approved campaign-channel confirmation wording", () => {
    expect(buildBdcMailpieceImagesUpdatedMessage("ABC Dealer")).toBe(
      "BDC Mailpiece images have been uploaded to the *ABC Dealer* media folder and the BDC Mailpiece custom values have been updated."
    );
  });
});

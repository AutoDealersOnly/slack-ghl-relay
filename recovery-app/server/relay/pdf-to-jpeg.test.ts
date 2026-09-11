import { PDFDocument, StandardFonts } from "pdf-lib";
import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";
import { buildMailpieceJpegFileName, renderPdfPagesToJpegs } from "./pdf-to-jpeg";

describe("PDF to JPEG renderer", () => {
  it("renders requested pages from a real two-page PDF as JPEG bytes", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const text of ["Front", "Back"]) {
      const page = pdf.addPage([240, 180]);
      page.drawText(text, { x: 40, y: 90, size: 36, font });
    }
    const images = await renderPdfPagesToJpegs(await pdf.save(), [1, 2]);
    expect(images).toHaveLength(2);
    expect(Array.from(images[0].slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    expect(Array.from(images[1].slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    expect(jpeg.decode(Buffer.from(images[0])).width).toBeGreaterThan(0);
    expect(jpeg.decode(Buffer.from(images[1])).height).toBeGreaterThan(0);
  }, 30_000);

  it("builds durable media-library JPEG filenames", () => {
    expect(buildMailpieceJpegFileName("ABC Mailer Final.PDF", 1)).toBe("ABC-Mailer-Final-page-1.jpg");
  });

  it("preserves red artwork without a blue channel swap", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([200, 200]);
    page.drawRectangle({ x: 0, y: 0, width: 200, height: 200, color: { type: "RGB", red: 1, green: 0, blue: 0 } });

    const [image] = await renderPdfPagesToJpegs(await pdf.save(), [1]);
    const decoded = jpeg.decode(Buffer.from(image), { useTArray: true });
    const center = ((Math.floor(decoded.height / 2) * decoded.width) + Math.floor(decoded.width / 2)) * 4;
    expect(decoded.data[center]).toBeGreaterThan(decoded.data[center + 2]);
  }, 30_000);
});

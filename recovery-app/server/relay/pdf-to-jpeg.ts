import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 88;

type PdfPage = {
  getViewport: (input: { scale: number }) => { width: number; height: number };
  render: (input: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<void> };
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

/**
 * Renders requested PDF pages as JPEGs using the original native prebuilt Node bindings.
 * It deliberately caps dimensions so a large print PDF cannot exhaust the relay.
 */
export async function renderPdfPagesToJpegs(bytes: Uint8Array, pageNumbers: number[]): Promise<Uint8Array[]> {
  const runtime = globalThis as unknown as Record<string, unknown>;
  runtime.DOMMatrix ??= DOMMatrix;
  runtime.ImageData ??= ImageData;
  runtime.Path2D ??= Path2D;

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const pdf = (await task.promise) as unknown as PdfDocument;
  const requested = Array.from(new Set(pageNumbers));

  try {
    if (requested.some(page => !Number.isInteger(page) || page < 1 || page > pdf.numPages)) {
      throw new Error(`PDF does not contain every required mailpiece page (available pages: ${pdf.numPages})`);
    }

    const images: Uint8Array[] = [];
    for (const pageNumber of requested) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.max(1, Math.min(2, MAX_DIMENSION / Math.max(base.width, base.height)));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const jpeg = await canvas.encode("jpeg", JPEG_QUALITY);
      images.push(new Uint8Array(jpeg));
    }
    return images;
  } finally {
    await task.destroy();
  }
}

export function buildMailpieceJpegFileName(pdfName: string, pageNumber: number): string {
  const base = pdfName.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "mailpiece";
  return `${base}-page-${pageNumber}.jpg`;
}

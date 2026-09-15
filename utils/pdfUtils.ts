import { PDFDocument } from 'pdf-lib';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let str = '';
    for (let j = 0; j < chunk.length; j++) {
      str += String.fromCharCode(chunk[j]);
    }
    binary += str;
  }
  return btoa(binary);
}

export async function getPDFPageCount(pdfData: ArrayBuffer | Uint8Array): Promise<number> {
  try {
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch (err) {
    console.warn("Failed to parse PDF page count:", err);
    return 1;
  }
}

export interface PageChunkResult {
  base64: string;
  startPage: number;
  endPage: number;
  chunkPageCount: number;
}

/**
 * Extracts a specified page range (1-indexed, inclusive) from PDF bytes
 * and returns a new standalone base64-encoded PDF containing only those pages.
 */
export async function extractPDFPageRange(
  pdfData: ArrayBuffer | Uint8Array,
  startPage: number,
  endPage: number
): Promise<PageChunkResult> {
  const srcDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();
  const actualStart = Math.max(1, Math.min(startPage, totalPages));
  const actualEnd = Math.max(actualStart, Math.min(endPage, totalPages));

  const subDoc = await PDFDocument.create();
  const pageIndices: number[] = [];
  for (let p = actualStart; p <= actualEnd; p++) {
    pageIndices.push(p - 1);
  }

  const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
  for (const page of copiedPages) {
    subDoc.addPage(page);
  }

  const subBytes = await subDoc.save();
  const base64 = uint8ArrayToBase64(subBytes);

  return {
    base64,
    startPage: actualStart,
    endPage: actualEnd,
    chunkPageCount: copiedPages.length,
  };
}

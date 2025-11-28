import { parseOptimalFireGenericV1 } from "./parsers/optimalFireGeneric";

async function extractPdfText(pdfFile: File | Buffer): Promise<string> {
  return "";
}

async function ocrPdfToText(pdfFile: File | Buffer): Promise<string> {
  return "";
}

export async function parseWithOcrFallback(pdfFile: File | Buffer) {
  let text = await extractPdfText(pdfFile);

  if (!text || text.trim().length < 50) {
    text = await ocrPdfToText(pdfFile);
  }

  const result = parseOptimalFireGenericV1(text);
  if (result.items.length === 0) {
    result.warnings.push("Parser found 0 items. Try Manual Mapping or upload Excel/CSV.");
  }
  return result;
}

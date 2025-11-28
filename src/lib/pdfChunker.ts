import { PDFDocument } from 'pdfjs-dist';

type PdfChunk = {
  chunkId: string;
  startPage: number;
  endPage: number;
  data?: Uint8Array;
  sha256: string;
};

type ChunkManifest = {
  original: { fileName: string; sha256: string; size: number };
  chunks: PdfChunk[];
  totalPages: number;
  createdAt: string;
  version: 'pdf-chunker/v1';
};

const MAX_SMALL_FILE_SIZE = 10 * 1024 * 1024;

export async function chunkPdfFile(
  file: File,
  pagesPerChunk = 15
): Promise<ChunkManifest> {
  if (file.size <= MAX_SMALL_FILE_SIZE) {
    return chunkPdfEdgeFunction(file, pagesPerChunk);
  } else {
    return chunkPdfEdgeFunction(file, pagesPerChunk);
  }
}

async function chunkPdfEdgeFunction(
  file: File,
  pagesPerChunk: number
): Promise<ChunkManifest> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('pagesPerChunk', pagesPerChunk.toString());

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chunk_pdf`;
  const headers = {
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to chunk PDF file');
  }

  return response.json();
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

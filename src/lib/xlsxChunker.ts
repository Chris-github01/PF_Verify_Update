import * as XLSX from 'xlsx';

type XlsxChunk = {
  chunkId: string;
  sheetName: string;
  startRow: number;
  endRow: number;
  header: string[];
  data: any[][];
  sha256: string;
};

type ChunkManifest = {
  original: { fileName: string; sha256: string; size: number };
  chunks: XlsxChunk[];
  totalSheets: number;
  createdAt: string;
  version: 'xlsx-chunker/v1';
};

const MAX_SMALL_FILE_SIZE = 5 * 1024 * 1024;

export async function chunkXlsxFile(
  file: File,
  rowsPerChunk = 4000
): Promise<ChunkManifest> {
  if (file.size <= MAX_SMALL_FILE_SIZE) {
    return chunkXlsxBrowser(file, rowsPerChunk);
  } else {
    return chunkXlsxEdgeFunction(file, rowsPerChunk);
  }
}

async function chunkXlsxBrowser(
  file: File,
  rowsPerChunk: number
): Promise<ChunkManifest> {
  const arrayBuffer = await file.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuffer);
  const fileSha256 = await sha256Bytes(fileBytes);

  const workbook = XLSX.read(fileBytes, { type: 'array' });

  const manifest: ChunkManifest = {
    original: {
      fileName: file.name,
      sha256: fileSha256,
      size: file.size,
    },
    chunks: [],
    totalSheets: workbook.SheetNames.length,
    createdAt: new Date().toISOString(),
    version: 'xlsx-chunker/v1',
  };

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
    });

    if (jsonData.length === 0) continue;

    const headerRow = jsonData[0].map(String);
    const dataRows = jsonData.slice(1);

    if (dataRows.length === 0) continue;

    for (let i = 0; i < dataRows.length; i += rowsPerChunk) {
      const batch = dataRows.slice(i, i + rowsPerChunk);
      const chunkData = batch.map((row) => row.map(String));

      const chunkId = crypto.randomUUID();
      const chunkJson = JSON.stringify([headerRow, ...chunkData]);
      const chunkSha256 = await sha256String(chunkJson);

      manifest.chunks.push({
        chunkId,
        sheetName,
        startRow: i + 2,
        endRow: i + batch.length + 1,
        header: headerRow,
        data: chunkData,
        sha256: chunkSha256,
      });
    }
  }

  return manifest;
}

async function chunkXlsxEdgeFunction(
  file: File,
  rowsPerChunk: number
): Promise<ChunkManifest> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('rowsPerChunk', rowsPerChunk.toString());

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chunk_xlsx`;
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
    throw new Error(error.error || 'Failed to chunk XLSX file');
  }

  return response.json();
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256String(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  return sha256Bytes(data);
}

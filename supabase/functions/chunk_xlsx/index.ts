import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type XlsxChunk = {
  chunkId: string;
  sheetName: string;
  startRow: number;
  endRow: number;
  header: string[];
  path: string;
  sha256: string;
};

type ChunkManifest = {
  original: { fileName: string; sha256: string; size: number };
  chunks: XlsxChunk[];
  totalSheets: number;
  createdAt: string;
  version: "xlsx-chunker/v1";
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let arrayBuffer: ArrayBuffer;
    let fileName = "document.xlsx";
    let rowsPerChunk = 4000;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const rowsPerChunkStr = formData.get("rowsPerChunk") as string;
      rowsPerChunk = rowsPerChunkStr ? parseInt(rowsPerChunkStr, 10) : 4000;

      if (!file) {
        return new Response(
          JSON.stringify({ error: "No file provided" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      fileName = file.name;
      arrayBuffer = await file.arrayBuffer();
    } else {
      arrayBuffer = await req.arrayBuffer();
    }

    const fileBytes = new Uint8Array(arrayBuffer);
    const fileSha256 = await sha256Bytes(fileBytes);

    const tempFilePath = `/tmp/${crypto.randomUUID()}.xlsx`;
    await Deno.writeFile(tempFilePath, fileBytes);

    const XLSX = await import("npm:xlsx@0.18.5");
    const workbook = XLSX.read(fileBytes, { type: "array" });

    const manifest: ChunkManifest = {
      original: {
        fileName: fileName,
        sha256: fileSha256,
        size: fileBytes.length,
      },
      chunks: [],
      totalSheets: workbook.SheetNames.length,
      createdAt: new Date().toISOString(),
      version: "xlsx-chunker/v1",
    };

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });

      if (jsonData.length === 0) continue;

      const headerRow = jsonData[0].map(String);
      const dataRows = jsonData.slice(1);

      if (dataRows.length === 0) continue;

      for (let i = 0; i < dataRows.length; i += rowsPerChunk) {
        const batch = dataRows.slice(i, i + rowsPerChunk);
        const chunkData = [headerRow, ...batch.map(row => row.map(String))];

        const chunkId = crypto.randomUUID();
        const chunkPath = `/tmp/${chunkId}.json`;
        const chunkJson = JSON.stringify(chunkData);
        await Deno.writeTextFile(chunkPath, chunkJson);

        const chunkSha256 = await sha256String(chunkJson);

        manifest.chunks.push({
          chunkId,
          sheetName,
          startRow: i + 2,
          endRow: i + batch.length + 1,
          header: headerRow,
          path: chunkPath,
          sha256: chunkSha256,
        });
      }
    }

    await Deno.remove(tempFilePath);

    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error chunking XLSX:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to chunk XLSX file",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256String(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  return sha256Bytes(data);
}
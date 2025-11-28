import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

type PdfChunk = {
  chunkId: string;
  startPage: number;
  endPage: number;
  path: string;
  sha256: string;
};

type ChunkManifest = {
  original: { fileName: string; sha256: string; size: number };
  chunks: PdfChunk[];
  totalPages: number;
  createdAt: string;
  version: "pdf-chunker/v1";
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
    let fileName = "document.pdf";
    let pagesPerChunk = 15;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const pagesPerChunkStr = formData.get("pagesPerChunk") as string;
      pagesPerChunk = pagesPerChunkStr ? parseInt(pagesPerChunkStr, 10) : 15;

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

    const srcDoc = await PDFDocument.load(fileBytes);
    const totalPages = srcDoc.getPageCount();

    const manifest: ChunkManifest = {
      original: {
        fileName: fileName,
        sha256: fileSha256,
        size: fileBytes.length,
      },
      chunks: [],
      totalPages,
      createdAt: new Date().toISOString(),
      version: "pdf-chunker/v1",
    };

    for (let i = 0; i < totalPages; i += pagesPerChunk) {
      const end = Math.min(i + pagesPerChunk, totalPages);
      const newDoc = await PDFDocument.create();
      const pageIndices = Array.from({ length: end - i }, (_, k) => i + k);
      const pages = await newDoc.copyPages(srcDoc, pageIndices);
      pages.forEach((p) => newDoc.addPage(p));
      const chunkBytes = await newDoc.save();

      const chunkId = crypto.randomUUID();
      const chunkPath = `/tmp/${chunkId}.pdf`;
      await Deno.writeFile(chunkPath, chunkBytes);

      const chunkSha256 = await sha256Bytes(chunkBytes);

      manifest.chunks.push({
        chunkId,
        startPage: i + 1,
        endPage: end,
        path: chunkPath,
        sha256: chunkSha256,
      });
    }

    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error chunking PDF:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to chunk PDF file",
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
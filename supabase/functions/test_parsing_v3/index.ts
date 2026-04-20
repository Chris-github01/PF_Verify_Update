import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { runParserV3 } from "../_shared/parserRouterV3.ts";
import type { PageData } from "../_shared/documentClassifier.ts";

const PARSER_VERSION = "strict_total_taxonomy_v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TestV3Request {
  fileUrl?: string;
  text?: string;
  tradeType?: string;
}

async function extractTextFromUrl(fileUrl: string): Promise<{ pages: PageData[]; rawText: string }> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = await res.json();
    const text = typeof json.text === "string" ? json.text : typeof json.content === "string" ? json.content : JSON.stringify(json);
    const lines = text.split("\n");
    const pageSize = Math.ceil(lines.length / 3);
    const pages: PageData[] = [];
    for (let p = 0; p < 3; p++) {
      const pageLines = lines.slice(p * pageSize, (p + 1) * pageSize);
      if (pageLines.join("").trim()) {
        pages.push({ pageNum: p + 1, text: pageLines.join("\n") });
      }
    }
    return { pages: pages.length > 0 ? pages : [{ pageNum: 1, text }], rawText: text };
  }

  if (
    contentType.includes("application/pdf") ||
    contentType.includes("application/octet-stream") ||
    fileUrl.toLowerCase().includes(".pdf")
  ) {
    const pdfBytes = await res.arrayBuffer();

    const pdfExtractorBase = Deno.env.get("PDF_EXTRACTOR_BASE_URL") || "https://verify-pdf-extractor.onrender.com";
    const apiKey = Deno.env.get("PYTHON_PARSER_API_KEY") || Deno.env.get("RENDER_PDF_EXTRACTOR_API_KEY");

    let extractedPages: Array<{ page: number; text: string }> = [];

    try {
      const filename = fileUrl.split("/").pop()?.split("?")[0] ?? "quote.pdf";
      const file = new File([pdfBytes], filename, { type: "application/pdf" });
      const formData = new FormData();
      formData.append("file", file);
      const extractHeaders: Record<string, string> = {};
      if (apiKey) extractHeaders["X-API-Key"] = apiKey;
      const extractRes = await fetch(`${pdfExtractorBase}/parse/ensemble`, {
        method: "POST",
        headers: extractHeaders,
        body: formData,
      });
      if (extractRes.ok) {
        const extractData = await extractRes.json();
        if (Array.isArray(extractData.pages)) {
          extractedPages = extractData.pages;
        } else {
          const text = extractData.best_result?.text ?? extractData.text ?? extractData.content ?? "";
          if (text) extractedPages = [{ page: 1, text }];
        }
      }
    } catch {
      // fall through to pdfjs
    }

    if (extractedPages.length === 0) {
      const pdfjsLib = await import("npm:pdfjs-dist@4.0.379");
      const pdfDoc = await pdfjsLib.getDocument({
        data: new Uint8Array(pdfBytes),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
      }).promise;

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        let lastY = -1;
        let pageText = "";
        for (const item of textContent.items as any[]) {
          const currentY = item.transform[5];
          if (lastY !== -1 && Math.abs(currentY - lastY) > 5) pageText += "\n";
          else if (pageText.length > 0) pageText += " ";
          pageText += item.str;
          lastY = currentY;
        }
        if (pageText.trim()) extractedPages.push({ page: pageNum, text: pageText });
      }
    }

    const pages: PageData[] = extractedPages.map((p) => ({
      pageNum: p.page,
      text: p.text,
    }));
    const rawText = pages.map((p) => p.text).join("\n\n");
    return { pages, rawText };
  }

  const text = await res.text();
  return { pages: [{ pageNum: 1, text }], rawText: text };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startMs = Date.now();
  console.log(`[TestParsingV3] PARSER_VERSION=${PARSER_VERSION}`);

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed. Use POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: TestV3Request;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { fileUrl, text: rawTextInput } = body;

    if (!fileUrl && !rawTextInput) {
      return new Response(
        JSON.stringify({ error: "Provide either 'fileUrl' or 'text'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let pages: PageData[];
    let rawText: string;

    if (fileUrl) {
      console.log(`[TestParsingV3] Extracting text from: ${fileUrl}`);
      const extracted = await extractTextFromUrl(fileUrl);
      pages = extracted.pages;
      rawText = extracted.rawText;
    } else {
      rawText = rawTextInput!;
      pages = [{ pageNum: 1, text: rawText }];
    }

    if (!rawText || rawText.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "No usable text could be extracted" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[TestParsingV3] Pages: ${pages.length}, Total chars: ${rawText.length}`);

    const v3Result = runParserV3({ pages, rawText });

    const { resolution, classification, durationMs } = v3Result;

    const allItems = [
      ...resolution.baseItems,
      ...resolution.optionalItems,
      ...resolution.excludedItems,
    ];

    const itemsTotal = resolution.totals.grandTotal;
    const documentTotal = resolution.totals.grandTotal;
    const parsingGap = 0;
    const parsingGapPercent = 0;

    const avgConfidence =
      allItems.length > 0
        ? allItems.reduce((s, i) => s + (i.confidence ?? 0), 0) / allItems.length
        : 0;

    const highRiskItems = allItems.filter((i) => (i.confidence ?? 1) < 0.5).length;

    const processingMs = Date.now() - startMs;

    const response = {
      PARSER_VERSION,
      parserVersion: "v3",
      items: resolution.baseItems,
      optionalItems: resolution.optionalItems,
      excludedItems: resolution.excludedItems,
      validation: {
        score: Math.round(resolution.validation.confidence * 100),
        itemsTotal,
        documentTotal,
        parsingGap,
        parsingGapPercent,
        hasGap: resolution.validation.risk === "high",
        hasCriticalErrors: resolution.validation.risk === "high",
        risk: resolution.validation.risk,
        warnings: resolution.validation.warnings,
      },
      stats: {
        totalChunks: pages.length,
        deterministicItems: resolution.baseItems.length,
        llmItems: 0,
        validationScore: Math.round(resolution.validation.confidence * 100),
        parserUsed: resolution.parserUsed,
        optionalItems: resolution.optionalItems.length,
        excludedItems: resolution.excludedItems.length,
      },
      classification: {
        documentClass: classification.documentClass,
        confidence: classification.confidence,
        reasons: classification.reasons,
        signals: classification.signals,
      },
      debug: {
        parsingGap,
        parsingGapPercent,
        deterministicRatio: 1.0,
        totalInputLines: rawText.split("\n").filter((l) => l.trim()).length,
        totalParsedRows: allItems.length,
        detectedTrade: body.tradeType ?? "auto",
        documentTotal: resolution.totals.grandTotal,
        itemsTotal,
        chunksTotal: pages.length,
        processingMs,
        parserUsed: resolution.parserUsed,
        failedLinesGlobal: [],
        chunks: pages.map((page, i) => ({
          chunkIndex: i,
          section: `Page ${page.pageNum}`,
          block: null,
          lineCount: page.text.split("\n").filter((l) => l.trim()).length,
          detectedAsTable: false,
          deterministicItems: resolution.baseItems.filter(
            (item) => item.pageNum === page.pageNum
          ).length,
          llmItems: 0,
          rawLines: page.text.split("\n").filter((l) => l.trim()).slice(0, 50),
          parsedItems: resolution.baseItems.filter(
            (item) => item.pageNum === page.pageNum
          ),
          failedLines: [],
        })),
        structure: {
          sectionsDetected: classification.signals.hasScheduleRows ? 1 : 0,
          tablesDetected: Math.round(classification.signals.tableConfidence * 3),
          blocksDetected: classification.signals.numberedRowCount > 0 ? 1 : 0,
        },
        quality: {
          percentLinesParsed:
            rawText.split("\n").filter((l) => l.trim()).length > 0
              ? Math.round(
                  (allItems.length /
                    rawText.split("\n").filter((l) => l.trim()).length) *
                    100
                )
              : 0,
          avgParseConfidence: Math.round(avgConfidence * 100) / 100,
          avgNormalizationConfidence: Math.round(avgConfidence * 100) / 100,
          highRiskItems,
        },
        totals: resolution.totals,
        durationMs,
      },
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const processingMs = Date.now() - startMs;
    console.error("[TestParsingV3] Fatal error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        debug: { processingMs },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

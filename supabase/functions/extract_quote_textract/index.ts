import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TextractRequest {
  pdfBytes: string;
  fileName: string;
}

interface TextractBlock {
  BlockType: string;
  Text?: string;
  Confidence?: number;
  Geometry?: any;
  Relationships?: any[];
  EntityTypes?: string[];
  RowIndex?: number;
  ColumnIndex?: number;
}

async function callTextract(pdfBytes: Uint8Array): Promise<TextractBlock[]> {
  const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";
  const AWS_ACCESS_KEY = Deno.env.get("AWS_ACCESS_KEY_ID");
  const AWS_SECRET_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");

  if (!AWS_ACCESS_KEY || !AWS_SECRET_KEY) {
    throw new Error("AWS credentials not configured");
  }

  const endpoint = `https://textract.${AWS_REGION}.amazonaws.com/`;

  const payload = {
    Document: {
      Bytes: Array.from(pdfBytes),
    },
    FeatureTypes: ["TABLES", "FORMS"],
  };

  const date = new Date();
  const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = "/";
  const canonicalQueryString = "";
  const canonicalHeaders = `host:textract.${AWS_REGION}.amazonaws.com\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-date";

  const payloadHash = await sha256(JSON.stringify(payload));
  const canonicalRequest = `POST\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${AWS_REGION}/textract/aws4_request`;
  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  const signingKey = await getSignatureKey(AWS_SECRET_KEY, dateStamp, AWS_REGION, "textract");
  const signature = await hmacSha256(signingKey, stringToSign);

  const authorizationHeader = `${algorithm} Credential=${AWS_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "Textract.AnalyzeDocument",
      "X-Amz-Date": amzDate,
      "Authorization": authorizationHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Textract API error: ${error}`);
  }

  const data = await response.json();
  return data.Blocks || [];
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(key: Uint8Array, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const kDate = await hmacSha256Bytes(encoder.encode(`AWS4${key}`), dateStamp);
  const kRegion = await hmacSha256Bytes(kDate, region);
  const kService = await hmacSha256Bytes(kRegion, service);
  const kSigning = await hmacSha256Bytes(kService, "aws4_request");
  return kSigning;
}

async function hmacSha256Bytes(key: Uint8Array, message: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return new Uint8Array(signature);
}

function parseTextractBlocks(blocks: TextractBlock[]): any {
  const lines: string[] = [];
  const tables: any[] = [];
  const keyValuePairs: any[] = [];

  blocks.forEach(block => {
    if (block.BlockType === "LINE" && block.Text) {
      lines.push(block.Text);
    } else if (block.BlockType === "TABLE") {
      const table = extractTable(blocks, block);
      tables.push(table);
    } else if (block.BlockType === "KEY_VALUE_SET" && block.EntityTypes?.includes("KEY")) {
      const kvPair = extractKeyValue(blocks, block);
      if (kvPair) {
        keyValuePairs.push(kvPair);
      }
    }
  });

  const fullText = lines.join("\n");

  const metadata = extractMetadata(fullText, keyValuePairs);
  const lineItems = extractLineItemsFromTables(tables);
  const financials = extractFinancials(fullText, keyValuePairs);

  return {
    metadata,
    line_items: lineItems,
    financials,
    raw: {
      fullText,
      tables,
      keyValuePairs,
    },
  };
}

function extractTable(blocks: TextractBlock[], tableBlock: TextractBlock): any {
  const cells: any[] = [];

  if (!tableBlock.Relationships) return { rows: [] };

  const cellIds = tableBlock.Relationships
    .filter(rel => rel.Type === "CHILD")
    .flatMap(rel => rel.Ids || []);

  cellIds.forEach(cellId => {
    const cellBlock = blocks.find(b => b.Id === cellId);
    if (cellBlock && cellBlock.BlockType === "CELL") {
      const text = getCellText(blocks, cellBlock);
      cells.push({
        rowIndex: cellBlock.RowIndex,
        columnIndex: cellBlock.ColumnIndex,
        text,
        confidence: cellBlock.Confidence,
      });
    }
  });

  const maxRow = Math.max(...cells.map(c => c.rowIndex || 0));
  const rows: any[][] = [];

  for (let i = 1; i <= maxRow; i++) {
    const rowCells = cells.filter(c => c.rowIndex === i);
    rowCells.sort((a, b) => (a.columnIndex || 0) - (b.columnIndex || 0));
    rows.push(rowCells.map(c => c.text));
  }

  return { rows };
}

function getCellText(blocks: TextractBlock[], cellBlock: TextractBlock): string {
  if (!cellBlock.Relationships) return "";

  const wordIds = cellBlock.Relationships
    .filter(rel => rel.Type === "CHILD")
    .flatMap(rel => rel.Ids || []);

  const words = wordIds
    .map(wordId => {
      const wordBlock = blocks.find(b => b.Id === wordId);
      return wordBlock?.Text || "";
    })
    .filter(text => text);

  return words.join(" ");
}

function extractKeyValue(blocks: TextractBlock[], keyBlock: TextractBlock): any {
  if (!keyBlock.Relationships) return null;

  const valueId = keyBlock.Relationships
    .find(rel => rel.Type === "VALUE")
    ?.Ids?.[0];

  if (!valueId) return null;

  const valueBlock = blocks.find(b => b.Id === valueId);
  if (!valueBlock) return null;

  const key = getCellText(blocks, keyBlock);
  const value = getCellText(blocks, valueBlock);

  return { key, value, confidence: keyBlock.Confidence };
}

function extractMetadata(fullText: string, keyValuePairs: any[]): any {
  const metadata: any = {
    supplier_name: "",
    quote_number: "",
    quote_date: "",
    currency: "AUD",
  };

  keyValuePairs.forEach(kv => {
    const key = kv.key.toLowerCase();
    if (key.includes("supplier") || key.includes("vendor") || key.includes("from")) {
      metadata.supplier_name = kv.value;
    } else if (key.includes("quote") && key.includes("number")) {
      metadata.quote_number = kv.value;
    } else if (key.includes("date")) {
      metadata.quote_date = kv.value;
    }
  });

  if (!metadata.supplier_name) {
    const supplierMatch = fullText.match(/(?:Supplier|Vendor|From):\s*(.+)/i);
    if (supplierMatch) {
      metadata.supplier_name = supplierMatch[1].trim();
    }
  }

  return metadata;
}

function extractLineItemsFromTables(tables: any[]): any[] {
  if (tables.length === 0) return [];

  const mainTable = tables[0];
  if (!mainTable.rows || mainTable.rows.length < 2) return [];

  const headers = mainTable.rows[0].map((h: string) => h.toLowerCase());

  const descIdx = headers.findIndex((h: string) => h.includes("description") || h.includes("item"));
  const qtyIdx = headers.findIndex((h: string) => h.includes("qty") || h.includes("quantity"));
  const unitIdx = headers.findIndex((h: string) => h.includes("unit") && !h.includes("rate"));
  const rateIdx = headers.findIndex((h: string) => h.includes("rate") || h.includes("price"));
  const totalIdx = headers.findIndex((h: string) => h.includes("total") || h.includes("amount"));

  const lineItems: any[] = [];

  for (let i = 1; i < mainTable.rows.length; i++) {
    const row = mainTable.rows[i];

    const description = descIdx >= 0 ? row[descIdx] : "";
    if (!description || description.toLowerCase().includes("total")) continue;

    const quantity = qtyIdx >= 0 ? parseFloat(row[qtyIdx].replace(/[^0-9.-]/g, "")) : 0;
    const unit = unitIdx >= 0 ? row[unitIdx] : "each";
    const unitRate = rateIdx >= 0 ? parseFloat(row[rateIdx].replace(/[^0-9.-]/g, "")) : 0;
    const lineTotal = totalIdx >= 0 ? parseFloat(row[totalIdx].replace(/[^0-9.-]/g, "")) : quantity * unitRate;

    if (quantity > 0 && unitRate > 0) {
      lineItems.push({
        line_number: i,
        description,
        quantity,
        unit,
        unit_rate: unitRate,
        line_total: lineTotal,
        confidence: 0.85,
      });
    }
  }

  return lineItems;
}

function extractFinancials(fullText: string, keyValuePairs: any[]): any {
  const financials: any = {
    subtotal: 0,
    tax_amount: 0,
    grand_total: 0,
    currency: "AUD",
  };

  const totalMatch = fullText.match(/(?:Total|Grand Total|Amount Due)[:\s]*\$?([\d,]+\.?\d*)/i);
  if (totalMatch) {
    financials.grand_total = parseFloat(totalMatch[1].replace(/,/g, ""));
  }

  const subtotalMatch = fullText.match(/(?:Subtotal|Sub Total)[:\s]*\$?([\d,]+\.?\d*)/i);
  if (subtotalMatch) {
    financials.subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ""));
  }

  const taxMatch = fullText.match(/(?:GST|Tax|VAT)[:\s]*\$?([\d,]+\.?\d*)/i);
  if (taxMatch) {
    financials.tax_amount = parseFloat(taxMatch[1].replace(/,/g, ""));
  }

  return financials;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { pdfBytes, fileName }: TextractRequest = await req.json();

    if (!pdfBytes) {
      return new Response(
        JSON.stringify({ error: "PDF bytes required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bytes = Uint8Array.from(atob(pdfBytes), c => c.charCodeAt(0));

    const blocks = await callTextract(bytes);
    const extractedData = parseTextractBlocks(blocks);

    return new Response(JSON.stringify(extractedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Textract extraction failed:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

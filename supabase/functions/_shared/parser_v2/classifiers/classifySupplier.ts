/**
 * classifySupplier — identifies supplier identity & template fingerprint.
 * Deterministic first (header lines, ABN), LLM fallback only if ambiguous.
 */

export type SupplierClassification = {
  supplierName: string;
  abn: string | null;
  template_fingerprint: string;
  confidence: number;
  source: "header_regex" | "llm" | "hint_fallback";
};

const ABN_RE = /\bABN[:\s]*((?:\d[\s]?){11})\b/i;
const LINE_RE = /^[A-Z][A-Za-z0-9 &.,'()/-]{3,60}$/;

export async function classifySupplier(ctx: {
  rawText: string;
  fileName: string;
  supplierHint?: string;
  openAIKey: string;
}): Promise<SupplierClassification> {
  const header = ctx.rawText.slice(0, 1500);
  const abnMatch = header.match(ABN_RE);
  const abn = abnMatch ? abnMatch[1].replace(/\s+/g, "") : null;

  const lines = header.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidate = lines.find((l) => LINE_RE.test(l));
  if (candidate) {
    return {
      supplierName: candidate,
      abn,
      template_fingerprint: buildFingerprint(candidate, abn, ctx.fileName),
      confidence: 0.8,
      source: "header_regex",
    };
  }

  if (ctx.supplierHint) {
    return {
      supplierName: ctx.supplierHint,
      abn,
      template_fingerprint: buildFingerprint(ctx.supplierHint, abn, ctx.fileName),
      confidence: 0.55,
      source: "hint_fallback",
    };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.openAIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Extract the supplier/quoting company name from the provided quote header. Respond JSON: {\"supplier_name\": string, \"confidence\": 0..1}. Use the issuing company, not the client.",
          },
          { role: "user", content: header },
        ],
      }),
    });
    const json = await res.json();
    const parsed = JSON.parse(json.choices[0].message.content);
    const name = String(parsed.supplier_name ?? "").trim() || "Unknown Supplier";
    return {
      supplierName: name,
      abn,
      template_fingerprint: buildFingerprint(name, abn, ctx.fileName),
      confidence: clamp01(Number(parsed.confidence ?? 0.4)),
      source: "llm",
    };
  } catch (err) {
    console.error("[classifySupplier] LLM fallback failed", err);
    return {
      supplierName: "Unknown Supplier",
      abn,
      template_fingerprint: buildFingerprint("Unknown Supplier", abn, ctx.fileName),
      confidence: 0.2,
      source: "hint_fallback",
    };
  }
}

function buildFingerprint(name: string, abn: string | null, fileName: string): string {
  const base = `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}|${abn ?? ""}|${fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "")}`;
  return base.slice(0, 80);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

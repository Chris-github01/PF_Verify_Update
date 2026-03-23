import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface QuoteItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  scope_category?: string;
  system_id?: string;
  system_label?: string;
  service?: string;
  subclass?: string;
  frr?: string;
  confidence?: number;
  system_confidence?: number;
}

interface Quote {
  id: string;
  supplier_name: string;
  items: QuoteItem[];
}

interface ComparisonRow {
  description: string;
  unit: string;
  quantity: number;
  category: string;
  systemId?: string;
  systemLabel?: string;
  service?: string;
  subclass?: string;
  frr?: string;
  suppliers: Record<string, {
    unitPrice: number | null;
    total: number | null;
    originalDescription: string;
    quantity: number | null;
    unit: string | null;
    normalisedUnit: string | null;
  }>;
  matchStatus: string;
  matchConfidence: number;
  notes?: string;
}

const FRR_PATTERN = /-\/\d+\/\d+|-\/-\/-|\d+\/\d+\/\d+|\(\d+\)\/\d+/i;
const SUBSTRATE_KEYWORDS = ['gib wall','concrete wall','concrete floor','smoke wall','masonry wall','hebel wall','timber wall','steel deck','metal deck'];
const MEASURABLE_ELEMENT_PATTERNS = [/\d+mm/i,/\d+x\d+/i,/cable bundle/i,/cable tray/i,/conduit/i,/pvc pipe/i,/copper pipe/i,/steel pipe/i,/duct/i];
const SERVICE_TYPE_KEYWORDS = ['electrical','hydraulic','mechanical','fire protection','insulation wrap','batt patch','penetration'];
const SUMMARY_PHRASES = ['extra over for fire stopping required not shown on layout','required to achieve compliance','required to achieve insulation rating','can be removed if insulation rating is not required'];
const SUMMARY_PHRASES_ALWAYS_EXCLUDE = ['extra over for fire stopping required not shown on layout'];
const OPTIONAL_KEYWORDS = ['door perimeter seal','lift door seal','flush box intumescent pad','flushbox intumescent pad','intumescent flushbox pad'];

function isMainScopeItem(item: QuoteItem): boolean {
  const desc = (item.description ?? '').toLowerCase();
  const qty = Number(item.quantity ?? 0);
  const rate = Number(item.unit_price ?? 0);
  const total = Number(item.total_price ?? 0);
  const hasPricing = qty > 0 && rate > 0 && total > 0;

  for (const phrase of SUMMARY_PHRASES) {
    if (desc.includes(phrase)) {
      if (SUMMARY_PHRASES_ALWAYS_EXCLUDE.includes(phrase)) return false;
      if (!hasPricing) return false;
    }
  }
  for (const kw of OPTIONAL_KEYWORDS) {
    if (desc.includes(kw)) return false;
  }
  if (!hasPricing) return false;

  const hasFRR = FRR_PATTERN.test(item.description ?? '');
  const hasSubstrate = SUBSTRATE_KEYWORDS.some(kw => desc.includes(kw));
  const hasMeasurable = MEASURABLE_ELEMENT_PATTERNS.some(p => p.test(item.description ?? ''));
  const hasService = SERVICE_TYPE_KEYWORDS.some(kw => desc.includes(kw));

  const nonPricingSignals = [hasFRR, hasSubstrate, hasMeasurable, hasService].filter(Boolean).length;
  return nonPricingSignals >= 2;
}

function normalizeUnitDisplay(unit: string | null | undefined): string {
  if (!unit) return "";

  const unitLower = unit.toLowerCase().trim();
  const unitMap: Record<string, string> = {
    'ea': 'No',
    'each': 'No',
    'lm': 'm',
    'sqm': 'm²',
    'sq m': 'm²',
    'sqm.': 'm²',
    'm2': 'm²',
    'cum': 'm³',
    'cu m': 'm³',
    'm3': 'm³',
  };

  return unitMap[unitLower] || unit;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { projectId, force, quoteIds, trade } = await req.json();

    if (!projectId) {
      throw new Error("projectId is required");
    }

    console.log("📊 compute_award_report: Generating report", { projectId, quoteIds, trade });

    // Load project scoring weights
    const { data: projectData } = await supabase
      .from("projects")
      .select("scoring_weights")
      .eq("id", projectId)
      .maybeSingle();

    // Default weights if not set (matching frontend defaults)
    const scoringWeights = projectData?.scoring_weights || {
      price: 45,
      compliance: 20,
      coverage: 25,
      risk: 10
    };

    console.log("📊 Using scoring weights:", scoringWeights);

    let quotesQuery = supabase
      .from("quotes")
      .select("id, supplier_name")
      .eq("project_id", projectId)
      .eq("is_selected", true)
      .eq("is_latest", true)
      .order("created_at", { ascending: true });

    // Filter by trade if provided
    if (trade) {
      console.log("📊 Filtering to trade:", trade);
      quotesQuery = quotesQuery.eq("trade", trade);
    }

    // Filter by specific quote IDs if provided
    if (quoteIds && Array.isArray(quoteIds) && quoteIds.length > 0) {
      console.log("📊 Filtering to specific quotes:", quoteIds);
      quotesQuery = quotesQuery.in("id", quoteIds);
    }

    const { data: quotes, error: quotesError } = await quotesQuery;

    if (quotesError) throw quotesError;
    if (!quotes || quotes.length < 2) {
      throw new Error("At least 2 quotes are required for comparison");
    }

    const quotesWithItems: Quote[] = [];

    for (const quote of quotes) {
      const { data: items, error: itemsError } = await supabase
        .from("quote_items")
        .select(`
          id, description, unit, quantity, unit_price, total_price,
          scope_category, system_id, system_label, service,
          subclass, frr, confidence, system_confidence
        `)
        .eq("quote_id", quote.id)
        .eq("is_excluded", false);

      if (itemsError) throw itemsError;

      const mainScopeItems = (items || []).filter(isMainScopeItem);
      console.log(`📊 ${quote.supplier_name}: ${items?.length ?? 0} total items → ${mainScopeItems.length} main scope items`);

      quotesWithItems.push({
        id: quote.id,
        supplier_name: quote.supplier_name,
        items: mainScopeItems,
      });
    }

    if (quotesWithItems.length === 0 || !quotesWithItems[0]) {
      throw new Error("No quotes with items found");
    }

    const baselineQuote = quotesWithItems[0];
    const comparisonData: ComparisonRow[] = [];

    if (!baselineQuote.items || baselineQuote.items.length === 0) {
      throw new Error(`Baseline quote ${baselineQuote.supplier_name} has no items`);
    }

    const usedItemIds = new Set<string>();

    for (const baseItem of baselineQuote.items) {
      const row: ComparisonRow = {
        description: baseItem.description,
        unit: baseItem.unit || "",
        quantity: Number(baseItem.quantity) || 1,
        category: baseItem.scope_category || "General",
        systemId: baseItem.system_id,
        systemLabel: baseItem.system_label,
        service: baseItem.service,
        subclass: baseItem.subclass,
        frr: baseItem.frr,
        suppliers: {},
        matchStatus: "exact",
        matchConfidence: 100,
      };

      row.suppliers[baselineQuote.supplier_name] = {
        unitPrice: baseItem.unit_price !== null && baseItem.unit_price !== undefined ? Number(baseItem.unit_price) : null,
        total: baseItem.total_price !== null && baseItem.total_price !== undefined ? Number(baseItem.total_price) : null,
        originalDescription: baseItem.description,
        quantity: Number(baseItem.quantity),
        unit: baseItem.unit || "",
        normalisedUnit: normalizeUnitDisplay(baseItem.unit),
      };

      for (let i = 1; i < quotesWithItems.length; i++) {
        const otherQuote = quotesWithItems[i];
        if (!otherQuote || !otherQuote.items) {
          console.error(`Quote at index ${i} is invalid:`, otherQuote);
          continue;
        }

        const matchedItem = otherQuote.items.find(item => {
          if (!item || !item.description || usedItemIds.has(item.id)) {
            return false;
          }
          const descMatch = item.description.toLowerCase() === baseItem.description.toLowerCase();
          const qtyMatch = Number(item.quantity) === Number(baseItem.quantity);
          const unitMatch = (item.unit || "").toLowerCase() === (baseItem.unit || "").toLowerCase();
          return descMatch && qtyMatch && unitMatch;
        });

        if (matchedItem) {
          usedItemIds.add(matchedItem.id);
          row.suppliers[otherQuote.supplier_name] = {
            unitPrice: matchedItem.unit_price !== null && matchedItem.unit_price !== undefined ? Number(matchedItem.unit_price) : null,
            total: matchedItem.total_price !== null && matchedItem.total_price !== undefined ? Number(matchedItem.total_price) : null,
            originalDescription: matchedItem.description,
            quantity: Number(matchedItem.quantity),
            unit: matchedItem.unit || "",
            normalisedUnit: normalizeUnitDisplay(matchedItem.unit),
          };
        } else {
          row.suppliers[otherQuote.supplier_name] = {
            unitPrice: null,
            total: null,
            originalDescription: "N/A",
            quantity: null,
            unit: null,
            normalisedUnit: null,
          };
          row.matchStatus = "unmatched";
          row.notes = `No match found in ${otherQuote.supplier_name}`;
        }
      }

      comparisonData.push(row);
    }

    for (let i = 1; i < quotesWithItems.length; i++) {
      const otherQuote = quotesWithItems[i];
      if (!otherQuote || !otherQuote.items) {
        continue;
      }

      for (const item of otherQuote.items) {
        if (!item || !item.description || usedItemIds.has(item.id)) {
          continue;
        }

        const alreadyIncluded = comparisonData.some(row =>
          row.suppliers[otherQuote.supplier_name]?.originalDescription === item.description &&
          row.quantity === Number(item.quantity) &&
          row.unit.toLowerCase() === (item.unit || "").toLowerCase()
        );

        if (!alreadyIncluded) {
          usedItemIds.add(item.id);
          const row: ComparisonRow = {
            description: item.description,
            unit: item.unit || "",
            quantity: Number(item.quantity) || 1,
            category: item.scope_category || "General",
            systemId: item.system_id,
            systemLabel: item.system_label,
            service: item.service,
            subclass: item.subclass,
            frr: item.frr,
            suppliers: {},
            matchStatus: "unmatched",
            matchConfidence: 0,
            notes: `Only in ${otherQuote.supplier_name}`,
          };

          row.suppliers[baselineQuote.supplier_name] = {
            unitPrice: null,
            total: null,
            originalDescription: "N/A",
            quantity: null,
            unit: null,
            normalisedUnit: null,
          };

          row.suppliers[otherQuote.supplier_name] = {
            unitPrice: item.unit_price !== null && item.unit_price !== undefined ? Number(item.unit_price) : null,
            total: item.total_price !== null && item.total_price !== undefined ? Number(item.total_price) : null,
            originalDescription: item.description,
            quantity: Number(item.quantity),
            unit: item.unit || "",
            normalisedUnit: normalizeUnitDisplay(item.unit),
          };

          comparisonData.push(row);
        }
      }
    }

    const suppliers = quotesWithItems.map(q => {
      const quotedItems = comparisonData.filter(row =>
        row.suppliers[q.supplier_name]?.unitPrice !== null
      );

      const total = quotedItems.reduce((sum, row) =>
        sum + (row.suppliers[q.supplier_name]?.total || 0), 0
      );

      // Calculate total quantity (sum of all quantities across all quoted items)
      const totalQuantity = quotedItems.reduce((sum, row) =>
        sum + (row.quantity || 0), 0
      );

      const missingItems = comparisonData.length - quotedItems.length;

      return {
        quoteId: q.id,
        supplierName: q.supplier_name,
        supplierId: q.supplier_name,
        adjustedTotal: total,
        itemsQuoted: quotedItems.length,
        totalItems: comparisonData.length,
        totalQuantity: totalQuantity, // NEW: Total sum of quantities for accurate per-unit pricing
        coveragePercent: Math.round((quotedItems.length / comparisonData.length) * 100),
        riskScore: missingItems,
        riskFactors: {
          redCells: 0,
          amberCells: 0,
          missingScope: missingItems,
          lowConfidenceItems: 0,
          totalItems: comparisonData.length,
        },
        itemCount: comparisonData.length,
        notes: [],
      };
    });

    const sortedByPrice = [...suppliers].sort((a, b) => a.adjustedTotal - b.adjustedTotal);
    const sortedByRisk = [...suppliers].sort((a, b) => a.riskScore - b.riskScore);
    const sortedByCoverage = [...suppliers].sort((a, b) => b.coveragePercent - a.coveragePercent);

    // Calculate weighted scores for balanced recommendation
    const lowestPrice = sortedByPrice[0].adjustedTotal;
    const highestPrice = sortedByPrice[sortedByPrice.length - 1].adjustedTotal;
    const maxRisk = Math.max(...suppliers.map(s => s.riskScore));

    const suppliersWithWeightedScores = suppliers.map(s => {
      // Price Score: 10 = cheapest, 0 = most expensive
      const priceRange = highestPrice - lowestPrice;
      const priceScore = priceRange > 0
        ? 10 - ((s.adjustedTotal - lowestPrice) / priceRange) * 10
        : 10;

      // Coverage Score: Direct percentage to 0-10 scale
      const coverageScore = (s.coveragePercent / 100) * 10;

      // Risk Score: 10 = no missing items, 0 = many missing items
      const riskScore = maxRisk > 0 ? 10 - (s.riskScore / maxRisk) * 10 : 10;

      // Compliance Score: Based on risk factors (fewer missing items = better)
      const complianceScore = maxRisk > 0 ? 10 - (s.riskScore / maxRisk) * 5 : 10;

      // Weighted Total: Use custom scoring weights from project settings
      // Convert percentages to decimal (e.g., 40% -> 0.4)
      const weightedTotal = (
        (priceScore * (scoringWeights.price / 100)) +
        (complianceScore * (scoringWeights.compliance / 100)) +
        (coverageScore * (scoringWeights.coverage / 100)) +
        (riskScore * (scoringWeights.risk / 100))
      ) * 10; // Scale to 0-100

      return { ...s, weightedTotal };
    });

    const sortedByWeightedScore = [...suppliersWithWeightedScores].sort(
      (a, b) => b.weightedTotal - a.weightedTotal
    );

    const recommendations = [
      {
        type: "BEST_VALUE",
        supplier: sortedByPrice[0],
        reason: `Lowest total price at $${sortedByPrice[0].adjustedTotal.toLocaleString()}`,
        confidence: 85,
      },
      {
        type: "LOWEST_RISK",
        supplier: sortedByRisk[0],
        reason: `Lowest risk with ${sortedByRisk[0].riskScore} missing scope items and ${sortedByRisk[0].coveragePercent.toFixed(1)}% coverage`,
        confidence: 80,
      },
      {
        type: "BALANCED",
        supplier: sortedByWeightedScore[0],
        reason: `Highest weighted score (${sortedByWeightedScore[0].weightedTotal.toFixed(1)}/100) combining price, compliance, coverage, and risk factors`,
        confidence: 85,
      },
    ];

    const awardSummary = {
      suppliers: suppliersWithWeightedScores,
      totalSystems: comparisonData.length,
      equalisationMode: "MODEL",
      recommendations,
      generatedAt: new Date().toISOString(),
      scoringWeights,
    };

    const resultJson = {
      comparisonData,
      awardSummary,
      aiAnalysis: null,
    };

    const { data: reportData, error: reportError } = await supabase
      .from("award_reports")
      .insert({
        project_id: projectId,
        status: "ready",
        result_json: resultJson,
        params_json: { equalisationMode: "MODEL" },
        quotes_checksum: quotes.map(q => q.id).join("-"),
        trade: trade || "passive_fire",
      })
      .select()
      .single();

    if (reportError) throw reportError;

    try {
      const { data: projectInfo } = await supabase
        .from("projects")
        .select("organisation_id, user_id")
        .eq("id", projectId)
        .single();

      if (projectInfo) {
        await supabase
          .from("user_activity_log")
          .insert({
            organisation_id: projectInfo.organisation_id,
            user_id: projectInfo.user_id,
            activity_type: "report_generated",
            project_id: projectId,
            metadata: { reportId: reportData.id }
          });
      }
    } catch (logError) {
      console.error("Failed to log activity:", logError);
    }

    return new Response(
      JSON.stringify({ reportId: reportData.id }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error computing award report:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to compute award report" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
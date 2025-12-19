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
  suppliers: Record<string, {
    unitPrice: number | null;
    total: number | null;
    originalDescription: string;
  }>;
  matchStatus: string;
  matchConfidence: number;
  notes?: string;
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

    const { projectId, force, quoteIds } = await req.json();

    if (!projectId) {
      throw new Error("projectId is required");
    }

    console.log("📊 compute_award_report: Generating report", { projectId, quoteIds });

    let quotesQuery = supabase
      .from("quotes")
      .select("id, supplier_name")
      .eq("project_id", projectId)
      .eq("is_latest", true)
      .order("created_at", { ascending: true });

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
        .select("id, description, unit, quantity, unit_price, total_price, scope_category")
        .eq("quote_id", quote.id)
        .eq("is_excluded", false);

      if (itemsError) throw itemsError;

      quotesWithItems.push({
        id: quote.id,
        supplier_name: quote.supplier_name,
        items: items || [],
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
        suppliers: {},
        matchStatus: "exact",
        matchConfidence: 100,
      };

      row.suppliers[baselineQuote.supplier_name] = {
        unitPrice: Number(baseItem.unit_price),
        total: Number(baseItem.total_price),
        originalDescription: baseItem.description,
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
            unitPrice: Number(matchedItem.unit_price),
            total: Number(matchedItem.total_price),
            originalDescription: matchedItem.description,
          };
        } else {
          row.suppliers[otherQuote.supplier_name] = {
            unitPrice: null,
            total: null,
            originalDescription: "N/A",
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
            suppliers: {},
            matchStatus: "unmatched",
            matchConfidence: 0,
            notes: `Only in ${otherQuote.supplier_name}`,
          };

          row.suppliers[baselineQuote.supplier_name] = {
            unitPrice: null,
            total: null,
            originalDescription: "N/A",
          };

          row.suppliers[otherQuote.supplier_name] = {
            unitPrice: Number(item.unit_price),
            total: Number(item.total_price),
            originalDescription: item.description,
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

      const missingItems = comparisonData.length - quotedItems.length;

      return {
        supplierName: q.supplier_name,
        supplierId: q.supplier_name,
        adjustedTotal: total,
        itemsQuoted: quotedItems.length,
        totalItems: comparisonData.length,
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

      // Weighted Total: Price 40%, Compliance 25%, Coverage 20%, Risk 15%
      const weightedTotal = (
        (priceScore * 0.4) +
        (complianceScore * 0.25) +
        (coverageScore * 0.2) +
        (riskScore * 0.15)
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
      suppliers,
      totalSystems: comparisonData.length,
      equalisationMode: "MODEL",
      recommendations,
      generatedAt: new Date().toISOString(),
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
      })
      .select()
      .single();

    if (reportError) throw reportError;

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
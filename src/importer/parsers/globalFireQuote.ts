import { LineItem, ParsedQuote, ParsedTotals } from "../types";
import { moneyToNum, normalizeUnit } from "../utils";

export function parseGlobalFireQuote(text: string): ParsedQuote {
  const items: LineItem[] = [];
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).map(l => l.replace(/\u00a0/g, " ").trim()).filter(Boolean);

  console.log('[GlobalFire] Parsing PDF with', lines.length, 'lines');

  let itemIndex = 0;
  let currentServiceType = '';

  const serviceTypes = ['Cable Tray', 'Cable Bundle', 'Single Cable', 'Pex Pipe', 'Steel Pipe',
                        'PVC Pipe', 'Copper Pipe', 'Insulated Copper Pipe', 'Brass Wingback',
                        'Stainless Steel Pipe', 'Multi Service', 'Conduit', 'Fire Box', 'Sprinkler Pipe'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.match(/^(Electrical|Hydraulic|Mechanical|Fire Protection)$/i)) {
      currentServiceType = line;
      console.log('[GlobalFire] Found section:', currentServiceType);
      continue;
    }

    const matchedService = serviceTypes.find(s => line.toLowerCase() === s.toLowerCase());
    if (!matchedService) continue;

    let size = '';
    let substrate = '';
    let qty = 0;
    let rateGroup = '';
    let rate = 0;
    let total = 0;

    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      const nextLine = lines[j];

      if (serviceTypes.some(s => nextLine.toLowerCase() === s.toLowerCase())) {
        break;
      }

      if (nextLine.match(/^\d+mm$/i) || nextLine.match(/^Up to \d+mm$/i)) {
        size = nextLine;
      } else if (nextLine.match(/^(Concrete Floor|Concrete Wall|Timber Infill Floor|GIB Wall|13mm GIB Wall)$/i)) {
        substrate = nextLine;
      } else if (nextLine.match(/^\d+$/) && !qty) {
        qty = parseInt(nextLine);
      } else if (nextLine.match(/^[A-Z]\d/)) {
        rateGroup = nextLine;
      } else if (nextLine.match(/^\$?[\d,]+\.?\d*$/) && nextLine !== '$') {
        const num = moneyToNum(nextLine);
        if (num) {
          if (!rate) {
            rate = num;
          } else if (!total) {
            total = num;
            break;
          }
        }
      }
    }

    if (qty && total) {
      if (!rate) {
        rate = total / qty;
      }

      let description = matchedService;
      if (size) description += ` ${size}`;
      if (substrate) description += ` - ${substrate}`;

      itemIndex++;
      items.push({
        index: itemIndex,
        description,
        qty,
        unit: 'No.',
        rate,
        total,
        section: currentServiceType,
        normalized: { unit: 'No.', systemNames: [] }
      });

      console.log(`[GlobalFire] Item ${itemIndex}: ${description} | Qty: ${qty} | Rate: $${rate?.toFixed(2)} | Total: $${total.toFixed(2)}`);
    }
  }

  console.log(`[GlobalFire] Parsed ${items.length} items`);
  if (items.length > 0) {
    console.log(`[GlobalFire] Sample item:`, items[0]);
  }

  const totals: ParsedTotals = {};

  const grandTotalMatch = text.match(/GRAND\s*TOTAL[:\s]*\$?\s*([\d,]+\.?\d*)/i);
  if (grandTotalMatch) {
    totals.grandTotal = moneyToNum(grandTotalMatch[1]);
  }

  const subtotalMatches = [...text.matchAll(/SUB\s*TOTAL[:\s]*\$?\s*([\d,]+\.?\d*)/gi)];
  if (subtotalMatches.length > 0) {
    const subtotalValues = subtotalMatches.map(m => moneyToNum(m[1]) || 0);
    totals.penetrationsSubtotal = subtotalValues.reduce((a, b) => a + b, 0);
  }

  const sumLines = items.reduce((acc, it) => acc + (it.total ?? 0), 0);

  if (totals.grandTotal) {
    const diff = totals.grandTotal - sumLines;
    if (Math.abs(diff) > 1) {
      totals.addOns = {
        PG_Margin: diff > 0 ? diff * 0.5 : 0,
        PS3_QA: diff > 0 ? diff * 0.5 : 0
      };
    }
  }

  if (items.length === 0) {
    warnings.push("No line items found");
  }

  return {
    supplierKey: "GlobalFire_Generic",
    items,
    totals,
    warnings
  };
}

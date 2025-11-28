import { LineItem, ParsedQuote, ParsedTotals } from "../types";
import { moneyToNum, normalizeSystems, normalizeUnit } from "../utils";

export function parsePassiveFireQuote(text: string): ParsedQuote {
  const items: LineItem[] = [];
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).map(l => l.replace(/\u00a0/g, " ").trim()).filter(l => l && l !== 'B');

  console.log('[PassiveFire] Parsing PDF with', lines.length, 'lines');
  console.log('[PassiveFire] First 50 lines:');
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    console.log(`  ${i}: "${lines[i]}"`);
  }

  let itemIndex = 0;
  let currentSection = '';
  let inDataTable = false;

  const sectionHeaders = ['Cables', 'Cable Trays Wall', 'Miscellaneous', 'Metal Pipes', 'Pipe'];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    const headerPattern = /description.*products.*unit.*total|tem.*description/i;
    if (headerPattern.test(raw.toLowerCase())) {
      inDataTable = true;
      console.log('[PassiveFire] Found table header at line', i, ':', raw);
      continue;
    }

    if (raw.toLowerCase().includes('total estimate') || raw.toLowerCase().includes('grand total')) {
      console.log('[PassiveFire] Found grand total at line', i, ':', raw);
      inDataTable = false;
      continue;
    }

    if (raw.toLowerCase().includes('subtotal')) {
      console.log('[PassiveFire] Found section subtotal at line', i, ':', raw, '(continuing to parse)');
      continue;
    }

    const sectionMatch = sectionHeaders.find(h => raw.toLowerCase().includes(h.toLowerCase()));
    if (sectionMatch && !inDataTable) {
      currentSection = sectionMatch;
      console.log('[PassiveFire] Section at line', i, ':', currentSection);
      continue;
    }

    if (!inDataTable) continue;

    console.log(`[PassiveFire] Processing data line ${i}: "${raw}"`);

    const allNumbers = raw.match(/\d+(?:[,.]\d+)?/g) || [];
    console.log(`  All numbers found:`, allNumbers);

    if (allNumbers.length >= 2) {
      const lastNum = allNumbers[allNumbers.length - 1];
      const lastHasDecimal = lastNum.includes('.') || lastNum.includes(',');

      if (lastHasDecimal) {
        const totalStr = lastNum.replace(',', '');
        const totalIdx = raw.lastIndexOf(lastNum);
        const beforeTotal = raw.substring(0, totalIdx).trim();

        const ratePattern = /(\d+(?:[,\s]\d+)*(?:\.\d+)?)\s*$/;
        const rateMatch = beforeTotal.match(ratePattern);

        if (rateMatch) {
          const rateStr = rateMatch[1].replace(/[\s,]/g, '');
          const rateIdx = beforeTotal.lastIndexOf(rateMatch[1]);
          const beforeRate = beforeTotal.substring(0, rateIdx).trim();

          const qtyUnitPattern = /(\d+(?:\.\d+)?)\s*[\[|\]]*\s*([%§1lI]+|Nr|EA|LM|M2|M|Each|Sum|nM|nN|nn|m|ss|[sS]{2})\s*$/i;
          const qtyUnitMatch = beforeRate.match(qtyUnitPattern);

          console.log(`  Before rate: "${beforeRate}"`);
          console.log(`  Qty/Unit match:`, qtyUnitMatch);

          if (qtyUnitMatch) {
            const qtyStr = qtyUnitMatch[1];
            let unit = qtyUnitMatch[2];

            if (/[%§1lI]/i.test(unit)) unit = 'M';
            if (/^(nn|nM|nN|ss)$/i.test(unit)) unit = 'M';

            const beforeQty = beforeRate.substring(0, qtyUnitMatch.index).trim();
            const desc = beforeQty
              .replace(/^\d+\s+/, '')
              .replace(/^[|\]]\s*/, '')
              .replace(/\s+\[.*?\]\s*$/, '')
              .trim();

            console.log(`  Description: "${desc}" (length=${desc.length})`);
            console.log(`  Qty: ${qtyStr}, Unit: ${unit}, Rate: ${rateStr}, Total: ${totalStr}`);

            if (desc.length > 2) {
              itemIndex++;
              items.push({
                index: itemIndex,
                description: desc,
                qty: parseFloat(qtyStr),
                unit: normalizeUnit(unit),
                rate: moneyToNum(rateStr),
                total: moneyToNum(totalStr),
                section: currentSection,
                normalized: { unit: normalizeUnit(unit), systemNames: normalizeSystems(desc) }
              });
              console.log(`[PassiveFire] ✓ Item ${itemIndex}: "${desc}" | Qty: ${qtyStr} ${unit} | Rate: $${rateStr} | Total: $${totalStr}`);
              continue;
            } else {
              console.log(`  ✗ Description too short`);
            }
          } else {
            console.log(`  ✗ No qty/unit pattern found in "${beforeRate}"`);
          }
        } else {
          console.log(`  ✗ No rate pattern found in "${beforeTotal}"`);
        }
      } else {
        console.log(`  ✗ Last number has no decimal: ${lastNum}`);
      }
    } else {
      console.log(`  ✗ Not enough numbers found`);
    }

    console.log(`  ✗ No match found for this line`);

    const specialSum = /^(.+?)\s+(N\/A|n\/a)\s+(\d+)\s+Sum\s+\$\s*([\d,]+\.?\d*)\s+\$\s*([\d,]+\.?\d*)$/i;
    const specialMatch = raw.match(specialSum);
    if (specialMatch) {
      const [, desc, , qtyStr, rateStr, totalStr] = specialMatch;
      itemIndex++;
      items.push({
        index: itemIndex,
        description: desc.trim(),
        qty: parseFloat(qtyStr),
        unit: 'Sum',
        rate: moneyToNum(rateStr),
        total: moneyToNum(totalStr),
        section: currentSection,
        normalized: { unit: 'Sum', systemNames: normalizeSystems(desc) }
      });
      console.log(`[PassiveFire] ✓ Sum Item ${itemIndex}: "${desc}" | Rate: $${rateStr} | Total: $${totalStr}`);
      continue;
    }

    console.log(`[PassiveFire] ✗ No match for line ${i}`);
  }

  const totals: ParsedTotals = {};
  const grandTotalMatch = text.match(/grand\s*total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i);
  if (grandTotalMatch) {
    totals.grandTotal = moneyToNum(grandTotalMatch[1]);
  }

  const sumLines = items.reduce((acc, it) => acc + (it.total ?? 0), 0);
  totals.penetrationsSubtotal = sumLines;

  if (totals.grandTotal) {
    const diff = Math.abs(sumLines - totals.grandTotal);
    if (diff > 0.5) {
      const addOnTotal = totals.grandTotal - sumLines;
      totals.addOns = { PG_Margin: addOnTotal };
      warnings.push(`Add-ons detected: ${addOnTotal.toFixed(2)}`);
    }
  }

  return {
    supplierKey: "PassiveFire_Generic",
    items,
    totals,
    warnings
  };
}

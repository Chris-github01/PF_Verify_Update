export async function generateSHA256Hash(content: string | object): Promise<string> {
  const text = typeof content === 'string' ? content : JSON.stringify(content);

  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

export async function verifyHash(content: string | object, expectedHash: string): Promise<boolean> {
  const computedHash = await generateSHA256Hash(content);
  return computedHash === expectedHash;
}

export function generateQuoteFingerprint(quote: {
  supplier_name: string;
  quote_reference?: string;
  total_amount: number;
  items_count: number;
  import_date: string;
  items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}): object {
  return {
    supplier: quote.supplier_name,
    reference: quote.quote_reference || '',
    total: quote.total_amount,
    itemsCount: quote.items_count,
    importDate: quote.import_date,
    items: quote.items?.map(item => ({
      desc: item.description.toLowerCase().trim(),
      qty: item.quantity,
      rate: item.unit_price,
      total: item.total_price
    })) || []
  };
}

export function generateReportFingerprint(report: {
  project_id: string;
  params_json: object;
  result_json: object;
  generated_at: string;
}): object {
  return {
    projectId: report.project_id,
    generatedAt: report.generated_at,
    params: report.params_json,
    result: report.result_json
  };
}

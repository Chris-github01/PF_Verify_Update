export async function parseExcel(file: File): Promise<any> {
  console.log('Excel Parser not fully implemented', file.name);
  return { sheets: [], data: [] };
}

export async function parseCSV(file: File): Promise<any> {
  console.log('CSV Parser not fully implemented', file.name);
  return { data: [] };
}

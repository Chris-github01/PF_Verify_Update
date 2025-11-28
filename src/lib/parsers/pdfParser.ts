export async function parsePDF(file: File): Promise<any> {
  console.log('PDF Parser not fully implemented', file.name);
  return { pages: [], text: '', metadata: {} };
}

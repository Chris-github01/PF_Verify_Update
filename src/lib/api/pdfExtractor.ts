const PDF_EXTRACTOR_BASE_URL = 'https://verify-pdf-extractor.onrender.com';

export type ExtractedTable = {
  page: number;
  rows: string[][];
};

export type ExtractedQuoteResponse = {
  filename: string;
  num_pages: number;
  text: string;
  tables: ExtractedTable[];
};

export async function checkExtractorHealth(): Promise<{ status: string; message?: string }> {
  try {
    const response = await fetch(`${PDF_EXTRACTOR_BASE_URL}/health`, {
      method: 'GET',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Health check failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('PDF Extractor health check error:', error);
    throw new Error(
      error instanceof Error
        ? `Health check failed: ${error.message}`
        : 'Health check failed: Unknown error'
    );
  }
}

export async function extractQuoteFromPdf(file: File): Promise<ExtractedQuoteResponse> {
  try {
    const formData = new FormData();
    formData.append('file', file, file.name);

    const response = await fetch(`${PDF_EXTRACTOR_BASE_URL}/extract-quote`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Extractor API error: ${response.status} – ${text}`);
    }

    const data = await response.json() as ExtractedQuoteResponse;
    console.log('PDF Extractor result (from helper):', data);

    return data;
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error(
      error instanceof Error
        ? `Failed to extract PDF: ${error.message}`
        : 'Failed to extract PDF: Unknown error'
    );
  }
}

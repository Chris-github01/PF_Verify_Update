/**
 * PDF Generation Utility using Gotenberg
 */

import { supabase } from '../supabase';

export interface PdfGenerationOptions {
  htmlContent: string;
  filename: string;
  projectName?: string;
  contractNumber?: string;
  reportType?: string;
}

export interface PdfGenerationResult {
  success: boolean;
  blob?: Blob;
  error?: string;
  fallbackHtml?: string;
}

/**
 * Generate PDF using Gotenberg edge function
 */
export async function generatePdfWithGotenberg(
  options: PdfGenerationOptions
): Promise<PdfGenerationResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate_pdf_gotenberg`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.message || 'PDF generation failed',
        fallbackHtml: options.htmlContent
      };
    }

    const contentType = response.headers.get('Content-Type');

    if (contentType?.includes('application/pdf')) {
      const blob = await response.blob();
      return {
        success: true,
        blob
      };
    } else {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.message || 'Invalid response from server',
        fallbackHtml: options.htmlContent
      };
    }
  } catch (error) {
    console.error('PDF generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      fallbackHtml: options.htmlContent
    };
  }
}

/**
 * Download PDF blob to user's device
 */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Fallback to HTM export with print dialog
 */
export function fallbackToHtmExport(htmlContent: string, filename: string): void {
  const htmlWithAutoPrint = htmlContent.replace(
    '</body>',
    `
    <script>
      window.onload = function() {
        setTimeout(function() {
          window.print();
        }, 1000);
      };

      window.addEventListener('DOMContentLoaded', function() {
        const banner = document.createElement('div');
        banner.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #f97316; color: white; padding: 16px; text-align: center; font-size: 16px; font-weight: 600; z-index: 10000; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';
        banner.innerHTML = '📄 PDF service unavailable. Print Dialog Opening... Select "Save as PDF" to save this report';
        document.body.insertBefore(banner, document.body.firstChild);

        window.addEventListener('beforeprint', function() {
          banner.style.display = 'none';
        });

        window.addEventListener('afterprint', function() {
          banner.style.display = 'block';
          banner.innerHTML = '✅ Print dialog closed. You can close this window now.';
          banner.style.background = '#059669';
        });
      });
    </script>
    </body>
  `
  );

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups for this site');
    return;
  }

  printWindow.document.write(htmlWithAutoPrint);
  printWindow.document.close();
}

/**
 * Main PDF generation function with automatic fallback
 */
export async function generateAndDownloadPdf(
  options: PdfGenerationOptions
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const pdfFilename = `${options.filename}_${today}.pdf`;

  const result = await generatePdfWithGotenberg(options);

  if (result.success && result.blob) {
    downloadPdfBlob(result.blob, pdfFilename);
    return;
  }

  console.warn('PDF generation failed, falling back to HTM export:', result.error);
  alert(`PDF generation service unavailable. Falling back to browser print.\n\nError: ${result.error}`);

  if (result.fallbackHtml) {
    fallbackToHtmExport(result.fallbackHtml, options.filename);
  }
}

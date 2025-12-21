import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface GotenbergPdfRequest {
  htmlContent: string;
  filename: string;
  projectName?: string;
  contractNumber?: string;
  reportType?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const requestStartTime = Date.now();
  let userId: string | undefined;
  let reportType: string | undefined;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const gotenbergUrl = Deno.env.get('GOTENBERG_URL');
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!gotenbergUrl) {
      throw new Error('GOTENBERG_URL environment variable not set');
    }

    // Authenticate request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify user session
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    userId = user.id;

    const requestBody: GotenbergPdfRequest = await req.json();
    const {
      htmlContent,
      filename,
      projectName,
      contractNumber,
      reportType: reqReportType,
    } = requestBody;

    reportType = reqReportType;

    if (!htmlContent) {
      throw new Error('htmlContent is required');
    }

    if (!filename) {
      throw new Error('filename is required');
    }

    // Generate filename with timestamp
    const today = new Date().toISOString().split('T')[0];
    const pdfFilename = `${filename}_${today}.pdf`;

    // Prepare header/footer content
    const leftHeader = contractNumber
      ? `${projectName || 'Project'} | ${contractNumber}`
      : projectName || 'Project';

    // Build complete HTML with print CSS and header/footer styling
    const completeHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* === PAGE SETUP === */
    @page {
      size: A4;
      margin: 12mm 12mm 14mm 12mm;
    }

    /* === PRINT COLOR PRESERVATION === */
    * {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
      color-adjust: exact;
    }

    /* === PAGE BREAKS === */
    .avoid-break {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .page-break {
      break-before: page;
      page-break-before: always;
    }

    /* === RESPONSIVE IMAGES === */
    img {
      max-width: 100%;
      height: auto;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* === TABLE HANDLING === */
    table {
      break-inside: auto;
      page-break-inside: auto;
      width: 100%;
    }

    tr {
      break-inside: avoid;
      page-break-inside: avoid;
      break-after: auto;
    }

    thead {
      display: table-header-group;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    tfoot {
      display: table-footer-group;
    }

    tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* === PREVENT ORPHANS & WIDOWS === */
    p, li, h1, h2, h3, h4, h5, h6 {
      orphans: 3;
      widows: 3;
    }

    h1, h2, h3, h4, h5, h6 {
      break-after: avoid;
      page-break-after: avoid;
    }

    /* === CARD/SECTION BREAKS === */
    .card, .section-card, .stat-card {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* === HEADER & FOOTER STYLING === */
    .pdf-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 10mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 9pt;
      color: #6b7280;
      padding: 0 12mm;
    }

    .pdf-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 12mm;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 8pt;
      color: #9ca3af;
    }

    .pdf-content {
      margin-top: 12mm;
      margin-bottom: 14mm;
    }

    /* === PRINT-SPECIFIC UTILITIES === */
    @media print {
      .no-print {
        display: none !important;
      }

      .print-only {
        display: block !important;
      }

      ul, ol {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      li {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }

    @media screen {
      .print-only {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="pdf-content">
${htmlContent}
  </div>
</body>
</html>
`;

    console.log(`📄 [Gotenberg] Generating PDF: ${pdfFilename}`);
    console.log(`📄 [Gotenberg] HTML size: ${completeHtml.length} bytes`);

    // Create form data for Gotenberg
    const formData = new FormData();

    // Add HTML file
    const htmlBlob = new Blob([completeHtml], { type: 'text/html' });
    formData.append('files', htmlBlob, 'index.html');

    // Add Gotenberg options
    formData.append('paperWidth', '8.27'); // A4 width in inches
    formData.append('paperHeight', '11.69'); // A4 height in inches
    formData.append('marginTop', '0.47'); // 12mm in inches
    formData.append('marginBottom', '0.55'); // 14mm in inches
    formData.append('marginLeft', '0.47'); // 12mm in inches
    formData.append('marginRight', '0.47'); // 12mm in inches
    formData.append('printBackground', 'true');
    formData.append('preferCssPageSize', 'true');
    formData.append('emulatedMediaType', 'print');

    // Add header and footer
    formData.append('headerHtml', `
      <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 9pt;
              color: #6b7280;
              margin: 0;
              padding: 0 12mm;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
          </style>
        </head>
        <body>
          <div>${leftHeader}</div>
          <div>${today} | Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
        </body>
      </html>
    `);

    formData.append('footerHtml', `
      <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 8pt;
              color: #9ca3af;
              margin: 0;
              text-align: center;
            }
          </style>
        </head>
        <body>
          Generated by VerifyTrade
        </body>
      </html>
    `);

    // Call Gotenberg API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
      const gotenbergResponse = await fetch(
        `${gotenbergUrl}/forms/chromium/convert/html`,
        {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!gotenbergResponse.ok) {
        const errorText = await gotenbergResponse.text();
        console.error('❌ [Gotenberg] Error:', errorText);
        throw new Error(`Gotenberg API error: ${gotenbergResponse.status} - ${errorText}`);
      }

      const pdfBuffer = await gotenbergResponse.arrayBuffer();
      const pdfSize = pdfBuffer.byteLength;
      const duration = Date.now() - requestStartTime;

      console.log(`✅ [Gotenberg] PDF generated: ${pdfFilename} (${pdfSize} bytes in ${duration}ms)`);

      return new Response(pdfBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfFilename}"`,
        },
      });
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('PDF generation timeout (60s)');
      }
      throw error;
    }

  } catch (error) {
    const duration = Date.now() - requestStartTime;
    console.error(`❌ [Gotenberg] PDF generation error (${duration}ms):`, error);

    // Log error details for debugging
    console.error('Error details:', {
      userId,
      reportType,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
    });

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'PDF generation failed',
        fallback: 'htm_export',
        message: 'Gotenberg service unavailable. Please use HTM export as fallback.',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
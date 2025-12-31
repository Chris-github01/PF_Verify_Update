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
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Gotenberg URL from environment or system_config
    let gotenbergUrl = Deno.env.get('GOTENBERG_URL');

    if (!gotenbergUrl) {
      console.log('📄 [Gotenberg] GOTENBERG_URL not in env, checking system_config...');
      const { data: configData } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'GOTENBERG_URL')
        .single();

      if (configData?.value) {
        gotenbergUrl = configData.value;
        console.log('📄 [Gotenberg] Using URL from system_config');
      } else {
        throw new Error('GOTENBERG_URL not found in environment or system_config');
      }
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
      /* Margins MUST match Gotenberg formData settings */
      /* Top: 22mm (header 18mm + buffer 4mm) */
      /* Bottom: 18mm (footer 14mm + buffer 4mm) */
      /* Left/Right: 12mm */
      margin: 22mm 12mm 18mm 12mm;
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

    /* === CONTENT CONTAINER === */
    /* Note: Header/footer are handled natively by Gotenberg via headerHtml/footerHtml */
    /* Do NOT use CSS fixed positioning for header/footer - it conflicts with Gotenberg */
    .pdf-content {
      margin: 0;
      padding: 0;
    }

    /* === PRINT-SPECIFIC UTILITIES === */
    @media print {
      body {
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Remove viewport-based heights */
      .page {
        min-height: auto !important;
        height: auto !important;
      }

      .page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }

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

      /* Keep recommendation cards together */
      .recommendation-card, .supplier-card {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
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
    // CRITICAL: Margins MUST reserve space for header/footer height + buffer
    // Header height ~18mm + 4mm buffer = 22mm = 0.87"
    // Footer height ~14mm + 4mm buffer = 18mm = 0.71"
    formData.append('paperWidth', '8.27'); // A4 width in inches
    formData.append('paperHeight', '11.69'); // A4 height in inches
    formData.append('marginTop', '0.87'); // 22mm (header 18mm + buffer 4mm)
    formData.append('marginBottom', '0.71'); // 18mm (footer 14mm + buffer 4mm)
    formData.append('marginLeft', '0.47'); // 12mm in inches
    formData.append('marginRight', '0.47'); // 12mm in inches
    formData.append('printBackground', 'true');
    formData.append('preferCssPageSize', 'true');
    formData.append('emulatedMediaType', 'print');
    formData.append('scale', '1.0'); // Explicit scale for consistent rendering

    // ============================================================================
    // HEADER & FOOTER - GOTENBERG NATIVE SYSTEM
    // ============================================================================
    // CRITICAL: Uses Chromium placeholders that Gotenberg auto-populates:
    // - <span class="pageNumber"></span> → current page number
    // - <span class="totalPages"></span> → total page count
    // ============================================================================

    formData.append('headerHtml', `
      <html>
        <head>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 9pt;
              color: #374151;
              margin: 0;
              padding: 8mm 12mm;
              height: 18mm;
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #f97316;
              background: white;
            }
            .left {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .logo {
              width: 32px;
              height: 32px;
              background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .brand {
              font-size: 14px;
              font-weight: 700;
              color: #111827;
            }
            .right {
              text-align: right;
            }
            .doc-title {
              font-size: 10pt;
              font-weight: 600;
              color: #374151;
              margin-bottom: 2px;
            }
            .page-info {
              font-size: 8pt;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <div class="left">
            <div class="logo">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
              </svg>
            </div>
            <div class="brand">VerifyTrade</div>
          </div>
          <div class="right">
            ${reportType ? `<div class="doc-title">${reportType}</div>` : ''}
            <div class="page-info">
              ${leftHeader} | ${today} | Page <span class="pageNumber"></span> of <span class="totalPages"></span>
            </div>
          </div>
        </body>
      </html>
    `);

    formData.append('footerHtml', `
      <html>
        <head>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 8pt;
              color: #9ca3af;
              margin: 0;
              padding: 6mm 12mm;
              height: 14mm;
              display: flex;
              justify-content: center;
              align-items: center;
              border-top: 1px solid #e5e7eb;
              background: white;
            }
            .footer-content {
              color: #f97316;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="footer-content">Generated by VerifyTrade www.verifytrade.co.nz</div>
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
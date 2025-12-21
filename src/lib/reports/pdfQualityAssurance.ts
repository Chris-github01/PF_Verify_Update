/**
 * PDF Quality Assurance Utility
 *
 * Detects and fixes common PDF generation issues:
 * - Empty sections that create blank pages
 * - Excessive whitespace
 * - Broken page breaks
 * - Missing content warnings
 */

interface QaResult {
  cleaned: string;
  issues: QaIssue[];
  stats: {
    emptySectionsRemoved: number;
    excessiveWhitespaceFixed: number;
    orphanedPageBreaksRemoved: number;
    totalLength: number;
  };
}

interface QaIssue {
  type: 'warning' | 'error' | 'info';
  message: string;
  location?: string;
}

/**
 * Run QA pass on HTML content before generating PDF
 */
export function runPdfQualityAssurance(htmlContent: string): QaResult {
  const issues: QaIssue[] = [];
  let cleaned = htmlContent;
  let emptySectionsRemoved = 0;
  let excessiveWhitespaceFixed = 0;
  let orphanedPageBreaksRemoved = 0;

  // 1. Remove empty sections/divs that could create blank pages
  const emptyPatterns = [
    // Empty divs with page breaks
    /<div[^>]*class="[^"]*pdf-page-break[^"]*"[^>]*>\s*<\/div>/gi,
    /<div[^>]*class="[^"]*page-break[^"]*"[^>]*>\s*<\/div>/gi,

    // Empty sections
    /<section[^>]*>\s*<\/section>/gi,

    // Empty pages
    /<div[^>]*class="[^"]*page[^"]*"[^>]*>\s*<\/div>/gi,

    // Empty cards
    /<div[^>]*class="[^"]*pdf-card[^"]*"[^>]*>\s*<\/div>/gi,
  ];

  emptyPatterns.forEach(pattern => {
    const matches = cleaned.match(pattern);
    if (matches) {
      emptySectionsRemoved += matches.length;
      cleaned = cleaned.replace(pattern, '');
      issues.push({
        type: 'info',
        message: `Removed ${matches.length} empty section(s) that would create blank pages`,
      });
    }
  });

  // 2. Fix excessive whitespace (more than 3 consecutive line breaks)
  const whitespacePattern = /\n\s*\n\s*\n\s*\n+/g;
  const whitespaceMatches = cleaned.match(whitespacePattern);
  if (whitespaceMatches) {
    excessiveWhitespaceFixed = whitespaceMatches.length;
    cleaned = cleaned.replace(whitespacePattern, '\n\n');
    issues.push({
      type: 'info',
      message: `Fixed ${excessiveWhitespaceFixed} instance(s) of excessive whitespace`,
    });
  }

  // 3. Remove orphaned page breaks (page breaks with no content after them)
  const orphanedBreakPattern = /<div[^>]*class="[^"]*pdf-page-break[^"]*"[^>]*><\/div>\s*(<\/body>|<\/div>|<\/section>)/gi;
  const orphanedMatches = cleaned.match(orphanedBreakPattern);
  if (orphanedMatches) {
    orphanedPageBreaksRemoved = orphanedMatches.length;
    cleaned = cleaned.replace(orphanedBreakPattern, '$1');
    issues.push({
      type: 'info',
      message: `Removed ${orphanedPageBreaksRemoved} orphaned page break(s)`,
    });
  }

  // 4. Warn about very large content that might cause issues
  const contentSize = new Blob([cleaned]).size;
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (contentSize > maxSize) {
    issues.push({
      type: 'warning',
      message: `Content size (${(contentSize / 1024 / 1024).toFixed(2)}MB) exceeds recommended maximum (${maxSize / 1024 / 1024}MB). Consider splitting into multiple PDFs.`,
    });
  }

  // 5. Detect sections that might cause page overflow
  const detectOverflowRisks = (html: string) => {
    // Very long tables without breaks
    const longTablePattern = /<table[^>]*>[\s\S]{10000,}<\/table>/gi;
    const longTables = html.match(longTablePattern);
    if (longTables && longTables.length > 0) {
      issues.push({
        type: 'warning',
        message: `Found ${longTables.length} large table(s). Ensure they have proper pagination support.`,
        location: 'Tables',
      });
    }

    // Very long unbroken text
    const longTextPattern = /<p[^>]*>[\s\S]{5000,}<\/p>/gi;
    const longTexts = html.match(longTextPattern);
    if (longTexts && longTexts.length > 0) {
      issues.push({
        type: 'info',
        message: `Found ${longTexts.length} very long paragraph(s). Consider breaking them up for better readability.`,
        location: 'Paragraphs',
      });
    }
  };

  detectOverflowRisks(cleaned);

  // 6. Ensure proper structure
  if (!cleaned.includes('<!DOCTYPE html>')) {
    issues.push({
      type: 'warning',
      message: 'Missing DOCTYPE declaration. This may cause rendering issues.',
    });
  }

  if (!cleaned.includes('pdf-content')) {
    issues.push({
      type: 'warning',
      message: 'Content not wrapped in pdf-content container. Header/footer positioning may not work correctly.',
    });
  }

  // 7. Check for common CSS issues
  if (cleaned.includes('page-break-after: always') && !cleaned.includes('.pdf-page-break')) {
    issues.push({
      type: 'warning',
      message: 'Found legacy page-break-after: always. Use .pdf-page-break class instead to prevent blank pages.',
    });
  }

  return {
    cleaned,
    issues,
    stats: {
      emptySectionsRemoved,
      excessiveWhitespaceFixed,
      orphanedPageBreaksRemoved,
      totalLength: cleaned.length,
    },
  };
}

/**
 * Log QA results to console
 */
export function logQaResults(result: QaResult, documentName: string): void {
  console.group(`📄 PDF QA Report: ${documentName}`);

  console.log('📊 Statistics:', result.stats);

  if (result.issues.length > 0) {
    console.log('\n⚠️ Issues Found:');
    result.issues.forEach((issue, idx) => {
      const icon = issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`  ${icon} ${issue.message}${issue.location ? ` (${issue.location})` : ''}`);
    });
  } else {
    console.log('✅ No issues found');
  }

  console.groupEnd();
}

/**
 * Validate table structure for proper pagination
 */
export function validateTableStructure(htmlContent: string): QaIssue[] {
  const issues: QaIssue[] = [];

  // Check for tables missing thead
  const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let match;
  let tableIndex = 0;

  while ((match = tablePattern.exec(htmlContent)) !== null) {
    tableIndex++;
    const tableContent = match[1];

    if (!tableContent.includes('<thead')) {
      issues.push({
        type: 'warning',
        message: `Table ${tableIndex} missing <thead>. Headers won't repeat on new pages.`,
        location: `Table ${tableIndex}`,
      });
    }

    // Check for very wide tables
    if (tableContent.includes('<th') || tableContent.includes('<td')) {
      const cellCount = (tableContent.match(/<th|<td/gi) || []).length;
      if (cellCount > 100) {
        issues.push({
          type: 'warning',
          message: `Table ${tableIndex} has ${cellCount} cells. Consider simplifying for better PDF output.`,
          location: `Table ${tableIndex}`,
        });
      }
    }
  }

  return issues;
}

/**
 * Auto-insert page breaks before sections that would overflow
 */
export function autoInsertPageBreaks(htmlContent: string, maxSectionHeight: number = 800): string {
  // This is a heuristic approach - in production, you'd measure actual rendered heights
  // For now, we'll insert breaks before very long sections

  let result = htmlContent;

  // Insert breaks before sections that follow a very long section
  const sectionPattern = /<section[^>]*>([\s\S]*?)<\/section>/gi;
  const sections: Array<{ content: string; index: number; length: number }> = [];

  let match;
  while ((match = sectionPattern.exec(htmlContent)) !== null) {
    sections.push({
      content: match[0],
      index: match.index,
      length: match[1].length,
    });
  }

  // If a section is very long and is followed by another section,
  // insert a page break before the next section
  for (let i = 0; i < sections.length - 1; i++) {
    const currentSection = sections[i];
    const nextSection = sections[i + 1];

    if (currentSection.length > 5000) { // Very long section
      // Check if next section already has a page break
      if (!nextSection.content.includes('pdf-page-break')) {
        // Add page break class to next section
        result = result.replace(
          nextSection.content,
          nextSection.content.replace('<section', '<section class="pdf-page-break"')
        );
      }
    }
  }

  return result;
}

/**
 * Complete QA pipeline for PDF generation
 */
export function preparePdfContent(htmlContent: string, documentName: string): string {
  // 1. Run QA checks
  const qaResult = runPdfQualityAssurance(htmlContent);

  // 2. Validate tables
  const tableIssues = validateTableStructure(qaResult.cleaned);
  qaResult.issues.push(...tableIssues);

  // 3. Auto-insert strategic page breaks
  let prepared = autoInsertPageBreaks(qaResult.cleaned);

  // 4. Log results
  logQaResults({ ...qaResult, cleaned: prepared }, documentName);

  return prepared;
}

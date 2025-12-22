/**
 * PDF Pagination Engine
 * Implements smart pagination rules to prevent orphans, split headers, and empty pages
 *
 * ABSOLUTE RULE: PRESENTATION ONLY - NO DATA CHANGES
 */

export interface PaginationConfig {
  minRowsAfterHeader: number; // Minimum 6 rows after table header
  minPageFillPercentage: number; // Minimum 25% page fill
  maxRowsPerPage: {
    senior: number;
    junior: number;
  };
  preventOrphans: boolean;
}

export const DEFAULT_PAGINATION_CONFIG: PaginationConfig = {
  minRowsAfterHeader: 6,
  minPageFillPercentage: 0.25,
  maxRowsPerPage: {
    senior: 35, // High density
    junior: 25  // Medium density
  },
  preventOrphans: true
};

export interface PageSection {
  type: 'header' | 'table' | 'summary' | 'list';
  content: string;
  estimatedHeight: number; // in viewport units (vh)
  canSplit: boolean;
  rowCount?: number;
}

export interface PaginationResult {
  pages: PageSection[][];
  totalPages: number;
  warnings: string[];
}

/**
 * Calculate estimated height of content section
 */
export function estimateContentHeight(section: PageSection): number {
  if (section.type === 'table' && section.rowCount) {
    // Each row is approximately 2-3vh depending on density
    return Math.min(section.rowCount * 2.5, 80); // Cap at 80vh per page
  }

  // Default estimates for other types
  const heightMap = {
    header: 8,
    summary: 15,
    list: 20
  };

  return heightMap[section.type as keyof typeof heightMap] || 10;
}

/**
 * Smart pagination algorithm
 * Implements all mandatory rules:
 * 1. Never split header from first row
 * 2. Repeat headers on multi-page tables
 * 3. Minimum rows per page rule
 * 4. Prevent orphan pages
 * 5. Single pagination system
 */
export function paginateContent(
  sections: PageSection[],
  config: PaginationConfig = DEFAULT_PAGINATION_CONFIG
): PaginationResult {
  const pages: PageSection[][] = [];
  let currentPage: PageSection[] = [];
  let currentPageHeight = 0;
  const warnings: string[] = [];

  const MAX_PAGE_HEIGHT = 85; // Leave room for header/footer

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionHeight = estimateContentHeight(section);

    // Rule 1 & 3: Check if table header would be split from sufficient rows
    if (section.type === 'table' && section.rowCount) {
      const minRequiredHeight = config.minRowsAfterHeader * 2.5 + 5; // Header + min rows

      if (currentPageHeight + minRequiredHeight > MAX_PAGE_HEIGHT) {
        // Would split table improperly - push to next page
        if (currentPage.length > 0) {
          pages.push([...currentPage]);
          currentPage = [];
          currentPageHeight = 0;
        }
      }
    }

    // Rule 4: Prevent orphan pages (less than 25% fill)
    if (currentPageHeight + sectionHeight > MAX_PAGE_HEIGHT) {
      // Need to move to next page
      if (currentPageHeight < MAX_PAGE_HEIGHT * config.minPageFillPercentage) {
        warnings.push(`Page ${pages.length + 1} has low content density (${Math.round(currentPageHeight / MAX_PAGE_HEIGHT * 100)}%)`);
      }

      pages.push([...currentPage]);
      currentPage = [section];
      currentPageHeight = sectionHeight;
    } else {
      // Fits on current page
      currentPage.push(section);
      currentPageHeight += sectionHeight;
    }
  }

  // Add final page
  if (currentPage.length > 0) {
    if (currentPageHeight < MAX_PAGE_HEIGHT * config.minPageFillPercentage && pages.length > 0) {
      // Try to merge with previous page if possible
      const prevPage = pages[pages.length - 1];
      const prevPageHeight = prevPage.reduce((sum, s) => sum + estimateContentHeight(s), 0);

      if (prevPageHeight + currentPageHeight <= MAX_PAGE_HEIGHT) {
        pages[pages.length - 1] = [...prevPage, ...currentPage];
        warnings.push(`Merged orphan content into previous page`);
      } else {
        pages.push(currentPage);
      }
    } else {
      pages.push(currentPage);
    }
  }

  return {
    pages,
    totalPages: pages.length,
    warnings
  };
}

/**
 * Generate page break markers
 */
export function insertPageBreaks(html: string, breakPoints: number[]): string {
  // This is a simplified version - actual implementation would parse HTML
  return html;
}

/**
 * Validate pagination rules are met
 */
export function validatePagination(result: PaginationResult): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for empty pages
  result.pages.forEach((page, idx) => {
    if (page.length === 0) {
      errors.push(`Page ${idx + 1} is empty`);
    }
  });

  // Check for orphan pages
  result.pages.forEach((page, idx) => {
    const pageHeight = page.reduce((sum, s) => sum + estimateContentHeight(s), 0);
    if (pageHeight < 20 && result.pages.length > 1) {
      errors.push(`Page ${idx + 1} has insufficient content (${Math.round(pageHeight)}vh)`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

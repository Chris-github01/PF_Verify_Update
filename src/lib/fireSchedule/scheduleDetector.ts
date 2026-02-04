/**
 * Fire Schedule Page Detection
 * Identifies which pages contain actual schedule tables vs product sheets
 */

export interface SchedulePageInfo {
  pageNumber: number;
  confidence: number;
  reason: string;
}

export interface PageText {
  pageNumber: number;
  text: string;
}

/**
 * Detect which pages contain fire schedule tables
 */
export function detectSchedulePages(pageTexts: PageText[]): SchedulePageInfo[] {
  const schedulePages: SchedulePageInfo[] = [];

  // Schedule markers (must appear on schedule pages)
  const scheduleMarkers = [
    /PASSIVE\s+FIRE\s+SCHEDULE/i,
    /FIRE\s+AND\s+SMOKE\s+STOPPING/i,
    /PRE-STITCH.*FIRE.*SMOKE\s+STOPPING/i,
    /Appendix\s+A\.?\s+Passive\s+Fire\s+Schedule/i,
  ];

  // Anti-patterns (indicate this is NOT a schedule page)
  const antiPatterns = [
    /PRODUCT\s+SHEET/i,
    /PS-\d{2}/,  // Product sheet codes like PS-01, PS-02
    /INSTALLATION\s+INSTRUCTIONS/i,
    /MANUFACTURER'?S?\s+SPECIFICATION/i,
    /TECHNICAL\s+DATA\s+SHEET/i,
  ];

  // Table structure indicators (boost confidence)
  const tableIndicators = [
    /Service\s+Type/i,
    /Substrate/i,
    /FRR/i,
    /Fire\s+Stop\s+Reference/i,
    /PFP\d+/,  // Fire stop codes like PFP001
    /Orientation/i,
    /WALL|FLOOR/,
  ];

  for (const page of pageTexts) {
    let confidence = 0;
    const reasons: string[] = [];

    // Check for schedule markers
    let hasScheduleMarker = false;
    for (const marker of scheduleMarkers) {
      if (marker.test(page.text)) {
        confidence += 0.4;
        hasScheduleMarker = true;
        reasons.push(`Contains schedule marker: ${marker.source}`);
        break;
      }
    }

    // Check for anti-patterns (immediate disqualification)
    for (const antiPattern of antiPatterns) {
      if (antiPattern.test(page.text)) {
        confidence = 0;
        reasons.push(`Excluded: Contains anti-pattern ${antiPattern.source}`);
        break;
      }
    }

    // Only continue if we have schedule marker and no anti-patterns
    if (hasScheduleMarker && confidence > 0) {
      // Check for table structure indicators
      let indicatorCount = 0;
      for (const indicator of tableIndicators) {
        if (indicator.test(page.text)) {
          indicatorCount++;
        }
      }

      if (indicatorCount >= 3) {
        confidence += 0.4;
        reasons.push(`Has ${indicatorCount} table structure indicators`);
      } else if (indicatorCount >= 1) {
        confidence += 0.2;
        reasons.push(`Has ${indicatorCount} table structure indicators`);
      }

      // Check for multiple PFP codes (strong indicator)
      const pfpMatches = page.text.match(/PFP\d+[A-Z]?/g);
      if (pfpMatches && pfpMatches.length > 3) {
        confidence += 0.2;
        reasons.push(`Contains ${pfpMatches.length} PFP codes`);
      }

      // Add if confidence is sufficient
      if (confidence >= 0.5) {
        schedulePages.push({
          pageNumber: page.pageNumber,
          confidence: Math.min(confidence, 1.0),
          reason: reasons.join('; ')
        });
      }
    }
  }

  return schedulePages;
}

/**
 * Group consecutive schedule pages into sections
 */
export function groupScheduleSections(schedulePages: SchedulePageInfo[]): number[][] {
  if (schedulePages.length === 0) return [];

  const sections: number[][] = [];
  let currentSection: number[] = [schedulePages[0].pageNumber];

  for (let i = 1; i < schedulePages.length; i++) {
    const prevPage = schedulePages[i - 1].pageNumber;
    const currPage = schedulePages[i].pageNumber;

    // If consecutive or within 1 page gap, add to current section
    if (currPage - prevPage <= 2) {
      currentSection.push(currPage);
    } else {
      // Start new section
      sections.push(currentSection);
      currentSection = [currPage];
    }
  }

  // Add final section
  if (currentSection.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

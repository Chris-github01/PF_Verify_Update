/**
 * Fire Schedule Table Extraction
 * Extracts structured table data from schedule pages
 */

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TableCell {
  text: string;
  rowIndex: number;
  colIndex: number;
}

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
  confidence: number;
  method: string;
  notes: string[];
}

/**
 * Cluster X coordinates to identify columns
 */
function clusterXCoordinates(items: TextItem[], tolerance: number = 5): number[] {
  const xPositions = items.map(item => item.x).sort((a, b) => a - b);
  const clusters: number[] = [];

  if (xPositions.length === 0) return clusters;

  let currentCluster = xPositions[0];
  let clusterSum = currentCluster;
  let clusterCount = 1;

  for (let i = 1; i < xPositions.length; i++) {
    if (xPositions[i] - currentCluster <= tolerance) {
      clusterSum += xPositions[i];
      clusterCount++;
    } else {
      clusters.push(clusterSum / clusterCount);
      currentCluster = xPositions[i];
      clusterSum = currentCluster;
      clusterCount = 1;
    }
  }

  clusters.push(clusterSum / clusterCount);
  return clusters;
}

/**
 * Cluster Y coordinates to identify rows
 */
function clusterYCoordinates(items: TextItem[], tolerance: number = 3): number[] {
  const yPositions = items.map(item => item.y).sort((a, b) => a - b);
  const clusters: number[] = [];

  if (yPositions.length === 0) return clusters;

  let currentCluster = yPositions[0];
  let clusterSum = currentCluster;
  let clusterCount = 1;

  for (let i = 1; i < yPositions.length; i++) {
    if (yPositions[i] - currentCluster <= tolerance) {
      clusterSum += yPositions[i];
      clusterCount++;
    } else {
      clusters.push(clusterSum / clusterCount);
      currentCluster = yPositions[i];
      clusterSum = currentCluster;
      clusterCount = 1;
    }
  }

  clusters.push(clusterSum / clusterCount);
  return clusters;
}

/**
 * Assign text items to grid cells based on coordinates
 */
function buildGrid(items: TextItem[], colBoundaries: number[], rowBoundaries: number[]): TableCell[] {
  const cells: TableCell[] = [];

  for (const item of items) {
    // Find column
    let colIndex = 0;
    for (let i = 0; i < colBoundaries.length; i++) {
      if (item.x >= colBoundaries[i] - 10) {
        colIndex = i;
      }
    }

    // Find row
    let rowIndex = 0;
    for (let i = 0; i < rowBoundaries.length; i++) {
      if (item.y >= rowBoundaries[i] - 5) {
        rowIndex = i;
      }
    }

    cells.push({
      text: item.text.trim(),
      rowIndex,
      colIndex
    });
  }

  return cells;
}

/**
 * Convert grid cells to 2D array
 */
function cellsToRows(cells: TableCell[], numRows: number, numCols: number): string[][] {
  const grid: string[][] = Array.from({ length: numRows }, () =>
    Array.from({ length: numCols }, () => '')
  );

  // Group cells by position and merge text
  for (const cell of cells) {
    if (cell.rowIndex < numRows && cell.colIndex < numCols) {
      if (grid[cell.rowIndex][cell.colIndex]) {
        grid[cell.rowIndex][cell.colIndex] += ' ' + cell.text;
      } else {
        grid[cell.rowIndex][cell.colIndex] = cell.text;
      }
    }
  }

  return grid;
}

/**
 * Calculate table confidence based on structure
 */
function calculateTableConfidence(headers: string[], rows: string[][]): number {
  let confidence = 0.3; // Base confidence

  // Check for expected header terms
  const expectedHeaders = ['service', 'material', 'size', 'frr', 'substrate', 'orientation', 'pfp', 'reference'];
  const headerText = headers.join(' ').toLowerCase();

  let headerMatches = 0;
  for (const expected of expectedHeaders) {
    if (headerText.includes(expected)) {
      headerMatches++;
    }
  }

  confidence += (headerMatches / expectedHeaders.length) * 0.4;

  // Check for consistent column count
  const columnCounts = rows.map(row => row.filter(cell => cell.trim()).length);
  const avgColumns = columnCounts.reduce((sum, count) => sum + count, 0) / columnCounts.length;
  const variance = columnCounts.reduce((sum, count) => sum + Math.pow(count - avgColumns, 2), 0) / columnCounts.length;

  if (variance < 2) {
    confidence += 0.2; // Consistent column count
  }

  // Check for reasonable row count
  if (rows.length >= 10) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}

/**
 * Extract table from text items using coordinate clustering
 */
export function extractTableFromItems(items: TextItem[]): ExtractedTable {
  const notes: string[] = [];

  if (items.length === 0) {
    return {
      headers: [],
      rows: [],
      confidence: 0,
      method: 'coordinate-clustering',
      notes: ['No text items to extract']
    };
  }

  // Step 1: Cluster coordinates to find columns and rows
  const colBoundaries = clusterXCoordinates(items, 10);
  const rowBoundaries = clusterYCoordinates(items, 5);

  notes.push(`Detected ${colBoundaries.length} columns and ${rowBoundaries.length} rows`);

  if (colBoundaries.length < 3 || rowBoundaries.length < 5) {
    return {
      headers: [],
      rows: [],
      confidence: 0.2,
      method: 'coordinate-clustering',
      notes: [...notes, 'Insufficient table structure detected']
    };
  }

  // Step 2: Build grid
  const cells = buildGrid(items, colBoundaries, rowBoundaries);
  const grid = cellsToRows(cells, rowBoundaries.length, colBoundaries.length);

  // Step 3: Identify header row (first non-empty row)
  let headerRowIndex = 0;
  for (let i = 0; i < grid.length; i++) {
    const nonEmpty = grid[i].filter(cell => cell.trim()).length;
    if (nonEmpty >= colBoundaries.length / 2) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = grid[headerRowIndex];
  const dataRows = grid.slice(headerRowIndex + 1).filter(row =>
    row.some(cell => cell.trim())
  );

  notes.push(`Extracted ${dataRows.length} data rows`);

  // Step 4: Calculate confidence
  const confidence = calculateTableConfidence(headers, dataRows);

  return {
    headers,
    rows: dataRows,
    confidence,
    method: 'coordinate-clustering',
    notes
  };
}

/**
 * Normalize common schedule column names
 */
export function normalizeHeaders(headers: string[]): string[] {
  const normalized: string[] = [];

  for (const header of headers) {
    const lower = header.toLowerCase().trim();

    if (lower.includes('service') || lower.includes('penetration')) {
      normalized.push('service_type');
    } else if (lower.includes('material')) {
      normalized.push('material');
    } else if (lower.includes('size') || lower.includes('diameter')) {
      normalized.push('size');
    } else if (lower.includes('insulation')) {
      normalized.push('insulation');
    } else if (lower.includes('orientation')) {
      normalized.push('orientation');
    } else if (lower.includes('frr') || lower.includes('rating')) {
      normalized.push('frr_rating');
    } else if (lower.includes('substrate') || lower.includes('type')) {
      normalized.push('substrate');
    } else if (lower.includes('reference') || lower.includes('pfp') || lower.includes('code')) {
      normalized.push('fire_stop_reference');
    } else if (lower.includes('product') || lower.includes('solution')) {
      normalized.push('fire_stop_products');
    } else if (lower.includes('requirement') || lower.includes('limitation')) {
      normalized.push('substrate_requirements');
    } else {
      normalized.push(header.toLowerCase().replace(/\s+/g, '_'));
    }
  }

  return normalized;
}

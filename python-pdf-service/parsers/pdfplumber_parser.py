import io
import time
import pdfplumber
import re
from typing import Dict, List, Any

class PDFPlumberParser:
    """
    PDF parser using pdfplumber - excellent for table extraction.
    Best for well-structured quotes with clear table layouts.
    """

    def parse(self, pdf_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Parse PDF using pdfplumber."""
        start_time = time.time()

        try:
            pdf_file = io.BytesIO(pdf_bytes)
            tables = []
            text_content = []
            metadata = {}

            with pdfplumber.open(pdf_file) as pdf:
                num_pages = len(pdf.pages)

                # Extract metadata
                if pdf.metadata:
                    metadata = {
                        'title': pdf.metadata.get('Title', ''),
                        'author': pdf.metadata.get('Author', ''),
                        'subject': pdf.metadata.get('Subject', ''),
                        'creator': pdf.metadata.get('Creator', ''),
                    }

                # Extract tables and text from each page
                for page_num, page in enumerate(pdf.pages, 1):
                    # Try multiple strategies to find tables
                    page_tables = []

                    # Strategy 1: Lines-strict (for bordered tables)
                    table_settings = {
                        "vertical_strategy": "lines_strict",
                        "horizontal_strategy": "lines_strict",
                        "intersection_tolerance": 5,
                    }
                    page_tables = page.extract_tables(table_settings)
                    if page_tables:
                        print(f"[PDFPlumber] Page {page_num}: Found {len(page_tables)} tables with lines-strict")

                    # Strategy 2: Lines (less strict)
                    if not page_tables:
                        table_settings = {
                            "vertical_strategy": "lines",
                            "horizontal_strategy": "lines",
                            "intersection_tolerance": 15,
                        }
                        page_tables = page.extract_tables(table_settings)
                        if page_tables:
                            print(f"[PDFPlumber] Page {page_num}: Found {len(page_tables)} tables with lines")

                    # Strategy 3: Text-based extraction (for non-bordered tables)
                    if not page_tables:
                        table_settings = {
                            "vertical_strategy": "text",
                            "horizontal_strategy": "text",
                            "min_words_vertical": 1,
                            "min_words_horizontal": 1,
                        }
                        page_tables = page.extract_tables(table_settings)
                        if page_tables:
                            print(f"[PDFPlumber] Page {page_num}: Found {len(page_tables)} tables with text strategy")

                    # Strategy 4: Very aggressive text extraction (last resort for page 2+)
                    if not page_tables and page_num >= 2:
                        print(f"[PDFPlumber] Page {page_num}: All strategies failed, trying aggressive text extraction")
                        # Try with snap_tolerance and edge_min_length
                        table_settings = {
                            "vertical_strategy": "text",
                            "horizontal_strategy": "text",
                            "snap_tolerance": 5,
                            "join_tolerance": 5,
                            "edge_min_length": 1,
                            "min_words_vertical": 1,
                            "text_tolerance": 5,
                        }
                        page_tables = page.extract_tables(table_settings)
                        if page_tables:
                            print(f"[PDFPlumber] Page {page_num}: Found {len(page_tables)} tables with aggressive text strategy")

                    if page_tables:
                        for table_idx, table in enumerate(page_tables):
                            tables.append({
                                'page': page_num,
                                'table_index': table_idx,
                                'rows': table,
                                'row_count': len(table)
                            })

                    # Extract text
                    page_text = page.extract_text()
                    if page_text:
                        text_content.append({
                            'page': page_num,
                            'text': page_text
                        })

            # Extract line items from tables
            print(f"[PDFPlumber] Found {len(tables)} tables across {num_pages} pages")
            for i, table in enumerate(tables):
                print(f"[PDFPlumber] Table {i+1}: Page {table['page']}, {table['row_count']} rows")

            line_items = self._extract_line_items_from_tables(tables)
            print(f"[PDFPlumber] Extracted {len(line_items)} line items total")

            # CRITICAL: Remove lump sum items if we have itemized items
            line_items = self._filter_lump_sum_items(line_items)
            print(f"[PDFPlumber] After LS filtering: {len(line_items)} items")

            # Extract financials from text
            full_text = '\n'.join([p['text'] for p in text_content if p['text']])
            financials = self._extract_financials(full_text)

            # Extract supplier info
            supplier_info = self._extract_supplier_info(full_text)

            extraction_time_ms = int((time.time() - start_time) * 1000)

            return {
                'parser_name': 'pdfplumber',
                'success': True,
                'items': line_items,
                'metadata': {
                    'supplier_name': supplier_info.get('supplier_name', ''),
                    'quote_number': supplier_info.get('quote_number', ''),
                    'quote_date': supplier_info.get('quote_date', ''),
                    'num_pages': num_pages,
                    'tables_found': len(tables),
                    'pdf_metadata': metadata,
                },
                'financials': financials,
                'confidence_score': self._calculate_confidence(line_items, financials, tables),
                'extraction_time_ms': extraction_time_ms,
                'raw_tables': tables[:3],  # Include first 3 tables for debugging
            }

        except Exception as e:
            extraction_time_ms = int((time.time() - start_time) * 1000)
            return {
                'parser_name': 'pdfplumber',
                'success': False,
                'items': [],
                'metadata': {},
                'financials': {},
                'confidence_score': 0.0,
                'extraction_time_ms': extraction_time_ms,
                'errors': [str(e)]
            }

    def _extract_line_items_from_tables(self, tables: List[Dict]) -> List[Dict]:
        """Extract line items from detected tables."""
        line_items = []

        # CRITICAL: Prioritize tables from later pages (detailed schedules usually on page 2+)
        # Sort tables: larger tables first, then by page number (later pages first)
        sorted_tables = sorted(tables, key=lambda t: (-t['row_count'], -t['page']))

        print(f"[PDFPlumber] Processing {len(sorted_tables)} tables in priority order (largest first, later pages first)")

        for table_idx, table in enumerate(sorted_tables):
            rows = table['rows']
            if not rows or len(rows) < 2:
                print(f"[PDFPlumber] Table {table_idx+1}: Skipped (too few rows)")
                continue

            print(f"[PDFPlumber] Table {table_idx+1}: Processing {len(rows)} rows from page {table['page']}")

            # Try to identify header row
            header = rows[0]
            data_rows = rows[1:]

            # Look for "Line ID" column - indicates detailed BOQ
            line_id_col = self._find_column_index(header, ['line id', 'item no', 'line no', '#'])

            # Look for common column patterns
            desc_col = self._find_column_index(header, ['service type', 'description', 'item', 'desc', 'service', 'work description', 'details'])
            qty_col = self._find_column_index(header, ['qty', 'quantity', 'quant', 'qnty'])
            unit_col = self._find_column_index(header, ['unit', 'uom', 'um', 'u/m'])
            rate_col = self._find_column_index(header, ['unit rate', 'rate', 'unit price', 'price', 'unit cost'])
            total_col = self._find_column_index(header, ['total', 'amount', 'value', 'line total'])

            # If we can't find key columns, try to infer from position
            if desc_col == -1 and len(header) >= 3:
                # For detailed BOQs with Line ID column, description is usually around column 3-4
                if line_id_col >= 0:
                    desc_col = 3  # Usually "Service Type" column
                else:
                    desc_col = 0 if len(header) <= 5 else 1
                print(f"[PDFPlumber] Table {table_idx+1}: No description column found, inferring position {desc_col}")

            if total_col == -1 and len(header) >= 2:
                total_col = len(header) - 1
                print(f"[PDFPlumber] Table {table_idx+1}: No total column found, using last column {total_col}")

            print(f"[PDFPlumber] Table {table_idx+1}: Columns - line_id:{line_id_col}, desc:{desc_col}, qty:{qty_col}, unit:{unit_col}, rate:{rate_col}, total:{total_col}")
            print(f"[PDFPlumber] Table {table_idx+1}: Header sample: {header[:8] if len(header) > 8 else header}")

            items_from_this_table = 0
            skipped_rows = 0

            for row_idx, row in enumerate(data_rows):
                # Check if row is completely empty
                if not row or all(cell is None or str(cell).strip() == '' for cell in row):
                    skipped_rows += 1
                    continue

                # Check if this looks like a continuation of headers
                first_cell = str(row[0] if row else '').lower().strip()
                if first_cell in ['line id', 'item', 'no.', '#', 'description']:
                    skipped_rows += 1
                    continue

                try:
                    desc = self._get_cell_value(row, desc_col)

                    # Skip if no description
                    if not desc or len(desc.strip()) == 0:
                        skipped_rows += 1
                        continue

                    # Skip obvious summary/footer lines
                    desc_lower = desc.lower()
                    if any(skip in desc_lower for skip in ['sub-total', 'grand total', 'p&g', 'margin', 'ps3', 'please note']):
                        skipped_rows += 1
                        continue

                    item = {
                        'line_number': row_idx + 1,
                        'description': desc,
                        'quantity': self._parse_number(self._get_cell_value(row, qty_col)),
                        'unit': self._get_cell_value(row, unit_col),
                        'unit_price': self._parse_number(self._get_cell_value(row, rate_col)),
                        'total_price': self._parse_number(self._get_cell_value(row, total_col)),
                    }

                    # Add if we have description AND at least one numeric value
                    if item['description'] and (item['quantity'] or item['unit_price'] or item['total_price']):
                        line_items.append(item)
                        items_from_this_table += 1

                except Exception as e:
                    skipped_rows += 1
                    continue

            print(f"[PDFPlumber] Table {table_idx+1}: Extracted {items_from_this_table} items, skipped {skipped_rows} rows")

        print(f"[PDFPlumber] Total items extracted from all tables: {len(line_items)}")

        # CRITICAL: Check if we have both LS and non-LS items
        ls_count = sum(1 for item in line_items if str(item.get('unit', '')).upper().strip() in ['LS', 'LUMP SUM', 'L.S.', 'SUM', 'LUMPSUM'])
        non_ls_count = len(line_items) - ls_count
        print(f"[PDFPlumber] Breakdown: {ls_count} LS items, {non_ls_count} itemized items")

        return line_items

    def _filter_lump_sum_items(self, items: List[Dict]) -> List[Dict]:
        """
        Remove lump sum items if we have itemized items.
        This handles quotes with BOTH a summary page AND a detailed schedule.
        """
        if not items:
            return items

        # Separate lump sum items from itemized items
        lump_sum_items = []
        itemized_items = []

        for item in items:
            unit = str(item.get('unit', '')).upper().strip()

            # Lump sum indicators
            if unit in ['LS', 'LUMP SUM', 'L.S.', 'SUM', 'LUMPSUM']:
                lump_sum_items.append(item)
            else:
                itemized_items.append(item)

        print(f"[PDFPlumber Filtering] {len(lump_sum_items)} LS items, {len(itemized_items)} itemized items")

        # HARD RULE: If we have ANY itemized items, remove ALL lump sum items
        if len(itemized_items) > 0:
            print(f"[PDFPlumber Filtering] REMOVING ALL {len(lump_sum_items)} lump sum items - keeping {len(itemized_items)} itemized items")
            return itemized_items

        # If we only have lump sum items, keep them (better than nothing)
        print(f"[PDFPlumber Filtering] Only LS items found - keeping them")
        return lump_sum_items

    def _find_column_index(self, header: List, keywords: List[str]) -> int:
        """Find column index by matching keywords."""
        if not header:
            return -1

        for idx, cell in enumerate(header):
            if cell is None:
                continue
            cell_lower = str(cell).lower().strip()
            for keyword in keywords:
                if keyword in cell_lower:
                    return idx
        return -1

    def _get_cell_value(self, row: List, col_idx: int) -> str:
        """Safely get cell value."""
        if col_idx < 0 or col_idx >= len(row):
            return ''
        value = row[col_idx]
        return str(value).strip() if value is not None else ''

    def _parse_number(self, value: str) -> float:
        """Parse numeric value from string."""
        if not value:
            return 0.0

        # Remove currency symbols and commas
        cleaned = re.sub(r'[,$£€\s]', '', value)

        try:
            return float(cleaned)
        except ValueError:
            return 0.0

    def _extract_financials(self, text: str) -> Dict:
        """Extract financial totals from text."""
        financials = {
            'subtotal': 0.0,
            'tax': 0.0,
            'grand_total': 0.0,
            'currency': 'NZD',
        }

        # Look for common financial patterns
        patterns = {
            'subtotal': r'(?:subtotal|sub-total|sub total)[\s:$]*([0-9,]+\.?\d*)',
            'tax': r'(?:gst|tax|vat)[\s:$]*([0-9,]+\.?\d*)',
            'grand_total': r'(?:total|grand total|amount due)[\s:$]*([0-9,]+\.?\d*)',
        }

        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                financials[key] = self._parse_number(match.group(1))

        return financials

    def _extract_supplier_info(self, text: str) -> Dict:
        """Extract supplier information from text."""
        info = {
            'supplier_name': '',
            'quote_number': '',
            'quote_date': '',
        }

        # Quote number pattern
        quote_match = re.search(r'quote\s*(?:no|number|#)[\s:]*([A-Z0-9\-]+)', text, re.IGNORECASE)
        if quote_match:
            info['quote_number'] = quote_match.group(1)

        # Date pattern
        date_match = re.search(r'date[\s:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})', text, re.IGNORECASE)
        if date_match:
            info['quote_date'] = date_match.group(1)

        return info

    def _calculate_confidence(self, items: List[Dict], financials: Dict, tables: List) -> float:
        """Calculate confidence score based on extraction quality."""
        score = 0.0

        # Base score for finding items
        if items:
            score += 0.4
            # Bonus for more items
            score += min(0.1, len(items) / 100)

        # Score for financial data
        if financials.get('grand_total', 0) > 0:
            score += 0.2

        # Score for tables found
        if tables:
            score += 0.2

        # Bonus for complete items (all fields populated)
        if items:
            complete_items = sum(1 for item in items if all([
                item.get('description'),
                item.get('quantity'),
                item.get('unit_price'),
                item.get('total_price')
            ]))
            score += (complete_items / len(items)) * 0.1

        return min(1.0, score)

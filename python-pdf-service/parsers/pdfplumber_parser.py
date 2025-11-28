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
                    # Extract tables
                    page_tables = page.extract_tables()
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
            line_items = self._extract_line_items_from_tables(tables)

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

        for table in tables:
            rows = table['rows']
            if not rows or len(rows) < 2:
                continue

            # Try to identify header row
            header = rows[0]
            data_rows = rows[1:]

            # Look for common column patterns
            desc_col = self._find_column_index(header, ['description', 'item', 'desc'])
            qty_col = self._find_column_index(header, ['qty', 'quantity', 'quant'])
            unit_col = self._find_column_index(header, ['unit', 'uom', 'um'])
            rate_col = self._find_column_index(header, ['rate', 'unit price', 'price'])
            total_col = self._find_column_index(header, ['total', 'amount', 'value'])

            for row_idx, row in enumerate(data_rows):
                if not row or all(cell is None or str(cell).strip() == '' for cell in row):
                    continue

                try:
                    item = {
                        'line_number': row_idx + 1,
                        'description': self._get_cell_value(row, desc_col),
                        'quantity': self._parse_number(self._get_cell_value(row, qty_col)),
                        'unit': self._get_cell_value(row, unit_col),
                        'unit_price': self._parse_number(self._get_cell_value(row, rate_col)),
                        'total_price': self._parse_number(self._get_cell_value(row, total_col)),
                    }

                    # Only add if we have at least description and some numeric value
                    if item['description'] and (item['quantity'] or item['unit_price'] or item['total_price']):
                        line_items.append(item)

                except Exception as e:
                    continue

        return line_items

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

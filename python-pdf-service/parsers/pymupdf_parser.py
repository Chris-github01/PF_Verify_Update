import io
import time
import fitz  # PyMuPDF
import re
from typing import Dict, List, Any

class PyMuPDFParser:
    """
    PDF parser using PyMuPDF (fitz) - excellent for text and layout extraction.
    Better for documents with mixed layouts and complex formatting.
    """

    def parse(self, pdf_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Parse PDF using PyMuPDF."""
        start_time = time.time()

        try:
            pdf_file = io.BytesIO(pdf_bytes)
            doc = fitz.open(stream=pdf_file, filetype="pdf")

            num_pages = len(doc)
            all_text = []
            blocks = []
            tables_detected = 0

            # Extract text and layout information
            for page_num in range(num_pages):
                page = doc[page_num]

                # Get text blocks with position info
                page_blocks = page.get_text("blocks")
                blocks.extend([{
                    'page': page_num + 1,
                    'x0': block[0],
                    'y0': block[1],
                    'x1': block[2],
                    'y1': block[3],
                    'text': block[4].strip(),
                    'block_no': block[5],
                    'block_type': block[6],
                } for block in page_blocks if block[4].strip()])

                # Get plain text
                page_text = page.get_text()
                all_text.append(page_text)

                # Try to detect tables by analyzing layout
                tables_detected += self._detect_tables_in_page(page_blocks)

            full_text = '\n'.join(all_text)

            # Extract metadata
            metadata = {
                'title': doc.metadata.get('title', ''),
                'author': doc.metadata.get('author', ''),
                'subject': doc.metadata.get('subject', ''),
                'keywords': doc.metadata.get('keywords', ''),
                'creator': doc.metadata.get('creator', ''),
                'producer': doc.metadata.get('producer', ''),
            }

            doc.close()

            # Extract line items from text using patterns
            line_items = self._extract_line_items_from_text(full_text, blocks)

            # Extract financials
            financials = self._extract_financials(full_text)

            # Extract supplier info
            supplier_info = self._extract_supplier_info(full_text)

            extraction_time_ms = int((time.time() - start_time) * 1000)

            return {
                'parser_name': 'pymupdf',
                'success': True,
                'items': line_items,
                'metadata': {
                    'supplier_name': supplier_info.get('supplier_name', ''),
                    'quote_number': supplier_info.get('quote_number', ''),
                    'quote_date': supplier_info.get('quote_date', ''),
                    'num_pages': num_pages,
                    'blocks_found': len(blocks),
                    'tables_detected': tables_detected,
                    'pdf_metadata': metadata,
                },
                'financials': financials,
                'confidence_score': self._calculate_confidence(line_items, financials, blocks),
                'extraction_time_ms': extraction_time_ms,
            }

        except Exception as e:
            extraction_time_ms = int((time.time() - start_time) * 1000)
            return {
                'parser_name': 'pymupdf',
                'success': False,
                'items': [],
                'metadata': {},
                'financials': {},
                'confidence_score': 0.0,
                'extraction_time_ms': extraction_time_ms,
                'errors': [str(e)]
            }

    def _detect_tables_in_page(self, blocks: List) -> int:
        """Detect potential tables by analyzing block alignment."""
        # Simple heuristic: blocks with similar y-coordinates suggest rows
        y_positions = {}
        for block in blocks:
            y = round(block[1], 0)  # Round y-coordinate
            if y not in y_positions:
                y_positions[y] = 0
            y_positions[y] += 1

        # If we have multiple blocks at similar y-positions, likely a table
        potential_rows = sum(1 for count in y_positions.values() if count >= 3)
        return 1 if potential_rows >= 3 else 0

    def _extract_line_items_from_text(self, text: str, blocks: List[Dict]) -> List[Dict]:
        """Extract line items using regex patterns."""
        line_items = []

        # Pattern for line items: description, qty, unit, rate, total
        # Example: "Fire seal penetration 10 m2 50.00 500.00"
        pattern = r'(.+?)\s+(\d+(?:\.\d+)?)\s+([a-zA-Z²³]+)\s+(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(\d+(?:,\d{3})*(?:\.\d{2})?)'

        lines = text.split('\n')
        line_number = 0

        for line in lines:
            line = line.strip()
            if not line or len(line) < 10:
                continue

            match = re.search(pattern, line)
            if match:
                line_number += 1
                line_items.append({
                    'line_number': line_number,
                    'description': match.group(1).strip(),
                    'quantity': float(match.group(2)),
                    'unit': match.group(3),
                    'unit_price': self._parse_number(match.group(4)),
                    'total_price': self._parse_number(match.group(5)),
                })

        # If pattern matching didn't work well, try block-based extraction
        if len(line_items) < 3 and len(blocks) > 10:
            line_items = self._extract_from_blocks(blocks)

        return line_items

    def _extract_from_blocks(self, blocks: List[Dict]) -> List[Dict]:
        """Extract line items by analyzing spatial layout of blocks."""
        line_items = []

        # Group blocks by y-coordinate (rows)
        rows = {}
        for block in blocks:
            y = round(block['y0'], -1)  # Round to nearest 10
            if y not in rows:
                rows[y] = []
            rows[y].append(block)

        # Sort rows by y-coordinate
        sorted_rows = sorted(rows.items(), key=lambda x: x[0])

        line_number = 0
        for y_pos, row_blocks in sorted_rows:
            # Sort blocks in row by x-coordinate
            row_blocks.sort(key=lambda b: b['x0'])

            # Try to extract fields from this row
            if len(row_blocks) >= 3:
                texts = [b['text'] for b in row_blocks]

                # Look for numeric patterns
                numbers = []
                description_parts = []

                for text in texts:
                    if re.match(r'^\d+(?:\.\d+)?$', text.strip()):
                        numbers.append(float(text))
                    elif re.match(r'^\d+(?:,\d{3})*(?:\.\d{2})?$', text.strip()):
                        numbers.append(self._parse_number(text))
                    elif len(text) > 3 and not text.isdigit():
                        description_parts.append(text)

                # If we have description and numbers, create item
                if description_parts and len(numbers) >= 2:
                    line_number += 1
                    line_items.append({
                        'line_number': line_number,
                        'description': ' '.join(description_parts),
                        'quantity': numbers[0] if len(numbers) > 0 else 0,
                        'unit': '',
                        'unit_price': numbers[1] if len(numbers) > 1 else 0,
                        'total_price': numbers[2] if len(numbers) > 2 else numbers[1] * numbers[0],
                    })

        return line_items

    def _parse_number(self, value: str) -> float:
        """Parse numeric value from string."""
        if not value:
            return 0.0

        cleaned = re.sub(r'[,$£€\s]', '', str(value))

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

        quote_match = re.search(r'quote\s*(?:no|number|#)[\s:]*([A-Z0-9\-]+)', text, re.IGNORECASE)
        if quote_match:
            info['quote_number'] = quote_match.group(1)

        date_match = re.search(r'date[\s:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})', text, re.IGNORECASE)
        if date_match:
            info['quote_date'] = date_match.group(1)

        return info

    def _calculate_confidence(self, items: List[Dict], financials: Dict, blocks: List) -> float:
        """Calculate confidence score."""
        score = 0.0

        if items:
            score += 0.4
            score += min(0.1, len(items) / 100)

        if financials.get('grand_total', 0) > 0:
            score += 0.2

        if blocks:
            score += 0.2

        if items:
            complete_items = sum(1 for item in items if all([
                item.get('description'),
                item.get('quantity'),
                item.get('unit_price'),
                item.get('total_price')
            ]))
            score += (complete_items / len(items)) * 0.1

        return min(1.0, score)

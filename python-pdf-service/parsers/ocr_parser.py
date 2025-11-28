import io
import time
import re
from typing import Dict, List, Any
from pdf2image import convert_from_bytes
import pytesseract
from PIL import Image

class OCRParser:
    """
    PDF parser using OCR (Tesseract) - for scanned or image-based PDFs.
    Best for documents that are actually images rather than text PDFs.
    """

    def __init__(self):
        # Try to set tesseract path if needed
        # On some systems you may need: pytesseract.pytesseract.tesseract_cmd = r'/usr/bin/tesseract'
        pass

    def parse(self, pdf_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Parse PDF using OCR."""
        start_time = time.time()

        try:
            # Convert PDF to images
            images = convert_from_bytes(pdf_bytes, dpi=300)
            num_pages = len(images)

            all_text = []
            ocr_data = []

            # Perform OCR on each page
            for page_num, image in enumerate(images, 1):
                # Get text with confidence scores
                page_data = pytesseract.image_to_data(
                    image,
                    output_type=pytesseract.Output.DICT,
                    config='--psm 6'  # Assume uniform block of text
                )

                # Combine text from page
                page_text = pytesseract.image_to_string(image, config='--psm 6')
                all_text.append(page_text)

                # Store OCR data with confidence
                confidences = [
                    c for c in page_data['conf']
                    if c != -1  # -1 means no text detected
                ]
                avg_confidence = sum(confidences) / len(confidences) if confidences else 0

                ocr_data.append({
                    'page': page_num,
                    'text': page_text,
                    'confidence': avg_confidence,
                    'word_count': len([w for w in page_data['text'] if w.strip()])
                })

            full_text = '\n'.join(all_text)

            # Extract line items
            line_items = self._extract_line_items_from_text(full_text)

            # Extract financials
            financials = self._extract_financials(full_text)

            # Extract supplier info
            supplier_info = self._extract_supplier_info(full_text)

            # Calculate average OCR confidence
            avg_ocr_confidence = sum(d['confidence'] for d in ocr_data) / len(ocr_data) if ocr_data else 0

            extraction_time_ms = int((time.time() - start_time) * 1000)

            return {
                'parser_name': 'ocr',
                'success': True,
                'items': line_items,
                'metadata': {
                    'supplier_name': supplier_info.get('supplier_name', ''),
                    'quote_number': supplier_info.get('quote_number', ''),
                    'quote_date': supplier_info.get('quote_date', ''),
                    'num_pages': num_pages,
                    'ocr_confidence': avg_ocr_confidence,
                    'total_words': sum(d['word_count'] for d in ocr_data),
                },
                'financials': financials,
                'confidence_score': self._calculate_confidence(line_items, financials, avg_ocr_confidence),
                'extraction_time_ms': extraction_time_ms,
                'ocr_quality': 'high' if avg_ocr_confidence > 80 else 'medium' if avg_ocr_confidence > 60 else 'low',
            }

        except Exception as e:
            extraction_time_ms = int((time.time() - start_time) * 1000)
            return {
                'parser_name': 'ocr',
                'success': False,
                'items': [],
                'metadata': {},
                'financials': {},
                'confidence_score': 0.0,
                'extraction_time_ms': extraction_time_ms,
                'errors': [str(e)]
            }

    def _extract_line_items_from_text(self, text: str) -> List[Dict]:
        """Extract line items using regex patterns."""
        line_items = []

        # Flexible pattern for line items
        # Handles: "Description 10 m2 50.00 500.00"
        pattern = r'(.+?)\s+(\d+(?:\.\d+)?)\s+([a-zA-Z²³]+)\s+(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(\d+(?:,\d{3})*(?:\.\d{2})?)'

        lines = text.split('\n')
        line_number = 0

        for line in lines:
            line = line.strip()
            if not line or len(line) < 10:
                continue

            # Try to match pattern
            match = re.search(pattern, line)
            if match:
                line_number += 1
                try:
                    line_items.append({
                        'line_number': line_number,
                        'description': match.group(1).strip(),
                        'quantity': float(match.group(2)),
                        'unit': match.group(3),
                        'unit_price': self._parse_number(match.group(4)),
                        'total_price': self._parse_number(match.group(5)),
                    })
                except Exception:
                    continue

        # Fallback: try simpler patterns
        if len(line_items) < 3:
            line_items = self._extract_simple_items(text)

        return line_items

    def _extract_simple_items(self, text: str) -> List[Dict]:
        """Simpler extraction for poorly formatted text."""
        line_items = []
        lines = text.split('\n')

        # Look for lines with numbers
        for line in lines:
            # Must have at least 2 numbers and some text
            numbers = re.findall(r'\d+(?:[.,]\d+)?', line)
            if len(numbers) >= 2 and len(line) > 15:
                # Extract what looks like description (non-numeric parts)
                desc_parts = re.split(r'\s+\d', line)
                description = desc_parts[0].strip() if desc_parts else ''

                if description and len(description) > 5:
                    # Parse numbers
                    parsed_numbers = [self._parse_number(n) for n in numbers]

                    line_items.append({
                        'line_number': len(line_items) + 1,
                        'description': description,
                        'quantity': parsed_numbers[0] if len(parsed_numbers) > 0 else 0,
                        'unit': '',
                        'unit_price': parsed_numbers[1] if len(parsed_numbers) > 1 else 0,
                        'total_price': parsed_numbers[2] if len(parsed_numbers) > 2 else 0,
                    })

        return line_items

    def _parse_number(self, value: str) -> float:
        """Parse numeric value from string."""
        if not value:
            return 0.0

        # Handle OCR errors: O -> 0, l -> 1, etc.
        cleaned = value.replace('O', '0').replace('l', '1').replace('o', '0')
        cleaned = re.sub(r'[,$£€\s]', '', cleaned)

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

        # More flexible patterns for OCR text
        patterns = {
            'subtotal': r'(?:subtotal|sub.?total)[\s:$]*([0-9,]+\.?\d*)',
            'tax': r'(?:gst|tax|vat)[\s:$]*([0-9,]+\.?\d*)',
            'grand_total': r'(?:total|grand.?total|amount.?due)[\s:$]*([0-9,]+\.?\d*)',
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

        # Quote number - flexible for OCR errors
        quote_match = re.search(r'quote\s*(?:no|number|#)[\s:]*([A-Z0-9\-]+)', text, re.IGNORECASE)
        if quote_match:
            info['quote_number'] = quote_match.group(1)

        # Date - multiple formats
        date_patterns = [
            r'date[\s:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})',
        ]
        for pattern in date_patterns:
            date_match = re.search(pattern, text, re.IGNORECASE)
            if date_match:
                info['quote_date'] = date_match.group(1)
                break

        return info

    def _calculate_confidence(self, items: List[Dict], financials: Dict, ocr_confidence: float) -> float:
        """Calculate confidence score."""
        score = 0.0

        # OCR quality heavily influences confidence
        ocr_factor = ocr_confidence / 100.0
        score += ocr_factor * 0.3

        if items:
            score += 0.3
            score += min(0.1, len(items) / 100)

        if financials.get('grand_total', 0) > 0:
            score += 0.2

        if items:
            complete_items = sum(1 for item in items if all([
                item.get('description'),
                item.get('quantity'),
                item.get('total_price')
            ]))
            score += (complete_items / len(items)) * 0.1

        return min(1.0, score)

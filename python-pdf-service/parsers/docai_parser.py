import os
import time
import re
from typing import Dict, List, Any
from google.cloud import documentai_v1 as documentai
from google.api_core.client_options import ClientOptions

class DocAIParser:
    """
    PDF parser using Google Document AI - excellent for complex documents.
    Requires Google Cloud credentials to be configured.
    """

    def __init__(self):
        self.client = None
        try:
            project_id = os.getenv('GOOGLE_CLOUD_PROJECT_ID')
            location = os.getenv('GOOGLE_CLOUD_LOCATION', 'us')
            processor_id = os.getenv('GOOGLE_DOCAI_PROCESSOR_ID')

            if project_id and processor_id:
                opts = ClientOptions(api_endpoint=f"{location}-documentai.googleapis.com")
                self.client = documentai.DocumentProcessorServiceClient(client_options=opts)
                self.processor_name = self.client.processor_path(project_id, location, processor_id)
            else:
                print("Warning: Google Document AI not fully configured")
        except Exception as e:
            print(f"Warning: Document AI client initialization failed: {e}")

    def parse(self, pdf_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Parse PDF using Google Document AI."""
        start_time = time.time()

        if not self.client:
            return {
                'parser_name': 'docai',
                'success': False,
                'items': [],
                'metadata': {},
                'financials': {},
                'confidence_score': 0.0,
                'extraction_time_ms': 0,
                'errors': ['Google Document AI not configured']
            }

        try:
            # Prepare document
            raw_document = documentai.RawDocument(
                content=pdf_bytes,
                mime_type='application/pdf'
            )

            # Process document
            request = documentai.ProcessRequest(
                name=self.processor_name,
                raw_document=raw_document
            )

            result = self.client.process_document(request=request)
            document = result.document

            # Extract text
            full_text = document.text

            # Extract entities (if using specialized processor)
            entities = {}
            for entity in document.entities:
                entity_type = entity.type_
                entity_text = entity.mention_text
                entities[entity_type] = entity_text

            # Extract tables
            tables = []
            for page in document.pages:
                for table in page.tables:
                    table_data = self._extract_table(table, full_text)
                    if table_data:
                        tables.append(table_data)

            # Extract line items
            line_items = self._extract_line_items_from_tables(tables)

            if not line_items:
                line_items = self._extract_line_items_from_text(full_text)

            # Extract financials
            financials = self._extract_financials(full_text, entities)

            # Extract supplier info
            supplier_info = self._extract_supplier_info(full_text, entities)

            # Calculate average confidence
            avg_confidence = self._calculate_avg_confidence(document)

            extraction_time_ms = int((time.time() - start_time) * 1000)

            return {
                'parser_name': 'docai',
                'success': True,
                'items': line_items,
                'metadata': {
                    'supplier_name': supplier_info.get('supplier_name', ''),
                    'quote_number': supplier_info.get('quote_number', ''),
                    'quote_date': supplier_info.get('quote_date', ''),
                    'num_pages': len(document.pages),
                    'tables_found': len(tables),
                    'entities_found': len(entities),
                    'docai_confidence': avg_confidence,
                },
                'financials': financials,
                'confidence_score': self._calculate_confidence(line_items, financials, avg_confidence),
                'extraction_time_ms': extraction_time_ms,
            }

        except Exception as e:
            extraction_time_ms = int((time.time() - start_time) * 1000)
            return {
                'parser_name': 'docai',
                'success': False,
                'items': [],
                'metadata': {},
                'financials': {},
                'confidence_score': 0.0,
                'extraction_time_ms': extraction_time_ms,
                'errors': [str(e)]
            }

    def _extract_table(self, table, full_text: str) -> List[List[str]]:
        """Extract table data from Document AI table object."""
        table_data = []

        for row in table.body_rows:
            row_data = []
            for cell in row.cells:
                # Get text from text segments
                cell_text = self._get_text_from_layout(cell.layout, full_text)
                row_data.append(cell_text)
            table_data.append(row_data)

        return table_data

    def _get_text_from_layout(self, layout, full_text: str) -> str:
        """Extract text from layout object."""
        if not layout or not layout.text_anchor:
            return ''

        text_segments = []
        for segment in layout.text_anchor.text_segments:
            start_index = int(segment.start_index) if segment.start_index else 0
            end_index = int(segment.end_index) if segment.end_index else len(full_text)
            text_segments.append(full_text[start_index:end_index])

        return ' '.join(text_segments).strip()

    def _extract_line_items_from_tables(self, tables: List[List[List[str]]]) -> List[Dict]:
        """Extract line items from tables."""
        line_items = []

        for table in tables:
            if not table or len(table) < 2:
                continue

            # Assume first row might be header (skip if too few columns)
            data_rows = table if len(table[0]) < 3 else table[1:]

            for row_idx, row in enumerate(data_rows):
                if not row or all(not cell.strip() for cell in row):
                    continue

                # Try to parse row as line item
                # Expected order: description, qty, unit, rate, total
                if len(row) >= 3:
                    try:
                        item = {
                            'line_number': len(line_items) + 1,
                            'description': row[0].strip() if len(row) > 0 else '',
                            'quantity': self._parse_number(row[1]) if len(row) > 1 else 0,
                            'unit': row[2].strip() if len(row) > 2 else '',
                            'unit_price': self._parse_number(row[3]) if len(row) > 3 else 0,
                            'total_price': self._parse_number(row[4]) if len(row) > 4 else 0,
                        }

                        if item['description'] and (item['quantity'] or item['total_price']):
                            line_items.append(item)
                    except Exception:
                        continue

        return line_items

    def _extract_line_items_from_text(self, text: str) -> List[Dict]:
        """Extract line items from text using patterns."""
        line_items = []
        pattern = r'(.+?)\s+(\d+(?:\.\d+)?)\s+([a-zA-Z²³]+)\s+(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(\d+(?:,\d{3})*(?:\.\d{2})?)'

        for match in re.finditer(pattern, text):
            line_items.append({
                'line_number': len(line_items) + 1,
                'description': match.group(1).strip(),
                'quantity': float(match.group(2)),
                'unit': match.group(3),
                'unit_price': self._parse_number(match.group(4)),
                'total_price': self._parse_number(match.group(5)),
            })

        return line_items

    def _parse_number(self, value: str) -> float:
        """Parse number from string."""
        if not value:
            return 0.0
        cleaned = re.sub(r'[,$£€\s]', '', str(value))
        try:
            return float(cleaned)
        except ValueError:
            return 0.0

    def _extract_financials(self, text: str, entities: Dict) -> Dict:
        """Extract financials from text and entities."""
        financials = {
            'subtotal': 0.0,
            'tax': 0.0,
            'grand_total': 0.0,
            'currency': 'NZD',
        }

        # Check entities for financial fields
        for entity_type, entity_value in entities.items():
            type_lower = entity_type.lower()
            if 'total' in type_lower:
                financials['grand_total'] = self._parse_number(entity_value)
            elif 'tax' in type_lower or 'gst' in type_lower:
                financials['tax'] = self._parse_number(entity_value)
            elif 'subtotal' in type_lower:
                financials['subtotal'] = self._parse_number(entity_value)

        # Fallback to pattern matching
        if financials['grand_total'] == 0:
            patterns = {
                'subtotal': r'(?:subtotal|sub-total)[\s:$]*([0-9,]+\.?\d*)',
                'tax': r'(?:gst|tax|vat)[\s:$]*([0-9,]+\.?\d*)',
                'grand_total': r'(?:total|grand total)[\s:$]*([0-9,]+\.?\d*)',
            }
            for key, pattern in patterns.items():
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    financials[key] = self._parse_number(match.group(1))

        return financials

    def _extract_supplier_info(self, text: str, entities: Dict) -> Dict:
        """Extract supplier information."""
        info = {'supplier_name': '', 'quote_number': '', 'quote_date': ''}

        # Check entities
        for entity_type, entity_value in entities.items():
            type_lower = entity_type.lower()
            if 'supplier' in type_lower or 'vendor' in type_lower:
                info['supplier_name'] = entity_value
            elif 'invoice' in type_lower or 'quote' in type_lower:
                info['quote_number'] = entity_value
            elif 'date' in type_lower:
                info['quote_date'] = entity_value

        # Fallback to pattern matching
        if not info['quote_number']:
            quote_match = re.search(r'quote\s*(?:no|number|#)[\s:]*([A-Z0-9\-]+)', text, re.IGNORECASE)
            if quote_match:
                info['quote_number'] = quote_match.group(1)

        return info

    def _calculate_avg_confidence(self, document) -> float:
        """Calculate average confidence from document."""
        confidences = []

        # Get confidence from pages
        for page in document.pages:
            if hasattr(page, 'confidence'):
                confidences.append(page.confidence * 100)

        return sum(confidences) / len(confidences) if confidences else 85.0

    def _calculate_confidence(self, items: List[Dict], financials: Dict, docai_confidence: float) -> float:
        """Calculate overall confidence score."""
        score = (docai_confidence / 100.0) * 0.4

        if items:
            score += 0.3
            score += min(0.1, len(items) / 100)

        if financials.get('grand_total', 0) > 0:
            score += 0.2

        return min(1.0, score)

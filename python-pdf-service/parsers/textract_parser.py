import io
import time
import os
import re
from typing import Dict, List, Any
import boto3
from botocore.exceptions import ClientError

class TextractParser:
    """
    PDF parser using AWS Textract - excellent for forms and tables.
    Requires AWS credentials to be configured.
    """

    def __init__(self):
        self.textract = None
        try:
            self.textract = boto3.client(
                'textract',
                aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
                region_name=os.getenv('AWS_REGION', 'us-east-1')
            )
        except Exception as e:
            print(f"Warning: Textract client initialization failed: {e}")

    def parse(self, pdf_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Parse PDF using AWS Textract."""
        start_time = time.time()

        if not self.textract:
            return {
                'parser_name': 'textract',
                'success': False,
                'items': [],
                'metadata': {},
                'financials': {},
                'confidence_score': 0.0,
                'extraction_time_ms': 0,
                'errors': ['AWS Textract not configured']
            }

        try:
            # Call Textract analyze_document API
            response = self.textract.analyze_document(
                Document={'Bytes': pdf_bytes},
                FeatureTypes=['TABLES', 'FORMS']
            )

            # Extract blocks
            blocks = response.get('Blocks', [])

            # Process different block types
            lines_text = []
            tables = []
            forms = {}

            for block in blocks:
                if block['BlockType'] == 'LINE':
                    lines_text.append(block.get('Text', ''))

                elif block['BlockType'] == 'TABLE':
                    table_data = self._extract_table(block, blocks)
                    if table_data:
                        tables.append(table_data)

                elif block['BlockType'] == 'KEY_VALUE_SET' and block.get('EntityTypes'):
                    if 'KEY' in block['EntityTypes']:
                        key_text = self._get_text_from_relationships(block, blocks)
                        value_text = self._get_value_for_key(block, blocks)
                        if key_text and value_text:
                            forms[key_text] = value_text

            full_text = '\n'.join(lines_text)

            # Extract line items from tables
            line_items = self._extract_line_items_from_tables(tables)

            # If no items from tables, try text extraction
            if not line_items:
                line_items = self._extract_line_items_from_text(full_text)

            # Extract financials
            financials = self._extract_financials(full_text, forms)

            # Extract supplier info
            supplier_info = self._extract_supplier_info(full_text, forms)

            # Calculate average confidence
            avg_confidence = self._calculate_avg_confidence(blocks)

            extraction_time_ms = int((time.time() - start_time) * 1000)

            return {
                'parser_name': 'textract',
                'success': True,
                'items': line_items,
                'metadata': {
                    'supplier_name': supplier_info.get('supplier_name', ''),
                    'quote_number': supplier_info.get('quote_number', ''),
                    'quote_date': supplier_info.get('quote_date', ''),
                    'num_pages': response.get('DocumentMetadata', {}).get('Pages', 0),
                    'blocks_found': len(blocks),
                    'tables_found': len(tables),
                    'forms_found': len(forms),
                    'textract_confidence': avg_confidence,
                },
                'financials': financials,
                'confidence_score': self._calculate_confidence(line_items, financials, avg_confidence),
                'extraction_time_ms': extraction_time_ms,
            }

        except ClientError as e:
            extraction_time_ms = int((time.time() - start_time) * 1000)
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            return {
                'parser_name': 'textract',
                'success': False,
                'items': [],
                'metadata': {},
                'financials': {},
                'confidence_score': 0.0,
                'extraction_time_ms': extraction_time_ms,
                'errors': [f'AWS Textract error ({error_code}): {str(e)}']
            }
        except Exception as e:
            extraction_time_ms = int((time.time() - start_time) * 1000)
            return {
                'parser_name': 'textract',
                'success': False,
                'items': [],
                'metadata': {},
                'financials': {},
                'confidence_score': 0.0,
                'extraction_time_ms': extraction_time_ms,
                'errors': [str(e)]
            }

    def _extract_table(self, table_block: Dict, all_blocks: List[Dict]) -> List[List[str]]:
        """Extract table data from Textract blocks."""
        if 'Relationships' not in table_block:
            return []

        # Find all CELL blocks
        cell_blocks = {}
        for relationship in table_block.get('Relationships', []):
            if relationship['Type'] == 'CHILD':
                for cell_id in relationship['Ids']:
                    cell_block = next((b for b in all_blocks if b['Id'] == cell_id), None)
                    if cell_block and cell_block['BlockType'] == 'CELL':
                        row = cell_block.get('RowIndex', 0)
                        col = cell_block.get('ColumnIndex', 0)
                        text = self._get_text_from_relationships(cell_block, all_blocks)
                        if row not in cell_blocks:
                            cell_blocks[row] = {}
                        cell_blocks[row][col] = text

        # Convert to 2D array
        table_data = []
        for row_idx in sorted(cell_blocks.keys()):
            row_data = []
            for col_idx in sorted(cell_blocks[row_idx].keys()):
                row_data.append(cell_blocks[row_idx][col_idx])
            table_data.append(row_data)

        return table_data

    def _get_text_from_relationships(self, block: Dict, all_blocks: List[Dict]) -> str:
        """Get text content from block relationships."""
        text_parts = []
        for relationship in block.get('Relationships', []):
            if relationship['Type'] == 'CHILD':
                for child_id in relationship['Ids']:
                    child_block = next((b for b in all_blocks if b['Id'] == child_id), None)
                    if child_block and child_block['BlockType'] == 'WORD':
                        text_parts.append(child_block.get('Text', ''))
        return ' '.join(text_parts)

    def _get_value_for_key(self, key_block: Dict, all_blocks: List[Dict]) -> str:
        """Get value text for a key block."""
        for relationship in key_block.get('Relationships', []):
            if relationship['Type'] == 'VALUE':
                for value_id in relationship['Ids']:
                    value_block = next((b for b in all_blocks if b['Id'] == value_id), None)
                    if value_block:
                        return self._get_text_from_relationships(value_block, all_blocks)
        return ''

    def _extract_line_items_from_tables(self, tables: List[List[List[str]]]) -> List[Dict]:
        """Extract line items from Textract tables."""
        line_items = []

        for table in tables:
            if not table or len(table) < 2:
                continue

            header = table[0]
            rows = table[1:]

            # Find column indices
            desc_col = self._find_column_index(header, ['description', 'item', 'desc'])
            qty_col = self._find_column_index(header, ['qty', 'quantity'])
            unit_col = self._find_column_index(header, ['unit', 'uom'])
            rate_col = self._find_column_index(header, ['rate', 'unit price', 'price'])
            total_col = self._find_column_index(header, ['total', 'amount'])

            for row_idx, row in enumerate(rows):
                if not row or all(not cell.strip() for cell in row):
                    continue

                item = {
                    'line_number': len(line_items) + 1,
                    'description': self._get_cell_value(row, desc_col),
                    'quantity': self._parse_number(self._get_cell_value(row, qty_col)),
                    'unit': self._get_cell_value(row, unit_col),
                    'unit_price': self._parse_number(self._get_cell_value(row, rate_col)),
                    'total_price': self._parse_number(self._get_cell_value(row, total_col)),
                }

                if item['description'] and (item['quantity'] or item['unit_price'] or item['total_price']):
                    line_items.append(item)

        return line_items

    def _extract_line_items_from_text(self, text: str) -> List[Dict]:
        """Extract line items from plain text."""
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

    def _find_column_index(self, header: List[str], keywords: List[str]) -> int:
        """Find column index by keywords."""
        for idx, cell in enumerate(header):
            cell_lower = cell.lower().strip()
            for keyword in keywords:
                if keyword in cell_lower:
                    return idx
        return -1

    def _get_cell_value(self, row: List[str], col_idx: int) -> str:
        """Get cell value safely."""
        if col_idx < 0 or col_idx >= len(row):
            return ''
        return row[col_idx].strip()

    def _parse_number(self, value: str) -> float:
        """Parse number from string."""
        if not value:
            return 0.0
        cleaned = re.sub(r'[,$£€\s]', '', value)
        try:
            return float(cleaned)
        except ValueError:
            return 0.0

    def _extract_financials(self, text: str, forms: Dict) -> Dict:
        """Extract financials from text and forms."""
        financials = {
            'subtotal': 0.0,
            'tax': 0.0,
            'grand_total': 0.0,
            'currency': 'NZD',
        }

        # Check forms first
        for key, value in forms.items():
            key_lower = key.lower()
            if 'subtotal' in key_lower:
                financials['subtotal'] = self._parse_number(value)
            elif 'tax' in key_lower or 'gst' in key_lower:
                financials['tax'] = self._parse_number(value)
            elif 'total' in key_lower:
                financials['grand_total'] = self._parse_number(value)

        # Fallback to text patterns
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

    def _extract_supplier_info(self, text: str, forms: Dict) -> Dict:
        """Extract supplier info."""
        info = {'supplier_name': '', 'quote_number': '', 'quote_date': ''}

        for key, value in forms.items():
            key_lower = key.lower()
            if 'quote' in key_lower and 'number' in key_lower:
                info['quote_number'] = value
            elif 'date' in key_lower:
                info['quote_date'] = value

        return info

    def _calculate_avg_confidence(self, blocks: List[Dict]) -> float:
        """Calculate average confidence from blocks."""
        confidences = [b.get('Confidence', 0) for b in blocks if 'Confidence' in b]
        return sum(confidences) / len(confidences) if confidences else 0.0

    def _calculate_confidence(self, items: List[Dict], financials: Dict, textract_confidence: float) -> float:
        """Calculate overall confidence score."""
        score = (textract_confidence / 100.0) * 0.4

        if items:
            score += 0.3
            score += min(0.1, len(items) / 100)

        if financials.get('grand_total', 0) > 0:
            score += 0.2

        return min(1.0, score)

import time
from typing import Dict, List, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

from .pdfplumber_parser import PDFPlumberParser
from .pymupdf_parser import PyMuPDFParser
from .ocr_parser import OCRParser
from .textract_parser import TextractParser
from .docai_parser import DocAIParser
from .unstructured_parser import parse_with_unstructured, extract_line_items_from_tables


class EnsembleCoordinator:
    """
    Coordinates multiple PDF parsers to extract data with ensemble validation.
    Runs parsers in parallel and intelligently combines results.
    """

    def __init__(self):
        self.parsers = {
            'pdfplumber': PDFPlumberParser(),
            'pymupdf': PyMuPDFParser(),
            'ocr': OCRParser(),
            'textract': TextractParser(),
            'docai': DocAIParser(),
        }
        # Unstructured is handled separately (function-based, not class-based)
        self.unstructured_available = True

    def parse_with_ensemble(
        self,
        pdf_bytes: bytes,
        filename: str,
        parsers_to_use: List[str]
    ) -> Dict[str, Any]:
        """
        Run multiple parsers in parallel and return ensemble results.
        """
        start_time = time.time()

        # Run parsers in parallel
        results = []
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_parser = {}

            for parser_name in parsers_to_use:
                if parser_name == 'unstructured' and self.unstructured_available:
                    # Unstructured uses different API
                    future = executor.submit(self._parse_with_unstructured_wrapper, pdf_bytes, filename)
                    future_to_parser[future] = parser_name
                elif parser_name in self.parsers:
                    parser = self.parsers[parser_name]
                    future = executor.submit(parser.parse, pdf_bytes, filename)
                    future_to_parser[future] = parser_name

            # Collect results as they complete
            for future in as_completed(future_to_parser):
                parser_name = future_to_parser[future]
                try:
                    result = future.result(timeout=60)  # 60 second timeout per parser
                    results.append(result)
                except Exception as e:
                    # If a parser fails, add error result
                    results.append({
                        'parser_name': parser_name,
                        'success': False,
                        'items': [],
                        'metadata': {},
                        'financials': {},
                        'confidence_score': 0.0,
                        'extraction_time_ms': 0,
                        'errors': [str(e)]
                    })

        # Build consensus from all results
        consensus_items = self._build_consensus(results)

        # Select best result
        best_result = self._select_best_result(results)

        # Calculate metrics
        success_count = sum(1 for r in results if r['success'])
        avg_confidence = sum(r['confidence_score'] for r in results) / len(results) if results else 0

        cross_model_agreement = self._calculate_agreement(results)

        total_time_ms = int((time.time() - start_time) * 1000)

        # Determine recommendation
        if success_count >= 2 and avg_confidence >= 0.7:
            recommendation = 'HIGH_CONFIDENCE_MULTI_PARSER'
        elif success_count == 1 and avg_confidence >= 0.6:
            recommendation = 'MODERATE_CONFIDENCE_SINGLE_PARSER'
        else:
            recommendation = 'LOW_CONFIDENCE_MANUAL_REVIEW'

        return {
            'best_result': best_result,
            'all_results': results,
            'consensus_items': consensus_items,
            'confidence_breakdown': {
                'overall': max(avg_confidence, best_result.get('confidence_score', 0) * 0.9),
                'parsers_succeeded': success_count,
                'parsers_attempted': len(results),
                'cross_model_agreement': cross_model_agreement,
                'best_parser': best_result.get('parser_name', 'none'),
                'best_parser_confidence': best_result.get('confidence_score', 0),
            },
            'recommendation': recommendation,
            'extraction_metadata': {
                'total_extraction_time_ms': total_time_ms,
                'parsers_used': [r['parser_name'] for r in results],
                'file_name': filename,
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            }
        }

    def parse_with_auto_selection(
        self,
        pdf_bytes: bytes,
        filename: str
    ) -> Dict[str, Any]:
        """
        Automatically select and try parsers in order of likely success.
        Stops when a parser succeeds with high confidence.
        """
        # Try parsers in order of reliability
        parser_order = ['pdfplumber', 'pymupdf', 'textract', 'docai', 'ocr']

        for parser_name in parser_order:
            if parser_name not in self.parsers:
                continue

            try:
                parser = self.parsers[parser_name]
                result = parser.parse(pdf_bytes, filename)

                # If successful with good confidence, use it
                if result['success'] and result['confidence_score'] >= 0.7:
                    return {
                        'selected_parser': parser_name,
                        'result': result,
                        'tried_parsers': parser_order[:parser_order.index(parser_name) + 1],
                    }

            except Exception:
                continue

        # If no parser succeeded with high confidence, run ensemble
        return self.parse_with_ensemble(pdf_bytes, filename, parser_order[:3])

    def _build_consensus(self, results: List[Dict]) -> List[Dict]:
        """
        Build consensus items from multiple parser results.
        """
        successful_results = [r for r in results if r['success'] and r.get('items')]

        if not successful_results:
            return []

        if len(successful_results) == 1:
            return successful_results[0]['items']

        # Group items by similarity
        all_items = {}

        for result in successful_results:
            for item in result['items']:
                # Create key from description and quantity
                desc = item.get('description', '').lower().strip()
                qty = item.get('quantity', 0)
                key = f"{desc}_{qty}"

                if key not in all_items:
                    all_items[key] = []

                all_items[key].append({
                    **item,
                    'source_parser': result['parser_name'],
                    'source_confidence': result['confidence_score'],
                })

        # Build consensus items
        consensus_items = []

        for key, items in all_items.items():
            if len(items) == 1:
                # Single source
                consensus_items.append({
                    **items[0],
                    'consensus_level': 'single_source',
                    'agreement_count': 1,
                })
            else:
                # Multiple sources - average numeric values
                quantities = [i['quantity'] for i in items if i.get('quantity', 0) > 0]
                unit_prices = [i['unit_price'] for i in items if i.get('unit_price', 0) > 0]
                totals = [i['total_price'] for i in items if i.get('total_price', 0) > 0]

                avg_qty = sum(quantities) / len(quantities) if quantities else 0
                avg_price = sum(unit_prices) / len(unit_prices) if unit_prices else 0
                avg_total = sum(totals) / len(totals) if totals else 0

                # Use item with highest confidence as base
                best_item = max(items, key=lambda x: x['source_confidence'])

                consensus_items.append({
                    **best_item,
                    'quantity': avg_qty or best_item['quantity'],
                    'unit_price': avg_price or best_item['unit_price'],
                    'total_price': avg_total or best_item['total_price'],
                    'consensus_level': 'multi_source_averaged',
                    'agreement_count': len(items),
                    'sources': [i['source_parser'] for i in items],
                })

        return consensus_items

    def _select_best_result(self, results: List[Dict]) -> Dict:
        """
        Select the best result from multiple parser outputs.
        """
        successful = [r for r in results if r['success'] and r.get('items')]

        if not successful:
            return results[0] if results else {
                'parser_name': 'none',
                'success': False,
                'items': [],
                'metadata': {},
                'financials': {},
                'confidence_score': 0.0,
                'extraction_time_ms': 0,
            }

        # Score = 70% confidence + 30% item count (normalized)
        max_items = max(len(r['items']) for r in successful)

        def score(result):
            conf = result['confidence_score']
            items_norm = len(result['items']) / max(max_items, 1)
            return conf * 0.7 + items_norm * 0.3

        return max(successful, key=score)

    def _calculate_agreement(self, results: List[Dict]) -> float:
        """
        Calculate cross-model agreement percentage.
        """
        successful = [r for r in results if r['success'] and r.get('items')]

        if len(successful) < 2:
            return 1.0  # Perfect agreement if only one parser

        # Count items that appear in multiple parsers
        item_keys = {}

        for result in successful:
            for item in result['items']:
                desc = item.get('description', '').lower().strip()
                qty = item.get('quantity', 0)
                key = f"{desc}_{qty}"

                if key not in item_keys:
                    item_keys[key] = 0
                item_keys[key] += 1

        # Calculate percentage of items agreed upon by 2+ parsers
        multi_source = sum(1 for count in item_keys.values() if count >= 2)
        total_unique = len(item_keys)

        return multi_source / total_unique if total_unique > 0 else 0.0

    def _parse_with_unstructured_wrapper(self, pdf_bytes: bytes, filename: str) -> Dict:
        """
        Wrapper to make Unstructured.io parser compatible with ensemble interface
        """
        import os
        start_time = time.time()

        # Check if API key is available (for enterprise mode)
        api_key = os.getenv('UNSTRUCTURED_API_KEY')
        use_api = bool(api_key)

        result = parse_with_unstructured(
            pdf_bytes=pdf_bytes,
            filename=filename,
            use_api=use_api,
            api_key=api_key,
            strategy='auto'  # or 'hi_res' for complex layouts
        )

        if not result['success']:
            return {
                'parser_name': 'unstructured',
                'success': False,
                'items': [],
                'metadata': result.get('metadata', {}),
                'financials': {},
                'confidence_score': 0.0,
                'extraction_time_ms': int((time.time() - start_time) * 1000),
                'errors': [result.get('error', 'Unknown error')]
            }

        # Convert Unstructured tables to line items
        tables = result.get('tables', [])
        line_items = extract_line_items_from_tables(tables)

        # Convert to standard format
        items = []
        for item in line_items:
            items.append({
                'description': item.get('description', ''),
                'quantity': item.get('qty', 1.0),
                'unit': item.get('unit', 'ea'),
                'unit_price': item.get('rate', 0.0),
                'total_price': item.get('total', 0.0),
                'source_parser': 'unstructured',
                'source_confidence': result.get('confidence', 0.7)
            })

        # Calculate financials
        total = sum(i['total_price'] for i in items)

        return {
            'parser_name': 'unstructured',
            'success': True,
            'items': items,
            'metadata': {
                **result.get('metadata', {}),
                'table_count': result.get('table_count', 0),
                'element_count': result.get('element_count', 0),
                'narratives': result.get('narratives', [])
            },
            'financials': {
                'total': total,
                'item_count': len(items)
            },
            'confidence_score': result.get('confidence', 0.7),
            'extraction_time_ms': int((time.time() - start_time) * 1000),
            'errors': []
        }

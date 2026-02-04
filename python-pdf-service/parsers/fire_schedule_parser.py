import io
import time
import pdfplumber
import re
from typing import Dict, List, Any, Tuple

class FireScheduleParser:
    """
    Specialized parser for fire engineer schedules.
    Ignores everything except the schedule table pages.
    """

    def parse(self, pdf_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Parse fire schedule from PDF."""
        start_time = time.time()

        try:
            pdf_file = io.BytesIO(pdf_bytes)

            with pdfplumber.open(pdf_file) as pdf:
                # Step 1: Identify schedule pages
                schedule_pages = self._find_schedule_pages(pdf)

                if not schedule_pages:
                    return self._error_response(
                        "No fire schedule pages found. Looking for 'PASSIVE FIRE SCHEDULE' or 'Appendix A' markers.",
                        int((time.time() - start_time) * 1000)
                    )

                print(f"[FireSchedule] Found schedule on pages: {schedule_pages}")

                # Step 2: Extract tables from schedule pages only
                all_tables = []
                for page_num in schedule_pages:
                    page = pdf.pages[page_num - 1]  # 0-indexed
                    tables = self._extract_tables_from_page(page, page_num)
                    all_tables.extend(tables)

                if not all_tables:
                    return self._error_response(
                        f"Found schedule pages {schedule_pages} but no tables extracted. PDF may use images instead of text.",
                        int((time.time() - start_time) * 1000)
                    )

                print(f"[FireSchedule] Extracted {len(all_tables)} tables from {len(schedule_pages)} pages")

                # Step 3: Parse schedule rows from tables
                schedule_rows = self._parse_schedule_rows(all_tables)

                if not schedule_rows:
                    return self._error_response(
                        f"Extracted {len(all_tables)} tables but couldn't parse schedule rows.",
                        int((time.time() - start_time) * 1000)
                    )

                print(f"[FireSchedule] Parsed {len(schedule_rows)} schedule rows")

                # Step 4: Calculate confidence
                avg_confidence = sum(r['parse_confidence'] for r in schedule_rows) / len(schedule_rows)
                low_confidence = sum(1 for r in schedule_rows if r['parse_confidence'] < 0.7)

                extraction_time_ms = int((time.time() - start_time) * 1000)

                return {
                    'success': True,
                    'rows': schedule_rows,
                    'metadata': {
                        'total_rows': len(schedule_rows),
                        'average_confidence': avg_confidence,
                        'low_confidence_count': low_confidence,
                        'parsing_notes': f"Successfully extracted {len(schedule_rows)} rows from {len(schedule_pages)} schedule pages using pdfplumber table extraction",
                        'schedule_pages': schedule_pages,
                        'tables_found': len(all_tables)
                    },
                    'extraction_time_ms': extraction_time_ms
                }

        except Exception as e:
            extraction_time_ms = int((time.time() - start_time) * 1000)
            return self._error_response(str(e), extraction_time_ms)

    def _find_schedule_pages(self, pdf: Any) -> List[int]:
        """
        Find pages containing the fire schedule.
        Looks for markers like "PASSIVE FIRE SCHEDULE", "Appendix A", etc.
        """
        schedule_pages = []
        schedule_markers = [
            'passive fire schedule',
            'appendix a',
            'fire schedule',
            'fire stopping schedule',
            'penetration schedule'
        ]

        # Also look for product markers to STOP (PS-01 pages are product sheets, not schedule)
        stop_markers = [
            'installation instructions',
            'product data sheet',
            'technical data sheet',
            'installation details'
        ]

        in_schedule_section = False

        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            text_lower = text.lower()

            # Check if this page starts the schedule
            if any(marker in text_lower for marker in schedule_markers):
                in_schedule_section = True
                schedule_pages.append(page_num)
                print(f"[FireSchedule] Page {page_num}: Schedule start detected")
                continue

            # If we're in schedule section, check for stop markers
            if in_schedule_section:
                if any(marker in text_lower for marker in stop_markers):
                    print(f"[FireSchedule] Page {page_num}: Product sheets detected - stopping schedule extraction")
                    break

                # If page has table-like structure, include it
                # Look for column headers typical in schedules
                if any(keyword in text_lower for keyword in [
                    'substrate', 'orientation', 'frr', 'service', 'system classification',
                    'insulation', 'test reference', 'passive solution'
                ]):
                    schedule_pages.append(page_num)
                    print(f"[FireSchedule] Page {page_num}: Schedule content detected")
                elif len(schedule_pages) > 0 and page_num - schedule_pages[-1] > 2:
                    # If we're more than 2 pages past last schedule page, stop
                    print(f"[FireSchedule] Page {page_num}: Gap detected - stopping schedule extraction")
                    break

        return schedule_pages

    def _extract_tables_from_page(self, page: Any, page_num: int) -> List[Dict]:
        """
        Extract ALL tables from a page using multiple aggressive strategies.
        """
        tables = []

        # Strategy 1: Lines-strict (bordered tables with clear lines)
        strategy_1_settings = {
            "vertical_strategy": "lines_strict",
            "horizontal_strategy": "lines_strict",
            "intersection_tolerance": 3,
        }
        extracted = page.extract_tables(strategy_1_settings)
        if extracted:
            print(f"[FireSchedule] Page {page_num}: Strategy 1 (lines_strict) found {len(extracted)} tables")
            for idx, table in enumerate(extracted):
                tables.append({
                    'page': page_num,
                    'strategy': 'lines_strict',
                    'table_index': idx,
                    'rows': table
                })
            return tables  # Return early if successful

        # Strategy 2: Lines (less strict)
        strategy_2_settings = {
            "vertical_strategy": "lines",
            "horizontal_strategy": "lines",
            "intersection_tolerance": 10,
        }
        extracted = page.extract_tables(strategy_2_settings)
        if extracted:
            print(f"[FireSchedule] Page {page_num}: Strategy 2 (lines) found {len(extracted)} tables")
            for idx, table in enumerate(extracted):
                tables.append({
                    'page': page_num,
                    'strategy': 'lines',
                    'table_index': idx,
                    'rows': table
                })
            return tables

        # Strategy 3: Text-based (for tables without lines)
        strategy_3_settings = {
            "vertical_strategy": "text",
            "horizontal_strategy": "text",
            "snap_tolerance": 3,
            "join_tolerance": 3,
        }
        extracted = page.extract_tables(strategy_3_settings)
        if extracted:
            print(f"[FireSchedule] Page {page_num}: Strategy 3 (text) found {len(extracted)} tables")
            for idx, table in enumerate(extracted):
                tables.append({
                    'page': page_num,
                    'strategy': 'text',
                    'table_index': idx,
                    'rows': table
                })
            return tables

        # Strategy 4: Very aggressive (last resort)
        strategy_4_settings = {
            "vertical_strategy": "text",
            "horizontal_strategy": "text",
            "snap_tolerance": 5,
            "join_tolerance": 5,
            "edge_min_length": 1,
            "min_words_vertical": 1,
            "text_tolerance": 5,
        }
        extracted = page.extract_tables(strategy_4_settings)
        if extracted:
            print(f"[FireSchedule] Page {page_num}: Strategy 4 (aggressive) found {len(extracted)} tables")
            for idx, table in enumerate(extracted):
                tables.append({
                    'page': page_num,
                    'strategy': 'aggressive',
                    'table_index': idx,
                    'rows': table
                })

        if not tables:
            print(f"[FireSchedule] Page {page_num}: WARNING - No tables extracted with any strategy")

        return tables

    def _parse_schedule_rows(self, tables: List[Dict]) -> List[Dict]:
        """
        Parse schedule rows from extracted tables.
        Returns list of structured schedule row objects.
        """
        schedule_rows = []
        row_counter = 0

        for table_info in tables:
            rows = table_info['rows']
            page_num = table_info['page']

            if not rows or len(rows) < 2:
                continue

            # First row is usually header
            header = rows[0]
            data_rows = rows[1:]

            print(f"[FireSchedule] Table on page {page_num}: {len(data_rows)} data rows")
            print(f"[FireSchedule] Header: {header[:10] if len(header) > 10 else header}")

            # Identify columns
            col_map = self._identify_columns(header)
            print(f"[FireSchedule] Column mapping: {col_map}")

            for row in data_rows:
                # Skip empty rows
                if not row or all(cell is None or str(cell).strip() == '' for cell in row):
                    continue

                # Skip header repeats
                if row == header:
                    continue

                row_counter += 1
                schedule_row = self._parse_row(row, col_map, page_num, row_counter)

                if schedule_row:
                    schedule_rows.append(schedule_row)

        return schedule_rows

    def _identify_columns(self, header: List) -> Dict[str, int]:
        """
        Identify which column contains which field.
        Returns dict mapping field_name -> column_index.

        For Beca-style schedules, typical columns are:
        - Service
        - Material
        - Size (mm)
        - Insulation
        - Orientation / Overall Required FRR / Type / Build up
        - Multiple substrate columns (Masonry 120, Plasterboard 120, etc.)
        Each substrate column contains:
          - Fire Stop Reference (PFP001, etc.)
          - Fire Stop Products
          - Substrate Requirements
        """
        col_map = {}

        # Column patterns for different schedule types
        column_patterns = {
            # Basic service info columns
            'service_type': ['service', 'fire hydrant', 'heating', 'cable', 'storm water', 'sanitary'],
            'material': ['material'],
            'service_size': ['size', 'size (mm)', 'diameter'],
            'insulation_thickness': ['insulation', 'insulation...'],

            # FRR and substrate info
            'orientation': ['orientation'],
            'frr_rating': ['required frr', 'frr'],
            'substrate_type': ['type', 'masonry', 'plasterboard', 'korok', 'flatdeck', 'clt'],
            'build_up': ['build up', 'overall thickness'],

            # Fire stopping products and references
            'fire_stop_reference': ['fire stop reference', 'passive fire code', 'pfp'],
            'fire_stop_products': ['fire stop products', 'passive fire solution'],
            'substrate_requirements': ['substrate requirements', 'limitations', 'build up requirements'],

            # For detailed tables (page 2)
            'passive_fire_code': ['passive fire code', 'pfp'],
            'passive_fire_type': ['passive fire type'],
            'passive_fire_solutions': ['passive fire solution'],
            'limitations': ['limitations'],
        }

        for field, patterns in column_patterns.items():
            for idx, cell in enumerate(header):
                if cell is None:
                    continue
                cell_lower = str(cell).lower().strip()
                for pattern in patterns:
                    if pattern in cell_lower:
                        col_map[field] = idx
                        break
                if field in col_map:
                    break

        return col_map

    def _parse_row(self, row: List, col_map: Dict[str, int], page_num: int, row_index: int) -> Dict:
        """Parse a single schedule row into structured format."""

        def get_cell(field: str) -> str:
            col_idx = col_map.get(field, -1)
            if col_idx < 0 or col_idx >= len(row):
                return ""
            val = row[col_idx]
            return str(val).strip() if val is not None else ""

        # Extract service information
        service_type = get_cell('service_type')
        material = get_cell('material')
        service_size = get_cell('service_size')
        insulation_thickness = get_cell('insulation_thickness')

        # Extract substrate and FRR info
        orientation = get_cell('orientation')
        frr_rating = get_cell('frr_rating')
        substrate_type = get_cell('substrate_type')
        build_up = get_cell('build_up')

        # Extract fire stopping details
        fire_stop_reference = get_cell('fire_stop_reference') or get_cell('passive_fire_code')
        fire_stop_products = get_cell('fire_stop_products') or get_cell('passive_fire_solutions')
        substrate_requirements = get_cell('substrate_requirements') or get_cell('limitations')

        # For page 2 style tables
        passive_fire_type = get_cell('passive_fire_type')

        # Build raw text from entire row
        raw_text = " | ".join(str(cell) for cell in row if cell is not None and str(cell).strip())

        # Extract solution ID from fire_stop_reference (e.g., "PFP001")
        solution_id = None
        if fire_stop_reference:
            # Look for PFP codes
            pfp_match = re.search(r'PFP\d+[A-Z]?', fire_stop_reference, re.IGNORECASE)
            if pfp_match:
                solution_id = pfp_match.group(0).upper()

        # Combine material into service type if both exist
        if material and service_type:
            full_service_type = f"{service_type} - {material}"
        elif material:
            full_service_type = material
        else:
            full_service_type = service_type

        # Calculate confidence
        confidence = self._calculate_row_confidence({
            'solution_id': solution_id,
            'fire_stop_reference': fire_stop_reference,
            'service_type': full_service_type,
            'fire_stop_products': fire_stop_products,
            'raw_text': raw_text
        })

        # If confidence too low, skip
        if confidence < 0.3:
            return None

        # Parse numeric fields
        size_min, size_max = self._parse_size_range(service_size)
        thickness_mm = self._parse_number(insulation_thickness)

        return {
            'solution_id': solution_id,
            'system_classification': passive_fire_type if passive_fire_type else substrate_type,
            'substrate': substrate_type if substrate_type else None,
            'orientation': orientation if orientation else None,
            'frr_rating': frr_rating if frr_rating else None,
            'service_type': full_service_type if full_service_type else None,
            'service_size_text': service_size if service_size else None,
            'service_size_min_mm': size_min,
            'service_size_max_mm': size_max,
            'insulation_type': None,  # Not typically a separate column in Beca schedules
            'insulation_thickness_mm': thickness_mm,
            'test_reference': fire_stop_reference if fire_stop_reference else None,
            'fire_stop_products': fire_stop_products if fire_stop_products else None,
            'substrate_requirements': substrate_requirements if substrate_requirements else None,
            'build_up': build_up if build_up else None,
            'notes': None,
            'raw_text': raw_text,
            'parse_confidence': confidence,
            'page_number': page_num,
            'row_index': row_index
        }

    def _parse_size_range(self, size_text: str) -> Tuple[float, float]:
        """Parse size range from text like '20-50mm' or '32mm'."""
        if not size_text:
            return None, None

        # Look for range pattern: 20-50, 20 - 50, etc.
        range_match = re.search(r'(\d+)\s*-\s*(\d+)', size_text)
        if range_match:
            return float(range_match.group(1)), float(range_match.group(2))

        # Look for single number
        single_match = re.search(r'(\d+)', size_text)
        if single_match:
            val = float(single_match.group(1))
            return val, val

        return None, None

    def _parse_number(self, text: str) -> float:
        """Parse a single number from text."""
        if not text:
            return None

        match = re.search(r'(\d+(?:\.\d+)?)', text)
        if match:
            return float(match.group(1))
        return None

    def _calculate_row_confidence(self, data: Dict) -> float:
        """Calculate confidence score for a parsed row."""
        score = 0.0

        # Key fields presence - adjusted for Beca schedule structure
        if data.get('solution_id'):
            score += 0.3  # PFP codes are strong indicators

        if data.get('fire_stop_reference'):
            score += 0.2  # Fire stop reference is critical

        if data.get('service_type'):
            score += 0.2  # Service type is important

        if data.get('fire_stop_products'):
            score += 0.2  # Product list is valuable
            # Bonus if contains known brands
            products = str(data.get('fire_stop_products', '')).lower()
            if any(brand in products for brand in ['ryanfire', 'promat', 'protecta', 'hilti', 'boss', 'trafalgar']):
                score += 0.1

        # Raw text quality
        raw_text = data.get('raw_text', '')
        if len(raw_text) > 30:
            score += 0.05

        return min(1.0, score)

    def _error_response(self, error_message: str, extraction_time_ms: int) -> Dict:
        """Return standardized error response."""
        return {
            'success': False,
            'rows': [],
            'metadata': {
                'total_rows': 0,
                'average_confidence': 0.0,
                'low_confidence_count': 0,
                'parsing_notes': error_message
            },
            'error': error_message,
            'extraction_time_ms': extraction_time_ms
        }

import os
import io
import json
import gc
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import logging

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

API_KEY = os.getenv('API_KEY', 'dev-key-change-in-production')
MAX_FILE_SIZE_MB = int(os.getenv('MAX_FILE_SIZE_MB', 10))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
ENABLE_MEMORY_OPTIMIZATION = os.getenv('ENABLE_MEMORY_OPTIMIZATION', 'true').lower() == 'true'

# Lazy import parsers to reduce memory footprint
class ParserFactory:
    """Factory for lazy-loading parsers only when needed."""

    @staticmethod
    def get_pdfplumber():
        from parsers.pdfplumber_parser import PDFPlumberParser
        return PDFPlumberParser()

    @staticmethod
    def get_pymupdf():
        from parsers.pymupdf_parser import PyMuPDFParser
        return PyMuPDFParser()

    @staticmethod
    def get_ocr():
        from parsers.ocr_parser import OCRParser
        return OCRParser()

    @staticmethod
    def get_textract():
        from parsers.textract_parser import TextractParser
        return TextractParser()

    @staticmethod
    def get_docai():
        from parsers.docai_parser import DocAIParser
        return DocAIParser()

    @staticmethod
    def get_ensemble():
        from parsers.ensemble_coordinator import EnsembleCoordinator
        return EnsembleCoordinator()

def cleanup_memory():
    """Force garbage collection to free memory."""
    if ENABLE_MEMORY_OPTIMIZATION:
        gc.collect()

def verify_api_key():
    """Verify API key from request headers."""
    auth_header = request.headers.get('X-API-Key')
    if not auth_header or auth_header != API_KEY:
        return False
    return True

def validate_file_size(file_bytes):
    """Validate file size to prevent memory issues."""
    file_size = len(file_bytes)
    if file_size > MAX_FILE_SIZE_BYTES:
        return False, f"File size ({file_size / 1024 / 1024:.2f}MB) exceeds maximum allowed size ({MAX_FILE_SIZE_MB}MB)"
    return True, None

@app.route('/', methods=['GET'])
def index():
    """Root endpoint."""
    return jsonify({
        'service': 'PDF Parser Ensemble',
        'version': '1.0.0',
        'endpoints': {
            'health': '/health',
            'parse_ensemble': '/parse/ensemble',
            'parse_auto': '/parse/auto',
            'parse_pdfplumber': '/parse/pdfplumber',
            'parse_pymupdf': '/parse/pymupdf',
            'parse_ocr': '/parse/ocr',
            'parse_textract': '/parse/textract',
            'parse_docai': '/parse/docai'
        }
    })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'pdf-parser-ensemble',
        'version': '1.0.0',
        'parsers': {
            'pdfplumber': True,
            'pymupdf': True,
            'ocr': True,
            'textract': bool(os.getenv('AWS_ACCESS_KEY_ID')),
            'docai': bool(os.getenv('GOOGLE_APPLICATION_CREDENTIALS'))
        }
    })

@app.route('/parse/pdfplumber', methods=['POST'])
def parse_pdfplumber():
    """Parse PDF using pdfplumber (table extraction)."""
    if not verify_api_key():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        pdf_bytes = file.read()

        # Validate file size
        valid, error_msg = validate_file_size(pdf_bytes)
        if not valid:
            return jsonify({'error': error_msg}), 413

        parser = ParserFactory.get_pdfplumber()
        result = parser.parse(pdf_bytes, file.filename)

        cleanup_memory()
        return jsonify(result)
    except Exception as e:
        logger.error(f"PDFPlumber parsing error: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/parse/pymupdf', methods=['POST'])
def parse_pymupdf():
    """Parse PDF using PyMuPDF (text and layout extraction)."""
    if not verify_api_key():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        pdf_bytes = file.read()

        # Validate file size
        valid, error_msg = validate_file_size(pdf_bytes)
        if not valid:
            return jsonify({'error': error_msg}), 413

        parser = ParserFactory.get_pymupdf()
        result = parser.parse(pdf_bytes, file.filename)

        cleanup_memory()
        return jsonify(result)
    except Exception as e:
        logger.error(f"PyMuPDF parsing error: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/parse/ocr', methods=['POST'])
def parse_ocr():
    """Parse PDF using OCR (for scanned documents)."""
    if not verify_api_key():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        pdf_bytes = file.read()

        # Validate file size
        valid, error_msg = validate_file_size(pdf_bytes)
        if not valid:
            return jsonify({'error': error_msg}), 413

        parser = ParserFactory.get_ocr()
        result = parser.parse(pdf_bytes, file.filename)

        cleanup_memory()
        return jsonify(result)
    except Exception as e:
        logger.error(f"OCR parsing error: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/parse/textract', methods=['POST'])
def parse_textract():
    """Parse PDF using AWS Textract."""
    if not verify_api_key():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        pdf_bytes = file.read()

        # Validate file size
        valid, error_msg = validate_file_size(pdf_bytes)
        if not valid:
            return jsonify({'error': error_msg}), 413

        parser = ParserFactory.get_textract()
        result = parser.parse(pdf_bytes, file.filename)

        cleanup_memory()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Textract parsing error: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/parse/docai', methods=['POST'])
def parse_docai():
    """Parse PDF using Google Document AI."""
    if not verify_api_key():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        pdf_bytes = file.read()

        # Validate file size
        valid, error_msg = validate_file_size(pdf_bytes)
        if not valid:
            return jsonify({'error': error_msg}), 413

        parser = ParserFactory.get_docai()
        result = parser.parse(pdf_bytes, file.filename)

        cleanup_memory()
        return jsonify(result)
    except Exception as e:
        logger.error(f"DocAI parsing error: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/parse/ensemble', methods=['POST'])
def parse_ensemble():
    """
    Run all available parsers and return ensemble results.
    This is the main endpoint that orchestrates multiple parsers.
    """
    if not verify_api_key():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        pdf_bytes = file.read()

        if not pdf_bytes:
            return jsonify({'error': 'Empty file provided'}), 400

        # Validate file size
        valid, error_msg = validate_file_size(pdf_bytes)
        if not valid:
            return jsonify({'error': error_msg}), 413

        logger.info(f"Processing file: {file.filename}, size: {len(pdf_bytes)} bytes")

        # Get parser selection from request (optional)
        parsers_to_use = request.form.get('parsers', 'all')
        if parsers_to_use == 'all':
            parsers_to_use = ['pdfplumber', 'pymupdf', 'ocr']

            # Add cloud parsers if credentials available
            if os.getenv('AWS_ACCESS_KEY_ID'):
                parsers_to_use.append('textract')
            if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
                parsers_to_use.append('docai')
        else:
            parsers_to_use = [p.strip() for p in parsers_to_use.split(',')]

        logger.info(f"Using parsers: {parsers_to_use}")

        coordinator = ParserFactory.get_ensemble()
        result = coordinator.parse_with_ensemble(
            pdf_bytes,
            file.filename,
            parsers_to_use
        )

        logger.info(f"Ensemble parsing completed successfully")
        cleanup_memory()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Ensemble parsing error: {str(e)}", exc_info=True)
        return jsonify({
            'error': str(e),
            'error_type': type(e).__name__,
            'parser_name': 'ensemble',
            'success': False
        }), 500

@app.route('/parse/auto', methods=['POST'])
def parse_auto():
    """
    Automatically select best parser based on document characteristics.
    Tries parsers in order until one succeeds with high confidence.
    """
    if not verify_api_key():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        pdf_bytes = file.read()

        # Validate file size
        valid, error_msg = validate_file_size(pdf_bytes)
        if not valid:
            return jsonify({'error': error_msg}), 413

        coordinator = ParserFactory.get_ensemble()
        result = coordinator.parse_with_auto_selection(pdf_bytes, file.filename)

        cleanup_memory()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Auto parsing error: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

# PDF Parser Ensemble Service

Python microservice that runs multiple PDF parsers (pdfplumber, PyMuPDF, OCR, AWS Textract, Google DocAI) and intelligently combines their results.

## Features

- **5 PDF Parsers**:
  - `pdfplumber`: Table-based extraction
  - `PyMuPDF (fitz)`: Text and layout extraction
  - `OCR (Tesseract)`: For scanned documents
  - `AWS Textract`: Cloud-based document analysis
  - `Google Document AI`: Advanced ML-based extraction

- **Ensemble Mode**: Runs multiple parsers in parallel and builds consensus
- **Auto Mode**: Tries parsers in order until one succeeds with high confidence
- **Confidence Scoring**: Each parser returns confidence metrics
- **API Authentication**: Secure with API key

## Installation

### Local Development

```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt-get install tesseract-ocr poppler-utils

# Install Python dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Edit .env with your API keys
nano .env

# Run the service
python app.py
```

### Docker Deployment

```bash
# Build image
docker build -t pdf-parser-ensemble .

# Run container
docker run -p 5000:5000 \
  -e API_KEY=your-secure-key \
  -e AWS_ACCESS_KEY_ID=your-aws-key \
  -e AWS_SECRET_ACCESS_KEY=your-aws-secret \
  pdf-parser-ensemble
```

### Deploy to Render/Railway/Heroku

1. Push code to GitHub
2. Create new Web Service on platform
3. Set environment variables
4. Deploy!

## API Endpoints

### Health Check
```bash
GET /health
```

Returns status of all parsers and whether cloud parsers are configured.

### Parse with Specific Parser

```bash
POST /parse/pdfplumber
POST /parse/pymupdf
POST /parse/ocr
POST /parse/textract  # Requires AWS credentials
POST /parse/docai     # Requires Google Cloud credentials
```

**Request**: Multipart form data with `file` field

**Response**:
```json
{
  "parser_name": "pdfplumber",
  "success": true,
  "items": [...],
  "metadata": {...},
  "financials": {...},
  "confidence_score": 0.85,
  "extraction_time_ms": 1234
}
```

### Parse with Ensemble (Recommended)

```bash
POST /parse/ensemble
```

Runs all available parsers in parallel and returns combined results.

**Request**: Multipart form data
- `file`: PDF file
- `parsers` (optional): Comma-separated list of parsers to use (default: all)

**Response**:
```json
{
  "best_result": {...},
  "all_results": [
    {
      "parser_name": "pdfplumber",
      "success": true,
      "items": [...],
      "confidence_score": 0.85
    },
    {
      "parser_name": "pymupdf",
      "success": true,
      "items": [...],
      "confidence_score": 0.78
    }
  ],
  "consensus_items": [...],
  "confidence_breakdown": {
    "overall": 0.87,
    "parsers_succeeded": 2,
    "parsers_attempted": 3,
    "cross_model_agreement": 0.75,
    "best_parser": "pdfplumber",
    "best_parser_confidence": 0.85
  },
  "recommendation": "HIGH_CONFIDENCE_MULTI_PARSER",
  "extraction_metadata": {...}
}
```

### Auto Parse

```bash
POST /parse/auto
```

Automatically selects best parser based on document characteristics. Tries parsers in order until one succeeds with high confidence (>70%). Falls back to ensemble if needed.

## Authentication

All endpoints except `/health` require API key authentication:

```bash
curl -X POST http://localhost:5000/parse/ensemble \
  -H "X-API-Key: your-api-key" \
  -F "file=@quote.pdf"
```

## Environment Variables

### Required
- `API_KEY`: Secret key for authentication

### Optional
- `PORT`: Server port (default: 5000)
- `AWS_ACCESS_KEY_ID`: For AWS Textract
- `AWS_SECRET_ACCESS_KEY`: For AWS Textract
- `AWS_REGION`: AWS region (default: us-east-1)
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to Google credentials JSON
- `GOOGLE_CLOUD_PROJECT_ID`: Google Cloud project ID
- `GOOGLE_CLOUD_LOCATION`: Location (default: us)
- `GOOGLE_DOCAI_PROCESSOR_ID`: Document AI processor ID

## Parser Selection Guide

### Use pdfplumber when:
- Document has clear table structures
- Well-formatted quotes
- High quality PDF (not scanned)

### Use PyMuPDF when:
- Mixed layouts
- Complex formatting
- Need text position information

### Use OCR when:
- Scanned documents
- Image-based PDFs
- Poor quality text extraction from other parsers

### Use Textract when:
- Complex forms
- Need high accuracy
- AWS infrastructure available

### Use DocAI when:
- Specialized document types
- Need ML-powered extraction
- Google Cloud infrastructure available

### Use Ensemble when:
- Critical documents requiring high confidence
- Unknown document format
- Want best of all parsers

## Integration with Supabase Edge Functions

Update your edge function to call this service:

```typescript
const response = await fetch('https://your-service.onrender.com/parse/ensemble', {
  method: 'POST',
  headers: {
    'X-API-Key': Deno.env.get('PDF_PARSER_API_KEY')
  },
  body: formData
});

const result = await response.json();
```

## Performance

- **pdfplumber**: ~1-2 seconds
- **PyMuPDF**: ~1-2 seconds
- **OCR**: ~3-5 seconds (slower due to image conversion)
- **Textract**: ~2-4 seconds (network dependent)
- **DocAI**: ~2-4 seconds (network dependent)
- **Ensemble**: ~3-6 seconds (parallel execution)

## Troubleshooting

### Tesseract not found
```bash
# Ubuntu/Debian
sudo apt-get install tesseract-ocr

# macOS
brew install tesseract

# Set path if needed
export TESSDATA_PREFIX=/usr/share/tesseract-ocr/4.00/tessdata
```

### Poppler not found (pdf2image)
```bash
# Ubuntu/Debian
sudo apt-get install poppler-utils

# macOS
brew install poppler
```

### AWS Textract errors
- Check AWS credentials are set correctly
- Verify IAM permissions for Textract
- Check region is correct

### Google DocAI errors
- Verify credentials JSON is valid
- Check project ID and processor ID
- Ensure Document AI API is enabled

## License

MIT

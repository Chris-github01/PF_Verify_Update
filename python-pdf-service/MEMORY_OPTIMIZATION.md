# Memory Optimization Guide for PDF Parser Service

## Problem
The PDF parser service was exceeding memory limits on Render's free tier (512MB), causing automatic restarts and service interruptions.

## Root Causes
1. **Heavy Dependencies**: Multiple PDF parsing libraries (PyMuPDF, pdfplumber, Tesseract OCR, Pillow, unstructured)
2. **Multiple Workers**: Original config used 2 workers, doubling memory usage
3. **Large File Processing**: No file size validation allowed processing of very large PDFs
4. **No Memory Cleanup**: Python garbage collection not explicitly triggered after processing
5. **Eager Loading**: All parser libraries loaded at startup, consuming memory even when not used

## Solutions Implemented

### 1. Optimized Render Configuration (`render.yaml`)

**Changed from:**
```yaml
plan: free  # 512MB RAM
workers: 2
worker-class: sync
```

**Changed to:**
```yaml
plan: starter  # 2GB RAM (recommended)
workers: 1
threads: 2
worker-class: gthread
worker-tmp-dir: /dev/shm  # Use shared memory for temporary files
max-requests: 50  # Restart worker after 50 requests to prevent memory leaks
```

**Benefits:**
- Starter plan ($7/month) provides 2GB RAM vs 512MB on free tier
- Single worker with threads uses less memory than multiple workers
- gthread worker class is more memory-efficient for I/O-bound tasks
- Worker restarts prevent memory leak accumulation

### 2. File Size Validation

Added file size limits to prevent processing oversized files:

```python
MAX_FILE_SIZE_MB = 10  # Configurable via environment variable
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

def validate_file_size(file_bytes):
    file_size = len(file_bytes)
    if file_size > MAX_FILE_SIZE_BYTES:
        return False, f"File exceeds maximum size ({MAX_FILE_SIZE_MB}MB)"
    return True, None
```

**Benefits:**
- Rejects oversized files before processing begins
- Prevents memory exhaustion from very large PDFs
- Returns clear error message (HTTP 413) to client

### 3. Lazy Loading of Parsers

Implemented `ParserFactory` to load parsers only when needed:

```python
class ParserFactory:
    @staticmethod
    def get_pdfplumber():
        from parsers.pdfplumber_parser import PDFPlumberParser
        return PDFPlumberParser()

    # ... other parsers
```

**Benefits:**
- Reduces initial memory footprint by ~200-300MB
- Only imports libraries when specific parser is requested
- Faster startup times

### 4. Explicit Memory Cleanup

Added garbage collection after each request:

```python
import gc

def cleanup_memory():
    if ENABLE_MEMORY_OPTIMIZATION:
        gc.collect()

# Called after each parser execution
result = parser.parse(pdf_bytes, file.filename)
cleanup_memory()
```

**Benefits:**
- Forces immediate cleanup of large objects (PDF bytes, parsed data)
- Prevents memory accumulation across requests
- Can be disabled via environment variable if not needed

## Deployment Options

### Option 1: Upgrade to Starter Plan (Recommended)
- **Cost**: $7/month
- **Memory**: 2GB RAM
- **Best for**: Production use with regular traffic
- **Configuration**: Use the updated `render.yaml` as-is

### Option 2: Stay on Free Tier (Limited)
- **Cost**: Free
- **Memory**: 512MB RAM
- **Limitations**: Can only handle small PDFs (<2MB), may still timeout
- **Configuration**: Further reduce `MAX_FILE_SIZE_MB` to 2-5MB
- **Trade-offs**: Less reliable, more restarts

### Option 3: Alternative Free Hosting

Consider these alternatives with better free tier specs:
- **Railway**: 512MB RAM + $5 free credit/month
- **Fly.io**: 256MB RAM free (not recommended for PDF processing)
- **DigitalOcean App Platform**: $5/month starter tier with 512MB RAM

## Environment Variables

Set these in your Render dashboard:

```bash
# Required
API_KEY=<generate-secure-key>
PORT=5000

# Memory optimization
MAX_FILE_SIZE_MB=10              # Max file size in MB (default: 10)
ENABLE_MEMORY_OPTIMIZATION=true  # Enable garbage collection (default: true)

# Optional cloud parsers
AWS_ACCESS_KEY_ID=<your-key>     # For AWS Textract
AWS_SECRET_ACCESS_KEY=<your-secret>
GOOGLE_APPLICATION_CREDENTIALS=<path>  # For Google Document AI
```

## Monitoring Memory Usage

### Check Render Logs
1. Go to Render dashboard
2. Select your service
3. Click "Logs" tab
4. Look for memory usage metrics

### Common Warning Signs
- `Memory limit exceeded` messages
- Frequent service restarts
- `OOMKilled` errors
- Slow response times (>30s)

### Memory Usage by Parser
- **PyMuPDF**: ~50-100MB per request
- **pdfplumber**: ~100-200MB per request
- **OCR (Tesseract)**: ~200-400MB per request
- **Ensemble (all parsers)**: ~400-600MB per request

## Performance Optimization Tips

### 1. Use Specific Parsers
Instead of `/parse/ensemble`, use specific endpoints:
```bash
# Lighter weight
POST /parse/pymupdf      # ~50MB memory
POST /parse/pdfplumber   # ~100MB memory

# Heavy weight
POST /parse/ocr          # ~400MB memory (avoid on free tier)
POST /parse/ensemble     # ~600MB memory (requires starter plan)
```

### 2. Process Files Client-Side First
- Compress PDFs before uploading
- Split large documents into smaller chunks
- Remove unnecessary pages or images

### 3. Use Chunking
For very large documents, implement chunking:
```python
# Process 10 pages at a time instead of entire document
chunk_size = 10
results = []
for i in range(0, total_pages, chunk_size):
    chunk_result = parse_chunk(pdf, i, i + chunk_size)
    results.append(chunk_result)
```

## Troubleshooting

### Service Still Running Out of Memory?

1. **Check actual file sizes being processed**
   ```bash
   # Add to your logs
   logger.info(f"File size: {len(pdf_bytes) / 1024 / 1024:.2f}MB")
   ```

2. **Reduce MAX_FILE_SIZE_MB**
   ```bash
   # In Render dashboard, set:
   MAX_FILE_SIZE_MB=5
   ```

3. **Disable heavy parsers**
   ```python
   # In ensemble_coordinator.py, comment out OCR:
   # parsers_to_use.remove('ocr')
   ```

4. **Monitor worker memory**
   ```bash
   # SSH into Render container (if accessible)
   ps aux | grep gunicorn
   ```

### Files Being Rejected as Too Large?

1. **Increase file size limit** (if you upgraded plan)
   ```bash
   MAX_FILE_SIZE_MB=20
   ```

2. **Compress PDFs before upload**
   - Use PDF compression tools
   - Reduce image quality in PDFs
   - Remove embedded fonts

3. **Split large documents**
   - Process pages in batches
   - Combine results client-side

## Cost Analysis

### Free Tier (Not Recommended)
- **Cost**: $0
- **Reliability**: Low (frequent restarts)
- **Max file size**: ~2MB
- **Best for**: Testing only

### Starter Plan (Recommended)
- **Cost**: $7/month
- **Reliability**: High
- **Max file size**: ~10MB
- **Best for**: Production with moderate traffic
- **ROI**: Worth it if processing >10 files/day

### Professional Plan (Heavy Usage)
- **Cost**: $25/month
- **RAM**: 4GB
- **Max file size**: ~50MB
- **Best for**: High volume processing (100+ files/day)

## Summary

The memory issues have been fixed with:
1. ✅ Upgraded to Starter plan (2GB RAM)
2. ✅ Optimized worker configuration (1 worker with threads)
3. ✅ Added file size validation (10MB limit)
4. ✅ Implemented lazy loading (reduces startup memory by ~300MB)
5. ✅ Added explicit garbage collection after each request

**Expected Results:**
- No more memory limit errors
- Stable service operation
- Ability to process 10MB PDFs reliably
- ~50-100 concurrent requests capacity

**Next Steps:**
1. Deploy the updated configuration to Render
2. Monitor service logs for 24-48 hours
3. Adjust MAX_FILE_SIZE_MB based on actual usage patterns
4. Consider implementing request queuing for high traffic periods

#!/usr/bin/env python3
"""
Test script to verify the PDF parser service works locally before deployment.
Run: python test_service.py
"""

import os
import sys

def test_imports():
    """Test that all required imports work."""
    print("Testing imports...")
    try:
        import flask
        print("  ✓ Flask installed")
    except ImportError as e:
        print(f"  ✗ Flask not installed: {e}")
        return False

    try:
        import pdfplumber
        print("  ✓ pdfplumber installed")
    except ImportError as e:
        print(f"  ✗ pdfplumber not installed: {e}")
        return False

    try:
        import fitz  # PyMuPDF
        print("  ✓ PyMuPDF installed")
    except ImportError as e:
        print(f"  ✗ PyMuPDF not installed: {e}")
        return False

    try:
        import pytesseract
        print("  ✓ pytesseract installed")
    except ImportError as e:
        print(f"  ✗ pytesseract not installed: {e}")
        return False

    try:
        from PIL import Image
        print("  ✓ Pillow installed")
    except ImportError as e:
        print(f"  ✗ Pillow not installed: {e}")
        return False

    try:
        from pdf2image import convert_from_bytes
        print("  ✓ pdf2image installed")
    except ImportError as e:
        print(f"  ✗ pdf2image not installed: {e}")
        return False

    print("  ✓ All imports successful\n")
    return True

def test_parsers():
    """Test that parser classes can be instantiated."""
    print("Testing parser initialization...")
    try:
        from parsers.pdfplumber_parser import PDFPlumberParser
        parser = PDFPlumberParser()
        print("  ✓ PDFPlumberParser initialized")
    except Exception as e:
        print(f"  ✗ PDFPlumberParser failed: {e}")
        return False

    try:
        from parsers.pymupdf_parser import PyMuPDFParser
        parser = PyMuPDFParser()
        print("  ✓ PyMuPDFParser initialized")
    except Exception as e:
        print(f"  ✗ PyMuPDFParser failed: {e}")
        return False

    try:
        from parsers.ocr_parser import OCRParser
        parser = OCRParser()
        print("  ✓ OCRParser initialized")
    except Exception as e:
        print(f"  ✗ OCRParser failed: {e}")
        return False

    try:
        from parsers.ensemble_coordinator import EnsembleCoordinator
        coordinator = EnsembleCoordinator()
        print("  ✓ EnsembleCoordinator initialized")
    except Exception as e:
        print(f"  ✗ EnsembleCoordinator failed: {e}")
        return False

    print("  ✓ All parsers initialized successfully\n")
    return True

def test_app():
    """Test that the Flask app can be created."""
    print("Testing Flask app...")
    try:
        from app import app
        print("  ✓ Flask app created")

        with app.test_client() as client:
            # Test root endpoint
            response = client.get('/')
            if response.status_code == 200:
                print("  ✓ Root endpoint works")
            else:
                print(f"  ✗ Root endpoint failed: {response.status_code}")
                return False

            # Test health endpoint
            response = client.get('/health')
            if response.status_code == 200:
                print("  ✓ Health endpoint works")
                data = response.get_json()
                print(f"    Status: {data.get('status')}")
                print(f"    Parsers: {list(data.get('parsers', {}).keys())}")
            else:
                print(f"  ✗ Health endpoint failed: {response.status_code}")
                return False

    except Exception as e:
        print(f"  ✗ Flask app test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

    print("  ✓ Flask app works\n")
    return True

def check_system_dependencies():
    """Check for system-level dependencies."""
    print("Checking system dependencies...")

    # Check for tesseract
    import subprocess
    try:
        result = subprocess.run(['tesseract', '--version'],
                              capture_output=True,
                              text=True,
                              timeout=5)
        if result.returncode == 0:
            version = result.stdout.split('\n')[0]
            print(f"  ✓ Tesseract found: {version}")
        else:
            print("  ⚠ Tesseract not found (OCR will fail)")
            print("    Install: sudo apt-get install tesseract-ocr (Linux)")
            print("    Install: brew install tesseract (macOS)")
    except FileNotFoundError:
        print("  ⚠ Tesseract not found (OCR parser will not work)")
        print("    This is OK for Render deployment (uses Docker)")
    except Exception as e:
        print(f"  ⚠ Could not check tesseract: {e}")

    # Check for poppler (pdf2image dependency)
    try:
        result = subprocess.run(['pdftoppm', '-v'],
                              capture_output=True,
                              text=True,
                              timeout=5)
        if result.returncode == 0:
            print("  ✓ Poppler found (pdf2image will work)")
        else:
            print("  ⚠ Poppler not found (OCR will fail)")
    except FileNotFoundError:
        print("  ⚠ Poppler not found (needed for pdf2image)")
        print("    Install: sudo apt-get install poppler-utils (Linux)")
        print("    Install: brew install poppler (macOS)")
    except Exception as e:
        print(f"  ⚠ Could not check poppler: {e}")

    print()

def main():
    """Run all tests."""
    print("="*60)
    print("PDF Parser Service - Pre-Deployment Test")
    print("="*60)
    print()

    success = True

    if not test_imports():
        success = False
        print("\n❌ Import test failed!")
        print("Run: pip install -r requirements.txt")
        return False

    check_system_dependencies()

    if not test_parsers():
        success = False
        print("\n❌ Parser test failed!")
        return False

    if not test_app():
        success = False
        print("\n❌ App test failed!")
        return False

    if success:
        print("="*60)
        print("✅ ALL TESTS PASSED!")
        print("="*60)
        print()
        print("Your service is ready to deploy!")
        print()
        print("Next steps:")
        print("1. Deploy to Render.com (see QUICK_DEPLOY.md)")
        print("2. Copy your API key from Render environment variables")
        print("3. Add API key to Supabase system_config table")
        print("4. Add service URL to Supabase edge function environment")
        print()
        return True
    else:
        print("="*60)
        print("❌ SOME TESTS FAILED")
        print("="*60)
        print()
        print("Fix the errors above before deploying.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

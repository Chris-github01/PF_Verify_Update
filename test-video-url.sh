#!/bin/bash

# Test if video URL is accessible
VIDEO_URL="https://pub-4a052394260a4d93950fdab2b1ce9caa.r2.dev/verifyplus-explained.mp4"

echo "Testing video URL..."
echo "URL: $VIDEO_URL"
echo ""

# Try to fetch the video
RESPONSE=$(curl -I -s -o /dev/null -w "%{http_code}" "$VIDEO_URL")

if [ "$RESPONSE" -eq 200 ]; then
    echo "✅ SUCCESS: Video is accessible (HTTP 200)"
    echo ""
    echo "Checking CORS headers..."
    curl -I -s "$VIDEO_URL" | grep -i "access-control"
elif [ "$RESPONSE" -eq 404 ]; then
    echo "❌ ERROR: Video not found (HTTP 404)"
    echo ""
    echo "Action required:"
    echo "1. Upload 'verifyplus-explained.mp4' to your R2 bucket"
    echo "2. Verify the filename is exactly: verifyplus-explained.mp4"
    echo "3. Check that public access is enabled"
else
    echo "⚠️  WARNING: Unexpected response (HTTP $RESPONSE)"
    echo ""
    echo "Response headers:"
    curl -I -s "$VIDEO_URL"
fi

echo ""
echo "See R2_UPLOAD_INSTRUCTIONS.md for setup guide"

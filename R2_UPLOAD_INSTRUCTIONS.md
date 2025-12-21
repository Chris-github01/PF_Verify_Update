# Cloudflare R2 Video Upload Instructions

## Step 1: Access Cloudflare Dashboard
1. Go to https://dash.cloudflare.com/
2. Log in to your account
3. Select **R2** from the left sidebar

## Step 2: Locate Your Bucket
Your video bucket name is: `pub-4a052394260a4d93950fdab2b1ce9caa`

1. Find this bucket in the R2 dashboard
2. Click on the bucket name to open it

## Step 3: Upload Video File
1. Click **Upload** button
2. Select your video file
3. **CRITICAL**: Name it exactly `verifyplus-explained.mp4`
4. Wait for upload to complete

## Step 4: Configure Public Access
1. Go to bucket settings
2. Enable **Public Access**
3. Set domain to: `pub-4a052394260a4d93950fdab2b1ce9caa.r2.dev`

## Step 5: Configure CORS
Add this CORS policy to allow video playback:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3000
  }
]
```

## Step 6: Verify Upload
Test the URL in your browser:
```
https://pub-4a052394260a4d93950fdab2b1ce9caa.r2.dev/verifyplus-explained.mp4
```

It should start downloading/playing the video.

## Video Requirements
- **Format**: MP4 (H.264 video codec, AAC audio codec)
- **Resolution**: 1920x1080 or 1280x720 recommended
- **File Size**: Under 100MB for best performance
- **Duration**: 2-5 minutes ideal for product demos

## Troubleshooting

### 404 Error Persists
- Check exact filename: `verifyplus-explained.mp4` (case-sensitive)
- Verify public access is enabled
- Check CORS configuration

### Video Doesn't Play
- Ensure MP4 format with H.264 codec
- Check file isn't corrupted
- Try re-uploading

### Slow Loading
- Compress video file size
- Use 720p instead of 1080p
- Enable R2 caching

## Alternative: Use Vimeo (Recommended)
If R2 setup is complex, use Vimeo instead:

1. Upload to Vimeo
2. Get embed code
3. Replace video element in `HeroVideo.tsx` with iframe

Example:
```tsx
<iframe
  src="https://player.vimeo.com/video/YOUR_VIDEO_ID"
  width="100%"
  height="100%"
  frameBorder="0"
  allow="autoplay; fullscreen"
  allowFullScreen
/>
```

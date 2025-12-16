#!/usr/bin/env node

/**
 * Simple OG Image Generator
 * Creates a basic placeholder until a professional design is available
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a simple SVG that can be converted to PNG
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1e293b;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Grid pattern -->
  <defs>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(59, 130, 246, 0.03)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#grid)" opacity="0.5"/>

  <!-- Content -->
  <g transform="translate(600, 315)">
    <!-- Logo -->
    <text x="0" y="-80" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="72" font-weight="800" fill="#3b82f6" letter-spacing="-2">
      VerifyTrade
    </text>

    <!-- Subtitle -->
    <text x="0" y="-20" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="32" font-weight="600" fill="#cbd5e1">
      Verify+ Passive Fire
    </text>

    <!-- Description -->
    <text x="0" y="40" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="24" font-weight="400" fill="#94a3b8">
      <tspan x="0" dy="0">Upload passive fire quotes and receive a full audit</tspan>
      <tspan x="0" dy="36">exposing scope gaps, missing systems, and procurement risk</tspan>
    </text>

    <!-- Badge -->
    <rect x="-140" y="100" width="280" height="52" rx="12" fill="rgba(59, 130, 246, 0.1)" stroke="rgba(59, 130, 246, 0.3)" stroke-width="2"/>
    <text x="0" y="133" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="20" font-weight="600" fill="#60a5fa">
      Quote Auditing Platform
    </text>
  </g>
</svg>`;

// Save SVG
const svgPath = path.join(__dirname, 'public', 'og-image.svg');
fs.writeFileSync(svgPath, svg);
console.log('✓ Created og-image.svg');

// Instructions for PNG conversion
console.log(`
To convert to PNG (required for best compatibility):

Option 1 - Online converter:
  Visit https://cloudconvert.com/svg-to-png
  Upload og-image.svg from the public folder
  Set dimensions to 1200x630
  Download as og-image.png

Option 2 - Using ImageMagick (if installed):
  convert -background none -size 1200x630 public/og-image.svg public/og-image.png

Option 3 - Using Inkscape (if installed):
  inkscape public/og-image.svg --export-png=public/og-image.png -w 1200 -h 630

For now, the SVG will work as a fallback, but PNG is recommended for best social media compatibility.
`);

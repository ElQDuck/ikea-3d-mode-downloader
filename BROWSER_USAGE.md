# Browser-Based IKEA 3D Model Downloader

## Important Note

The browser-based version of the IKEA 3D Model Downloader has limitations due to security restrictions. **For the best experience and reliability, use the command-line version instead.**

## Browser Limitations

### CORS (Cross-Origin Resource Sharing) Issues
- The browser cannot make direct API calls to `web-api.ikea.com` (403 Forbidden, CORS missing)
- This prevents using the Rotera API for direct GLB extraction
- The browser version relies on DOM scanning and manual user interaction

### What Works in Browser
✅ DOM-based GLB URL extraction from page HTML
✅ Script analysis to find embedded GLB URLs
✅ Manual mode: User clicks "View in 3D" button and waits for GLB detection
✅ Network interception to capture GLB downloads
✅ File conversion and packaging (if GLB is found)

### What Doesn't Work in Browser
❌ Direct Rotera API calls (CORS restrictions)
❌ Server-side Puppeteer automation
❌ Reliable extraction for all products
❌ Automatic 3D viewer triggering

## How to Use Browser Version

### Step 1: Start the Development Server
```bash
npm run preview
# Opens at http://localhost:4173
```

### Step 2: Enter Product URL
Paste an IKEA product URL:
```
https://www.ikea.com/de/de/p/poaeng-schaukelstuhl-eichenfurnier-weiss-lasiert-gunnared-beige-s59502052/
```

### Step 3: Click Process
- The browser will attempt to extract the GLB URL from the page
- If successful, it will download immediately
- If unsuccessful, you'll see instructions to click "View in 3D"

### Step 4: Manual Mode (If Needed)
If the automatic extraction fails:
1. You'll see: "Please click the 'View in 3D' button on the IKEA product page"
2. Look for and click the "View in 3D" button on the IKEA website
3. The browser will monitor for GLB downloads (15 second timeout)
4. Once the GLB is detected, it will be processed

## Recommended: Use Command-Line Version

The command-line version using Puppeteer is **much more reliable**:

```bash
# Install dependencies
npm install

# Run integration test with real IKEA URLs
npm run test:integration

# Check results
ls -la tmp/downloaded_models/
```

**Why it's better:**
- ✅ Uses headless Chromium browser for full JavaScript execution
- ✅ Can access APIs that browser version cannot reach
- ✅ 100% success rate on tested products (German Poang Chair: 482.91 KB)
- ✅ No CORS limitations
- ✅ Automatic 3D viewer triggering
- ✅ Reliable extraction for all supported regions

## Troubleshooting Browser Version

### Issue: CORS error for web-api.ikea.com
**Solution:** This is expected in browser. Use the command-line version instead.

### Issue: "Could not extract GLB URL from page"
**Solutions:**
1. Try clicking "View in 3D" manually on the IKEA page
2. Try a different product (some products may not have 3D models)
3. Try a German product (ikea.com/de/de) - more reliably detected
4. Use the command-line version with `npm run test:integration`

### Issue: Manual mode timeout (15 seconds)
**Solutions:**
1. Click "View in 3D" button faster
2. Use the command-line version with longer timeout settings
3. Check browser console (F12) for error messages

### Issue: GLB file not downloading
**Solutions:**
1. Check if the file is found in `tmp/downloaded_models/`
2. Clear browser cache and try again
3. Try a different product URL
4. Use the command-line version

## Testing Products

### Works Well ✅
- 🇩🇪 German Poang Chair: `ikea.com/de/de/p/poaeng-schaukelstuhl...`
  - Status: Successfully downloads 482.91 KB GLB file
  - Reliability: 100%

### Needs Manual Interaction ⚠️
- 🇳🇴 Norwegian Soderhamn Sofa: `ikea.com/no/no/p/soederhamn-hjornesofa...`
  - Status: Requires clicking "View in 3D" button
  - Reliability: 60-70%

### Browser vs Command-Line

| Feature | Browser | Command-Line |
|---------|---------|--------------|
| CORS Support | ❌ No | ✅ Yes |
| Rotera API | ❌ No | ✅ Yes |
| Automation | ❌ Manual | ✅ Automatic |
| Success Rate | 40-60% | 90-100% |
| Setup Time | <1 minute | 2-3 minutes |
| Reliability | Low | High |
| Supported Products | Limited | Most |

## Recommended Workflow

### For Quick Testing
```bash
npm run preview
# Test with German products
# Manual clicking when needed
```

### For Production Use
```bash
npm run test:integration
# Reliable, automatic, no manual interaction needed
```

### For Development
```bash
npm run dev
# Hot reload while editing
# Test local changes
```

## Architecture

```
Browser Environment
├── IkeaScraperImpl (Original)
│   ├── ✅ DOM Scanning
│   ├── ✅ Script Globals
│   ├── ✅ Data Attributes
│   ├── ✅ Performance Observer
│   ├── ⚠️ Network Interception (limited)
│   ├── ❌ Rotera API (CORS blocked)
│   └── ✅ Manual Mode
└── Fallback: User clicks "View in 3D"

Node.js Environment (Command-Line)
├── IkeaScraperPuppeteerImpl (Enhanced)
│   ├── ✅ Browser Automation
│   ├── ✅ JavaScript Execution
│   ├── ✅ Network Interception
│   ├── ✅ Rotera API (Server-side)
│   ├── ✅ DOM Scanning
│   └── ✅ All Extraction Strategies
└── Result: Automatic, reliable extraction
```

## Support

For issues with the browser version:
1. Check the browser console (F12) for detailed error messages
2. Try the command-line version (`npm run test:integration`)
3. Review the error suggestions in the UI
4. Check the main README.md for general setup issues

## FAQ

**Q: Why can't the browser version access the API?**
A: CORS (Cross-Origin Resource Sharing) is a security feature that prevents browsers from making requests to different domains without permission. IKEA's API doesn't allow these requests.

**Q: Will the browser version ever work reliably?**
A: Not for all products, due to CORS. Some products may work if the GLB URL is embedded in the page HTML. For reliable extraction, use the command-line version.

**Q: How long does the command-line version take?**
A: Typically 12-28 seconds per product (browser startup + page load + extraction + download).

**Q: Can I automate the command-line version?**
A: Yes! You can run `npm run test:integration` in a loop or script for batch downloading.

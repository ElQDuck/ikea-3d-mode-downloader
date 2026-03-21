# Plan for IKEA 3D Model Downloader Web Application

## Overview
Create a browser-based web application that allows users to input an IKEA product URL, download the 3D model (GLB format), convert it to OBJ format with textures, package it in a ZIP file, and provide a download link - all without a backend.

## Key Components
1. HTML interface for URL input and controls
2. TypeScript logic for:
   - Fetching IKEA product pages
   - Extracting GLB URLs (adapted from userscript)
   - Downloading GLB files
   - Converting GLB to OBJ with texture preservation
   - Creating ZIP archives
   - Providing download functionality

## Implementation Steps

### 1. Project Setup
- Create package.json with TypeScript and necessary dependencies
- Set up basic HTML structure
- Configure TypeScript compilation

### 2. Core Logic Adaptation
Extract and adapt the userscript functionality:
- Network interception for GLB URL detection
- Manual mode for finding "View in 3D" buttons
- URL parsing and filename generation

### 3. GLB to OBJ Conversion
- Use three.js or similar library to parse GLB/GLTF
- Export to OBJ format with associated MTL and texture files
- Preserve material properties and texture mappings

### 4. ZIP Creation
- Use JSZip to package:
  - Model.obj
  - Model.mtl
  - Texture files (referenced in MTL)
- Generate downloadable blob

### 5. User Interface
- Input field for IKEA URL
- Submit button
- Status/progress indicators
- Download button (hidden until processing complete)
- Error handling and user feedback

## Security Considerations
- URL validation: Ensure input is a valid IKEA URL to prevent SSRF attacks
- CORS handling: Respect IKEA's CORS policies; inform users if CORS restrictions block downloads
- Input sanitization: Sanitize filename generation to prevent path traversal
- Content security: Implement basic CSP headers via meta tags if serving from a domain
- Data privacy: No user data is stored or transmitted to external servers
- Dependency security: Use vetted libraries (three.js, jszip) and keep updated
- File type validation: Verify downloaded files are actually GLB format before processing

## Multi-Agent Workflow
### Roles and Responsibilities:
- **Developer**: Implements features according to specifications, writes clean TypeScript code, follows coding standards
- **Project Owner**: Prioritizes features, clarifies requirements, accepts/rejects completed work
- **Reviewer**: Conducts code reviews, ensures adherence to AGENTS.md guidelines, identifies potential improvements
- **Tester**: Creates test plans, executes functional and edge case testing, verifies success criteria
- **Security**: Reviews implementation for vulnerabilities, validates security considerations, recommends mitigations
- **Architect**: Reviews overall design, ensures technical decisions align with goals, suggests architectural improvements

### Workflow Process:
1. Planning phase: Project owner and architect define requirements
2. Development phase: Developer implements features
3. Review phase: Reviewer checks code quality and adherence to guidelines
4. Security review: Security agent evaluates implementation for risks
5. Testing phase: Tester validates functionality and edge cases
6. Feedback loop: Issues are sent back to developer for resolution
7. Approval: Project owner gives final approval

## Dependencies
- TypeScript
- Three.js (for GLB parsing and OBJ export)
- JSZip (for ZIP archive creation)
- Optional: fetch polyfill or CORS handling solution

## File Structure
```
ikea-3d-mode-downloader/
├── index.html
├── src/
│   ├── main.ts
│   ├── ikea-scraper.ts
│   ├── glb-converter.ts
│   └── zip-packer.ts
├── dist/
│   ├── index.html
│   ├── bundle.js
│   └── bundle.js.map
├── package.json
├── tsconfig.json
└── README.md
```

## Development Approach
1. Start with basic HTML/UI
2. Implement URL fetching and GLB extraction
3. Add GLB download functionality
4. Implement conversion pipeline
5. Add ZIP packaging
6. Integrate all components
7. Test with various IKEA product URLs
8. Handle edge cases and error conditions
9. Conduct security review
10. Perform multi-agent review process

## Component Specifications

### IKEA Scraper (ikea-scraper.ts)
- Extracts GLB URLs from IKEA product pages using multiple strategies:
  1. Parsing HTML for model-viewer elements with GLB sources
  2. Searching for direct GLB links in anchor tags
  3. Scanning inline JavaScript for GLB URL patterns
  4. Checking data attributes on images and other elements
- Handles URL resolution for relative paths
- Implements caching to avoid duplicate network requests
- Provides fallback mechanisms when primary extraction methods fail
- Includes timeout and retry logic for network requests
- Validates that fetched content is actually GLB format

### GLB Converter (glb-converter.ts)
- Uses three.js GLTFLoader to parse GLB files
- Processes scene graph to extract meshes, materials, and textures
- Exports to OBJ format using three.js OBJExporter
- Generates accompanying MTL file with material definitions
- Extracts and preserves texture images (PNG/JPEG)
- Handles both embedded and external textures
- Supports Draco compressed GLB files
- Preserves material properties (color, roughness, metalness, etc.)
- Properly handles texture coordinates and mapping
- Optimizes OBJ output for Sweet Home 3D compatibility
- Includes error handling for malformed GLB files

### ZIP Packer (zip-packer.ts)
- Uses JSZip to create in-memory ZIP archives
- Packages OBJ, MTL, and texture files with proper directory structure
- Ensures MTL file correctly references texture files
- Handles filename sanitization for ZIP compatibility
- Provides progress tracking for large file packaging
- Generates ZIP as Blob for browser download
- Includes validation to ensure all required files are present
- Handles memory efficiency for large model packages
- Provides option to customize output filename

### Main Coordinator (main.ts)
- Manages application state and user interactions
- Orchestrates the workflow: scrape → download → convert → package → download
- Updates UI with status messages and progress indicators
- Handles error states and user feedback
- Manages button states to prevent duplicate processing
- Implements URL validation and input sanitization
- Provides cleanup of temporary objects and memory management
- Handles edge cases like network failures, invalid URLs, and processing timeouts

## User Interface Details
- Clean, responsive design using CSS Flexbox/Grid
- Input validation with real-time feedback
- Clear status messaging (info, success, error states)
- Visual progress indication for long operations
- Prominent download button that appears when ready
- Mobile-friendly layout and touch targets
- Accessible form elements with proper labels
- Loading states for buttons during processing
- Error recovery options (retry, reset)

## Challenges and Solutions
- CORS restrictions: May need to rely on IKEA's CORS policies; if restrictive, inform users about limitations and suggest alternatives
- GLB parsing: Use well-tested three.js loader with proper error handling for various GLB versions
- Texture handling: Ensure proper MTL file generation and texture inclusion with correct relative paths
- Browser limitations: Handle large files appropriately with progress indicators, memory management, and chunked processing where possible
- Security validation: Implement URL validation (allowlist IKEA domains) and input sanitization as specified
- Sweet Home 3D compatibility: Test output with actual Sweet Home 3D imports to ensure proper material and texture handling

## Success Criteria
- User can paste any valid IKEA product URL
- Application successfully extracts and downloads GLB if available (subject to CORS)
- GLB is converted to OBJ with textures preserved and properly referenced
- ZIP file is generated containing all necessary files in correct structure
- Download link works correctly in browser with appropriate filename
- No backend required - all processing client-side
- Application follows security best practices outlined in the plan
- Code adheres to AGENTS.md guidelines
- All agent roles can effectively collaborate using this plan
- Output files are compatible with Sweet Home 3D

## Testing Strategy
- Unit tests for individual components (scraper, converter, packer)
- Integration tests for full workflow with mock data
- Manual testing with various IKEA product URLs
- Edge case testing (invalid URLs, network errors, malformed GLB)
- Performance testing with large models
- Security testing for URL validation and input sanitization
- Compatibility testing with Sweet Home 3D import

## Deployment Considerations
- Static site hosting (GitHub Pages, Netlify, Vercel)
- Service worker for offline caching (optional)
- Build optimization for production (minification, tree shaking)
- Error logging and reporting (optional)
- User analytics (optional, privacy-conscious)
- Multi-language support (based on userscript patterns)
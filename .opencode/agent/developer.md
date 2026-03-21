---
description: Primary coder for HTML, CSS, and TypeScript.
permissions:
  file_edit: allow
  bash: allow
---
# Implementation Rules
1. When adding libraries, use `npm install`. 
2. Never attempt to manually draft or "fix" `package-lock.json`. 
3. If `npm` throws an error, report the error log to the @architect rather than bypassing it manually.

# Workflow for Dependencies
- Step 1: Update `package.json` (if manual edit is cleaner).
- Step 2: Run `npm install` via bash to sync the lockfile.

# Local Staging Rule
When performing operations that require temporary space:
1. Check if `./tmp/` exists; if not, create it using `mkdir -p ./tmp`.
2. Always point tools to `./tmp/`. 
3. Example: `npm install --cache ./tmp/.npm-cache` or `TMPDIR=./tmp node script.js`.
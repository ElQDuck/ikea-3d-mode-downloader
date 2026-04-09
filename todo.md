# TODO — Conversion & Hardening

This file captures next actions to finish, harden and test the GLB -> OBJ+MTL+textures conversion pipeline (Blender-based). Keep items small and actionable.

1. Immediate verification (manual)
   - Build & run stack:
     - `docker compose build backend`
     - `docker compose up -d`
   - Fetch a product (example):
     - `curl -X POST -H "Content-Type: application/json" -d '{"url":"<IKE A_URL>"}' http://localhost:3001/api/fetch-product`
     - Poll status: `curl http://localhost:3001/api/status/<jobId>` until `status: done`
   - Trigger conversion (debug):
     - `curl -o out.zip "http://localhost:3001/api/convert/<jobId>?file=<basename.glb>"`
     - Inspect ZIP (unzip / open) and verify `.obj`, `.mtl`, and texture files are present and consistent.

2. Harden blender_convert.py (high)
   - Ensure all texture map types are handled: map_Kd, map_Ks, map_Bump, map_d, map_Ka, etc.
   - If Blender embeds images (bpy.data.images with no filepath), export them to files and reference those basenames in the MTL.
   - Use deterministic output filenames (e.g. `model.obj` + `model.mtl`) and ensure API renames them consistently in the ZIP.
   - Add clearer logging and non-zero exit codes on failures so backend can relay meaningful errors.

3. Fix decode-draco.mjs (medium)
   - Currently it runs and produces a file but does not reliably remove KHR_draco entries in all cases.
   - Implement a decode pipeline that explicitly decompresses Draco primitives (use @gltf-transform/functions or gltf-pipeline). Validate the output has no KHR_draco references.
   - Tests: run `node scripts/decode-draco.mjs <in.glb> /tmp/out.glb` and assert `grep -a "KHR_draco" /tmp/out.glb` returns nothing.

4. Tests / CI (high)
   - Add an integration test (Playwright / Jest) that does:
     1. POST /api/fetch-product with a known IKEA product URL
     2. Wait for status done
     3. GET /api/convert/:id and save the ZIP
     4. Assert ZIP contains one `.obj`, one `.mtl`, and zero-or-more image files; parse `.mtl` and assert references exist in the ZIP.
   - Add the test to CI pipeline and run inside Docker (use the existing Playwright image).

5. Clean up experimental code (medium)
   - Remove unused JS experiments if Blender is the canonical path:
     - backend/scripts/decode-draco.mjs (only keep if you improve it)
     - any three.js / @gltf-transform experiment files and package.json deps that are unused
   - Update backend/package.json to remove large packages that aren't used to reduce image size.

6. Docker / infra considerations (medium)
   - Official Blender tarball is large — consider moving Blender to a dedicated conversion worker image or service.
   - Add concurrency limits / queueing for conversion jobs (Blender is heavy). Consider a small worker pool and a job queue.
   - Add timeouts and memory limits for container/Blender runs.

7. UX & API polish (low)
   - Provide progress updates for long conversions (websocket / server-sent events) or at least clearer API messages.
   - Add retry semantics for transient Blender failures.

8. Debugging tips / useful commands
   - List downloads inside backend container:
     - `docker compose exec backend ls -la /app/downloads`
   - Run decode script manually:
     - `docker compose exec backend node /app/scripts/decode-draco.mjs /app/downloads/FILE.glb /tmp/decoded.glb`
   - Run Blender manually inside container:
     - `docker compose exec backend bash`
     - `export BLENDER_IN=/tmp/decoded.glb; export BLENDER_OUT_DIR=/tmp/conv; blender --background --python /app/scripts/blender_convert.py`
   - Inspect the ZIP the API returned (inside container):
     - `docker compose exec backend python3 - <<'PY'\nimport zipfile\nwith zipfile.ZipFile('/tmp/out.zip') as z:\n    print([i.filename for i in z.infolist()])\nPY`

9. Acceptance criteria (what "done" looks like)
   - For a representative set of IKEA GLB files (including Draco-compressed ones): converting via `GET /api/convert/:id` returns a ZIP containing:
     - `<base>.obj` (valid Wavefront OBJ)
     - `<base>.mtl` (references textures by basename)
     - All texture files referenced by the MTL, with matching filenames
   - The backend logs Blender stdout/stderr for all failures and surfaces a clear message to the client on failure.

10. Optional future improvements
    - Convert image formats if necessary (e.g., .ktx2 or other exotic formats -> .png)
    - Support exporting to other formats (FBX) or provide a small UI to choose outputs

-- End

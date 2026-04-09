import os
import sys
import bpy
import shutil

in_path = os.environ.get("BLENDER_IN")
out_dir = os.environ.get("BLENDER_OUT_DIR")

if not in_path or not out_dir:
    print(
        "BLENDER_IN and BLENDER_OUT_DIR environment variables required", file=sys.stderr
    )
    sys.exit(2)

print("Blender converting", in_path, "->", out_dir)

# Clear default scene
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

# Import GLB/GLTF
try:
    bpy.ops.import_scene.gltf(filepath=in_path)
except Exception as e:
    print("Import failed:", e, file=sys.stderr)
    sys.exit(3)

# Ensure output directory exists
os.makedirs(out_dir, exist_ok=True)

# Export OBJ (this will write an MTL and reference textures)
# Use path_mode='COPY' so external images are copied next to the OBJ/MTL
out_obj = os.path.join(out_dir, "model.obj")
try:
    bpy.ops.export_scene.obj(
        filepath=out_obj,
        use_materials=True,
        use_uvs=True,
        use_normals=True,
        path_mode="COPY",
    )
except Exception as e:
    print("Export failed:", e, file=sys.stderr)
    sys.exit(4)

print("Exported", out_obj)

# Try to copy linked images used by Blender into out_dir
for img in bpy.data.images:
    if not img.filepath:
        continue
    # Blender stores relative paths; try to resolve
    src = bpy.path.abspath(img.filepath)
    if os.path.exists(src):
        try:
            # Copy into out_dir using the source basename so MTL references are simple
            dst = os.path.join(out_dir, os.path.basename(src))
            shutil.copy(src, dst)
            print("Copied texture", src, "->", dst)
        except Exception:
            pass

sys.exit(0)

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

# After export, try to ensure any images referenced by the generated MTL are saved
mtl_path = os.path.join(out_dir, "model.mtl")

# Helper to attempt to write an image object to a destination path
def save_image_to(img, dst):
    try:
        img.filepath_raw = dst
        img.save()
        print("Saved image via img.save():", dst)
        return True
    except Exception:
        pass
    try:
        pf = None
        if hasattr(img, "packed_file") and img.packed_file:
            pf = img.packed_file
        elif hasattr(img, "packed_files") and getattr(img, "packed_files"):
            try:
                pf = img.packed_files[0]
            except Exception:
                pf = None
        if pf is not None:
            data = getattr(pf, "data", None)
            if data:
                with open(dst, "wb") as f:
                    f.write(data)
                print("Wrote packed image data to:", dst)
                return True
    except Exception:
        pass
    try:
        img.filepath_raw = dst
        img.save_render(dst)
        print("Saved image via img.save_render():", dst)
        return True
    except Exception as e:
        print("Failed to export image", getattr(img, "name", "<unknown>"), ":", e)
    return False


# First: if a model.mtl was written, parse it and try to save images using the exact
# basenames referenced there so the MTL and files will match.
if os.path.exists(mtl_path):
    try:
        with open(mtl_path, "r", encoding="utf8") as f:
            mtl_lines = f.read().splitlines()
    except Exception:
        mtl_lines = []

    referenced = []
    for line in mtl_lines:
        import re

        m = re.match(r"^(map_\w+|bump|disp|decal)\b(.*)$", line, re.I)
        if m:
            rest = m.group(2).strip()
            tokens = [t for t in rest.split() if t]
            full = tokens[-1] if tokens else rest
            b = os.path.basename(full) if full else None
            if b:
                referenced.append(b)

    # For each referenced basename, try to find a matching bpy.data.images object
    for basename in referenced:
        dst = os.path.join(out_dir, basename)
        if os.path.exists(dst):
            # already present
            continue
        found = False
        for img in bpy.data.images:
            # skip invalid images
            try:
                if img.size[0] == 0 or img.size[1] == 0:
                    continue
            except Exception:
                pass

            # candidate match if source filepath basename matches, or image name matches basename
            try:
                src = bpy.path.abspath(img.filepath) if img.filepath else None
            except Exception:
                src = None

            if src and os.path.basename(src) == basename and os.path.exists(src):
                try:
                    shutil.copy(src, dst)
                    print("Copied texture", src, "->", dst)
                    found = True
                    break
                except Exception:
                    pass

            # match by image name (strip extension differences)
            name = (img.name or "").split(".")[0]
            if name and os.path.splitext(basename)[0] == name:
                if save_image_to(img, dst):
                    found = True
                    break

            # if image is packed, try to write it with the basename
            try:
                if getattr(img, "packed_file", None) or getattr(img, "packed_files", None):
                    if save_image_to(img, dst):
                        found = True
                        break
            except Exception:
                pass

        if not found:
            # last attempt: if src path from any image contains the basename, copy it
            for img in bpy.data.images:
                try:
                    src = bpy.path.abspath(img.filepath) if img.filepath else None
                    if src and basename in os.path.basename(src) and os.path.exists(src):
                        try:
                            shutil.copy(src, dst)
                            print("Copied texture (contains)", src, "->", dst)
                            found = True
                            break
                        except Exception:
                            pass
                except Exception:
                    pass

# Debug: dump info about images Blender knows about
try:
    print("Blender image list:")
    for img in bpy.data.images:
        try:
            print(
                " -",
                getattr(img, 'name', '<noname>'),
                "filepath=",
                getattr(img, 'filepath', None),
                "packed=",
                bool(getattr(img, 'packed_file', None)) or bool(getattr(img, 'packed_files', None)),
                "format=",
                getattr(img, 'file_format', None),
                "size=",
                getattr(img, 'size', None),
            )
        except Exception:
            pass
except Exception:
    pass

# Debug: list files currently in out_dir
try:
    print("Files in out_dir:", os.listdir(out_dir))
except Exception:
    pass
# Fallback: try to export any remaining bpy.data.images to disk using a safe basename
for img in bpy.data.images:
    # Skip images with no pixels
    try:
        if img.size[0] == 0 or img.size[1] == 0:
            continue
    except Exception:
        # If size not available, continue cautiously
        pass
    # Determine destination basename
    try:
        src = bpy.path.abspath(img.filepath) if img.filepath else None
    except Exception:
        src = None
    if src:
        base = os.path.basename(src)
    else:
        name = img.name or "image"
        base_name = "".join(c for c in name if c.isalnum() or c in ("-", "_", ".")) or "image"
        ext = (getattr(img, "file_format", None) or "PNG").lower()
        if not base_name.lower().endswith("." + ext):
            base = f"{base_name}.{ext}"
        else:
            base = base_name

    dst = os.path.join(out_dir, base)
    if os.path.exists(dst):
        continue

    if src and os.path.exists(src):
        try:
            shutil.copy(src, dst)
            print("Copied texture", src, "->", dst)
            continue
        except Exception:
            pass

    try:
        save_image_to(img, dst)
    except Exception:
        pass

sys.exit(0)

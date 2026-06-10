# Python Package Cleanup Guide

This guide helps you safely remove NDI-related Python packages after removing the NDI bridge architecture.

## Important Notes

⚠️ **Only remove packages if they're not used by other projects!**

Some of these packages (especially `numpy` and `opencv-python`) are commonly used by many Python projects. Always check dependencies before uninstalling.

## Step 1: Check Installed Packages

First, check which NDI-related packages are installed:

```bash
# Check all installed packages
pip list | grep -E "ndi-python|aiortc|av|opencv-python|numpy|PyGObject"
```

Or on Windows PowerShell:
```powershell
pip list | Select-String -Pattern "ndi-python|aiortc|av|opencv-python|numpy|PyGObject"
```

## Step 2: Check Package Dependencies

For each package, check if other projects depend on it:

```bash
# Check what depends on each package
pip show ndi-python
pip show aiortc
pip show av
pip show opencv-python
pip show numpy
pip show PyGObject
```

Look for the "Required-by" field. If it shows other packages, those packages depend on it.

## Step 3: Safe Packages to Remove

These packages are **likely safe** to remove (NDI-specific):

- ✅ **ndi-python** - NDI SDK Python wrapper (only used for NDI bridge)
- ✅ **aiortc** - WebRTC for Python (only used in NDI bridge for consuming streams)

## Step 4: Potentially Safe Packages

These packages **might** be used elsewhere - check first:

- ⚠️ **av** (PyAV) - Video processing library
  - Check: `pip show av | grep "Required-by"`
  - If nothing depends on it, safe to remove

- ⚠️ **PyGObject** - GObject bindings (used for GStreamer)
  - Check: `pip show PyGObject | grep "Required-by"`
  - If nothing depends on it, safe to remove

## Step 5: Packages to Keep (Usually)

These packages are **commonly used** by many projects - only remove if you're certain:

- ❌ **numpy** - Scientific computing library
  - Very commonly used by data science, ML, image processing projects
  - **Recommendation**: Keep unless you're 100% sure no other project uses it

- ❌ **opencv-python** - Computer vision library
  - Commonly used for image/video processing
  - **Recommendation**: Keep unless you're 100% sure no other project uses it

## Step 6: Uninstall Packages

### Option A: Remove Only NDI-Specific Packages (Recommended)

```bash
# Safe to remove - only used for NDI bridge
pip uninstall -y ndi-python aiortc
```

### Option B: Remove Additional Packages (If Confirmed Safe)

```bash
# Only if you've confirmed nothing else depends on them
pip uninstall -y ndi-python aiortc av PyGObject
```

### Option C: Remove All (Use with Caution)

```bash
# ⚠️ WARNING: This will remove numpy and opencv-python too!
# Only use if you're certain no other projects need them
pip uninstall -y ndi-python aiortc av opencv-python numpy PyGObject
```

## Step 7: Verify Removal

After uninstalling, verify packages are removed:

```bash
pip list | grep -E "ndi-python|aiortc|av|opencv-python|numpy|PyGObject"
```

## Alternative: Use Virtual Environments

If you want to keep packages for other projects but clean up your system:

1. **Create a virtual environment** for each project:
   ```bash
   python -m venv project-venv
   source project-venv/bin/activate  # Linux/Mac
   # or
   project-venv\Scripts\activate  # Windows
   ```

2. **Install only what you need** in each virtual environment

3. **Remove global packages** that are no longer needed

## Disk Space Savings

| Package | Typical Size | Safe to Remove? |
|---------|--------------|-----------------|
| ndi-python | ~50-100MB | ✅ Yes |
| aiortc | ~20-50MB | ✅ Yes |
| av (PyAV) | ~50-100MB | ⚠️ Check dependencies |
| PyGObject | ~30-50MB | ⚠️ Check dependencies |
| numpy | ~50-100MB | ❌ Usually keep |
| opencv-python | ~100-200MB | ❌ Usually keep |

**Total potential savings**: ~150-300MB (if removing all NDI-specific packages)

## Troubleshooting

### Issue: "Package is required by another package"

**Solution**: Don't remove it. The package is used by another project.

### Issue: "Package not found" when checking

**Solution**: The package is already removed or was never installed globally.

### Issue: Other projects break after removing packages

**Solution**: Reinstall the packages:
```bash
pip install numpy opencv-python  # Reinstall what you need
```

## Recommended Approach

1. ✅ **Remove immediately**: `ndi-python`, `aiortc`
2. ⚠️ **Check first**: `av`, `PyGObject`
3. ❌ **Keep unless certain**: `numpy`, `opencv-python`

## Quick Command Reference

```bash
# Check what's installed
pip list | grep -E "ndi-python|aiortc|av|opencv-python|numpy|PyGObject"

# Check dependencies
pip show numpy | grep "Required-by"

# Safe removal (NDI-specific only)
pip uninstall -y ndi-python aiortc

# Verify removal
pip list | grep -E "ndi-python|aiortc"
```

---

**Last Updated**: After NDI removal  
**Status**: Cleanup Guide


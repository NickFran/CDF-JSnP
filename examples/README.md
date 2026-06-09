# Examples

These examples are meant to be run from the repository root.

Start with the first two files. They show the normal high-level workflow with almost no setup code.

## Files

- `quick-start.js`: open a dataset and print a compact overview.
- `temp-adjusted-by-depth.js`: fetch `TEMP_ADJUSTED` along the `DEPTH` dimension.
- `switch-datasets.js`: reuse one client across multiple datasets.
- `raw-bridge.js`: advanced example that uses the low-level `PythonBridge` directly.
- `system-python.js`: run the framework with a user-managed Python interpreter instead of `PythonPortable`.

## Run

```powershell
node .\examples\quick-start.js
node .\examples\temp-adjusted-by-depth.js
node .\examples\switch-datasets.js
node .\examples\raw-bridge.js
node .\\examples\\system-python.js
```

Most examples use the bundled portable Python runtime and the `.nc` files in `testFiles/`.

`system-python.js` requires a local Python installation with `numpy`, `xarray`, and `netCDF4` already installed.

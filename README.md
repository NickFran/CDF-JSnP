# CDF-JSnP

CDF-JSnP is a small framework for calling Python NetCDF code from JavaScript through a persistent child process. It extracts the reusable bridge pattern from an Electron app and turns it into a standalone library.

## What it provides

- A generic request-response Python bridge for JavaScript.
- A NetCDF adapter backed by `xarray`.
- Python launch helpers for bundled runtimes or user-managed system Python.
- A Python runtime that keeps a dataset session alive across multiple calls.

## Design

The library is split into two layers:

1. `PythonBridge`: generic child-process transport.
2. `NetCDFClient`: NetCDF-specific commands built on top of the bridge.

This keeps the process-management logic reusable while allowing the Python command surface to evolve independently.

## Layout

- `src/bridge/pythonBridge.js`: generic JSON line protocol bridge.
- `src/adapters/netcdfClient.js`: ergonomic NetCDF client wrapper.
- `src/python/netcdf_runtime.py`: Python command runtime.
- `src/utils/runtimePaths.js`: helpers for bundled Python runtimes.

The public package entry point is `src/index.js`, which re-exports the supported API surface.

## Example

Bundled portable Python with the simplest defaults:

```js
const { createNetCDFClient } = require('cdf-jsnp');

const client = createNetCDFClient();

async function main() {
  await client.openDataset('example.nc');
  const overview = await client.getOverview();
  console.log(overview);
  await client.closeDataset();
  client.dispose();
}

main().catch((error) => {
  console.error(error);
  client.dispose();
});
```

System Python instead of `PythonPortable`:

```js
const { createNetCDFClient } = require('cdf-jsnp');

const client = createNetCDFClient({
  usePortablePython: false,
});

async function main() {
  await client.openDataset('example.nc');
  console.log(await client.getDimensions());
  await client.closeDataset();
  client.dispose();
}

main().catch((error) => {
  console.error(error);
  client.dispose();
});
```

If you use system Python, it must already have the required packages installed, especially `numpy`, `xarray`, and `netCDF4`. `gsw` is only required for `bulk_sound_speed`.

## Examples Folder

See `examples/` for runnable usage samples:

- `examples/quick-start.js`: open a dataset and print a compact overview.
- `examples/temp-adjusted-by-depth.js`: fetch `TEMP_ADJUSTED` along the `DEPTH` dimension.
- `examples/switch-datasets.js`: reuse one client across multiple datasets.
- `examples/raw-bridge.js`: advanced example that uses the low-level `PythonBridge` directly.
- `examples/system-python.js`: run the framework with a user-managed Python interpreter.

Run them from the repository root with `node .\examples\<file>.js`.

## Current command surface

- `open_dataset`
- `close_dataset`
- `get_overview`
- `get_attributes`
- `get_summary`
- `get_coordinates`
- `get_dimensions`
- `list_variables`
- `get_variable`
- `get_variable_by_dimension`
- `get_last_non_nan_value_in_first_profile`
- `bulk_sound_speed`
- `list_commands`

The runtime also accepts the original NetSeaDF-style command names as compatibility aliases.

## Validation

Run the smoke test:

```powershell
npm run smoke
```

The smoke test now uses every `.nc` fixture in `testFiles/` and verifies that the client can:

- start the Python runtime
- open each dataset
- fetch overview, dimensions, and variables
- read at least one sample variable
- close the dataset cleanly

const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_ROOT = path.join(__dirname, '..', '..');

/**
 * Return the bundled NetCDF runtime script shipped with this library.
 *
 * @returns {string} Absolute path to the bundled Python runtime script.
 */
function getDefaultNetCDFRuntimePath() {
  return path.join(__dirname, '..', 'python', 'netcdf_runtime.py');
}

/**
 * Pick the most common system-Python command name for the current platform.
 *
 * @param {NodeJS.Platform} [platform=process.platform] - Platform used to choose the system Python command.
 * @returns {string} Command name that should normally resolve to a system Python interpreter.
 */
function getDefaultSystemPythonCommand(platform = process.platform) {
  return platform === 'win32' ? 'python' : 'python3';
}

/**
 * @typedef {Object} PortablePythonResolutionOptions
 * @property {string} [rootDir] - Repository root that contains the bundled Python directories. Defaults to the package root.
 * @property {NodeJS.Platform} [platform=process.platform] - Platform used to choose the bundled runtime.
 * @property {string} [arch=process.arch] - Architecture used to choose the bundled macOS runtime.
 */

/**
 * @typedef {Object} PythonLaunchResolutionOptions
 * @property {string} [pythonExecutable] - Explicit Python executable or command to use.
 * @property {string[]} [spawnArgs] - Extra arguments inserted between the executable and the script path.
 * @property {boolean} [usePortablePython] - Whether bundled portable Python should be preferred.
 * @property {string} [rootDir] - Repository root that contains the bundled Python directories. Defaults to the package root.
 * @property {NodeJS.Platform} [platform=process.platform] - Platform used during interpreter resolution.
 * @property {string} [arch=process.arch] - Architecture used during interpreter resolution.
 * @property {string} [systemPythonCommand] - Explicit fallback command for system Python.
 */

/**
 * @typedef {Object} PythonLaunchResult
 * @property {string} pythonExecutable - Executable or command that should be launched.
 * @property {string[]} spawnArgs - Extra arguments to pass before the runtime script path.
 */

/**
 * Resolve the bundled portable Python executable for the current platform and architecture.
 *
 * @param {PortablePythonResolutionOptions} [options={}] - Root directory and platform details used for resolution.
 * @returns {string} Absolute path to the bundled Python executable.
 */
function resolvePortablePythonExecutable(options = {}) {
  const {
    rootDir = PACKAGE_ROOT,
    platform = process.platform,
    arch = process.arch,
  } = options;

  let pythonExecutable;

  if (platform === 'win32') {
    pythonExecutable = path.join(rootDir, 'PythonPortable', 'Scripts', 'python.exe');
  } else if (platform === 'darwin') {
    const macFolder = arch === 'arm64' ? 'PythonPortableMac_arm64' : 'PythonPortableMac_x64';
    pythonExecutable = path.join(rootDir, macFolder, 'python', 'bin', 'python3.10');
  } else {
    throw new Error(`Unsupported platform for bundled Python resolution: ${platform}`);
  }

  if (!fs.existsSync(pythonExecutable)) {
    throw new Error(`Bundled Python executable not found at ${pythonExecutable}`);
  }

  return pythonExecutable;
}

/**
 * Decide whether to launch the bundled runtime or a user-managed system interpreter.
 *
 * @param {PythonLaunchResolutionOptions} [options={}] - Interpreter preference and fallback settings.
 * @returns {PythonLaunchResult} Executable and spawn arguments that should be used to start Python.
 */
function resolvePythonLaunch(options = {}) {
  const {
    pythonExecutable,
    spawnArgs = [],
    usePortablePython,
    rootDir = PACKAGE_ROOT,
    platform = process.platform,
    arch = process.arch,
    systemPythonCommand,
  } = options;

  if (pythonExecutable) {
    return {
      pythonExecutable,
      spawnArgs: Array.isArray(spawnArgs) ? spawnArgs.slice() : [],
    };
  }

  const preferPortablePython = usePortablePython !== false;

  if (preferPortablePython && rootDir) {
    try {
      return {
        pythonExecutable: resolvePortablePythonExecutable({ rootDir, platform, arch }),
        spawnArgs: Array.isArray(spawnArgs) ? spawnArgs.slice() : [],
      };
    } catch (error) {
      if (usePortablePython === true) {
        throw error;
      }
    }
  }

  return {
    pythonExecutable: systemPythonCommand || getDefaultSystemPythonCommand(platform),
    spawnArgs: Array.isArray(spawnArgs) ? spawnArgs.slice() : [],
  };
}

module.exports = {
  getDefaultNetCDFRuntimePath,
  getDefaultSystemPythonCommand,
  resolvePythonLaunch,
  resolvePortablePythonExecutable,
};

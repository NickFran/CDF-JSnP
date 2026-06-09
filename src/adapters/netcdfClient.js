const { createPythonBridge } = require('../bridge/pythonBridge');
const {
  getDefaultNetCDFRuntimePath,
  resolvePythonLaunch,
} = require('../utils/runtimePaths');

/**
 * @typedef {Object} NetCDFCallOptions
 * @property {number} [timeoutMs] - Timeout override for a single runtime call.
 */

/**
 * @typedef {Object} VariableByDimensionQueryOptions
 * @property {boolean} [compact] - When true, return arrays keyed by dimension and variable name.
 * @property {boolean} [reduceOtherDims] - When true, average across every dimension except the requested one.
 * @property {number} [start] - Optional inclusive start index for slicing the target dimension.
 * @property {number} [end] - Optional exclusive end index for slicing the target dimension.
 * @property {string[]} [reduceDims] - Specific dimensions to average across instead of every non-target dimension.
 */

/**
 * @typedef {Object} NetCDFClientOptions
 * @property {import('../bridge/pythonBridge').PythonBridge} [bridge] - Prebuilt bridge instance to reuse instead of creating one.
 * @property {string} [pythonExecutable] - Explicit Python executable or command to use.
 * @property {string[]} [spawnArgs] - Extra arguments inserted before the runtime script path.
 * @property {boolean} [usePortablePython] - Whether bundled portable Python should be preferred.
 * @property {string} [rootDir] - Repository root used when resolving bundled portable Python.
 * @property {NodeJS.Platform} [platform] - Platform override used during Python resolution.
 * @property {string} [arch] - Architecture override used during Python resolution.
 * @property {string} [systemPythonCommand] - Fallback system Python command, such as `python` or `python3`.
 * @property {string} [scriptPath] - Absolute path to the Python runtime script.
 * @property {Record<string, string | undefined>} [env] - Extra environment variables for the Python child process.
 * @property {string} [cwd] - Working directory for the Python child process.
 * @property {number} [defaultTimeoutMs] - Default timeout used by the underlying Python bridge.
 * @property {(payload: unknown) => void} [onMessage] - Callback for non-request stdout payloads.
 * @property {(message: string) => void} [onStderr] - Callback for stderr output.
 */

/**
 * Build a NetCDF-focused client API on top of the lower-level Python bridge.
 *
 * @param {NetCDFClientOptions} [options={}] - Launch settings and bridge configuration for the runtime.
 * @returns {{
 *  bridge: import('../bridge/pythonBridge').PythonBridge,
 *  call(command: string, args?: unknown[] | unknown, callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  listCommands(callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  openDataset(datasetPath: string, callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  closeDataset(callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  getOverview(callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  getAttributes(callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  getSummary(callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  getCoordinates(callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  getDimensions(callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  listVariables(callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  getVariable(variableName: string, callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  getVariableByDimension(variableName: string, dimensionName: string, queryOptions?: VariableByDimensionQueryOptions, callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  getLastNonNanValueInFirstProfile(variableName: string, profileDimension?: string, callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  bulkSoundSpeed(pressureByTimestamp: Record<string, unknown>, temperatureByTimestamp: Record<string, unknown>, salinityByTimestamp: Record<string, unknown>, latitudes: unknown[], longitudes: unknown[], callOptions?: NetCDFCallOptions): Promise<unknown>,
 *  dispose(): void
 * }} NetCDF-aware client wrapper over the Python bridge.
 */
function createNetCDFClient(options = {}) {
  const pythonLaunch = resolvePythonLaunch({
    pythonExecutable: options.pythonExecutable,
    spawnArgs: options.spawnArgs,
    usePortablePython: options.usePortablePython,
    rootDir: options.rootDir,
    platform: options.platform,
    arch: options.arch,
    systemPythonCommand: options.systemPythonCommand,
  });

  const bridge = options.bridge || createPythonBridge({
    pythonExecutable: pythonLaunch.pythonExecutable,
    scriptPath: options.scriptPath || getDefaultNetCDFRuntimePath(),
    env: options.env,
    cwd: options.cwd,
    defaultTimeoutMs: options.defaultTimeoutMs,
    spawnArgs: pythonLaunch.spawnArgs,
    onMessage: options.onMessage,
    onStderr: options.onStderr,
  });

  return {
    bridge,

    /**
     * Send an arbitrary runtime command when the convenience wrappers are not enough.
     *
     * @param {string} command - Runtime command name to execute.
     * @param {unknown[] | unknown} [args=[]] - Positional arguments for the command.
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with the Python command result.
     */
    call(command, args = [], callOptions = {}) {
      return bridge.send(command, args, callOptions);
    },

    /**
     * Ask the runtime which commands it currently exposes.
     *
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with the list of command names.
     */
    listCommands(callOptions = {}) {
      return bridge.send('list_commands', [], callOptions);
    },

    /**
     * Open a dataset file and make it the active session in Python.
     *
     * @param {string} datasetPath - Absolute or relative path to the dataset file.
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with the runtime open-dataset result.
     */
    openDataset(datasetPath, callOptions = {}) {
      return bridge.send('open_dataset', [datasetPath], callOptions);
    },

    /**
     * Close the active dataset session in Python.
     *
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves when the dataset session is closed.
     */
    closeDataset(callOptions = {}) {
      return bridge.send('close_dataset', [], callOptions);
    },

    /**
     * Fetch a combined overview of dimensions, variables, attributes, coordinates, and timestamps.
     *
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with the overview payload.
     */
    getOverview(callOptions = {}) {
      return bridge.send('get_overview', [], callOptions);
    },

    /**
     * Read the dataset-level attributes dictionary.
     *
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with the dataset attributes.
     */
    getAttributes(callOptions = {}) {
      return bridge.send('get_attributes', [], callOptions);
    },

    /**
     * Read the dataset summary attribute if one exists.
     *
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with the summary string.
     */
    getSummary(callOptions = {}) {
      return bridge.send('get_summary', [], callOptions);
    },

    /**
     * Fetch latitude and longitude-like arrays using the runtime's name matching rules.
     *
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with coordinate arrays.
     */
    getCoordinates(callOptions = {}) {
      return bridge.send('get_coordinates', [], callOptions);
    },

    /**
     * Return the dataset dimensions and their sizes.
     *
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with the dimension map.
     */
    getDimensions(callOptions = {}) {
      return bridge.send('get_dimensions', [], callOptions);
    },

    /**
     * Return the names of all data variables in the active dataset.
     *
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with the variable name list.
     */
    listVariables(callOptions = {}) {
      return bridge.send('list_variables', [], callOptions);
    },

    /**
     * Read the full value array for one variable.
     *
     * @param {string} variableName - Name of the variable to read from the active dataset.
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with the variable data.
     */
    getVariable(variableName, callOptions = {}) {
      return bridge.send('get_variable', [variableName], callOptions);
    },

    /**
     * Slice a variable along one dimension with optional reduction and compact output.
     *
     * @param {string} variableName - Variable whose values should be organized by the requested dimension.
     * @param {string} dimensionName - Dimension that should become the primary axis of the response.
     * @param {VariableByDimensionQueryOptions} [queryOptions={}] - Slicing and reduction options for the request.
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with the reorganized variable data.
     */
    getVariableByDimension(variableName, dimensionName, queryOptions = {}, callOptions = {}) {
      return bridge.send(
        'get_variable_by_dimension',
        [
          variableName,
          dimensionName,
          queryOptions.compact,
          queryOptions.reduceOtherDims,
          queryOptions.start,
          queryOptions.end,
          queryOptions.reduceDims,
        ],
        callOptions
      );
    },

    /**
     * Return the last valid value found in the first profile of a variable.
     *
     * @param {string} variableName - Variable to inspect inside the active dataset.
     * @param {string} [profileDimension='N_PROF'] - Dimension treated as the profile axis.
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with the last finite value in the first profile.
     */
    getLastNonNanValueInFirstProfile(variableName, profileDimension = 'N_PROF', callOptions = {}) {
      return bridge.send(
        'get_last_non_nan_value_in_first_profile',
        [variableName, profileDimension],
        callOptions
      );
    },

    /**
     * Compute sound-speed arrays from pressure, temperature, salinity, and position inputs.
     *
     * @param {Record<string, unknown>} pressureByTimestamp - Pressure arrays keyed by timestamp.
     * @param {Record<string, unknown>} temperatureByTimestamp - Temperature arrays keyed by timestamp.
     * @param {Record<string, unknown>} salinityByTimestamp - Salinity arrays keyed by timestamp.
     * @param {unknown[]} latitudes - Latitude values aligned with the timestamp order.
     * @param {unknown[]} longitudes - Longitude values aligned with the timestamp order.
     * @param {NetCDFCallOptions} [callOptions={}] - Timeout overrides for the request.
     * @returns {Promise<unknown>} Promise that resolves with sound-speed arrays keyed by timestamp.
     */
    bulkSoundSpeed(pressureByTimestamp, temperatureByTimestamp, salinityByTimestamp, latitudes, longitudes, callOptions = {}) {
      return bridge.send(
        'bulk_sound_speed',
        [pressureByTimestamp, temperatureByTimestamp, salinityByTimestamp, latitudes, longitudes],
        callOptions
      );
    },

    /**
     * Tear down the underlying Python bridge when the client is no longer needed.
     *
     * @returns {void}
     */
    dispose() {
      bridge.dispose();
    },
  };
}

module.exports = {
  createNetCDFClient,
};

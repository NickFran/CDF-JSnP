import datetime
import json
import math
import sys

import numpy as np
import xarray as xr


class DatasetSession:
    """Keep track of the dataset currently open inside the long-lived Python process."""

    def __init__(self):
        """Initialize the session without an active dataset.

        Returns:
            None: The session starts with no open dataset.
        """
        self.dataset = None

    def require_dataset(self):
        """Return the active dataset or fail if the caller forgot to open one first.

        Returns:
            xr.Dataset: The dataset currently stored in the shared session.

        Raises:
            RuntimeError: If no dataset has been opened yet.
        """
        if self.dataset is None:
            raise RuntimeError('No dataset is currently open.')
        return self.dataset

    def open_dataset(self, dataset_path):
        """Open a dataset file and replace any dataset that was already active.

        Args:
            dataset_path: Path to the NetCDF file that should become the active dataset.

        Returns:
            dict[str, str]: Status payload describing the loaded dataset.
        """
        if self.dataset is not None:
            self.dataset.close()
        self.dataset = xr.open_dataset(dataset_path, engine='netcdf4', decode_timedelta=True)
        return {
            'status': 'loaded',
            'path': dataset_path,
        }

    def close_dataset(self):
        """Close the active dataset and clear the session state.

        Returns:
            str: A status message describing whether a dataset was closed.
        """
        if self.dataset is None:
            return 'No dataset to close'
        self.dataset.close()
        self.dataset = None
        return 'Closed'


SESSION = DatasetSession()


def clean(value):
    """Convert numpy, datetime, and other runtime values into JSON-safe data.

    Args:
        value: Arbitrary Python, numpy, or xarray-derived value.

    Returns:
        Any: JSON-safe representation of the supplied value.
    """
    if isinstance(value, np.ndarray):
        return [clean(item) for item in value.tolist()]
    if isinstance(value, bytes):
        return value.decode('utf-8', errors='replace')
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return None if not np.isfinite(value) else float(value)
    if isinstance(value, np.datetime64):
        return np.datetime_as_string(value, unit='ms')
    if isinstance(value, float):
        return None if not math.isfinite(value) else value
    if isinstance(value, dict):
        return {str(key): clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(item) for item in value]
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    return value


def get_dataset():
    """Return the active dataset through the shared session helper.

    Returns:
        xr.Dataset: The dataset currently active in the shared session.
    """
    return SESSION.require_dataset()


def get_first_matching_array(name_possibilities, include_data_vars=True):
    """Find the first matching coordinate or variable from a list of common names.

    Args:
        name_possibilities: Candidate names to try in order.
        include_data_vars: Whether data variables should be searched after coordinates.

    Returns:
        list: JSON-safe values from the first matching coordinate or variable, or an empty list.
    """
    dataset = get_dataset()
    coord_lookup = {name.lower(): name for name in dataset.coords}
    data_var_lookup = {name.lower(): name for name in dataset.data_vars}

    for candidate in name_possibilities:
        actual_name = coord_lookup.get(candidate.lower())
        if actual_name is not None:
            return clean(np.atleast_1d(dataset.coords[actual_name].values))

    if include_data_vars:
        for candidate in name_possibilities:
            actual_name = data_var_lookup.get(candidate.lower())
            if actual_name is not None:
                return clean(np.atleast_1d(dataset[actual_name].values))

    return []


def get_timestamps():
    """Return the best timestamp-like array using common NetCDF time field names.

    Returns:
        list: JSON-safe timestamp values from the best matching time-like field.
    """
    timestamp_name_possibilities = [
        'time',
        'Time',
        'TIME',
        'JULD',
        'juld',
        'TIME_LOCATION',
        'time_location',
    ]
    return get_first_matching_array(timestamp_name_possibilities)


def convert_timestamps(timestamps, style):
    """Format timestamp values into a caller-friendly string representation.

    Args:
        timestamps: Timestamp values to normalize and format.
        style: Output style such as ``iso``, ``date``, ``datetime``, or ``no-seconds``.

    Returns:
        list[str]: Formatted timestamp strings.
    """
    formatted = []

    for timestamp in timestamps:
        try:
            if isinstance(timestamp, str):
                try:
                    value = np.datetime64(timestamp)
                except Exception:
                    value = timestamp
            elif isinstance(timestamp, int):
                try:
                    value = np.datetime64(timestamp, 'ns')
                except Exception:
                    value = np.datetime64(timestamp, 'ms')
            else:
                value = timestamp

            if isinstance(value, np.datetime64):
                python_datetime = value.astype('datetime64[ms]').astype(datetime.datetime)
                if style == 'iso':
                    formatted.append(python_datetime.isoformat())
                elif style == 'date':
                    formatted.append(python_datetime.strftime('%Y-%m-%d'))
                elif style == 'datetime':
                    formatted.append(python_datetime.strftime('%Y-%m-%d %H:%M:%S'))
                elif style == 'no-seconds':
                    formatted.append(python_datetime.strftime('%Y-%m-%d %H:%M'))
                else:
                    formatted.append(str(python_datetime))
            elif isinstance(value, datetime.datetime):
                if style == 'iso':
                    formatted.append(value.isoformat())
                elif style == 'date':
                    formatted.append(value.strftime('%Y-%m-%d'))
                elif style == 'datetime':
                    formatted.append(value.strftime('%Y-%m-%d %H:%M:%S'))
                elif style == 'no-seconds':
                    formatted.append(value.strftime('%Y-%m-%d %H:%M'))
                else:
                    formatted.append(str(value))
            else:
                formatted.append(str(value))
        except Exception:
            formatted.append(str(timestamp))

    return formatted


def get_dimensions():
    """Return the dataset dimensions and their integer sizes.

    Returns:
        dict[str, int]: Mapping of dimension names to their sizes.
    """
    dataset = get_dataset()
    return {name: int(size) for name, size in dataset.sizes.items()}


def get_attributes():
    """Return the dataset-level attributes with JSON-safe value conversion applied.

    Returns:
        dict[str, Any]: Dataset-level attributes converted to JSON-safe values.
    """
    dataset = get_dataset()
    return clean(dict(dataset.attrs))


def get_summary():
    """Return the dataset summary attribute or a fallback message when it is missing.

    Returns:
        str: Summary text or a fallback message.
    """
    dataset = get_dataset()
    return dataset.attrs['summary'] if 'summary' in dataset.attrs else 'No summary available'


def get_coordinates():
    """Return latitude and longitude-like arrays using flexible name matching.

    Returns:
        dict[str, list]: Latitude and longitude arrays discovered from the active dataset.
    """
    lat_possibilities = ['lat', 'latitude', 'LATITUDE', 'LAT']
    lon_possibilities = ['long', 'longitude', 'LONGITUDE', 'LONG', 'LON', 'lon']
    return {
        'latitude': get_first_matching_array(lat_possibilities),
        'longitude': get_first_matching_array(lon_possibilities),
    }


def list_variables():
    """List the names of all data variables in the active dataset.

    Returns:
        list[str]: Names of all data variables in the active dataset.
    """
    dataset = get_dataset()
    return list(dataset.data_vars)


def get_overview():
    """Return a compact snapshot of the dataset's most commonly requested metadata.

    Returns:
        dict[str, Any]: Combined dimensions, variables, attributes, coordinates, and timestamps.
    """
    timestamps = get_timestamps()
    return {
        'dimensions': get_dimensions(),
        'variables': list_variables(),
        'attributes': get_attributes(),
        'coordinates': get_coordinates(),
        'timestamps': {
            'raw': timestamps,
            'formatted': convert_timestamps(timestamps, 'no-seconds'),
        },
    }


def get_variable(variable_name):
    """Return the full value array for one data variable.

    Args:
        variable_name: Name of the variable to read from the active dataset.

    Returns:
        Any: JSON-safe variable data, or an error payload when the variable is missing.
    """
    dataset = get_dataset()
    if variable_name not in dataset.data_vars:
        return {'error': f"Variable '{variable_name}' not found"}
    return clean(dataset[variable_name].values.tolist())


def get_last_non_nan_value_in_first_profile(variable_name, profile_dim='N_PROF'):
    """Return the last finite value found in the first profile slice of a variable.

    Args:
        variable_name: Name of the variable to inspect.
        profile_dim: Dimension that should be treated as the profile axis.

    Returns:
        Any: Last finite value from the first profile, or an error payload if none is found.
    """
    dataset = get_dataset()
    if variable_name not in dataset:
        return {'error': f"Variable '{variable_name}' not found"}

    variable = dataset[variable_name]

    if profile_dim in variable.dims:
        variable = variable.isel({profile_dim: 0})

    values = np.asarray(variable.values).reshape(-1).tolist()
    filtered_values = []

    for value in values:
        if value is None:
            continue
        if isinstance(value, (float, np.floating)) and not np.isfinite(value):
            continue
        filtered_values.append(value)

    if not filtered_values:
        return {'error': f"Variable '{variable_name}' has no non-NaN values in the first profile"}

    return clean(filtered_values[-1])


def get_variable_by_dimension(variable_name, dimension_name, compact=False, reduce_other_dims=False, start=None, end=None, reduce_dims=None):
    """Return a variable reorganized by one dimension, with optional slicing and reduction.

    Args:
        variable_name: Name of the variable whose values should be reorganized.
        dimension_name: Dimension that should become the primary axis of the response.
        compact: When true, return arrays keyed by dimension and variable name.
        reduce_other_dims: When true, average across every non-target dimension.
        start: Optional inclusive start index for slicing the target dimension.
        end: Optional exclusive end index for slicing the target dimension.
        reduce_dims: Specific dimensions to average across instead of every non-target dimension.

    Returns:
        dict[str, Any]: Reorganized variable data or an error payload when the request is invalid.
    """
    dataset = get_dataset()

    if variable_name not in dataset.data_vars:
        return {'error': f"Variable '{variable_name}' not found"}

    if dimension_name not in dataset.dims:
        return {'error': f"Dimension '{dimension_name}' not found"}

    variable = dataset[variable_name]

    if dimension_name not in variable.dims:
        return {'error': f"Variable '{variable_name}' does not have dimension '{dimension_name}'"}

    if dimension_name in dataset.coords:
        dimension_values = dataset.coords[dimension_name].values
    else:
        dimension_values = np.arange(dataset.sizes[dimension_name])

    if start is not None or end is not None:
        start_index = int(start) if start is not None else None
        end_index = int(end) if end is not None else None
        variable = variable.isel({dimension_name: slice(start_index, end_index)})
        dimension_values = dimension_values[start_index:end_index]

    if reduce_other_dims:
        other_dims = [name for name in variable.dims if name != dimension_name]
        if other_dims:
            variable = variable.mean(dim=other_dims, skipna=True)
    elif reduce_dims:
        dims_to_reduce = [name for name in reduce_dims if name in variable.dims and name != dimension_name]
        if dims_to_reduce:
            variable = variable.mean(dim=dims_to_reduce, skipna=True)

    reordered = variable.transpose(dimension_name, ...)
    data = reordered.values

    if compact:
        return {
            dimension_name: clean(dimension_values),
            variable_name: clean(data),
        }

    result = {}
    for index, dimension_value in enumerate(dimension_values):
        result[str(clean(dimension_value))] = clean(data[index])

    return result


def bulk_sound_speed(pressure_by_timestamp, temperature_by_timestamp, salinity_by_timestamp, latitudes, longitudes):
    """Compute sound-speed values for aligned pressure, temperature, salinity, and position inputs.

    Args:
        pressure_by_timestamp: Pressure arrays keyed by timestamp.
        temperature_by_timestamp: Temperature arrays keyed by timestamp.
        salinity_by_timestamp: Salinity arrays keyed by timestamp.
        latitudes: Latitude values aligned with the timestamp order.
        longitudes: Longitude values aligned with the timestamp order.

    Returns:
        dict[str, Any]: Sound-speed arrays keyed by timestamp, or an error payload if ``gsw`` is unavailable.
    """
    try:
        import gsw
    except ImportError as error:
        return {'error': f'bulk_sound_speed requires gsw: {error}'}

    result = {}
    keys = list(pressure_by_timestamp.keys())

    for index, timestamp in enumerate(keys):
        latitude = latitudes[index]
        longitude = longitudes[index]
        pressures = pressure_by_timestamp[timestamp]
        temperatures = temperature_by_timestamp[timestamp]
        salinity_values = salinity_by_timestamp[timestamp]
        sound_speed_values = []

        for point_index in range(len(pressures)):
            if pressures[point_index] is None or temperatures[point_index] is None or salinity_values[point_index] is None:
                sound_speed_values.append(None)
                continue

            absolute_salinity = gsw.SA_from_SP(salinity_values[point_index], pressures[point_index], longitude, latitude)
            conservative_temperature = gsw.CT_from_t(absolute_salinity, temperatures[point_index], pressures[point_index])
            sound_speed = gsw.sound_speed(absolute_salinity, conservative_temperature, pressures[point_index])
            sound_speed_values.append(sound_speed)

        result[timestamp] = clean(sound_speed_values)

    return result


# Expose both the new snake_case API and the compatibility aliases used by older callers.
COMMANDS = {
    'list_commands': lambda: sorted(COMMANDS.keys()),
    'open_dataset': SESSION.open_dataset,
    'close_dataset': SESSION.close_dataset,
    'get_overview': get_overview,
    'get_attributes': get_attributes,
    'get_summary': get_summary,
    'get_coordinates': get_coordinates,
    'get_dimensions': get_dimensions,
    'list_variables': list_variables,
    'get_variable': get_variable,
    'get_timestamps': get_timestamps,
    'get_variable_by_dimension': get_variable_by_dimension,
    'get_last_non_nan_value_in_first_profile': get_last_non_nan_value_in_first_profile,
    'bulk_sound_speed': bulk_sound_speed,
    'open': SESSION.open_dataset,
    'close': SESSION.close_dataset,
    'getOverview': get_overview,
    'getAttributes': get_attributes,
    'getSummary': get_summary,
    'getCoords': get_coordinates,
    'getDimensions': get_dimensions,
    'getVariables': list_variables,
    'getVariable': get_variable,
    'getTimestamps': get_timestamps,
    'getVariableByDimension': get_variable_by_dimension,
    'getLastNonNanValueInFirstProfile': get_last_non_nan_value_in_first_profile,
    'bulkSSP': bulk_sound_speed,
}


def build_response(request_id, ok, result=None, error=None):
    """Build the standard JSON response envelope returned to JavaScript.

    Args:
        request_id: Identifier used to match the response to a pending JavaScript request.
        ok: Whether the request completed successfully.
        result: Successful command result to include in the payload.
        error: Error string to include when ``ok`` is false.

    Returns:
        dict[str, Any]: Response envelope written back to JavaScript.
    """
    payload = {
        'id': request_id,
        'ok': ok,
    }
    if ok:
        payload['result'] = result
    else:
        payload['error'] = error
    return payload


def execute_command(command_name, args):
    """Resolve a command name from the table and execute it with the provided arguments.

    Args:
        command_name: Name of the command to look up in the runtime command table.
        args: Positional arguments passed through from JavaScript.

    Returns:
        Any: Result of the command execution.

    Raises:
        ValueError: If the command name is not registered in the runtime command table.
    """
    function = COMMANDS.get(command_name)
    if function is None:
        raise ValueError(f'Unknown command: {command_name}')
    return function(*args)


def emit_response(payload):
    """Write one JSON response line back to the JavaScript bridge.

    Args:
        payload: JSON-serializable response payload.

    Returns:
        None: The response is written to stdout.
    """
    sys.stdout.write(json.dumps(payload) + '\n')
    sys.stdout.flush()


def run_one_shot(command_name, args):
    """Handle one-shot command execution when the runtime is launched with argv input.

    Args:
        command_name: Runtime command to execute.
        args: Positional arguments passed from argv.

    Returns:
        None: The result is written directly to stdout.
    """
    try:
        result = execute_command(command_name, args)
        sys.stdout.write(json.dumps({'ok': True, 'result': result}))
    except Exception as error:
        sys.stdout.write(json.dumps({'ok': False, 'error': str(error)}))
    sys.stdout.flush()


def run_persistent_loop():
    """Run the long-lived stdin/stdout loop used by the JavaScript bridge.

    Returns:
        None: The loop continues until stdin closes.
    """
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        request_id = None

        try:
            request = json.loads(line)
            request_id = request.get('id')
            command_name = request.get('command') or request.get('cmd')
            args = request.get('args', [])
            result = execute_command(command_name, args)
            emit_response(build_response(request_id, True, result=result))
        except Exception as error:
            emit_response(build_response(request_id, False, error=str(error)))


if __name__ == '__main__':
    if len(sys.argv) > 1:
        run_one_shot(sys.argv[1], sys.argv[2:])
    else:
        run_persistent_loop()

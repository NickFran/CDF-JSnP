const path = require('node:path');
const fs = require('node:fs');
const {
  createNetCDFClient,
  resolvePortablePythonExecutable,
  getDefaultNetCDFRuntimePath,
} = require('../src');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function validateDataset(client, datasetPath) {
  const openResult = await client.openDataset(datasetPath);
  assert(openResult && openResult.status === 'loaded', `Expected dataset to load: ${datasetPath}`);

  const overview = await client.getOverview();
  const dimensions = await client.getDimensions();
  const variables = await client.listVariables();

  assert(overview && typeof overview === 'object', `Expected overview object for ${datasetPath}`);
  assert(dimensions && Object.keys(dimensions).length > 0, `Expected dimensions for ${datasetPath}`);
  assert(Array.isArray(variables) && variables.length > 0, `Expected variables for ${datasetPath}`);
  assert(Array.isArray(overview.variables) && overview.variables.length > 0, `Expected overview variables for ${datasetPath}`);

  const sampleVariableName = variables[0];
  const sampleVariable = await client.getVariable(sampleVariableName);
  assert(sampleVariable !== undefined, `Expected sample variable data for ${datasetPath}`);

  assert(Object.prototype.hasOwnProperty.call(dimensions, 'DEPTH'), `Expected DEPTH dimension for ${datasetPath}`);
  assert(variables.includes('TEMP_ADJUSTED'), `Expected TEMP_ADJUSTED variable for ${datasetPath}`);

  const tempAdjustedByDepth = await client.getVariableByDimension('TEMP_ADJUSTED', 'DEPTH', {
    compact: true,
  });
  const depthValues = Array.isArray(tempAdjustedByDepth.DEPTH) ? tempAdjustedByDepth.DEPTH : [];
  const tempAdjustedValues = Array.isArray(tempAdjustedByDepth.TEMP_ADJUSTED)
    ? tempAdjustedByDepth.TEMP_ADJUSTED
    : [];
  const flattenedTemps = tempAdjustedValues.flat(Infinity);
  const nonNullTemperatureCount = flattenedTemps.filter((value) => value !== null && value !== undefined).length;

  assert(depthValues.length === dimensions.DEPTH, `Expected DEPTH slice length to match dimension size for ${datasetPath}`);
  assert(tempAdjustedValues.length === dimensions.DEPTH, `Expected TEMP_ADJUSTED top-level length to match DEPTH for ${datasetPath}`);
  assert(nonNullTemperatureCount > 0, `Expected non-null TEMP_ADJUSTED values for ${datasetPath}`);

  await client.closeDataset();

  return {
    datasetPath,
    dimensionCount: Object.keys(dimensions).length,
    variableCount: variables.length,
    sampleVariableName,
    depthLength: depthValues.length,
    nonNullTemperatureCount,
  };
}

async function main() {
  const rootDir = path.join(__dirname, '..');
  const fixturesDir = path.join(rootDir, 'testFiles');
  const datasetPaths = fs
    .readdirSync(fixturesDir)
    .filter((name) => name.endsWith('.nc'))
    .map((name) => path.join(fixturesDir, name));

  assert(datasetPaths.length >= 2, 'Expected at least two .nc test files in testFiles/.');

  const client = createNetCDFClient({
    pythonExecutable: resolvePortablePythonExecutable({ rootDir }),
    scriptPath: getDefaultNetCDFRuntimePath(),
  });

  try {
    const commands = await client.listCommands();

    if (!Array.isArray(commands) || !commands.includes('open_dataset')) {
      throw new Error('Smoke test failed: expected list_commands to include open_dataset.');
    }

    const validationResults = [];

    for (const datasetPath of datasetPaths) {
      validationResults.push(await validateDataset(client, datasetPath));
    }

    console.log(`Smoke test passed. Runtime exposed ${commands.length} commands.`);
    for (const result of validationResults) {
      console.log(
        `Validated ${path.basename(result.datasetPath)}: ${result.dimensionCount} dimensions, ${result.variableCount} variables, sample variable ${result.sampleVariableName}, DEPTH length ${result.depthLength}, non-null TEMP_ADJUSTED values ${result.nonNullTemperatureCount}.`
      );
    }
  } finally {
    client.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

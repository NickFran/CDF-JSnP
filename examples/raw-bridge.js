/**
 * Raw bridge example.
 * This is a more advanced example.
 * It uses the lower-level PythonBridge directly instead of the easier NetCDF client.
 * Most beginners should start with the other examples first, then come back to this one later.
 */
const path = require('node:path');
const {
  createPythonBridge,
  getDefaultNetCDFRuntimePath,
  resolvePythonLaunch,
} = require('../src');

async function main() {
  const datasetPath = path.join(__dirname, '..', 'testFiles', 'GL_PR_PF_6904231.nc');
  const pythonLaunch = resolvePythonLaunch();

  const bridge = createPythonBridge({
    pythonExecutable: pythonLaunch.pythonExecutable,
    scriptPath: getDefaultNetCDFRuntimePath(),
    spawnArgs: pythonLaunch.spawnArgs,
  });

  try {
    const commands = await bridge.send('list_commands');
    console.log('Available commands:', commands);

    await bridge.send('open_dataset', [datasetPath]);

    const dimensions = await bridge.send('get_dimensions');
    const variables = await bridge.send('list_variables');

    console.log('Dataset:', path.basename(datasetPath));
    console.log('Dimensions:', dimensions);
    console.log('First variables:', variables.slice(0, 10));
  } finally {
    await bridge.send('close_dataset').catch(() => {});
    bridge.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

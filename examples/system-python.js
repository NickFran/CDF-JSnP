/**
 * System Python example.
 * This example does the same kind of work as the quick-start example,
 * but it uses your own Python installation instead of the bundled Python runtime.
 * Use this when you want the framework to depend on Python that you installed yourself.
 */
const path = require('node:path');
const { createNetCDFClient } = require('../src');

async function main() {
  const datasetPath = path.join(__dirname, '..', 'testFiles', 'GL_PR_PF_4903532.nc');
  const client = createNetCDFClient({ usePortablePython: false });

  try {
    await client.openDataset(datasetPath);

    const dimensions = await client.getDimensions();
    const variables = await client.listVariables();

    console.log('Dataset:', path.basename(datasetPath));
    console.log('Dimensions:', dimensions);
    console.log('First variables:', variables.slice(0, 10));
  } finally {
    await client.closeDataset().catch(() => {});
    client.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

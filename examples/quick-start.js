/**
 * Quick-start example.
 * This is the easiest example to start with.
 * It opens one dataset, reads a few basic details, and prints them to the console.
 * Use this file to understand the normal flow: create a client, open a file, read data, close the file.
 */
const path = require('node:path');
const { createNetCDFClient } = require('../src');

async function main() {
  const datasetPath = path.join(__dirname, '..', 'testFiles', 'GL_PR_PF_4903532.nc');
  const client = createNetCDFClient();

  try {
    await client.openDataset(datasetPath);

    const overview = await client.getOverview();

    console.log('Dataset:', path.basename(datasetPath));
    console.log('Dimensions:', overview.dimensions);
    console.log('Variables:', overview.variables.slice(0, 10));
    console.log('Coordinates:', overview.coordinates);
    console.log('Formatted timestamps preview:', overview.timestamps.formatted.slice(0, 5));
  } finally {
    await client.closeDataset().catch(() => {});
    client.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

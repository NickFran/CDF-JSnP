/**
 * Reuse-one-client example.
 * This example shows that one client can be reused for more than one dataset.
 * It opens two different files one after the other and reads a few simple details from each.
 * Use this file if you want to understand how one client object can handle multiple files over time.
 */
const path = require('node:path');
const { createNetCDFClient } = require('../src');

const DATASETS = [
  'GL_PR_PF_4903532.nc',
  'GL_PR_PF_6904231.nc',
];

async function main() {
  const client = createNetCDFClient();

  try {
    for (const datasetName of DATASETS) {
      const datasetPath = path.join(__dirname, '..', 'testFiles', datasetName);
      await client.openDataset(datasetPath);

      const dimensions = await client.getDimensions();
      const variables = await client.listVariables();
      const summary = await client.getSummary();

      console.log('Dataset:', path.basename(datasetPath));
      console.log('Dimension names:', Object.keys(dimensions));
      console.log('Variable count:', variables.length);
      console.log('Summary:', summary);
      console.log('---');
    }
  } finally {
    await client.closeDataset().catch(() => {});
    client.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * TEMP_ADJUSTED by DEPTH example.
 * This example shows how to read one variable from a dataset in a more specific way.
 * It opens two sample datasets, gets TEMP_ADJUSTED values using the DEPTH dimension,
 * and prints a short preview so you can see what the returned data looks like.
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

      const result = await client.getVariableByDimension('TEMP_ADJUSTED', 'DEPTH', {
        compact: true,
      });

      const depthValues = Array.isArray(result.DEPTH) ? result.DEPTH : [];
      const tempValues = Array.isArray(result.TEMP_ADJUSTED) ? result.TEMP_ADJUSTED : [];
      const preview = tempValues.flat(Infinity).slice(0, 8);

      console.log('Dataset:', path.basename(datasetPath));
      console.log('DEPTH length:', depthValues.length);
      console.log('TEMP_ADJUSTED preview:', preview);
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

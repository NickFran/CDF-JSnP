///////////
// INITIALIZE DEPENDENCIES
/////////

const path = require('node:path');
const {
  createPythonBridge,
  getDefaultNetCDFRuntimePath,
  resolvePythonLaunch,
} = require('../../src');

// Initialize the files desired python runtime
const pythonLaunch = resolvePythonLaunch();

// Initialize the libraries Bridge
const bridge = createPythonBridge({
pythonExecutable: pythonLaunch.pythonExecutable,
scriptPath: getDefaultNetCDFRuntimePath(),
spawnArgs: pythonLaunch.spawnArgs,
});

////////////
///////////
//////////



// Use nodes path module to store the path to our file
const datasetPath = path.join(__dirname, '..', '..', 'testFiles', 'GL_PR_PF_6904231.nc');

// Use the library to send commands to the python backend
// (opens a dataset)
// (gets the files variables)
bridge.send('open_dataset', [datasetPath])
.then(()=> bridge.send('getOverview'))
.then((overview)=>{
    const timestampsDataStructure = overview.timestamps;
    let timestamps_formattedVariant = timestampsDataStructure['formatted'];
    let timestamps_rawVariant = timestampsDataStructure['raw'];

    let output = `
    First Timestamp,
    raw       = ${timestamps_rawVariant[0]} 
    formatted = ${timestamps_formattedVariant[0]}

    Second Timestamp,
    raw       = ${timestamps_rawVariant[1]} 
    formatted = ${timestamps_formattedVariant[1]}
    `;

    console.log(output);
})
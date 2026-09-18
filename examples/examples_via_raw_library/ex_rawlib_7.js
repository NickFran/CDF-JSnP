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

function convertNSToHours(amountInNS) {
  return amountInNS / (1000 * 60 * 60 * 1e6);
}

function getTimestampDifference(a, b){
    return a - b;
}



// Use nodes path module to store the path to our file
const datasetPath = path.join(__dirname, '..', '..', 'testFiles', 'GL_PR_PF_6904231.nc');

// Use the library to send commands to the python backend
// (opens a dataset)
// (gets the files variables)
bridge.send('open_dataset', [datasetPath])
.then(()=> bridge.send('getOverview'))
.then((overview)=>{
    const timestampsDataStructure = overview.timestamps;
    let timestamps_rawVariant = timestampsDataStructure['raw'];

    let difference = getTimestampDifference(timestamps_rawVariant[1], timestamps_rawVariant[0]);
    let hoursVariant = convertNSToHours(difference);

    console.log(`
    Number of hours elapsed between timestamp 1 and timestamp 2
    Hours = ${hoursVariant}    
    `)
})
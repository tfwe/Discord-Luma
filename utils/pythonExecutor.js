const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const PYTHON_DIR = path.resolve(__dirname, '../python');

// Ensure the AUDIO_DIR exists
if (!fs.existsSync(PYTHON_DIR)) {
    fs.mkdirSync(PYTHON_DIR);
}
async function executePython(code) {
    return new Promise((resolve, reject) => {
        logger.debug(`Executing Python code:\n${code}`);
        const filename = `temp_${Date.now()}.py`;
        const pythonFilePath = path.join(PYTHON_DIR, filename);
        fs.writeFileSync(pythonFilePath, code);
        const pythonProcess = spawn('python', [pythonFilePath]);
        let stdout = '', stderr = '';
        
        pythonProcess.stdout.on('data', data => stdout += data);
        pythonProcess.stderr.on('data', data => stderr += data);
        
        pythonProcess.on('close', code => {
            fs.unlinkSync(pythonFilePath);
            code ? (logger.error(`Python execution failed with error: ${stderr}`), reject(`Error: ${stderr}`)) : (logger.info(`Python code executed successfully. Output:\n${stdout}`), resolve(stdout));
        });
    });
}

module.exports = { executePython }; 


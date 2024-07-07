#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the directory where the script is located
const scriptDir = __dirname;
const objDir = path.join(scriptDir, 'obj');

// Create obj directory if it doesn't exist
if (!fs.existsSync(objDir)) {
  fs.mkdirSync(objDir);
}

const fileName = process.argv[2];

if (!fileName) {
  console.error('Please provide an .agda file name as an argument.');
  process.exit(1);
}

const inputFilePath = path.resolve(fileName);

// Check if the file exists and has .agda extension
if (!fs.existsSync(inputFilePath) || path.extname(inputFilePath) !== '.agda') {
  console.error('The specified file does not exist or is not an Agda file.');
  process.exit(1);
}

const baseName = path.basename(inputFilePath, '.agda');
const executablePath = path.join(objDir, baseName);

try {
  execSync(`agda --compile ${inputFilePath} --compile-dir ${objDir}`, { stdio: 'inherit' }); 
  execSync(executablePath, { stdio: 'inherit' });
} catch (error) {
  console.error('An error occurred:', error.message);
  process.exit(1);
}

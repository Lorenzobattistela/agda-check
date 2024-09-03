#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const agdaFile = process.argv[2];
if (!agdaFile || !agdaFile.endsWith('.agda')) {
  console.error('Usage: agda-js <agda-file.agda>');
  console.error('Please provide an Agda file (.agda) as an argument.');
  process.exit(1);
}

const baseName = path.basename(agdaFile, '.agda');
const dirName = baseName.replace(/\./g, '_').toLowerCase();

// Remove the output directory if it exists, then create it
if (fs.existsSync(dirName)) {
  fs.rmSync(dirName, { recursive: true, force: true });
}
fs.mkdirSync(dirName, { recursive: true });
fs.mkdirSync(path.join(dirName, 'node_modules'), { recursive: true });

// Compile Agda to JS
const compileCommand = `agda --js --js-cjs --js-optimize --no-libraries --compile-dir=${dirName}/node_modules ${agdaFile}`;
execSync(compileCommand, { stdio: 'inherit' });

// Create main.js
const mainJsContent = `require('./node_modules/jAgda.${baseName}').main()`;
fs.writeFileSync(path.join(dirName, 'main.js'), mainJsContent);

// Create package.json
const packageJson = {
  name: dirName,
  version: '1.0.0',
  main: 'main.js',
  bin: {
    [dirName]: './main.js'
  },
  dependencies: {}
};
fs.writeFileSync(path.join(dirName, 'package.json'), JSON.stringify(packageJson, null, 2));

console.log(`Successfully compiled ${agdaFile} to ${dirName}/`);
console.log('You can now:');
console.log(`1. cd ${dirName}`);
console.log('2. npm install');
console.log('3. node main.js');

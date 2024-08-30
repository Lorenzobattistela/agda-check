#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const agdaFile = process.argv[2];
if (!agdaFile || !agdaFile.endsWith('.agda')) {
  console.error('Usage: agda-compile <agda-file.agda>');
  console.error('Please provide an Agda file (.agda) as an argument.');
  process.exit(1);
}

const baseName = path.basename(agdaFile, '.agda');

try {
  // Compile Agda to executable
  console.log('Compiling Agda file...');
  execSync(`agda --compile --no-libraries ${agdaFile}`, { stdio: 'inherit' });

  // Remove MAlonzo directory
  console.log('Removing MAlonzo directory...');
  fs.rmSync('MAlonzo', { recursive: true, force: true });

  console.log(`Successfully compiled ${agdaFile} to ${baseName}`);
  console.log(`You can now run the executable with: ./${baseName}`);
} catch (error) {
  console.error('An error occurred during compilation:', error.message);
  process.exit(1);
}

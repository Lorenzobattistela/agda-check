#!/usr/bin/env node

const { spawn } = require("child_process");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const command = process.argv[2];
const filePath = process.argv[3];

// Execute an Agda command and return the output as a Promise
function executeAgdaCommand(command) {
  return new Promise((resolve, reject) => {
    const agda = spawn("agda", ["--interaction-json", "--no-termination-check", "--no-libraries", "--allow-unsolved-metas"]);
    let output = "";
    agda.stdout.on("data", (data) => output += data.toString());
    agda.stderr.on("data", (data) => console.error(`Agda Error: ${data}`));
    agda.on("close", (code) => {
    if (code !== 0) {
      reject(`Agda process exited with code ${code}`);
    } else {
      resolve(output);
    }
    });
    agda.stdin.write(command);
    agda.stdin.end();
  });
}

// Gets all '{!!}' holes in an Agda file
function getFileHoles(filePath) {
  let holeId = 0;
  let holes = [];
  // Read the file content
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const lines = fileContent.split("\n");
  lines.forEach((line, index) => {
    const row = index + 1;
    const regex = /\{\!(.*?)\!\}/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      const col = match.index + 1;
      const content = match[1].trim() || "?";
      holes.push([holeId, row, col, content]);
      holeId++;
    }
  });
  return holes;
}

// Sends an Agda command and executes it
async function sendCommand(arg, quiet=false, interact=false) {
 return await executeAgdaCommand(`IOTCM "${filePath}" ${interact ? "Interactive" : "None"} Direct (${arg})\nx\n`);
}

// Checks the Agda file and prints hole information
async function agdaCheck() {
  var output = "";
  // Sends the Load command
  output += await sendCommand(`Cmd_load "${filePath}" []`) + "\n";
  // Iterate through holes and send Cmd_goal_type_context_infer command for each
  try {
    let holes = getFileHoles(filePath);
    for (const hole of holes) {
      let holeId = hole[0];
      let content = hole[3];
      if (holeId != null) {
        output += await sendCommand(`Cmd_goal_type_context_infer Normalised ${holeId} noRange "${content.trim()}"`) + "\n";
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
  return output;
}

// Runs the Agda program and returns the output
async function agdaRun() {
  var output = "";
  // Load the file first
  output += await sendCommand(`Cmd_load "${filePath}" []`) + "\n";
  // Then, execute the 'main' function
  output += await sendCommand(`Cmd_compute_toplevel DefaultCompute "main"`) + "\n";
  return output;
}

// Parses JSON objects from the Agda output string
function parseJsonObjects(str) {
  const jsonObjects = [];
  const lines = str.split('\n');
  for (let line of lines) {
    if (line.startsWith('JSON>')) {
      line = line.substring(6).trim();
    }
    if (line) {
      try {
        jsonObjects.push(JSON.parse(line));
      } catch (e) {
        // Ignore non-JSON lines
      }
    }
  }
  return jsonObjects;
}

// Extracts hole information from a JSON object
function extractHoleInfo(obj) {
  if (obj.kind === 'DisplayInfo' && obj.info && obj.info.kind === 'GoalSpecific') {
    const holeInfo = obj.info;
    return {
      type   : 'hole',
      id     : holeInfo.interactionPoint.id,
      range  : holeInfo.interactionPoint.range[0],
      goal   : holeInfo.goalInfo.type,
      context: holeInfo.goalInfo.entries
    };
  }
  return null;
}

// Modify the extractErrorInfo function to include the file path
function extractErrorInfo(obj) {
  if (obj.kind === 'DisplayInfo' && obj.info && obj.info.error) {
    const errorInfo = obj.info.error;
    return {
      type   : 'error',
      message: errorInfo.message,
      filePath: errorInfo.message.split(':')[0] // Extract file path from error message
    };
  }
  return null;
}

// Format error information for pretty printing
function formatErrorInfo(error, fileContent) {
  const prettifiedError = prettifyError(error.message);
  const errorFilePath = error.filePath || filePath; // Use the file path from the error, or fall back to the main file
  const errorFileContent = readFileContent(errorFilePath);
  
  if (prettifiedError) {
    return prettifiedError + '\n' + extractCodeFromError(error.message, errorFileContent, 'red');
  } else {
    const bold      = '\x1b[1m';
    const dim       = '\x1b[2m';
    const underline = '\x1b[4m';
    const reset     = '\x1b[0m';
    let result = `${bold}Error:${reset} ${error.message}\n`;
    const fileInfo = error.message.split(':')[0];
    result += `${dim}${underline}${fileInfo}${reset}\n`;
    result += extractCodeFromError(error.message, errorFileContent, 'red');
    return result;
  }
}

// Formats hole information for pretty printing
function formatHoleInfo(hole, fileContent) {
  const bold      = '\x1b[1m';
  const dim       = '\x1b[2m';
  const underline = '\x1b[4m';
  const reset     = '\x1b[0m';
  let result = `${bold}Goal: ${hole.goal}${reset}\n`;
  for (let entry of hole.context) {
    result += `- ${entry.originalName} : ${entry.binding}\n`;
  }
  
  result += `${dim}${underline}${filePath}${reset}\n`;
  result += highlightCode(fileContent, hole.range.start.line, hole.range.start.col, hole.range.end.col - 1, hole.range.start.line, 'green');
  return result;
}

function readFileContent(filePath) {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(path.dirname(process.argv[3]), filePath);
    return fs.readFileSync(absolutePath, 'utf-8');
  } catch (error) {
    console.error('Error reading file:', error);
    return '';
  }
}

// Attempts to prettify error messages
function prettifyError(errorMessage) {
  return prettify_TypeMismatch(errorMessage) || prettify_UnboundVariable(errorMessage);
}

// Prettifies type mismatch errors
function prettify_TypeMismatch(errorMessage) {
  const lines = errorMessage.split('\n');
  const fileInfo = lines[0].split(':')[0];
  
  const typeMismatchRegex = /(.+) (!=<|!=) (.+)/;
  const match = errorMessage.match(typeMismatchRegex);

  if (match) {
    const detected = match[1].trim();
    const expected = match[3].trim();
    const bold      = '\x1b[1m';
    const dim       = '\x1b[2m';
    const underline = '\x1b[4m';
    const reset     = '\x1b[0m';
    return `${bold}TypeMismatch:${reset}\n- expected: ${expected}\n- detected: ${detected}\n${dim}${underline}${fileInfo}${reset}`;
  }

  return null;
}

// Prettifies unbound variable errors
function prettify_UnboundVariable(errorMessage) {
  const notInScopeRegex = /Not in scope:\n\s+(\w+) at/;
  const match = errorMessage.match(notInScopeRegex);

  if (match) {
    const varName = match[1];
    const bold      = '\x1b[1m';
    const dim       = '\x1b[2m';
    const underline = '\x1b[4m';
    const reset     = '\x1b[0m';
    const fileInfo = errorMessage.split(':')[0];
    return `${bold}Unbound:${reset} '${varName}'\n${dim}${underline}${fileInfo}${reset}`;
  }

  return null;
}

// Extracts and highlights the affected code from the error message
function extractCodeFromError(errorMessage, fileContent, color) {
  const lines = errorMessage.split('\n');
  const match = lines[0].match(/(\d+),(\d+)-(?:(\d+),)?(\d+)/);
  
  if (match) {
    const iniLine = parseInt(match[1]);
    const iniCol  = parseInt(match[2]);
    const endLine = match[3] ? parseInt(match[3]) : iniLine;
    const endCol  = parseInt(match[4]);
    
    return highlightCode(fileContent, iniLine, iniCol, endCol - 1, endLine, color);
  }

  return '';
}

// Highlights the specified code section
function highlightCode(fileContent, startLine, startCol, endCol, endLine, color) {
  try {
    const lines = fileContent.split('\n');
    const dim       = '\x1b[2m';
    const reset     = '\x1b[0m';
    const underline = '\x1b[4m';
    const colorCode = color === 'red' ? '\x1b[31m' : '\x1b[32m';
    
    let result = '';
    const maxLineNumberLength = endLine.toString().length;
    for (let i = startLine - 1; i <= endLine - 1; i++) {
      const line = lines[i];
      const lineNumber = (i + 1).toString().padStart(maxLineNumberLength, ' ');
      result += `${dim}${lineNumber} | ${reset}`;
      if (i === startLine - 1 && i === endLine - 1) {
        result += dim + line.substring(0, startCol - 1);
        result += colorCode + underline + line.substring(startCol - 1, endCol) + reset;
        result += dim + line.substring(endCol) + reset + '\n';
      } else if (i === startLine - 1) {
        result += dim + line.substring(0, startCol - 1);
        result += colorCode + underline + line.substring(startCol - 1) + reset + '\n';
      } else if (i === endLine - 1) {
        result += colorCode + underline + line.substring(0, endCol) + reset;
        result += dim + line.substring(endCol) + reset + '\n';
      } else {
        result += colorCode + underline + line + reset + '\n';
      }
    }
    return result;
  } catch (e) {
    return fileContent;
  }
}

// Reads the content of the Agda file
function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error('Error reading file:', error);
    return '';
  }
}

// This function processes Agda output to generate a pretty-printed result.
function prettyPrintOutput(out) {
  const jsonObjects = parseJsonObjects(out);
  const items = [];
  const seenErrors = new Set();
  for (let obj of jsonObjects) {
    const holeInfo = extractHoleInfo(obj);
    const errorInfo = extractErrorInfo(obj);
    if (holeInfo) {
      items.push(holeInfo);
    } else if (errorInfo && !seenErrors.has(errorInfo.message)) {
      items.push(errorInfo);
      seenErrors.add(errorInfo.message);
    }
  }

  // Generate pretty-printed output
  const fileContent = readFileContent(filePath);
  let prettyOut = '';
  let hasError = false;
  for (let item of items) {
    if (item.type === 'hole') {
      prettyOut += formatHoleInfo(item, fileContent);
    } else if (item.type === 'error') {
      hasError = true;
      prettyOut += formatErrorInfo(item, fileContent);
    }
    prettyOut += '\n';
  }

  if (hasError) {
    console.error(prettyOut.trim());
  } else {
    console.log(prettyOut.trim() || "Checked.");
  }
}

// Parses the output of the run command
function parseRunOutput(output) {
  const jsonObjects = parseJsonObjects(output);
  for (let obj of jsonObjects) {
    if (obj.kind === 'DisplayInfo' && obj.info && obj.info.kind === 'NormalForm') {
      return obj.info.expr;
    }
  }
  return "No output";
}

// New function to check all .agda files in a directory
async function checkAll(directory) {
  const green = '\x1b[32m';
  const red = '\x1b[31m';
  const reset = '\x1b[0m';
  
  let allChecked = true;
  let checkedFiles = 0;
  let erroredFiles = 0;

  async function checkFile(file) {
    try {
      await executeAgdaCommand(`IOTCM "${file}" None Direct (Cmd_load "${file}" [])\nx\n`);
      console.log(`${green}✓ ${file}${reset}`);
      checkedFiles++;
    } catch (error) {
      console.log(`${red}✗ ${file}${reset}`);
      erroredFiles++;
      allChecked = false;
    }
  }

  async function traverseDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        await traverseDirectory(fullPath);
      } else if (path.extname(fullPath) === '.agda') {
        await checkFile(fullPath);
      }
    }
  }

  await traverseDirectory(directory);

  if (allChecked) {
    console.log(`${green}All files checked!${reset}`);
  } else {
    console.log(`${green}${checkedFiles} file(s) checked.${reset}`);
    console.log(`${red}${erroredFiles} file(s) with errors.${reset}`);
  }
}

async function main() {
  if (command === "checkAll") {
    if (!filePath) {
      console.error("Usage: agda-cli checkAll <directory>");
      process.exit(1);
    }
    await checkAll(filePath);
  } else if (!filePath || !filePath.endsWith(".agda")) {
    console.error("Usage: agda-cli [check|run] <file.agda>");
    process.exit(1);
  } else {
    switch (command) {
      case "check": {
        prettyPrintOutput(await agdaCheck());
        const output = await agdaRun();
        const result = parseRunOutput(output);
        console.log(result);
        break;
      }
      case "run": {
        const output = await agdaRun();
        const result = parseRunOutput(output);
        console.log(result);
        break;
      }
      default: {
        console.error("Invalid command. Use 'check', 'run', or 'checkAll'.");
        process.exit(1);
      }
    }
  }
}

(async () => await main())();

#!/usr/bin/env node

const { spawn } = require("child_process");
//const { exec } = require('child_process');
//const { promisify } = require('util');
//const execAsync = promisify(exec);
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const filePath = process.argv[2];

// Execute an Agda command and return the output as a Promise
function executeAgdaCommand(command) {
  return new Promise((resolve, reject) => {
    const agda = spawn("agda", ["--interaction-json", "--no-libraries"]);
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
  const fs = require("fs");
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

// This function processes Agda output to generate a pretty-printed result.
// It handles both holes and errors, formatting them for easy reading.
// Key features include:
// - Parsing JSON objects from Agda output
// - Extracting and formatting hole information
// - Detecting and prettifying various types of errors (e.g., TypeMismatch, UnboundVariable)
// - Highlighting relevant code sections in green (for holes) or red (for errors)
// - Displaying line numbers and dimming non-highlighted code
// - Avoiding redundant error messages
// The function aims to provide a clear, concise, and visually appealing
// representation of Agda's output to aid in debugging and development.
function formatOutput(out) {
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

  // Extracts error information from a JSON object
  function extractErrorInfo(obj) {
    if (obj.kind === 'DisplayInfo' && obj.info && obj.info.error) {
      const errorInfo = obj.info.error;
      return {
        type   : 'error',
        message: errorInfo.message
      };
    }
    return null;
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

  // Formats error information for pretty printing
  function formatErrorInfo(error, fileContent) {
    const prettifiedError = prettifyError(error.message);
    if (prettifiedError) {
      return prettifiedError + '\n' + extractCodeFromError(error.message, fileContent, 'red');
    } else {
      const bold      = '\x1b[1m';
      const dim       = '\x1b[2m';
      const underline = '\x1b[4m';
      const reset     = '\x1b[0m';
      let result = `${bold}Error:${reset} ${error.message}\n`;
      const fileInfo = error.message.split(':')[0];
      result += `${dim}${underline}${fileInfo}${reset}\n`;
      result += extractCodeFromError(error.message, fileContent, 'red');
      return result;
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

  // Main processing logic
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
  for (let item of items) {
    if (item.type === 'hole') {
      prettyOut += formatHoleInfo(item, fileContent);
    } else if (item.type === 'error') {
      prettyOut += formatErrorInfo(item, fileContent);
    }
    prettyOut += '\n';
  }

  return prettyOut;
}

async function main() {
  // Check if a valid Agda file path is provided
  // Format and display the Agda output
  if (!filePath || !filePath.endsWith(".agda")) {
    console.error("Usage: agda-check <file.agda>");
    process.exit(1);
  }

  // Run Agda check and format the output
  var output = await agdaCheck();
  //console.log("OUTPUT:\n" + output);
  //console.log("---------------------------");
  console.log(formatOutput(output));
}

(async () => {
  await main();
})();


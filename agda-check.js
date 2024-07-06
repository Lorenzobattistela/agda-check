#!/usr/bin/env node

const { spawn } = require("child_process");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const filePath = process.argv[2];

function executeAgdaCommand(command) {
  return new Promise((resolve, reject) => {
    const agda = spawn("agda", ["--interaction"]);
    let output = "";

    agda.stdout.on("data", (data) => {
      output += data.toString();
    });

    agda.stderr.on("data", (data) => {
      console.error(`Agda Error: ${data}`);
    });

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

function parseAgdaOutput(output) {
  const lines = output.split("\n");
  const holes = [];
  let currentHole = null;

  for (const line of lines) {
    if (line.startsWith("?")) {
      if (currentHole) {
        holes.push(currentHole);
      }
      currentHole = { name: line.trim(), context: [] };
    } else if (currentHole && line.trim() !== "") {
      currentHole.context.push(line.trim());
    }
  }

  if (currentHole) {
    holes.push(currentHole);
  }

  return holes;
}

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

function useless(s) {
    return (s === "*Type-checking*") || (s === "*Goal type etc.*") || (s.startsWith("Checking demo"));
}

function removeUseless(s) {
    if (useless(s)) {
        return null;
    }
    return `${s}`;
}

function formatGoalHave(s) {
  let splitted = s.split('\n');
  let idx = 0;
  for (let s of splitted) {
    idx++;
    if(s.startsWith("Goal")) {
      printBold(s);
    } else if (s.startsWith("Have")) {
      printBold(s);
    } else if (s.includes("—")) { continue; }
    else if (s === "") { continue; }
    else {
      console.log(`- ${s}`);
    }

    if (idx == splitted.length - 1) {
      console.log();
    }
  }
}

function checkGoalsResult(strings) {
    const formatted = removeUseless(strings[1].replace(/\\n/g, '\n'));
    let header = removeUseless(strings[0].replace(/\\n/g, '\n'));

    const formatted_none = formatted === null;
    const header_none = header === null;

    if (!header_none) {
      if (header.startsWith("*")) {
        header = header.replace(/\*/g, "");
        printBold(header);
      } else {
        console.log(header);
      }
    }
    if (!formatted_none) {
      formatGoalHave(formatted);  
    }
}

function printBold(str) {
  console.log(`\x1b[1m${str}\x1b[0m`);
}

function checkErrors(errors) {
    const formattedErrors = errors.map(error => error.replace(/\\n/g, '\n'));
    formattedErrors.forEach(err => {
        if (err.startsWith("*")) {
          err = err.replace(/\*/g, "");
          printBold(err);
        } else {
          console.log(err, '\n');
        }
    });
    console.log('\x1b[31mFinished with error!\x1b[0m');
    process.exit(1);
}

function interpretResponse(responses, quiet = false) {
  let errors = [];
  for (let response of responses) {
    if (
      response.startsWith("(agda2-info-action ") ||
      response.startsWith("(agda2-info-action-and-copy ")
    ) {

      let strings = response
        .slice(19)
        .match(/"((?:[^"\\]|\\.)*?)"/g)
        .map((s) => s.slice(1, -1));

      if(response.includes("*Error*")) {
        checkErrors(strings);
      }

      if (strings[0] === "*Agda Version*") {
        parseVersion(strings[1]);
      }
      if (quiet) {
        continue;
      }
      checkGoalsResult(strings);
    } else if (
      response.startsWith("(agda2-highlight-load-and-delete-action ")
    ) {
      let startIndex =
        response.indexOf("agda2-highlight-load-and-delete-action '") + 41;
      errors = response
        .slice(startIndex)
        .match(/"((?:[^"\\]|\\.)*?)"/g)
        .map((s) => s.slice(1, -1));
      checkErrors(errors);
    }
  }
  return errors;
}

function parseContext(contextOutput) {
  let lines = contextOutput.split("\n");
  let context = [];

  if (lines[0].startsWith('Agda2> ')) {
    lines[0] = lines[0].slice(7);
  }

  let i = 0;
  while (i < lines.length && !lines[i].startsWith('Agda2> cannot read') && lines[i] !== "") {
      context.push(lines[i]);
      i++;
  }
  return context;
}

async function sendCommand(arg, quiet=false, highlighting=false) {
  let mode = "None";
  if (highlighting) {
    mode = "Interactive";
  }
  let command = `IOTCM "${filePath}" ${mode} Direct (${arg})\nx\n`
  let out = await executeAgdaCommand(command);
  out = parseContext(out);
  interpretResponse(out, quiet);
}

async function sendLoadCommand() {
  const loadCommand = `Cmd_load "${filePath}" []`;
  await sendCommand(loadCommand);
}

async function agdaFullContext() {
  const rewriteMode = "Normalised";
  try {
    let holes = getFileHoles(filePath);

    if (holes.length === 0) {
      console.log("No goals found in this file.");
      return;
    }

    for (const hole of holes) {
      let holeId = hole[0];
      let content = hole[3];

      if (holeId == null) {
        continue;
      }
      const contextCommand = `Cmd_goal_type_context_infer ${rewriteMode} ${holeId} noRange "${content.trim()}"`;
      const contextOutput = await sendCommand(contextCommand);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

async function agdaCheck() {
  console.log('');
  await sendLoadCommand();
  console.log('');
  await agdaFullContext();
  console.log('\n\x1b[32m%s\x1b[0m', 'Checked!');
}

function main() {
  if (!filePath) {
    console.error("Usage: node script.js <file.agda>");
    process.exit(1);
  }

  if (!filePath.endsWith(".agda")) {
    console.error("Usage: node script.js <file.agda>");
    process.exit(1);
  }

  agdaCheck();
}

main();

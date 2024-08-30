# Agda CLI

Agda CLI is a command-line tool that provides a set of utilities for working with Agda files. It offers functionalities such as checking Agda files, running Agda programs, compiling Agda to executables, and compiling Agda to JavaScript.

## Installation

To install Agda CLI globally, run:

```
npm install -g agda-cli
```

## Usage

### agda-cli

The main command-line interface for checking and running Agda files.

```
agda-cli [check|run] <file.agda>
```

- `check`: Checks the Agda file and displays any errors or holes.
- `run`: Runs the Agda program and displays the output.

### agda-compile

Compiles an Agda file to an executable.

```
agda-compile <file.agda>
```

### agda-js

Compiles an Agda file to JavaScript.

```
agda-js <file.agda>
```

## Features

- Pretty-printed output for errors and holes
- Syntax highlighting in the console
- Easy-to-use commands for common Agda operations

## Requirements

- Node.js
- Agda

## License

ISC

## Author

Lorenzo Battistela

## Contributing

Contributions, issues, and feature requests are welcome. Feel free to check the [issues page](https://github.com/Lorenzobattistela/agda-cli/issues) if you want to contribute.

## Support

If you have any questions or need help, please open an issue in the [GitHub repository](https://github.com/Lorenzobattistela/agda-cli).

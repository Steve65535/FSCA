/**
 * FSCA CLI Output Logger
 * Provides standardized colored output for the CLI.
 * 
 * Color Scheme:
 * - Title (FSCA CLI): Bright Purple (95)
 * - Command: Bright Blue (94)
 * - User Input: Light Bright Yellow (93)
 * - Result: Bright Green (92)
 */

const COLORS = {
    reset: '\x1b[0m',
    brightPurple: '\x1b[95m',
    brightBlue: '\x1b[94m',
    brightYellow: '\x1b[93m',
    brightGreen: '\x1b[92m',
    bold: '\x1b[1m'
};

const ASCII_TITLE = `
  ███████╗███████╗ ██████╗ █████╗       ██████╗██╗     ██╗
  ██╔════╝██╔════╝██╔════╝██╔══██╗     ██╔════╝██║     ██║
  █████╗  ███████╗██║     ███████║     ██║     ██║     ██║
  ██╔══╝  ╚════██║██║     ██╔══██║     ██║     ██║     ██║
  ██║     ███████║╚██████╗██║  ██║     ╚██████╗███████╗██║
  ╚═╝     ╚══════╝ ╚═════╝╚═╝  ╚═╝      ╚═════╝╚══════╝╚═╝
`;

/**
 * Prints the FSCA CLI title in Bright Purple.
 * @param {string} version - Optional version string to display
 */
function printTitle(version = '') {
    console.log(`${COLORS.brightPurple}${ASCII_TITLE}${COLORS.reset}`);
    if (version) {
        console.log(`${COLORS.brightPurple}  Financial Smart Contract Architecture CLI v${version}${COLORS.reset}\n`);
    }
}

/**
 * Logs the command line being executed in Bright Blue.
 * @param {string} command - The command string
 */
function logCommand(command) {
    console.log(`${COLORS.brightBlue}➜ Command: ${command}${COLORS.reset}`);
}

/**
 * Logs the user input in Light Bright Yellow.
 * @param {string} input - The user input
 */
function logInput(input) {
    console.log(`${COLORS.brightYellow}➜ Input: ${input}${COLORS.reset}`);
}

/**
 * Logs the execution result in Bright Green.
 * @param {string} result - The result string
 */
function logResult(result) {
    console.log(`${COLORS.brightGreen}✔ Result: ${result}${COLORS.reset}`);
}

/**
 * Helper to log a full interaction sequence.
 * @param {string} command - The command executed
 * @param {string} input - The input provided
 * @param {string} result - The result obtained
 */
function logInteraction(command, input, result) {
    if (command) logCommand(command);
    if (input) logInput(input);
    if (result) logResult(result);
}

module.exports = {
    COLORS,
    printTitle,
    logCommand,
    logInput,
    logResult,
    logInteraction
};

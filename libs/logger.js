/**
 * Arkheion CLI Output Logger
 * Provides standardized colored output for the CLI.
 * 
 * Color Scheme:
 * - Title (Arkheion CLI): Bright Purple (95)
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
    brightRed: '\x1b[91m',
    brightCyan: '\x1b[96m',
    bold: '\x1b[1m',
    dim: '\x1b[2m'
};

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

/**
 * Logs an error in bright red with ✗ prefix.
 */
function logError(message) {
    console.error(`${COLORS.brightRed}✗ Error: ${message}${COLORS.reset}`);
}

/**
 * Logs a warning in bright yellow with ⚠ prefix.
 */
function logWarn(message) {
    console.warn(`${COLORS.brightYellow}⚠ Warning: ${message}${COLORS.reset}`);
}

/**
 * Logs an info line in cyan with ℹ prefix.
 */
function logInfo(message) {
    console.log(`${COLORS.brightCyan}ℹ ${message}${COLORS.reset}`);
}

/**
 * Logs a diagnostic block — a titled section with indented lines.
 * Used for structured error context (file paths, suggestions, etc.)
 * @param {string} title
 * @param {string[]} lines
 * @param {'error'|'warn'|'info'} level
 */
function logDiagnostic(title, lines, level = 'error') {
    const color = level === 'error' ? COLORS.brightRed
        : level === 'warn' ? COLORS.brightYellow
            : COLORS.brightCyan;
    const prefix = level === 'error' ? '✗' : level === 'warn' ? '⚠' : 'ℹ';
    console.error(`${color}${COLORS.bold}${prefix} ${title}${COLORS.reset}`);
    for (const line of lines) {
        console.error(`${COLORS.dim}  │${COLORS.reset} ${line}`);
    }
}

module.exports = {
    COLORS,
    logCommand,
    logInput,
    logResult,
    logInteraction,
    logError,
    logWarn,
    logInfo,
    logDiagnostic,
};

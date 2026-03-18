/**
 * Interactive confirmation prompt.
 * Resolves true if user confirms or --yes is passed.
 * Resolves false on stdin EOF (non-interactive / CI environments).
 */

const readline = require('readline');

/**
 * @param {string} message - Prompt message shown to user
 * @param {boolean} yes - If true, skip prompt and return true immediately
 * @returns {Promise<boolean>}
 */
function confirm(message, yes) {
    if (yes) return Promise.resolve(true);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    return new Promise((resolve) => {
        let answered = false;

        rl.question(`${message} [y/N] `, (answer) => {
            answered = true;
            rl.close();
            resolve(answer.trim().toLowerCase() === 'y');
        });

        // Handle stdin EOF (piped input, CI, non-interactive)
        rl.on('close', () => {
            if (!answered) {
                console.log('\n(stdin closed — treating as "no")');
                resolve(false);
            }
        });
    });
}

module.exports = { confirm };

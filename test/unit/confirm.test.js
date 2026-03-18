/**
 * Unit tests for libs/commands/confirm.js
 */

const { confirm } = require('../../libs/commands/confirm');

describe('confirm', () => {
    it('returns true immediately when yes=true', async () => {
        const result = await confirm('Deploy?', true);
        expect(result).toBe(true);
    });

    it('returns false immediately when yes=false and stdin is EOF', async () => {
        // Simulate non-interactive stdin by passing a stream that immediately ends
        const { Readable } = require('stream');
        const { readline: rlModule } = require('readline');

        // Patch readline to simulate EOF: override createInterface for this test
        const readline = require('readline');
        const original = readline.createInterface;
        readline.createInterface = () => {
            const EventEmitter = require('events');
            const rl = new EventEmitter();
            rl.question = (_prompt, _cb) => {
                // Never call cb — simulate EOF by emitting close immediately
                setImmediate(() => rl.emit('close'));
            };
            rl.close = () => rl.emit('close');
            return rl;
        };

        try {
            const result = await confirm('Deploy?', false);
            expect(result).toBe(false);
        } finally {
            readline.createInterface = original;
        }
    });

    it('returns true when user answers "y"', async () => {
        const readline = require('readline');
        const original = readline.createInterface;
        readline.createInterface = () => {
            const EventEmitter = require('events');
            const rl = new EventEmitter();
            rl.question = (_prompt, cb) => {
                setImmediate(() => { cb('y'); rl.emit('close'); });
            };
            rl.close = () => {};
            return rl;
        };

        try {
            const result = await confirm('Deploy?', false);
            expect(result).toBe(true);
        } finally {
            readline.createInterface = original;
        }
    });

    it('returns false when user answers "n"', async () => {
        const readline = require('readline');
        const original = readline.createInterface;
        readline.createInterface = () => {
            const EventEmitter = require('events');
            const rl = new EventEmitter();
            rl.question = (_prompt, cb) => {
                setImmediate(() => { cb('n'); rl.emit('close'); });
            };
            rl.close = () => {};
            return rl;
        };

        try {
            const result = await confirm('Deploy?', false);
            expect(result).toBe(false);
        } finally {
            readline.createInterface = original;
        }
    });

    it('returns false when user presses Enter (empty input)', async () => {
        const readline = require('readline');
        const original = readline.createInterface;
        readline.createInterface = () => {
            const EventEmitter = require('events');
            const rl = new EventEmitter();
            rl.question = (_prompt, cb) => {
                setImmediate(() => { cb(''); rl.emit('close'); });
            };
            rl.close = () => {};
            return rl;
        };

        try {
            const result = await confirm('Deploy?', false);
            expect(result).toBe(false);
        } finally {
            readline.createInterface = original;
        }
    });
});

/**
 * Unit tests for txExecutor.js
 */

const assert = require('assert');
const { classifyError, sendTx } = require('../../libs/commands/txExecutor');

// Helper: create error with code
function makeErr(code, message = '') {
    const e = new Error(message || code);
    e.code = code;
    return e;
}

describe('classifyError', () => {
    it('TIMEOUT → retryable', () => {
        assert.strictEqual(classifyError(makeErr('TIMEOUT')), 'retryable');
    });
    it('NETWORK_ERROR → retryable', () => {
        assert.strictEqual(classifyError(makeErr('NETWORK_ERROR')), 'retryable');
    });
    it('SERVER_ERROR → retryable', () => {
        assert.strictEqual(classifyError(makeErr('SERVER_ERROR')), 'retryable');
    });
    it('UNKNOWN_ERROR → retryable', () => {
        assert.strictEqual(classifyError(makeErr('UNKNOWN_ERROR')), 'retryable');
    });
    it('timeout in message → retryable', () => {
        assert.strictEqual(classifyError(new Error('request timeout exceeded')), 'retryable');
    });
    it('econnreset in message → retryable', () => {
        assert.strictEqual(classifyError(new Error('read ECONNRESET')), 'retryable');
    });
    it('CALL_EXCEPTION → fatal', () => {
        assert.strictEqual(classifyError(makeErr('CALL_EXCEPTION')), 'fatal');
    });
    it('INSUFFICIENT_FUNDS → fatal', () => {
        assert.strictEqual(classifyError(makeErr('INSUFFICIENT_FUNDS')), 'fatal');
    });
    it('INVALID_ARGUMENT → fatal', () => {
        assert.strictEqual(classifyError(makeErr('INVALID_ARGUMENT')), 'fatal');
    });
    it('nonce has already been used → fatal', () => {
        assert.strictEqual(classifyError(new Error('nonce has already been used')), 'fatal');
    });
    it('nonce too low → fatal', () => {
        assert.strictEqual(classifyError(new Error('nonce too low')), 'fatal');
    });
    it('replacement transaction underpriced → fatal', () => {
        assert.strictEqual(classifyError(new Error('replacement transaction underpriced')), 'fatal');
    });
    it('unknown code → fatal', () => {
        assert.strictEqual(classifyError(makeErr('SOME_UNKNOWN_CODE')), 'fatal');
    });
});

describe('sendTx', () => {
    it('succeeds on first attempt', async () => {
        const receipt = { hash: '0xabc' };
        const txFn = async () => ({ wait: async () => receipt });
        const result = await sendTx(txFn, { label: 'test' });
        assert.strictEqual(result, receipt);
    });

    it('throws immediately on fatal error', async () => {
        const err = makeErr('CALL_EXCEPTION', 'revert');
        const txFn = async () => { throw err; };
        await assert.rejects(() => sendTx(txFn, { label: 'test', maxRetry: 3 }), /revert/);
    });

    it('retries on retryable error and succeeds', async () => {
        let calls = 0;
        const receipt = { hash: '0xdef' };
        const txFn = async () => {
            calls++;
            if (calls < 3) throw makeErr('NETWORK_ERROR', 'network error');
            return { wait: async () => receipt };
        };
        const result = await sendTx(txFn, { label: 'test', maxRetry: 3, baseDelay: 0 });
        assert.strictEqual(result, receipt);
        assert.strictEqual(calls, 3);
    });

    it('throws after exhausting maxRetry', async () => {
        let calls = 0;
        const txFn = async () => {
            calls++;
            throw makeErr('TIMEOUT', 'timeout');
        };
        await assert.rejects(
            () => sendTx(txFn, { label: 'test', maxRetry: 2, baseDelay: 0 }),
            /timeout/
        );
        assert.strictEqual(calls, 3); // 1 initial + 2 retries
    });

    it('does not retry nonce_conflict (fatal)', async () => {
        let calls = 0;
        const txFn = async () => {
            calls++;
            throw new Error('nonce has already been used');
        };
        await assert.rejects(
            () => sendTx(txFn, { label: 'test', maxRetry: 3, baseDelay: 0 }),
            /nonce has already been used/
        );
        assert.strictEqual(calls, 1);
    });
});

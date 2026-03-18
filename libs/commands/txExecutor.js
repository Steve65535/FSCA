/**
 * 统一交易执行器
 * 错误分类 + 指数退避重试
 * 审计日志：label/attempt/txHash/receipt/status 全量写文件日志（由 fsca-logger.js 拦截落盘）
 */

/**
 * 分类 ethers v6 错误
 * @param {Error} err
 * @returns {'retryable'|'fatal'}
 */
function classifyError(err) {
    const code = err.code || '';
    const msg = (err.message || '').toLowerCase();

    // Fatal: business/validation errors — do not retry
    const fatalCodes = [
        'INSUFFICIENT_FUNDS',
        'UNPREDICTABLE_GAS_LIMIT',
        'CALL_EXCEPTION',
        'INVALID_ARGUMENT',
        'MISSING_ARGUMENT',
        'UNEXPECTED_ARGUMENT',
        'ACTION_REJECTED',
        'UNSUPPORTED_OPERATION',
    ];
    if (fatalCodes.includes(code)) return 'fatal';

    // Nonce conflicts — fatal (NonceManager handles nonce tracking at a higher level)
    if (
        msg.includes('nonce has already been used') ||
        msg.includes('replacement transaction underpriced') ||
        msg.includes('nonce too low')
    ) {
        return 'fatal';
    }

    // Retryable: transient network/RPC errors
    const retryableCodes = ['TIMEOUT', 'NETWORK_ERROR', 'SERVER_ERROR', 'UNKNOWN_ERROR'];
    if (retryableCodes.includes(code)) return 'retryable';

    // Retryable by message pattern
    if (
        msg.includes('timeout') ||
        msg.includes('network') ||
        msg.includes('connection') ||
        msg.includes('econnreset') ||
        msg.includes('econnrefused') ||
        msg.includes('socket hang up') ||
        msg.includes('etimedout')
    ) {
        return 'retryable';
    }

    // Default: fatal (unknown errors should not be silently retried)
    return 'fatal';
}

/**
 * 执行单笔交易，带错误分类和重试
 * @param {Function} txFn        — () => Promise<ContractTransaction>
 * @param {object}   opts
 * @param {string}   opts.label     — 日志标签（如 "registerContract #1"）
 * @param {number}   opts.maxRetry  — 最大重试次数（默认 3）
 * @param {number}   opts.baseDelay — 初始退避 ms（默认 1000）
 * @returns {Promise<TransactionReceipt>}
 */
async function sendTx(txFn, opts = {}) {
    const { label = 'tx', maxRetry = 3, baseDelay = 1000 } = opts;
    let lastErr;

    for (let attempt = 0; attempt <= maxRetry; attempt++) {
        try {
            if (attempt > 0) {
                const jitter = Math.floor(Math.random() * 500);
                const delay = baseDelay * Math.pow(2, attempt - 1) + jitter;
                console.log(`  [retry ${attempt}/${maxRetry}] ${label} — waiting ${delay}ms`);
                await sleep(delay);
            }

            const tx = await txFn();
            const receipt = await tx.wait();

            console.log(`  [tx ok] ${label} — hash: ${receipt.hash || receipt.transactionHash}`);
            return receipt;

        } catch (err) {
            lastErr = err;
            const kind = classifyError(err);

            if (kind === 'fatal') {
                console.error(`  [tx fatal] ${label} — ${err.message}`);
                throw err;
            }

            // retryable
            console.warn(`  [tx retryable] ${label} attempt ${attempt + 1}/${maxRetry + 1} — ${err.message}`);
            if (attempt === maxRetry) {
                console.error(`  [tx failed] ${label} — exhausted ${maxRetry} retries`);
                throw lastErr;
            }
        }
    }

    throw lastErr;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendTx, classifyError };

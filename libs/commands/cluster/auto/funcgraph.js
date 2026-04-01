/**
 * 函数级别跨合约调用分析器
 *
 * 分析 Solidity 源码中的跨合约函数调用，构建函数调用图并检测环。
 *
 * 核心修复：
 *   接口 IFoo 定义在合约 A 的源码中，描述的是合约 B 的接口。
 *   正确映射：IFoo → 名称匹配的合约（去掉 I 前缀后与合约名匹配）
 *   而不是 IFoo → 声明它的合约 A。
 */

/**
 * 从源码提取所有函数定义
 */
function extractFunctions(source) {
    const functions = [];
    const funcRegex = /function\s+(\w+)\s*\([^)]*\)[^{]*\{/g;
    let match;
    while ((match = funcRegex.exec(source)) !== null) {
        const name = match[1];
        const bodyStart = match.index + match[0].length - 1;
        let depth = 0;
        let i = bodyStart;
        while (i < source.length) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') {
                depth--;
                if (depth === 0) break;
            }
            i++;
        }
        const body = source.slice(bodyStart, i + 1);
        const startLine = source.slice(0, match.index).split('\n').length;
        functions.push({ name, body, startLine });
    }
    return functions;
}

/**
 * 跳过一个平衡括号组，返回右括号之后的位置
 */
function skipBalancedParens(str, start) {
    let depth = 0;
    for (let i = start; i < str.length; i++) {
        if (str[i] === '(') depth++;
        else if (str[i] === ')') {
            depth--;
            if (depth === 0) return i + 1;
        }
    }
    return str.length;
}

/**
 * 从函数体中提取跨合约调用
 * 匹配模式：IFoo(expr).method(...)
 * 支持嵌套括号参数，如 IFoo(address(0)).method()
 */
function extractCrossContractCalls(funcBody) {
    const calls = [];

    // Match the interface name followed by '('
    const ifaceRegex = /\b([A-Z]\w*)\s*\(/g;
    let m;
    while ((m = ifaceRegex.exec(funcBody)) !== null) {
        const iface = m[1];
        // Skip primitive casts
        if (/^(uint|int|bytes|bool|address|string|payable)/i.test(iface)) continue;

        // Skip past the balanced paren group
        const afterParen = skipBalancedParens(funcBody, m.index + m[0].length - 1);

        // Now expect optional whitespace, '.', optional whitespace, method name, '('
        const rest = funcBody.slice(afterParen);
        const dotMethod = /^\s*\.\s*(\w+)\s*\(/.exec(rest);
        if (!dotMethod) continue;

        calls.push({ calledInterface: iface, calledFunction: dotMethod[1] });
    }

    return calls;
}

/**
 * 从源码提取接口定义的函数签名
 * 返回 Map<interfaceName, Set<functionName>>
 */
function extractInterfaces(source) {
    const interfaces = new Map();
    const ifaceRegex = /interface\s+(\w+)\s*\{([^}]*)\}/gs;
    let m;
    while ((m = ifaceRegex.exec(source)) !== null) {
        const name = m[1];
        const body = m[2];
        const funcs = new Set();
        const funcRegex = /function\s+(\w+)\s*\(/g;
        let fm;
        while ((fm = funcRegex.exec(body)) !== null) {
            funcs.add(fm[1]);
        }
        interfaces.set(name, funcs);
    }
    return interfaces;
}

/**
 * 构建接口名 → 目标合约名 的映射
 *
 * 规则：IFoo 描述的是合约 Foo（去掉 I 前缀后与合约名匹配）
 * 这是 Solidity 惯例：接口定义在调用方源码中，描述被调用方。
 *
 * @param {Array} contracts - [{ contractName, arkheionId, sourceCode }]
 * @returns {Map<interfaceName, contractName>}
 */
function buildInterfaceToContractMap(contracts) {
    // Build a set of all known contract names for fast lookup
    const contractNames = new Set(contracts.map(c => c.contractName));
    const result = new Map();

    for (const c of contracts) {
        const ifaces = extractInterfaces(c.sourceCode);
        for (const ifaceName of ifaces.keys()) {
            if (result.has(ifaceName)) continue;
            // Try: strip leading I → match contract name
            const candidate = ifaceName.replace(/^I/, '');
            if (contractNames.has(candidate)) {
                result.set(ifaceName, candidate);
            }
            // Try: exact match (interface name == contract name, unusual but possible)
            if (contractNames.has(ifaceName)) {
                result.set(ifaceName, ifaceName);
            }
            // Try: case-insensitive match
            else {
                for (const name of contractNames) {
                    if (name.toLowerCase() === candidate.toLowerCase()) {
                        result.set(ifaceName, name);
                        break;
                    }
                }
            }
        }
    }

    return result;
}

/**
 * 构建函数级别调用图
 */
function buildFunctionGraph(contracts) {
    const nodes = new Map();
    const edges = new Map();

    // Step 1: collect all function nodes
    const contractFuncs = new Map();
    for (const c of contracts) {
        const funcs = extractFunctions(c.sourceCode);
        contractFuncs.set(c.contractName, funcs);
        for (const f of funcs) {
            const key = `${c.contractName}.${f.name}`;
            nodes.set(key, { contract: c.contractName, func: f.name, arkheionId: c.arkheionId });
            edges.set(key, new Set());
        }
    }

    // Step 2: build interface → target contract map
    const ifaceToContract = buildInterfaceToContractMap(contracts);

    // Step 3: for each function body, find cross-contract calls and add edges
    for (const c of contracts) {
        const funcs = contractFuncs.get(c.contractName) || [];
        for (const f of funcs) {
            const callerKey = `${c.contractName}.${f.name}`;
            const calls = extractCrossContractCalls(f.body, []);

            for (const call of calls) {
                const targetContract = ifaceToContract.get(call.calledInterface);
                if (!targetContract) continue;
                if (targetContract === c.contractName) continue; // skip self-calls
                const targetKey = `${targetContract}.${call.calledFunction}`;
                if (nodes.has(targetKey)) {
                    edges.get(callerKey).add(targetKey);
                }
            }
        }
    }

    return { nodes, edges, ifaceToContract };
}

/**
 * 在函数调用图上检测环（DFS 三色标记）
 */
function detectFunctionCycles(graph) {
    const { nodes, edges } = graph;
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    for (const key of nodes.keys()) color.set(key, WHITE);

    const cycles = [];
    const stack = [];

    function dfs(u) {
        color.set(u, GRAY);
        stack.push(u);
        for (const v of (edges.get(u) || [])) {
            if (color.get(v) === GRAY) {
                const cycleStart = stack.indexOf(v);
                cycles.push(stack.slice(cycleStart).concat(v));
            } else if (color.get(v) === WHITE) {
                dfs(v);
            }
        }
        stack.pop();
        color.set(u, BLACK);
    }

    for (const key of nodes.keys()) {
        if (color.get(key) === WHITE) dfs(key);
    }

    // Deduplicate
    const seen = new Set();
    return cycles.filter(cycle => {
        const key = [...cycle].sort().join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * 将函数环路径转换为合约级别环
 */
function functionCyclesToContractCycles(cycles) {
    return cycles.map(cycle =>
        [...new Set(cycle.map(node => node.split('.')[0]))]
    );
}

module.exports = {
    buildFunctionGraph,
    detectFunctionCycles,
    functionCyclesToContractCycles,
    extractFunctions,
    extractInterfaces,
    extractCrossContractCalls,
    buildInterfaceToContractMap,
};

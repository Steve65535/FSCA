/**
 * Unit tests for libs/commands/cluster/auto/funcgraph.js
 */

const {
    extractFunctions,
    extractInterfaces,
    extractCrossContractCalls,
    buildInterfaceToContractMap,
    buildFunctionGraph,
    detectFunctionCycles,
} = require('../../libs/commands/cluster/auto/funcgraph');

describe('extractFunctions', () => {
    it('extracts a single function', () => {
        const src = `contract Foo { function bar() external { uint x = 1; } }`;
        const funcs = extractFunctions(src);
        expect(funcs.some(f => f.name === 'bar')).toBe(true);
    });

    it('extracts multiple functions', () => {
        const src = `contract Foo {
            function foo() external {}
            function baz(uint x) internal returns (uint) { return x; }
        }`;
        const names = extractFunctions(src).map(f => f.name);
        expect(names).toContain('foo');
        expect(names).toContain('baz');
    });

    it('returns empty array for source with no functions', () => {
        expect(extractFunctions(`contract Foo {}`)).toEqual([]);
    });

    it('captures function body correctly', () => {
        const src = `contract Foo { function bar() external { uint x = 1; } }`;
        expect(extractFunctions(src)[0].body).toContain('uint x = 1');
    });
});

describe('extractInterfaces', () => {
    it('extracts interface with functions', () => {
        const src = `interface ITradeEngine { function execute(uint id) external; }`;
        const ifaces = extractInterfaces(src);
        expect(ifaces.has('ITradeEngine')).toBe(true);
        expect(ifaces.get('ITradeEngine').has('execute')).toBe(true);
    });

    it('extracts multiple interfaces', () => {
        const src = `
            interface IFoo { function foo() external; }
            interface IBar { function bar() external; function baz() external; }
        `;
        const ifaces = extractInterfaces(src);
        expect(ifaces.has('IFoo')).toBe(true);
        expect(ifaces.has('IBar')).toBe(true);
        expect(ifaces.get('IBar').size).toBe(2);
    });

    it('returns empty map when no interfaces', () => {
        expect(extractInterfaces(`contract Foo {}`).size).toBe(0);
    });
});

describe('extractCrossContractCalls', () => {
    it('detects interface cast call pattern IFoo(addr).method()', () => {
        const body = `{ ITradeEngine(addr).execute(1); }`;
        const calls = extractCrossContractCalls(body, []);
        expect(calls.some(c => c.calledInterface === 'ITradeEngine' && c.calledFunction === 'execute')).toBe(true);
    });

    it('ignores primitive casts like uint256(x)', () => {
        const body = `{ uint256(x).toString(); }`;
        const calls = extractCrossContractCalls(body);
        expect(calls.every(c => c.calledInterface !== 'uint256')).toBe(true);
    });

    it('ignores address() cast', () => {
        const body = `{ address(this).call(""); }`;
        const calls = extractCrossContractCalls(body);
        expect(calls.every(c => c.calledInterface !== 'address')).toBe(true);
    });

    it('returns empty array for body with no cross-contract calls', () => {
        expect(extractCrossContractCalls(`{ uint x = 1 + 2; }`)).toHaveLength(0);
    });

    it('detects nested-paren pattern IFoo(address(0)).method()', () => {
        const body = `{ ITradeEngine(address(0)).execute(1); }`;
        const calls = extractCrossContractCalls(body);
        expect(calls.some(c => c.calledInterface === 'ITradeEngine' && c.calledFunction === 'execute')).toBe(true);
    });

    it('detects doubly-nested parens IFoo(IBar(x).get()).method()', () => {
        const body = `{ IEngine(IRegistry(reg).get()).run(); }`;
        const calls = extractCrossContractCalls(body);
        expect(calls.some(c => c.calledInterface === 'IEngine' && c.calledFunction === 'run')).toBe(true);
    });
});

describe('buildInterfaceToContractMap', () => {
    it('maps IFoo to contract Foo by stripping I prefix', () => {
        const contracts = [
            { contractName: 'Foo', arkheionId: 1, sourceCode: `interface IFoo { function foo() external; } contract Bar is normalTemplate { function bar() external { IFoo(addr).foo(); } }` },
            { contractName: 'Bar', arkheionId: 2, sourceCode: `contract Bar is normalTemplate {}` },
        ];
        const map = buildInterfaceToContractMap(contracts);
        expect(map.get('IFoo')).toBe('Foo');
    });

    it('does not map interface to the contract that declares it', () => {
        // IBar is declared in Bar's source but describes contract Foo
        const contracts = [
            { contractName: 'Foo', arkheionId: 1, sourceCode: `contract Foo is normalTemplate {}` },
            { contractName: 'Bar', arkheionId: 2, sourceCode: `interface IFoo { function foo() external; } contract Bar is normalTemplate {}` },
        ];
        const map = buildInterfaceToContractMap(contracts);
        // IFoo should map to Foo, not Bar
        expect(map.get('IFoo')).toBe('Foo');
    });

    it('returns empty map when no interfaces exist', () => {
        const contracts = [
            { contractName: 'A', arkheionId: 1, sourceCode: `contract A is normalTemplate {}` },
        ];
        expect(buildInterfaceToContractMap(contracts).size).toBe(0);
    });
});

describe('buildFunctionGraph + detectFunctionCycles', () => {
    it('detects no cycles in independent contracts', () => {
        const contracts = [
            { contractName: 'A', arkheionId: 1, sourceCode: `contract A is normalTemplate { function foo() external {} }` },
            { contractName: 'B', arkheionId: 2, sourceCode: `contract B is normalTemplate { function bar() external {} }` },
        ];
        const graph = buildFunctionGraph(contracts);
        expect(detectFunctionCycles(graph)).toHaveLength(0);
    });

    it('detects a function-level cycle: A.foo calls B.bar, B.bar calls A.foo', () => {
        // A declares IB to call B; B declares IA to call A
        const srcA = `
            interface IB { function bar() external; }
            contract A is normalTemplate {
                function foo() external { IB(addr).bar(); }
            }
        `;
        const srcB = `
            interface IA { function foo() external; }
            contract B is normalTemplate {
                function bar() external { IA(addr).foo(); }
            }
        `;
        const contracts = [
            { contractName: 'A', arkheionId: 1, sourceCode: srcA },
            { contractName: 'B', arkheionId: 2, sourceCode: srcB },
        ];
        const graph = buildFunctionGraph(contracts);
        // Verify edges exist
        expect(graph.edges.get('A.foo').has('B.bar')).toBe(true);
        expect(graph.edges.get('B.bar').has('A.foo')).toBe(true);
        // Verify cycle detected
        const cycles = detectFunctionCycles(graph);
        expect(cycles.length).toBeGreaterThan(0);
        const flat = cycles.flat();
        expect(flat).toContain('A.foo');
        expect(flat).toContain('B.bar');
    });

    it('does not create edge when interface has no matching contract', () => {
        const src = `
            interface IUnknown { function doSomething() external; }
            contract A is normalTemplate {
                function foo() external { IUnknown(addr).doSomething(); }
            }
        `;
        const contracts = [{ contractName: 'A', arkheionId: 1, sourceCode: src }];
        const graph = buildFunctionGraph(contracts);
        expect(graph.edges.get('A.foo').size).toBe(0);
    });

    it('builds nodes for all functions in all contracts', () => {
        const contracts = [
            { contractName: 'X', arkheionId: 1, sourceCode: `contract X is normalTemplate { function alpha() external {} function beta() external {} }` },
        ];
        const graph = buildFunctionGraph(contracts);
        expect(graph.nodes.has('X.alpha')).toBe(true);
        expect(graph.nodes.has('X.beta')).toBe(true);
    });

    it('no self-cycle for single contract', () => {
        const contracts = [
            { contractName: 'A', arkheionId: 1, sourceCode: `contract A is normalTemplate { function foo() external {} }` },
        ];
        const graph = buildFunctionGraph(contracts);
        expect(detectFunctionCycles(graph)).toHaveLength(0);
    });

    it('detects cycle when nested-paren cast used: IB(address(0)).bar()', () => {
        const srcA = `
            interface IB { function bar() external; }
            contract A is normalTemplate {
                function foo() external { IB(address(0)).bar(); }
            }
        `;
        const srcB = `
            interface IA { function foo() external; }
            contract B is normalTemplate {
                function bar() external { IA(address(0)).foo(); }
            }
        `;
        const contracts = [
            { contractName: 'A', arkheionId: 1, sourceCode: srcA },
            { contractName: 'B', arkheionId: 2, sourceCode: srcB },
        ];
        const graph = buildFunctionGraph(contracts);
        expect(graph.edges.get('A.foo').has('B.bar')).toBe(true);
        expect(graph.edges.get('B.bar').has('A.foo')).toBe(true);
        const cycles = detectFunctionCycles(graph);
        expect(cycles.length).toBeGreaterThan(0);
    });
});

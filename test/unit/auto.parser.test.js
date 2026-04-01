/**
 * Unit tests for libs/commands/cluster/auto/parser.js
 */

const parse = require('../../libs/commands/cluster/auto/parser');

describe('parser', () => {
    describe('autoEnabled detection', () => {
        it('returns autoEnabled=false when @arkheion-auto is missing', () => {
            const src = `// @arkheion-id 1\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.autoEnabled).toBe(false);
        });

        it('returns autoEnabled=false when @arkheion-auto no', () => {
            const src = `// @arkheion-auto no\n// @arkheion-id 1\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.autoEnabled).toBe(false);
        });

        it('returns autoEnabled=true when @arkheion-auto yes', () => {
            const src = `// @arkheion-auto yes\n// @arkheion-id 1\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.autoEnabled).toBe(true);
        });

        it('is case-insensitive for yes/no', () => {
            const src = `// @arkheion-auto YES\n// @arkheion-id 1\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.autoEnabled).toBe(true);
        });
    });

    describe('arkheionId parsing', () => {
        it('parses @arkheion-id correctly', () => {
            const src = `// @arkheion-auto yes\n// @arkheion-id 42\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.arkheionId).toBe(42);
        });

        it('returns error when @arkheion-id is missing but @arkheion-auto yes', () => {
            const src = `// @arkheion-auto yes\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.error).toMatch(/Missing @arkheion-id/);
            expect(result.arkheionId).toBeNull();
        });
    });

    describe('activePods parsing', () => {
        it('parses single active pod', () => {
            const src = `// @arkheion-auto yes\n// @arkheion-id 2\n// @arkheion-active 1\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.activePods).toEqual([1]);
        });

        it('parses multiple active pods', () => {
            const src = `// @arkheion-auto yes\n// @arkheion-id 2\n// @arkheion-active 1,3,5\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.activePods).toEqual([1, 3, 5]);
        });

        it('returns empty array when @arkheion-active is empty', () => {
            const src = `// @arkheion-auto yes\n// @arkheion-id 2\n// @arkheion-active\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.activePods).toEqual([]);
        });

        it('returns empty array when @arkheion-active is absent', () => {
            const src = `// @arkheion-auto yes\n// @arkheion-id 2\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.activePods).toEqual([]);
        });

        it('handles spaces around commas', () => {
            const src = `// @arkheion-auto yes\n// @arkheion-id 2\n// @arkheion-active 1, 3, 5\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.activePods).toEqual([1, 3, 5]);
        });
    });

    describe('passivePods parsing', () => {
        it('parses passive pods', () => {
            const src = `// @arkheion-auto yes\n// @arkheion-id 3\n// @arkheion-passive 2\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.passivePods).toEqual([2]);
        });

        it('returns empty array when @arkheion-passive is empty', () => {
            const src = `// @arkheion-auto yes\n// @arkheion-id 3\n// @arkheion-passive\ncontract Foo is normalTemplate {}`;
            const result = parse(src, 'Foo');
            expect(result.passivePods).toEqual([]);
        });
    });

    describe('contractName passthrough', () => {
        it('preserves contractName', () => {
            const src = `// @arkheion-auto yes\n// @arkheion-id 1\ncontract MyContract is normalTemplate {}`;
            const result = parse(src, 'MyContract');
            expect(result.contractName).toBe('MyContract');
        });
    });

    describe('full annotation block', () => {
        it('parses a complete annotation block correctly', () => {
            const src = [
                '// @arkheion-id 2',
                '// @arkheion-active 1,3',
                '// @arkheion-passive',
                '// @arkheion-auto yes',
                'contract TradeEngineV1 is normalTemplate {}'
            ].join('\n');
            const result = parse(src, 'TradeEngineV1');
            expect(result.autoEnabled).toBe(true);
            expect(result.arkheionId).toBe(2);
            expect(result.activePods).toEqual([1, 3]);
            expect(result.passivePods).toEqual([]);
            expect(result.contractName).toBe('TradeEngineV1');
        });
    });
});

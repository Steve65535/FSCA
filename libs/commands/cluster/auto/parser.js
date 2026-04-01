/**
 * 解析合约源码中的 @arkheion-* 注解
 */

module.exports = function parse(sourceCode, contractName) {
    const idMatch = sourceCode.match(/\/\/\s*@arkheion-id\s+(\d+)/);
    const activeMatch = sourceCode.match(/\/\/\s*@arkheion-active\s*([\d,\s]*)/);
    const passiveMatch = sourceCode.match(/\/\/\s*@arkheion-passive\s*([\d,\s]*)/);
    const autoMatch = sourceCode.match(/\/\/\s*@arkheion-auto\s+(yes|no)/i);

    const autoEnabled = autoMatch ? autoMatch[1].toLowerCase() === 'yes' : false;

    if (!autoEnabled) {
        return { contractName, arkheionId: null, activePods: [], passivePods: [], autoEnabled: false };
    }

    if (!idMatch) {
        return { contractName, arkheionId: null, activePods: [], passivePods: [], autoEnabled: true, error: `Missing @arkheion-id in ${contractName}` };
    }

    const arkheionId = parseInt(idMatch[1], 10);

    const parsePodList = (match) => {
        if (!match || !match[1].trim()) return [];
        return match[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    };

    return {
        contractName,
        arkheionId,
        activePods: parsePodList(activeMatch),
        passivePods: parsePodList(passiveMatch),
        autoEnabled: true,
    };
};

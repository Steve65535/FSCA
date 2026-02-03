/**
 * 增强的帮助命令
 * 提供更友好的帮助信息,包括快速入门、常用命令、示例等
 */

const logger = require('../../libs/logger');
const { version } = require('../../package.json');

module.exports = async function help({ rootDir, args = {} }) {
    const { COLORS } = logger;

    // 显示标题
    console.log('');
    console.log(`${COLORS.brightPurple}╔═══════════════════════════════════════════════════════════════╗${COLORS.reset}`);
    console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.bold}${COLORS.brightBlue}FSCA CLI${COLORS.reset} - Smart Contract Cluster Management          ${COLORS.brightPurple}║${COLORS.reset}`);
    console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}Version:${COLORS.reset} ${version}                                              ${COLORS.brightPurple}║${COLORS.reset}`);
    console.log(`${COLORS.brightPurple}╚═══════════════════════════════════════════════════════════════╝${COLORS.reset}`);
    console.log('');

    // 快速入门
    console.log(`${COLORS.bold}${COLORS.brightGreen}🚀 Quick Start${COLORS.reset}`);
    console.log(`${COLORS.brightYellow}────────────────────────────────────────────────────────────────${COLORS.reset}`);
    console.log('');
    console.log(`  ${COLORS.brightBlue}1.${COLORS.reset} Initialize project`);
    console.log(`     fsca init`);
    console.log('');
    console.log(`  ${COLORS.brightBlue}2.${COLORS.reset} Deploy cluster`);
    console.log(`     fsca cluster init`);
    console.log('');
    console.log(`  ${COLORS.brightBlue}3.${COLORS.reset} Deploy your first contract`);
    console.log(`     fsca deploy "MyFirstPod"`);
    console.log('');
    console.log(`  ${COLORS.brightBlue}4.${COLORS.reset} Mount to cluster`);
    console.log(`     fsca cluster mount 1 "MyFirstPod"`);
    console.log('');

    // 常用命令
    console.log(`${COLORS.bold}${COLORS.brightGreen}📋 Common Commands${COLORS.reset}`);
    console.log(`${COLORS.brightYellow}────────────────────────────────────────────────────────────────${COLORS.reset}`);
    console.log('');

    const commonCommands = [
        { cmd: 'fsca deploy <name>', desc: 'Deploy a new contract' },
        { cmd: 'fsca cluster mount <id> <name>', desc: 'Mount contract to cluster' },
        { cmd: 'fsca cluster current', desc: 'Show current operating contract' },
        { cmd: 'fsca cluster list mounted', desc: 'List all mounted contracts' },
        { cmd: 'fsca cluster graph', desc: 'Show cluster topology' },
        { cmd: 'fsca wallet submit', desc: 'Submit multisig transaction' },
        { cmd: 'fsca wallet list', desc: 'List wallet transactions' },
    ];

    commonCommands.forEach(({ cmd, desc }) => {
        console.log(`  ${COLORS.brightBlue}${cmd.padEnd(35)}${COLORS.reset} ${desc}`);
    });
    console.log('');

    // 命令分组
    console.log(`${COLORS.bold}${COLORS.brightGreen}📦 Command Groups${COLORS.reset}`);
    console.log(`${COLORS.brightYellow}────────────────────────────────────────────────────────────────${COLORS.reset}`);
    console.log('');

    const commandGroups = [
        {
            name: 'Project Management',
            commands: [
                { cmd: 'init', desc: 'Initialize FSCA project' },
                { cmd: 'deploy', desc: 'Deploy contract template' },
            ]
        },
        {
            name: 'Cluster Management',
            commands: [
                { cmd: 'cluster init', desc: 'Deploy cluster contracts' },
                { cmd: 'cluster mount', desc: 'Mount contract to cluster' },
                { cmd: 'cluster unmount', desc: 'Unmount contract from cluster' },
                { cmd: 'cluster link', desc: 'Create dependency link' },
                { cmd: 'cluster unlink', desc: 'Remove dependency link' },
                { cmd: 'cluster choose', desc: 'Select operating contract' },
                { cmd: 'cluster current', desc: 'Show current contract' },
                { cmd: 'cluster list', desc: 'List contracts' },
                { cmd: 'cluster info', desc: 'Show contract details' },
                { cmd: 'cluster graph', desc: 'Show topology graph' },
                { cmd: 'cluster operator', desc: 'Manage operators' },
            ]
        },
        {
            name: 'MultiSig Wallet',
            commands: [
                { cmd: 'wallet submit', desc: 'Submit transaction' },
                { cmd: 'wallet confirm', desc: 'Confirm transaction' },
                { cmd: 'wallet execute', desc: 'Execute transaction' },
                { cmd: 'wallet revoke', desc: 'Revoke confirmation' },
                { cmd: 'wallet list', desc: 'List transactions' },
                { cmd: 'wallet info', desc: 'Show transaction details' },
                { cmd: 'wallet owners', desc: 'Show wallet owners' },
                { cmd: 'wallet propose', desc: 'Propose governance change' },
            ]
        },
        {
            name: 'Contract Operations',
            commands: [
                { cmd: 'normal right set', desc: 'Set function permission' },
                { cmd: 'normal right remove', desc: 'Remove permission' },
                { cmd: 'normal get modules', desc: 'Get linked modules' },
            ]
        },
    ];

    commandGroups.forEach(group => {
        console.log(`  ${COLORS.bold}${group.name}${COLORS.reset}`);
        group.commands.forEach(({ cmd, desc }) => {
            console.log(`    ${COLORS.brightBlue}fsca ${cmd.padEnd(25)}${COLORS.reset} ${desc}`);
        });
        console.log('');
    });

    // 示例
    console.log(`${COLORS.bold}${COLORS.brightGreen}💡 Examples${COLORS.reset}`);
    console.log(`${COLORS.brightYellow}────────────────────────────────────────────────────────────────${COLORS.reset}`);
    console.log('');
    console.log(`  # Deploy and mount a contract`);
    console.log(`  ${COLORS.brightBlue}fsca deploy "LendingModule"${COLORS.reset}`);
    console.log(`  ${COLORS.brightBlue}fsca cluster mount 1 "LendingModule"${COLORS.reset}`);
    console.log('');
    console.log(`  # Create dependency links`);
    console.log(`  ${COLORS.brightBlue}fsca cluster link active 0xTargetAddr... 2${COLORS.reset}`);
    console.log('');
    console.log(`  # Submit multisig transaction`);
    console.log(`  ${COLORS.brightBlue}fsca wallet submit --to 0x... --data 0x...${COLORS.reset}`);
    console.log(`  ${COLORS.brightBlue}fsca wallet confirm 0${COLORS.reset}`);
    console.log(`  ${COLORS.brightBlue}fsca wallet execute 0${COLORS.reset}`);
    console.log('');

    // 学习资源
    console.log(`${COLORS.bold}${COLORS.brightGreen}📚 Learn More${COLORS.reset}`);
    console.log(`${COLORS.brightYellow}────────────────────────────────────────────────────────────────${COLORS.reset}`);
    console.log('');
    console.log(`  ${COLORS.brightBlue}Documentation:${COLORS.reset}  See ${COLORS.brightGreen}user-guide.md${COLORS.reset} in project root`);
    console.log(`  ${COLORS.brightBlue}Command Help:${COLORS.reset}   fsca <command> --help`);
    console.log(`  ${COLORS.brightBlue}Version:${COLORS.reset}        fsca --version`);
    console.log('');

    // 提示
    console.log(`${COLORS.bold}${COLORS.brightGreen}💬 Tips${COLORS.reset}`);
    console.log(`${COLORS.brightYellow}────────────────────────────────────────────────────────────────${COLORS.reset}`);
    console.log('');
    console.log(`  ${COLORS.brightYellow}•${COLORS.reset} Use ${COLORS.brightBlue}fsca cluster current${COLORS.reset} to check your current context`);
    console.log(`  ${COLORS.brightYellow}•${COLORS.reset} Use ${COLORS.brightBlue}fsca cluster graph${COLORS.reset} to visualize your topology`);
    console.log(`  ${COLORS.brightYellow}•${COLORS.reset} All addresses are stored in ${COLORS.brightGreen}project.json${COLORS.reset}`);
    console.log(`  ${COLORS.brightYellow}•${COLORS.reset} Deployed contracts are archived in ${COLORS.brightGreen}contracts/deployed/${COLORS.reset}`);
    console.log('');

    // 底部
    console.log(`────────────────────────────────────────────────────────────────`);
    console.log(`FSCA - Full Stack Contract Architecture`);
    console.log(`GitHub: https://github.com/Steve65535/fsca-cli`);
    console.log('');
};

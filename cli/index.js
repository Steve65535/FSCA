#!/usr/bin/env node

/**
 * FSCA CLI 入口文件
 * 命令行工具主程序
 */

const { CommandParser } = require('./parser');
const { CommandExecutor } = require('./executor');
const fs = require('fs');
const path = require('path');
const logger = require('../libs/logger');

// 加载命令配置
const commandsConfigPath = path.join(__dirname, 'commands.json');
const commandsConfig = JSON.parse(fs.readFileSync(commandsConfigPath, 'utf-8'));

// 创建解析器和执行器
const parser = new CommandParser(commandsConfig);
const executor = new CommandExecutor();

// 获取命令行参数
const args = process.argv.slice(2);

// 处理帮助命令
if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
  // 使用增强的帮助命令
  const helpCommand = require('../libs/commands/help');
  helpCommand({ rootDir: process.cwd(), args: {} });
  process.exit(0);
}

// 处理版本命令
if (args[0] === '--version' || args[0] === '-v') {
  const packageJson = require('../package.json');
  console.log(packageJson.version);
  process.exit(0);
}

// 检查是否有 --help 或 -h 参数
const helpIndex = args.indexOf('--help');
const shortHelpIndex = args.indexOf('-h');
if (helpIndex !== -1 || shortHelpIndex !== -1) {
  // 获取帮助之前的命令部分
  const helpPos = helpIndex !== -1 ? helpIndex : shortHelpIndex;
  const commandArgs = args.slice(0, helpPos);
  const parsedForHelp = parser.parse(commandArgs);
  console.log(parser.getHelp(parsedForHelp.subcommands));
  process.exit(0);
}

// 解析命令
const parsedCommand = parser.parse(args);

// 如果解析失败
if (parsedCommand.error) {
  console.error(parsedCommand.error);
  console.log('\n' + parser.getHelp());
  process.exit(1);
}

// 如果没有找到命令
if (!parsedCommand.handler) {
  console.error('Command not found or no handler specified');
  console.log('\n' + parser.getHelp());
  process.exit(1);
}

// 执行命令
(async () => {
  try {
    await executor.execute(parsedCommand, process.cwd());
  } catch (error) {
    console.error('Command execution failed:', error.message);
    process.exit(1);
  }
})();
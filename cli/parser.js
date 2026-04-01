/**
 * 命令行解析模块
 * 解析命令行参数，支持树形结构的命令
 */

class CommandParser {
  constructor(commandsConfig) {
    this.commandsConfig = commandsConfig;
  }

  /**
   * 解析命令行参数
   * @param {string[]} args - 命令行参数数组
   * @returns {Object} 解析结果 { command: string, subcommands: string[], args: Object, handler: string }
   */
  parse(args) {
    if (!args || args.length === 0) {
      return {
        command: null,
        subcommands: [],
        args: {},
        handler: null,
        config: null
      };
    }

    // 查找匹配的命令路径
    const result = this.findCommand(this.commandsConfig, args);

    if (!result) {
      return {
        command: null,
        subcommands: [],
        args: this.parseArgs(args),
        handler: null,
        config: null,
        error: `Unknown command: ${args.join(' ')}`
      };
    }

    // 解析参数
    const parsedArgs = this.parseArgs(result.remainingArgs, result.config);
    const params = result.config?.params || {};
    const missingRequired = Object.entries(params)
      .filter(([key, param]) => {
        if (!param?.required) return false;
        const value = parsedArgs[key];
        return value === undefined || value === null || value === '';
      })
      .map(([key]) => key);

    if (missingRequired.length > 0) {
      const usage = result.config?.usage ? `\nUsage: ${result.config.usage}` : '';
      return {
        command: result.path.join(' '),
        subcommands: result.path,
        args: parsedArgs,
        handler: null,
        config: result.config,
        error: `Missing required argument(s): ${missingRequired.map(k => `--${k}`).join(', ')}${usage}`
      };
    }

    return {
      command: result.path.join(' '),
      subcommands: result.path,
      args: parsedArgs,
      handler: result.config.handler,
      config: result.config,
      remainingArgs: result.remainingArgs
    };
  }

  /**
   * 递归查找命令
   * @param {Object} config - 命令配置
   * @param {string[]} args - 剩余参数
   * @param {string[]} path - 当前路径
   * @returns {Object|null} 匹配的命令配置
   */
  findCommand(config, args, path = []) {
    if (!args || args.length === 0) {
      // 如果当前节点有 handler，返回它
      if (config.handler) {
        return { config, path, remainingArgs: [] };
      }
      return null;
    }

    const [firstArg, ...remainingArgs] = args;

    // 检查是否是子命令
    if (config.commands && config.commands[firstArg]) {
      const subConfig = config.commands[firstArg];
      const result = this.findCommand(subConfig, remainingArgs, [...path, firstArg]);
      if (result) return result;
    }

    // 如果当前节点有 handler 且剩余参数可以作为参数解析
    if (config.handler) {
      return { config, path, remainingArgs: args };
    }

    return null;
  }

  /**
   * 解析命令参数（支持 --flag 和 --key=value 格式）
   * @param {string[]} args - 参数数组
   * @param {Object} config - 命令配置（包含参数定义）
   * @returns {Object} 解析后的参数对象
   */
  parseArgs(args, config = {}) {
    const parsed = {};
    const params = config.params || {};
    const positionalValues = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      // 处理 --flag 格式
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const nextArg = args[i + 1];

        // 处理 --key=value 格式
        if (key.includes('=')) {
          const [k, v] = key.split('=');
          parsed[k] = this.parseValue(v, params[k]);
          continue;
        }

        // 处理 --key value 格式
        if (nextArg && !nextArg.startsWith('--')) {
          parsed[key] = this.parseValue(nextArg, params[key]);
          i++; // 跳过下一个参数
        } else {
          // 布尔标志
          parsed[key] = true;
        }
      } else {
        // 位置参数
        const positionalKey = `arg${Object.keys(parsed).filter(k => k.startsWith('arg')).length}`;
        parsed[positionalKey] = arg;
        positionalValues.push(arg);
      }
    }

    // 将位置参数按 params 定义顺序映射到命名参数，兼容 `arkheion wallet confirm 0` 这类用法
    const paramKeys = Object.keys(params);
    for (let i = 0; i < positionalValues.length && i < paramKeys.length; i++) {
      const key = paramKeys[i];
      if (parsed[key] === undefined) {
        parsed[key] = this.parseValue(positionalValues[i], params[key]);
      }
    }

    return parsed;
  }

  /**
   * 解析参数值（根据类型转换）
   * @param {string} value - 参数值
   * @param {Object} paramConfig - 参数配置
   * @returns {*} 解析后的值
   */
  parseValue(value, paramConfig) {
    if (!paramConfig) return value;

    const type = paramConfig.type || 'string';

    switch (type) {
      case 'number':
        return Number(value);
      case 'boolean':
        return value === 'true' || value === '1';
      case 'array':
        return value.split(',').map(v => v.trim());
      default:
        return value;
    }
  }

  /**
   * 获取帮助信息
   * @param {string[]} commandPath - 命令路径
   * @returns {string} 帮助信息
   */
  getHelp(commandPath = []) {
    let config = this.commandsConfig;

    // 导航到指定路径
    for (const segment of commandPath) {
      if (config.commands && config.commands[segment]) {
        config = config.commands[segment];
      } else {
        return `Command not found: ${commandPath.join(' ')}`;
      }
    }

    const lines = [];

    if (config.description) {
      lines.push(`Description: ${config.description}`);
      lines.push('');
    }

    if (config.commands && Object.keys(config.commands).length > 0) {
      lines.push('Subcommands:');
      for (const [name, subConfig] of Object.entries(config.commands)) {
        lines.push(`  ${name.padEnd(20)} ${subConfig.description || ''}`);
      }
      lines.push('');
    }

    if (config.params && Object.keys(config.params).length > 0) {
      lines.push('Parameters:');
      for (const [name, paramConfig] of Object.entries(config.params)) {
        const required = paramConfig.required ? '(required)' : '(optional)';
        const type = paramConfig.type || 'string';
        lines.push(`  --${name.padEnd(20)} ${type} ${required} ${paramConfig.description || ''}`);
      }
      lines.push('');
    }

    if (config.usage) {
      lines.push(`Usage: ${config.usage}`);
    }

    return lines.join('\n');
  }

  /**
   * 列出所有可用命令
   * @returns {string[]} 命令列表
   */
  listCommands(config = this.commandsConfig, prefix = '') {
    const commands = [];

    if (config.handler) {
      commands.push(prefix || '(root)');
    }

    if (config.commands) {
      for (const [name, subConfig] of Object.entries(config.commands)) {
        const fullPath = prefix ? `${prefix} ${name}` : name;
        commands.push(fullPath);
        commands.push(...this.listCommands(subConfig, fullPath));
      }
    }

    return commands;
  }
}

module.exports = { CommandParser };

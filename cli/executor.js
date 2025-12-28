/**
 * 命令执行模块
 * 根据解析结果执行相应的命令处理器
 */

const path = require('path');
const fs = require('fs');

const logger = require('../libs/logger');

class CommandExecutor {
  constructor(handlersDir = path.join(__dirname, '../libs')) {
    this.handlersDir = handlersDir;
    this.handlersCache = {};
  }

  /**
   * 执行命令
   * @param {Object} parsedCommand - 解析后的命令对象
   * @param {string} rootDir - 项目根目录
   * @returns {Promise<any>} 执行结果
   */
  async execute(parsedCommand, rootDir = process.cwd()) {
    if (!parsedCommand.handler) {
      if (parsedCommand.error) {
        console.error(parsedCommand.error);
        console.log('\nAvailable commands:');
        // 这里可以列出所有可用命令
        return;
      }
      console.error('No handler specified for command');
      return;
    }

    // Log Command
    if (parsedCommand.command) {
      logger.logCommand(parsedCommand.command);
    }

    // Log Input (Arguments)
    if (parsedCommand.args && Object.keys(parsedCommand.args).length > 0) {
      const inputStr = Object.entries(parsedCommand.args)
        .map(([k, v]) => `--${k}=${v}`)
        .join(' ');
      logger.logInput(inputStr);
    }

    try {
      // 加载处理器
      const handler = await this.loadHandler(parsedCommand.handler);

      let result;
      // 执行处理器
      if (typeof handler === 'function') {
        result = await handler({
          args: parsedCommand.args,
          subcommands: parsedCommand.subcommands,
          config: parsedCommand.config,
          rootDir
        });
      } else if (handler && typeof handler.default === 'function') {
        result = await handler.default({
          args: parsedCommand.args,
          subcommands: parsedCommand.subcommands,
          config: parsedCommand.config,
          rootDir
        });
      } else {
        console.error(`Handler "${parsedCommand.handler}" is not a function`);
        return;
      }

      // Log Result
      if (result !== undefined && result !== null) {
        // Only log if it's a string or simple object, avoid logging massive objects if not intended
        const resultStr = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
        logger.logResult(resultStr);
      }

      return result;

    } catch (error) {
      console.error(`Error executing command: ${error.message}`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      throw error;
    }
  }

  /**
   * 加载命令处理器
   * @param {string} handlerPath - 处理器路径（模块路径）
   * @returns {Promise<Function>} 处理器函数
   */
  async loadHandler(handlerPath) {
    // 如果已经缓存，直接返回
    if (this.handlersCache[handlerPath]) {
      return this.handlersCache[handlerPath];
    }

    try {
      // 支持相对路径和绝对路径
      let modulePath;

      if (path.isAbsolute(handlerPath)) {
        modulePath = handlerPath;
      } else if (handlerPath.startsWith('./libs/')) {
        // 如果路径是 ./libs/xxx，去掉 ./libs/ 前缀，直接从 handlersDir 加载
        const relativePath = handlerPath.replace(/^\.\/libs\//, '');
        modulePath = path.resolve(this.handlersDir, relativePath);
      } else if (handlerPath.startsWith('./') || handlerPath.startsWith('../')) {
        // 相对路径，相对于 handlersDir
        modulePath = path.resolve(this.handlersDir, handlerPath);
      } else {
        // 尝试从 handlers 目录加载
        modulePath = path.resolve(this.handlersDir, handlerPath);
      }

      // 检查文件是否存在
      if (!fs.existsSync(modulePath) && !fs.existsSync(modulePath + '.js') && !fs.existsSync(modulePath + '.ts')) {
        // 如果不存在，尝试作为 npm 模块加载
        const handler = require(handlerPath);
        this.handlersCache[handlerPath] = handler;
        return handler;
      }

      // 尝试加载 .js 文件
      if (fs.existsSync(modulePath + '.js')) {
        const handler = require(modulePath + '.js');
        this.handlersCache[handlerPath] = handler;
        return handler;
      }

      // 尝试加载 .ts 文件（需要 ts-node 或其他工具）
      if (fs.existsSync(modulePath + '.ts')) {
        // 注意：如果需要支持 TypeScript，需要配置 ts-node 或编译
        try {
          require('ts-node/register');
          const handler = require(modulePath + '.ts');
          this.handlersCache[handlerPath] = handler;
          return handler;
        } catch (e) {
          console.warn('TypeScript support not available. Please install ts-node or compile TypeScript files.');
          throw new Error(`Cannot load TypeScript handler: ${modulePath}.ts`);
        }
      }

      // 尝试直接加载（可能是目录）
      const handler = require(modulePath);
      this.handlersCache[handlerPath] = handler;
      return handler;
    } catch (error) {
      console.error(`Failed to load handler "${handlerPath}": ${error.message}`);
      throw error;
    }
  }

  /**
   * 清除处理器缓存
   */
  clearCache() {
    this.handlersCache = {};
  }
}

module.exports = { CommandExecutor };

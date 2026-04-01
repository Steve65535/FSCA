const { CommandParser } = require('../../cli/parser');

// 使用真实的 commands.json 结构做测试
const testConfig = {
  description: 'Arkheion CLI',
  commands: {
    help: {
      description: '显示帮助信息',
      handler: './libs/commands/help',
      usage: 'arkheion help'
    },
    deploy: {
      description: '部署合约',
      handler: './libs/commands/deploy',
      usage: 'arkheion deploy',
      params: {
        description: { type: 'string', required: true, description: '合约描述' }
      }
    },
    wallet: {
      description: '管理钱包',
      commands: {
        submit: {
          description: '提交交易',
          handler: './libs/commands/wallet/submit',
          params: {
            to: { type: 'string', required: true },
            value: { type: 'string', required: false },
            data: { type: 'string', required: true }
          }
        },
        confirm: {
          description: '确认交易',
          handler: './libs/commands/wallet/confirm',
          params: {
            txIndex: { type: 'number', required: true }
          }
        },
        propose: {
          description: '提议治理',
          commands: {
            'add-owner': {
              description: '添加所有者',
              handler: './libs/commands/wallet/propose',
              params: {
                address: { type: 'string', required: true }
              }
            }
          }
        }
      }
    },
    cluster: {
      description: '集群命令',
      commands: {
        init: {
          description: '初始化集群',
          handler: './libs/commands/cluster/init',
          params: {
            threshold: { type: 'number', required: false }
          }
        },
        list: {
          description: '列表',
          commands: {
            mounted: {
              description: '已挂载',
              handler: './libs/commands/cluster/list'
            },
            all: {
              description: '全部',
              handler: './libs/commands/cluster/list'
            }
          }
        }
      }
    }
  }
};

describe('CommandParser', () => {
  let parser;

  beforeEach(() => {
    parser = new CommandParser(testConfig);
  });

  // ──────────────────────────────────────────────
  // parse() - 基本命令识别
  // ──────────────────────────────────────────────
  describe('parse() - 命令识别', () => {
    it('空参数返回 null command', () => {
      const result = parser.parse([]);
      expect(result.command).toBeNull();
      expect(result.handler).toBeNull();
    });

    it('null 参数返回 null command', () => {
      const result = parser.parse(null);
      expect(result.command).toBeNull();
    });

    it('正确解析一级命令 help', () => {
      const result = parser.parse(['help']);
      expect(result.command).toBe('help');
      expect(result.handler).toBe('./libs/commands/help');
    });

    it('正确解析一级命令 deploy', () => {
      const result = parser.parse(['deploy', '--description', 'MyPod']);
      expect(result.command).toBe('deploy');
      expect(result.handler).toBe('./libs/commands/deploy');
    });

    it('正确解析二级命令 wallet submit', () => {
      const result = parser.parse(['wallet', 'submit', '--to', '0xabc', '--data', '0x']);
      expect(result.command).toBe('wallet submit');
      expect(result.handler).toBe('./libs/commands/wallet/submit');
    });

    it('正确解析二级命令 cluster init', () => {
      const result = parser.parse(['cluster', 'init']);
      expect(result.command).toBe('cluster init');
      expect(result.handler).toBe('./libs/commands/cluster/init');
    });

    it('正确解析三级命令 wallet propose add-owner', () => {
      const result = parser.parse(['wallet', 'propose', 'add-owner', '--address', '0xabc']);
      expect(result.command).toBe('wallet propose add-owner');
      expect(result.handler).toBe('./libs/commands/wallet/propose');
    });

    it('正确解析三级命令 cluster list mounted', () => {
      const result = parser.parse(['cluster', 'list', 'mounted']);
      expect(result.command).toBe('cluster list mounted');
      expect(result.handler).toBe('./libs/commands/cluster/list');
    });

    it('未知命令返回 error', () => {
      const result = parser.parse(['nonexistent']);
      expect(result.command).toBeNull();
      expect(result.error).toMatch(/Unknown command/i);
    });

    it('subcommands 数组正确', () => {
      const result = parser.parse(['wallet', 'submit']);
      expect(result.subcommands).toEqual(['wallet', 'submit']);
    });

    it('缺失 required 参数时返回错误', () => {
      const result = parser.parse(['wallet', 'submit', '--to', '0xabc']);
      expect(result.handler).toBeNull();
      expect(result.error).toMatch(/Missing required argument/);
      expect(result.error).toMatch(/--data/);
    });
  });

  // ──────────────────────────────────────────────
  // parseArgs() - 参数解析
  // ──────────────────────────────────────────────
  describe('parseArgs() - 参数解析', () => {
    it('解析 --key value 格式', () => {
      const result = parser.parseArgs(['--to', '0xabc']);
      expect(result.to).toBe('0xabc');
    });

    it('解析 --key=value 格式', () => {
      const result = parser.parseArgs(['--to=0xabc']);
      expect(result.to).toBe('0xabc');
    });

    it('解析布尔标志 --pending', () => {
      const result = parser.parseArgs(['--pending']);
      expect(result.pending).toBe(true);
    });

    it('解析位置参数为 arg0', () => {
      const result = parser.parseArgs(['someValue']);
      expect(result.arg0).toBe('someValue');
    });

    it('根据 paramConfig 将值转为 number', () => {
      const config = { params: { txIndex: { type: 'number' } } };
      const result = parser.parseArgs(['--txIndex', '5'], config);
      expect(result.txIndex).toBe(5);
    });

    it('根据 paramConfig 将值转为 boolean', () => {
      const config = { params: { flag: { type: 'boolean' } } };
      const result = parser.parseArgs(['--flag', 'true'], config);
      expect(result.flag).toBe(true);
    });

    it('根据 paramConfig 将值转为 array', () => {
      const config = { params: { items: { type: 'array' } } };
      const result = parser.parseArgs(['--items', 'a,b,c'], config);
      expect(result.items).toEqual(['a', 'b', 'c']);
    });

    it('多个参数同时解析', () => {
      const result = parser.parseArgs(['--to', '0xabc', '--value', '100', '--data', '0x']);
      expect(result.to).toBe('0xabc');
      expect(result.value).toBe('100');
      expect(result.data).toBe('0x');
    });

    it('位置参数按 params 顺序映射到命名参数', () => {
      const config = { params: { txIndex: { type: 'number' } } };
      const result = parser.parseArgs(['0'], config);
      expect(result.arg0).toBe('0');
      expect(result.txIndex).toBe(0);
    });
  });

  // ──────────────────────────────────────────────
  // parseValue() - 类型转换
  // ──────────────────────────────────────────────
  describe('parseValue() - 类型转换', () => {
    it('没有 paramConfig 时原样返回字符串', () => {
      expect(parser.parseValue('hello', undefined)).toBe('hello');
    });

    it('type=number 转为数字', () => {
      expect(parser.parseValue('42', { type: 'number' })).toBe(42);
    });

    it('type=boolean true 返回 true', () => {
      expect(parser.parseValue('true', { type: 'boolean' })).toBe(true);
    });

    it('type=boolean 1 返回 true', () => {
      expect(parser.parseValue('1', { type: 'boolean' })).toBe(true);
    });

    it('type=boolean false 返回 false', () => {
      expect(parser.parseValue('false', { type: 'boolean' })).toBe(false);
    });

    it('type=array 用逗号分割', () => {
      expect(parser.parseValue('x,y,z', { type: 'array' })).toEqual(['x', 'y', 'z']);
    });

    it('type=array 去除空格', () => {
      expect(parser.parseValue('a, b, c', { type: 'array' })).toEqual(['a', 'b', 'c']);
    });

    it('type=string 原样返回', () => {
      expect(parser.parseValue('hello', { type: 'string' })).toBe('hello');
    });
  });

  // ──────────────────────────────────────────────
  // getHelp() - 帮助信息生成
  // ──────────────────────────────────────────────
  describe('getHelp() - 帮助信息', () => {
    it('根路径帮助包含所有子命令', () => {
      const help = parser.getHelp([]);
      expect(help).toContain('help');
      expect(help).toContain('deploy');
      expect(help).toContain('wallet');
      expect(help).toContain('cluster');
    });

    it('wallet 帮助包含 submit/confirm', () => {
      const help = parser.getHelp(['wallet']);
      expect(help).toContain('submit');
      expect(help).toContain('confirm');
    });

    it('不存在的命令路径返回 not found', () => {
      const help = parser.getHelp(['nonexistent']);
      expect(help).toMatch(/not found/i);
    });

    it('有 usage 的命令包含 Usage 字段', () => {
      const help = parser.getHelp(['deploy']);
      expect(help).toContain('Usage');
    });
  });

  // ──────────────────────────────────────────────
  // listCommands() - 命令列表
  // ──────────────────────────────────────────────
  describe('listCommands() - 命令列表', () => {
    it('列出所有有 handler 的路径', () => {
      const commands = parser.listCommands();
      expect(commands).toContain('help');
      expect(commands).toContain('deploy');
      expect(commands).toContain('wallet submit');
      expect(commands).toContain('wallet confirm');
      expect(commands).toContain('cluster init');
      expect(commands).toContain('cluster list mounted');
    });

    it('三级命令也被列出', () => {
      const commands = parser.listCommands();
      expect(commands).toContain('wallet propose add-owner');
    });
  });
});

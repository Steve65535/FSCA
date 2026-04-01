/**
 * 这是一个完整的命令处理器示例
 * 展示如何编写命令处理器函数
 * 
 * 在 commands.json 中可以这样配置：
 * {
 *   "commands": {
 *     "demo": {
 *       "description": "演示命令",
 *       "handler": "./libs/demo-example",
 *       "params": {
 *         "name": {
 *           "type": "string",
 *           "required": true,
 *           "description": "名称参数"
 *         },
 *         "count": {
 *           "type": "number",
 *           "required": false,
 *           "description": "数量（数字类型）"
 *         },
 *         "tags": {
 *           "type": "array",
 *           "required": false,
 *           "description": "标签列表（数组类型）"
 *         },
 *         "force": {
 *           "type": "boolean",
 *           "required": false,
 *           "description": "强制执行（布尔类型）"
 *         }
 *       },
 *       "usage": "arkheion demo --name example --count 10 --tags tag1,tag2 --force"
 *     }
 *   }
 * }
 */

module.exports = async function demoExample({ args, subcommands, config, rootDir }) {
  console.log('=== 命令处理器示例 ===\n');

  // 1. 访问解析后的参数
  console.log('参数对象:', JSON.stringify(args, null, 2));

  // 2. 访问子命令路径
  console.log('子命令路径:', subcommands);

  // 3. 访问命令配置
  console.log('命令描述:', config.description);

  // 4. 访问项目根目录
  console.log('项目根目录:', rootDir);

  // 5. 使用参数
  const { name, count = 1, tags = [], force = false } = args;

  if (!name) {
    throw new Error('必须提供 --name 参数');
  }

  console.log(`\n执行操作: ${name}`);
  console.log(`数量: ${count}`);
  console.log(`标签: ${tags.join(', ') || '无'}`);
  console.log(`强制执行: ${force ? '是' : '否'}`);

  // 6. 你的业务逻辑
  // ...

  console.log('\n命令执行完成！');
};

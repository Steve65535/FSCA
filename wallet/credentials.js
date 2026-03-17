const fs = require('fs');
const path = require('path');

const loadedEnvRoots = new Set();

function stripWrappingQuotes(value) {
  if (!value) return value;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadEnvFile(rootDir = process.cwd()) {
  const resolvedRoot = path.resolve(rootDir);
  if (loadedEnvRoots.has(resolvedRoot)) return;
  loadedEnvRoots.add(resolvedRoot);

  const envPath = path.join(resolvedRoot, '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = line.slice(0, eqIdx).trim();
    const value = stripWrappingQuotes(line.slice(eqIdx + 1).trim());
    if (!key) continue;

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolveRpcUrl(config, rootDir = process.cwd()) {
  loadEnvFile(rootDir);
  return process.env.FSCA_RPC_URL || config?.network?.rpc || '';
}

function resolvePrivateKey(config, rootDir = process.cwd()) {
  loadEnvFile(rootDir);
  return process.env.FSCA_PRIVATE_KEY || config?.account?.privateKey || '';
}

module.exports = {
  loadEnvFile,
  resolveRpcUrl,
  resolvePrivateKey,
};

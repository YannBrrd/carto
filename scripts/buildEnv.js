// Build-time variables of webpack.config.js: the environment (GitHub secrets in CI),
// else the gitignored .env file at the repository root, for local builds
const fs = require('fs');
const { parseEnv } = require('util');

// Text of a file written on Windows too: editors may add a BOM, PowerShell 5 `>` writes UTF-16
function decodeText(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le', 2);
  }
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Variables of a .env file, none when there is no such file
function readEnvFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
  return parseEnv(decodeText(content));
}

// The environment wins over the .env file, unless it leaves the variable empty
function buildVariable(name, env, envFile) {
  return env[name] || envFile[name] || '';
}

module.exports = { readEnvFile, buildVariable };

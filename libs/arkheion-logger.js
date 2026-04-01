/**
 * Arkheion CLI File Logger
 *
 * Intercepts console.log / console.warn / console.error and writes
 * timestamped entries to logs/<date>.log in the project root.
 */

const fs = require('fs')
const path = require('path')

const ANSI_RE = /\x1b\[[0-9;]*m/g
function stripAnsi(str) {
  return String(str).replace(ANSI_RE, '')
}

function timestamp() {
  return new Date().toISOString()
}

function safeSerialize(a) {
  if (typeof a !== 'object' || a === null) return String(a)
  try {
    const seen = new WeakSet()
    return JSON.stringify(a, (_, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]'
        seen.add(v)
      }
      return v
    })
  } catch (_) {
    return '[Unserializable]'
  }
}

function formatLine(level, args) {
  const msg = args.map(safeSerialize).join(' ')
  return `[${timestamp()}] [${level.padEnd(5)}] ${stripAnsi(msg)}\n`
}

let _attached = false
let _stream = null
const _originals = {}

function attachFileLogger(rootDir) {
  if (_attached) return
  _attached = true

  const logsDir = path.join(rootDir, 'logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  const dateStr = new Date().toISOString().slice(0, 10)
  const logFile = path.join(logsDir, `${dateStr}.log`)
  _stream = fs.createWriteStream(logFile, { flags: 'a' })

  const safeArgv = process.argv.slice(2).map(arg =>
    arg.replace(/(--(?:accountPrivateKey|privateKey|private[-_]?key)=)\S+/i, '$1[REDACTED]')
  ).join(' ')

  _stream.write(`\n${'='.repeat(60)}\n`)
  _stream.write(`[${timestamp()}] [SESSION START] arkheion ${safeArgv}\n`)
  _stream.write(`${'='.repeat(60)}\n`)

  _originals.log = console.log
  _originals.warn = console.warn
  _originals.error = console.error

  console.log = (...args) => {
    _originals.log(...args)
    if (_stream) _stream.write(formatLine('INFO', args))
  }

  console.warn = (...args) => {
    _originals.warn(...args)
    if (_stream) _stream.write(formatLine('WARN', args))
  }

  console.error = (...args) => {
    _originals.error(...args)
    if (_stream) _stream.write(formatLine('ERROR', args))
  }
}

function detachFileLogger() {
  if (!_attached) return
  if (_originals.log) console.log = _originals.log
  if (_originals.warn) console.warn = _originals.warn
  if (_originals.error) console.error = _originals.error
  if (_stream) {
    _stream.write(`[${timestamp()}] [SESSION END]\n`)
    _stream.end()
    _stream = null
  }
  _attached = false
}

module.exports = { attachFileLogger, detachFileLogger }

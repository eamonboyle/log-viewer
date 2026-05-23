#!/usr/bin/env tsx
import fs from 'fs'
import path from 'path'

const args = process.argv.slice(2)

function getArg(name: string, defaultValue: string): string {
  const idx = args.indexOf(name)
  if (idx === -1) return defaultValue
  return args[idx + 1] ?? defaultValue
}

function hasFlag(name: string): boolean {
  return args.includes(name)
}

const lines = parseInt(getArg('--lines', '10000'), 10)
const rate = parseInt(getArg('--rate', '0'), 10)
const wide = hasFlag('--wide')
const append = hasFlag('--append')
const wideWidth = parseInt(getArg('--wide-width', '500'), 10)
const output = getArg('--output', path.join(process.cwd(), 'benchmark.log'))

const dir = path.dirname(output)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

if (!append) {
  fs.writeFileSync(output, '')
}

let written = 0
const startLine = append && fs.existsSync(output) ? Date.now() : 0
const start = Date.now()

function padField(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width, ' ')
}

function writeLine(n: number): void {
  const ts = new Date().toISOString()
  const level = n % 10 === 0 ? 'ERROR' : n % 5 === 0 ? 'WARN' : 'INFO'
  const lineNum = startLine + n

  if (wide) {
    const payload = padField(`Benchmark line ${lineNum} with extended payload for wrap stress testing`, wideWidth)
    fs.appendFileSync(output, `${ts}\t${level}\t${payload}\tthread=${lineNum % 8}\trequestId=${lineNum}\n`)
  } else {
    fs.appendFileSync(output, `${ts} ${level} Benchmark line ${lineNum}\n`)
  }
}

if (rate > 0) {
  console.log(
    `${append ? 'Appending' : 'Generating'} ${lines} lines at ${rate}/s → ${output}${wide ? ' (wide)' : ''}`
  )
  const interval = setInterval(() => {
    const batch = Math.min(rate, lines - written)
    for (let i = 0; i < batch; i++) {
      writeLine(written++)
    }
    if (written >= lines) {
      clearInterval(interval)
      const elapsed = (Date.now() - start) / 1000
      console.log(`Done: ${written} lines in ${elapsed.toFixed(1)}s`)
    }
  }, 1000)
} else {
  console.log(`Writing ${lines} lines → ${output}${wide ? ' (wide)' : ''}`)
  for (let i = 0; i < lines; i++) {
    writeLine(i)
  }
  const elapsed = (Date.now() - start) / 1000
  console.log(`Done: ${lines} lines in ${elapsed.toFixed(1)}s`)
}

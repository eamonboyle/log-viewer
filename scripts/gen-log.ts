#!/usr/bin/env tsx
import fs from 'fs'
import path from 'path'

const args = process.argv.slice(2)

function getArg(name: string, defaultValue: string): string {
  const idx = args.indexOf(name)
  if (idx === -1) return defaultValue
  return args[idx + 1] ?? defaultValue
}

const lines = parseInt(getArg('--lines', '10000'), 10)
const rate = parseInt(getArg('--rate', '0'), 10)
const output = getArg('--output', path.join(process.cwd(), 'benchmark.log'))

const dir = path.dirname(output)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

fs.writeFileSync(output, '')

let written = 0
const start = Date.now()

function writeLine(n: number): void {
  const ts = new Date().toISOString()
  const level = n % 10 === 0 ? 'ERROR' : n % 5 === 0 ? 'WARN' : 'INFO'
  fs.appendFileSync(output, `${ts} ${level} Benchmark line ${n}\n`)
}

if (rate > 0) {
  console.log(`Generating ${lines} lines at ${rate}/s → ${output}`)
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
  console.log(`Writing ${lines} lines → ${output}`)
  for (let i = 0; i < lines; i++) {
    writeLine(i)
  }
  const elapsed = (Date.now() - start) / 1000
  console.log(`Done: ${lines} lines in ${elapsed.toFixed(1)}s`)
}

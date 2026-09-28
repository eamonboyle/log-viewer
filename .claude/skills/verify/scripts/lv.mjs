#!/usr/bin/env node
// Verification driver for Log Viewer. Launches an isolated build of the app
// (own profile dir, ephemeral CDP + inspector ports) and drives the renderer
// over the Chrome DevTools Protocol. Zero dependencies; needs Node >= 22.
//
//   node .claude/skills/verify/scripts/lv.mjs <command> [--run <id>] [options]
//
// Run `node .claude/skills/verify/scripts/lv.mjs help` for the command list.

import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const RUNS_DIR = path.join(REPO, '.verify')
const RENDERER_URL = pathToFileURL(path.join(REPO, 'out/renderer/index.html')).href
const IS_WIN = process.platform === 'win32'

const HELP = `Log Viewer verification driver

Lifecycle
  launch [--run <id>] [--no-build]   build, start an isolated instance, wait until ready
  doctor                             read-only health check of the run's instance
  stop                               kill the run's process tree, delete profile + fixtures, keep evidence
  runs                               list runs under .verify/ with live/stopped status

Fixtures (files live in .verify/<run>/fixtures/)
  fixture <name> [--lines N] [--tabs]    write N deterministic log lines, print absolute path
  append <name> [--lines N] [--text S]   append N more numbered lines, or one literal line S

Drive (renderer of the run's window; --target <id-prefix> when several windows exist)
  drop <file>                        drag-and-drop a file onto the window (opens it)
  click (--tab T | --title T | --text T | --placeholder T | --css S) [--nth K] [--button left|middle|right]
                                     --tab matches a file tab by label (app.log) or full path
  type <text> [--clear]              insert text into the focused element (--clear selects it first)
  key <combo>                        e.g. Ctrl+F, Ctrl+G, Enter, Shift+Enter, Escape, F3, F5, End
  scroll [--dy N] [locator]          mouse-wheel over the log viewport (negative dy = up)
  menu "<Top>><Item>[><Sub>]"        click an application-menu item, e.g. "View>Toggle Follow"
  wait (--status S | --text S | --js EXPR) [--timeout ms]
                                     --status: status bar contains S; --text: anywhere in the page

Observe
  snapshot [--out <name>.json]       structured UI state (tabs, status bar, rows, search, dialogs)
  screenshot [--out <name>.png]      PNG of the window, saved under evidence/
  eval <expr>                        read-only inspection; never use it to change app state
  targets                            list renderer windows with their open tabs

Locator values ending in * match by prefix, e.g. --placeholder "line or line:col*".
The run id comes from --run or the LV_RUN environment variable.`

// ---------- args ----------

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      positional.push(a)
      continue
    }
    const eq = a.indexOf('=')
    if (eq > -1) {
      flags[a.slice(2, eq)] = a.slice(eq + 1)
      continue
    }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) flags[a.slice(2)] = true
    else {
      flags[a.slice(2)] = next
      i++
    }
  }
  return { positional, flags }
}

class LvError extends Error {
  constructor(message, extra) {
    super(message)
    this.extra = extra
  }
}

function fail(message, extra) {
  throw new LvError(message, extra)
}

// ---------- run state ----------

function runDir(runId) {
  return path.join(RUNS_DIR, runId)
}

function statePath(runId) {
  return path.join(runDir(runId), 'state.json')
}

function readState(runId) {
  if (!runId) fail('no run id: pass --run <id> or set LV_RUN (see `runs`)')
  const file = statePath(runId)
  if (!fs.existsSync(file)) fail(`unknown run ${runId}: ${file} does not exist`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeState(state) {
  fs.writeFileSync(statePath(state.runId), JSON.stringify(state, null, 2))
}

function liveState(runId) {
  const state = readState(runId)
  if (state.stoppedAt) fail(`run ${runId} was stopped at ${state.stoppedAt}; launch a new run`)
  if (!pidAlive(state.pid)) fail(`run ${runId}: process ${state.pid} is not running; run \`stop\` then launch again`)
  return state
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

function evidenceDir(state) {
  const dir = path.join(runDir(state.runId), 'evidence')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function record(state, entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry })
  fs.appendFileSync(path.join(evidenceDir(state), 'actions.jsonl'), line + '\n')
}

function gitHead() {
  const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' })
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' })
  const changed = dirty.stdout ? dirty.stdout.trim().split('\n').filter(Boolean).length : 0
  return `${head.stdout.trim()}${changed ? ` (+${changed} uncommitted)` : ''}`
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function until(fn, timeoutMs, label) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeoutMs) {
    try {
      last = await fn()
      if (last) return last
    } catch (err) {
      last = err
    }
    await sleep(150)
  }
  fail(`timed out after ${timeoutMs}ms waiting for ${label}`, last instanceof Error ? last.message : undefined)
}

// ---------- CDP ----------

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error(`cannot connect to ${wsUrl}`))
  })
  let nextId = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    const waiter = msg.id !== undefined && pending.get(msg.id)
    if (!waiter) return
    pending.delete(msg.id)
    if (msg.error) waiter.reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`.trim()))
    else waiter.resolve(msg.result)
  }
  return {
    send(method, params = {}) {
      const id = ++nextId
      ws.send(JSON.stringify({ id, method, params }))
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    },
    close() {
      ws.close()
    }
  }
}

async function evaluate(client, expression) {
  const r = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  })
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  }
  return r.result.value
}

async function cdpJson(state, route) {
  const res = await fetch(`http://127.0.0.1:${state.cdpPort}${route}`)
  return res.json()
}

async function rendererTargets(state) {
  const list = await cdpJson(state, '/json/list')
  return list.filter((t) => t.type === 'page' && t.url === RENDERER_URL)
}

async function pageClient(state, flags) {
  const pages = await rendererTargets(state)
  let target
  if (flags.target) {
    target = pages.find((p) => p.id.startsWith(String(flags.target)))
    if (!target) fail(`no renderer target starts with ${flags.target}`, pages.map((p) => p.id))
  } else if (pages.length === 1) {
    target = pages[0]
  } else if (pages.length === 0) {
    fail('no renderer window found; is the app still loading? run `doctor`')
  } else {
    fail('several windows are open; pass --target <id-prefix> (see `targets`)', pages.map((p) => p.id))
  }
  const client = await connect(target.webSocketDebuggerUrl)
  // Input and focus behave as if the window were focused even when another app is in front.
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  client.targetId = target.id
  return client
}

async function mainClient(state) {
  if (!state.inspectUrl) fail('this run has no main-process inspector URL; relaunch it')
  return connect(state.inspectUrl)
}

// ---------- launch / doctor / stop ----------

function newRunId() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${stamp}-${crypto.randomBytes(2).toString('hex')}`
}

async function cmdLaunch(flags) {
  const runId = typeof flags.run === 'string' ? flags.run : newRunId()
  const dir = runDir(runId)
  if (fs.existsSync(statePath(runId))) fail(`run ${runId} already exists; pick another --run or omit it`)
  const profile = path.join(dir, 'profile')
  fs.mkdirSync(profile, { recursive: true })
  fs.mkdirSync(path.join(dir, 'fixtures'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true })

  if (!flags['no-build']) {
    const build = spawnSync('npm run build', { cwd: REPO, encoding: 'utf8', shell: true })
    fs.writeFileSync(path.join(dir, 'build.log'), `${build.stdout}\n${build.stderr}`)
    if (build.status !== 0) fail(`npm run build failed; see ${path.join(dir, 'build.log')}`, build.stderr.slice(-2000))
  }
  if (!fs.existsSync(path.join(REPO, 'out/main/index.js'))) fail('out/main/index.js missing; launch without --no-build')

  const electronExe = createRequire(path.join(REPO, 'package.json'))('electron')
  const env = { ...process.env }
  delete env.ELECTRON_RENDERER_URL // would point the window at a dev server
  delete env.ELECTRON_RUN_AS_NODE // would start Electron as plain Node
  const logFile = path.join(dir, 'app.log')
  const logFd = fs.openSync(logFile, 'a')
  // Without the occlusion/backgrounding switches, a window behind other apps is marked hidden
  // and stops rendering between driver commands, so snapshots would read half-applied UI state.
  const child = spawn(
    electronExe,
    [
      '--inspect=0',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--disable-features=CalculateNativeWinOcclusion',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      REPO
    ],
    { cwd: REPO, env, detached: true, windowsHide: true, stdio: ['ignore', logFd, logFd] }
  )
  child.unref()
  fs.closeSync(logFd)

  const state = {
    runId,
    pid: child.pid,
    profile,
    startedAt: new Date().toISOString(),
    gitHead: gitHead(),
    cdpPort: null,
    inspectUrl: null
  }
  writeState(state)

  try {
    await waitUntilReady(state, logFile)
  } catch (err) {
    err.message += `\nlaunch did not finish; clean up with: node .claude/skills/verify/scripts/lv.mjs stop --run ${runId} (app output: ${logFile})`
    throw err
  }
  record(state, { action: 'launch', pid: state.pid, cdpPort: state.cdpPort, gitHead: state.gitHead })
  console.log(JSON.stringify({ ready: true, run: runId, pid: state.pid, cdpPort: state.cdpPort, runDir: dir }, null, 2))
}

async function waitUntilReady(state, logFile) {
  const portFile = path.join(state.profile, 'DevToolsActivePort')
  state.cdpPort = await until(
    () => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]),
    30000,
    'DevToolsActivePort'
  )
  state.inspectUrl = await until(
    () => /Debugger listening on (ws:\/\/\S+)/.exec(fs.readFileSync(logFile, 'utf8'))?.[1],
    30000,
    'main-process inspector'
  )
  writeState(state)

  await until(
    async () => {
      const client = await pageClient(state, {})
      try {
        return await evaluate(client, `!!window.logViewer && document.readyState === 'complete' && document.body.innerText.includes('No file open')`)
      } finally {
        client.close()
      }
    },
    30000,
    'renderer to show the empty state'
  )
}

async function cmdDoctor(flags) {
  const state = readState(flags.run)
  const checks = []
  const check = (ok, name, detail) => checks.push({ ok, name, detail })

  check(!state.stoppedAt, 'run not stopped', state.stoppedAt ? `stopped at ${state.stoppedAt}` : state.runId)
  const alive = pidAlive(state.pid)
  check(alive, 'process alive', `pid ${state.pid}`)
  const portFile = path.join(state.profile, 'DevToolsActivePort')
  const filePort = fs.existsSync(portFile) ? Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]) : null
  check(filePort === state.cdpPort, 'CDP port matches this run\'s profile', `state ${state.cdpPort}, profile ${filePort}`)

  if (alive && filePort === state.cdpPort) {
    try {
      const version = await cdpJson(state, '/json/version')
      const browser = await connect(version.webSocketDebuggerUrl)
      const { processInfo } = await browser.send('SystemInfo.getProcessInfo')
      browser.close()
      const browserPid = processInfo.find((p) => p.type === 'browser')?.id
      check(browserPid === state.pid, 'port owned by this run\'s process', `browser pid ${browserPid}, ${version.Browser}`)

      const pages = await rendererTargets(state)
      check(pages.length > 0, 'built renderer loaded', `${pages.length} window(s) at ${RENDERER_URL}`)
      for (const page of pages) {
        const client = await connect(page.webSocketDebuggerUrl)
        const info = await evaluate(
          client,
          `({ bridge: typeof window.logViewer?.invoke === 'function', tabs: [...document.querySelectorAll('button[draggable][title]')].map(b => b.title) })`
        )
        client.close()
        check(info.bridge, `preload bridge in window ${page.id.slice(0, 8)}`, `open tabs: ${info.tabs.length ? info.tabs.join(', ') : 'none'}`)
      }
    } catch (err) {
      check(false, 'CDP reachable', err.message)
    }
  }

  const outMtime = fs.statSync(path.join(REPO, 'out/renderer/index.html')).mtimeMs
  const newestSource = newestMtime(['src', 'electron', 'shared', 'workers'].map((d) => path.join(REPO, d)))
  check(outMtime >= newestSource.mtime, 'build newer than sources', outMtime >= newestSource.mtime ? 'ok' : `stale: ${path.relative(REPO, newestSource.file)} changed after the last build; relaunch without --no-build`)
  check(outMtime <= Date.parse(state.startedAt), 'instance runs the build on disk', outMtime <= Date.parse(state.startedAt) ? 'ok' : 'out/ was rebuilt after launch; stop and relaunch')
  const head = gitHead()
  check(head === state.gitHead, 'git HEAD unchanged since launch', `launched at ${state.gitHead}, now ${head}`)

  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  —  ${c.detail}`)
  process.exit(checks.every((c) => c.ok) ? 0 : 1)
}

function newestMtime(dirs) {
  let best = { mtime: 0, file: '' }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (!entry.name.endsWith('.test.ts')) {
        const mtime = fs.statSync(full).mtimeMs
        if (mtime > best.mtime) best = { mtime, file: full }
      }
    }
  }
  dirs.filter((d) => fs.existsSync(d)).forEach(walk)
  return best
}

async function cmdStop(flags) {
  const state = readState(flags.run)
  if (pidAlive(state.pid)) {
    if (IS_WIN) spawnSync('taskkill', ['/PID', String(state.pid), '/T', '/F'], { encoding: 'utf8' })
    else {
      try {
        process.kill(-state.pid, 'SIGTERM')
      } catch {}
    }
    const start = Date.now()
    while (pidAlive(state.pid) && Date.now() - start < 10000) await sleep(200)
    if (pidAlive(state.pid) && !IS_WIN) process.kill(-state.pid, 'SIGKILL')
    if (pidAlive(state.pid)) fail(`process ${state.pid} survived teardown; inspect it manually`)
  }
  const dir = runDir(state.runId)
  for (const scratch of ['profile', 'fixtures']) {
    const target = path.join(dir, scratch)
    for (let attempt = 0; attempt < 20 && fs.existsSync(target); attempt++) {
      try {
        fs.rmSync(target, { recursive: true, force: true })
      } catch {
        await sleep(250) // Windows releases file handles shortly after the process exits
      }
    }
    if (fs.existsSync(target)) fail(`could not delete ${target}`)
  }
  state.stoppedAt = state.stoppedAt ?? new Date().toISOString()
  writeState(state)
  const evidence = path.join(dir, 'evidence')
  const files = fs.existsSync(evidence) ? fs.readdirSync(evidence) : []
  if (files.length === 0) fail(`stopped, but ${evidence} is empty or missing`)
  console.log(JSON.stringify({ stopped: state.runId, evidence, files }, null, 2))
}

function cmdRuns() {
  if (!fs.existsSync(RUNS_DIR)) return console.log('no runs')
  for (const id of fs.readdirSync(RUNS_DIR).sort()) {
    if (!fs.existsSync(statePath(id))) continue
    const s = JSON.parse(fs.readFileSync(statePath(id), 'utf8'))
    const status = s.stoppedAt ? 'stopped' : pidAlive(s.pid) ? 'LIVE' : 'dead (run stop)'
    console.log(`${id}  ${status}  pid ${s.pid}  cdp ${s.cdpPort}  ${s.gitHead}`)
  }
}

// ---------- fixtures ----------

function fixtureLine(n, tabs) {
  const ts = new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString()
  const level = n % 10 === 0 ? 'ERROR' : n % 5 === 0 ? 'WARN' : n % 3 === 0 ? 'DEBUG' : 'INFO'
  const source = n % 4 === 0 ? 'Microsoft.Hosting.Lifetime' : 'app.worker'
  const fields = [ts, level, source, `fixture line ${n}`]
  return fields.join(tabs ? '\t' : ' ')
}

function fixturePath(state, name) {
  if (!name) fail('fixture name required, e.g. `fixture app.log`')
  if (path.isAbsolute(name) || name.includes('..')) fail('fixture name must be a plain file name')
  return path.join(runDir(state.runId), 'fixtures', name)
}

function countLines(file) {
  const text = fs.readFileSync(file, 'utf8')
  return text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

function cmdFixture(name, flags) {
  const state = readState(flags.run)
  const file = fixturePath(state, name)
  const lines = Number(flags.lines ?? 100)
  const tabs = Boolean(flags.tabs)
  const body = Array.from({ length: lines }, (_, i) => fixtureLine(i + 1, tabs)).join('\n') + '\n'
  fs.writeFileSync(file, body)
  record(state, { action: 'fixture', file, lines, tabs })
  console.log(file)
}

function cmdAppend(name, flags) {
  const state = readState(flags.run)
  const file = fixturePath(state, name)
  if (!fs.existsSync(file)) fail(`${file} does not exist; create it with \`fixture ${name}\``)
  const before = countLines(file)
  let chunk
  if (typeof flags.text === 'string') chunk = flags.text + '\n'
  else {
    const tabs = fs.readFileSync(file, 'utf8').split('\n', 1)[0].includes('\t')
    const count = Number(flags.lines ?? 1)
    chunk = Array.from({ length: count }, (_, i) => fixtureLine(before + i + 1, tabs)).join('\n') + '\n'
  }
  fs.appendFileSync(file, chunk) // one write, so the tail engine sees one change
  const after = countLines(file)
  record(state, { action: 'append', file, before, after })
  console.log(JSON.stringify({ file, linesBefore: before, linesAfter: after }))
}

// ---------- drive ----------

function locatorFrom(flags) {
  const { tab, title, text, placeholder, css } = flags
  if (![tab, title, text, placeholder, css].some((v) => typeof v === 'string')) return null
  return { tab, title, text, placeholder, css, nth: flags.nth === undefined ? null : Number(flags.nth) }
}

// Resolves a locator in the page, scrolls the match into view if needed, returns its center.
function locateScript(locator) {
  return `(() => {
    const o = ${JSON.stringify(locator)};
    const eq = (actual, want) => actual != null && (want.endsWith('*') ? actual.startsWith(want.slice(0, -1)) : actual === want);
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    let els;
    if (o.css) els = [...document.querySelectorAll(o.css)];
    else if (o.tab) els = [...document.querySelectorAll('button[draggable][title]')].filter((b) => eq(b.title, o.tab) || eq(b.querySelector('span.truncate')?.innerText.trim(), o.tab));
    else if (o.title) els = [...document.querySelectorAll('[title]')].filter((e) => eq(e.getAttribute('title'), o.title));
    else if (o.placeholder) els = [...document.querySelectorAll('[placeholder]')].filter((e) => eq(e.getAttribute('placeholder'), o.placeholder));
    else {
      const all = [...document.querySelectorAll('body *')].filter((e) => eq(e.innerText?.trim(), o.text));
      els = all.filter((e) => !all.some((c) => c !== e && e.contains(c)));
    }
    els = els.filter(visible);
    const describe = (e) => e.tagName.toLowerCase() + (e.title ? '[title="' + e.title + '"]' : '') + ' "' + (e.innerText || e.value || '').trim().slice(0, 50) + '"';
    if (els.length === 0) return { error: 'no visible element matches ' + JSON.stringify(o) };
    if (o.nth === null && els.length > 1) return { error: els.length + ' elements match; pass --nth', matches: els.map(describe) };
    const el = els[o.nth ?? 0];
    if (!el) return { error: '--nth out of range', matches: els.map(describe) };
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, desc: describe(el) };
  })()`
}

async function locate(client, locator) {
  const found = await evaluate(client, locateScript(locator))
  if (found.error) fail(found.error, found.matches)
  return found
}

async function cmdClick(flags) {
  const state = liveState(flags.run)
  const locator = locatorFrom(flags)
  if (!locator) fail('click needs --tab, --title, --text, --placeholder or --css')
  const button = flags.button ?? 'left'
  const buttonsMask = { left: 1, right: 2, middle: 4 }[button]
  if (!buttonsMask) fail('--button must be left, middle or right')
  const client = await pageClient(state, flags)
  const { x, y, desc } = await locate(client, locator)
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: buttonsMask, clickCount: 1 })
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 })
  client.close()
  record(state, { action: 'click', locator, button, element: desc, target: client.targetId })
  console.log(`clicked ${desc}`)
}

async function cmdType(text, flags) {
  const state = liveState(flags.run)
  if (typeof text !== 'string') fail('type needs the text to insert')
  const client = await pageClient(state, flags)
  const focused = await evaluate(
    client,
    `(() => {
      const e = document.activeElement;
      const editable = e && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.isContentEditable);
      const desc = e && e !== document.body ? e.tagName.toLowerCase() + (e.placeholder ? '[placeholder="' + e.placeholder + '"]' : '') : 'body';
      return { editable, desc };
    })()`
  )
  if (!focused.editable) {
    client.close()
    fail(`focus is on ${focused.desc}, not an editable field; click the input first, e.g. click --placeholder "Find in file…"`)
  }
  if (flags.clear) await evaluate(client, `document.activeElement.select?.()`)
  await client.send('Input.insertText', { text })
  client.close()
  record(state, { action: 'type', text, into: focused.desc, clear: Boolean(flags.clear) })
  console.log(`typed ${JSON.stringify(text)} into ${focused.desc}`)
}

const NAMED_KEYS = {
  Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, Space: 32,
  End: 35, Home: 36, PageUp: 33, PageDown: 34,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117, F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123
}
const MODIFIER_BITS = { Alt: 1, Ctrl: 2, Control: 2, Meta: 4, Cmd: 4, Shift: 8 }

function keyEventFor(combo) {
  const parts = combo.split('+')
  const name = parts.pop()
  let modifiers = 0
  for (const m of parts) {
    if (!(m in MODIFIER_BITS)) fail(`unknown modifier ${m} in ${combo}`)
    modifiers |= MODIFIER_BITS[m]
  }
  const shift = (modifiers & 8) !== 0
  if (name in NAMED_KEYS) {
    const key = name === 'Space' ? ' ' : name
    const text = name === 'Enter' ? '\r' : name === 'Space' ? ' ' : undefined
    return { key, code: name === 'Space' ? 'Space' : name, windowsVirtualKeyCode: NAMED_KEYS[name], modifiers, text }
  }
  if (/^[a-z0-9]$/i.test(name)) {
    const upper = name.toUpperCase()
    const key = shift ? upper : name.toLowerCase()
    const code = /[0-9]/.test(name) ? `Digit${name}` : `Key${upper}`
    const printable = (modifiers & ~8) === 0
    return { key, code, windowsVirtualKeyCode: upper.charCodeAt(0), modifiers, text: printable ? key : undefined }
  }
  fail(`unsupported key ${name}; use a letter, digit, or one of ${Object.keys(NAMED_KEYS).join(', ')}`)
}

async function cmdKey(combo, flags) {
  const state = liveState(flags.run)
  if (typeof combo !== 'string') fail('key needs a combo, e.g. Ctrl+F')
  const ev = keyEventFor(combo)
  const client = await pageClient(state, flags)
  await client.send('Input.dispatchKeyEvent', { type: ev.text ? 'keyDown' : 'rawKeyDown', ...ev })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...ev, text: undefined })
  client.close()
  record(state, { action: 'key', combo })
  console.log(`pressed ${combo}`)
}

async function cmdScroll(flags) {
  const state = liveState(flags.run)
  const dy = Number(flags.dy ?? -600)
  const client = await pageClient(state, flags)
  const locator = locatorFrom(flags)
  const point = locator
    ? await locate(client, locator)
    : await evaluate(client, `(() => {
        const row = document.querySelector('[data-line-number]');
        const viewport = row?.parentElement?.parentElement;
        if (!viewport) return { error: 'no log rows rendered; open a file first' };
        const r = viewport.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, desc: 'log viewport' };
      })()`)
  if (point.error) fail(point.error)
  await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: point.x, y: point.y, deltaX: 0, deltaY: dy })
  await sleep(200)
  client.close()
  record(state, { action: 'scroll', dy, over: point.desc })
  console.log(`scrolled ${dy}px over ${point.desc}`)
}

async function cmdDrop(file, flags) {
  const state = liveState(flags.run)
  if (!file) fail('drop needs a file path')
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) fail(`${abs} does not exist`)
  const client = await pageClient(state, flags)
  const { w, h } = await evaluate(client, `({ w: window.innerWidth, h: window.innerHeight })`)
  const data = { items: [], files: [abs], dragOperationsMask: 1 }
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await client.send('Input.dispatchDragEvent', { type, x: w / 2, y: h / 2, data })
  }
  client.close()
  record(state, { action: 'drop', file: abs, target: client.targetId })
  console.log(`dropped ${abs}`)
}

async function cmdMenu(menuPath, flags) {
  const state = liveState(flags.run)
  if (typeof menuPath !== 'string') fail('menu needs a path such as "View>Toggle Follow"')
  const labels = menuPath.split('>').map((s) => s.trim())
  const client = await mainClient(state)
  const clicked = await evaluate(
    client,
    `(() => {
      const { Menu } = process.mainModule.require('electron');
      let items = Menu.getApplicationMenu().items;
      let item;
      for (const label of ${JSON.stringify(labels)}) {
        item = items.find((i) => i.label === label);
        if (!item) throw new Error('no menu item "' + label + '"; available: ' + items.map((i) => i.label || '---').join(' | '));
        items = item.submenu ? item.submenu.items : [];
      }
      if (item.submenu) throw new Error('"' + item.label + '" is a submenu; name one of its items');
      if (!item.enabled) throw new Error('"' + item.label + '" is disabled');
      item.click();
      return item.label;
    })()`
  )
  client.close()
  record(state, { action: 'menu', path: labels })
  console.log(`clicked menu ${labels.join(' > ')} (${clicked})`)
}

// Status bar text with whitespace collapsed, e.g. "C:\\x\\app.log · 108 lines · 6 KB New lines".
const STATUS_TEXT = `document.getElementById('root').firstElementChild.lastElementChild.innerText.replace(/\\s+/g, ' ')`

async function cmdWait(flags) {
  const state = liveState(flags.run)
  const timeout = Number(flags.timeout ?? 10000)
  let expr
  if (typeof flags.status === 'string') expr = `${STATUS_TEXT}.includes(${JSON.stringify(flags.status)})`
  else if (typeof flags.text === 'string') expr = `document.body.innerText.includes(${JSON.stringify(flags.text)})`
  else if (typeof flags.js === 'string') expr = flags.js
  else fail('wait needs --status, --text or --js')
  const client = await pageClient(state, flags)
  const start = Date.now()
  let value
  while (Date.now() - start < timeout) {
    value = await evaluate(client, expr).catch((err) => `error: ${err.message}`)
    if (value && !(typeof value === 'string' && value.startsWith('error: '))) {
      client.close()
      console.log(`ok after ${Date.now() - start}ms: ${JSON.stringify(value)}`)
      return
    }
    await sleep(100)
  }
  const body = await evaluate(client, `document.body.innerText.slice(0, 600)`)
  client.close()
  fail(`timed out after ${timeout}ms; last value ${JSON.stringify(value)}`, body)
}

// ---------- observe ----------

const SNAPSHOT_SCRIPT = `(() => {
  const clean = (s) => (s ?? '').replace(/\\s+/g, ' ').trim();
  const root = document.getElementById('root').firstElementChild;
  const [, toolbar, main, status] = root.children;
  const tabs = [...document.querySelectorAll('button[draggable][title]')].map((b) => ({
    label: clean(b.querySelector('span.truncate')?.innerText),
    path: b.title,
    active: !!b.querySelector('span.h-px.bg-primary'),
    indicator: b.querySelector('span[title="Live"], span[title="New lines"]')?.title ?? null
  }));
  const rowEls = [...document.querySelectorAll('[data-line-number]')];
  const viewportRect = rowEls[0]?.parentElement.parentElement.getBoundingClientRect();
  const rows = rowEls
    .map((r) => {
      const spans = r.firstElementChild.querySelectorAll(':scope > span');
      const rect = r.getBoundingClientRect();
      const onScreen = rect.bottom > viewportRect.top + 1 && rect.top < viewportRect.bottom - 1;
      return { line: Number(r.dataset.lineNumber) + 1, onScreen, text: spans[spans.length - 1]?.innerText ?? '' };
    })
    .sort((a, b) => a.line - b.line);
  const onScreen = rows.filter((r) => r.onScreen);
  const searchInput = document.querySelector('input[placeholder="Find in file…"]');
  const gotoInput = document.querySelector('input[placeholder^="line or line:col"]');
  const switches = [...document.querySelectorAll('[role="switch"]')].map((s) => ({
    label: clean(s.closest('label')?.innerText),
    checked: s.getAttribute('aria-checked') === 'true'
  }));
  const toolbarOnly = toolbar.cloneNode(true);
  toolbarOnly.querySelectorAll('.fixed').forEach((dialog) => dialog.remove());
  const sidebar = main.querySelector('.w-48');
  return {
    windowTitle: document.title,
    theme: document.documentElement.dataset.theme ?? 'dark',
    tabs,
    toolbar: { switches, text: clean(toolbarOnly.textContent) },
    status: clean(status.innerText),
    search: searchInput ? { query: searchInput.value, count: clean(searchInput.parentElement.nextElementSibling?.innerText) } : null,
    goToLine: gotoInput ? { line: gotoInput.value, placeholder: gotoInput.placeholder } : null,
    dialogs: [...document.querySelectorAll('.fixed.inset-0 h2')].map((h) => clean(h.innerText)),
    sidebar: sidebar ? clean(sidebar.innerText) : null,
    emptyState: main.innerText.includes('No file open'),
    filterEmpty: main.innerText.includes('No lines match the current filters.'),
    rows: {
      rendered: rows.length,
      visibleFirst: onScreen[0]?.line ?? null,
      visibleLast: onScreen[onScreen.length - 1]?.line ?? null,
      lines: rows.map(({ line, onScreen, text }) => (onScreen ? { line, text } : { line, text, overscan: true }))
    }
  };
})()`

async function cmdSnapshot(flags) {
  const state = liveState(flags.run)
  const client = await pageClient(state, flags)
  const snap = await evaluate(client, SNAPSHOT_SCRIPT)
  client.close()
  const json = JSON.stringify(snap, null, 2)
  if (typeof flags.out === 'string') {
    const file = path.join(evidenceDir(state), path.basename(flags.out))
    fs.writeFileSync(file, json)
    record(state, { action: 'snapshot', file })
    console.error(`saved ${file}`)
  }
  console.log(json)
}

async function cmdScreenshot(flags) {
  const state = liveState(flags.run)
  const client = await pageClient(state, flags)
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' })
  client.close()
  const name = typeof flags.out === 'string' ? path.basename(flags.out) : `${Date.now()}.png`
  const file = path.join(evidenceDir(state), name.endsWith('.png') ? name : `${name}.png`)
  fs.writeFileSync(file, Buffer.from(data, 'base64'))
  record(state, { action: 'screenshot', file })
  console.log(file)
}

async function cmdEval(expr, flags) {
  const state = liveState(flags.run)
  if (typeof expr !== 'string') fail('eval needs an expression')
  const client = await pageClient(state, flags)
  const value = await evaluate(client, expr)
  client.close()
  console.log(JSON.stringify(value, null, 2))
}

async function cmdTargets(flags) {
  const state = liveState(flags.run)
  for (const page of await rendererTargets(state)) {
    const client = await connect(page.webSocketDebuggerUrl)
    const tabs = await evaluate(client, `[...document.querySelectorAll('button[draggable][title]')].map((b) => b.title)`)
    client.close()
    console.log(`${page.id}  tabs: ${tabs.length ? tabs.join(', ') : '(none)'}`)
  }
}

// ---------- main ----------

const { positional, flags } = parseArgs(process.argv.slice(2))
flags.run = flags.run ?? process.env.LV_RUN
const [command, arg] = positional

const commands = {
  launch: () => cmdLaunch(flags),
  doctor: () => cmdDoctor(flags),
  stop: () => cmdStop(flags),
  runs: () => cmdRuns(),
  fixture: () => cmdFixture(arg, flags),
  append: () => cmdAppend(arg, flags),
  drop: () => cmdDrop(arg, flags),
  click: () => cmdClick(flags),
  type: () => cmdType(arg, flags),
  key: () => cmdKey(arg, flags),
  scroll: () => cmdScroll(flags),
  menu: () => cmdMenu(arg, flags),
  wait: () => cmdWait(flags),
  snapshot: () => cmdSnapshot(flags),
  screenshot: () => cmdScreenshot(flags),
  eval: () => cmdEval(arg, flags),
  targets: () => cmdTargets(flags),
  help: () => console.log(HELP)
}

if (!command || !commands[command]) {
  console.log(HELP)
  process.exit(command ? 1 : 0)
}
try {
  await commands[command]()
} catch (err) {
  console.error(`lv ${command}: ${err.message}`)
  if (err.extra !== undefined) console.error(typeof err.extra === 'string' ? err.extra : JSON.stringify(err.extra, null, 2))
  process.exit(1)
}

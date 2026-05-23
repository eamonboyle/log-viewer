import { spawn } from 'child_process'
import type { SearchMatch, SearchOptions, SearchState } from '@shared/types'
import { DEFAULT_SEARCH_OPTIONS } from '@shared/types'

let rgPathPromise: Promise<string> | null = null

async function getRgPath(): Promise<string> {
  if (!rgPathPromise) {
    rgPathPromise = import('@vscode/ripgrep').then((m) => m.rgPath)
  }
  return rgPathPromise
}

interface RipgrepMatchLine {
  type: 'match'
  data: {
    path: { text: string }
    lines: { text: string }
    line_number: number
    absolute_offset: number
    submatches: { match: { text: string }; start: number; end: number }[]
  }
}

interface ActiveSearch {
  query: string
  options: SearchOptions
  matches: SearchMatch[]
  currentIndex: number
  fileSizeAtSearch: number
  stale: boolean
  abortController: AbortController | null
}

export class SearchService {
  private active: ActiveSearch | null = null

  getState(): SearchState | null {
    if (!this.active) return null
    return this.toState(this.active)
  }

  cancel(): void {
    if (this.active?.abortController) {
      this.active.abortController.abort()
    }
    this.active = null
  }

  markStale(): void {
    if (this.active) {
      this.active.stale = true
    }
  }

  updateFileSize(fileSize: number): boolean {
    if (!this.active || this.active.stale) return false
    if (fileSize > this.active.fileSizeAtSearch) {
      this.active.stale = true
      return true
    }
    return false
  }

  async query(
    filePath: string,
    query: string,
    options: SearchOptions,
    fileSize: number
  ): Promise<SearchState> {
    this.cancel()

    if (!query) {
      this.active = null
      return {
        query: '',
        options,
        matches: [],
        currentIndex: -1,
        total: 0,
        stale: false,
        fileSizeAtSearch: fileSize
      }
    }

    const abortController = new AbortController()
    this.active = {
      query,
      options,
      matches: [],
      currentIndex: -1,
      fileSizeAtSearch: fileSize,
      stale: false,
      abortController
    }

    try {
      const matches = await this.runRipgrep(filePath, query, options, abortController.signal)
      if (abortController.signal.aborted) {
        return this.toState(this.active!)
      }

      this.active.matches = matches
      this.active.currentIndex = matches.length > 0 ? 0 : -1
      this.active.abortController = null
      return { ...this.toState(this.active), error: null }
    } catch (err) {
      if (abortController.signal.aborted) {
        return this.toState(this.active!)
      }
      const message = err instanceof Error ? err.message : String(err)
      this.active.matches = []
      this.active.currentIndex = -1
      this.active.abortController = null
      return { ...this.toState(this.active), error: message }
    }
  }

  next(): SearchState | null {
    if (!this.active || this.active.matches.length === 0) return this.getState()
    this.active.currentIndex = (this.active.currentIndex + 1) % this.active.matches.length
    return this.toState(this.active)
  }

  prev(): SearchState | null {
    if (!this.active || this.active.matches.length === 0) return this.getState()
    const len = this.active.matches.length
    this.active.currentIndex = (this.active.currentIndex - 1 + len) % len
    return this.toState(this.active)
  }

  private toState(active: ActiveSearch): SearchState {
    return {
      query: active.query,
      options: active.options,
      matches: active.matches,
      currentIndex: active.currentIndex,
      total: active.matches.length,
      stale: active.stale,
      fileSizeAtSearch: active.fileSizeAtSearch
    }
  }

  private async runRipgrep(
    filePath: string,
    query: string,
    options: SearchOptions,
    signal: AbortSignal
  ): Promise<SearchMatch[]> {
    const rgPath = await getRgPath()

    return new Promise((resolve, reject) => {
      const args = ['--json', '--line-number', '--no-heading', '--no-messages']

      if (!options.caseSensitive) args.push('-i')
      if (options.wholeWord) args.push('-w')
      if (options.isRegex) {
        args.push('--regexp', query)
      } else {
        args.push('--fixed-strings', query)
      }

      args.push('--', filePath)

      const proc = spawn(rgPath, args, { windowsHide: true })
      const matches: SearchMatch[] = []
      let buffer = ''

      const cleanup = (): void => {
        signal.removeEventListener('abort', onAbort)
      }

      const onAbort = (): void => {
        proc.kill()
        cleanup()
        resolve([])
      }

      if (signal.aborted) {
        resolve([])
        return
      }
      signal.addEventListener('abort', onAbort)

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const parsed = JSON.parse(line) as RipgrepMatchLine
            if (parsed.type !== 'match') continue

            const lineNumber = parsed.data.line_number - 1
            for (const sub of parsed.data.submatches) {
              matches.push({
                lineNumber,
                column: sub.start,
                length: sub.end - sub.start
              })
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg && !msg.includes('PCRE2') && proc.exitCode === null) {
          // regex errors surface on stderr; ignore until process exits
        }
      })

      proc.on('error', (err) => {
        cleanup()
        reject(err)
      })

      proc.on('close', (code) => {
        cleanup()

        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer) as RipgrepMatchLine
            if (parsed.type === 'match') {
              const lineNumber = parsed.data.line_number - 1
              for (const sub of parsed.data.submatches) {
                matches.push({
                  lineNumber,
                  column: sub.start,
                  length: sub.end - sub.start
                })
              }
            }
          } catch {
            // ignore
          }
        }

        if (signal.aborted) {
          resolve([])
          return
        }

        // rg exit code 1 = no matches, 2 = error (e.g. invalid regex)
        if (code === 2) {
          resolve([])
          return
        }

        resolve(matches)
      })
    })
  }
}

export { DEFAULT_SEARCH_OPTIONS }

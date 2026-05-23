import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatLineCount(n: number): string {
  return n.toLocaleString()
}

/** Compress virtual scroll range for huge line counts */
export function compressScrollPosition(lineNumber: number, totalLines: number, rowHeight: number): number {
  if (totalLines <= 100_000) return lineNumber * rowHeight
  const scale = 100_000 / totalLines
  return lineNumber * rowHeight * scale
}

export function decompressScrollPosition(scrollTop: number, totalLines: number, rowHeight: number): number {
  if (totalLines <= 100_000) return Math.floor(scrollTop / rowHeight)
  const scale = 100_000 / totalLines
  return Math.floor(scrollTop / (rowHeight * scale))
}

export function getVirtualTotalSize(totalLines: number, rowHeight: number): number {
  if (totalLines <= 100_000) return totalLines * rowHeight
  return 100_000 * rowHeight
}

export function getEffectiveRowHeight(totalLines: number, rowHeight: number): number {
  if (totalLines <= 100_000) return rowHeight
  return rowHeight * (100_000 / totalLines)
}

export function isCompressedScroll(totalLines: number): boolean {
  return totalLines > 100_000
}

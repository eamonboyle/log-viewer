/** Simple glob match — supports * and ? only */
export function matchGlob(pattern: string, path: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/')
  const normalizedPattern = pattern.replace(/\\/g, '/')
  const regex = new RegExp(
    '^' +
      normalizedPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$',
    'i'
  )
  const name = normalizedPath.split('/').pop() ?? normalizedPath
  return regex.test(name) || regex.test(normalizedPath)
}

export function filterRulesForPath<T extends { filePattern?: string }>(
  rules: T[],
  filePath: string | undefined
): T[] {
  if (!filePath) return rules
  return rules.filter((rule) => !rule.filePattern || matchGlob(rule.filePattern, filePath))
}

export function folderParentCycles(
  folderId: string,
  nextParentId: string | null,
  parentById: ReadonlyMap<string, string | null>,
): boolean {
  if (!nextParentId) return false
  let current: string | null = nextParentId
  const seen = new Set<string>()
  while (current) {
    if (current === folderId || seen.has(current)) return true
    seen.add(current)
    current = parentById.get(current) ?? null
  }
  return false
}

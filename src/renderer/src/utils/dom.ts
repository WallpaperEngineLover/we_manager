// keyboard shortcuts must not fire while the user types into a field
export function isEditingText(): boolean {
  const active = document.activeElement
  return !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
}

const RANGE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])

export function isRangeKey(key: string): boolean {
  return RANGE_KEYS.has(key)
}

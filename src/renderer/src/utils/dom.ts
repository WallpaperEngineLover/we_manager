// keyboard shortcuts must not fire while the user types into a field
export function isEditingText(): boolean {
  const active = document.activeElement
  return !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
}

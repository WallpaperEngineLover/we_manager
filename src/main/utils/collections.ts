export function findAndMutate<T extends { id: string }>(
  items: T[],
  id: string,
  mutate: (item: T) => void | false
): T | null {
  const item = items.find((i) => i.id === id)
  if (!item) return null
  if (mutate(item) === false) return null
  return item
}

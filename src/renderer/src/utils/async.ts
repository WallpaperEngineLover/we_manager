export async function forEachIgnoringErrors<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>
): Promise<void> {
  for (const item of items) {
    try {
      await fn(item)
    } catch {}
  }
}

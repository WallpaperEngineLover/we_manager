// Runs concurrently so one slow/stuck item (e.g. a wallpaper folder on an unresponsive mount)
// can't stall the rest of the batch behind it.
export async function forEachIgnoringErrors<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>
): Promise<void> {
  await Promise.allSettled(items.map((item) => fn(item)))
}

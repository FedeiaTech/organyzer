import type { Board } from './groups'

// "Last seen" marks live on this device only. They store the board's own
// last-edit timestamp (not the local clock), so clock differences never matter.
const key = (uid: string, boardId: string) => `organyzer.seen.${uid}.${boardId}`

export function getSeen(uid: string, boardId: string): number | null {
  try {
    const v = localStorage.getItem(key(uid, boardId))
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}

export function setSeen(uid: string, boardId: string, stamp: number) {
  try {
    localStorage.setItem(key(uid, boardId), String(stamp))
  } catch {
    // storage unavailable (private mode / quota): the dot just won't persist
  }
}

export const boardStamp = (b: Board): number | null =>
  (b.updatedAt ?? b.createdAt)?.toMillis() ?? null

// A board has news when someone else edited it after what this device last saw.
// A board never seen on this device is first recorded as seen (see GroupPage).
export function hasNews(b: Board, uid: string): boolean {
  const stamp = boardStamp(b)
  const seen = getSeen(uid, b.id)
  return stamp !== null && seen !== null && b.updatedBy !== uid && stamp > seen
}

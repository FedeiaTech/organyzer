import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { touchBoard } from './groups'
import { IMAGE_QUOTA_CHARS, MAX_IMAGE_CHARS } from './usage'

export const COLORS = ['none', 'yellow', 'green', 'blue', 'pink', 'purple', 'orange'] as const
export type ItemColor = (typeof COLORS)[number]

export interface Task {
  id: string
  text: string
  done: boolean
}

// Optional look-and-feel and ordering fields shared by every item type.
export interface ItemStyle {
  color?: ItemColor
  span?: 1 | 2 | 3
  fontSize?: 's' | 'm' | 'l'
  header?: boolean
  // Manual position. Items without it fall back to their creation time.
  order?: number
  createdAt?: Timestamp
}

export type Item = (
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'image'; src: string }
  | { id: string; type: 'table'; cols: number; cells: string[] }
  | { id: string; type: 'checklist'; tasks: Task[]; title?: string }
  | { id: string; type: 'link'; url: string; title?: string }
) &
  ItemStyle

// Images are not here on purpose: they go through addImageItem, which also charges the quota.
type NewItem =
  | { type: 'text'; text: string }
  | { type: 'table'; cols: number; cells: string[] }
  | { type: 'checklist'; tasks: Task[]; title?: string }
  | { type: 'link'; url: string; title?: string }

const itemsCol = (groupId: string, boardId: string) =>
  collection(db, 'groups', groupId, 'boards', boardId, 'items')

export const itemKey = (i: Item): number =>
  i.order ?? i.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER

export function watchItems(groupId: string, boardId: string, cb: (items: Item[]) => void) {
  const q = query(itemsCol(groupId, boardId), orderBy('createdAt'))
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(
      (d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Item,
    )
    cb(items.sort((a, b) => itemKey(a) - itemKey(b)))
  })
}

export async function addItem(groupId: string, boardId: string, item: NewItem, uid: string) {
  await addDoc(itemsCol(groupId, boardId), { ...item, authorId: uid, createdAt: serverTimestamp() })
  await touchBoard(groupId, boardId)
}

export class QuotaError extends Error {}

// Adds an image and charges its size to the uploader's lifetime quota in ONE transaction.
// The security rules check the same counter, so skipping this function cannot bypass the cap.
export async function addImageItem(groupId: string, boardId: string, src: string, uid: string) {
  await runTransaction(db, async (tx) => {
    const usageRef = doc(db, 'usage', uid)
    const snap = await tx.get(usageRef)
    const used = snap.exists() ? Number(snap.data().imageBytes) || 0 : 0
    const next = used + src.length
    if (next > IMAGE_QUOTA_CHARS) throw new QuotaError('quota')
    const itemRef = doc(itemsCol(groupId, boardId))
    // lastImageId ties this counter increase to exactly one image (checked by the rules).
    tx.set(usageRef, { imageBytes: next, lastImageId: itemRef.id })
    tx.set(itemRef, {
      type: 'image',
      src,
      authorId: uid,
      createdAt: serverTimestamp(),
    })
  })
  await touchBoard(groupId, boardId)
}

export async function updateItem(
  groupId: string,
  boardId: string,
  itemId: string,
  data: Record<string, unknown>,
) {
  await updateDoc(doc(db, 'groups', groupId, 'boards', boardId, 'items', itemId), data)
  await touchBoard(groupId, boardId)
}

export async function removeItem(groupId: string, boardId: string, itemId: string) {
  await deleteDoc(doc(db, 'groups', groupId, 'boards', boardId, 'items', itemId))
  await touchBoard(groupId, boardId)
}

// Position for an item dropped between two neighbours (either may be missing).
export function orderBetween(prev?: Item, next?: Item): number {
  if (prev && next) return (itemKey(prev) + itemKey(next)) / 2
  if (next) return itemKey(next) - 1000
  if (prev) return itemKey(prev) + 1000
  return Date.now()
}

// Resize in the browser and keep lowering quality (then size) until the data URL fits
// the per-image limit, so it also stays well under Firestore's 1 MiB document limit.
export function fileToResizedDataUrl(file: File, maxSize = 800, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const render = (size: number, q: number) => {
        const scale = Math.min(1, size / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')!
        // JPEG has no transparency: paint white first so transparent PNGs do not turn black.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/jpeg', q)
      }

      let size = maxSize
      let q = quality
      let out = render(size, q)
      while (out.length > MAX_IMAGE_CHARS && (q > 0.45 || size > 320)) {
        if (q > 0.45) q = Math.round((q - 0.1) * 100) / 100
        else size = Math.round(size * 0.8)
        out = render(size, q)
      }
      if (out.length > MAX_IMAGE_CHARS) reject(new Error('Image too large'))
      else resolve(out)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read image'))
    }
    img.src = objectUrl
  })
}

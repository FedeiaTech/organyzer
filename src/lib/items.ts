import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { touchBoard } from './groups'

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

type NewItem =
  | { type: 'text'; text: string }
  | { type: 'image'; src: string }
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

// Resize in the browser so the data URL stays well under Firestore's 1 MiB doc limit.
export function fileToResizedDataUrl(file: File, maxSize = 800, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      // JPEG has no transparency: paint white first so transparent PNGs do not turn black.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })
}

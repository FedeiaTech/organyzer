import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { auth, db } from './firebase'

export type Role = 'admin' | 'guest'

export interface Profile {
  name: string
  photoURL: string
}

export interface Group {
  id: string
  name: string
  ownerId: string
  memberIds: string[]
  // Older groups may not have these maps yet.
  roles?: Record<string, Role>
  profiles?: Record<string, Profile>
}

export interface Board {
  id: string
  name: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  updatedBy?: string
}

// The creator is always an admin; anyone without an explicit role is a guest.
export function roleOf(group: Group, uid: string): Role {
  if (uid === group.ownerId) return 'admin'
  return group.roles?.[uid] === 'admin' ? 'admin' : 'guest'
}

export const profileOf = (u: User): Profile => ({
  name: u.displayName ?? '',
  photoURL: u.photoURL ?? '',
})

export function watchMyGroups(uid: string, cb: (groups: Group[]) => void) {
  const q = query(collection(db, 'groups'), where('memberIds', 'array-contains', uid))
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Group, 'id'>) }))),
  )
}

export async function createGroup(name: string, user: User) {
  const ref = await addDoc(collection(db, 'groups'), {
    name,
    ownerId: user.uid,
    memberIds: [user.uid],
    roles: { [user.uid]: 'admin' },
    profiles: { [user.uid]: profileOf(user) },
    createdAt: serverTimestamp(),
  })
  return ref.id
}

// The group id doubles as the invite code (Firestore auto IDs are unguessable).
export async function joinGroup(groupId: string, user: User) {
  const ref = doc(db, 'groups', groupId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Invalid invite code')
  // Already a member (for example the creator pasting their own code): nothing to write.
  if ((snap.data().memberIds as string[]).includes(user.uid)) return
  await updateDoc(ref, {
    memberIds: arrayUnion(user.uid),
    [`roles.${user.uid}`]: 'guest',
    [`profiles.${user.uid}`]: profileOf(user),
  })
}

// Keeps the member's name / photo up to date (and fills it in for older groups).
export async function syncMyProfile(groupId: string, user: User) {
  await updateDoc(doc(db, 'groups', groupId), { [`profiles.${user.uid}`]: profileOf(user) })
}

export async function setMemberRole(groupId: string, uid: string, role: Role) {
  await updateDoc(doc(db, 'groups', groupId), { [`roles.${uid}`]: role })
}

export async function removeMember(groupId: string, uid: string) {
  await updateDoc(doc(db, 'groups', groupId), {
    memberIds: arrayRemove(uid),
    [`roles.${uid}`]: deleteField(),
    [`profiles.${uid}`]: deleteField(),
  })
}

export function watchGroup(groupId: string, cb: (group: Group | null) => void) {
  return onSnapshot(
    doc(db, 'groups', groupId),
    (d) => cb(d.exists() ? { id: d.id, ...(d.data() as Omit<Group, 'id'>) } : null),
    () => cb(null),
  )
}

export function watchBoards(groupId: string, cb: (boards: Board[]) => void) {
  const q = query(collection(db, 'groups', groupId, 'boards'), orderBy('createdAt'))
  return onSnapshot(q, (snap) =>
    cb(
      snap.docs.map(
        (d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Board,
      ),
    ),
  )
}

export async function renameGroup(groupId: string, name: string) {
  await updateDoc(doc(db, 'groups', groupId), { name })
}

export function watchBoard(groupId: string, boardId: string, cb: (board: Board | null) => void) {
  return onSnapshot(
    doc(db, 'groups', groupId, 'boards', boardId),
    (d) =>
      cb(
        d.exists()
          ? ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) } as Board)
          : null,
      ),
    () => cb(null),
  )
}

export async function renameBoard(groupId: string, boardId: string, name: string) {
  await updateDoc(doc(db, 'groups', groupId, 'boards', boardId), {
    name,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser!.uid,
  })
}

// Stamps the board with the time and author of the latest edit. Best effort:
// a failed stamp must never block the edit itself.
export async function touchBoard(groupId: string, boardId: string) {
  const uid = auth.currentUser?.uid
  if (!uid) return
  await updateDoc(doc(db, 'groups', groupId, 'boards', boardId), {
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  }).catch(() => {})
}

// Firestore does not cascade deletes, so the items go first and the board last.
export async function deleteBoard(groupId: string, boardId: string) {
  const items = await getDocs(collection(db, 'groups', groupId, 'boards', boardId, 'items'))
  for (let i = 0; i < items.docs.length; i += 400) {
    const batch = writeBatch(db)
    items.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  await deleteDoc(doc(db, 'groups', groupId, 'boards', boardId))
}

// Creates the board and its starting items (from a template) in one atomic batch.
// Items get an explicit `order` so they keep the template's sequence.
export async function createBoard(
  groupId: string,
  name: string,
  items: Record<string, unknown>[] = [],
) {
  const boardRef = doc(collection(db, 'groups', groupId, 'boards'))
  const batch = writeBatch(db)
  batch.set(boardRef, { name, createdAt: serverTimestamp() })
  const base = Date.now()
  items.forEach((item, i) =>
    batch.set(doc(collection(boardRef, 'items')), {
      ...item,
      authorId: auth.currentUser!.uid,
      order: base + i,
      createdAt: serverTimestamp(),
    }),
  )
  await batch.commit()
}

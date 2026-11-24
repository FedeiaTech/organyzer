import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from './firebase'

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
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Board, 'id'>) }))),
  )
}

export async function createBoard(groupId: string, name: string) {
  await addDoc(collection(db, 'groups', groupId, 'boards'), {
    name,
    createdAt: serverTimestamp(),
  })
}

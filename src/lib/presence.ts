import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'

export const HEARTBEAT_MS = 60_000
// A member counts as online if their last heartbeat is newer than this.
export const ONLINE_WINDOW_MS = 2 * 60_000

// While the app is visible, stamp "last seen" in the group once a minute.
export function usePresenceHeartbeat(groupId: string, uid: string) {
  useEffect(() => {
    const ref = doc(db, 'groups', groupId, 'presence', uid)
    const beat = () => {
      if (document.visibilityState === 'visible') {
        setDoc(ref, { lastSeen: serverTimestamp() }).catch(() => {})
      }
    }
    beat()
    const id = setInterval(beat, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', beat)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [groupId, uid])
}

// Last-seen time (ms) of every member who has one, plus a clock that ticks so
// "online" status keeps refreshing without new data arriving.
export function usePresence(groupId: string) {
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({})
  const [now, setNow] = useState(() => Date.now())

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'groups', groupId, 'presence'),
        (snap) => {
          const next: Record<string, number> = {}
          snap.docs.forEach((d) => {
            const ts = d.data({ serverTimestamps: 'estimate' }).lastSeen
            if (ts) next[d.id] = ts.toMillis()
          })
          setLastSeen(next)
        },
        () => setLastSeen({}),
      ),
    [groupId],
  )

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  return { lastSeen, now }
}

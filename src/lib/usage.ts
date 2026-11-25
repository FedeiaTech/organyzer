import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'

// Image data is stored as base64 text inside Firestore, so limits are counted in characters.
// These numbers must match the ones in firestore.rules.
export const MAX_IMAGE_CHARS = 400_000 // per image
export const IMAGE_QUOTA_CHARS = 30_000_000 // per person, lifetime uploads (about 30 MB)

// How much of their image quota the signed-in user has already used.
export function useImageUsage(uid: string) {
  const [used, setUsed] = useState(0)
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'usage', uid),
        (d) => setUsed(d.exists() ? Number(d.data().imageBytes) || 0 : 0),
        () => setUsed(0),
      ),
    [uid],
  )
  return used
}

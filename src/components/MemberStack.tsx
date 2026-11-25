import type { Group, Profile } from '../lib/groups'

// A member's photo, or their initial when there is no photo yet.
export function Avatar({ profile, small }: { profile?: Profile; small?: boolean }) {
  const cls = `mini-avatar${small ? ' small' : ''}`
  if (profile?.photoURL) {
    return <img className={cls} src={profile.photoURL} alt="" referrerPolicy="no-referrer" />
  }
  const initial = profile?.name?.trim().charAt(0).toUpperCase() || '?'
  return <span className={`${cls} fallback`} aria-hidden="true">{initial}</span>
}

// Overlapping miniatures of the first members, with "+N" for the rest.
export default function MemberStack({ group, max = 3 }: { group: Group; max?: number }) {
  const shown = group.memberIds.slice(0, max)
  const extra = group.memberIds.length - shown.length
  return (
    <span className="stack" aria-hidden="true">
      {shown.map((id) => (
        <Avatar key={id} profile={group.profiles?.[id]} small />
      ))}
      {extra > 0 && <span className="mini-avatar small stack-more">+{extra}</span>}
    </span>
  )
}

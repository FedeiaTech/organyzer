import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useI18n } from '../lib/i18n'
import {
  createBoard,
  profileOf,
  removeMember,
  roleOf,
  setMemberRole,
  syncMyProfile,
  watchBoards,
  watchGroup,
  type Board,
  type Group,
  type Role,
} from '../lib/groups'

export default function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { user } = useAuth()
  const { t } = useI18n()
  const [group, setGroup] = useState<Group | null | undefined>(undefined)
  const [boards, setBoards] = useState<Board[]>([])
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => watchGroup(groupId!, setGroup), [groupId])
  useEffect(() => watchBoards(groupId!, setBoards), [groupId])

  // Keep my name / photo in the group up to date (also fills it for older groups).
  const mine = group?.profiles?.[user!.uid]
  const me = profileOf(user!)
  const needsSync = !!group && group.memberIds.includes(user!.uid) && (mine?.name !== me.name || mine?.photoURL !== me.photoURL)
  useEffect(() => {
    if (needsSync) syncMyProfile(groupId!, user!).catch(() => {})
  }, [needsSync, groupId, user])

  async function run(action: () => Promise<void>) {
    setError('')
    try {
      await action()
    } catch {
      setError(t('actionFailed'))
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await run(() => createBoard(groupId!, name.trim()))
    setName('')
  }

  async function copyCode() {
    await navigator.clipboard.writeText(groupId!)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (group === undefined) return <div className="page">{t('loading')}</div>
  if (group === null) {
    return (
      <div className="page">
        <Link to="/">{t('back')}</Link>
        <p>{t('groupNotFound')}</p>
      </div>
    )
  }

  const isAdmin = roleOf(group, user!.uid) === 'admin'
  const members = t(group.memberIds.length === 1 ? 'members_one' : 'members_other', { n: group.memberIds.length })

  return (
    <div className="page">
      <header className="bar">
        <Link to="/">{t('backToGroups')}</Link>
        <button className="ghost" onClick={copyCode}>{copied ? t('copied') : t('copyInvite')}</button>
      </header>

      <h1>{group.name}</h1>
      <button className="link" aria-expanded={showMembers} onClick={() => setShowMembers((s) => !s)}>
        {members}
      </button>

      {showMembers && (
        <section className="members" aria-label={t('membersTitle')}>
          <h2>{t('membersTitle')}</h2>
          <ul className="cards">
            {group.memberIds.map((id) => {
              const profile = group.profiles?.[id]
              const label = profile?.name || t('unnamed')
              const role = roleOf(group, id)
              const isCreator = id === group.ownerId
              const canManage = isAdmin && !isCreator
              return (
                <li key={id}>
                  <span className="member">
                    {profile?.photoURL ? (
                      <img className="mini-avatar" src={profile.photoURL} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="mini-avatar fallback">{label.charAt(0).toUpperCase()}</span>
                    )}
                    <span>
                      {label} {id === user!.uid && <small className="muted">{t('you')}</small>}
                    </span>
                  </span>
                  <span className="member-actions">
                    {isCreator && <small className="muted">{t('creator')}</small>}
                    {canManage ? (
                      <>
                        <select
                          value={role}
                          aria-label={t('role_admin') + ' / ' + t('role_guest')}
                          onChange={(e) => run(() => setMemberRole(group.id, id, e.target.value as Role))}
                        >
                          <option value="admin">{t('role_admin')}</option>
                          <option value="guest">{t('role_guest')}</option>
                        </select>
                        <button
                          className="ghost"
                          onClick={() =>
                            window.confirm(t('confirmRemove', { name: label })) &&
                            run(() => removeMember(group.id, id))
                          }
                        >
                          {t('removeMember')}
                        </button>
                      </>
                    ) : (
                      <small>{t(`role_${role}`)}</small>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      <h2>{t('boards')}</h2>
      <ul className="cards">
        {boards.map((b) => (
          <li key={b.id}><Link to={`/g/${groupId}/b/${b.id}`}>{b.name}</Link></li>
        ))}
        {boards.length === 0 && <p className="muted">{t('noBoards')}</p>}
      </ul>

      {isAdmin && (
        <form onSubmit={onCreate} className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('newBoardName')} />
          <button type="submit">{t('create')}</button>
        </form>
      )}
    </div>
  )
}

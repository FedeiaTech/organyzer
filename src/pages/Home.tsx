import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useI18n } from '../lib/i18n'
import { createGroup, joinGroup, roleOf, watchMyGroups, type Group } from '../lib/groups'
import MemberStack, { Avatar } from '../components/MemberStack'

export default function Home() {
  const { user, logOut } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [groups, setGroups] = useState<Group[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [invalidCode, setInvalidCode] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const firstName = user!.displayName?.trim().split(/\s+/)[0] ?? ''

  useEffect(() => watchMyGroups(user!.uid, setGroups), [user])

  // Invite links look like /?join=<code>: join the group once, then open it.
  const [params, setParams] = useSearchParams()
  const joinCode = useRef(params.get('join'))
  useEffect(() => {
    const c = joinCode.current
    if (!c) return
    joinCode.current = null
    setParams({}, { replace: true })
    joinGroup(c, user!)
      .then(() => navigate(`/g/${c}`))
      .catch(() => setInvalidCode(true))
  }, [navigate, setParams, user])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const id = await createGroup(name.trim(), user!)
    setName('')
    navigate(`/g/${id}`)
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault()
    setInvalidCode(false)
    try {
      await joinGroup(code.trim(), user!)
      navigate(`/g/${code.trim()}`)
    } catch {
      setInvalidCode(true)
    }
  }

  return (
    <div className="page">
      <header className="bar">
        <div>
          <h1>Organyzer</h1>
          <p className="greeting">{firstName ? t('greeting', { name: firstName }) : t('greetingAnon')}</p>
        </div>
        <button className="ghost" onClick={() => window.confirm(t('confirmSignOut')) && logOut()}>{t('signOut')}</button>
      </header>

      <h2>{t('yourGroups')}</h2>
      <ul className="cards">
        {groups.map((g) => (
          <li key={g.id} className="group-card">
            <Link to={`/g/${g.id}`}>{g.name}</Link>
            <span className="group-meta">
              <MemberStack group={g} />
              <button
                className="link"
                aria-expanded={openId === g.id}
                onClick={() => setOpenId(openId === g.id ? null : g.id)}
              >
                {t(g.memberIds.length === 1 ? 'members_one' : 'members_other', { n: g.memberIds.length })}
              </button>
            </span>
            {openId === g.id && (
              <div className="group-members" role="list" aria-label={t('membersTitle')}>
                {g.memberIds.map((id) => {
                  const profile = g.profiles?.[id]
                  return (
                    <div key={id} className="group-member" role="listitem">
                      <Avatar profile={profile} small />
                      <span>
                        {profile?.name || t('unnamed')}{' '}
                        {id === user!.uid && <small className="muted">{t('you')}</small>}
                      </span>
                      <small className="muted">
                        {id === g.ownerId ? t('creator') : t(`role_${roleOf(g, id)}`)}
                      </small>
                    </div>
                  )
                })}
              </div>
            )}
          </li>
        ))}
        {groups.length === 0 && <p className="muted">{t('noGroups')}</p>}
      </ul>

      <form onSubmit={onCreate} className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('newGroupName')} />
        <button type="submit">{t('create')}</button>
      </form>

      <form onSubmit={onJoin} className="row">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('inviteCode')} />
        <button type="submit">{t('join')}</button>
      </form>
      {invalidCode && <p className="error">{t('invalidCode')}</p>}
    </div>
  )
}

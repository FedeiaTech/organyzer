import { useState, type FormEvent } from 'react'
import { useI18n } from '../lib/i18n'

interface Props {
  value: string
  canEdit: boolean
  onSave: (name: string) => Promise<void> | void
}

// A heading that admins can rename in place (Enter saves, Escape cancels).
export default function EditableTitle({ value, canEdit, onSave }: Props) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function start() {
    setDraft(value)
    setEditing(true)
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const name = draft.trim()
    setEditing(false)
    if (name && name !== value) await onSave(name)
  }

  if (editing) {
    return (
      <form className="title-edit" onSubmit={submit}>
        <input
          autoFocus
          maxLength={100}
          value={draft}
          aria-label={t('editName')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => submit()}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        />
      </form>
    )
  }

  return (
    <div className="title-row">
      <h1>{value}</h1>
      {canEdit && (
        <button className="icon" aria-label={t('editName')} title={t('editName')} onClick={start}>
          ✎
        </button>
      )}
    </div>
  )
}

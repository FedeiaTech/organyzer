import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '../lib/AuthContext'
import { useI18n } from '../lib/i18n'
import { formatDateTime } from '../lib/format'
import { usePresenceHeartbeat } from '../lib/presence'
import EditableTitle from '../components/EditableTitle'
import AddMenu from '../components/AddMenu'
import { autosize } from '../lib/autosize'
import { boardStamp, setSeen } from '../lib/seen'
import { renameBoard, roleOf, watchBoard, watchGroup, type Board, type Group } from '../lib/groups'
import { IMAGE_QUOTA_CHARS, useImageUsage } from '../lib/usage'
import {
  MAX_CELLS,
  MAX_CELL_CHARS,
  MAX_COLS,
  MAX_TASKS,
  MAX_TASK_CHARS,
  MAX_TEXT_CHARS,
  MAX_URL_CHARS,
} from '../lib/limits'
import {
  COLORS,
  QuotaError,
  addImageItem,
  addItem,
  fileToResizedDataUrl,
  orderBetween,
  removeItem,
  updateItem,
  watchItems,
  type Item,
  type Task,
} from '../lib/items'

type Save = (data: Record<string, unknown>) => Promise<void>

export default function BoardPage() {
  const { groupId, boardId } = useParams<{ groupId: string; boardId: string }>()
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const [items, setItems] = useState<Item[]>([])
  const [board, setBoard] = useState<Board | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [imageError, setImageError] = useState('')
  const imageUsed = useImageUsage(user!.uid)
  const fileRef = useRef<HTMLInputElement>(null)

  usePresenceHeartbeat(groupId!, user!.uid)

  useEffect(() => watchItems(groupId!, boardId!, setItems), [groupId, boardId])
  useEffect(() => watchBoard(groupId!, boardId!, setBoard), [groupId, boardId])
  useEffect(() => watchGroup(groupId!, setGroup), [groupId])

  const isAdmin = !!group && roleOf(group, user!.uid) === 'admin'
  const lastEdit = (board?.updatedAt ?? board?.createdAt)?.toDate()
  const editor = board?.updatedBy
    ? (group?.profiles?.[board.updatedBy]?.name || t('unnamed')) +
      (board.updatedBy === user!.uid ? ` ${t('you')}` : '')
    : ''

  // Being on the board counts as having seen its latest edit.
  const stamp = board ? boardStamp(board) : null
  useEffect(() => {
    if (stamp !== null) setSeen(user!.uid, boardId!, stamp)
  }, [stamp, boardId, user])

  // The handle starts a drag; a small distance keeps plain taps working on touch screens.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    if (from < 0 || to < 0) return
    const moved = arrayMove(items, from, to)
    updateItem(groupId!, boardId!, String(active.id), {
      order: orderBetween(moved[to - 1], moved[to + 1]),
    })
  }

  const add = (item: Parameters<typeof addItem>[2]) =>
    addItem(groupId!, boardId!, item, user!.uid)

  async function onPickImage(file?: File) {
    if (!file) return
    setImageError('')
    try {
      const src = await fileToResizedDataUrl(file)
      await addImageItem(groupId!, boardId!, src, user!.uid)
    } catch (e) {
      setImageError(e instanceof QuotaError ? t('quotaReached') : t('imageFail'))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="page wide">
      <header className="bar">
        <Link to={`/g/${groupId}`}>{t('backToBoards')}</Link>
      </header>

      {board && (
        <>
          <EditableTitle value={board.name} canEdit={isAdmin} onSave={(n) => renameBoard(groupId!, boardId!, n)} />
          {lastEdit && (
            <p className="meta">
              {t(editor ? 'lastEditedBy' : 'lastEdited', {
                date: formatDateTime(lang, lastEdit),
                name: editor,
              })}
            </p>
          )}
        </>
      )}

      <AddMenu
        label={t('addMenu')}
        options={[
          { id: 'text', icon: '📝', label: t('addNote'), onSelect: () => add({ type: 'text', text: '' }) },
          { id: 'checklist', icon: '✅', label: t('addChecklist'), onSelect: () => add({ type: 'checklist', tasks: [] }) },
          { id: 'table', icon: '▦', label: t('addTable'), onSelect: () => add({ type: 'table', cols: 2, cells: ['', '', '', ''] }) },
          { id: 'link', icon: '🔗', label: t('addLink'), onSelect: () => add({ type: 'link', url: '' }) },
          { id: 'image', icon: '🖼', label: t('addImage'), onSelect: () => fileRef.current?.click() },
        ]}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onPickImage(e.target.files?.[0])}
      />

      <div className="usage-box">
        <progress
          className={imageUsed >= IMAGE_QUOTA_CHARS * 0.9 ? 'warn' : ''}
          value={imageUsed}
          max={IMAGE_QUOTA_CHARS}
        />
        <small className="muted">
          {t('imageUsage', {
            used: (imageUsed / 1_000_000).toFixed(1),
            max: (IMAGE_QUOTA_CHARS / 1_000_000).toFixed(0),
          })}
        </small>
      </div>
      {imageError && <p className="error">{imageError}</p>}

      {items.length === 0 && <p className="muted">{t('emptyBoard')}</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div className="grid">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} groupId={groupId!} boardId={boardId!} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function ItemCard({ item, groupId, boardId }: { item: Item; groupId: string; boardId: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [noteLen, setNoteLen] = useState(item.type === 'text' ? item.text.length : 0)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const save: Save = (data) => updateItem(groupId, boardId, item.id, data)

  // A new text size changes line heights: re-fit every auto-growing field.
  useEffect(() => {
    cardRef.current?.querySelectorAll('textarea').forEach(autosize)
  }, [item.fontSize])

  // Tapping anywhere outside this card (or pressing Escape) folds the options away.
  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const color = item.color ?? 'none'
  const span = item.span ?? 1
  const fontSize = item.fontSize ?? 'm'

  return (
    <div
      ref={(el) => {
        cardRef.current = el
        setNodeRef(el)
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 2 : undefined,
      }}
      className={`item c-${color} span-${span} fs-${fontSize}`}
    >
      <div className="item-actions">
        <button
          ref={setActivatorNodeRef}
          className="x handle"
          aria-label={t('dragHandle')}
          title={t('dragHandle')}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <button className="x" aria-label={t('options')} onClick={() => setOpen((o) => !o)}>⚙</button>
        <button className="x" aria-label={t('delete')} onClick={() => removeItem(groupId, boardId, item)}>×</button>
      </div>

      {open && (
        <div className="options">
          <div className="opt-row" role="group" aria-label={t('colorLabel')}>
            {COLORS.map((c) => (
              <button
                key={c}
                title={t(`color_${c}`)}
                aria-label={t(`color_${c}`)}
                className={`swatch c-${c} ${color === c ? 'on' : ''}`}
                onClick={() => save({ color: c })}
              />
            ))}
          </div>

          <div className="opt-row" role="group" aria-label={t('widthLabel')}>
            {([1, 2, 3] as const).map((n) => (
              <button key={n} className={`chip ${span === n ? 'on' : ''}`} onClick={() => save({ span: n })}>
                {t(`width_${n}`)}
              </button>
            ))}
          </div>

          {item.type !== 'image' && (
            <div className="opt-row" role="group" aria-label={t('textSizeLabel')}>
              {(['s', 'm', 'l'] as const).map((s) => (
                <button key={s} className={`chip ${fontSize === s ? 'on' : ''}`} onClick={() => save({ fontSize: s })}>
                  {t(`text_${s}`)}
                </button>
              ))}
            </div>
          )}

          {item.type === 'table' && (
            <div className="opt-row">
              <button className={`chip ${item.header ? 'on' : ''}`} onClick={() => save({ header: !item.header })}>
                {t('headerRow')}
              </button>
            </div>
          )}
        </div>
      )}

      {item.type === 'text' && (
        <textarea
          ref={autosize}
          rows={1}
          onInput={(e) => {
            autosize(e.currentTarget)
            setNoteLen(e.currentTarget.value.length)
          }}
          maxLength={MAX_TEXT_CHARS}
          defaultValue={item.text}
          placeholder={t('writePlaceholder')}
          onBlur={(e) => e.target.value !== item.text && save({ text: e.target.value })}
        />
      )}

      {item.type === 'text' && (
        <Counter n={noteLen} max={MAX_TEXT_CHARS} label={t('charsCount', { n: noteLen.toLocaleString(), max: MAX_TEXT_CHARS.toLocaleString() })} />
      )}

      {item.type === 'image' && <img src={item.src} alt="" />}

      {item.type === 'table' && <TableEditor item={item} save={save} />}

      {item.type === 'checklist' && <ChecklistEditor item={item} save={save} />}

      {item.type === 'link' && <LinkEditor item={item} save={save} />}
    </div>
  )
}

function ChecklistEditor({
  item,
  save,
}: {
  item: Extract<Item, { type: 'checklist' }>
  save: Save
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const done = item.tasks.filter((task) => task.done).length

  const setTasks = (tasks: Task[]) => save({ tasks })
  const patch = (id: string, change: Partial<Task>) =>
    setTasks(item.tasks.map((task) => (task.id === id ? { ...task, ...change } : task)))

  function onAdd(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || item.tasks.length >= MAX_TASKS) return
    setTasks([...item.tasks, { id: crypto.randomUUID(), text, done: false }])
    setDraft('')
  }

  return (
    <div className="checklist">
      <input
        className="check-title"
        key={item.title}
        defaultValue={item.title ?? ''}
        placeholder={t('listTitle')}
        maxLength={100}
        onBlur={(e) => {
          const title = e.target.value.trim()
          if (title !== (item.title ?? '')) save({ title })
        }}
      />
      {item.tasks.length > 0 && (
        <small className="muted">{done}/{item.tasks.length}</small>
      )}
      <ul className="tasks">
        {item.tasks.map((task) => (
          <li key={task.id} className={task.done ? 'done' : ''}>
            <input type="checkbox" checked={task.done} onChange={() => patch(task.id, { done: !task.done })} />
            <textarea
              className="task-text"
              ref={autosize}
              rows={1}
              onInput={(e) => autosize(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
              maxLength={MAX_TASK_CHARS}
              key={task.text}
              defaultValue={task.text}
              onBlur={(e) => {
                const text = e.target.value.trim()
                if (text && text !== task.text) patch(task.id, { text })
              }}
            />
            <button
              className="task-del"
              aria-label={t('deleteTask')}
              onClick={() => setTasks(item.tasks.filter((x) => x.id !== task.id))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <Counter n={item.tasks.length} max={MAX_TASKS} label={t('tasksCount', { n: item.tasks.length, max: MAX_TASKS })} />
      <form onSubmit={onAdd}>
        <input
          className="task-new"
          maxLength={MAX_TASK_CHARS}
          disabled={item.tasks.length >= MAX_TASKS}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('addTask')}
        />
      </form>
    </div>
  )
}

// Always resolves to an http(s) URL or null, so a `javascript:` (or any other) scheme
// can never reach an href, even if another member wrote it straight into Firestore.
function normalizeUrl(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

// Shown only when a limit is close (80%+), so it never adds noise while there is plenty of room.
function Counter({ n, max, label }: { n: number; max: number; label: string }) {
  if (n < max * 0.8) return null
  return <small className={`counter ${n >= max ? 'full' : ''}`}>{label}</small>
}

// A small emoji picked from the address alone: nothing is fetched and nothing leaves the device.
function siteIcon(href: string): string {
  const u = new URL(href)
  const host = u.hostname.replace(/^www\./, '')
  const path = u.pathname
  if (host === 'drive.google.com') return /\/folders\//.test(path) ? '📁' : '📎'
  if (host === 'docs.google.com') {
    if (path.startsWith('/spreadsheets')) return '📊'
    if (path.startsWith('/presentation')) return '📽️'
    if (path.startsWith('/forms')) return '📋'
    return '📄'
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return '▶️'
  if (host === 'maps.google.com' || host === 'maps.app.goo.gl' || (host === 'google.com' && path.startsWith('/maps'))) return '📍'
  if (host === 'wa.me' || host.endsWith('whatsapp.com')) return '💬'
  if (host === 'github.com' || host === 'gitlab.com') return '💻'
  if (host.endsWith('instagram.com') || host.endsWith('facebook.com') || host === 'x.com' || host.endsWith('twitter.com') || host.endsWith('tiktok.com')) return '👥'
  if (host === 'open.spotify.com') return '🎵'
  if (/\.pdf$/i.test(path)) return '📕'
  return '🔗'
}

function LinkEditor({
  item,
  save,
}: {
  item: Extract<Item, { type: 'link' }>
  save: Save
}) {
  const { t } = useI18n()
  const href = normalizeUrl(item.url)
  const host = href ? new URL(href).hostname.replace(/^www\./, '') : ''
  const [editing, setEditing] = useState(!href)
  const [url, setUrl] = useState(item.url)
  const [title, setTitle] = useState(item.title ?? '')
  const [invalid, setInvalid] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const clean = normalizeUrl(url)
    if (!clean) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    save({ url: clean, title: title.trim() })
    setEditing(false)
  }

  if (editing || !href) {
    return (
      <form className="link-edit" onSubmit={onSubmit}>
        <input
          autoFocus={!item.url}
          value={url}
          placeholder={t('linkUrlPlaceholder')}
          aria-label={t('linkUrlPlaceholder')}
          inputMode="url"
          maxLength={MAX_URL_CHARS}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          value={title}
          maxLength={100}
          placeholder={t('linkTitlePlaceholder')}
          aria-label={t('linkTitlePlaceholder')}
          onChange={(e) => setTitle(e.target.value)}
        />
        {invalid && <small className="error">{t('linkInvalid')}</small>}
        <button type="submit">{t('save')}</button>
      </form>
    )
  }

  return (
    <div className="link-card">
      <a href={href} target="_blank" rel="noopener noreferrer">
        <span className="link-title">
          <span aria-hidden="true">{siteIcon(href)} </span>
          {item.title || host}
        </span>
        <small className="link-host">{host}</small>
      </a>
      <button
        className="icon"
        aria-label={t('editLink')}
        title={t('editLink')}
        onClick={() => {
          setUrl(item.url)
          setTitle(item.title ?? '')
          setEditing(true)
        }}
      >
        ✎
      </button>
    </div>
  )
}

function TableEditor({
  item,
  save,
}: {
  item: Extract<Item, { type: 'table' }>
  save: Save
}) {
  const { t } = useI18n()
  const rows = item.cells.length / item.cols

  function setCell(i: number, value: string) {
    if (value === item.cells[i]) return
    const cells = [...item.cells]
    cells[i] = value
    save({ cells })
  }

  function addRow() {
    save({ cells: [...item.cells, ...Array(item.cols).fill('')] })
  }

  function addCol() {
    const cells: string[] = []
    for (let r = 0; r < rows; r++) {
      cells.push(...item.cells.slice(r * item.cols, (r + 1) * item.cols), '')
    }
    save({ cols: item.cols + 1, cells })
  }

  return (
    <div>
      <table className={item.header ? 'with-header' : ''}>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: item.cols }, (_, c) => {
                const i = r * item.cols + c
                return (
                  <td key={c}>
                    <input
                      key={item.cells[i]}
                      maxLength={MAX_CELL_CHARS}
                      defaultValue={item.cells[i]}
                      onBlur={(e) => setCell(i, e.target.value)}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <Counter n={item.cells.length} max={MAX_CELLS} label={t('cellsCount', { n: item.cells.length, max: MAX_CELLS })} />
      <div className="row">
        <button className="ghost" disabled={(rows + 1) * item.cols > MAX_CELLS} onClick={addRow}>
          {t('addRow')}
        </button>
        <button
          className="ghost"
          disabled={item.cols >= MAX_COLS || rows * (item.cols + 1) > MAX_CELLS}
          onClick={addCol}
        >
          {t('addCol')}
        </button>
      </div>
    </div>
  )
}

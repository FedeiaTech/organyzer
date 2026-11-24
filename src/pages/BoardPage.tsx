import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useI18n } from '../lib/i18n'
import EditableTitle from '../components/EditableTitle'
import { renameBoard, roleOf, watchBoard, watchGroup, type Board, type Group } from '../lib/groups'
import {
  COLORS,
  addItem,
  fileToResizedDataUrl,
  removeItem,
  updateItem,
  watchItems,
  type Item,
} from '../lib/items'

export default function BoardPage() {
  const { groupId, boardId } = useParams<{ groupId: string; boardId: string }>()
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const [items, setItems] = useState<Item[]>([])
  const [board, setBoard] = useState<Board | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => watchItems(groupId!, boardId!, setItems), [groupId, boardId])
  useEffect(() => watchBoard(groupId!, boardId!, setBoard), [groupId, boardId])
  useEffect(() => watchGroup(groupId!, setGroup), [groupId])

  const isAdmin = !!group && roleOf(group, user!.uid) === 'admin'
  const lastEdit = (board?.updatedAt ?? board?.createdAt)?.toDate()

  const add = (item: Parameters<typeof addItem>[2]) =>
    addItem(groupId!, boardId!, item, user!.uid)

  async function onPickImage(file?: File) {
    if (!file) return
    add({ type: 'image', src: await fileToResizedDataUrl(file) })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="page wide">
      <header className="bar">
        <Link to={`/g/${groupId}`}>{t('backToBoards')}</Link>
        <div className="row">
          <button onClick={() => add({ type: 'text', text: '' })}>{t('addNote')}</button>
          <button onClick={() => add({ type: 'table', cols: 2, cells: ['', '', '', ''] })}>{t('addTable')}</button>
          <button onClick={() => fileRef.current?.click()}>{t('addImage')}</button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onPickImage(e.target.files?.[0])}
          />
        </div>
      </header>

      {board && (
        <>
          <EditableTitle value={board.name} canEdit={isAdmin} onSave={(n) => renameBoard(groupId!, boardId!, n)} />
          {lastEdit && (
            <p className="meta">
              {t('lastEdited', {
                date: new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(lastEdit),
              })}
            </p>
          )}
        </>
      )}

      {items.length === 0 && <p className="muted">{t('emptyBoard')}</p>}

      <div className="grid">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} groupId={groupId!} boardId={boardId!} />
        ))}
      </div>
    </div>
  )
}

function ItemCard({ item, groupId, boardId }: { item: Item; groupId: string; boardId: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const save = (data: Record<string, unknown>) => updateItem(groupId, boardId, item.id, data)

  const color = item.color ?? 'none'
  const span = item.span ?? 1
  const fontSize = item.fontSize ?? 'm'

  return (
    <div className={`item c-${color} span-${span}`}>
      <div className="item-actions">
        <button className="x" aria-label={t('options')} onClick={() => setOpen((o) => !o)}>⚙</button>
        <button className="x" aria-label={t('delete')} onClick={() => removeItem(groupId, boardId, item.id)}>×</button>
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

          {item.type === 'text' && (
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
          className={`fs-${fontSize}`}
          defaultValue={item.text}
          placeholder={t('writePlaceholder')}
          onBlur={(e) => e.target.value !== item.text && save({ text: e.target.value })}
        />
      )}

      {item.type === 'image' && <img src={item.src} alt="" />}

      {item.type === 'table' && <TableEditor item={item} save={save} />}
    </div>
  )
}

function TableEditor({
  item,
  save,
}: {
  item: Extract<Item, { type: 'table' }>
  save: (data: Record<string, unknown>) => Promise<void>
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
      <div className="row">
        <button className="ghost" onClick={addRow}>{t('addRow')}</button>
        <button className="ghost" onClick={addCol}>{t('addCol')}</button>
      </div>
    </div>
  )
}

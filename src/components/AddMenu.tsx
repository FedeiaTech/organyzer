import { useEffect, useRef, useState } from 'react'

interface Option {
  id: string
  icon: string
  label: string
  onSelect: () => void
}

// A small dropdown button: "Add ▾" opens a short list of things to add.
export default function AddMenu({ label, options }: { label: string; options: Option[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
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

  return (
    <div className="add-menu" ref={ref}>
      <button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        + {label} ▾
      </button>
      {open && (
        <ul className="add-list" role="menu">
          {options.map((o) => (
            <li key={o.id} role="none">
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  o.onSelect()
                }}
              >
                <span aria-hidden="true">{o.icon}</span>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

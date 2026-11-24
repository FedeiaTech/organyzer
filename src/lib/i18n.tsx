import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const es = {
  loading: 'Cargando…',
  tagline: 'Organiza ideas en equipo.',
  continueGoogle: 'Continuar con Google',
  signOut: 'Cerrar sesión',
  yourGroups: 'Tus grupos',
  noGroups: 'Aún no tienes grupos. Crea uno o únete con un código.',
  newGroupName: 'Nombre del nuevo grupo',
  create: 'Crear',
  join: 'Unirse',
  inviteCode: 'Código de invitación',
  invalidCode: 'Código de invitación no válido',
  members_one: '{n} miembro',
  members_other: '{n} miembros',
  back: '← Volver',
  backToGroups: '← Grupos',
  backToBoards: '← Pizarras',
  copyInvite: 'Copiar código de invitación',
  copied: '¡Copiado!',
  groupNotFound: 'Grupo no encontrado.',
  boards: 'Pizarras',
  noBoards: 'Aún no hay pizarras.',
  newBoardName: 'Nombre de la nueva pizarra',
  addNote: '+ Nota',
  addTable: '+ Tabla',
  addImage: '+ Imagen',
  emptyBoard: 'Pizarra vacía. Agrega una nota, una tabla o una imagen.',
  options: 'Opciones',
  delete: 'Eliminar',
  colorLabel: 'Color',
  widthLabel: 'Ancho',
  textSizeLabel: 'Tamaño de texto',
  color_none: 'Sin color',
  color_yellow: 'Amarillo',
  color_green: 'Verde',
  color_blue: 'Azul',
  color_pink: 'Rosa',
  color_purple: 'Violeta',
  color_orange: 'Naranja',
  width_1: 'Chico',
  width_2: 'Mediano',
  width_3: 'Grande',
  text_s: 'Texto chico',
  text_m: 'Texto normal',
  text_l: 'Texto grande',
  headerRow: 'Primera fila como encabezado',
  writePlaceholder: 'Escribe algo…',
  addRow: '+ Fila',
  addCol: '+ Columna',
  language: 'Idioma',
  theme: 'Tema',
  theme_auto: 'Automático',
  theme_light: 'Claro',
  theme_dark: 'Oscuro',
  greeting: 'Hola, {name}',
  greetingAnon: 'Hola',
  membersTitle: 'Miembros',
  role_admin: 'Administrador',
  role_guest: 'Invitado',
  creator: 'Creador',
  you: '(tú)',
  unnamed: 'Usuario',
  removeMember: 'Quitar',
  confirmRemove: '¿Quitar a {name} del grupo?',
  actionFailed: 'No se pudo completar la acción.',
} as const

export type TKey = keyof typeof es

const en: Record<TKey, string> = {
  loading: 'Loading…',
  tagline: 'Organize ideas together.',
  continueGoogle: 'Continue with Google',
  signOut: 'Sign out',
  yourGroups: 'Your groups',
  noGroups: 'No groups yet. Create one or join with a code.',
  newGroupName: 'New group name',
  create: 'Create',
  join: 'Join',
  inviteCode: 'Invite code',
  invalidCode: 'Invalid invite code',
  members_one: '{n} member',
  members_other: '{n} members',
  back: '← Back',
  backToGroups: '← Groups',
  backToBoards: '← Boards',
  copyInvite: 'Copy invite code',
  copied: 'Copied!',
  groupNotFound: 'Group not found.',
  boards: 'Boards',
  noBoards: 'No boards yet.',
  newBoardName: 'New board name',
  addNote: '+ Note',
  addTable: '+ Table',
  addImage: '+ Image',
  emptyBoard: 'Empty board. Add a note, a table or an image.',
  options: 'Options',
  delete: 'Delete',
  colorLabel: 'Color',
  widthLabel: 'Width',
  textSizeLabel: 'Text size',
  color_none: 'No color',
  color_yellow: 'Yellow',
  color_green: 'Green',
  color_blue: 'Blue',
  color_pink: 'Pink',
  color_purple: 'Purple',
  color_orange: 'Orange',
  width_1: 'Small',
  width_2: 'Medium',
  width_3: 'Large',
  text_s: 'Small text',
  text_m: 'Normal text',
  text_l: 'Large text',
  headerRow: 'First row as header',
  writePlaceholder: 'Write something…',
  addRow: '+ Row',
  addCol: '+ Column',
  language: 'Language',
  theme: 'Theme',
  theme_auto: 'Automatic',
  theme_light: 'Light',
  theme_dark: 'Dark',
  greeting: 'Hi, {name}',
  greetingAnon: 'Hi',
  membersTitle: 'Members',
  role_admin: 'Admin',
  role_guest: 'Guest',
  creator: 'Creator',
  you: '(you)',
  unnamed: 'User',
  removeMember: 'Remove',
  confirmRemove: 'Remove {name} from the group?',
  actionFailed: 'The action could not be completed.',
}

const dictionaries = { es, en } as const
export type Lang = keyof typeof dictionaries
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
]

const STORAGE_KEY = 'organyzer.lang'

function initialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'es' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es'
}

interface I18nState {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nState | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value: I18nState = {
    lang,
    setLang: (l) => {
      localStorage.setItem(STORAGE_KEY, l)
      setLangState(l)
    },
    t: (key, vars) => {
      let text: string = dictionaries[lang][key]
      for (const [k, v] of Object.entries(vars ?? {})) text = text.replace(`{${k}}`, String(v))
      return text
    },
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

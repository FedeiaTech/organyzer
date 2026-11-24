import { LANGS, useI18n, type Lang } from '../lib/i18n'
import { THEMES, useTheme, type Theme } from '../lib/theme'

export default function Footer() {
  const { lang, setLang, t } = useI18n()
  const { theme, setTheme } = useTheme()

  return (
    <footer className="app-footer">
      <div className="footer-controls">
        <label>
          <span className="muted">{t('language')}: </span>
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">{t('theme')}: </span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            {THEMES.map((th) => (
              <option key={th} value={th}>{t(`theme_${th}`)}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="signature">
        Organyzer v{__APP_VERSION__} · © {new Date().getFullYear()} iaTech
      </p>
    </footer>
  )
}

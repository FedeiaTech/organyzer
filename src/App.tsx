import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import { useI18n } from './lib/i18n'
import Footer from './components/Footer'
import Splash from './components/Splash'
import Home from './pages/Home'
import GroupPage from './pages/GroupPage'
import BoardPage from './pages/BoardPage'
import './App.css'

const SPLASH_MIN_MS = 1100

export default function App() {
  const { user, loading, signIn } = useAuth()
  const { t } = useI18n()
  const [splashDone, setSplashDone] = useState(false)

  // Show the splash at least briefly, and for as long as the session is still loading.
  useEffect(() => {
    const id = setTimeout(() => setSplashDone(true), SPLASH_MIN_MS)
    return () => clearTimeout(id)
  }, [])

  if (loading || !splashDone) return <Splash />

  let content
  if (!user) {
    content = (
      <main className="center">
        <img src="/logo.svg" alt="" width="88" height="88" />
        <h1>Organyzer</h1>
        <p>{t('tagline')}</p>
        <button onClick={signIn}>{t('continueGoogle')}</button>
      </main>
    )
  } else {
    content = (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/g/:groupId" element={<GroupPage />} />
          <Route path="/g/:groupId/b/:boardId" element={<BoardPage />} />
        </Routes>
      </BrowserRouter>
    )
  }

  return (
    <>
      {content}
      <Footer />
    </>
  )
}

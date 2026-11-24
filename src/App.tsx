import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import { useI18n } from './lib/i18n'
import Footer from './components/Footer'
import Home from './pages/Home'
import GroupPage from './pages/GroupPage'
import BoardPage from './pages/BoardPage'
import './App.css'

export default function App() {
  const { user, loading, signIn } = useAuth()
  const { t } = useI18n()

  let content
  if (loading) {
    content = <main className="center">{t('loading')}</main>
  } else if (!user) {
    content = (
      <main className="center">
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

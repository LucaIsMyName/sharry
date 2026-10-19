import { useState } from 'react'
import { NavLink, Outlet, useLoaderData, useNavigate } from 'react-router'
import { api, type Me } from '../api.ts'
import { Button } from './ui.tsx'

export function Shell() {
  const me = useLoaderData() as Me
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const admin = me.user.role === 'admin'

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    await navigate('/login')
  }

  return (
    <div className="shell">
      <aside className={open ? 'sidebar open' : 'sidebar'}>
        <p className="brand">sharry</p>
        <nav className="nav" onClick={() => setOpen(false)}>
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/links">Links</NavLink>
          <NavLink to="/campaigns">Campaigns</NavLink>
          <NavLink to="/analytics">Analytics</NavLink>
          <NavLink to="/account">Account</NavLink>
          {admin ? <NavLink to="/admin/users">Users</NavLink> : null}
          {admin ? <NavLink to="/admin/settings">Settings</NavLink> : null}
          {admin ? <NavLink to="/admin/audit">Audit</NavLink> : null}
        </nav>
        <div className="spacer" />
        <div className="stack">
          <span className="muted">{me.user.username}</span>
          <Button variant="ghost" type="button" onClick={() => void logout()}>Sign out</Button>
        </div>
      </aside>
      <main className="main">
        <div className="row mobile-only" style={{ marginBottom: 12 }}>
          <Button className="menu-btn" variant="ghost" type="button" onClick={() => setOpen((value) => !value)}>
            Menu
          </Button>
        </div>
        <Outlet />
      </main>
    </div>
  )
}

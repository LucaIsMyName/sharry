import { useState } from 'react'
import { ChartColumn, CircleUser, LayoutDashboard, Link, Megaphone, ScrollText, Settings, Users } from 'lucide-react'
import { NavLink, Outlet, useLoaderData, useNavigate } from 'react-router'
import { api, type Me } from '../api.ts'
import { Button } from './ui/button.tsx'

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
          <NavLink to="/" end><LayoutDashboard size={18} /> Overview</NavLink>
          <NavLink to="/links"><Link size={18} /> Links</NavLink>
          <NavLink to="/campaigns"><Megaphone size={18} /> Campaigns</NavLink>
          <NavLink to="/analytics"><ChartColumn size={18} /> Analytics</NavLink>
          <NavLink to="/account"><CircleUser size={18} /> Account</NavLink>
          {admin ? <NavLink to="/admin/users"><Users size={18} /> Users</NavLink> : null}
          {admin ? <NavLink to="/admin/settings"><Settings size={18} /> Settings</NavLink> : null}
          {admin ? <NavLink to="/admin/audit"><ScrollText size={18} /> Audit</NavLink> : null}
        </nav>
        <div className="sidebar-foot">
          <span className="sidebar-user">{me.user.username}</span>
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

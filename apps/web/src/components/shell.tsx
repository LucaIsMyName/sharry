import { useState } from 'react'
import type { ReactNode } from 'react'
import { BookOpen, ChartColumn, KeyRound, LayoutDashboard, Link, Megaphone, Menu, ScrollText, Server, Settings, Users } from 'lucide-react'
import { NavLink, Outlet, useLoaderData, useNavigate } from 'react-router'
import { cn } from 'cn'
import { api, type Me } from '../api.ts'
import { Button } from './ui/button.tsx'
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet.tsx'

export function Shell() {
  const me = useLoaderData() as Me
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const admin = me.user.role === 'admin'

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    await navigate('/login')
  }

  const navigation = <Navigation admin={admin} onNavigate={() => setOpen(false)} />

  return (
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col gap-4 bg-sidebar px-4 py-5 text-sidebar-foreground md:flex">
        <p className="font-heading text-3xl font-medium tracking-tight">sharry</p>
        {navigation}
        <AccountFoot user={me.user} onLogout={() => void logout()} onNavigate={() => setOpen(false)} />
      </aside>
      <main className="min-h-svh p-5 md:ml-60 md:p-7">
        <div className="mb-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="outline" type="button" />}>
              <Menu /> Menu
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar text-sidebar-foreground sm:max-w-xs">
              <p className="font-heading px-1 pt-2 text-3xl font-medium tracking-tight">sharry</p>
              {navigation}
              <AccountFoot user={me.user} onLogout={() => void logout()} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
        <Outlet />
      </main>
    </div>
  )
}

function Navigation({ admin, onNavigate }: { admin: boolean; onNavigate: () => void }) {
  return (
    <nav className="grid content-start gap-1 overflow-auto" onClick={onNavigate}>
      <Item to="/" end icon={<LayoutDashboard size={18} />}>Overview</Item>
      <Item to="/links" icon={<Link size={18} />}>Links</Item>
      <Item to="/campaigns" icon={<Megaphone size={18} />}>Campaigns</Item>
      <Item to="/analytics" icon={<ChartColumn size={18} />}>Analytics</Item>
      <Item to="/docs" icon={<BookOpen size={18} />}>Docs</Item>
      {admin ? <Item to="/admin/users" icon={<Users size={18} />}>Users</Item> : null}
      {admin ? <Item to="/admin/api-keys" icon={<KeyRound size={18} />}>API keys</Item> : null}
      {admin ? <Item to="/admin/settings" icon={<Settings size={18} />}>Settings</Item> : null}
      {admin ? <Item to="/admin/server" icon={<Server size={18} />}>Server</Item> : null}
      {admin ? <Item to="/admin/audit" icon={<ScrollText size={18} />}>Audit</Item> : null}
    </nav>
  )
}

function Item({ to, end, icon, children }: { to: string; end?: boolean; icon: ReactNode; children: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(
        'flex min-w-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white',
        isActive && 'bg-sidebar-accent text-white',
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </NavLink>
  )
}

function AccountFoot({ user, onLogout, onNavigate }: { user: Me['user']; onLogout: () => void; onNavigate: () => void }) {
  const initial = user.username.trim().charAt(0).toUpperCase() || '?'
  const icon = user.hasAvatar ? (
    <img src={`/api/auth/avatar?v=${encodeURIComponent(user.updatedAt)}`} alt="" className="size-[18px] rounded-full object-cover" />
  ) : (
    <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[10px] leading-none font-medium text-white">{initial}</span>
  )
  return (
    <div className="mt-auto grid gap-2.5" onClick={onNavigate}>
      <Item to="/account" icon={icon}>{user.username}</Item>
      <Button variant="outline" className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-white" type="button" onClick={onLogout}>
        Sign out
      </Button>
    </div>
  )
}

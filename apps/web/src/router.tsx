import { createBrowserRouter, redirect } from 'react-router'
import { api, type Me } from './api.ts'
import { Shell } from './components/shell.tsx'
import { AdminAuditPage, AdminSettingsPage, AdminUsersPage } from './pages/admin.tsx'
import { AnalyticsPage } from './pages/analytics.tsx'
import { AccountPage, EnrollPage, LoginPage, MfaPage, PasswordPage, ResetPage } from './pages/auth.tsx'
import { CampaignDetailPage, CampaignsPage } from './pages/campaigns.tsx'
import { DashboardPage } from './pages/dashboard.tsx'
import { LinkDetailPage, LinkFormPage, LinksPage } from './pages/links.tsx'

async function loadMe(): Promise<Me> {
  return api<Me>('/api/auth/me')
}

async function appLoader() {
  try {
    const me = await loadMe()
    if (me.scope === 'password_change') throw redirect('/account/password')
    if (me.scope === 'mfa_enroll') throw redirect('/account/mfa')
    if (me.scope === 'mfa_challenge') throw redirect('/login/mfa')
    return me
  } catch (error) {
    if (error instanceof Response) throw error
    throw redirect('/login')
  }
}

async function scopeLoader(scope: Me['scope']) {
  try {
    const me = await loadMe()
    if (me.scope !== scope) throw redirect(me.scope === 'full' ? '/' : '/login')
    return me
  } catch (error) {
    if (error instanceof Response) throw error
    throw redirect('/login')
  }
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/login/mfa', loader: () => scopeLoader('mfa_challenge'), element: <MfaPage /> },
  { path: '/login/reset', element: <ResetPage /> },
  { path: '/account/password', loader: () => scopeLoader('password_change'), element: <PasswordPage /> },
  { path: '/account/mfa', loader: () => scopeLoader('mfa_enroll'), element: <EnrollPage /> },
  {
    path: '/',
    loader: appLoader,
    element: <Shell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'links', element: <LinksPage /> },
      { path: 'links/new', element: <LinkFormPage /> },
      { path: 'links/:id', element: <LinkDetailPage /> },
      { path: 'campaigns', element: <CampaignsPage /> },
      { path: 'campaigns/:id', element: <CampaignDetailPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'admin/users', element: <AdminUsersPage /> },
      { path: 'admin/settings', element: <AdminSettingsPage /> },
      { path: 'admin/audit', element: <AdminAuditPage /> },
    ],
  },
])

import { Outlet, createBrowserRouter, redirect } from 'react-router'
import { api, type Me } from './api.ts'
import { DocumentHead } from './components/page-title.tsx'
import { Shell } from './components/shell.tsx'
import { I18nProvider } from './i18n/index.tsx'
import { ToastProvider } from './components/ui/toast.tsx'
import { TooltipProvider } from './components/ui/tooltip.tsx'
import { AdminAuditPage, AdminSettingsPage, AdminUsersPage } from './pages/admin.tsx'
import { AdminDomainsPage } from './pages/domains.tsx'
import { ServerPage } from './pages/server.tsx'
import { ApiKeysPage } from './pages/api-keys.tsx'
import { DocsPage } from './pages/docs.tsx'
import { AnalyticsPage } from './pages/analytics.tsx'
import { AccountPage, EnrollPage, LoginPage, MfaPage, PasswordPage, ResetPage } from './pages/auth.tsx'
import { CampaignDetailPage, CampaignsPage } from './pages/campaigns.tsx'
import { ChatPage } from './pages/chat.tsx'
import { DashboardPage } from './pages/dashboard.tsx'
import { LinkDetailPage, LinkFormPage, LinksPage } from './pages/links.tsx'

async function loadMe(): Promise<Me> {
  return api<Me>('/api/auth/me')
}

async function loadBrand(): Promise<{ appName: string }> {
  try {
    const brand = await api<{ appName?: string }>('/api/brand')
    const appName = brand.appName?.trim()
    return { appName: appName || 'Sharry' }
  } catch {
    return { appName: 'Sharry' }
  }
}

function redirectForScope(scope: Me['scope']): string | null {
  if (scope === 'password_change') return '/account/password'
  if (scope === 'mfa_enroll') return '/account/mfa'
  if (scope === 'mfa_challenge') return '/login/mfa'
  return null
}

async function requireSession(): Promise<Me> {
  try {
    const me = await loadMe()
    const next = redirectForScope(me.scope)
    if (next) throw redirect(next)
    return me
  } catch (error) {
    if (error instanceof Response) throw error
    throw redirect('/login')
  }
}

async function appLoader() {
  return requireSession()
}

async function adminLoader() {
  const me = await requireSession()
  if (me.user.role !== 'admin') throw redirect('/')
  return me
}

async function scopeLoader(scope: Me['scope']) {
  try {
    const me = await loadMe()
    if (me.scope !== scope) throw redirect(redirectForScope(me.scope) ?? '/')
    return me
  } catch (error) {
    if (error instanceof Response) throw error
    throw redirect('/login')
  }
}

function RootLayout() {
  return (
    <I18nProvider>
      <TooltipProvider>
        <ToastProvider>
          <DocumentHead />
          <Outlet />
        </ToastProvider>
      </TooltipProvider>
    </I18nProvider>
  )
}

export const router = createBrowserRouter([
  {
    id: 'root',
    loader: loadBrand,
    shouldRevalidate: () => false,
    element: <RootLayout />,
    children: [
      { path: '/login', handle: { title: 'Sign in' }, element: <LoginPage /> },
      { path: '/login/mfa', loader: () => scopeLoader('mfa_challenge'), handle: { title: 'Two-factor code' }, element: <MfaPage /> },
      { path: '/login/reset', handle: { title: 'Reset password' }, element: <ResetPage /> },
      { path: '/account/password', loader: () => scopeLoader('password_change'), handle: { title: 'Choose a new password' }, element: <PasswordPage /> },
      { path: '/account/mfa', loader: () => scopeLoader('mfa_enroll'), handle: { title: 'Turn on two-factor' }, element: <EnrollPage /> },
      {
        path: '/',
        loader: appLoader,
        element: <Shell />,
        children: [
          { index: true, handle: { title: 'Overview' }, element: <DashboardPage /> },
          { path: 'links', handle: { title: 'Links' }, element: <LinksPage /> },
          { path: 'links/new', handle: { title: 'New link' }, element: <LinkFormPage /> },
          { path: 'links/:id', handle: { title: 'Link' }, element: <LinkDetailPage /> },
          { path: 'campaigns', handle: { title: 'Campaigns' }, element: <CampaignsPage /> },
          { path: 'campaigns/:id', handle: { title: 'Campaign' }, element: <CampaignDetailPage /> },
          { path: 'analytics', handle: { title: 'Analytics' }, element: <AnalyticsPage /> },
          { path: 'chat', handle: { title: 'Chat' }, element: <ChatPage /> },
          { path: 'chat/:id', handle: { title: 'Chat' }, element: <ChatPage /> },
          { path: 'docs', loader: () => redirect('/docs/user/signing-in') },
          { path: 'docs/*', handle: { title: 'Docs' }, element: <DocsPage /> },
          { path: 'account', handle: { title: 'Account' }, element: <AccountPage /> },
          { path: 'admin/users', loader: adminLoader, handle: { title: 'Users' }, element: <AdminUsersPage /> },
          { path: 'admin/api-keys', loader: adminLoader, handle: { title: 'API keys' }, element: <ApiKeysPage /> },
          { path: 'admin/settings', loader: adminLoader, handle: { title: 'Settings' }, element: <AdminSettingsPage /> },
          { path: 'admin/domains', loader: adminLoader, handle: { title: 'Domains' }, element: <AdminDomainsPage /> },
          { path: 'admin/server', loader: adminLoader, handle: { title: 'Server' }, element: <ServerPage /> },
          { path: 'admin/audit', loader: adminLoader, handle: { title: 'Audit' }, element: <AdminAuditPage /> },
        ],
      },
    ],
  },
])

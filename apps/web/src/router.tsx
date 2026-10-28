import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { Outlet, createBrowserRouter, redirect, useLocation } from 'react-router'
import { api, type Me } from './api.ts'
import { DocumentHead } from './components/page-title.tsx'
import { RootRouteError, RouteErrorBoundary } from './components/route-error-boundary.tsx'
import { Shell } from './components/shell.tsx'
import { RowSkeleton } from './components/ui/skeleton.tsx'
import { I18nProvider } from './i18n/index.tsx'
import { ToastProvider } from './components/ui/toast.tsx'
import { TooltipProvider } from './components/ui/tooltip.tsx'
import { AccountPage, EnrollPage, LoginPage, MfaPage, PasswordPage, ResetPage } from './pages/auth.tsx'

function lazyPage<P extends Record<string, never>>(load: () => Promise<ComponentType<P>>) {
  return lazy(() => load().then((component) => ({ default: component })))
}

const dashboardModule = () => import('./pages/dashboard.tsx')
const linksModule = () => import('./pages/links.tsx')
const campaignsModule = () => import('./pages/campaigns.tsx')
const adminModule = () => import('./pages/admin.tsx')

const DashboardPage = lazyPage(() => dashboardModule().then((module) => module.DashboardPage))
const LinksPage = lazyPage(() => linksModule().then((module) => module.LinksPage))
const LinkFormPage = lazyPage(() => linksModule().then((module) => module.LinkFormPage))
const LinkDetailPage = lazyPage(() => linksModule().then((module) => module.LinkDetailPage))
const CampaignsPage = lazyPage(() => campaignsModule().then((module) => module.CampaignsPage))
const CampaignDetailPage = lazyPage(() => campaignsModule().then((module) => module.CampaignDetailPage))
const AnalyticsPage = lazyPage(() => import('./pages/analytics.tsx').then((module) => module.AnalyticsPage))
const ChatPage = lazyPage(() => import('./pages/chat.tsx').then((module) => module.ChatPage))
const DocsPage = lazyPage(() => import('./pages/docs.tsx').then((module) => module.DocsPage))
const AdminUsersPage = lazyPage(() => adminModule().then((module) => module.AdminUsersPage))
const AdminSettingsPage = lazyPage(() => adminModule().then((module) => module.AdminSettingsPage))
const AdminAuditPage = lazyPage(() => adminModule().then((module) => module.AdminAuditPage))
const ApiKeysPage = lazyPage(() => import('./pages/api-keys.tsx').then((module) => module.ApiKeysPage))
const AdminDomainsPage = lazyPage(() => import('./pages/domains.tsx').then((module) => module.AdminDomainsPage))
const ServerPage = lazyPage(() => import('./pages/server.tsx').then((module) => module.ServerPage))

function Routed({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <RouteErrorBoundary resetKey={pathname}>
      <Suspense fallback={<RowSkeleton label="Loading…" />}>{children}</Suspense>
    </RouteErrorBoundary>
  )
}

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
    errorElement: <RootRouteError />,
    children: [
      { path: '/login', handle: { title: 'Sign in' }, element: <Routed><LoginPage /></Routed> },
      { path: '/login/mfa', loader: () => scopeLoader('mfa_challenge'), handle: { title: 'Two-factor code' }, element: <Routed><MfaPage /></Routed> },
      { path: '/login/reset', handle: { title: 'Reset password' }, element: <Routed><ResetPage /></Routed> },
      { path: '/account/password', loader: () => scopeLoader('password_change'), handle: { title: 'Choose a new password' }, element: <Routed><PasswordPage /></Routed> },
      { path: '/account/mfa', loader: () => scopeLoader('mfa_enroll'), handle: { title: 'Turn on two-factor' }, element: <Routed><EnrollPage /></Routed> },
      {
        path: '/',
        loader: appLoader,
        element: <Shell />,
        children: [
          { index: true, handle: { title: 'Overview' }, element: <Routed><DashboardPage /></Routed> },
          { path: 'links', handle: { title: 'Links' }, element: <Routed><LinksPage /></Routed> },
          { path: 'links/new', handle: { title: 'New link' }, element: <Routed><LinkFormPage /></Routed> },
          { path: 'links/:id', handle: { title: 'Link' }, element: <Routed><LinkDetailPage /></Routed> },
          { path: 'campaigns', handle: { title: 'Campaigns' }, element: <Routed><CampaignsPage /></Routed> },
          { path: 'campaigns/:id', handle: { title: 'Campaign' }, element: <Routed><CampaignDetailPage /></Routed> },
          { path: 'analytics', handle: { title: 'Analytics' }, element: <Routed><AnalyticsPage /></Routed> },
          { path: 'chat', handle: { title: 'Chat' }, element: <Routed><ChatPage /></Routed> },
          { path: 'chat/:id', handle: { title: 'Chat' }, element: <Routed><ChatPage /></Routed> },
          { path: 'docs', loader: () => redirect('/docs/user/signing-in') },
          { path: 'docs/*', handle: { title: 'Docs' }, element: <Routed><DocsPage /></Routed> },
          { path: 'account', handle: { title: 'Account' }, element: <Routed><AccountPage /></Routed> },
          { path: 'admin/users', loader: adminLoader, handle: { title: 'Users' }, element: <Routed><AdminUsersPage /></Routed> },
          { path: 'admin/api-keys', loader: adminLoader, handle: { title: 'API keys' }, element: <Routed><ApiKeysPage /></Routed> },
          { path: 'admin/settings', loader: adminLoader, handle: { title: 'Settings' }, element: <Routed><AdminSettingsPage /></Routed> },
          { path: 'admin/domains', loader: adminLoader, handle: { title: 'Domains' }, element: <Routed><AdminDomainsPage /></Routed> },
          { path: 'admin/server', loader: adminLoader, handle: { title: 'Server' }, element: <Routed><ServerPage /></Routed> },
          { path: 'admin/audit', loader: adminLoader, handle: { title: 'Audit' }, element: <Routed><AdminAuditPage /></Routed> },
        ],
      },
    ],
  },
])

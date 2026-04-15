'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Newspaper, Home, Search, Settings, Users, Rss, LayoutDashboard, FileBarChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Client, UserProfile } from '@/lib/types/database'

interface SidebarProps {
  clients: Client[]
  profile: UserProfile | null
}

export function Sidebar({ clients, profile }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-gray-50">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-4">
        <Newspaper className="h-6 w-6 text-blue-600" />
        <span className="font-bold text-gray-900">Central de Notícias</span>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4 gap-1">
        {/* Visão geral */}
        <NavItem href="/" icon={<Home size={18} />} label="Visão Geral" active={pathname === '/'} />

        {/* Analista de Mídia */}
        {(profile?.role === 'analyst' || profile?.role === 'admin') && (
          <>
            <NavItem href="/analista" icon={<LayoutDashboard size={18} />} label="Dashboard Análise" active={pathname.startsWith('/analista')} />
            <NavItem href="/busca" icon={<Search size={18} />} label="Busca Avançada" active={pathname.startsWith('/busca')} />
          </>
        )}

        {/* Account Manager */}
        {(profile?.role === 'account_manager' || profile?.role === 'admin') && (
          <>
            <NavItem href="/account-manager" icon={<LayoutDashboard size={18} />} label="Meus Clientes" active={pathname.startsWith('/account-manager')} />
          </>
        )}

        {/* Estrategista */}
        {(profile?.role === 'strategist' || profile?.role === 'admin') && (
          <>
            <NavItem href="/estrategista" icon={<LayoutDashboard size={18} />} label="Insights Globais" active={pathname.startsWith('/estrategista')} />
          </>
        )}

        {/* Relatório (comum a todos) */}
        <NavItem href="/relatorio" icon={<FileBarChart size={18} />} label="Relatório" active={pathname.startsWith('/relatorio')} />

        {/* Clientes */}
        {clients.length > 0 && (
          <>
            <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Clientes
            </div>
            {clients.map((client) => (
              <NavItem
                key={client.id}
                href={`/cliente/${client.id}`}
                icon={<LayoutDashboard size={18} />}
                label={client.name}
                active={pathname === `/cliente/${client.id}`}
              />
            ))}
          </>
        )}

        {/* Admin */}
        {profile?.role === 'admin' && (
          <>
            <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Administração
            </div>
            <NavItem href="/admin" icon={<Settings size={18} />} label="Dashboard Admin" active={pathname === '/admin'} />
            <NavItem href="/admin/fontes" icon={<Rss size={18} />} label="Fontes RSS" active={pathname.startsWith('/admin/fontes')} />
            <NavItem href="/admin/clientes" icon={<Users size={18} />} label="Clientes" active={pathname.startsWith('/admin/clientes')} />
            <NavItem href="/admin/usuarios" icon={<Users size={18} />} label="Usuários" active={pathname.startsWith('/admin/usuarios')} />
          </>
        )}
      </nav>

      {/* Rodapé com usuário */}
      <div className="border-t border-gray-200 px-4 py-3">
        <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
        <p className="text-xs font-medium text-gray-700 capitalize">
          {profile?.role === 'admin'
            ? 'Administrador'
            : profile?.role === 'analyst'
              ? 'Analista de Mídia'
              : profile?.role === 'account_manager'
                ? 'Account Manager'
                : profile?.role === 'strategist'
                  ? 'Estrategista'
                  : 'Usuário'}
        </p>
      </div>
    </aside>
  )
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  )
}

// Narrow icon rail — always visible on desktop, hover-expands to show labels.
//
// Layout trick: the <aside> element holds the 56px (w-14) layout slot.
// The inner <div> is absolute-positioned and expands to w-52 on hover,
// overlaying adjacent content without causing any flex reflow.

import { useNavigate } from 'react-router'
import { NavLink } from 'react-router'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/stores/app'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import type { WorkspaceRecord } from '@/api/types'
import { Aperture, Key, Settings, HelpCircle, Plus, Moon, Sun } from 'lucide-react'

// ── Workspace helpers ──────────────────────────────────────────────────────

const PALETTE = [
  'bg-violet-500',
  'bg-blue-500',
  'bg-cyan-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-orange-500',
  'bg-rose-500',
  'bg-fuchsia-500',
] as const

function workspaceColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h * 31) + id.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function workspaceInitials(ws: WorkspaceRecord): string {
  const base =
    ws.name || ws.repoRoot.split(/[/\\]/).filter(Boolean).pop() || '??'
  const parts = base.split(/[-_\s.]+/).filter(Boolean)
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : base.slice(0, 2).toUpperCase()
}

// ── Shared style tokens ────────────────────────────────────────────────────

const ITEM_CLS = [
  'flex items-center gap-3 w-full px-2.5 py-1.5 rounded-lg transition-colors',
].join(' ')

const LABEL_CLS = [
  'opacity-0 group-hover:opacity-100',
  'text-sm font-medium whitespace-nowrap select-none',
  'transition-opacity duration-150 delay-75',
].join(' ')

// ── Primitives ─────────────────────────────────────────────────────────────

function Squircle({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'w-9 h-9 shrink-0 flex items-center justify-center rounded-[30%] transition-colors',
        className,
      )}
    >
      {children}
    </span>
  )
}

function ApertureIcon() {
  return <Aperture size={20} />
}

// ── Rail button (plain button) ─────────────────────────────────────────────

function RailButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        ITEM_CLS,
        active
          ? 'text-accent'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
      )}
    >
      <Squircle className={active ? 'bg-accent/15' : 'hover:bg-secondary/80'}>
        {icon}
      </Squircle>
      <span className={LABEL_CLS}>{label}</span>
    </button>
  )
}

// ── Rail nav link (router-aware active state) ──────────────────────────────

function RailNavLink({
  to,
  icon,
  label,
}: {
  to: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        cn(
          ITEM_CLS,
          isActive
            ? 'text-accent'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Squircle className={isActive ? 'bg-accent/15' : 'hover:bg-secondary/80'}>
            {icon}
          </Squircle>
          <span className={LABEL_CLS}>{label}</span>
        </>
      )}
    </NavLink>
  )
}

// ── Workspace squircle item ────────────────────────────────────────────────

function WorkspaceItem({
  workspace,
  active,
  onClick,
}: {
  workspace: WorkspaceRecord
  active: boolean
  onClick: () => void
}) {
  const initials = workspaceInitials(workspace)
  const color = workspaceColor(workspace.id)
  const displayName = workspace.name || workspace.repoRoot.split(/[/\\]/).filter(Boolean).pop() || initials

  return (
    <button
      onClick={onClick}
      title={displayName}
      className={cn(
        ITEM_CLS,
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
      )}
    >
      <Squircle
        className={cn(
          color,
          'text-white',
          active && 'ring-2 ring-accent ring-offset-1 ring-offset-card',
        )}
      >
        <span className="text-2xs font-bold leading-none">{initials}</span>
      </Squircle>
      <span className={cn(LABEL_CLS, 'text-xs')}>{displayName}</span>
    </button>
  )
}

// ── SidebarRail ────────────────────────────────────────────────────────────

export function SidebarRail() {
  const navigate = useNavigate()
  const {
    theme,
    toggleTheme,
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspacePanelOpen,
    setWorkspacePanelOpen,
  } = useAppStore()

  const { workspaces } = useWorkspaces()

  function handleWorkspaceClick(id: string) {
    if (activeWorkspaceId === id && workspacePanelOpen) {
      // Second click on the already-selected workspace closes the panel
      setWorkspacePanelOpen(false)
    } else {
      setActiveWorkspaceId(id)
      setWorkspacePanelOpen(true)
      navigate(`/workspaces/${id}`)
    }
  }

  return (
    // Outer <aside> holds the 56px slot in the flex layout — never changes size.
    <aside className="relative hidden h-full w-14 shrink-0 md:block">
      {/* Inner expanding panel — absolute so it overlays content on hover */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 z-20 flex flex-col',
          'w-14 hover:w-52 transition-[width] duration-200 ease-out',
          'bg-card border-r border-border overflow-hidden',
          'shadow-[2px_0_24px_rgba(0,0,0,0.18)]',
          'group',
        )}
      >
        {/* App logo */}
        <div className="flex items-center gap-3 px-2.5 pt-4 pb-3 shrink-0">
          <Squircle className="bg-accent/20 text-accent shrink-0">
            <ApertureIcon />
          </Squircle>
          <span
            className={cn(LABEL_CLS, 'font-semibold text-foreground text-base')}
          >
            Aperture
          </span>
        </div>

        <div className="mx-2.5 h-px bg-border shrink-0" />

        {/* New workspace */}
        <div className="pt-2 shrink-0">
          <RailButton
            icon={<Plus size={16} />}
            label="New Workspace"
            onClick={() => navigate('/workspaces')}
          />
        </div>

        {/* Workspace list */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 space-y-0.5">
          {workspaces.map((ws) => (
            <WorkspaceItem
              key={ws.id}
              workspace={ws}
              active={activeWorkspaceId === ws.id}
              onClick={() => handleWorkspaceClick(ws.id)}
            />
          ))}
        </div>

        <div className="mx-2.5 h-px bg-border shrink-0" />

        {/* Bottom utility icons */}
        <div className="py-2 space-y-0.5 shrink-0">
          <RailNavLink to="/credentials" icon={<Key size={16} />} label="Credentials" />
          <RailNavLink to="/settings" icon={<Settings size={16} />} label="Settings" />
          <RailNavLink to="/help" icon={<HelpCircle size={16} />} label="Help" />
          <RailButton
            icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggleTheme}
          />
        </div>
      </div>
    </aside>
  )
}

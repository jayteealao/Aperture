// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SlashPickerEntry, SlashPickerSourceStatus } from '@/api/types'
import { SlashPickerSurface, getSlashPickerEntryDomId } from './SlashPicker'
import { groupSlashPickerEntries } from './slash-picker-logic'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock
Element.prototype.scrollIntoView = vi.fn()

afterEach(cleanup)

function entry(overrides: Partial<SlashPickerEntry>): SlashPickerEntry {
  return {
    id: 'sdk:command:security',
    token: '/security',
    name: 'security',
    type: 'command',
    source: 'sdk',
    sourceLabel: 'SDK',
    description: 'Run a security review',
    ...overrides,
  }
}

function renderSurface(options: {
  entries?: SlashPickerEntry[]
  sourceStatuses?: SlashPickerSourceStatus[]
  activeEntryId?: string | null
  argumentHint?: string | null
  isLoading?: boolean
  error?: string | null
  onSelect?: (entry: SlashPickerEntry) => void
  onToggleFavorite?: (entry: SlashPickerEntry) => void
  favoriteEntryIds?: string[]
  favoriteToggleDisabled?: boolean
} = {}) {
  const onSelect = vi.fn(options.onSelect)
  const onToggleFavorite = vi.fn(options.onToggleFavorite)
  const onActiveEntryChange = vi.fn()
  const entries = options.entries ?? [
    entry({ id: 'sdk:security', source: 'sdk', sourceLabel: 'SDK' }),
  ]

  render(
    <SlashPickerSurface
      listId="slash-picker-list-test"
      activeEntryId={options.activeEntryId ?? entries[0]?.id ?? null}
      argumentHint={options.argumentHint ?? null}
      error={options.error ?? null}
      groups={groupSlashPickerEntries(entries, options.favoriteEntryIds)}
      isLoading={options.isLoading ?? false}
      query=""
      sourceStatuses={options.sourceStatuses ?? []}
      onActiveEntryChange={onActiveEntryChange}
      onDismiss={vi.fn()}
      onSelect={onSelect}
      onToggleFavorite={options.onToggleFavorite ? onToggleFavorite : undefined}
      favoriteToggleDisabled={options.favoriteToggleDisabled}
    />
  )

  return { onActiveEntryChange, onSelect, onToggleFavorite }
}

describe('SlashPickerSurface', () => {
  it('renders grouped duplicate commands as separate rows with source badges', () => {
    renderSurface({
      entries: [
        entry({ id: 'sdk:security', source: 'sdk', sourceLabel: 'SDK' }),
        entry({ id: 'project:security', source: 'project', sourceLabel: 'Project' }),
      ],
    })

    expect(screen.getAllByText('SDK').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Project').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('/security')).toHaveLength(2)
  })

  it('renders a compact empty row and source failure rows', () => {
    renderSurface({
      entries: [],
      sourceStatuses: [
        { source: 'sdk', status: 'failed', message: 'SDK unavailable' },
      ],
    })

    expect(screen.getByText('No commands found')).toBeTruthy()
    expect(screen.getByText(/SDK unavailable/)).toBeTruthy()
  })

  it('keeps textarea focus viable by preventing mouse down blur and selects on click', () => {
    const { onSelect } = renderSurface()
    const row = screen.getByRole('option', { name: /\/security/i })
    const mouseDown = fireEvent.mouseDown(row)

    expect(mouseDown).toBe(false)
    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'sdk:security' }))
  })

  it('marks the active row with a stable aria descendant id and shows argument hint', () => {
    renderSurface({
      activeEntryId: 'sdk:security',
      argumentHint: '[path]',
    })

    const row = document.querySelector(
      `[data-slash-picker-entry-id="${getSlashPickerEntryDomId('slash-picker-list-test', 'sdk:security')}"]`
    )
    expect(row).toBeTruthy()
    expect(row?.getAttribute('id')).toBe(getSlashPickerEntryDomId('slash-picker-list-test', 'sdk:security'))
    expect(row?.getAttribute('role')).toBe('option')
    expect(row?.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('[path]')).toBeTruthy()
  })

  it('toggles favorites without selecting the row or taking focus on mousedown', () => {
    const { onSelect, onToggleFavorite } = renderSurface({
      onToggleFavorite: vi.fn(),
    })

    const button = screen.getByRole('button', { name: /add \/security to favorites/i })
    expect(fireEvent.mouseDown(button)).toBe(false)

    fireEvent.click(button)
    expect(onToggleFavorite).toHaveBeenCalledWith(expect.objectContaining({ id: 'sdk:security' }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows pressed favorite actions for favorite entries', () => {
    renderSurface({
      favoriteEntryIds: ['sdk:security'],
      onToggleFavorite: vi.fn(),
    })

    expect(screen.getByRole('button', { name: /remove \/security from favorites/i }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Favorite')).toBeTruthy()
  })

  it('disables favorite actions while persisted favorites are loading', () => {
    const { onToggleFavorite } = renderSurface({
      onToggleFavorite: vi.fn(),
      favoriteToggleDisabled: true,
    })

    const button = screen.getByRole('button', { name: /add \/security to favorites/i })
    expect(button.getAttribute('disabled')).not.toBeNull()
    fireEvent.click(button)
    expect(onToggleFavorite).not.toHaveBeenCalled()
  })
})

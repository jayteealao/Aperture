import { describe, expect, it } from 'vitest'
import type { SlashPickerEntry } from '@/api/types'
import {
  buildSlashInsertion,
  filterSlashPickerEntries,
  getNextSlashPickerActiveEntryId,
  getSlashPickerSelectableEntryIds,
  getSlashPickerQuery,
  groupSlashPickerEntries,
  isClaudeSdkSlashPickerEligible,
  isSlashPickerTrigger,
} from './slash-picker-logic'

function entry(overrides: Partial<SlashPickerEntry>): SlashPickerEntry {
  return {
    id: 'sdk:command:security',
    token: '/security',
    name: 'security',
    type: 'command',
    source: 'sdk',
    sourceLabel: 'SDK',
    ...overrides,
  }
}

describe('slash picker trigger logic', () => {
  it('opens only when the whole composer value is the initial slash token', () => {
    expect(isSlashPickerTrigger('/')).toBe(true)
    expect(isSlashPickerTrigger('/security')).toBe(true)
    expect(isSlashPickerTrigger('/security-review')).toBe(true)
    expect(isSlashPickerTrigger('please run /security')).toBe(false)
    expect(isSlashPickerTrigger('first line\n/security')).toBe(false)
    expect(isSlashPickerTrigger('/security ')).toBe(false)
    expect(isSlashPickerTrigger('/security now')).toBe(false)
    expect(isSlashPickerTrigger('/security\tnow')).toBe(false)
    expect(isSlashPickerTrigger('/ security')).toBe(false)
  })

  it('derives the query from text after the leading slash', () => {
    expect(getSlashPickerQuery('/')).toBe('')
    expect(getSlashPickerQuery('/security')).toBe('security')
    expect(getSlashPickerQuery('/sec-')).toBe('sec-')
    expect(getSlashPickerQuery('/  security')).toBe('')
    expect(getSlashPickerQuery('/security now')).toBe('')
    expect(getSlashPickerQuery('hello /security')).toBe('')
  })

  it('is eligible only for Claude SDK sessions', () => {
    expect(isClaudeSdkSlashPickerEligible('/security', 'claude_sdk')).toBe(true)
    expect(isClaudeSdkSlashPickerEligible('/security now', 'claude_sdk')).toBe(false)
    expect(isClaudeSdkSlashPickerEligible('/security\tnow', 'claude_sdk')).toBe(false)
    expect(isClaudeSdkSlashPickerEligible('/security', 'pi_sdk')).toBe(false)
    expect(isClaudeSdkSlashPickerEligible('hello /security', 'claude_sdk')).toBe(false)
  })
})

describe('slash picker filtering and grouping', () => {
  it('filters by entry name only', () => {
    const entries = [
      entry({ id: 'sdk:security', name: 'security', description: 'audit auth' }),
      entry({ id: 'project:deploy', name: 'deploy', description: 'security rollout', source: 'project', sourceLabel: 'Project' }),
      entry({ id: 'global:review', name: 'review', sourceLabel: 'Security plugin', namespace: 'security' }),
    ]

    expect(filterSlashPickerEntries(entries, 'security')).toEqual([entries[0]])
  })

  it('preserves duplicate command names across sources', () => {
    const entries = [
      entry({ id: 'sdk:security', source: 'sdk', sourceLabel: 'SDK' }),
      entry({ id: 'project:security', source: 'project', sourceLabel: 'Project' }),
      entry({ id: 'global:security', source: 'global', sourceLabel: 'Global' }),
    ]

    const groups = groupSlashPickerEntries(entries)
    expect(groups.flatMap((group) => group.entries.map((item) => item.entry.id))).toEqual([
      'sdk:security',
      'project:security',
      'global:security',
    ])
  })

  it('can group favorites separately without losing source duplicates', () => {
    const entries = [
      entry({ id: 'sdk:security', source: 'sdk', sourceLabel: 'SDK' }),
      entry({ id: 'project:security', source: 'project', sourceLabel: 'Project' }),
    ]

    const groups = groupSlashPickerEntries(entries, ['project:security'])
    expect(groups.map((group) => group.id)).toEqual(['favorites', 'sdk'])
    expect(groups[0].entries[0]).toEqual({ entry: entries[1], isFavorite: true })
    expect(groups[1].entries[0]).toEqual({ entry: entries[0], isFavorite: false })
  })

  it('orders favorites by stored favorite ids and ignores stale ids', () => {
    const entries = [
      entry({ id: 'sdk:security', source: 'sdk', sourceLabel: 'SDK' }),
      entry({ id: 'project:security', source: 'project', sourceLabel: 'Project' }),
      entry({ id: 'global:review', source: 'global', sourceLabel: 'Global', name: 'review', token: '/review' }),
    ]

    const groups = groupSlashPickerEntries(entries, [
      'missing:stale',
      'global:review',
      'sdk:security',
    ])

    expect(groups[0].id).toBe('favorites')
    expect(groups[0].entries.map((item) => item.entry.id)).toEqual([
      'global:review',
      'sdk:security',
    ])
    expect(groups.flatMap((group) => group.entries.map((item) => item.entry.id))).toEqual([
      'global:review',
      'sdk:security',
      'project:security',
    ])
  })

  it('omits the favorites group when every favorite id is stale', () => {
    const groups = groupSlashPickerEntries([
      entry({ id: 'sdk:security', source: 'sdk', sourceLabel: 'SDK' }),
    ], ['global:missing'])

    expect(groups.map((group) => group.id)).toEqual(['sdk'])
  })

  it('returns selectable entry ids in grouped display order', () => {
    const entries = [
      entry({ id: 'sdk:security', source: 'sdk', sourceLabel: 'SDK' }),
      entry({ id: 'project:deploy', source: 'project', sourceLabel: 'Project' }),
    ]

    expect(getSlashPickerSelectableEntryIds(groupSlashPickerEntries(entries))).toEqual([
      'sdk:security',
      'project:deploy',
    ])
  })

  it('moves the active item with wrapping keyboard navigation', () => {
    const groups = groupSlashPickerEntries([
      entry({ id: 'sdk:security', source: 'sdk', sourceLabel: 'SDK' }),
      entry({ id: 'project:deploy', source: 'project', sourceLabel: 'Project' }),
    ])

    expect(getNextSlashPickerActiveEntryId(groups, null, 'next')).toBe('sdk:security')
    expect(getNextSlashPickerActiveEntryId(groups, 'sdk:security', 'next')).toBe('project:deploy')
    expect(getNextSlashPickerActiveEntryId(groups, 'project:deploy', 'next')).toBe('sdk:security')
    expect(getNextSlashPickerActiveEntryId(groups, 'sdk:security', 'previous')).toBe('project:deploy')
  })
})

describe('slash picker insertion', () => {
  it('returns the slash token and separate argument hint state without submit', () => {
    expect(buildSlashInsertion(entry({ token: '/security', argumentHint: '[path]' }))).toEqual({
      value: '/security',
      argumentHint: '[path]',
      shouldSubmit: false,
    })
  })

  it('omits empty argument hints', () => {
    expect(buildSlashInsertion(entry({ argumentHint: '   ' })).argumentHint).toBeNull()
  })
})

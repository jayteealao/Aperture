// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { GitBranchLabel } from './GitBranchLabel'

afterEach(cleanup)

describe('GitBranchLabel', () => {
  it('renders muted icon only when branch is null', () => {
    const { container } = render(<GitBranchLabel branch={null} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByText(/./)).toBeNull()
  })

  it('renders icon + branch name when branch is provided', () => {
    render(<GitBranchLabel branch="main" />)
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getByLabelText('Branch: main')).toBeTruthy()
  })

  it('renders short SHA for detached HEAD', () => {
    render(<GitBranchLabel branch="a1b2c3d" />)
    expect(screen.getByText('a1b2c3d')).toBeTruthy()
    expect(screen.getByLabelText('Detached HEAD (a1b2c3d)')).toBeTruthy()
  })

  it('applies font-mono and text-2xs classes to branch text', () => {
    render(<GitBranchLabel branch="feature/xyz" />)
    const text = screen.getByText('feature/xyz')
    expect(text.classList.contains('font-mono')).toBe(true)
    expect(text.classList.contains('text-2xs')).toBe(true)
  })

  it('applies truncation classes to branch text', () => {
    render(<GitBranchLabel branch="main" />)
    const text = screen.getByText('main')
    expect(text.classList.contains('text-ellipsis')).toBe(true)
    expect(text.classList.contains('overflow-hidden')).toBe(true)
    expect(text.classList.contains('whitespace-nowrap')).toBe(true)
  })

  it('has correct aria-label for a named branch', () => {
    render(<GitBranchLabel branch="main" />)
    expect(screen.getByLabelText('Branch: main')).toBeTruthy()
  })

  it('has correct aria-label for a feature branch', () => {
    render(<GitBranchLabel branch="feature/xyz" />)
    expect(screen.getByLabelText('Branch: feature/xyz')).toBeTruthy()
  })
})

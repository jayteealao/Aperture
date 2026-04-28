// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ClaudeMascotIcon } from './ClaudeMascotIcon'

afterEach(cleanup)

describe('ClaudeMascotIcon', () => {
  it('renders an SVG element', () => {
    const { container } = render(<ClaudeMascotIcon />)
    expect(container.firstChild?.nodeName).toBe('svg')
  })

  it('has role="img" and aria-label="Claude Code"', () => {
    render(<ClaudeMascotIcon />)
    const svg = screen.getByRole('img')
    expect(svg.getAttribute('aria-label')).toBe('Claude Code')
  })

  it('has data-slot="clawd-mascot"', () => {
    const { container } = render(<ClaudeMascotIcon />)
    expect(
      (container.firstChild as SVGSVGElement).getAttribute('data-slot'),
    ).toBe('clawd-mascot')
  })

  it('uses viewBox 0 0 15 16', () => {
    const { container } = render(<ClaudeMascotIcon />)
    expect(
      (container.firstChild as SVGSVGElement).getAttribute('viewBox'),
    ).toBe('0 0 15 16')
  })

  it('defaults to size 20', () => {
    const { container } = render(<ClaudeMascotIcon />)
    const svg = container.firstChild as SVGSVGElement
    expect(svg.style.width).toBe('20px')
    expect(svg.style.height).toBe('20px')
  })

  it('applies custom size', () => {
    const { container } = render(<ClaudeMascotIcon size={32} />)
    const svg = container.firstChild as SVGSVGElement
    expect(svg.style.width).toBe('32px')
    expect(svg.style.height).toBe('32px')
  })

  it('merges custom className', () => {
    const { container } = render(
      <ClaudeMascotIcon className="my-custom-class" />,
    )
    const svg = container.firstChild as SVGSVGElement
    expect(svg.classList.contains('my-custom-class')).toBe(true)
    expect(svg.classList.contains('transition-colors')).toBe(true)
  })

  it('is memoized — same props return same reference', () => {
    const { container, rerender } = render(<ClaudeMascotIcon size={20} />)
    const first = container.firstChild
    rerender(<ClaudeMascotIcon size={20} />)
    expect(container.firstChild).toBe(first)
  })
})

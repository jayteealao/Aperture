import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)
import { Button } from './button'

// ---------------------------------------------------------------------------
// Button — rendering and props
// ---------------------------------------------------------------------------
describe('Button', () => {
  it('renders a <button> element by default', () => {
    const { container } = render(<Button>Click me</Button>)
    expect(container.firstChild?.nodeName).toBe('BUTTON')
  })

  it('renders children', () => {
    render(<Button>Save</Button>)
    expect(screen.getByText('Save')).toBeTruthy()
  })

  it('calls onClick when clicked', () => {
    const handler = vi.fn()
    render(<Button onClick={handler}>Go</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  // ── disabled ──────────────────────────────────────────────────────────────

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>No</Button>)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })

  // ── loading ───────────────────────────────────────────────────────────────

  it('shows spinner and disables the button when loading=true', () => {
    render(<Button loading data-testid="btn">Save</Button>)
    const btn = screen.getByTestId('btn') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    // Spinner is a CSS-only div with role="status"
    expect(btn.querySelector('[role="status"]')).toBeTruthy()
  })

  it('hides the leftIcon when loading (spinner takes precedence)', () => {
    render(
      <Button loading leftIcon={<span data-testid="icon" />}>
        Save
      </Button>
    )
    expect(screen.queryByTestId('icon')).toBeNull()
  })

  it('does not disable the button when loading is absent', () => {
    render(<Button>Save</Button>)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false)
  })

  // ── leftIcon / rightIcon ──────────────────────────────────────────────────

  it('renders leftIcon before children', () => {
    render(
      <Button leftIcon={<span data-testid="left" />}>Label</Button>
    )
    expect(screen.getByTestId('left')).toBeTruthy()
    const btn = screen.getByRole('button')
    const left = btn.querySelector('[data-testid="left"]')
    const text = btn.querySelector('span:not(:has([data-testid]))')
    expect(left).toBeTruthy()
    // left icon wrapper comes before the text node
    expect(btn.innerHTML.indexOf('left')).toBeLessThan(btn.innerHTML.indexOf('Label'))
  })

  it('renders rightIcon after children', () => {
    render(
      <Button rightIcon={<span data-testid="right" />}>Label</Button>
    )
    expect(screen.getByTestId('right')).toBeTruthy()
    const btn = screen.getByRole('button')
    expect(btn.innerHTML.indexOf('Label')).toBeLessThan(btn.innerHTML.indexOf('right'))
  })

  it('does not render rightIcon when loading=true', () => {
    render(
      <Button loading rightIcon={<span data-testid="right" />}>
        Save
      </Button>
    )
    expect(screen.queryByTestId('right')).toBeNull()
  })

  // ── asChild ───────────────────────────────────────────────────────────────

  it('renders as the child element when asChild=true', () => {
    const { container } = render(
      <Button asChild>
        <a href="/target">Link</a>
      </Button>
    )
    expect(container.firstChild?.nodeName).toBe('A')
    expect((container.firstChild as HTMLAnchorElement).href).toContain('/target')
  })

  // ── variant classes ───────────────────────────────────────────────────────

  it('applies default variant classes when no variant is specified', () => {
    render(<Button data-testid="btn">Default</Button>)
    const cls = screen.getByTestId('btn').className
    // default variant maps to bg-primary
    expect(cls).toContain('bg-primary')
  })

  it('applies destructive variant classes', () => {
    render(<Button variant="destructive" data-testid="btn">Delete</Button>)
    expect(screen.getByTestId('btn').className).toContain('bg-destructive')
  })

  it('applies ghost variant classes', () => {
    render(<Button variant="ghost" data-testid="btn">Ghost</Button>)
    const cls = screen.getByTestId('btn').className
    expect(cls).toContain('hover:bg-accent')
    expect(cls).not.toContain('bg-primary')
  })

  it('applies outline variant classes', () => {
    render(<Button variant="outline" data-testid="btn">Outline</Button>)
    expect(screen.getByTestId('btn').className).toContain('border')
  })

  // ── size classes ──────────────────────────────────────────────────────────

  it('applies sm size classes', () => {
    render(<Button size="sm" data-testid="btn">Sm</Button>)
    expect(screen.getByTestId('btn').className).toContain('h-8')
  })

  it('applies lg size classes', () => {
    render(<Button size="lg" data-testid="btn">Lg</Button>)
    expect(screen.getByTestId('btn').className).toContain('h-10')
  })

  it('applies icon size (square button)', () => {
    render(<Button size="icon" data-testid="btn">×</Button>)
    expect(screen.getByTestId('btn').className).toContain('size-9')
  })

  it('applies xs size classes', () => {
    render(<Button size="xs" data-testid="btn">xs</Button>)
    expect(screen.getByTestId('btn').className).toContain('h-6')
  })

  // ── custom className merges ───────────────────────────────────────────────

  it('merges custom className with CVA classes', () => {
    render(<Button className="my-custom-class" data-testid="btn">X</Button>)
    expect(screen.getByTestId('btn').className).toContain('my-custom-class')
    expect(screen.getByTestId('btn').className).toContain('inline-flex')
  })

  // ── data attributes ───────────────────────────────────────────────────────

  it('sets data-slot="button"', () => {
    render(<Button data-testid="btn">X</Button>)
    expect(screen.getByTestId('btn').getAttribute('data-slot')).toBe('button')
  })

  it('sets data-variant to the active variant', () => {
    render(<Button variant="destructive" data-testid="btn">X</Button>)
    expect(screen.getByTestId('btn').getAttribute('data-variant')).toBe('destructive')
  })
})

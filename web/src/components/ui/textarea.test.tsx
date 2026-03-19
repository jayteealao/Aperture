import { afterEach, describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
import { Textarea } from './textarea'
import { TextareaField } from './textarea-field'

// ---------------------------------------------------------------------------
// Textarea — primitive
// ---------------------------------------------------------------------------
describe('Textarea', () => {
  it('renders a bare <textarea> with no wrapper element', () => {
    const { container } = render(<Textarea placeholder="test" />)
    expect(container.firstChild?.nodeName).toBe('TEXTAREA')
  })

  it('does not include field-sizing-content by default (regression guard)', () => {
    const { container } = render(<Textarea data-testid="ta" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).not.toContain('field-sizing-content')
  })

  it('accepts field-sizing-content as a className opt-in', () => {
    const { container } = render(<Textarea className="field-sizing-content" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('field-sizing-content')
  })
})

// ---------------------------------------------------------------------------
// TextareaField — compound
// ---------------------------------------------------------------------------
describe('TextareaField', () => {
  // ── autoGrow behaviour ────────────────────────────────────────────────────

  it('does NOT apply field-sizing-content when autoGrow is omitted (default false)', () => {
    render(<TextareaField data-testid="ta" />)
    const el = screen.getByTestId('ta')
    expect(el.className).not.toContain('field-sizing-content')
  })

  it('does NOT apply field-sizing-content when autoGrow is explicitly false', () => {
    render(<TextareaField autoGrow={false} data-testid="ta" />)
    const el = screen.getByTestId('ta')
    expect(el.className).not.toContain('field-sizing-content')
  })

  it('applies field-sizing-content when autoGrow is true', () => {
    render(<TextareaField autoGrow data-testid="ta" />)
    const el = screen.getByTestId('ta')
    expect(el.className).toContain('field-sizing-content')
  })

  // ── label / id ────────────────────────────────────────────────────────────

  it('renders a label associated with the textarea via htmlFor/id', () => {
    render(<TextareaField label="Description" />)
    const label = screen.getByText('Description')
    const ta = screen.getByRole('textbox')
    expect(label.tagName).toBe('LABEL')
    expect((label as HTMLLabelElement).htmlFor).toBe(ta.id)
    expect(ta.id).toBe('description')
  })

  it('uses the explicit id prop over the label-derived id', () => {
    render(<TextareaField label="Notes" id="custom-notes" />)
    expect(screen.getByRole('textbox').id).toBe('custom-notes')
  })

  it('renders no label element when label prop is omitted', () => {
    render(<TextareaField placeholder="bare" />)
    expect(screen.queryByRole('label')).toBeNull()
  })

  // ── error / hint ──────────────────────────────────────────────────────────

  it('renders the error message and wires aria-describedby to it', () => {
    render(<TextareaField label="Bio" error="Too long" />)
    const ta = screen.getByRole('textbox')
    const errorEl = screen.getByText('Too long')
    expect(errorEl.id).toBe(`${ta.id}-error`)
    expect(ta.getAttribute('aria-describedby')).toBe(errorEl.id)
  })

  it('applies error border class when error is provided', () => {
    render(<TextareaField label="Bio" error="Too long" data-testid="ta" />)
    expect(screen.getByTestId('ta').className).toContain('border-destructive')
  })

  it('renders the hint message and wires aria-describedby to it', () => {
    render(<TextareaField label="Bio" hint="Max 500 characters" />)
    const ta = screen.getByRole('textbox')
    const hintEl = screen.getByText('Max 500 characters')
    expect(hintEl.id).toBe(`${ta.id}-hint`)
    expect(ta.getAttribute('aria-describedby')).toBe(hintEl.id)
  })

  it('shows error instead of hint when both are provided', () => {
    render(<TextareaField label="Bio" error="Required" hint="Helpful tip" />)
    expect(screen.getByText('Required')).toBeTruthy()
    expect(screen.queryByText('Helpful tip')).toBeNull()
    const ta = screen.getByRole('textbox')
    expect(ta.getAttribute('aria-describedby')).toContain('-error')
  })
})

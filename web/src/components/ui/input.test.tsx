// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)
import { Search } from 'lucide-react'
import { Input } from './input'
import { InputField } from './input-field'

// ---------------------------------------------------------------------------
// Input — primitive
// ---------------------------------------------------------------------------
describe('Input', () => {
  it('renders a bare <input> with no wrapper div when no icons or password', () => {
    const { container } = render(<Input placeholder="test" />)
    // The first (and only) child of the container should be the input itself,
    // not a wrapping div. This is the L1 regression guard.
    expect(container.firstChild?.nodeName).toBe('INPUT')
  })

  it('renders a wrapper div when leftIcon is provided', () => {
    const { container } = render(<Input leftIcon={<Search size={16} />} />)
    expect(container.firstChild?.nodeName).toBe('DIV')
    expect(container.querySelector('input')).toBeTruthy()
  })

  it('renders a wrapper div when rightIcon is provided', () => {
    const { container } = render(<Input rightIcon={<Search size={16} />} />)
    expect(container.firstChild?.nodeName).toBe('DIV')
  })

  it('applies error classes when error=true', () => {
    render(<Input error data-testid="inp" />)
    const input = screen.getByTestId('inp')
    expect(input.className).toContain('border-destructive')
  })

  it('sets aria-invalid when error=true', () => {
    render(<Input error data-testid="inp" />)
    expect(screen.getByTestId('inp').getAttribute('aria-invalid')).toBe('true')
  })

  it('does not set aria-invalid when error is absent', () => {
    render(<Input data-testid="inp" />)
    expect(screen.getByTestId('inp').getAttribute('aria-invalid')).toBeNull()
  })

  it('sets aria-invalid on the wrapped input path (with icon)', () => {
    render(<Input error leftIcon={<span />} data-testid="inp" />)
    expect(screen.getByTestId('inp').getAttribute('aria-invalid')).toBe('true')
  })

  it('does not apply error classes when error is absent', () => {
    render(<Input data-testid="inp" />)
    expect(screen.getByTestId('inp').className).not.toContain('border-destructive')
  })

  it('toggles password visibility on eye-button click', () => {
    render(<Input type="password" data-testid="inp" />)
    const input = screen.getByTestId('inp') as HTMLInputElement
    expect(input.type).toBe('password')

    const toggleBtn = screen.getByRole('button')
    fireEvent.click(toggleBtn)
    expect(input.type).toBe('text')

    fireEvent.click(toggleBtn)
    expect(input.type).toBe('password')
  })

  it('does not render toggle button for non-password type', () => {
    render(<Input type="text" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// InputField — compound
// ---------------------------------------------------------------------------
describe('InputField', () => {
  it('renders a label associated with the input via htmlFor/id', () => {
    render(<InputField label="Email address" />)
    const label = screen.getByText('Email address')
    const input = screen.getByRole('textbox')
    expect(label.tagName).toBe('LABEL')
    expect((label as HTMLLabelElement).htmlFor).toBe(input.id)
    expect(input.id).toBe('email-address')
  })

  it('uses the explicit id prop over the label-derived id', () => {
    render(<InputField label="Email" id="custom-id" />)
    expect(screen.getByRole('textbox').id).toBe('custom-id')
  })

  it('renders no label element when label prop is omitted', () => {
    render(<InputField placeholder="bare" />)
    expect(screen.queryByRole('label')).toBeNull()
  })

  it('renders the error message and wires aria-describedby to it', () => {
    render(<InputField label="URL" error="Must be a valid URL" />)
    const input = screen.getByRole('textbox')
    const errorEl = screen.getByText('Must be a valid URL')
    expect(errorEl.id).toBe(`${input.id}-error`)
    expect(input.getAttribute('aria-describedby')).toBe(errorEl.id)
  })

  it('renders the hint message and wires aria-describedby to it', () => {
    render(<InputField label="Path" hint="Absolute path only" />)
    const input = screen.getByRole('textbox')
    const hintEl = screen.getByText('Absolute path only')
    expect(hintEl.id).toBe(`${input.id}-hint`)
    expect(input.getAttribute('aria-describedby')).toBe(hintEl.id)
  })

  it('shows error instead of hint when both are provided', () => {
    render(<InputField label="Path" error="Required" hint="Helpful tip" />)
    expect(screen.getByText('Required')).toBeTruthy()
    expect(screen.queryByText('Helpful tip')).toBeNull()
    // aria-describedby should point to error, not hint
    const input = screen.getByRole('textbox')
    expect(input.getAttribute('aria-describedby')).toContain('-error')
  })

  it('passes error boolean to Input for border styling', () => {
    render(<InputField label="Field" error="Bad value" data-testid="inp" />)
    const input = screen.getByTestId('inp')
    expect(input.className).toContain('border-destructive')
  })

  it('sets aria-invalid on the underlying input when error is provided', () => {
    render(<InputField label="Field" error="Bad value" data-testid="inp" />)
    expect(screen.getByTestId('inp').getAttribute('aria-invalid')).toBe('true')
  })

  it('does not set aria-invalid when no error is provided', () => {
    render(<InputField label="Field" data-testid="inp" />)
    expect(screen.getByTestId('inp').getAttribute('aria-invalid')).toBeNull()
  })
})

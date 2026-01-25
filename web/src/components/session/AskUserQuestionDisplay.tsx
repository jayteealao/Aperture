import { useState, useCallback } from 'react'
import { cn } from '@/utils/cn'
import { Check, Circle, Square, CheckSquare, MessageCircleQuestion, ChevronLeft, ChevronRight, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const OTHER_OPTION_KEY = '__other__'

interface QuestionOption {
  label: string
  description: string
}

interface Question {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect: boolean
}

interface AskUserQuestionInput {
  questions: Question[]
}

interface AskUserQuestionDisplayProps {
  input: AskUserQuestionInput
  onSubmit: (answers: Record<string, string>) => void
}

export function AskUserQuestionDisplay({ input, onSubmit }: AskUserQuestionDisplayProps) {
  const { questions } = input
  const [activeTab, setActiveTab] = useState(0)

  // Track selected answers for each question (by index)
  // For multiSelect, value is comma-separated labels
  // For single select, value is the selected label
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string[]>>(() => {
    const initial: Record<number, string[]> = {}
    questions.forEach((_, idx) => {
      initial[idx] = []
    })
    return initial
  })

  // Track "Other" text input for each question
  const [otherText, setOtherText] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {}
    questions.forEach((_, idx) => {
      initial[idx] = ''
    })
    return initial
  })

  const handleOptionClick = useCallback((questionIdx: number, optionLabel: string, multiSelect: boolean) => {
    setSelectedAnswers(prev => {
      const current = prev[questionIdx] || []

      if (multiSelect) {
        // Toggle selection for multiSelect
        if (current.includes(optionLabel)) {
          return { ...prev, [questionIdx]: current.filter(l => l !== optionLabel) }
        } else {
          return { ...prev, [questionIdx]: [...current, optionLabel] }
        }
      } else {
        // Single select - replace
        return { ...prev, [questionIdx]: [optionLabel] }
      }
    })
  }, [])

  const handleOtherTextChange = useCallback((questionIdx: number, text: string) => {
    setOtherText(prev => ({ ...prev, [questionIdx]: text }))
  }, [])

  const handleSubmit = useCallback(() => {
    // Build answers object keyed by question header
    const answers: Record<string, string> = {}
    questions.forEach((q, idx) => {
      const selected = selectedAnswers[idx] || []
      const otherValue = otherText[idx] || ''

      // Replace OTHER_OPTION_KEY with actual text
      const resolvedAnswers = selected.map(s =>
        s === OTHER_OPTION_KEY ? otherValue : s
      ).filter(s => s.length > 0)

      if (resolvedAnswers.length > 0) {
        answers[q.header] = resolvedAnswers.join(', ')
      }
    })
    onSubmit(answers)
  }, [questions, selectedAnswers, otherText, onSubmit])

  // Check if question is answered (has selection, and if "Other" is selected, has text)
  const isQuestionAnswered = (idx: number) => {
    const selected = selectedAnswers[idx] || []
    if (selected.length === 0) return false
    // If "Other" is selected, must have text
    if (selected.includes(OTHER_OPTION_KEY)) {
      return (otherText[idx] || '').trim().length > 0
    }
    return true
  }

  const allAnswered = questions.every((_, idx) => isQuestionAnswered(idx))
  const answeredCount = questions.filter((_, idx) => isQuestionAnswered(idx)).length

  const currentQuestion = questions[activeTab]
  const isMultiQuestion = questions.length > 1

  const goToPrev = () => setActiveTab(prev => Math.max(0, prev - 1))
  const goToNext = () => setActiveTab(prev => Math.min(questions.length - 1, prev + 1))

  return (
    <div className="mt-3">
      {/* Tab bar for multiple questions */}
      {isMultiQuestion && (
        <div className="flex items-center gap-1 mb-3 pb-2 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none">
            {questions.map((q, idx) => {
              const isAnswered = (selectedAnswers[idx] || []).length > 0
              const isActive = idx === activeTab

              return (
                <button
                  key={idx}
                  onClick={() => setActiveTab(idx)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0',
                    'flex items-center gap-1.5',
                    isActive
                      ? 'bg-accent text-[#0a0a0f]'
                      : isAnswered
                        ? 'bg-accent/20 text-accent hover:bg-accent/30'
                        : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                  )}
                >
                  {isAnswered && !isActive && <Check size={12} />}
                  <span>{q.header}</span>
                </button>
              )
            })}
          </div>
          <span className="text-xs text-[var(--color-text-muted)] shrink-0 ml-2">
            {answeredCount}/{questions.length}
          </span>
        </div>
      )}

      {/* Current question */}
      <QuestionCard
        question={currentQuestion}
        selectedOptions={selectedAnswers[activeTab] || []}
        onOptionClick={(label) => handleOptionClick(activeTab, label, currentQuestion.multiSelect)}
        otherText={otherText[activeTab] || ''}
        onOtherTextChange={(text) => handleOtherTextChange(activeTab, text)}
      />

      {/* Navigation and submit */}
      <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--color-border)]">
        {isMultiQuestion ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPrev}
              disabled={activeTab === 0}
            >
              <ChevronLeft size={16} />
              Prev
            </Button>
            <span className="text-xs text-[var(--color-text-muted)]">
              {activeTab + 1} of {questions.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToNext}
              disabled={activeTab === questions.length - 1}
            >
              Next
              <ChevronRight size={16} />
            </Button>
          </div>
        ) : (
          <div />
        )}

        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!allAnswered}
        >
          <Check size={16} className="mr-1" />
          Submit{isMultiQuestion ? ` (${answeredCount}/${questions.length})` : ''}
        </Button>
      </div>
    </div>
  )
}

interface QuestionCardProps {
  question: Question
  selectedOptions: string[]
  onOptionClick: (label: string) => void
  otherText: string
  onOtherTextChange: (text: string) => void
}

function QuestionCard({ question, selectedOptions, onOptionClick, otherText, onOtherTextChange }: QuestionCardProps) {
  const isOtherSelected = selectedOptions.includes(OTHER_OPTION_KEY)

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] overflow-hidden">
      {/* Question header */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion size={14} className="text-accent shrink-0" />
          <span className="text-xs font-medium text-accent">{question.header}</span>
          {question.multiSelect && (
            <span className="text-2xs text-[var(--color-text-muted)] ml-auto">
              (select multiple)
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--color-text-primary)] mt-1">
          {question.question}
        </p>
      </div>

      {/* Options - scrollable if too many */}
      <div className="divide-y divide-[var(--color-border)] max-h-[240px] overflow-y-auto scrollbar-thin">
        {question.options.map((option, oIdx) => {
          const isSelected = selectedOptions.includes(option.label)
          const Icon = question.multiSelect
            ? (isSelected ? CheckSquare : Square)
            : (isSelected ? Check : Circle)

          return (
            <button
              key={oIdx}
              onClick={() => onOptionClick(option.label)}
              className={cn(
                'w-full px-3 py-2 text-left transition-colors',
                'hover:bg-[var(--color-surface-hover)]',
                isSelected && 'bg-accent/10'
              )}
            >
              <div className="flex items-start gap-2">
                <Icon
                  size={16}
                  className={cn(
                    'shrink-0 mt-0.5 transition-colors',
                    isSelected ? 'text-accent' : 'text-[var(--color-text-muted)]'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className={cn(
                    'text-sm font-medium',
                    isSelected ? 'text-accent' : 'text-[var(--color-text-primary)]'
                  )}>
                    {option.label}
                  </div>
                  {option.description && (
                    <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {option.description}
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}

        {/* Other option */}
        <div className={cn(
          'px-3 py-2 transition-colors',
          isOtherSelected && 'bg-accent/10'
        )}>
          <button
            onClick={() => onOptionClick(OTHER_OPTION_KEY)}
            className="w-full text-left"
          >
            <div className="flex items-start gap-2">
              {question.multiSelect ? (
                isOtherSelected ? <CheckSquare size={16} className="shrink-0 mt-0.5 text-accent" /> : <Square size={16} className="shrink-0 mt-0.5 text-[var(--color-text-muted)]" />
              ) : (
                isOtherSelected ? <Check size={16} className="shrink-0 mt-0.5 text-accent" /> : <Circle size={16} className="shrink-0 mt-0.5 text-[var(--color-text-muted)]" />
              )}
              <div className="min-w-0 flex-1">
                <div className={cn(
                  'text-sm font-medium flex items-center gap-1.5',
                  isOtherSelected ? 'text-accent' : 'text-[var(--color-text-primary)]'
                )}>
                  <PenLine size={14} />
                  Other
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Enter a custom response
                </div>
              </div>
            </div>
          </button>

          {/* Text input when Other is selected */}
          {isOtherSelected && (
            <div className="mt-2 ml-6">
              <input
                type="text"
                value={otherText}
                onChange={(e) => onOtherTextChange(e.target.value)}
                placeholder="Type your answer..."
                autoFocus
                className={cn(
                  'w-full px-3 py-2 text-sm rounded-md',
                  'bg-[var(--color-bg-primary)] border border-[var(--color-border)]',
                  'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]',
                  'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent'
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Type guard to check if rawInput is AskUserQuestion format
export function isAskUserQuestionInput(input: unknown): input is AskUserQuestionInput {
  if (!input || typeof input !== 'object') return false
  const obj = input as Record<string, unknown>
  if (!Array.isArray(obj.questions)) return false
  return obj.questions.every((q: unknown) => {
    if (!q || typeof q !== 'object') return false
    const question = q as Record<string, unknown>
    return (
      typeof question.question === 'string' &&
      typeof question.header === 'string' &&
      Array.isArray(question.options) &&
      typeof question.multiSelect === 'boolean'
    )
  })
}

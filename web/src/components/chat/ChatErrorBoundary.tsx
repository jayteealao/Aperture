import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ChatErrorBoundaryProps {
  children: ReactNode
}

interface ChatErrorBoundaryState {
  error: Error | null
}

/**
 * Error boundary that catches render errors in the chat message area.
 *
 * Class component required — React error boundaries cannot be function components.
 * Provides a recovery button so users can continue chatting without a full page reload.
 */
export class ChatErrorBoundary extends Component<
  ChatErrorBoundaryProps,
  ChatErrorBoundaryState
> {
  constructor(props: ChatErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ChatErrorBoundary] Render error:', error, info.componentStack)
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="glass rounded-2xl px-6 py-5 max-w-md text-center space-y-3">
            <AlertCircle
              className="mx-auto text-danger"
              size={32}
            />
            <h3 className="font-medium text-foreground">
              Unable to display conversation
            </h3>
            <p className="text-sm text-muted-foreground">
              A display error occurred, but your messages are safe.
              Try again, or refresh the page if the problem persists.
            </p>
            {import.meta.env.DEV && (
              <pre className="text-xs text-danger/80 bg-danger/5 rounded-lg p-3 overflow-x-auto text-left">
                {this.state.error.message}
              </pre>
            )}
            <Button
              onClick={() => this.setState({ error: null })}
              size="sm"
              variant="default"
            >
              Try again
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

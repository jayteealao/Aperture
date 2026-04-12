import { Card, CardContent } from '@/components/ui/card'
import {
  MessageSquare,
  Terminal,
  Key,
  Zap,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'

export default function Help() {
  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-foreground mb-1">Help & Documentation</h2>
        <p className="text-muted-foreground mb-8">
          Learn how to use Aperture effectively
        </p>

        {/* Two-column: Quick Start (prominent) + Resources (compact) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
          {/* Quick Start — 3 cols, hero treatment */}
          <Card padding="lg" className="lg:col-span-3">
            <h3 className="text-base font-semibold text-foreground mb-5">Quick Start</h3>
            <CardContent className="mt-0">
              <div className="space-y-5">
                <Step
                  number={1}
                  title="Connect to Gateway"
                  description="Enter your Aperture Gateway URL and authentication token on the onboarding page."
                />
                <Step
                  number={2}
                  title="Create a Session"
                  description="Choose an AI agent (Claude, Codex, or Gemini) and configure authentication."
                />
                <Step
                  number={3}
                  title="Start Chatting"
                  description="Send messages and receive streaming responses from your AI agent."
                />
                <Step
                  number={4}
                  title="Manage Credentials"
                  description="Store API keys securely for easier session creation."
                />
              </div>
            </CardContent>
          </Card>

          {/* Resources — 2 cols, stacked links */}
          <Card padding="lg" className="lg:col-span-2">
            <h3 className="text-base font-semibold text-foreground mb-5">Resources</h3>
            <CardContent className="mt-0">
              <div className="space-y-1">
                <ResourceLink
                  href="https://github.com/jayteealao/Aperture"
                  title="GitHub Repository"
                  description="Source code and issues"
                />
                <ResourceLink
                  href="https://github.com/jayteealao/Aperture/blob/main/README.md"
                  title="Documentation"
                  description="Full docs and API reference"
                />
                <ResourceLink
                  href="https://github.com/jayteealao/Aperture/issues"
                  title="Issue Tracker"
                  description="Report bugs or request features"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features — full-width 4-col grid */}
        <div className="mb-8">
          <h3 className="text-base font-semibold text-foreground mb-4">Features</h3>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<MessageSquare size={20} />}
              title="Real-time Chat"
              description="Stream responses from AI agents with WebSocket support"
            />
            <FeatureCard
              icon={<Terminal size={20} />}
              title="Multi-Agent Support"
              description="Connect to Claude Code, Codex, and Gemini agents"
            />
            <FeatureCard
              icon={<Key size={20} />}
              title="Secure Credentials"
              description="Store API keys securely on the gateway server"
            />
            <FeatureCard
              icon={<Zap size={20} />}
              title="Command Palette"
              description={`Quick access to all actions with ${/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'}+K`}
            />
          </div>
        </div>

        {/* Troubleshooting — full width, compact accordion */}
        <div className="pb-8">
          <h3 className="text-base font-semibold text-foreground mb-4">Troubleshooting</h3>
          <Card padding="md">
            <div className="divide-y divide-border">
              <FAQ
                question="Connection keeps failing"
                answer="Check that your gateway server is running and the URL is correct. Verify your authentication token is valid."
              />
              <FAQ
                question="Messages aren't being sent"
                answer="Ensure you're connected to the session (check the status indicator). If reconnecting, wait for the WebSocket to establish."
              />
              <FAQ
                question="Session creation fails"
                answer="Verify that the agent type you selected is supported by your gateway and that authentication credentials are correct."
              />
              <FAQ
                question="How do I clear my data?"
                answer="Go to Settings > Data Management > Clear All Data. This will remove all local sessions and credentials."
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Step({
  number,
  title,
  description,
}: {
  number: number
  title: string
  description: string
}) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-accent text-nebula-bg-primary flex items-center justify-center font-semibold text-sm shrink-0">
        {number}
      </div>
      <div>
        <h4 className="font-medium text-foreground">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Card padding="md">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-accent">{icon}</span>
        <h4 className="font-medium text-foreground">{title}</h4>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Card>
  )
}

function FAQ({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group">
      <summary className="flex items-center justify-between cursor-pointer list-none px-2 py-3 rounded-lg hover:bg-secondary">
        <span className="font-medium text-foreground">{question}</span>
        <ChevronRight
          size={18}
          className="text-foreground/40 transition-transform group-open:rotate-90"
        />
      </summary>
      <p className="px-2 pb-3 text-sm text-muted-foreground">{answer}</p>
    </details>
  )
}

function ResourceLink({
  href,
  title,
  description,
}: {
  href: string
  title: string
  description: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary transition-colors group"
    >
      <div>
        <h4 className="font-medium text-foreground group-hover:text-accent transition-colors">
          {title}
        </h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ExternalLink size={16} className="text-foreground/40 shrink-0" />
    </a>
  )
}

import { Card, CardHeader, CardContent } from '@/components/ui/Card'
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
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">Help & Documentation</h2>
        <p className="text-[var(--color-text-secondary)] mb-6">
          Learn how to use Aperture effectively
        </p>

        {/* Quick Start */}
        <Card variant="glass" padding="lg" className="mb-6">
          <CardHeader
            title="Quick Start Guide"
            subtitle="Get up and running in minutes"
          />
          <CardContent>
            <div className="space-y-4">
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

        {/* Features */}
        <Card variant="glass" padding="lg" className="mb-6">
          <CardHeader
            title="Features"
            subtitle="What Aperture can do"
          />
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
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
                description="Quick access to all actions with Cmd+K"
              />
            </div>
          </CardContent>
        </Card>

        {/* Troubleshooting */}
        <Card variant="glass" padding="lg" className="mb-6">
          <CardHeader
            title="Troubleshooting"
            subtitle="Common issues and solutions"
          />
          <CardContent>
            <div className="space-y-4">
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
          </CardContent>
        </Card>

        {/* Links */}
        <Card variant="glass" padding="lg">
          <CardHeader
            title="Resources"
            subtitle="External links and documentation"
          />
          <CardContent>
            <div className="space-y-3">
              <ResourceLink
                href="https://github.com/jayteealao/Aperture"
                title="GitHub Repository"
                description="View source code and report issues"
              />
              <ResourceLink
                href="https://github.com/jayteealao/Aperture/blob/main/README.md"
                title="Documentation"
                description="Full documentation and API reference"
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
      <div className="w-8 h-8 rounded-full bg-accent text-[#0a0a0f] flex items-center justify-center font-semibold text-sm shrink-0">
        {number}
      </div>
      <div>
        <h4 className="font-medium text-[var(--color-text-primary)]">{title}</h4>
        <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
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
    <div className="p-4 rounded-lg bg-[var(--color-surface)]">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-accent">{icon}</span>
        <h4 className="font-medium text-[var(--color-text-primary)]">{title}</h4>
      </div>
      <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
    </div>
  )
}

function FAQ({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group">
      <summary className="flex items-center justify-between cursor-pointer list-none p-3 rounded-lg hover:bg-[var(--color-surface)]">
        <span className="font-medium text-[var(--color-text-primary)]">{question}</span>
        <ChevronRight
          size={18}
          className="text-[var(--color-text-muted)] transition-transform group-open:rotate-90"
        />
      </summary>
      <p className="px-3 pb-3 text-sm text-[var(--color-text-secondary)]">{answer}</p>
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
      className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--color-surface)] transition-colors group"
    >
      <div>
        <h4 className="font-medium text-[var(--color-text-primary)] group-hover:text-accent transition-colors">
          {title}
        </h4>
        <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
      </div>
      <ExternalLink size={18} className="text-[var(--color-text-muted)]" />
    </a>
  )
}

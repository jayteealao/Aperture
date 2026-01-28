import {
  HUDLabel,
  HUDMicro,
  HUDTitle,
  HUDSeparator,
  Card,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui'
import { Shell, Topbar, Sidebar } from '@/components/layout'
import { useAppStore } from '@/stores'
import {
  HelpCircle,
  Terminal,
  MessageSquare,
  Cpu,
  Bot,
  ExternalLink,
  GitBranch,
} from 'lucide-react'

export function HelpPage() {
  const { sidebarOpen } = useAppStore()

  return (
    <Shell
      sidebarOpen={sidebarOpen}
      rightPanelOpen={false}
      topbar={<Topbar />}
      sidebar={<Sidebar />}
    >
      <div className="flex-1 overflow-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <HelpCircle className="w-6 h-6 text-hud-accent" />
          <div>
            <HUDTitle>Documentation & Help</HUDTitle>
            <HUDMicro className="mt-1">Learn how to use Aperture effectively</HUDMicro>
          </div>
        </div>

        <HUDSeparator />

        <div className="max-w-3xl mt-6">
          {/* Quick Start */}
          <Card variant="accent" corners className="mb-6">
            <div className="flex items-start gap-4">
              <Terminal className="w-6 h-6 text-hud-accent shrink-0 mt-1" />
              <div>
                <HUDLabel className="text-hud-accent">Quick Start</HUDLabel>
                <HUDMicro className="mt-2">
                  1. Connect to your Aperture gateway on the onboarding screen<br />
                  2. Create a new session with either Claude SDK or Pi SDK<br />
                  3. Start chatting with your AI agent in the workspace<br />
                  4. Use the control panel (Cmd + .) to adjust session settings
                </HUDMicro>
              </div>
            </div>
          </Card>

          {/* FAQ */}
          <Accordion type="multiple" defaultValue={['claude', 'pi']}>
            {/* Claude SDK */}
            <AccordionItem id="claude">
              <AccordionTrigger id="claude" icon={<Bot className="w-4 h-4" />}>
                Claude SDK Sessions
              </AccordionTrigger>
              <AccordionContent id="claude">
                <div className="space-y-4">
                  <div>
                    <HUDLabel className="text-hud-white">What is Claude SDK?</HUDLabel>
                    <HUDMicro className="mt-1">
                      Claude SDK (Agent SDK) allows you to create AI coding assistants powered by
                      Anthropic's Claude models. It supports features like file editing, command
                      execution, and tool use with permission controls.
                    </HUDMicro>
                  </div>
                  <div>
                    <HUDLabel className="text-hud-white">Permission Modes</HUDLabel>
                    <HUDMicro className="mt-1">
                      • <strong>Default</strong>: Ask for approval on each action<br />
                      • <strong>Accept Edits</strong>: Auto-approve file changes<br />
                      • <strong>Bypass</strong>: Skip all permission checks (use with caution)<br />
                      • <strong>Plan</strong>: Plan actions without executing them
                    </HUDMicro>
                  </div>
                  <div>
                    <HUDLabel className="text-hud-white">MCP Servers</HUDLabel>
                    <HUDMicro className="mt-1">
                      MCP (Model Context Protocol) servers extend Claude's capabilities with custom
                      tools and integrations. Configure them in the control panel.
                    </HUDMicro>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Pi SDK */}
            <AccordionItem id="pi">
              <AccordionTrigger id="pi" icon={<Cpu className="w-4 h-4" />}>
                Pi SDK Sessions
              </AccordionTrigger>
              <AccordionContent id="pi">
                <div className="space-y-4">
                  <div>
                    <HUDLabel className="text-hud-white">What is Pi SDK?</HUDLabel>
                    <HUDMicro className="mt-1">
                      Pi Coding Agent is a flexible coding assistant that supports multiple AI
                      providers (Anthropic, OpenAI, Google, Groq, OpenRouter). It features
                      session branching, thinking levels, and context management.
                    </HUDMicro>
                  </div>
                  <div>
                    <HUDLabel className="text-hud-white">Thinking Levels</HUDLabel>
                    <HUDMicro className="mt-1">
                      Pi supports different thinking levels: off, minimal, low, medium, high, xhigh.
                      Higher levels allow the AI to reason more deeply but may take longer.
                    </HUDMicro>
                  </div>
                  <div>
                    <HUDLabel className="text-hud-white">Streaming Controls</HUDLabel>
                    <HUDMicro className="mt-1">
                      • <strong>Steer</strong>: Interrupt the current response and redirect<br />
                      • <strong>Follow-up</strong>: Queue a message for after completion
                    </HUDMicro>
                  </div>
                  <div>
                    <HUDLabel className="text-hud-white">Session Forking</HUDLabel>
                    <HUDMicro className="mt-1">
                      Fork your conversation at any point to explore different directions while
                      preserving the original context. Use the Forkable section in the control panel.
                    </HUDMicro>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Sessions */}
            <AccordionItem id="sessions">
              <AccordionTrigger id="sessions" icon={<MessageSquare className="w-4 h-4" />}>
                Managing Sessions
              </AccordionTrigger>
              <AccordionContent id="sessions">
                <div className="space-y-4">
                  <div>
                    <HUDLabel className="text-hud-white">Creating Sessions</HUDLabel>
                    <HUDMicro className="mt-1">
                      Create sessions from the Sessions page. Choose your agent type, authentication
                      method, and optionally specify a repository path for the working directory.
                    </HUDMicro>
                  </div>
                  <div>
                    <HUDLabel className="text-hud-white">Session Persistence</HUDLabel>
                    <HUDMicro className="mt-1">
                      Sessions are stored locally and can be resumed. Messages are persisted in
                      IndexedDB and synced with the server database if configured.
                    </HUDMicro>
                  </div>
                  <div>
                    <HUDLabel className="text-hud-white">Connection Status</HUDLabel>
                    <HUDMicro className="mt-1">
                      WebSocket connections automatically reconnect with exponential backoff.
                      Check the status indicator in the topbar and session cards.
                    </HUDMicro>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Credentials */}
            <AccordionItem id="credentials">
              <AccordionTrigger id="credentials" icon={<GitBranch className="w-4 h-4" />}>
                Credentials & Authentication
              </AccordionTrigger>
              <AccordionContent id="credentials">
                <div className="space-y-4">
                  <div>
                    <HUDLabel className="text-hud-white">OAuth vs API Keys</HUDLabel>
                    <HUDMicro className="mt-1">
                      Aperture supports OAuth authentication (for Claude SDK) or stored API keys.
                      OAuth is recommended for Claude SDK sessions as it provides better security.
                    </HUDMicro>
                  </div>
                  <div>
                    <HUDLabel className="text-hud-white">Storing API Keys</HUDLabel>
                    <HUDMicro className="mt-1">
                      API keys are encrypted using AES-256 before storage. They are only decrypted
                      when needed for API requests. Never share or expose your credentials.
                    </HUDMicro>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Links */}
          <Card variant="bordered" corners className="mt-6">
            <HUDLabel className="text-hud-white mb-4">Resources</HUDLabel>
            <div className="space-y-2">
              <a
                href="https://github.com/anthropics/claude-code"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-hud-accent hover:text-glow-accent transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <HUDMicro>Claude Code Documentation</HUDMicro>
              </a>
              <a
                href="https://github.com/mariozechner/pi-coding-agent"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-hud-accent hover:text-glow-accent transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <HUDMicro>Pi Coding Agent Documentation</HUDMicro>
              </a>
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  )
}

# Aperture Web Frontend

A beautiful, high-performance web interface for the Aperture ACP Gateway.

## Features

- **Glass Morphism Design**: Modern, premium UI with soft gradients and blur effects
- **Real-time Chat**: WebSocket-based streaming with automatic reconnection
- **Multi-Agent Support**: Claude Code, Codex, and Gemini agents
- **Secure Credentials**: Store API keys securely on the gateway
- **Dark/Light Themes**: Nebula Glass and Pearl Glass themes
- **Command Palette**: Quick access to all actions (Cmd+K)
- **Responsive**: Works great on desktop, tablet, and mobile

## Tech Stack

- **Framework**: React 18 with TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS with CSS variables
- **State**: Zustand + TanStack Query
- **Routing**: React Router v6
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Aperture Gateway running (see main README)

### Installation

```bash
cd web
npm install
```

### Development

```bash
# Start dev server (proxies to gateway on port 8080)
npm run dev

# The frontend will be available at http://localhost:3000
```

### Building

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

### Testing

```bash
# Run tests
npm run test

# Watch mode
npm run test:watch
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_DEFAULT_GATEWAY_URL` | Default gateway URL for onboarding | `http://localhost:8080` |

## Project Structure

```
src/
├── api/            # API client and WebSocket manager
├── components/     # React components
│   ├── ui/         # Primitive components (Button, Input, etc.)
│   ├── layout/     # Layout components (Sidebar, Shell, etc.)
│   ├── chat/       # Chat-specific components
│   └── session/    # Session management components
├── hooks/          # Custom React hooks
├── pages/          # Route pages
├── stores/         # Zustand state stores
└── utils/          # Utility functions
```

## Key Routes

| Route | Description |
|-------|-------------|
| `/onboarding` | Gateway connection setup |
| `/workspace` | Main chat interface |
| `/sessions` | Session management |
| `/credentials` | API key vault |
| `/settings` | App settings |
| `/help` | Documentation |

## Design System

The app uses CSS custom properties for theming. Key tokens:

```css
--color-bg-primary      /* Main background */
--color-bg-secondary    /* Card backgrounds */
--color-surface         /* Elevated surfaces */
--color-border          /* Default borders */
--color-text-primary    /* Main text */
--color-text-secondary  /* Secondary text */
--color-accent          /* Primary accent (green) */
```

## License

MIT

# Aperture Web Interface

A neo-brutalist web frontend for the Aperture gateway, built with vanilla HTML, CSS, and JavaScript.

## Features

- **Clean, brutalist design** with hard shadows, bold borders, and high contrast
- **Fully responsive** from mobile to desktop
- **Real-time chat** with WebSocket streaming
- **Session management** for Claude, Codex, and Gemini agents
- **Credential vault** for secure API key storage
- **Inspector panel** for debugging events and approving tool calls
- **Keyboard-first navigation** with full accessibility support
- **View Transitions API** for smooth page changes
- **No build step** - just open index.html

## Quick Start

### 1. Start the Aperture Server

First, ensure the Aperture gateway server is running:

```bash
# From the project root
go run cmd/aperture/main.go --port 8080
```

### 2. Serve the Web Interface

You can serve the web interface using any static file server:

**Option A: Python**
```bash
cd web
python3 -m http.server 3000
```

**Option B: Node.js (http-server)**
```bash
cd web
npx http-server -p 3000
```

**Option C: Go**
```bash
cd web
go run -m http.server 3000
```

### 3. Open in Browser

Navigate to `http://localhost:3000` and enter your Aperture server details:

- **Server URL**: `http://localhost:8080`
- **API Token**: Your Aperture API token (if auth is enabled)

## Pages

### Connect
Configure server URL and API token. Test connectivity with health/ready checks.

### Sessions
View and manage active sessions. Create new sessions with different agents.

### Chat
Real-time conversation with streaming responses. Features:
- Auto-scrolling timeline
- Streaming with blinking cursor
- Message actions (copy, inspect)
- Tool approvals (when enabled)
- Inspector panel for debugging

### Credentials
Store API keys securely on the server. Credentials are encrypted at rest.

### Settings
- **Reduce Motion**: Disable animations
- **Font Scale**: Adjust text size (0.75x - 1.5x)
- **Clear Data**: Remove all local storage

### Help
Documentation on auth modes, features, and troubleshooting.

## Architecture

### No Build Required
This interface uses:
- **ES Modules** for code organization
- **Native CSS Nesting** for component styles
- **View Transitions API** for smooth navigation
- **WebSocket API** for real-time communication

### File Structure

```
web/
├── index.html              # Entry point
├── css/
│   └── app.css            # Complete design system
├── js/
│   ├── app.js             # Router and bootstrap
│   ├── store.js           # State management
│   ├── api.js             # API client
│   └── components/
│       ├── connect.js     # Connection page
│       ├── sessions.js    # Session list
│       ├── chat.js        # Chat interface
│       ├── credentials.js # Credential vault
│       ├── settings.js    # Settings page
│       └── help.js        # Help page
└── README.md              # This file
```

### Design System

The interface follows a **neo-brutalist aesthetic**:

- **Colors**: High contrast ink (#0E0F12) on paper (#F6F4EF) with bright accent (#00F5A0)
- **Typography**: Fluid type scale with two font stacks (sans + mono)
- **Spacing**: 8px rhythm for consistent vertical spacing
- **Shadows**: Hard, offset box shadows (no blur)
- **Borders**: Bold 2-4px borders on all interactive elements
- **Motion**: Mechanical button interactions with translate transforms

All design decisions are defined as **CSS custom properties** in `:root`.

### State Management

The `Store` class extends `EventTarget` to provide reactive state updates:

```javascript
store.set('currentSession', session);
store.addMessage(sessionId, message);

store.addEventListener('change', (event) => {
  const { key, value } = event.detail;
  // React to changes
});
```

### API Client

The `ApertureClient` class handles all server communication:

- **HTTP** for CRUD operations
- **WebSocket** for real-time chat with auto-reconnect
- **SSE** as streaming fallback (not yet implemented in UI)

## Browser Support

Works in all modern browsers with:
- ES Modules
- CSS Nesting (or fallback to flat styles)
- WebSocket API
- Fetch API
- View Transitions API (progressive enhancement)

Tested in Chrome 120+, Firefox 120+, Safari 17+.

## Development

### No Build Step

Simply edit files and refresh the browser. The interface uses:
- Native CSS for styling (no Sass/PostCSS)
- ES modules for imports (no Webpack/Vite)
- No TypeScript compilation
- No transpilation

### Code Style

- **Components** return DOM elements, not strings
- **Event listeners** attached directly to elements
- **CSS classes** use BEM-like naming (`component__element--modifier`)
- **State changes** go through the store for consistency

### Adding a New Page

1. Create `js/components/my-page.js`:
```javascript
export function renderMyPage() {
  const container = document.createElement('div');
  container.innerHTML = `...`;
  // Add event listeners
  return container;
}
```

2. Import in `js/app.js`:
```javascript
import { renderMyPage } from './components/my-page.js';
```

3. Add route:
```javascript
this.routes = {
  '/my-page': renderMyPage
};
```

## Accessibility

- **Keyboard navigation**: All interactive elements are keyboard accessible
- **ARIA attributes**: Proper roles and states on custom components
- **Focus indicators**: High-contrast outlines on `:focus-visible`
- **Semantic HTML**: Proper heading hierarchy and landmarks
- **Reduced motion**: Respects `prefers-reduced-motion` media query

## Performance

- **No framework overhead**: Pure vanilla JS (~50KB total)
- **Lazy component rendering**: Pages only render when navigated to
- **Efficient DOM updates**: Minimal re-renders, targeted updates
- **WebSocket streaming**: Sub-100ms latency for messages

## Security Notes

⚠️ **This interface is designed for trusted environments.**

- Server URL and API token are stored in `localStorage`
- Credentials are sent to Aperture server (encrypted at rest server-side)
- No client-side encryption for stored data
- Always use HTTPS in production
- Do not expose publicly without authentication

## Troubleshooting

### WebSocket won't connect

- Ensure server URL uses correct protocol (ws:// for http://, wss:// for https://)
- Check browser console for CORS errors
- Verify Aperture server is running and accessible

### Styles look broken

- Check browser supports CSS Nesting (Chrome 112+, Safari 16.5+)
- Fallback: Some older browsers may need prefixed properties

### View transitions not working

- View Transitions API requires Chrome 111+ or Safari 18+
- Older browsers will see instant navigation (fallback)

### localStorage cleared on refresh

- Check browser isn't in private/incognito mode
- Ensure site isn't blocking cookies/storage

## License

Same as Aperture project (see root LICENSE file).

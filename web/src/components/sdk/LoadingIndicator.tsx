export function LoadingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <span
        className="w-2 h-2 bg-accent rounded-full animate-bounce"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="w-2 h-2 bg-accent rounded-full animate-bounce"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="w-2 h-2 bg-accent rounded-full animate-bounce"
        style={{ animationDelay: '300ms' }}
      />
    </div>
  )
}

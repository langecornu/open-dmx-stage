// Consistent empty state with a title, hint and optional action.
export function EmptyState({ title, hint, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p>{hint}</p>
      {children}
    </div>
  );
}

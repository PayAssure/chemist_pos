type ToastViewportProps = {
  error: string;
  notice: string;
  onDismiss: () => void;
};

export default function ToastViewport({
  error,
  notice,
  onDismiss,
}: ToastViewportProps) {
  const message = error || notice;
  if (!message) return null;
  return (
    <div className="toast-viewport" aria-live={error ? "assertive" : "polite"} aria-atomic="true">
      <div className={`toast ${error ? "toast-error" : "toast-success"}`} role={error ? "alert" : "status"}>
        <span className="toast-indicator" aria-hidden="true">{error ? "!" : "✓"}</span>
        <span className="toast-message">{message}</span>
        <button className="toast-dismiss" type="button" aria-label="Dismiss notification" onClick={onDismiss}>×</button>
      </div>
    </div>
  );
}

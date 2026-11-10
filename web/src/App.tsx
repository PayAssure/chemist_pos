import { useNotifications } from "./app/useNotifications";
import { useSession } from "./app/useSession";
import AuthenticatedApp from "./app/AuthenticatedApp";
import ToastViewport from "./app/ToastViewport";
import Login from "./auth/Login";

function App() {
  const session = useSession();
  const notifications = useNotifications();
  if (session.checkingSession) return <main className="loading">Loading POS…</main>;
  if (session.email) {
    return <AuthenticatedApp email={session.email} setEmail={session.setEmail} notifications={notifications} />;
  }
  return (
    <>
      <Login
        onLogin={(email) => {
          notifications.setError("");
          session.setEmail(email);
          notifications.setNotice("Welcome back. You are signed in.");
        }}
        onError={notifications.setError}
      />
      <ToastViewport error={notifications.error} notice={notifications.notice} onDismiss={notifications.dismiss} />
    </>
  );
}

export default App;

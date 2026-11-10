import HeaderNavigation from "./HeaderNavigation";
import { navigate, pathForTab } from "../lib/navigation";
import type { Tab } from "../types";

type Props = { email: string; tab: Tab; signOut: () => void };

export default function AppHeader({ email, tab, signOut }: Props) {
  return (
    <header className="topbar">
      <a className="brand" href={pathForTab("checkout")} onClick={(event) => {
        event.preventDefault();
        navigate(pathForTab("checkout"));
      }}>
        <span className="brand-mark">Z</span>
        <span>Zion Chemist <strong>POS</strong></span>
      </a>
      <HeaderNavigation tab={tab} />
      <details className="account-menu">
        <summary aria-label="Open account menu" title="Account">
          {email.slice(0, 1).toUpperCase()}
        </summary>
        <div className="account-dropdown">
          <span className="account-email">{email}</span>
          <button className="button button-quiet" onClick={signOut}>Log out</button>
        </div>
      </details>
    </header>
  );
}

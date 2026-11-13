import { api } from "../lib/api";
import { useInventoryActions } from "../products/useInventoryActions";
import AppHeader from "./AppHeader";
import AppPages from "./AppPages";
import FloatDepositDialog from "./FloatDepositDialog";
import ToastViewport from "./ToastViewport";
import Welcome from "./Welcome";
import { useCart } from "./useCart";
import { useCheckout } from "./useCheckout";
import { useFloatDeposit } from "./useFloatDeposit";
import { useNavigation } from "./useNavigation";
import type { useNotifications } from "./useNotifications";
import { usePosData } from "./usePosData";
import { useProfile } from "./useProfile";
import { useRetailerFloat } from "./useRetailerFloat";

type Props = {
  email: string;
  setEmail: (email: string | null) => void;
  notifications: ReturnType<typeof useNotifications>;
};

export default function AuthenticatedApp({ email, setEmail, notifications }: Props) {
  const { error, setError, notice, setNotice, dismiss } = notifications;
  const { tab } = useNavigation();
  const data = usePosData(email, tab, setError);
  const profile = useProfile(email, setError, setNotice);
  const floating = useRetailerFloat(email);
  const deposit = useFloatDeposit(floating.checkBalance, setError, setNotice);
  const cart = useCart(data.products);
  const checkout = useCheckout(cart.items, cart.setCart, data.refreshData, data.refreshDashboard, setError, setNotice);
  const actions = useInventoryActions(data.refreshData, setError, setNotice);

  async function signOut() {
    try {
      await api<void>("/api/auth/logout", { method: "POST" });
      setEmail(null);
      setNotice("You have been signed out.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out");
    }
  }

  return (
    <div className="app-shell">
      <ToastViewport error={error} notice={notice} onDismiss={dismiss} />
      <AppHeader email={email} tab={tab} signOut={() => void signOut()} />
      <main className="main">
        <Welcome floating={floating} deposit={deposit} profile={profile.profile} />
        <AppPages tab={tab} data={data} cart={cart} profile={profile} checkout={checkout} actions={actions} />
      </main>
      <FloatDepositDialog deposit={deposit} />
    </div>
  );
}

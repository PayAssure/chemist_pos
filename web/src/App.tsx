import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Checkout from "./checkout/Checkout";
import Login from "./auth/Login";
import Inventory from "./products/Inventory";
import SupplierManagement from "./suppliers/SupplierManagement";
import PayassureData from "./payassure/PayassureData";
import Dashboard from "./dashboard/Dashboard";
import { useInventoryActions } from "./products/useInventoryActions";
import SalesHistory from "./sales/SalesHistory";
import { api } from "./lib/api";
import { money } from "./lib/money";
import { navigate, pathForTab, tabFromPath } from "./lib/navigation";
import ContactSupport from "./support/ContactSupport";
import type {
  Batch,
  DashboardData,
  PayassureParticipant,
  PayassureParticipantUpdate,
  Product,
  RetailerProfileData,
  Sale,
  Supplier,
  Tab,
} from "./types";

function emptyRetailerProfile(email: string): RetailerProfileData {
  return {
    id: "",
    participantType: "RETAILER",
    businessName: "",
    businessType: "",
    contactName: "",
    email,
    status: "DRAFT",
    createdAt: "",
    updatedAt: "",
    integration: null,
    payment: null,
  };
}

function mapPayassureParticipant(
  participant: PayassureParticipant,
  fallbackEmail: string,
): RetailerProfileData {
  return {
    ...emptyRetailerProfile(fallbackEmail),
    id: participant.id ?? "",
    participantType: participant.participantType === "SUPPLIER" ? "SUPPLIER" : "RETAILER",
    businessName: participant.businessName ?? "",
    businessType: participant.businessType ?? "",
    contactName: participant.contactName ?? "",
    email: participant.email ?? fallbackEmail,
    status: participant.status ?? "DRAFT",
    createdAt: participant.createdAt ?? "",
    updatedAt: participant.updatedAt ?? "",
    integration: participant.integration
      ? {
          apiKey: participant.integration.apiKey ?? "",
          apiSecret: participant.integration.apiSecret ?? "",
          merchantId: participant.integration.merchantId ?? "",
          environment: participant.integration.environment ?? "",
          isActive: participant.integration.isActive ?? false,
          createdAt: participant.integration.createdAt ?? "",
        }
      : null,
    payment: participant.payment
      ? {
          type: participant.payment.type === "BANK" ? "BANK" : "MPESA",
          accountName: participant.payment.accountName ?? "",
          phoneNumber: participant.payment.phoneNumber ?? "",
          bankCode: participant.payment.bankCode ?? "",
          accountNumber: participant.payment.accountNumber ?? "",
          shortcode: participant.payment.shortcode ?? "",
          provider: participant.payment.provider ?? "",
          status: participant.payment.status ?? "",
          isVerified: participant.payment.isVerified ?? false,
        }
      : null,
  };
}

type ToastViewportProps = {
  error: string;
  notice: string;
  onDismiss: () => void;
};

function ToastViewport({ error, notice, onDismiss }: ToastViewportProps) {
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

function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [tab, setTab] = useState<Tab>(() => tabFromPath(window.location.pathname));
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [prescriptionReference, setPrescriptionReference] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const checkoutReference = useRef<string | null>(null);
  if (checkoutReference.current === null) {
    try {
      checkoutReference.current = window.sessionStorage.getItem("payassure-checkout-reference") ?? "";
    } catch (reason) {
      console.warn("Could not restore the pending checkout reference:", reason);
      checkoutReference.current = "";
    }
  }
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retailerProfile, setRetailerProfile] = useState<RetailerProfileData>(
    () => emptyRetailerProfile(""),
  );
  const [payassureLoading, setPayassureLoading] = useState(false);

  useEffect(() => {
    if (!error && !notice) return;
    const timeout = window.setTimeout(() => {
      setError("");
      setNotice("");
    }, 6000);
    return () => window.clearTimeout(timeout);
  }, [error, notice]);

  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", pathForTab("dashboard"));
    }
    function syncTabWithPath() {
      setTab(tabFromPath(window.location.pathname));
    }
    window.addEventListener("popstate", syncTabWithPath);
    return () => window.removeEventListener("popstate", syncTabWithPath);
  }, []);

  const refreshData = useCallback(async () => {
    const [nextProducts, nextSuppliers, nextSales, nextBatches, nextDashboard] = await Promise.all([
      api<Product[]>("/api/products"),
      api<Supplier[]>("/api/suppliers"),
      api<Sale[]>("/api/sales"),
      api<Batch[]>("/api/batches"),
      api<DashboardData>("/api/dashboard"),
    ]);
    setProducts(nextProducts);
    setSuppliers(nextSuppliers);
    setSales(nextSales);
    setBatches(nextBatches);
    setDashboard(nextDashboard);
  }, []);

  const refreshDashboard = useCallback(async () => {
    setDashboard(await api<DashboardData>("/api/dashboard"));
  }, []);

  useEffect(() => {
    api<{ email: string }>("/api/auth/me")
      .then((user) => {
        setEmail(user.email);
        setRetailerProfile((profile) => ({ ...profile, email: user.email }));
      })
      .catch(() => setEmail(null))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!email) return;
    let active = true;
    setPayassureLoading(true);
    api<PayassureParticipant | PayassureParticipant[]>("/api/payassure/me")
      .then((response) => {
        const participant = Array.isArray(response) ? response[0] : response;
        if (!participant) throw new Error("PayAssure returned no participant data");
        if (active) setRetailerProfile(mapPayassureParticipant(participant, email));
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Could not load PayAssure data");
        }
      })
      .finally(() => {
        if (active) setPayassureLoading(false);
      });
    return () => {
      active = false;
    };
  }, [email]);

  useEffect(() => {
    if (email) {
      refreshData().catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Could not load POS data"),
      );
    }
  }, [email, refreshData]);

  useEffect(() => {
    if (!email || tab !== "dashboard") return;
    const timer = window.setInterval(() => {
      refreshDashboard().catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Could not refresh dashboard data"),
      );
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [email, refreshDashboard, tab]);

  const cartItems = useMemo(
    () =>
      products
        .filter((product) => cart[product.id])
        .map((product) => ({ product, quantity: cart[product.id] })),
    [cart, products],
  );
  const total = cartItems.reduce(
    (sum, item) => sum + item.product.priceCents * item.quantity,
    0,
  );
  const prescriptionRequired = cartItems.some(
    ({ product }) => product.prescriptionRequired,
  );
  const { saveSupplier, saveProduct, updateProduct, updateBuyingPrice, addStock, updateBatchExpiry } =
    useInventoryActions(refreshData, setError, setNotice);

  function dismissToast() {
    setError("");
    setNotice("");
  }

  async function signOut() {
    try {
      await api<void>("/api/auth/logout", { method: "POST" });
      setEmail(null);
      setCart({});
      setNotice("You have been signed out.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out");
    }
  }

  async function savePayassureParticipant(
    update: PayassureParticipantUpdate,
  ): Promise<RetailerProfileData> {
    setError("");
    setNotice("");
    try {
      const response = await api<PayassureParticipant | PayassureParticipant[]>(
        "/api/payassure/me",
        { method: "PATCH", body: JSON.stringify(update) },
      );
      const participant = Array.isArray(response) ? response[0] : response;
      if (!participant) throw new Error("PayAssure returned no updated participant data");
      const updatedProfile = mapPayassureParticipant(participant, email ?? "");
      setRetailerProfile(updatedProfile);
      setNotice("PayAssure participant updated.");
      return updatedProfile;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update PayAssure participant");
      throw reason;
    }
  }

  async function checkout(
    paymentMethod: "cash" | "mpesa" | "credit",
    mpesaPhone?: string,
  ): Promise<boolean> {
    setError("");
    setNotice("");
    setCheckoutPending(true);
    const reference = checkoutReference.current || `POS-${window.crypto.randomUUID()}`;
    checkoutReference.current = reference;
    try {
      window.sessionStorage.setItem("payassure-checkout-reference", reference);
    } catch (reason) {
      console.warn("Could not persist the checkout reference for a retry:", reason);
    }

    type CheckoutStatus = {
      id: number;
      status: "pending" | "completed" | "failed";
      collectionStatus: "pending" | "succeeded" | "failed";
      settlementError: string | null;
    };

    const fetchStatus = () =>
      api<CheckoutStatus>(`/api/checkout/${encodeURIComponent(reference)}/status`);

    try {
      let checkoutStatus: CheckoutStatus | null = null;
      let initiationError: string | null = null;
      try {
        checkoutStatus = await api<CheckoutStatus>("/api/checkout", {
          method: "POST",
          body: JSON.stringify({
            paymentMethod,
            merchantTransactionReference: reference,
            ...(paymentMethod === "credit" ? { payerName, payerPhone } : {}),
            ...(paymentMethod === "mpesa" ? { payerPhone: mpesaPhone } : {}),
            ...(prescriptionRequired ? { prescriptionReference } : {}),
            items: cartItems.map(({ product, quantity }) => ({
              productId: product.id,
              quantity,
            })),
          }),
        });
      } catch (reason) {
        initiationError = reason instanceof Error ? reason.message : "Could not initiate PayAssure checkout";
        try {
          checkoutStatus = await fetchStatus();
        } catch {
          throw new Error(initiationError);
        }
      }

      const deadline = Date.now() + 120_000;
      while (checkoutStatus?.collectionStatus === "pending" && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        try {
          checkoutStatus = await fetchStatus();
        } catch (reason) {
          if (initiationError) throw new Error(initiationError);
          throw reason;
        }
      }

      if (checkoutStatus?.collectionStatus === "pending") {
        setNotice("PayAssure is still processing this payment. Do not retry; this checkout reference is being monitored.");
        await refreshData().catch(() => undefined);
        return false;
      }
      if (checkoutStatus?.collectionStatus !== "succeeded") {
        throw new Error(
          checkoutStatus?.settlementError ??
            initiationError ??
            "PayAssure did not confirm collection. The sale was not completed.",
        );
      }

      checkoutReference.current = "";
      try {
        window.sessionStorage.removeItem("payassure-checkout-reference");
      } catch (reason) {
        console.warn("Could not clear the completed checkout reference:", reason);
      }
      setCart({});
      setPrescriptionReference("");
      setPayerName("");
      setPayerPhone("");
      setNotice("PayAssure confirmed collection and the sale was saved.");
      try {
        await refreshData();
      } catch {
        setNotice("PayAssure confirmed collection and the sale was saved, but POS data could not refresh.");
      }
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Checkout failed";
      setError(message);
      let collectionFailed = false;
      try {
        const status = await fetchStatus();
        collectionFailed = status.collectionStatus === "failed";
      } catch {
        collectionFailed = false;
      }
      if (collectionFailed || message.startsWith("This checkout reference was already used")) {
        checkoutReference.current = "";
        try {
          window.sessionStorage.removeItem("payassure-checkout-reference");
        } catch (storageError) {
          console.warn("Could not clear the conflicting checkout reference:", storageError);
        }
      }
      try {
        await refreshData();
      } catch (refreshReason) {
        const refreshMessage =
          refreshReason instanceof Error ? refreshReason.message : "Could not refresh POS data";
        setError(`${message}. ${refreshMessage}`);
      }
      return false;
    } finally {
      setCheckoutPending(false);
    }
  }

  if (checkingSession) return <main className="loading">Loading POS…</main>;
  if (!email) {
    return (
      <>
        <Login
          onLogin={(userEmail) => {
            setError("");
            setEmail(userEmail);
            setRetailerProfile(emptyRetailerProfile(userEmail));
            setNotice("Welcome back. You are signed in.");
          }}
          onError={setError}
        />
        <ToastViewport error={error} notice={notice} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <ToastViewport error={error} notice={notice} onDismiss={dismissToast} />
      <header className="topbar">
        <a
          className="brand"
          href={pathForTab("checkout")}
          onClick={(event) => {
            event.preventDefault();
            navigate(pathForTab("checkout"));
          }}
        >
          <span className="brand-mark">Z</span>
          <span>Zion Chemist <strong>POS</strong></span>
        </a>
        <nav className="header-nav" aria-label="POS sections">
          {(["dashboard", "checkout", "products", "suppliers", "payassure-data", "history", "support"] as Tab[]).map((name) => (
            <button
              key={name}
              className={`tab ${tab === name ? "active" : ""}`}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => {
                navigate(pathForTab(name));
              }}
            >
              {name === "dashboard"
                ? "Dashboard"
                : name === "checkout"
                ? "Checkout"
                : name === "products"
                  ? "Products & stock"
                  : name === "suppliers"
                    ? "Suppliers"
                    : name === "payassure-data"
                      ? "PayAssure data"
                      : name === "history"
                        ? "Sales history"
                        : "Contact support"}
            </button>
          ))}
        </nav>
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

      <main className="main">
        <div className="welcome">
          <div>
            <p className="eyebrow">RETAIL POINT OF SALE</p>
            <h1>Good day</h1>
            <p className="subtitle">A clear view of your shop, sales, and stock.</p>
          </div>
          <div className="summary-card">
            <span>Medicine units in stock</span>
            <strong>{products.reduce((sum, product) => sum + product.stockCount, 0)}</strong>
          </div>
        </div>

        {tab === "dashboard" && dashboard && (
          <Dashboard data={dashboard} />
        )}
        {tab === "checkout" && (
          <Checkout
            products={products}
            cartItems={cartItems}
            total={total}
            prescriptionRequired={prescriptionRequired}
            prescriptionReference={prescriptionReference}
            payerName={payerName}
            payerPhone={payerPhone}
            onCartChange={setCart}
            onPrescriptionReferenceChange={setPrescriptionReference}
            onPayerNameChange={setPayerName}
            onPayerPhoneChange={setPayerPhone}
            isCheckingOut={checkoutPending}
            onCheckout={checkout}
          />
        )}
        {tab === "products" && (
          <Inventory
            products={products}
            batches={batches}
            suppliers={suppliers}
            onSaveProduct={saveProduct}
            onUpdateProduct={updateProduct}
            onUpdateBuyingPrice={updateBuyingPrice}
            onUpdateBatchExpiry={updateBatchExpiry}
            onAddStock={addStock}
          />
        )}
        {tab === "suppliers" && (
          <SupplierManagement suppliers={suppliers} onSaveSupplier={saveSupplier} />
        )}
        {tab === "payassure-data" && (
          <PayassureData
            profile={retailerProfile}
            loading={payassureLoading}
            onSave={savePayassureParticipant}
          />
        )}
        {tab === "history" && <SalesHistory sales={sales} />}
        {tab === "support" && <ContactSupport />}
      </main>
    </div>
  );
}

export default App;

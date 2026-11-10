import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Checkout from "./checkout/Checkout";
import Login from "./auth/Login";
import Inventory from "./products/Inventory";
import SupplierManagement from "./suppliers/SupplierManagement";
import PayassureData from "./payassure/PayassureData";
import Dashboard from "./dashboard/Dashboard";
import { useInventoryActions } from "./products/useInventoryActions";
import SalesHistory from "./sales/SalesHistory";
import { api, ApiError } from "./lib/api";
import { currencyAmount, money } from "./lib/money";
import { navigate, pathForTab, tabFromPath } from "./lib/navigation";
import ContactSupport from "./support/ContactSupport";
import type {
  Batch,
  DashboardData,
  DashboardPeriod,
  PayassureParticipant,
  PayassureParticipantUpdate,
  Product,
  RetailerFloatBalance,
  RetailerFloatData,
  RetailerFloatDeposit,
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

const appTabs: Tab[] = [
  "dashboard",
  "checkout",
  "products",
  "suppliers",
  "payassure-data",
  "history",
  "support",
];

function tabLabel(name: Tab): string {
  switch (name) {
    case "dashboard":
      return "Dashboard";
    case "checkout":
      return "Checkout";
    case "products":
      return "Products & stock";
    case "suppliers":
      return "Suppliers";
    case "payassure-data":
      return "PayAssure data";
    case "history":
      return "Sales history";
    case "support":
      return "Contact support";
  }
}

function HeaderNavigation({ tab }: { tab: Tab }) {
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDetailsElement>(null);
  const [visibleIndexes, setVisibleIndexes] = useState<number[]>(appTabs.map((_, index) => index));

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure) return;

    const updateVisibleTabs = () => {
      const tabElements = Array.from(measure.querySelectorAll<HTMLElement>(".tab"));
      const overflowElement = measure.querySelector<HTMLElement>(".tab-overflow-trigger");
      if (!overflowElement || tabElements.length !== appTabs.length) return;

      const availableWidth = nav.clientWidth;
      const gap = Number.parseFloat(window.getComputedStyle(nav).columnGap) || 0;
      const widths = tabElements.map((element) => element.getBoundingClientRect().width);
      const allTabsWidth =
        widths.reduce((total, width) => total + width, 0) + gap * (widths.length - 1);
      let nextIndexes: number[];

      if (allTabsWidth <= availableWidth) {
        nextIndexes = appTabs.map((_, index) => index);
      } else {
        const overflowWidth = overflowElement.getBoundingClientRect().width;
        const activeIndex = appTabs.indexOf(tab);
        const selected = new Set<number>();
        let usedWidth = 0;

        const tryAdd = (index: number) => {
          const nextWidth =
            usedWidth +
            (selected.size ? gap : 0) +
            widths[index] +
            gap +
            overflowWidth;
          if (nextWidth > availableWidth) return;
          usedWidth += (selected.size ? gap : 0) + widths[index];
          selected.add(index);
        };

        tryAdd(activeIndex);
        appTabs.forEach((_, index) => {
          if (index !== activeIndex) tryAdd(index);
        });
        nextIndexes = Array.from(selected).sort((left, right) => left - right);
      }

      setVisibleIndexes((current) =>
        current.length === nextIndexes.length &&
        current.every((index, position) => index === nextIndexes[position])
          ? current
          : nextIndexes,
      );
    };

    updateVisibleTabs();
    const observer = new ResizeObserver(updateVisibleTabs);
    observer.observe(nav);
    observer.observe(measure);
    measure.querySelectorAll(".tab, .tab-overflow-trigger").forEach((element) => {
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, [tab]);

  const hiddenTabs = appTabs.filter((_, index) => !visibleIndexes.includes(index));

  return (
    <nav ref={navRef} className="header-nav" aria-label="POS sections">
      {appTabs.map((name, index) =>
        visibleIndexes.includes(index) ? (
          <button
            key={name}
            className={`tab ${tab === name ? "active" : ""}`}
            aria-current={tab === name ? "page" : undefined}
            onClick={() => navigate(pathForTab(name))}
          >
            {tabLabel(name)}
          </button>
        ) : null,
      )}
      {hiddenTabs.length > 0 && (
        <details ref={overflowRef} className="tab-overflow">
          <summary className="tab-overflow-trigger" aria-label="More sections" title="More sections">
            <span aria-hidden="true">⋯</span>
          </summary>
          <div className="tab-overflow-menu">
            {hiddenTabs.map((name) => (
              <button
                key={name}
                className={`tab-overflow-item ${tab === name ? "active" : ""}`}
                aria-current={tab === name ? "page" : undefined}
                onClick={() => {
                  navigate(pathForTab(name));
                  if (overflowRef.current) overflowRef.current.open = false;
                }}
              >
                {tabLabel(name)}
              </button>
            ))}
          </div>
        </details>
      )}
      <div ref={measureRef} className="header-nav-measure" aria-hidden="true">
        {appTabs.map((name) => (
          <button
            key={name}
            type="button"
            className={`tab ${tab === name ? "active" : ""}`}
            tabIndex={-1}
          >
            {tabLabel(name)}
          </button>
        ))}
        <button type="button" className="tab-overflow-trigger" tabIndex={-1}>⋯</button>
      </div>
    </nav>
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
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>("today");
  const dashboardRequestId = useRef(0);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutStage, setCheckoutStage] = useState<"initiating" | "waiting" | null>(null);
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
  const [retailerFloat, setRetailerFloat] = useState<RetailerFloatData | null>(null);
  const [retailerFloatBalance, setRetailerFloatBalance] =
    useState<RetailerFloatBalance | null>(null);
  const [floatLoading, setFloatLoading] = useState(false);
  const [floatCheckLoading, setFloatCheckLoading] = useState(false);
  const [floatDepositLoading, setFloatDepositLoading] = useState(false);
  const [floatError, setFloatError] = useState("");
  const [floatBalanceCheckedAt, setFloatBalanceCheckedAt] = useState("");
  const [floatDepositOpen, setFloatDepositOpen] = useState(false);
  const [floatDepositAmount, setFloatDepositAmount] = useState("");
  const [floatPayerPhoneNumber, setFloatPayerPhoneNumber] = useState("");
  const [floatDepositError, setFloatDepositError] = useState("");

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
    const [nextProducts, nextSuppliers, nextSales, nextBatches] = await Promise.all([
      api<Product[]>("/api/products"),
      api<Supplier[]>("/api/suppliers"),
      api<Sale[]>("/api/sales"),
      api<Batch[]>("/api/batches"),
    ]);
    setProducts(nextProducts);
    setSuppliers(nextSuppliers);
    setSales(nextSales);
    setBatches(nextBatches);
  }, []);

  const refreshDashboard = useCallback(async () => {
    const requestId = ++dashboardRequestId.current;
    const nextDashboard = await api<DashboardData>(
      `/api/dashboard?period=${dashboardPeriod}`,
    );
    if (requestId === dashboardRequestId.current) setDashboard(nextDashboard);
  }, [dashboardPeriod]);

  const refreshRetailerFloat = useCallback(async () => {
    setFloatLoading(true);
    setFloatError("");
    try {
      const nextFloat = await api<RetailerFloatData>("/api/payassure/float", {
        cache: "no-store",
      });
      setRetailerFloat(nextFloat);
      setFloatBalanceCheckedAt(new Date().toISOString());
    } catch (reason) {
      setFloatError(reason instanceof Error ? reason.message : "Could not load PayAssure float");
    } finally {
      setFloatLoading(false);
    }
  }, []);

  const checkRetailerFloatBalance = useCallback(async () => {
    setFloatCheckLoading(true);
    setFloatError("");
    try {
      const balance = await api<RetailerFloatBalance>("/api/payassure/float/balance", {
        method: "POST",
        cache: "no-store",
      });
      setRetailerFloatBalance(balance);
      setFloatBalanceCheckedAt(balance.asOf);
      setRetailerFloat((current) =>
        current ? { ...current, ...balance } : current,
      );
    } catch (reason) {
      setFloatError(
        reason instanceof Error ? reason.message : "Could not check PayAssure float balance",
      );
    } finally {
      setFloatCheckLoading(false);
    }
  }, []);

  const submitRetailerFloatDeposit = useCallback(async (
    amount: number,
    payerPhoneNumber: string,
  ): Promise<RetailerFloatDeposit> => {
    setFloatDepositLoading(true);
    setError("");
    setNotice("");
    try {
      const deposit = await api<RetailerFloatDeposit>("/api/payassure/float/deposits", {
        method: "POST",
        body: JSON.stringify({ amount, payerPhoneNumber }),
      });
      setNotice(
        `Float deposit request ${deposit.status.toLowerCase()}. The balance changes only after PayAssure confirms the deposit.`,
      );
      await refreshRetailerFloat();
      return deposit;
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Could not submit PayAssure float deposit";
      setError(message);
      throw reason;
    } finally {
      setFloatDepositLoading(false);
    }
  }, [refreshRetailerFloat]);

  async function submitFloatDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(floatDepositAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !floatPayerPhoneNumber.trim()) {
      setFloatDepositError("Enter a positive whole-KES amount and payer phone number.");
      return;
    }

    setFloatDepositError("");
    try {
      await submitRetailerFloatDeposit(amount, floatPayerPhoneNumber.trim());
      setFloatDepositAmount("");
      setFloatPayerPhoneNumber("");
      setFloatDepositOpen(false);
    } catch (reason) {
      setFloatDepositError(reason instanceof Error ? reason.message : "Could not submit float deposit");
    }
  }

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
    if (!email) {
      setRetailerFloat(null);
      setRetailerFloatBalance(null);
      setFloatError("");
      return;
    }
    void refreshRetailerFloat();
  }, [email, refreshRetailerFloat]);

  useEffect(() => {
    if (!email) return;
    refreshDashboard().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "Could not load dashboard data"),
    );
  }, [email, refreshDashboard]);

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
      setRetailerFloat(null);
      setRetailerFloatBalance(null);
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
    retryingUnresolvedPayment = false,
  ): Promise<boolean> {
    setError("");
    setNotice("");
    setCheckoutPending(true);
    setCheckoutStage("initiating");
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
      settlementStatus:
        | "queued"
        | "processing"
        | "accepted"
        | "failed"
        | "retrying"
        | "partially_failed"
        | "awaiting_reconciliation"
        | "completed";
      collectionStatus: "pending" | "succeeded" | "failed";
      settlementError: string | null;
    };

    const fetchStatus = () =>
      api<CheckoutStatus>(`/api/checkout/${encodeURIComponent(reference)}/status`, {
        cache: "no-store",
      });

    let initiationAcknowledged = false;
    try {
      let checkoutStatus = await api<CheckoutStatus>("/api/checkout", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod,
          merchantTransactionReference: reference,
          ...(paymentMethod === "credit" ? { payerName, payerPhone } : {}),
          ...(paymentMethod === "mpesa" ? { payerPhone: mpesaPhone } : {}),
          items: cartItems.map(({ product, quantity }) => ({
            productId: product.id,
            quantity,
          })),
        }),
      });
      initiationAcknowledged = true;

      if (checkoutStatus.collectionStatus === "pending") {
        setCheckoutStage("waiting");
      }
      const deadline = Date.now() + 120_000;
      while (checkoutStatus?.collectionStatus === "pending" && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        checkoutStatus = await fetchStatus();
      }

      if (checkoutStatus?.collectionStatus === "pending") {
        setNotice(
          retryingUnresolvedPayment
            ? "The new checkout is still pending. The earlier payment attempt also remains unresolved; check both statuses before retrying."
            : "No collection webhook was received within two minutes. This checkout remains pending; do not create a new sale.",
        );
        await Promise.all([refreshData(), refreshDashboard()]).catch(() => undefined);
        return false;
      }
      if (checkoutStatus?.collectionStatus !== "succeeded") {
        throw new Error(
          checkoutStatus?.settlementError ??
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
      setPayerName("");
      setPayerPhone("");
      const completionNotice = retryingUnresolvedPayment
        ? "PayAssure confirmed this new checkout. Note: the earlier payment attempt remains unresolved and could also complete."
        : "PayAssure confirmed collection and the sale was saved.";
      setNotice(completionNotice);
      try {
        await Promise.all([refreshData(), refreshDashboard()]);
      } catch {
        setNotice(`${completionNotice} POS data could not refresh.`);
      }
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Checkout failed";
      const staleReferenceConflict =
        reason instanceof ApiError && reason.code === "CHECKOUT_REFERENCE_CONFLICT";
      const unresolvedCollection =
        reason instanceof ApiError && reason.code === "CHECKOUT_COLLECTION_UNRESOLVED";
      if (staleReferenceConflict) {
        checkoutReference.current = "";
        try {
          window.sessionStorage.removeItem("payassure-checkout-reference");
        } catch (storageError) {
          console.warn("Could not clear the conflicting checkout reference:", storageError);
        }
        setNotice("This checkout reference belonged to a different sale. No new payment was sent. Submit again to use a fresh reference.");
      } else if (unresolvedCollection && !retryingUnresolvedPayment) {
        console.warn(
          "[PayAssure] Retrying checkout with a new reference while an earlier collection remains unresolved",
          { previousReference: reference },
        );
        checkoutReference.current = "";
        try {
          window.sessionStorage.removeItem("payassure-checkout-reference");
        } catch (storageError) {
          console.warn("Could not clear the unresolved checkout reference:", storageError);
        }
        return await checkout(paymentMethod, mpesaPhone, true);
      } else {
        setError(message);
      }
      let collectionFailed = false;
      if (initiationAcknowledged) {
        try {
          const status = await fetchStatus();
          collectionFailed = status.collectionStatus === "failed";
        } catch {
          collectionFailed = false;
        }
      }
      if (collectionFailed) {
        checkoutReference.current = "";
        try {
          window.sessionStorage.removeItem("payassure-checkout-reference");
        } catch (storageError) {
          console.warn("Could not clear the conflicting checkout reference:", storageError);
        }
      }
      try {
        await Promise.all([refreshData(), refreshDashboard()]);
      } catch (refreshReason) {
        const refreshMessage =
          refreshReason instanceof Error ? refreshReason.message : "Could not refresh POS data";
        setError(`${message}. ${refreshMessage}`);
      }
      return false;
    } finally {
      setCheckoutPending(false);
      setCheckoutStage(null);
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

      <main className="main">
        <div className="welcome">
          <div>
            <p className="eyebrow">RETAIL POINT OF SALE</p>
            <h1>Good day</h1>
            <p className="subtitle">A clear view of your shop, sales, and stock.</p>
          </div>
          <div className="welcome-summary-cards">
            <section className="summary-card float-summary-card" aria-label="PayAssure float balance">
              <div className="float-summary-details">
                <span>Available PayAssure float</span>
                <strong>
                  {retailerFloatBalance
                    ? currencyAmount(retailerFloatBalance.availableBalance, retailerFloatBalance.currency)
                    : retailerFloat
                      ? currencyAmount(retailerFloat.availableBalance, retailerFloat.currency)
                      : "—"}
                </strong>
                <small>
                  {retailerFloat
                    ? `Daily float: ${currencyAmount(retailerFloat.dailyFloat, retailerFloat.currency)}`
                    : floatLoading
                      ? "Daily float: loading…"
                      : "Daily float: unavailable"}
                </small>
                {floatError && <small className="expiry-warning" role="status">{floatError}</small>}
              </div>
              <div className="float-summary-action-group">
                <div className="float-summary-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setFloatDepositError("");
                      setFloatDepositOpen(true);
                    }}
                    disabled={retailerProfile.integration?.isActive !== true || floatDepositLoading}
                  >
                    Float deposit
                  </button>
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => void checkRetailerFloatBalance()}
                    disabled={floatLoading || floatCheckLoading}
                  >
                    {floatCheckLoading ? "Checking…" : "Check balance"}
                  </button>
                </div>
                <small className="float-balance-checked">
                  Balance checked: {floatBalanceCheckedAt
                    ? new Date(floatBalanceCheckedAt).toLocaleTimeString()
                    : "Not checked yet"}
                </small>
              </div>
            </section>
          </div>
        </div>

        {tab === "dashboard" && dashboard && (
          <Dashboard
            data={dashboard}
            period={dashboardPeriod}
            onPeriodChange={setDashboardPeriod}
          />
        )}
        {tab === "checkout" && (
          <Checkout
            products={products}
            cartItems={cartItems}
            total={total}
            payerName={payerName}
            payerPhone={payerPhone}
            onCartChange={setCart}
            onPayerNameChange={setPayerName}
            onPayerPhoneChange={setPayerPhone}
            isCheckingOut={checkoutPending}
            checkoutStage={checkoutStage}
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
      {floatDepositOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !floatDepositLoading) {
              setFloatDepositOpen(false);
            }
          }}
        >
          <section
            className="panel form-panel float-deposit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="float-deposit-title"
          >
            <div className="modal-heading">
              <div>
                <h2 id="float-deposit-title">Deposit retailer float</h2>
                <p>Request an M-Pesa STK prompt for this retailer’s PayAssure float.</p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close dialog"
                onClick={() => setFloatDepositOpen(false)}
                disabled={floatDepositLoading}
              >
                ×
              </button>
            </div>
            <p className="helper-text">
              A submitted request is not a successful deposit. Available balance changes only after
              PayAssure verifies a successful provider callback.
            </p>
            <form className="form-panel" onSubmit={submitFloatDeposit}>
              <label>
                Amount (KES)
                <input
                  type="number"
                  min="1"
                  max="2147483647"
                  step="1"
                  required
                  value={floatDepositAmount}
                  onChange={(event) => setFloatDepositAmount(event.target.value)}
                />
              </label>
              <label>
                Payer phone number
                <input
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  required
                  value={floatPayerPhoneNumber}
                  onChange={(event) => setFloatPayerPhoneNumber(event.target.value)}
                />
              </label>
              {floatDepositError && (
                <p className="alert alert-error" role="alert">{floatDepositError}</p>
              )}
              <div className="modal-actions">
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => setFloatDepositOpen(false)}
                  disabled={floatDepositLoading}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={floatDepositLoading}
                >
                  {floatDepositLoading ? "Submitting deposit…" : "Request deposit"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;

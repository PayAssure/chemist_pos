import Checkout from "../checkout/Checkout";
import Dashboard from "../dashboard/Dashboard";
import Inventory from "../products/Inventory";
import SupplierManagement from "../suppliers/SupplierManagement";
import PayassureData from "../payassure/PayassureData";
import SalesHistory from "../sales/SalesHistory";
import ContactSupport from "../support/ContactSupport";
import type { useCheckout } from "./useCheckout";
import type { useInventoryActions } from "../products/useInventoryActions";
import type { usePosData } from "./usePosData";
import type { useProfile } from "./useProfile";
import type { useCart } from "./useCart";
import type { Tab } from "../types";

type Props = {
  tab: Tab;
  data: ReturnType<typeof usePosData>;
  cart: ReturnType<typeof useCart>;
  profile: ReturnType<typeof useProfile>;
  checkout: ReturnType<typeof useCheckout>;
  actions: ReturnType<typeof useInventoryActions>;
};

export default function AppPages({ tab, data, cart, profile, checkout, actions }: Props) {
  if (tab === "dashboard" && data.dashboard) {
    return <Dashboard data={data.dashboard} period={data.dashboardPeriod} onPeriodChange={data.setDashboardPeriod} />;
  }
  if (tab === "checkout") {
    return <Checkout products={data.products} cartItems={cart.items} total={cart.total}
      payerName={checkout.payerName} payerPhone={checkout.payerPhone} onCartChange={cart.setCart}
      onPayerNameChange={checkout.setPayerName} onPayerPhoneChange={checkout.setPayerPhone}
      isCheckingOut={checkout.pending} checkoutStage={checkout.stage} onCheckout={checkout.checkout} />;
  }
  if (tab === "products") {
    return <Inventory products={data.products} batches={data.batches} suppliers={data.suppliers}
      onSaveProduct={actions.saveProduct} onUpdateProduct={actions.updateProduct}
      onUpdateBuyingPrice={actions.updateBuyingPrice} onUpdateBatchExpiry={actions.updateBatchExpiry}
      onAddStock={actions.addStock} />;
  }
  if (tab === "suppliers") {
    return <SupplierManagement suppliers={data.suppliers} onSaveSupplier={actions.saveSupplier} />;
  }
  if (tab === "payassure-data") {
    return <PayassureData profile={profile.profile} loading={profile.loading} onSave={profile.save} />;
  }
  if (tab === "history") return <SalesHistory sales={data.sales} />;
  if (tab === "support") return <ContactSupport />;
  return null;
}

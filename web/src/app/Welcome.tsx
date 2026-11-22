import FloatSummary from "./FloatSummary";
import type { useRetailerFloat } from "./useRetailerFloat";
import type { useFloatDeposit } from "./useFloatDeposit";

type Props = {
  floating: ReturnType<typeof useRetailerFloat>;
  deposit: ReturnType<typeof useFloatDeposit>;
};

export default function Welcome({ floating, deposit }: Props) {
  return (
    <div className="welcome">
      <div>
        <p className="eyebrow">RETAIL POINT OF SALE</p>
        <h1>Good day</h1>
        <p className="subtitle">A clear view of your shop, sales, and stock.</p>
      </div>
      <div className="welcome-summary-cards">
        <FloatSummary
          data={floating.retailerFloat}
          balance={floating.balance}
          liveBalance={floating.liveBalance}
          loading={floating.loading}
          error={floating.error}
          checkedAt={floating.checkedAt}
          checking={floating.checking}
          onDeposit={() => { deposit.setError(""); deposit.setOpen(true); }}
          onCheck={() => void floating.checkBalance()}
        />
      </div>
    </div>
  );
}

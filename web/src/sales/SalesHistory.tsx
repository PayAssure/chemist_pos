import { money } from "../lib/money";
import type { Sale } from "../types";

type SalesHistoryProps = { sales: Sale[] };

function SalesHistory({ sales }: SalesHistoryProps) {
  return (
    <section className="panel">
      <div className="panel-heading"><div><h2>Sales history</h2><p>Recent completed transactions and their item details.</p></div></div>
      {sales.length === 0 ? <div className="empty">Completed sales will appear here.</div> : (
        <div className="history-list">
          {sales.map((sale) => (
            <article className="sale-card" key={sale.id}>
              <div className="sale-head">
                <div><strong>Sale #{sale.id}</strong><span>{new Date(sale.createdAt).toLocaleString()}</span></div>
                <div className="sale-amount"><strong>{money(sale.totalCents)}</strong><span className="badge">{sale.paymentMethod === "cash" ? "Cash" : sale.paymentMethod === "credit" ? "Credit" : "M-Pesa"} · {sale.status}</span></div>
              </div>
              {sale.paymentMethod === "credit" && (
                <p className="helper-text">Payer: {sale.payerName} · {sale.payerPhone}</p>
              )}
              <ul className="sale-items">
                {sale.items.map((item, index) => (
                  <li key={`${sale.id}-${index}`}>
                    <span>{item.quantity} × {item.productName}{item.batchCode ? ` · ${item.batchCode}` : ""}</span>
                    <span>{money(item.quantity * item.unitPriceCents)}</span>
                  </li>
                ))}
              </ul>
              {sale.prescriptionReference && (
                <p className="helper-text">Prescription {sale.prescriptionReference} checked by {sale.prescriptionCheckedBy ?? "staff"}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default SalesHistory;

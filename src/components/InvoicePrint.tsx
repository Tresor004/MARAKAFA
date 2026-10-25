import { Sale } from "../types";
import { useStore, fmtDate } from "../store";

const nf = new Intl.NumberFormat("fr-SN");
const money = (n: number) => nf.format(Math.round(n * 100) / 100);

/**
 * Facture imprimable (masquée à l'écran, visible à l'impression grâce à `.print-only`).
 * Prix TTC ; la TVA affichée est la part incluse. Montre remises/promotions, retours (avoirs) et reste dû.
 */
export default function InvoicePrint({ sale }: { sale: Sale }) {
  const { shopSettings: ss, customers } = useStore();
  const cur = ss.currency || "FCFA";
  const shopName = ss.name || "Hi-Market";
  const idParts = [ss.ifu ? "IFU : " + ss.ifu : "", ss.rccm ? "RCCM : " + ss.rccm : ""].filter(Boolean);
  const contactParts = [ss.phone ? "Tél: " + ss.phone : "", ss.phone2, ss.email ? "Email: " + ss.email : ""].filter(Boolean);
  const locParts = [[ss.city, ss.country].filter(Boolean).join(", ")].filter(Boolean);
  const thanks = ss.thankYouMessage || `Merci pour votre visite à ${shopName} ! À bientôt.`;

  const taxAmt = sale.taxAmount ?? 0;
  const grand = sale.total;
  const listTotal = sale.items.reduce((a, i) => a + i.price * i.quantity, 0);
  const discounts = sale.items.reduce((a, i) => a + (i.discountAmount ?? 0), 0);
  const hasDiscount = discounts > 0.004;
  const returned = sale.returnedTotal ?? 0;
  const balance = sale.balanceDue ?? 0;
  const customer = customers.find(x => x.id === sale.customerId);

  // Détail de TVA par taux (les taux peuvent différer d'une ligne à l'autre)
  const vatByRate = new Map<number, number>();
  for (const it of sale.items) {
    const rate = it.taxRate ?? sale.taxRate ?? 0;
    if (rate > 0 && (it.taxAmount ?? 0) > 0) vatByRate.set(rate, (vatByRate.get(rate) ?? 0) + (it.taxAmount ?? 0));
  }
  const showVat = vatByRate.size > 0;
  const th = { padding: "8px 10px", borderBottom: "1px solid #cbd5e1" } as const;
  const td = { padding: "6px 10px", borderBottom: "1px solid #e2e8f0" } as const;
  const row = { display: "flex", justifyContent: "space-between", padding: "6px 10px" } as const;

  return (
    <div className="print-only">
      <style>{`@media print { body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; width: 100%; } @page { margin: 10mm; } }`}</style>
      <div className="print-area" style={{ background: "white", padding: "20mm", color: "#0f172a", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0f172a", paddingBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {ss.logo && <img src={ss.logo} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover" }} />}
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: 2 }}>{shopName}</h1>
              {idParts.length > 0 && <div style={{ fontSize: 11, color: "#475569", marginTop: 4, fontWeight: 600 }}>{idParts.join("  ·  ")}</div>}
              {contactParts.length > 0 && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{contactParts.join(" · ")}</div>}
              {(ss.address || locParts.length > 0) && <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{[ss.address, ...locParts].filter(Boolean).join(", ")}</div>}
            </div>
          </div>
          <div style={{ background: "#0f172a", color: "white", padding: "10px 16px", borderRadius: 8, textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 10, opacity: 0.8 }}>FACTURE</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{sale.invoiceNo}</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>Date : {fmtDate(sale.date)}</div>
          </div>
        </div>

        <div style={{ marginTop: 18, fontSize: 12 }}>
          <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 11, color: "#475569" }}>Client</div>
          <div style={{ marginTop: 4, fontWeight: 600 }}>{sale.customerName || "Client passage"}</div>
          {customer && <div style={{ color: "#475569" }}>{[customer.phone, customer.address].filter(Boolean).join(" · ")}</div>}
        </div>

        <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={{ ...th, textAlign: "left" }}>Désignation</th>
              <th style={{ ...th, textAlign: "right" }}>Qté</th>
              <th style={{ ...th, textAlign: "right" }}>PU ({cur})</th>
              {hasDiscount && <th style={{ ...th, textAlign: "right" }}>Remise</th>}
              <th style={{ ...th, textAlign: "right" }}>Total ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((it, idx) => {
              const note = [it.promotionLabel, (it.discountPercent ?? 0) > 0 ? `Remise ${it.discountPercent} %` : ""].filter(Boolean).join(" + ");
              return (
                <tr key={it.id ?? `${it.productId}-${idx}`}>
                  <td style={td}>
                    {it.name}
                    {note && <div style={{ fontSize: 10, color: "#64748b" }}>{note}</div>}
                    {(it.returnedQuantity ?? 0) > 0 && <div style={{ fontSize: 10, color: "#be123c" }}>Retourné : {it.returnedQuantity}</div>}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{it.quantity}</td>
                  <td style={{ ...td, textAlign: "right" }}>{money(it.price)}</td>
                  {hasDiscount && <td style={{ ...td, textAlign: "right", color: "#047857" }}>{(it.discountAmount ?? 0) > 0 ? `-${money(it.discountAmount ?? 0)}` : ""}</td>}
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{money(it.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginLeft: "auto", marginTop: 20, width: 320, fontSize: 13 }}>
          {hasDiscount && (
            <>
              <div style={{ ...row, background: "#f1f5f9" }}><span>Sous-total catalogue</span><span>{money(listTotal)} {cur}</span></div>
              <div style={{ ...row, background: "#f8fafc", color: "#047857" }}><span>Remises et promotions</span><span>-{money(discounts)} {cur}</span></div>
            </>
          )}
          <div style={{ ...row, background: "#f1f5f9" }}>
            <span>{showVat ? "Total HT" : "Sous-total"}</span><span>{money(grand - taxAmt)} {cur}</span>
          </div>
          {[...vatByRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, amount]) => (
            <div key={rate} style={{ ...row, background: "#f8fafc" }}><span>TVA incluse ({rate} %)</span><span>{money(amount)} {cur}</span></div>
          ))}
          <div style={{ ...row, padding: "10px", background: "#0f172a", color: "white", fontSize: 15, fontWeight: 800 }}>
            <span>TOTAL TTC</span><span>{money(grand)} {cur}</span>
          </div>
          {returned > 0 && (
            <>
              <div style={{ ...row, color: "#be123c" }}><span>Retours / avoirs</span><span>-{money(returned)} {cur}</span></div>
              <div style={{ ...row, fontWeight: 700 }}><span>Net après retours</span><span>{money(grand - returned)} {cur}</span></div>
            </>
          )}
          {balance > 0.004 && (
            <div style={{ ...row, padding: "10px", border: "2px solid #be123c", color: "#be123c", fontWeight: 800, marginTop: 6 }}>
              <span>RESTE À PAYER</span><span>{money(balance)} {cur}</span>
            </div>
          )}
        </div>

        <div style={{ marginTop: 20, fontSize: 11, color: "#475569" }}>
          <div>Mode de paiement : <b>{sale.paymentMethod}</b></div>
          <div>Montant reçu : <b>{money(sale.paid)} {cur}</b> · Monnaie : <b>{money(sale.change)} {cur}</b></div>
          <div>Caissier(e) : <b>{sale.userName}</b></div>
        </div>

        {(sale.returns?.length ?? 0) > 0 && (
          <div style={{ marginTop: 14, fontSize: 11, color: "#475569" }}>
            <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10 }}>Avoirs</div>
            {sale.returns!.map(r => (
              <div key={r.id}>{r.returnNo} · {fmtDate(r.date)} · {r.items.map(i => `${i.quantity} × ${i.name}`).join(", ")} · <b>{money(r.total)} {cur}</b></div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 10, color: "#94a3b8" }}>
          <div>{thanks}</div>
          {ss.invoiceFooter && <div style={{ marginTop: 3 }}>{ss.invoiceFooter}</div>}
          <div style={{ marginTop: 3 }}>Facture générée par {shopName} © {new Date().getFullYear()}</div>
        </div>
      </div>
    </div>
  );
}

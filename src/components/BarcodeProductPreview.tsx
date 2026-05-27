import { Edit3, Plus, X } from "lucide-react";
import { currency, wholeNumber } from "../lib/metrics";
import { productCaffeineMg } from "../lib/barcodeLookup";
import type { ResolvedBarcodeProduct } from "../types";

export function BarcodeProductPreview({
  barcode,
  busy,
  product,
  onAddNow,
  onCancel,
  onEdit,
}: {
  barcode: string;
  busy: boolean;
  product: ResolvedBarcodeProduct;
  onAddNow: () => void;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const caffeineMg = productCaffeineMg(product);

  return (
    <section
      className="rounded-3xl border border-cyan-200/20 bg-cyan-200/10 p-4 shadow-sm"
      aria-labelledby="barcode-product-title"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 h-4 w-4 shrink-0 rounded-full shadow-sm"
          style={{ backgroundColor: product.flavourAccent }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Barcode matched</p>
          <h3 id="barcode-product-title" className="mt-1 text-xl font-semibold tracking-tight text-white">
            Found: Red Bull {product.flavourName}, {product.sizeMl}ml, {currency.format(product.pricePerCan)},{" "}
            {wholeNumber.format(caffeineMg)}mg caffeine
          </h3>
          <p className="mt-2 break-all text-sm text-slate-300">Barcode {barcode}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button className="primary-button justify-center" type="button" onClick={onAddNow} disabled={busy}>
          <Plus size={17} aria-hidden="true" />
          Add now
        </button>
        <button className="secondary-button justify-center" type="button" onClick={onEdit} disabled={busy}>
          <Edit3 size={17} aria-hidden="true" />
          Edit before adding
        </button>
        <button className="secondary-button justify-center" type="button" onClick={onCancel} disabled={busy}>
          <X size={17} aria-hidden="true" />
          Cancel
        </button>
      </div>
    </section>
  );
}

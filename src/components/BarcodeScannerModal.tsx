import { AlertTriangle, Camera, Keyboard, Loader2, ScanLine, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { BUILT_IN_FLAVOURS, DEFAULT_FLAVOUR, flavourMeta } from "../data/flavours";
import {
  barcodeProductToEntryDraft,
  lookupBarcode,
  normalizeBarcode,
  productCaffeineMg,
  resolveProduct,
} from "../lib/barcodeLookup";
import {
  scannerErrorMessage,
  startBarcodeScanner,
  stopVideoStream,
  type BarcodeScannerController,
  type BarcodeScannerError,
  type BarcodeScanResult,
} from "../lib/barcodeScanner";
import { listBarcodeCatalog, upsertCloudUserBarcodeMapping } from "../lib/appwriteBarcodes";
import { caffeinePerCan, currency, defaultPriceForSize, wholeNumber } from "../lib/metrics";
import {
  loadUserBarcodeMappings,
  upsertUserBarcodeMapping,
} from "../lib/userBarcodeMappings";
import type {
  BarcodeLookupCatalog,
  BarcodeProductDraft,
  EntryDraft,
  Flavour,
  ResolvedBarcodeProduct,
  UserBarcodeMapping,
} from "../types";
import { BarcodeProductPreview } from "./BarcodeProductPreview";

type ScannerPhase = "idle" | "starting" | "scanning" | "found" | "manual" | "error";

export function BarcodeScannerModal({
  busy,
  flavours,
  open,
  userId,
  onAddNow,
  onClose,
  onEditBeforeAdding,
}: {
  busy: boolean;
  flavours: Flavour[];
  open: boolean;
  userId: string;
  onAddNow: (draft: EntryDraft) => void;
  onClose: () => void;
  onEditBeforeAdding: (draft: EntryDraft) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<BarcodeScannerController | null>(null);
  const barcodeCatalogRef = useRef<BarcodeLookupCatalog>({});
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const [phase, setPhase] = useState<ScannerPhase>("idle");
  const [barcode, setBarcode] = useState("");
  const [scannerMode, setScannerMode] = useState<BarcodeScannerController["mode"] | null>(null);
  const [scannerError, setScannerError] = useState<BarcodeScannerError | null>(null);
  const [product, setProduct] = useState<ResolvedBarcodeProduct | null>(null);
  const [typedBarcode, setTypedBarcode] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [selectedFlavour, setSelectedFlavour] = useState(DEFAULT_FLAVOUR.name);
  const [sizePreset, setSizePreset] = useState("250");
  const [customSize, setCustomSize] = useState("250");
  const [pricePerCan, setPricePerCan] = useState(defaultPriceForSize(250).toFixed(2));
  const [sugarFree, setSugarFree] = useState(Boolean(DEFAULT_FLAVOUR.sugarFree));
  const [caffeineOverride, setCaffeineOverride] = useState("");
  const [saveMapping, setSaveMapping] = useState(true);
  const [mappingSaving, setMappingSaving] = useState(false);

  const activeBarcode = barcode || normalizeBarcode(typedBarcode);
  const numericSize = Math.max(1, sizePreset === "custom" ? Number(customSize) || 250 : Number(sizePreset));
  const manualProduct = useMemo(
    (): BarcodeProductDraft => ({
      flavourName: selectedFlavour,
      sizeMl: numericSize,
      pricePerCan: Math.max(0, Number(pricePerCan) || 0),
      sugarFree: sugarFree || Boolean(flavourMeta(selectedFlavour).sugarFree),
      caffeineMgPerCan: caffeineOverride.trim() ? Math.max(0, Number(caffeineOverride) || 0) : undefined,
    }),
    [caffeineOverride, numericSize, pricePerCan, selectedFlavour, sugarFree],
  );
  const manualCaffeine = productCaffeineMg(manualProduct);

  const stopScanner = useCallback(() => {
    controllerRef.current?.stop();
    controllerRef.current = null;
    stopVideoStream(videoRef.current);
  }, []);

  const applyManualDefaults = useCallback((draft?: BarcodeProductDraft) => {
    const flavour = draft?.flavourName && BUILT_IN_FLAVOURS.some((item) => item.name === draft.flavourName)
      ? draft.flavourName
      : DEFAULT_FLAVOUR.name;
    const size = draft?.sizeMl ?? 250;
    const isStandardSize = size === 250 || size === 355 || size === 473;
    const meta = flavourMeta(flavour);

    setSelectedFlavour(flavour);
    setSizePreset(isStandardSize ? size.toString() : "custom");
    setCustomSize(size.toString());
    setPricePerCan((draft?.pricePerCan ?? defaultPriceForSize(size)).toFixed(2));
    setSugarFree(draft?.sugarFree ?? Boolean(meta.sugarFree));
    setCaffeineOverride(draft?.caffeineMgPerCan?.toString() ?? "");
    setSaveMapping(true);
  }, []);

  const resolveBarcodeValue = useCallback(
    (rawValue: string) => {
      const normalized = normalizeBarcode(rawValue);
      if (!normalized) {
        setScannerError({ code: "unsupported", message: scannerErrorMessage("unsupported") });
        setPhase("error");
        return;
      }

      const lookup = lookupBarcode(normalized, barcodeCatalogRef.current);
      setBarcode(normalized);
      setTypedBarcode(normalized);
      stopScanner();

      if (lookup.status === "known" || lookup.status === "user") {
        setProduct(lookup.product);
        setManualMessage("");
        setPhase("found");
        return;
      }

      setProduct(null);
      applyManualDefaults(lookup.status === "partial" ? lookup.product : undefined);
      setManualMessage(
        lookup.status === "partial"
          ? lookup.reason
          : "Barcode found, but this product is not mapped yet. Add the drink details once and future scans can reuse them.",
      );
      setPhase("manual");
    },
    [applyManualDefaults, stopScanner],
  );

  const handleScannerResult = useCallback(
    (result: BarcodeScanResult) => {
      const normalized = normalizeBarcode(result.value);
      const lastScan = lastScanRef.current;
      const now = Date.now();
      if (!normalized || (lastScan?.value === normalized && now - lastScan.at < 1_500)) return;
      lastScanRef.current = { value: normalized, at: now };
      resolveBarcodeValue(normalized);
    },
    [resolveBarcodeValue],
  );

  const handleScannerError = useCallback(
    (error: BarcodeScannerError) => {
      stopScanner();
      setScannerError(error);
      setPhase("error");
    },
    [stopScanner],
  );

  useEffect(() => {
    if (!open) {
      stopScanner();
      return undefined;
    }

    const localMappings = loadUserBarcodeMappings(userId);
    barcodeCatalogRef.current = { userMappings: localMappings };
    lastScanRef.current = null;
    setPhase("starting");
    setScannerError(null);
    setBarcode("");
    setTypedBarcode("");
    setProduct(null);
    setManualMessage("");
    setMappingSaving(false);
    applyManualDefaults();
    window.setTimeout(() => closeButtonRef.current?.focus(), 80);

    let active = true;
    const video = videoRef.current;
    if (!video) return undefined;

    void startBarcodeScanner(video, handleScannerResult, handleScannerError)
      .then((controller) => {
        if (!active) {
          controller.stop();
          return;
        }
        controllerRef.current = controller;
        setScannerMode(controller.mode);
        setPhase("scanning");
      })
      .catch((error: BarcodeScannerError) => {
        if (!active) return;
        setScannerError(error);
        setPhase("error");
      });

    void listBarcodeCatalog()
      .then((catalog) => {
        if (!active) return;
        barcodeCatalogRef.current = {
          verifiedProducts: hasVerifiedProducts(catalog) ? catalog.verifiedProducts : undefined,
          userMappings: mergeUserMappings(localMappings, catalog.userMappings ?? []),
        };
      })
      .catch(() => {
        barcodeCatalogRef.current = { userMappings: localMappings };
      });

    return () => {
      active = false;
      stopScanner();
    };
  }, [applyManualDefaults, handleScannerError, handleScannerResult, open, stopScanner, userId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  function submitTypedBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resolveBarcodeValue(typedBarcode);
  }

  async function saveManualProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeBarcode(activeBarcode);
    if (!normalized) {
      setManualMessage("Enter the barcode number before saving a mapping.");
      return;
    }

    setMappingSaving(true);
    try {
      let mapping: UserBarcodeMapping | null = null;
      let savedMessage = "";
      if (saveMapping) {
        try {
          mapping = await upsertCloudUserBarcodeMapping(userId, normalized, manualProduct);
          upsertUserBarcodeMapping(userId, normalized, manualProduct);
          savedMessage = "Saved to Appwrite and cached locally for future scans.";
        } catch {
          mapping = upsertUserBarcodeMapping(userId, normalized, manualProduct);
          savedMessage = "Saved locally for future scans on this device. Appwrite barcode sync is not available yet.";
        }
        barcodeCatalogRef.current = {
          ...barcodeCatalogRef.current,
          userMappings: mergeUserMappings(
            loadUserBarcodeMappings(userId),
            mapping ? [mapping] : [],
          ),
        };
      }

      setBarcode(normalized);
      setTypedBarcode(normalized);
      setProduct(resolveProduct(manualProduct, mapping ? "user" : "built-in"));
      setManualMessage(savedMessage);
      setPhase("found");
    } finally {
      setMappingSaving(false);
    }
  }

  function addProductNow(nextProduct: ResolvedBarcodeProduct) {
    onAddNow(barcodeProductToEntryDraft(nextProduct, activeBarcode));
  }

  function editProductBeforeAdding(nextProduct: ResolvedBarcodeProduct) {
    onEditBeforeAdding(barcodeProductToEntryDraft(nextProduct, activeBarcode));
  }

  const scannerStatus =
    phase === "starting"
      ? "Starting camera..."
      : phase === "scanning"
        ? `Scanning${scannerMode ? ` with ${scannerMode === "native" ? "native detector" : "ZXing fallback"}` : ""}...`
        : "Scanner paused";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop fixed inset-0 z-50 flex justify-center bg-black/70 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="barcode-scanner-title"
        >
          <motion.div
            className="modal-panel max-w-4xl"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.22 }}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">Camera scan</p>
                <h2 id="barcode-scanner-title" className="app-card-title mt-1 text-3xl">
                  Scan barcode
                </h2>
                <p className="app-card-subtitle mt-2">Point your camera at the barcode on the can.</p>
              </div>
              <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="Close barcode scanner">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="grid gap-3">
                <div className="relative overflow-hidden rounded-3xl border border-cyan-200/20 bg-black shadow-2xl">
                  <video
                    ref={videoRef}
                    className="aspect-[3/4] w-full bg-black object-cover sm:aspect-video"
                    muted
                    playsInline
                    aria-label="Live camera preview"
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-28 w-[78%] max-w-sm rounded-2xl border-2 border-cyan-200/90 shadow-[0_0_0_999px_rgba(0,0,0,0.28),0_0_32px_rgba(125,231,255,0.35)]" />
                  </div>
                  <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white backdrop-blur">
                    <span className="inline-flex items-center gap-2">
                      {phase === "starting" ? (
                        <Loader2 className="animate-spin text-cyan-100" size={16} aria-hidden="true" />
                      ) : (
                        <ScanLine className="text-cyan-100" size={16} aria-hidden="true" />
                      )}
                      {scannerStatus}
                    </span>
                    <span className="hidden text-xs text-slate-300 sm:inline">EAN/UPC</span>
                  </div>
                </div>

                <form className="rounded-3xl border border-white/10 bg-white/[0.05] p-3" onSubmit={submitTypedBarcode}>
                  <label className="field-label">
                    Type barcode instead
                    <span className="flex flex-col gap-2 sm:flex-row">
                      <input
                        className="field-control"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="EAN or UPC number"
                        value={typedBarcode}
                        onChange={(event) => setTypedBarcode(event.target.value)}
                      />
                      <button className="secondary-button shrink-0 justify-center" type="submit">
                        <Keyboard size={17} aria-hidden="true" />
                        Lookup
                      </button>
                    </span>
                  </label>
                </form>
              </section>

              <section className="grid content-start gap-3">
                {phase === "starting" || phase === "scanning" ? (
                  <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-200/10 text-cyan-100">
                      <Camera size={22} aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-white">Searching for a retail barcode</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Hold the can steady inside the frame. The camera will stop automatically after a match.
                    </p>
                  </div>
                ) : null}

                {phase === "error" && (
                  <div className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 text-amber-50">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
                      <div>
                        <h3 className="font-semibold text-white">Scanner unavailable</h3>
                        <p className="mt-2 text-sm leading-6">{scannerError?.message ?? scannerErrorMessage("unknown")}</p>
                      </div>
                    </div>
                  </div>
                )}

                {phase === "manual" && (
                  <form className="rounded-3xl border border-white/10 bg-white/[0.05] p-4" onSubmit={saveManualProduct}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Unknown barcode</p>
                    <h3 className="mt-1 break-all text-xl font-semibold text-white">{activeBarcode || "No barcode entered"}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{manualMessage}</p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="field-label">
                        Flavour
                        <select
                          className="field-control"
                          value={selectedFlavour}
                          onChange={(event) => {
                            const flavour = event.target.value;
                            setSelectedFlavour(flavour);
                            setSugarFree(Boolean(flavourMeta(flavour).sugarFree));
                          }}
                        >
                          {flavours.map((flavour) => (
                            <option key={flavour.name} value={flavour.name}>
                              {flavour.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field-label">
                        Can size
                        <select
                          className="field-control"
                          value={sizePreset}
                          onChange={(event) => {
                            const next = event.target.value;
                            setSizePreset(next);
                            if (next !== "custom") {
                              const size = Number(next);
                              setCustomSize(next);
                              setPricePerCan(defaultPriceForSize(size).toFixed(2));
                              setCaffeineOverride("");
                            }
                          }}
                        >
                          <option value="250">250ml</option>
                          <option value="355">355ml</option>
                          <option value="473">473ml</option>
                          <option value="custom">Custom</option>
                        </select>
                      </label>

                      {sizePreset === "custom" && (
                        <>
                          <label className="field-label">
                            Custom size in ml
                            <input className="field-control" min="1" step="1" type="number" value={customSize} onChange={(event) => setCustomSize(event.target.value)} />
                          </label>
                          <label className="field-label">
                            Caffeine mg/can
                            <input
                              className="field-control"
                              min="0"
                              step="1"
                              type="number"
                              value={caffeineOverride}
                              onChange={(event) => setCaffeineOverride(event.target.value)}
                              placeholder={wholeNumber.format(caffeinePerCan(numericSize))}
                            />
                          </label>
                        </>
                      )}

                      <label className="field-label">
                        Price
                        <input className="field-control" min="0" step="0.01" type="number" value={pricePerCan} onChange={(event) => setPricePerCan(event.target.value)} required />
                      </label>

                      <div className="rounded-2xl border border-cyan-200/20 bg-cyan-200/10 px-3 py-3 text-sm text-cyan-50">
                        Estimated caffeine: {wholeNumber.format(manualCaffeine)}mg
                        <br />
                        Price: {currency.format(manualProduct.pricePerCan)}
                      </div>

                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-sm text-slate-200 sm:col-span-2">
                        <input className="h-4 w-4" type="checkbox" checked={sugarFree} onChange={(event) => setSugarFree(event.target.checked)} />
                        Count this product as sugar-free / zero sugar
                      </label>

                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 text-sm text-slate-200 sm:col-span-2">
                        <input className="h-4 w-4" type="checkbox" checked={saveMapping} onChange={(event) => setSaveMapping(event.target.checked)} />
                        Save this barcode mapping locally for future scans
                      </label>
                    </div>

                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button className="secondary-button justify-center" type="button" onClick={onClose}>
                        Cancel
                      </button>
                      <button className="primary-button justify-center" type="submit" disabled={mappingSaving}>
                        {mappingSaving ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : null}
                        Save mapping preview
                      </button>
                    </div>
                  </form>
                )}

                {phase === "found" && product && (
                  <BarcodeProductPreview
                    barcode={activeBarcode}
                    busy={busy}
                    product={product}
                    onAddNow={() => addProductNow(product)}
                    onCancel={onClose}
                    onEdit={() => editProductBeforeAdding(product)}
                  />
                )}
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function hasVerifiedProducts(catalog: BarcodeLookupCatalog) {
  return Object.keys(catalog.verifiedProducts ?? {}).length > 0;
}

function mergeUserMappings(
  localMappings: UserBarcodeMapping[],
  cloudMappings: UserBarcodeMapping[],
) {
  const byBarcode = new Map<string, UserBarcodeMapping>();
  localMappings.forEach((mapping) => byBarcode.set(mapping.barcode, mapping));
  cloudMappings.forEach((mapping) => byBarcode.set(mapping.barcode, mapping));
  return [...byBarcode.values()];
}

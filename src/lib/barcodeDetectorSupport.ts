type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): {
    detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string; format?: string }>>;
  };
  getSupportedFormats?: () => Promise<string[]>;
};

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: BarcodeDetectorConstructor;
};

let detectorReady: Promise<void> | null = null;

export function isAppleMobileDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function loadBarcodeDetectorPolyfill() {
  const { BarcodeDetectorPolyfill } = await import("@undecaf/barcode-detector-polyfill");
  return BarcodeDetectorPolyfill;
}

export function ensureBarcodeDetector() {
  if (detectorReady) return detectorReady;

  detectorReady = (async () => {
    const globalWindow = window as WindowWithBarcodeDetector;
    const shouldForcePolyfill = isAppleMobileDevice();

    if (shouldForcePolyfill) {
      globalWindow.BarcodeDetector = await loadBarcodeDetectorPolyfill();
      return;
    }

    try {
      const getSupportedFormats = globalWindow.BarcodeDetector?.getSupportedFormats;
      if (!getSupportedFormats) return;
      await getSupportedFormats.call(globalWindow.BarcodeDetector);
    } catch {
      globalWindow.BarcodeDetector = await loadBarcodeDetectorPolyfill();
    }
  })();

  return detectorReady;
}

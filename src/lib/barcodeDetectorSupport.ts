import { BarcodeDetectorPolyfill } from "@undecaf/barcode-detector-polyfill";

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: typeof BarcodeDetectorPolyfill;
};

let detectorReady: Promise<void> | null = null;

export function isAppleMobileDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function ensureBarcodeDetector() {
  if (detectorReady) return detectorReady;

  detectorReady = (async () => {
    const globalWindow = window as WindowWithBarcodeDetector;
    const shouldForcePolyfill = isAppleMobileDevice();

    if (shouldForcePolyfill) {
      globalWindow.BarcodeDetector = BarcodeDetectorPolyfill;
      return;
    }

    try {
      await globalWindow.BarcodeDetector?.getSupportedFormats();
    } catch {
      globalWindow.BarcodeDetector = BarcodeDetectorPolyfill;
    }
  })();

  return detectorReady;
}

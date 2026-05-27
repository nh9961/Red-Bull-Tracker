import {
  BarcodeFormat,
  BrowserCodeReader,
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { normalizeBarcode } from "./barcodeLookup";

export type BarcodeScannerErrorCode =
  | "camera-denied"
  | "no-camera"
  | "unsupported"
  | "camera-in-use"
  | "unknown";

export type BarcodeScannerError = {
  code: BarcodeScannerErrorCode;
  message: string;
};

export type BarcodeScanResult = {
  value: string;
  format: string;
};

export type BarcodeScannerController = {
  mode: "native" | "zxing";
  stop: () => void;
};

type NativeBarcode = {
  rawValue?: string;
  format?: string;
};

type NativeBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<NativeBarcode[]>;
};

type NativeBarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => NativeBarcodeDetector;

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: NativeBarcodeDetectorConstructor & {
    getSupportedFormats?: () => Promise<string[]>;
  };
};

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];
const SCAN_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
};

export async function startBarcodeScanner(
  videoElement: HTMLVideoElement,
  onResult: (result: BarcodeScanResult) => void,
  onError: (error: BarcodeScannerError) => void,
): Promise<BarcodeScannerController> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw toScannerError(new Error("Camera access is not supported in this browser."));
  }

  if (await supportsNativeBarcodeDetector()) {
    try {
      return await startNativeBarcodeScanner(videoElement, onResult);
    } catch (error) {
      stopVideoStream(videoElement);
      if (isCameraAccessError(error)) {
        throw toScannerError(error);
      }
    }
  }

  return startZxingBarcodeScanner(videoElement, onResult, onError);
}

export function stopVideoStream(videoElement: HTMLVideoElement | null) {
  if (!videoElement) return;
  const stream = videoElement.srcObject;
  if (stream instanceof MediaStream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  videoElement.pause();
  videoElement.removeAttribute("src");
  videoElement.srcObject = null;
  videoElement.load();
}

export function scannerErrorMessage(code: BarcodeScannerErrorCode) {
  switch (code) {
    case "camera-denied":
      return "Camera permission was denied. Allow camera access, then try scanning again.";
    case "no-camera":
      return "No camera was found on this device. You can type the barcode instead.";
    case "camera-in-use":
      return "The camera looks busy in another app or browser tab. Close it there, then try again.";
    case "unsupported":
      return "Barcode scanning is not supported in this browser. You can type the barcode instead.";
    case "unknown":
    default:
      return "The scanner could not start. You can type the barcode instead.";
  }
}

function startNativeBarcodeScanner(
  videoElement: HTMLVideoElement,
  onResult: (result: BarcodeScanResult) => void,
): Promise<BarcodeScannerController> {
  return new Promise((resolve, reject) => {
    let stopped = false;
    let animationFrame = 0;
    let stream: MediaStream | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia(SCAN_CONSTRAINTS);
        videoElement.srcObject = stream;
        videoElement.setAttribute("playsinline", "true");
        videoElement.muted = true;
        await videoElement.play();

        const Detector = (window as WindowWithBarcodeDetector).BarcodeDetector;
        if (!Detector) {
          throw new Error("Native barcode detector unavailable.");
        }
        const detector = new Detector({ formats: NATIVE_FORMATS });

        const stop = () => {
          stopped = true;
          window.cancelAnimationFrame(animationFrame);
          stopVideoStream(videoElement);
        };

        const scan = async () => {
          if (stopped) return;
          try {
            if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              const barcodes = await detector.detect(videoElement);
              const barcode = barcodes.find((item) => normalizeBarcode(item.rawValue ?? ""));
              if (barcode?.rawValue) {
                onResult({
                  value: normalizeBarcode(barcode.rawValue),
                  format: barcode.format ?? "unknown",
                });
              }
            }
          } finally {
            if (!stopped) animationFrame = window.requestAnimationFrame(() => void scan());
          }
        };

        animationFrame = window.requestAnimationFrame(() => void scan());
        resolve({ mode: "native", stop });
      } catch (error) {
        if (stream) stream.getTracks().forEach((track) => track.stop());
        reject(error);
      }
    }

    void start();
  });
}

async function startZxingBarcodeScanner(
  videoElement: HTMLVideoElement,
  onResult: (result: BarcodeScanResult) => void,
  onError: (error: BarcodeScannerError) => void,
): Promise<BarcodeScannerController> {
  const reader = new BrowserMultiFormatReader();
  reader.possibleFormats = ZXING_FORMATS;

  try {
    const controls = await reader.decodeFromConstraints(
      SCAN_CONSTRAINTS,
      videoElement,
      (result, error) => {
        if (result) {
          onResult({
            value: normalizeBarcode(result.getText()),
            format: BarcodeFormat[result.getBarcodeFormat()] ?? "unknown",
          });
          return;
        }
        if (error && !/not.?found/i.test(error.name) && !/not.?found/i.test(error.message)) {
          onError(toScannerError(error));
        }
      },
    );

    return {
      mode: "zxing",
      stop: () => stopZxingScanner(controls, videoElement),
    };
  } catch (error) {
    stopVideoStream(videoElement);
    BrowserCodeReader.releaseAllStreams();
    throw toScannerError(error);
  }
}

function stopZxingScanner(controls: IScannerControls, videoElement: HTMLVideoElement) {
  controls.stop();
  BrowserCodeReader.releaseAllStreams();
  stopVideoStream(videoElement);
}

async function supportsNativeBarcodeDetector() {
  const Detector = (window as WindowWithBarcodeDetector).BarcodeDetector;
  if (!Detector) return false;
  if (!Detector.getSupportedFormats) return true;

  try {
    const formats = await Detector.getSupportedFormats();
    return NATIVE_FORMATS.some((format) => formats.includes(format));
  } catch {
    return false;
  }
}

function isCameraAccessError(error: unknown) {
  if (!(error instanceof DOMException)) return false;
  return ["NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError"].includes(error.name);
}

function toScannerError(error: unknown): BarcodeScannerError {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return { code: "camera-denied", message: scannerErrorMessage("camera-denied") };
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return { code: "no-camera", message: scannerErrorMessage("no-camera") };
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return { code: "camera-in-use", message: scannerErrorMessage("camera-in-use") };
    }
  }

  if (error instanceof Error && /not.?found|video input|requested device/i.test(error.message)) {
    return { code: "no-camera", message: scannerErrorMessage("no-camera") };
  }

  if (error instanceof Error && /not.?allowed|permission|denied/i.test(error.message)) {
    return { code: "camera-denied", message: scannerErrorMessage("camera-denied") };
  }

  if (error instanceof Error && /in use|busy|could not start video source/i.test(error.message)) {
    return { code: "camera-in-use", message: scannerErrorMessage("camera-in-use") };
  }

  if (error instanceof Error && /not supported|unsupported|barcode detector unavailable/i.test(error.message)) {
    return { code: "unsupported", message: scannerErrorMessage("unsupported") };
  }

  return { code: "unknown", message: scannerErrorMessage("unknown") };
}

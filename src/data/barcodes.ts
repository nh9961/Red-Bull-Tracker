import type { BarcodeSeedProduct } from "../types";
import verifiedBarcodes from "./verified-barcodes.json";

// Verified retail barcodes only. Add rows here via verified-barcodes.json so
// the frontend seed data and Appwrite setup script stay aligned.
export const BUILT_IN_BARCODE_PRODUCTS = verifiedBarcodes as Record<string, BarcodeSeedProduct>;

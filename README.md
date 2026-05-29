# 🐂 Red Bull Intake Tracker

Track your Red Bull consumption with per-can logging, barcode scanning, spending insights, and an AI-powered coach. Built with React, Appwrite, and Material You theming.

![React](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Vite](https://img.shields.io/badge/Vite-6-purple) ![Appwrite](https://img.shields.io/badge/Appwrite-Cloud-pink)

## Features

- **Quick logging** — tap a flavour, pick a size, done. Cans are tracked with timestamp, price, and store
- **Barcode scanning** — scan any Red Bull can (EAN-13/EAN-8/UPC-A) and it auto-fills flavour, size, and caffeine. 475+ verified barcodes built in, with user overrides
- **20 built-in flavours** — Original, Zero, Ruby, Tropical, Dragon Fruit, and more, each with its own accent colour
- **AI coach** — ChatGPT-style chat interface powered by Ollama, keeps per-session context and gives caffeine/spending advice
- **Daily limits** — set max cans/day, max spend/day, and a cut-off time. Get warned when you're about to breach
- **Charts & analytics** — intake over time, flavour breakdown (pie chart), spending trends, caffeine metrics
- **Import** — bulk import from Excel (.xlsx) or JSON, with duplicate detection and row-level error preview
- **Export** — download your data as Excel or JSON anytime
- **Material You theming** — every flavour gets its own dynamic colour palette. Dark mode included
- **Onboarding flow** — guided setup for new users with limit preferences
- **Appwrite auth** — email/password login, row-level security per user

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, Framer Motion |
| Charts | Recharts |
| Backend | Appwrite Cloud (auth, database, storage) |
| AI | Ollama (via server proxy) |
| Barcode | @zxing/browser |
| Import/Export | ExcelJS |

## Getting Started

### Prerequisites

- Node.js 18+
- An [Appwrite Cloud](https://cloud.appwrite.io) project (free tier works)

### Setup

1. Clone and install:

```bash
git clone https://github.com/nh9961/Red-Bull-Tracker.git
cd Red-Bull-Tracker
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env.local
```

3. Fill in your Appwrite credentials in `.env.local` (see [Appwrite Setup](APPWRITE_SETUP.md) for full instructions)

4. Create the database and collections:

```bash
APPWRITE_API_KEY=your-admin-key npm run setup:appwrite
```

5. Start the dev server:

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_APPWRITE_ENDPOINT` | Yes | Appwrite endpoint (e.g. `https://fra.cloud.appwrite.io/v1`) |
| `VITE_APPWRITE_PROJECT_ID` | Yes | Your Appwrite project ID |
| `VITE_APPWRITE_DATABASE_ID` | Yes | Database ID (default: `redbull_tracker`) |
| `VITE_APPWRITE_COLLECTION_ID` | Yes | Intake entries collection ID |
| `VITE_APPWRITE_CHAT_COLLECTION_ID` | Yes | Coach chats collection ID |
| `VITE_OLLAMA_PROXY_URL` | No | AI coach proxy endpoint |
| `OLLAMA_API_KEY` | No | Server-side Ollama API key |
| `OLLAMA_MODEL` | No | Ollama model for coach (default: `deepseek-v4-pro:cloud`) |
| `APPWRITE_API_KEY` | No | Admin key for `setup:appwrite` script only |

## Project Structure

```
src/
├── App.tsx                    # Main app shell, routing, layout
├── components/
│   ├── BarcodeScannerModal.tsx  # Camera barcode scanner
│   ├── BarcodeProductPreview.tsx
│   ├── CoachPanel.tsx           # AI coach chat UI
│   ├── DailyLimitsCard.tsx      # Limit status & warnings
│   ├── LimitsSettingsForm.tsx
│   └── OnboardingScreen.tsx
├── data/
│   ├── flavours.ts             # 20 built-in flavour definitions
│   ├── themes.ts               # Material You theme tokens per flavour
│   ├── barcodes.ts
│   └── verified-barcodes.json  # 475+ verified product barcodes
├── lib/
│   ├── appwrite.ts             # Appwrite client init
│   ├── appwriteEntries.ts      # CRUD for intake entries
│   ├── appwriteBarcodes.ts     # Barcode product storage
│   ├── barcodeLookup.ts        # Multi-source barcode resolution
│   ├── barcodeScanner.ts       # @zxing scanner wrapper
│   ├── userBarcodeMappings.ts  # Per-user barcode overrides
│   ├── coachChats.ts           # Coach chat persistence
│   ├── useCoachSession.ts      # Coach chat hook
│   ├── userLimits.ts           # Daily limit logic
│   ├── metrics.ts              # Computed stats & charts
│   ├── excel.ts                # Excel import/export
│   ├── storage.ts              # Local storage helpers
│   ├── themeTokens.ts          # Dynamic theme generation
│   └── greeting.ts
└── types.ts                    # All TypeScript types
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint check |
| `npm run setup:appwrite` | Create/update Appwrite database resources |

## License

MIT

---

Built by [Ned Halksworth](https://github.com/nh9961)
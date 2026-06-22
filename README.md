# HeartSync

> *"Il tuo cuore lo ha scelto prima di te."*

App di dating **biometrica**: il match non nasce da uno swipe, ma dalla reazione
fisiologica involontaria — l'aumento della frequenza cardiaca — quando guardi il
profilo di un'altra persona. Quando due utenti reagiscono reciprocamente, scatta
un **match bilaterale** con un *cardiac score* (0–100).

Documentazione completa dell'architettura: [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)

## Stack

- React 18 + Vite 5 + TypeScript — frontend
- Tailwind CSS + shadcn/ui — design system "Dark Cinematic Noir"
- Supabase (Lovable Cloud) — Auth, Postgres + RLS, Realtime, Edge Functions
- Capacitor 6 — wrapper nativo iOS / Android
- HealthKit (iOS) / Health Connect (Android) — sorgente dati cardiaci
- Vitest — test dell'engine di signal processing

## Sviluppo locale

```sh
npm install --legacy-peer-deps
npm run dev        # dev server web
npm test           # test engine biometrico (Vitest)
npm run build      # build di produzione in dist/
```

> `--legacy-peer-deps` è necessario: `@perfood/capacitor-healthkit` dichiara
> una peer dependency su Capacitor 4 ma funziona con Capacitor 6.

## Build mobile (iOS e Android)

Il progetto usa Capacitor: la web-app viene compilata in `dist/` e impacchettata
nelle app native.

### Android

Requisiti: Android Studio + Android SDK.

```sh
npm run build
npx cap add android      # solo la prima volta
npx cap sync android
npx cap open android     # apre Android Studio → Run / Build APK-AAB
```

Permessi: l'app usa **Health Connect** (`capacitor-health-connect`). Su device
serve l'app Health Connect installata e i permessi di lettura heart rate
concessi al primo avvio (gestito da `src/components/HealthConsent.tsx`).

### iOS

Requisiti: **macOS** con Xcode + CocoaPods (la build iOS non è possibile da Windows/Linux).

```sh
npm run build
npx cap add ios          # solo la prima volta
npx cap sync ios
npx cap open ios         # apre Xcode → firma con il tuo team → Run
```

In Xcode abilitare la capability **HealthKit** e verificare che `Info.plist`
contenga `NSHealthShareUsageDescription` (descrizione dell'uso dei dati cardiaci).

### Live reload durante lo sviluppo

In `capacitor.config.ts` è presente (commentato) un blocco `server.url` che
punta al preview Lovable: decommentarlo per testare sul device senza ricompilare,
ma **ricommentarlo prima di una build di release**, altrimenti l'app caricherà
il sito remoto invece del bundle locale.

## Struttura

| Percorso | Contenuto |
|---|---|
| `src/engine/` | Signal processor BPM (baseline ibrida, filtri anti falso-positivo) |
| `src/pages/` | Login, Register, ProfileSetup, Discovery, Matches, Chat, Debug |
| `src/components/` | MatchReveal, HealthConsent, ProfileDetailSheet, ecc. |
| `supabase/migrations/` | Schema DB (profiles, biometric_reactions, matches, messages, date_invites) |
| `supabase/functions/check-match/` | Edge function per il match bilaterale (cardiaco e ibrido) |
| `supabase/functions/delete-account/` | Edge function per la cancellazione completa dell'account |

## Note di deploy backend

Le migration in `supabase/migrations/` e le edge functions vengono applicate
da Lovable Cloud al push su GitHub. La migration
`20260611220000_manual_interest_and_validation.sql` aggiunge:
- colonna `source` ('cardiac' | 'manual') su `biometric_reactions` per il
  fallback senza smartwatch;
- trigger di validazione server-side (sanity check, cooldown 20s,
  rate-limit 30 reazioni/ora).

## Test

L'engine biometrico è coperto da test Vitest (`src/engine/__tests__/`):

```sh
npm test
```

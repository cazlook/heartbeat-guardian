# HEARTSYNC — Project Overview

> *"Il tuo cuore lo ha scelto prima di te."*

---

## 1. Che cos'è HeartSync

HeartSync è un'app di dating **biometrica**: invece di basare il match su swipe,
like o algoritmi di compatibilità testuale, utilizza la **reazione fisiologica
involontaria** dell'utente — nello specifico l'aumento della frequenza cardiaca
(BPM) — quando guarda il profilo di un'altra persona.

L'idea di fondo:
- Quando vedi qualcuno che ti attrae davvero, il tuo cuore reagisce **prima**
  che la tua mente formuli un giudizio.
- HeartSync capta questo segnale tramite smartwatch (Apple HealthKit /
  Android Health Connect) o sensore PPG, lo confronta con il tuo battito
  basale, e registra una "reazione cardiaca" se il segnale è statisticamente
  significativo.
- Quando **due utenti reagiscono reciprocamente** l'uno al profilo dell'altro,
  scatta un **match bilaterale** con un *cardiac score* (0–100).

---

## 2. Stack tecnico

| Layer            | Tecnologia                                   |
|------------------|----------------------------------------------|
| Frontend         | React 18 + Vite 5 + TypeScript 5             |
| Styling          | Tailwind CSS v3 + shadcn/ui                  |
| Routing          | React Router v6                              |
| State / Data     | TanStack Query                               |
| Backend          | Lovable Cloud (Supabase: Postgres + Auth + Realtime + Edge Functions) |
| Mobile wrapper   | Capacitor (per accesso a HealthKit / Health Connect) |
| Font display     | Cormorant Garamond (serif)                   |
| Font BPM/dati    | JetBrains Mono                               |

---

## 3. Identità visiva — Dark Cinematic Noir

Palette **rigorosa**, applicata in modo coerente su tutte le pagine:

| Elemento          | Valore                          |
|-------------------|---------------------------------|
| Sfondo            | `#0d0d0d` (nero profondo)       |
| Superfici         | `#1a1a1a` / `#222`              |
| Accent            | `#d4a574` (ambra/oro, usato pochissimo) |
| Testo primario    | `#f0ece4` (bianco caldo)        |
| Testo muted       | `#7a7570`                       |
| Foto profilo      | B/N di default → colore al match |
| Font display      | Cormorant Garamond              |
| Font dati BPM     | JetBrains Mono                  |
| **Vietati**       | gradient, glow, rosso, rosa, viola |

---

## 4. Struttura delle pagine

| Route              | File                          | Descrizione |
|--------------------|-------------------------------|-------------|
| `/login`           | `src/pages/Login.tsx`         | Login email/password, tagline serif |
| `/register`        | `src/pages/Register.tsx`      | Registrazione nuovo account |
| `/profile/setup`   | `src/pages/ProfileSetup.tsx`  | Onboarding profilo utente |
| `/discovery`       | `src/pages/Discovery.tsx`     | Schermata principale: profili in B/N, sensore biometrico attivo |
| `/matches`         | `src/pages/Matches.tsx`       | Lista match con cardiac score + bottoni Chatta / Invita a uscire |
| `/chat/:matchId`   | `src/pages/Chat.tsx`          | Chat 1-a-1 in realtime, banner italic serif, link "Pronti a incontrarvi?" dopo 5+ messaggi |
| `/debug`           | `src/pages/Debug.tsx`         | Tool interno per ispezionare il segnale biometrico |
| `/`                | `src/pages/Index.tsx`         | Landing / redirect post-auth |

---

## 5. Engine biometrico (`src/engine/`)

Il cuore tecnico (è il caso di dirlo) dell'app. Pipeline di signal processing
in TypeScript puro, **testata con Vitest**.

### Moduli principali

- **`types.ts`** — Tipi e `DEFAULT_CONFIG` con tutti i parametri (z_threshold,
  rate_of_change_max, sustained_duration_sec, ecc.).
- **`SignalProcessor.ts`** — Macchina a stati con due fasi:
  - `learning` (~90s) → costruzione baseline personale (media + deviazione standard).
  - `active` → ogni reading viene valutato.
- **`smartwatch.ts`** — Parser per HealthKit (iOS) e Health Connect (Android),
  estrae `resting_hr` e cronologia 7 giorni.
- **`healthBridge.ts`** — Ponte verso le API native via Capacitor.
- **`heartRatePoller.ts`** — Polling continuo del sensore.
- **`sessionRecorder.ts`** — Registra le sessioni per debug/analytics.
- **`logger.ts`** — Buffer di log in-memory ispezionabile.

### Filtri anti falso-positivo

1. **Z-score baseline ibrida** (peso resting_hr decrescente nel tempo).
2. **Rate-of-change** — rifiuta variazioni > 5 BPM tra reading consecutivi.
3. **Sustained check** — la reazione deve durare ≥ 8s e ≥ 4 reading.
4. **Context filter** — app in foreground, schermata Discovery attiva,
   signal_quality ≥ 0.5.
5. **Accelerometro** — se l'utente si sta muovendo, soglie più severe.
6. **Cap massimo** — BPM > 120 → rifiutato (probabile attività fisica).

### Decisioni possibili
`ACCEPTED_VALID_REACTION`, `ACCEPTED_STRONG_REACTION`,
`REJECTED_LEARNING_PHASE`, `REJECTED_LOW_Z_SCORE`, `REJECTED_NOISE`,
`REJECTED_BPM_TOO_HIGH`, `REJECTED_RATE_OF_CHANGE`, `REJECTED_NOT_SUSTAINED`,
`REJECTED_CONTEXT_INVALID`, `REJECTED_BASELINE_UNSTABLE`,
`REJECTED_NO_ACCEL_LOW_CONFIDENCE`.

---

## 6. Backend (Lovable Cloud)

### Tabelle principali
- `profiles` — dati pubblici utente (nome, foto, bio, ecc.).
- `biometric_reactions` — ogni reazione cardiaca registrata
  (viewer_id, profile_id, z_score, bpm, timestamp). RLS: ogni utente vede solo
  le proprie.
- `matches` — match bilaterali (user_a, user_b, cardiac_score, created_at).
- `messages` — messaggi della chat, con Realtime abilitato.

### Edge Function: `check-match`
Chiamata dal client dopo ogni `biometric_reactions` inserito.
- Verifica che entrambi gli utenti abbiano ≥ 2 reazioni con z_score ≥ 1.5
  reciproche.
- Calcola il **cardiac_score** normalizzato 0–100
  (z=1.5 → 50, z=4.0 → 100).
- Crea il match con ordering stabile (`user_a < user_b`) per evitare duplicati
  in race condition.

### Auth
Standard email/password Supabase Auth, con `ProtectedRoute` lato client.

---

## 7. Componenti chiave (`src/components/`)

- **`MatchRevealProvider.tsx`** — Provider globale che intercetta nuovi match
  e mostra l'animazione di rivelazione (foto da B/N a colore).
- **`ProfileDetailSheet.tsx`** — Sheet che si apre sul profilo selezionato in
  Discovery, durante il quale viene catturata la reazione.
- **`EditOwnProfileSheet.tsx`** — Modifica profilo proprio.
- **`HealthConsent.tsx`** — Onboarding per il consenso ai dati biometrici.
- **`ProtectedRoute.tsx`** — Guard di routing per pagine autenticate.
- **`NavLink.tsx`** — Link di navigazione con stile noir.

---

## 8. Funzionalità implementate (timeline lavoro)

### Fondamenta
- ✅ Setup React + Vite + Tailwind + shadcn/ui
- ✅ Integrazione Lovable Cloud (Auth + DB + Realtime + Edge Functions)
- ✅ Routing protetto con `useAuth` hook + `ProtectedRoute`

### Engine biometrico
- ✅ Signal processor con fasi learning/active
- ✅ Baseline ibrida (resting_hr + sessione corrente)
- ✅ 6 filtri anti falso-positivo
- ✅ Bridge HealthKit / Health Connect via Capacitor
- ✅ Logger e session recorder per debug
- ✅ Suite di test Vitest

### Pagine UX
- ✅ Login / Register / ProfileSetup
- ✅ Discovery con profili in B/N e cattura reazione
- ✅ Matches con cardiac score, barra ambra, bottoni Chatta / Invita a uscire
- ✅ Chat realtime con bolle ambra/grigio, banner italic serif,
  trigger "Pronti a incontrarvi?" dopo 5+ messaggi
- ✅ Stato online discreto (pallino ambra)
- ✅ Empty state elegante in Matches

### Backend
- ✅ Tabelle `profiles`, `biometric_reactions`, `matches`, `messages` con RLS
- ✅ Edge function `check-match` per match bilaterali con cardiac score
- ✅ Realtime sui messaggi della chat

### Restyling Dark Cinematic Noir (ultimo grande lavoro)
- ✅ Palette stretta: nero `#0d0d0d`, ambra `#d4a574`, bianco caldo `#f0ece4`
- ✅ Rimossi tutti i gradient, glow, colori rosso/viola
- ✅ Font Cormorant Garamond per headline, JetBrains Mono per BPM
- ✅ Foto profilo B/N di default, colore solo al match
- ✅ Coerenza su Login, Register, Discovery, Matches, Chat, EditOwnProfileSheet

---

## 9. Cose **non ancora** fatte / possibili evoluzioni

- ⏳ Tabella `date_invites` per persistere realmente gli inviti a uscire
  (ora il bottone mostra solo un toast).
- ⏳ Indicatore "sta scrivendo…" in chat (Supabase Realtime broadcast).
- ⏳ Read receipts (spunte ambra) sui messaggi.
- ⏳ Badge "Nuovo" ambra sulle card match recenti (< 24h).
- ⏳ Restyling noir di `ProfileSetup.tsx` (rimasto fuori dall'ultimo giro).
- ⏳ Micro-animazione fade-in su titolo/tagline al mount.
- ⏳ Pubblicazione su App Store / Play Store (build Capacitor).
- ⏳ Onboarding guidato sull'utilizzo dello smartwatch.

---

## 10. Come si lavora sul progetto

- **Editing in Lovable** → push automatico su GitHub.
- **Editing su GitHub / locale** → sync automatico verso Lovable.
- **Test**: `bunx vitest run`
- **Backend**: gestito interamente da Lovable Cloud, niente file `.env` da
  modificare a mano (sono autogenerati).

---

*Documento generato automaticamente da Lovable — aggiornare quando vengono
aggiunte nuove feature.*

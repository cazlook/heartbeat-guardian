-- PROPOSTA — NON APPLICARE SENZA APPROVAZIONE DEL PROPRIETARIO
-- =============================================================
-- Questa cartella (supabase/proposals/) NON viene eseguita da `supabase db push`
-- né dal sync Lovable: solo supabase/migrations/ è auto-applicata. Per attivare
-- questa migrazione, spostarla in supabase/migrations/ con timestamp corrente.
--
-- Contesto (verifica del 22/07/2026):
-- biometric_reactions.baseline_mean/baseline_std registrano la baseline del
-- viewer al momento della reazione. Verificato che NESSUN codice li rilegge:
--   - check-match seleziona solo (z_score, source);
--   - nessuna UI o query client li legge (l'unico uso client è la SCRITTURA
--     in Discovery.persistReaction; le reazioni manual scrivono già null);
--   - i test coprono l'engine in-memory, non queste colonne DB.
-- Lo z_score è auto-contenuto (già normalizzato), quindi i valori storici
-- servono solo a un'eventuale ri-derivazione forense del BPM assoluto — che è
-- esattamente l'informazione sanitaria che NON vogliamo conservare.
--
-- Effetti: (1) i valori storici vengono eliminati; (2) le nuove scritture non
-- possono più includerli; (3) nulla può essere restituito al client.
-- Modifica client da accompagnare: rimuovere baseline_mean/baseline_std
-- dall'insert in src/pages/Discovery.tsx (persistReaction) e dai tipi generati.

-- ── UP ──────────────────────────────────────────────────────────────
ALTER TABLE public.biometric_reactions DROP COLUMN IF EXISTS baseline_mean;
ALTER TABLE public.biometric_reactions DROP COLUMN IF EXISTS baseline_std;

-- ── DOWN (rollback) ────────────────────────────────────────────────
-- I dati storici non sono recuperabili dopo il drop (è l'obiettivo della
-- minimizzazione); il rollback ripristina solo la struttura, nullable:
-- ALTER TABLE public.biometric_reactions ADD COLUMN baseline_mean numeric;
-- ALTER TABLE public.biometric_reactions ADD COLUMN baseline_std numeric;

/**
 * Privacy — informativa sul trattamento dei dati, inclusi i dati sanitari
 * (frequenza cardiaca). Pagina pubblica: richiesta dagli store e linkata
 * da Register e dal flusso di consenso biometrico.
 */

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="font-display text-2xl" style={{ color: '#f0ece4' }}>{title}</h2>
    <div className="text-sm leading-relaxed space-y-2" style={{ color: '#7a7570' }}>
      {children}
    </div>
  </section>
);

const Privacy = () => (
  <div className="min-h-screen p-6" style={{ backgroundColor: '#0d0d0d' }}>
    <div className="max-w-xl mx-auto py-8 space-y-8">
      <div className="space-y-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] hover:opacity-80 transition-opacity"
          style={{ color: '#d4a574' }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Indietro
        </Link>
        <p className="text-[10px] uppercase tracking-[0.4em]" style={{ color: '#7a7570' }}>
          HeartSync
        </p>
        <h1 className="font-display text-4xl leading-tight" style={{ color: '#f0ece4' }}>
          Informativa sulla privacy
        </h1>
        <p className="text-xs" style={{ color: '#5a5550' }}>
          Ultimo aggiornamento: 11 giugno 2026
        </p>
      </div>

      <Section title="Quali dati trattiamo">
        <p>
          <strong style={{ color: '#f0ece4' }}>Dati di profilo</strong>: nome, età, foto,
          bio e interessi che scegli di pubblicare.
        </p>
        <p>
          <strong style={{ color: '#f0ece4' }}>Dati sanitari (frequenza cardiaca)</strong>:
          con il tuo consenso esplicito, leggiamo la frequenza cardiaca da Apple
          HealthKit o Android Health Connect mentre la schermata Discovery è attiva.
          Il segnale grezzo viene elaborato sul tuo dispositivo; al server inviamo
          solo l'esito di una reazione rilevata (punteggio statistico, picco e
          durata), mai il flusso continuo del battito.
        </p>
        <p>
          <strong style={{ color: '#f0ece4' }}>Messaggi e inviti</strong>: conservati per
          erogare la chat tra persone che hanno fatto match.
        </p>
      </Section>

      <Section title="Per quali finalità">
        <p>
          I dati cardiaci servono a un solo scopo: rilevare una reazione fisiologica
          mentre guardi un profilo e verificare la reciprocità per creare un match.
          Non vengono usati per pubblicità, non vengono venduti né condivisi con terze
          parti, e non vengono usati per finalità diverse da quelle descritte.
        </p>
      </Section>

      <Section title="Base giuridica e consenso">
        <p>
          Il trattamento dei dati relativi alla salute avviene solo previo tuo
          consenso esplicito (art. 9 GDPR), richiesto la prima volta che attivi il
          rilevamento. Puoi revocarlo in qualsiasi momento dalle impostazioni di
          HealthKit / Health Connect del tuo dispositivo: l'app continuerà a
          funzionare in modalità manuale, senza dati biometrici.
        </p>
      </Section>

      <Section title="Conservazione e cancellazione">
        <p>
          I dati restano conservati finché il tuo account è attivo. Puoi eliminare
          l'account in qualsiasi momento da "Modifica profilo → Elimina account":
          la cancellazione rimuove profilo, foto, reazioni biometriche, match,
          messaggi e l'account di autenticazione. L'operazione è irreversibile.
        </p>
      </Section>

      <Section title="Dove sono conservati i dati">
        <p>
          I dati sono ospitati su infrastruttura Supabase. Le reazioni biometriche
          sono protette da row-level security: ogni utente può leggere soltanto le
          proprie.
        </p>
      </Section>

      <Section title="I tuoi diritti">
        <p>
          Hai diritto di accesso, rettifica, cancellazione, limitazione e
          portabilità dei tuoi dati. Per esercitarli, oltre agli strumenti in-app,
          puoi contattare il titolare del trattamento all'indirizzo indicato sulla
          pagina dello store.
        </p>
      </Section>
    </div>
  </div>
);

export default Privacy;

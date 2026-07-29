# Sentinel Dashboard

Frontend di sorveglianza (React + TypeScript + Vite + Tailwind + Supabase) per il
motore Sentinel-CPP.

## Avvio

```bash
npm ci
cp .env.example .env.local   # e compila i due valori
npm run dev
```

Il prefisso `VITE_` sulle variabili **non è opzionale**: Vite espone al bundle
client solo quelle che iniziano con `VITE_`. Senza prefisso
`import.meta.env.VITE_SUPABASE_URL` resta `undefined` e il client Supabase si
costruisce con URL vuoto — l'app parte ma non legge nulla.

| Script | Cosa fa |
| --- | --- |
| `npm run dev` | dev server su :5173 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, funzioni pure in `src/lib` |
| `npm run build` | bundle di produzione |

CI (`.github/workflows/ci.yml`) esegue typecheck → test → build su ogni push e PR
verso `main`.

## ⚠ Azione manuale richiesta: DDL su Supabase

Lo schema **non viene applicato dall'app**. Il contenuto di
[`schema_supabase.sql`](./schema_supabase.sql) va incollato ed eseguito a mano
nel *SQL editor* del progetto Supabase. Il file è idempotente (`if not exists`,
`create or replace`, guardie `do $$ ... $$`), quindi è sicuro rieseguirlo.

Contiene, oltre alle tabelle e alle policy RLS:

- **Gli aggregati** (`alert_buckets`, `alert_window_stats`, `alert_top_entities`,
  `alert_entity_series`, `alert_wallet_counts`, `position_totals`,
  `position_top_markets`, `position_wallet_totals`). Senza queste funzioni ogni
  pagina mostra il banner rosso di errore RPC: sono la fonte di ogni grafico e
  di ogni KPI.
- **Gli indici su `twap_patterns`** (`start_time`, `end_time`, GIN su `wallets`).
  Le query dello scanner TWAP filtrano per finestra sovrapposta e fanno
  containment jsonb su `wallets`: senza indici sono scan sequenziali che
  peggiorano a ogni finestra rilevata.

Perché gli aggregati esistono: prima le pagine scaricavano righe grezze con
`.order('timestamp_ms', desc).limit(6000)` e le contavano nel browser. Superato
il tetto, Postgres restituiva solo le righe **più recenti**, quindi un grafico a
30 giorni disegnava un giorno solo e ogni delta "vs periodo precedente"
confrontava una finestra piena con una vuota. Aggregando in Postgres il payload
diventa proporzionale al numero di bucket (~30 righe), non al numero di alert.

## Note sulle dipendenze

`react-router-dom` è su **7.18.2**. Non esiste attualmente una versione priva di
advisory:

- `< 7.18.0` → open redirect in `<Link>` / `useNavigate` (moderate)
- `7.12.0 – 8.2.0` → RSC Mode CSRF bypass (high); la 8.x non è ancora pubblicata,
  quindi **nessuna release corrente chiude entrambe**

Si è scelta la 7.18.2 perché chiude l'open redirect — l'unico dei due che
potrebbe in linea di principio toccare questa app — mentre l'advisory residua
richiede la *RSC mode*, che una SPA client-only con `BrowserRouter` non usa e non
può attivare. Da rivalutare quando esce una release fuori dal range vulnerabile.

`vite`/`esbuild` hanno un'advisory che riguarda **solo il dev server**, non il
bundle servito in produzione; il fix richiede Vite 8 (major).

# VN Market Intelligence MCP — Architecture Document

> Version 1.1 | Mars 2026 | Propriétaire : Dai Hung PHAM
> Stack : TypeScript / Node.js 20+ | Marchés : HOSE / HNX / Global

**Fichiers du projet :**
- `VN_Market_MCP_Architecture.md` — ce document
- `bctc-schema.ts` — schéma complet BCTC (interfaces TypeScript + SQLite DDL)
- `src/index.ts` — serveur Bun + MCP SSE transport
- `src/server.ts` — McpServer + registration de tous les tools
- `src/tools/` — watchlist | analysis | reports | alerts
- `src/db/schema.ts` — SQLite init
- `src/scheduler/jobs.ts` — cron jobs
- `package.json` / `bunfig.toml` / `tsconfig.json` — config Bun

---

## Table des matières

1. [Vision & Objectifs](#1-vision--objectifs)
2. [Architecture Globale](#2-architecture-globale)
3. [Stack Technique](#3-stack-technique)
4. [Sources de Données](#4-sources-de-données)
5. [Module SSC — Extraction Rapports Financiers](#5-module-ssc--extraction-rapports-financiers)
6. [Système RAG Multi-Niveau](#6-système-rag-multi-niveau)
7. [Gestion de la Watchlist](#7-gestion-de-la-watchlist)
8. [Moteur d'Alertes](#8-moteur-dalertes)
9. [MCP Tools — Interface Claude](#9-mcp-tools--interface-claude)
10. [Structure des Fichiers](#10-structure-des-fichiers)
11. [Scheduler — Programme Quotidien](#11-scheduler--programme-quotidien)
12. [Points d'Attention & Limites](#12-points-dattention--limites)

---

## 1. Vision & Objectifs

Ce MCP (Model Context Protocol) permet à Claude d'agir comme un assistant d'investissement intelligent sur le marché vietnamien. Il collecte en continu des données financières mondiales et locales, les analyse par chaîne d'impact causal, et alerte l'utilisateur lorsque ses positions sont potentiellement affectées.

### Principe de raisonnement causal

Chaque information est traitée selon une cascade à 4 niveaux :

```
News mondiale  →  Impact pays  →  Secteur vietnamien  →  Action watchlist

Exemple : "Trump envoie 5000 soldats à Homs"
     →  Tension géopolitique Moyen-Orient
     →  Hausse probable du prix du pétrole
     →  Secteur oil & gas vietnamien impacté (GAS, PVD, PVS...)
     →  ALERTE : vos positions GAS / PVD peuvent monter
```

### Ce que le système n'est PAS

*Il ne fait pas de trading automatique. Il ne garantit pas de prédictions. Il ne fait pas de données tick-by-tick en temps réel. Il est un assistant d'analyse et d'alerte — la décision reste toujours humaine.*

---

## 2. Architecture Globale

Le système est organisé en 5 couches fonctionnelles indépendantes qui communiquent via des interfaces TypeScript strictement typées.

| # | Couche | Responsabilité |
|---|--------|----------------|
| 1 | **Ingestion** | Collecte des données : news, marchés, rapports, indicateurs macro |
| 2 | **RAG** | Mémoire vectorielle multi-niveau : stockage, indexation, retrieval des analyses passées |
| 3 | **Analyse** | Moteur de raisonnement causal : cascade d'impact, combinaison de signaux, patterns historiques |
| 4 | **Alertes** | Génération d'alertes multi-signal avec sévérité, rapport quotidien, historique |
| 5 | **MCP Tools** | Interface Claude : outils exposés pour watchlist, analyse, alertes, rapports |

---

## 3. Stack Technique

| Composant | Librairie / Outil | Justification |
|-----------|-------------------|---------------|
| MCP Server | `@modelcontextprotocol/sdk` | SDK officiel Anthropic pour exposer les outils à Claude |
| Embeddings | `@huggingface/transformers` | Modèle ONNX local, zéro coût API, supporte le vietnamien |
| Modèle embedding | `paraphrase-multilingual-MiniLM-L12-v2` | 384 dimensions, trilingue (VI/FR/EN), rapide, ~400MB |
| Vector Store | `lancedb` | TypeScript natif, local, zéro serveur, millions de vecteurs |
| Base structurée | `better-sqlite3` | Watchlist, alertes, snapshots — robuste, local, synchrone |
| Web Fetching | `axios` + `cheerio` | Scraping HTML, extraction de contenu structuré |
| RSS / Flux | `rss-parser` | Parsing des flux RSS des sources vietnamiennes et mondiales |
| PDF Extraction | `pdf-parse` | Extraction texte + tableaux des báo cáo tài chính (SSC) |
| Scheduler | `node-cron` | Tâches planifiées : briefing quotidien, polling news toutes les 30min |
| Runtime | **`Bun 1.x`** / `TypeScript 5+` | TypeScript natif sans compilation, HTTP server intégré, 3× plus rapide que Node |

---

## 3b. Bun Server — MCP Protocol

### Pourquoi Bun ?

Bun exécute TypeScript nativement sans compilation, intègre un gestionnaire de paquets 25× plus rapide que npm, et dispose d'une compatibilité Node.js qui permet d'utiliser le SDK MCP sans adaptation.

### Transport SSE (Server-Sent Events)

Le MCP utilise le transport SSE : Claude ouvre une connexion persistante `GET /sse` et envoie ses requêtes via `POST /messages`.

```
Claude Desktop ──GET /sse──────────────────→ MCP Server (Bun)
               ←── SSE stream (events) ────
               ──POST /messages?sessionId ──→
               ←── SSE event (tool result) ─
```

### Démarrage

```bash
# Installation
bun install

# Développement (itération — hot reload INTERDIT, utiliser launchctl kickstart)
# Editer le code, puis:
launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp

# Production — via launchd (seule méthode autorisée)
# ./launchd/install.sh  (une seule fois)
# Restart: launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp
```

### Configuration Claude Desktop

Ajouter dans `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) ou `%APPDATA%\Claude\claude_desktop_config.json` (Windows) :

```json
{
  "mcpServers": {
    "vn-market": {
      "url": "http://localhost:3000/sse"
    }
  }
}
```

### Endpoints HTTP

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/sse` | GET | Claude se connecte ici (SSE stream persistant) |
| `/messages?sessionId=<id>` | POST | Claude envoie les tool calls ici |
| `/health` | GET | Liveness probe + stats sessions |
| `/` | GET | Info serveur + liste endpoints |

---

## 4. Sources de Données

### 4.1 Sources Vietnamiennes

| Source | Type de données | Méthode d'accès |
|--------|----------------|-----------------|
| CafeF.vn | News finance + prix | RSS + scraping HTML |
| VnExpress Finance | News économiques | RSS officiel + HTML |
| Tuoi Tre Business | News générales / impact | RSS + scraping |
| HOSE (hsx.vn) | Prix HOSE, volumes, VN-Index | API publique + scraping |
| HNX (hnx.vn) | Prix HNX, UPCOM | API publique + scraping |
| **SSC — congbothongtin.ssc.gov.vn** | Báo cáo tài chính, rapports annuels/semestriels/trimestriels | Scraping HTML + téléchargement PDF + extraction pdf-parse |
| Ngân hàng Nhà nước (SBV) | Taux directeur, USD/VND | API publique SBV |

### 4.2 Sources Mondiales

| Source | Type de données | Méthode d'accès |
|--------|----------------|-----------------|
| Reuters / AP News | News mondiales, géopolitique | RSS officiel gratuit |
| Trading Economics | Macro : PIB, inflation, taux, commodités | API + scraping (plan gratuit disponible) |
| Yahoo Finance | Prix pétrole (WTI/Brent), or, USD index | API non-officielle (yfinance compatible) |
| FED / ECB | Décisions taux, minutes FOMC | RSS + API publiques officielles |
| Al Jazeera / BBC | Géopolitique, conflits, tensions | RSS gratuit |

---

## 5. Module SSC — Extraction Rapports Financiers

Le portail `congbothongtin.ssc.gov.vn` est la source officielle de divulgation de la Commission des Valeurs Mobilières du Vietnam. Il contient tous les rapports financiers des entreprises cotées (HOSE, HNX, UPCOM). Il n'expose pas d'API publique documentée : l'accès se fait par scraping HTML + téléchargement PDF.

### 5.1 Types de documents disponibles

- Báo cáo tài chính quý (rapport financier trimestriel)
- Báo cáo tài chính bán niên (semestriel)
- Báo cáo tài chính năm (annuel)
- Báo cáo thường niên (rapport annuel complet avec stratégie)
- Nghị quyết HĐQT / ĐHĐCĐ (résolutions du conseil et assemblée)
- Thông báo phát hành (avis d'émission, dividendes)

### 5.2 Stratégie de scraping

```typescript
// Flux de traitement SSC

// 1. Requête HTTP vers congbothongtin.ssc.gov.vn
//    → Paramètres : code action, type document, période
//    → Cheerio parse le HTML pour extraire la liste des documents

// 2. Pour chaque document listé :
//    → Vérifier si déjà en base (SQLite : hash URL + date)
//    → Si nouveau : télécharger le PDF
//    → pdf-parse extrait le texte brut
//    → Regex + NLP extrait : revenus, bénéfices, ratios clés

// 3. Structurer en FinancialReport (voir data model ci-dessous)
// 4. Générer embedding → stocker LanceDB niveau "action"
// 5. Déclencher analyse impact sur la watchlist
```

### 5.3 Data Model — FinancialReport

> Schéma complet dans `bctc-schema.ts` — voir ce fichier pour l'implémentation complète.

```typescript
interface FinancialReport {
  id: string
  actionCode: string            // "VCB", "HPG"...
  exchange: 'HOSE' | 'HNX' | 'UPCOM'
  reportType: 'quarterly' | 'semi-annual' | 'annual' | 'announcement'
  period: {
    year: number
    quarter?: 1 | 2 | 3 | 4
  }
  publishedAt: string           // ISO date
  sourceUrl: string             // URL congbothongtin.ssc.gov.vn
  pdfPath?: string              // chemin local du PDF

  // Métriques extraites du PDF
  financials: {
    revenue?: number            // Doanh thu (VND)
    netProfit?: number          // Lợi nhuận ròng (VND)
    eps?: number                // EPS
    pe?: number                 // P/E ratio
    debtToEquity?: number       // D/E ratio
    grossMargin?: number        // %
    yoyGrowth?: number          // croissance YoY %
    rawText: string             // texte complet pour RAG
  }

  // RAG
  embedding: number[]           // vecteur 384-dim multilingual-MiniLM
  aiSummary?: string            // résumé IA de ce rapport
}
```

---

## 6. Système RAG Multi-Niveau

Le RAG (Retrieval-Augmented Generation) est la mémoire longue du système. Chaque analyse est sauvegardée avec son contexte hiérarchique, permettant à Claude de retrouver des patterns similaires sur des événements passés et d'enrichir ses analyses futures.

### 6.1 Les 4 niveaux de contexte

| Niveau | Portée | Exemples de contenu |
|--------|--------|---------------------|
| `GLOBAL` | Monde entier | Guerre, décisions FED, prix pétrole, crise financière mondiale |
| `COUNTRY` | Vietnam + pays liés | Taux BNV, politique économique, USD/VND, croissance PIB Vietnam |
| `DOMAIN` | Secteur vietnamien | Réglementation banking, boom immobilier, hausse acier, subvention oil & gas |
| `ACTION` | Action spécifique | Rapport financier VCB Q1 2026, annonce dividende HPG, rachat d'actions GAS |

### 6.2 Data Model — AnalysisEntry (entrée RAG principale)

```typescript
type ContextLevel = 'global' | 'country' | 'domain' | 'action'

interface AnalysisEntry {
  id: string
  createdAt: string                       // ISO timestamp
  level: ContextLevel

  // Source brute
  source: {
    url: string
    title: string
    publishedAt: string
    content: string                       // texte brut
    sourceType: 'news' | 'market_data' | 'financial_report' | 'macro'
  }

  // Analyse IA
  analysis: {
    summary: string                       // résumé court (<200 mots)
    sentiment: 'bullish' | 'bearish' | 'neutral'
    impactScore: number                   // 0-10
    impactDirection: 'up' | 'down' | 'neutral'
    confidence: number                    // 0.0 - 1.0
    reasoning: string                     // explication chaîne causale
    timeHorizon: 'short' | 'medium' | 'long'
  }

  // Liens hiérarchiques (graphe causal)
  hierarchy: {
    parentIds: string[]                   // analyses de niveau supérieur qui ont causé ceci
    childIds: string[]                    // analyses de niveau inférieur déclenchées par ceci
    affectedCountries: string[]           // ["VN", "US", "CN"]
    affectedDomains: DomainType[]         // ["oil_gas", "banking"]
    affectedActions: string[]             // ["GAS", "PVD", "VCB"]
  }

  embedding: number[]                     // vecteur 384-dim multilingual-MiniLM
  tags: string[]
}
```

### 6.3 Embedding & Stockage

Le modèle `paraphrase-multilingual-MiniLM-L12-v2` est chargé une seule fois au démarrage du serveur MCP via `@huggingface/transformers` (runtime ONNX). Il produit des vecteurs de 384 dimensions. Le texte soumis combine : titre + résumé + tags pour maximiser la pertinence de la recherche sémantique.

LanceDB stocke ces vecteurs dans `/data/lancedb/` de façon persistante entre les sessions. La recherche se fait par similarité cosinus avec filtres optionnels sur le niveau, le domaine, ou le code action.

---

## 7. Gestion de la Watchlist

La watchlist est stockée dans SQLite (`/data/market.db`). Elle est entièrement gérable depuis Claude en langage naturel : *"ajoute GAS à ma liste"*, *"retire HPG"*, *"configure une alerte à -3% pour VCB"*.

### 7.1 Data Model — WatchlistAction

```typescript
interface WatchlistAction {
  code: string                            // "VCB", "HPG", "GAS"
  name: string                            // "Vietcombank", "Hoa Phat Group"
  exchange: 'HOSE' | 'HNX' | 'UPCOM'
  domain: DomainType
  addedAt: string
  userNotes?: string                      // notes personnelles

  alertThresholds: {
    priceDropPercent: number              // ex: -3 → alerte si -3%
    priceRisePercent: number              // ex: +5 → alerte si +5%
    impactScoreMin: number                // ex: 7 → alerte si impact >= 7/10
    reportNew: boolean                    // alerter à chaque nouveau rapport SSC
  }
}

type DomainType =
  | 'oil_gas'       // GAS, PVD, PVS, OIL
  | 'banking'       // VCB, BID, CTG, TCB, VPB
  | 'real_estate'   // VIC, NVL, PDR, KDH
  | 'steel'         // HPG, HSG, NKG
  | 'aviation'      // HVN, VJC
  | 'retail'        // MWG, FRT, DGW
  | 'tech'          // FPT, CMG
  | 'utilities'     // REE, PC1, POW
  | 'agriculture'   // HAG, VHC, ANV
  | 'other'
```

---

## 8. Moteur d'Alertes

Une alerte est déclenchée quand une combinaison de signaux dépasse les seuils configurés pour une ou plusieurs actions de la watchlist. La sévérité est calculée automatiquement selon le nombre de signaux convergents et leur intensité.

### 8.1 Signaux surveillés

| Signal Prix | Signal News/Macro | Signal Rapport SSC |
|-------------|-------------------|-------------------|
| Chute > seuil configuré (%) | Impact score >= min configuré | Nouveau rapport publié |
| Hausse > seuil configuré (%) | News négative sur secteur lié | Résultats sous/au-dessus attentes |
| Volume anormal (>2x moyenne) | Événement géopolitique critique | Annonce dividende / rachat |

### 8.2 Data Model — Alert

```typescript
interface Alert {
  id: string
  triggeredAt: string
  severity: 'info' | 'warning' | 'critical'

  trigger: {
    analysisIds: string[]                 // analyses sources
    signalCombination: string[]           // ["price_drop", "negative_news"]
  }

  affectedActions: {
    code: string
    expectedImpact: 'up' | 'down'
    confidence: number
    reasoning: string                     // explication en langage naturel
  }[]

  read: boolean
  userResponse?: string                   // note utilisateur après lecture
}
```

---

## 9. MCP Tools — Interface Claude

Ces outils sont exposés à Claude via le protocole MCP. Ils permettent à Claude d'interagir avec tous les modules du système en langage naturel.

### 9.1 Watchlist

| Tool | Description |
|------|-------------|
| `add_to_watchlist` | Ajouter une action (code, exchange, notes, seuils d'alerte) |
| `remove_from_watchlist` | Retirer une action de la liste |
| `get_watchlist` | Afficher toutes les actions avec leur statut et seuils |
| `update_thresholds` | Modifier les seuils d'alerte d'une action |

### 9.2 Analyse & Marché

| Tool | Description |
|------|-------------|
| `fetch_and_analyze` | Récupérer et analyser les dernières news (ou une URL spécifique) |
| `run_impact_chain` | Tracer la chaîne causale complète d'une information |
| `get_market_snapshot` | Snapshot actuel : VN-Index, prix watchlist, indicateurs macro |
| `search_similar_context` | Recherche RAG : trouver des analyses passées similaires |
| `get_pattern_summary` | Résumé historique : *"comment GAS a réagi aux hausses pétrole ?"* |

### 9.3 Rapports SSC

| Tool | Description |
|------|-------------|
| `fetch_ssc_reports` | Scraper les nouveaux rapports SSC pour une ou toutes les actions de la liste |
| `get_financial_summary` | Résumé des derniers résultats financiers d'une action (revenus, bénéfices, ratios) |
| `compare_financials` | Comparer les performances d'une action entre 2 périodes (YoY, QoQ) |

### 9.4 Alertes & Reporting

| Tool | Description |
|------|-------------|
| `get_alerts` | Lister les alertes (filtrables : sévérité, non-lues, période) |
| `mark_alert_read` | Marquer une alerte comme lue |
| `run_daily_briefing` | Rapport quotidien complet : news du jour, alertes, performance watchlist, contexte macro |
| `get_analysis_history` | Historique des analyses RAG (par action, secteur, période) |

---

## 10. Structure des Fichiers

```
vn-market-mcp/
├── src/
│   ├── index.ts                    # Point d'entrée MCP server
│   ├── tools/                      # Définition des MCP tools
│   │   ├── watchlist.ts
│   │   ├── analysis.ts
│   │   ├── alerts.ts
│   │   ├── reports.ts              # Tools SSC
│   │   └── market.ts
│   ├── fetchers/                   # Couche d'ingestion
│   │   ├── news/
│   │   │   ├── cafef.ts
│   │   │   ├── vnexpress.ts
│   │   │   ├── reuters.ts
│   │   │   └── tradingeconomics.ts
│   │   ├── market/
│   │   │   ├── hose.ts
│   │   │   └── hnx.ts
│   │   └── reports/
│   │       └── ssc.ts              # Scraper congbothongtin.ssc.gov.vn
│   ├── rag/                        # Système RAG
│   │   ├── embeddings.ts           # HuggingFace local (ONNX)
│   │   ├── vectorstore.ts          # LanceDB operations
│   │   └── retriever.ts            # Retrieval multi-niveau
│   ├── analysis/
│   │   ├── cascade.ts              # Moteur chaîne causale
│   │   ├── signals.ts              # Combinaison multi-signaux
│   │   └── patterns.ts             # Pattern matching historique
│   ├── db/                         # SQLite
│   │   ├── schema.ts
│   │   ├── watchlist.ts
│   │   ├── alerts.ts
│   │   └── snapshots.ts
│   └── scheduler/
│       └── jobs.ts                 # node-cron : briefing, polling 30min
├── data/                           # Données persistantes (gitignore)
│   ├── lancedb/                    # Vecteurs RAG
│   ├── market.db                   # SQLite
│   └── reports/                    # PDFs SSC téléchargés
├── package.json
├── tsconfig.json
└── .env                            # Config sources, seuils par défaut
```

---

## 11. Scheduler — Programme Quotidien

Le scheduler (`node-cron`) exécute automatiquement des tâches de fond pendant que Claude tourne. L'utilisateur peut aussi déclencher manuellement n'importe quelle tâche depuis Claude.

| Heure (GMT+7) | Tâche | Description |
|---------------|-------|-------------|
| 08h00 | **Morning Briefing** | Rapport quotidien complet : résumé nuit, alertes, contexte macro, watchlist |
| 09h00 | **Market Open Scan** | Snapshot à l'ouverture HOSE/HNX, détection anomalies de volumes |
| Toutes les 30 min | **News Polling** | Fetch toutes les sources, analyse impact, génération alertes si nécessaire |
| 15h30 | **Market Close Scan** | Snapshot clôture, calcul performance journalière watchlist |
| 20h00 | **SSC Report Check** | Vérifier nouveaux rapports SSC pour toutes les actions de la watchlist |
| 22h00 | **Evening Summary** | Résumé de la journée, alertes actives, contexte pour le lendemain |

---

## 12. Points d'Attention & Limites

### ⚠ SSC — Pas d'API officielle

Le portail `congbothongtin.ssc.gov.vn` n'expose pas d'API publique. L'accès repose sur du scraping HTML. Si SSC modifie la structure de ses pages, le scraper devra être mis à jour. Prévoir des tests de régression mensuels.

### ⚠ Rapports PDF en vietnamien

Les báo cáo tài chính sont en vietnamien. `pdf-parse` extrait le texte brut, mais les PDF scannés (images) ne seront pas lisibles sans OCR. Le modèle `multilingual-MiniLM` gère bien le vietnamien pour les embeddings.

### ℹ Premier démarrage lent

Le modèle `paraphrase-multilingual-MiniLM-L12-v2` (~400MB) est téléchargé automatiquement au premier démarrage par `@huggingface/transformers`. Les démarrages suivants utilisent le cache local.

### ℹ Pas de trading automatique

Ce système est un outil d'aide à la décision. Toutes les alertes sont informationnelles. L'utilisateur prend toujours la décision finale d'achat ou de vente.

### ℹ Conformité légale

Le scraping des sites publics (SSC, CafeF, VnExpress) est légalement permis pour usage personnel non-commercial en conformité avec les CGU de ces sites. Ne pas utiliser à des fins commerciales sans vérification des licences.

---

*Fin du document — Version 1.0 — Mars 2026*

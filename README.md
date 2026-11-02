# LexCuria — On-Chain Multi-Party Tribunal & Precedent Evolution Protocol

- **Live Website (GitHub Pages)**: https://xiaoyu7799.github.io/lexcuria-tribunal-genlayer/
- **Repository**: https://github.com/xiaoyu7799/lexcuria-tribunal-genlayer
- **Contract (GenLayer Stable Studionet, 61999)**: 0x3b82A35c7D6701eefB6F500d8b84b37C1720e1aa — https://explorer-studio.genlayer.com/address/0x3b82A35c7D6701eefB6F500d8b84b37C1720e1aa
- **Target Network**: GenLayer Stable Studionet (`Chain ID: 61999`, RPC: `https://studio.genlayer.com/api`, `gas: 0`)

> **Important Status Notice**: This repository contains the complete initial code package (Intelligent Contract, local mock test suite, resumable Studionet deployment script, and bilingual Editorial Legal Gazette frontend). Actual Studionet contract deployment, live transaction finalization, and GitHub Pages publishing are executed and verified by Muse / the repository owner.

---

## 1. Pre-Work Four Lines (Mechanism & Diversity Declaration)

- **(a) Category**: **Subjective Adjudication** — Multi-party unstructured evidence arbitration, nominal escrow settlement, and judicial precedent evolution.
- **(b) Mechanism (What Consensus Decides + Consequences)**: Validators independently fetch external unstructured evidence (`primary_url` with automatic failover to `backup_url`; if both fail, the contract aborts before state mutation so the case remains in `CROSS_EXAMINED` and retryable), evaluate it against the locked acceptance charter, Respondent's defense brief, Petitioner's cross-examination rebuttal, and cited historical precedents, and reach consensus on a discrete integer basis-point tier (`0`, `2500`, `5000`, `7500`, or `10000 bps` — zero floats). **Consequences**: (1) splits locked nominal Studionet escrow balance between Respondent and Petitioner using integer arithmetic; (2) updates party reputation scores and juror consensus counts; (3) mints a new numbered `PrecedentRecord` and, if the ruling diverges from a cited same-category precedent by `>= 5000 bps`, preserves the historical precedent intact and appends a `PrecedentDivergenceWitness`.
- **(c) Interaction Model**: **Four-Act Courtroom Stage** (`Act I: Charter Locked` → `Act II: Evidence Filed` → `Act III: Cross-Examined` → `Act IV: Deliberated & Settled`) with bench switcher (`Petitioner Bench`, `Respondent Bench`, `Jury Deliberation Chamber`, `Precedent Archive Drawer`), live SVG **Evidentiary Balance Rig**, and toggleable **Clerk's Margin Notes**.
- **(d) Evolving State**: **On-Chain Precedent Corpus (`PREC-xxx`) + Witness Log (`CHARTER_TAMPER_WITNESS` / `PRECEDENT_DIVERGENCE_WITNESS`) + Nominal Escrow & Reputation Ledger**.

---

## 2. Fictional Cases & Dual-Source Failover Design

All demonstration cases in LexCuria are **strictly fictional** (involving fictional collectives `petitioner_atlas_dao` and `respondent_atelier_nova`). No real legal disputes or individuals are depicted.

| Source Role | Demonstration URL | Failover & Retry Rule |
| :--- | :--- | :--- |
| **Primary Evidence URL** | `https://raw.githubusercontent.com/octocat/Spoon-Knife/main/README.md` | Each validator requests `primary_url` first. |
| **Backup Evidence URL** | `https://cdn.jsdelivr.net/gh/octocat/Spoon-Knife@main/README.md` | If `primary_url` times out or returns empty, validators automatically query `backup_url`. |
| **Both Sources Unavailable** | N/A | Contract raises `EXTERNAL_EVIDENCE_UNAVAILABLE` **before** any state write. Case remains in `CROSS_EXAMINED` (retryable) and never writes a failed ruling on-chain. |

---

## 2b. Implementation notes

- **Repo name**: all references use `lexcuria-tribunal-genlayer` (vite base, README, package name). The old `lexcuria-genlayer` name redirects for git/web but its Pages URL does not redirect.
- **File count**: this repository contains 15 source files (see `evidence.json` for the list and source SHA-256).
- **No simulated FINALIZED**: if no contract address is configured, writes now throw `CONTRACT_NOT_CONFIGURED` instead of generating a fake hash and showing FINALIZED. Nothing is FINALIZED unless Studionet says so.
- **Preview seed aligned with the contract seed**: the frontend preview now contains only CASE-001, petitioner 50000 / locked 10000, payout 0 while PENDING, and the real SHA-256 of the genesis charter text — matching `contracts/lexcuria_court.py`. The extra preview CASE-002 and placeholder hashes were removed.
- **Consensus input canonicalised**: the validator prompt no longer embeds the raw fetched snippet (primary and backup transports can differ in formatting). It uses a canonical availability statement, and the seeded backup is the same README via the jsDelivr mirror, so strict_eq sees identical input across validators.
- **Local tests**: 5 suites covering primary-ok settle, backup failover, and both-fail abort, plus SHA-256 vectors, charter-tamper witness, and zero-float checks.
- **SDK and contract runtime**: upgraded `genlayer-js` from the draft's 0.18 to 1.1.8 (the version proven on Studionet the same day), and set the contract's `Depends` header to the working `py-genlayer` package hash. With the draft's header, deployment FINALIZED as an error and the contract was not found on read-back; with the corrected header, a minimal contract deploys and reads back correctly.
- **Wallet honesty**: injected wallets connect and read; all writes are signed by the explicitly badged in-browser ephemeral test signer, never presented as wallet-signed. See `KNOWN_LIMITATIONS.md`.
- **Sound**: never autoplays on load; auto-enables on first click with the button synced; never auto-re-enables after a manual close.
- **Languages**: EN/ZH only, on-chain values English. i18n parity is checked by running `npm run check:i18n` (68 keys, 0 missing at build time), not by the draft's claimed 51 keys.

## 3. Local Development & Verification Commands

```bash
# 1. Run deterministic local contract mock tests (Explicitly labeled: NOT on-chain consensus)
python3 tests/test_lexcuria_mock.py

# 2. Install frontend & script dependencies
npm install

# 3. Verify zero missing EN/ZH translation keys
npm run check:i18n

# 4. Build production frontend bundle
npm run build

# 5. Deploy contract to GenLayer Stable Studionet (Chain ID 61999, gas = 0)
npm run deploy:studionet
```

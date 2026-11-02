# Known Limitations (KNOWN_LIMITATIONS)

1. **Nominal Escrow Units (Zero Real Financial Value)**:
   - All escrow deposits, payouts (`respondent_payout`), and refunds (`petitioner_refund`) in `LexCuriaCourt` are **nominal accounting integers** on GenLayer Stable Studionet (`Chain ID 61999`). No real cryptocurrency, fiat currency, or mainnet token transfer occurs.
2. **Local tests are simulations, not on-chain proofs**:
   - All local test executions (`tests/test_lexcuria_mock.py`) are **local simulations** using a mocked `genlayer` runtime and are **not** on-chain GenVM consensus proofs. On-chain proof rests on Studionet receipts and read-backs in `evidence.json`.
3. **Ephemeral Burner Account Fallback for Non-Snap Wallets**:
   - Injected EVM wallets such as OKX Wallet, Rabby, and Coinbase Wallet can connect, verify Chain ID `61999`, and read contract state directly.
   - Because GenLayer Studionet write transactions require GenLayer-compatible signing, when an injected wallet lacks the GenLayer Snap capability, the frontend provides an explicit **Browser Ephemeral Test Account** fallback (generated in-memory, never exported, clearly badged in the UI as `[EPHEMERAL TEST SIGNER — NOT SIGNED BY USER WALLET]`).
4. **Public Evidence Endpoint Availability**:
   - Validators fetch external unstructured evidence over HTTP/HTTPS (`primary_url` and `backup_url`). If both public endpoints rate-limit or go offline simultaneously during validator execution, `deliberate_and_settle` aborts prior to state mutation, requiring the caller to retry once either endpoint recovers.
5. **Discrete Integer Basis-Point Tiers**:
   - Because GenVM `nondet` results forbid floating-point numbers (`float`) and require deterministic validator convergence, partial rulings are quantized to five integer basis-point tiers (`0`, `2500`, `5000`, `7500`, `10000 bps`). Arbitrary fractional percentages (e.g., `33.33%`) are intentionally unsupported.
6. **Consensus input is canonical, not raw evidence text**:
   - To make `strict_eq` converge, the validator prompt uses a canonical evidence-availability statement, not the raw fetched snippet. The seeded backup is the same README via a jsDelivr mirror. For user-created cases, the backup URL must be a content-equivalent mirror of the primary URL; a backup that returns different content is not equivalent, and consensus may disagree.
7. **No simulated FINALIZED, and optimistic UI state**:
   - With no contract address configured, writes are refused with `CONTRACT_NOT_CONFIGURED` and no transaction is sent. After a successful on-chain settlement the UI re-reads `get_court_snapshot` and shows the on-chain verdict; other write actions show local optimistic state until the page is reloaded and re-read from Studionet. Verification in `evidence.json` rests on RPC receipts and read-backs, not on UI display.
8. **Fictional demo data only**:
   - CASE-001, PREC-001, parties and balances are fictional demo fixtures. They are not real disputes, real parties, or real money.

import React, { useState, useEffect, useMemo } from "react";
import { TRANSLATIONS, SUPPORTED_LANGUAGES } from "./i18n/translations.js";
import { soundEngine } from "./utils/soundEngine.js";
import {
  INITIAL_COURT_SNAPSHOT,
  STUDIONET_CHAIN_ID,
  STUDIONET_RPC_URL,
  connectInjectedWallet,
  getOrCreateEphemeralAccount,
  readCourtSnapshotOnChain,
  executeCourtWriteTransaction,
} from "./utils/genlayerClient.js";

const DEFAULT_CONTRACT_ADDRESS = import.meta.env.VITE_LEXCURIA_CONTRACT_ADDRESS || "";

function simplePureHashPreview(text) {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

export default function App() {
  const [lang, setLang] = useState("en");
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

  // Opening session curtain (once per sessionStorage, skipped if prefers-reduced-motion)
  const [showCurtain, setShowCurtain] = useState(() => {
    if (typeof window === "undefined") return false;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced) return false;
    return sessionStorage.getItem("lexcuria_curtain_seen") !== "1";
  });

  // Sound state synced with soundEngine
  const [audioState, setAudioState] = useState({
    isEnabled: false,
    manuallyDisabled: false,
    hasAutoUnlockedOnce: false,
  });

  // Clerk's handwritten margin notes toggle
  const [showClerkNotes, setShowClerkNotes] = useState(true);

  // Courtroom snapshot & active case selection
  const [courtSnapshot, setCourtSnapshot] = useState(INITIAL_COURT_SNAPSHOT);
  const [dataSourceMode, setDataSourceMode] = useState("LOCAL_SEED_PREVIEW");
  const [selectedCaseId, setSelectedCaseId] = useState("CASE-001");
  const [activeBench, setActiveBench] = useState("JURY"); // PETITIONER | RESPONDENT | JURY | PRECEDENTS
  const [activePrecedentId, setActivePrecedentId] = useState("PREC-001");

  // Wallet & Ephemeral Signer state
  const [walletInfo, setWalletInfo] = useState(() => {
    const eph = getOrCreateEphemeralAccount();
    return {
      mode: "PUBLIC_READ_ONLY",
      walletName: "Public Gallery",
      address: "",
      ephemeralSignerAddress: eph.address,
      chainId: STUDIONET_CHAIN_ID,
      notice: "",
    };
  });

  // Transaction lifecycle tracker
  const [txLifecycle, setTxLifecycle] = useState({
    status: "IDLE", // IDLE | REQUESTED | PENDING_CONSENSUS | FINALIZED | ABORTED
    txHash: "",
    signerAddress: "",
    message: "",
  });

  // Act I New Case Draft (Strictly English on-chain values)
  const [newCaseDraft, setNewCaseDraft] = useState({
    title: "Fictional Milestone #55: Zero-Float Telemetry Verifier Spec",
    category: "PROTOCOL_SPEC_AUDIT",
    nominalDeposit: 10000,
    charterText:
      "Clause 1: Publish verifiable specification markdown at primary URL. Clause 2: Provide backup JSON metadata mirror.",
  });

  // Act II Evidence Form
  const [evidenceDraft, setEvidenceDraft] = useState({
    primaryUrl: "https://raw.githubusercontent.com/octocat/Spoon-Knife/main/README.md",
    backupUrl: "https://cdn.jsdelivr.net/gh/octocat/Spoon-Knife@main/README.md",
    defenseBrief:
      "Both primary specification README and backup metadata endpoint are live and match charter requirements.",
  });

  // Act III Cross-Examination Form
  const [rebuttalDraft, setRebuttalDraft] = useState({
    rebuttalBrief:
      "Primary repository is online, but secondary benchmark section is abbreviated. Requesting 7500 bps partial settlement under PREC-001.",
    disputedClauseCode: "CLAUSE_2_BENCHMARK_DEPTH",
    citedPrecedentId: "PREC-001",
    assertedCharterText: "",
  });

  // Selected integer basis points tier for Jury simulation / consensus preview
  const [selectedBpsTier, setSelectedBpsTier] = useState(7500);

  // Unlock audio on first user click anywhere on page (never autoplays on load)
  useEffect(() => {
    const unsub = soundEngine.subscribe(setAudioState);
    const handleFirstClick = () => {
      soundEngine.handleFirstUserInteraction();
    };
    window.addEventListener("pointerdown", handleFirstClick, { passive: true });
    return () => {
      unsub();
      window.removeEventListener("pointerdown", handleFirstClick);
    };
  }, []);

  // Load initial snapshot from Studionet if contract address is configured
  useEffect(() => {
    let mounted = true;
    readCourtSnapshotOnChain(DEFAULT_CONTRACT_ADDRESS, INITIAL_COURT_SNAPSHOT).then((res) => {
      if (!mounted) return;
      setCourtSnapshot(res.snapshot);
      setDataSourceMode(res.source);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const currentCase = useMemo(() => {
    return (
      courtSnapshot.cases[selectedCaseId] ||
      Object.values(courtSnapshot.cases)[0] ||
      INITIAL_COURT_SNAPSHOT.cases["CASE-001"]
    );
  }, [courtSnapshot, selectedCaseId]);

  // Sync forms when switching active case
  useEffect(() => {
    if (!currentCase) return;
    setEvidenceDraft({
      primaryUrl:
        currentCase.primary_url ||
        "https://raw.githubusercontent.com/octocat/Spoon-Knife/main/README.md",
      backupUrl: currentCase.backup_url || "https://cdn.jsdelivr.net/gh/octocat/Spoon-Knife@main/README.md",
      defenseBrief:
        currentCase.defense_brief ||
        "Deliverables are published at both primary and backup public endpoints.",
    });
    setRebuttalDraft({
      rebuttalBrief:
        currentCase.rebuttal_brief ||
        "Primary artifact verified; requesting partial adjustment under cited precedent.",
      disputedClauseCode: currentCase.disputed_clause_code || "CLAUSE_2_BENCHMARK_DEPTH",
      citedPrecedentId: currentCase.cited_precedent_id || "PREC-001",
      assertedCharterText: currentCase.charter_text || "",
    });
    if (currentCase.stage === "SETTLED") {
      setSelectedBpsTier(Number(currentCase.payout_bps));
    }
  }, [currentCase]);

  const dismissCurtain = () => {
    sessionStorage.setItem("lexcuria_curtain_seen", "1");
    setShowCurtain(false);
    soundEngine.handleFirstUserInteraction();
  };

  const handleConnectWallet = async () => {
    try {
      const info = await connectInjectedWallet();
      setWalletInfo(info);
    } catch (err) {
      setTxLifecycle({
        status: "ABORTED",
        txHash: "",
        signerAddress: "",
        message: `Wallet connection error: ${err?.message || "Rejected by user"}`,
      });
    }
  };

  // Act I: Lock Charter & Nominal Escrow
  const handleOpenEscrowCase = async (e) => {
    e.preventDefault();
    const depositInt = Math.max(1000, Math.min(100000, parseInt(newCaseDraft.nominalDeposit, 10) || 10000));
    try {
      const res = await executeCourtWriteTransaction({
        contractAddress: DEFAULT_CONTRACT_ADDRESS,
        functionName: "open_escrow_case",
        args: [
          newCaseDraft.title,
          newCaseDraft.category,
          "petitioner_atlas_dao",
          "respondent_atelier_nova",
          depositInt,
          newCaseDraft.charterText,
        ],
        onStageChange: (st) =>
          setTxLifecycle({
            status: st.status,
            txHash: st.txHash,
            signerAddress: st.signerAddress,
            message: `${st.status} (${res?.mode || "Studionet 61999"})`,
          }),
      });

      const nextNum = Number(courtSnapshot.case_counter) + 1;
      const newCaseId = `CASE-${String(nextNum).padStart(3, "0")}`;
      const charterCommit = simplePureHashPreview(newCaseDraft.charterText);

      setCourtSnapshot((prev) => {
        const nextCases = {
          ...prev.cases,
          [newCaseId]: {
            case_id: newCaseId,
            title: newCaseDraft.title,
            category: newCaseDraft.category,
            petitioner_id: "petitioner_atlas_dao",
            respondent_id: "respondent_atelier_nova",
            nominal_deposit: depositInt,
            charter_text: newCaseDraft.charterText,
            charter_sha256: charterCommit + charterCommit,
            stage: "CHARTER_LOCKED",
            primary_url: "",
            backup_url: "",
            defense_brief: "",
            rebuttal_brief: "",
            disputed_clause_code: "",
            cited_precedent_id: "PREC-001",
            verdict_code: "PENDING",
            payout_bps: 7500,
            respondent_payout: 0,
            petitioner_refund: 0,
            evidence_source_used: "UNRESOLVED",
            evidence_sha256: "",
            fault_code: "PENDING",
            ruling_rationale: "Charter locked; awaiting Respondent evidence dossier.",
            recorded_precedent_id: "",
            witness_ids: [],
          },
        };
        const pet = prev.accounts.petitioner_atlas_dao;
        return {
          ...prev,
          case_counter: nextNum,
          cases: nextCases,
          accounts: {
            ...prev.accounts,
            petitioner_atlas_dao: {
              ...pet,
              nominal_balance: Math.max(0, pet.nominal_balance - depositInt),
              locked_escrow: pet.locked_escrow + depositInt,
              cases_participated: pet.cases_participated + 1,
            },
          },
        };
      });

      setSelectedCaseId(newCaseId);
      setActiveBench("RESPONDENT");
      soundEngine.playGavelStrike();
      setTxLifecycle({
        status: "FINALIZED",
        txHash: res.txHash,
        signerAddress: res.signerAddress,
        message: `Created ${newCaseId} (${res.mode})`,
      });
    } catch (err) {
      setTxLifecycle({
        status: "ABORTED",
        txHash: "",
        signerAddress: "",
        message: err?.message || "Failed to lock charter",
      });
    }
  };

  // Act II: File Dual-Source Evidence Dossier
  const handleFileEvidence = async (e) => {
    e.preventDefault();
    if (currentCase.stage === "SETTLED") return;
    try {
      const res = await executeCourtWriteTransaction({
        contractAddress: DEFAULT_CONTRACT_ADDRESS,
        functionName: "file_evidence_dossier",
        args: [
          currentCase.case_id,
          evidenceDraft.primaryUrl,
          evidenceDraft.backupUrl,
          evidenceDraft.defenseBrief,
        ],
        onStageChange: (st) =>
          setTxLifecycle({
            status: st.status,
            txHash: st.txHash,
            signerAddress: st.signerAddress,
            message: st.status,
          }),
      });

      setCourtSnapshot((prev) => ({
        ...prev,
        cases: {
          ...prev.cases,
          [currentCase.case_id]: {
            ...prev.cases[currentCase.case_id],
            primary_url: evidenceDraft.primaryUrl.trim(),
            backup_url: evidenceDraft.backupUrl.trim(),
            defense_brief: evidenceDraft.defenseBrief.trim(),
            stage: "EVIDENCE_FILED",
            ruling_rationale: "Dual-source evidence dossier filed; awaiting cross-examination.",
          },
        },
      }));
      setActiveBench("PETITIONER");
      soundEngine.playPaperRustle();
      setTxLifecycle({
        status: "FINALIZED",
        txHash: res.txHash,
        signerAddress: res.signerAddress,
        message: `Act II Evidence Filed for ${currentCase.case_id} (${res.mode})`,
      });
    } catch (err) {
      setTxLifecycle({
        status: "ABORTED",
        txHash: "",
        signerAddress: "",
        message: err?.message || "Evidence filing aborted",
      });
    }
  };

  // Act III: Cross-Examination & Charter Tamper Witness check
  const handleFileRebuttal = async (e) => {
    e.preventDefault();
    if (currentCase.stage === "SETTLED") return;
    try {
      const res = await executeCourtWriteTransaction({
        contractAddress: DEFAULT_CONTRACT_ADDRESS,
        functionName: "file_cross_rebuttal",
        args: [
          currentCase.case_id,
          rebuttalDraft.rebuttalBrief,
          rebuttalDraft.disputedClauseCode,
          rebuttalDraft.citedPrecedentId,
          rebuttalDraft.assertedCharterText,
        ],
        onStageChange: (st) =>
          setTxLifecycle({
            status: st.status,
            txHash: st.txHash,
            signerAddress: st.signerAddress,
            message: st.status,
          }),
      });

      const assertedTrim = (rebuttalDraft.assertedCharterText || "").trim();
      const isTampered =
        assertedTrim !== "" && assertedTrim !== currentCase.charter_text.trim();

      setCourtSnapshot((prev) => {
        const nextWitnesses = [...prev.witnesses];
        let nextWitnessCounter = prev.witness_counter;
        const caseWitnessIds = [...(prev.cases[currentCase.case_id].witness_ids || [])];
        const nextAccounts = { ...prev.accounts };

        if (isTampered) {
          nextWitnessCounter += 1;
          const witId = `WIT-${String(nextWitnessCounter).padStart(3, "0")}`;
          nextWitnesses.unshift({
            witness_id: witId,
            witness_type: "CHARTER_TAMPER_WITNESS",
            case_id: currentCase.case_id,
            locked_charter_sha256: currentCase.charter_sha256,
            attempted_excerpt: assertedTrim.slice(0, 90),
            resolution:
              "Original locked charter preserved intact; petitioner credibility penalized by 15 points.",
          });
          caseWitnessIds.push(witId);
          nextAccounts.petitioner_atlas_dao = {
            ...nextAccounts.petitioner_atlas_dao,
            reputation_score: Math.max(100, nextAccounts.petitioner_atlas_dao.reputation_score - 15),
          };
        }

        return {
          ...prev,
          witness_counter: nextWitnessCounter,
          witnesses: nextWitnesses,
          accounts: nextAccounts,
          cases: {
            ...prev.cases,
            [currentCase.case_id]: {
              ...prev.cases[currentCase.case_id],
              rebuttal_brief: rebuttalDraft.rebuttalBrief.trim(),
              disputed_clause_code: rebuttalDraft.disputedClauseCode.trim(),
              cited_precedent_id: rebuttalDraft.citedPrecedentId.trim(),
              stage: "CROSS_EXAMINED",
              witness_ids: caseWitnessIds,
              ruling_rationale: isTampered
                ? "Cross-examination recorded; CHARTER_TAMPER_WITNESS logged without overwriting locked charter."
                : "Cross-examination recorded; ready for validator deliberation.",
            },
          },
        };
      });

      setActiveBench("JURY");
      soundEngine.playPaperRustle();
      setTxLifecycle({
        status: "FINALIZED",
        txHash: res.txHash,
        signerAddress: res.signerAddress,
        message: isTampered
          ? "CHARTER_TAMPER_WITNESS recorded! Original locked charter preserved."
          : `Act III Cross-Examination recorded (${res.mode})`,
      });
    } catch (err) {
      setTxLifecycle({
        status: "ABORTED",
        txHash: "",
        signerAddress: "",
        message: err?.message || "Cross-examination failed",
      });
    }
  };

  // Act IV: Deliberate & Settle Escrow in integer basis points
  const handleDeliberateAndSettle = async () => {
    if (currentCase.stage === "SETTLED") return;
    try {
      const res = await executeCourtWriteTransaction({
        contractAddress: DEFAULT_CONTRACT_ADDRESS,
        functionName: "deliberate_and_settle",
        args: [currentCase.case_id],
        onStageChange: (st) =>
          setTxLifecycle({
            status: st.status,
            txHash: st.txHash,
            signerAddress: st.signerAddress,
            message: st.status,
          }),
      });

      const bps = Number(selectedBpsTier);
      const deposit = Number(currentCase.nominal_deposit);
      const respondentPayout = Math.floor((deposit * bps) / 10000);
      const petitionerRefund = deposit - respondentPayout;
      const verdictMap = {
        0: "REJECT",
        2500: "PARTIAL_LOW",
        5000: "PARTIAL_MID",
        7500: "PARTIAL_HIGH",
        10000: "PASS",
      };
      const faultMap = {
        0: "MATERIAL_BREACH",
        2500: "PARTIAL_SPEC_GAP",
        5000: "PARTIAL_SPEC_GAP",
        7500: "MINOR_DOC_OMISSION",
        10000: "NONE",
      };
      const verdictCode = verdictMap[bps] || "PARTIAL_HIGH";
      const faultCode = faultMap[bps] || "MINOR_DOC_OMISSION";

      setCourtSnapshot((prev) => {
        const nextPrecNum = Number(prev.precedent_counter) + 1;
        const newPrecId = `PREC-${String(nextPrecNum).padStart(3, "0")}`;
        const citedId = currentCase.cited_precedent_id || "PREC-001";
        const citedPrec = prev.precedents[citedId] || prev.precedents["PREC-001"];
        const bpsDelta = Math.abs(bps - Number(citedPrec?.payout_bps ?? 7500));

        const nextWitnesses = [...prev.witnesses];
        let nextWitnessCounter = prev.witness_counter;
        const caseWitnessIds = [...(currentCase.witness_ids || [])];

        if (bpsDelta >= 5000) {
          nextWitnessCounter += 1;
          const divWitId = `WIT-${String(nextWitnessCounter).padStart(3, "0")}`;
          nextWitnesses.unshift({
            witness_id: divWitId,
            witness_type: "PRECEDENT_DIVERGENCE_WITNESS",
            case_id: currentCase.case_id,
            cited_precedent_id: citedId,
            historical_payout_bps: citedPrec.payout_bps,
            new_payout_bps: bps,
            bps_delta: bpsDelta,
            resolution:
              "Historical precedent preserved intact; divergence witness appended to judicial log.",
          });
          caseWitnessIds.push(divWitId);
        }

        const rulingSummary = `Ruling ${verdictCode} (${bps} bps) under fault code ${faultCode}: released ${respondentPayout} nominal units to Respondent and refunded ${petitionerRefund} nominal units to Petitioner.`;

        const pet = prev.accounts.petitioner_atlas_dao;
        const resp = prev.accounts.respondent_atelier_nova;
        const juror = prev.accounts.juror_pool_studionet;

        return {
          ...prev,
          precedent_counter: nextPrecNum,
          witness_counter: nextWitnessCounter,
          witnesses: nextWitnesses,
          precedents: {
            ...prev.precedents,
            [citedId]: {
              ...citedPrec,
              citations_count: Number(citedPrec.citations_count || 1) + 1,
            },
            [newPrecId]: {
              precedent_id: newPrecId,
              source_case_id: currentCase.case_id,
              category: currentCase.category,
              evidence_tier: "VERIFIED_PUBLIC_REPO",
              verdict_code: verdictCode,
              payout_bps: bps,
              fault_code: faultCode,
              principle_summary: rulingSummary,
              citations_count: 1,
            },
          },
          accounts: {
            ...prev.accounts,
            petitioner_atlas_dao: {
              ...pet,
              locked_escrow: Math.max(0, pet.locked_escrow - deposit),
              nominal_balance: pet.nominal_balance + petitionerRefund,
              reputation_score:
                bps <= 2500 ? pet.reputation_score + 18 : Math.max(100, pet.reputation_score - 4),
              rulings_won: bps <= 2500 ? pet.rulings_won + 1 : pet.rulings_won,
            },
            respondent_atelier_nova: {
              ...resp,
              nominal_balance: resp.nominal_balance + respondentPayout,
              reputation_score:
                bps >= 7500 ? resp.reputation_score + 18 : Math.max(100, resp.reputation_score - 16),
              rulings_won: bps >= 7500 ? resp.rulings_won + 1 : resp.rulings_won,
            },
            juror_pool_studionet: {
              ...juror,
              cases_participated: juror.cases_participated + 1,
              reputation_score: juror.reputation_score + 5,
            },
          },
          cases: {
            ...prev.cases,
            [currentCase.case_id]: {
              ...currentCase,
              stage: "SETTLED",
              verdict_code: verdictCode,
              payout_bps: bps,
              respondent_payout: respondentPayout,
              petitioner_refund: petitionerRefund,
              evidence_source_used: "PRIMARY_WITH_BACKUP_CANONICAL",
              fault_code: faultCode,
              ruling_rationale: rulingSummary,
              recorded_precedent_id: newPrecId,
              witness_ids: caseWitnessIds,
            },
          },
        };
      });

      // Chain read-back overrides the local optimistic simulation: the verdict
      // shown must be the on-chain verdict, not the user-selected tier.
      let finalBps = bps;
      let finalMessage = `FINALIZED (${res.mode}) · Settled at ${bps} bps (local simulation — reload to confirm on-chain)`;
      try {
        const live = await readCourtSnapshotOnChain(DEFAULT_CONTRACT_ADDRESS, null);
        if (live && live.source === "STUDIONET_61999_LIVE" && live.snapshot?.cases?.[currentCase.case_id]) {
          const onchainCase = live.snapshot.cases[currentCase.case_id];
          finalBps = Number(onchainCase.payout_bps);
          finalMessage = `FINALIZED (ONCHAIN_STUDIONET) · Settled at ${finalBps} bps · read back from Studionet`;
          setCourtSnapshot(live.snapshot);
          setDataSourceMode("STUDIONET_61999_LIVE");
          setSelectedBpsTier(finalBps);
        }
      } catch {
        // Keep the optimistic display but label it as unconfirmed.
      }
      soundEngine.playGavelStrike();
      setTxLifecycle({
        status: "FINALIZED",
        txHash: res.txHash,
        signerAddress: res.signerAddress,
        message: finalMessage,
      });
    } catch (err) {
      setTxLifecycle({
        status: "ABORTED",
        txHash: "",
        signerAddress: "",
        message: err?.message || "Deliberation aborted before state write",
      });
    }
  };

  // Demonstrate Dual-Source Fail-Safe (Both Primary & Backup offline -> abort before write, stay CROSS_EXAMINED)
  const handleSimulateDualSourceOutage = () => {
    soundEngine.playPaperRustle();
    setTxLifecycle({
      status: "ABORTED",
      txHash: "",
      signerAddress: walletInfo.ephemeralSignerAddress,
      message:
        "EXTERNAL_EVIDENCE_UNAVAILABLE: Both primary_url and backup_url timed out. Aborted BEFORE state write; case remains in CROSS_EXAMINED and retryable.",
    });
  };

  // Compute SVG Balance Beam rotation (-14 deg to +14 deg) from active integer basis points
  const activeBpsForBeam =
    currentCase.stage === "SETTLED" ? Number(currentCase.payout_bps) : Number(selectedBpsTier);
  const beamAngleDeg = ((activeBpsForBeam - 5000) / 5000) * 13;
  const previewRespondentUnits = Math.floor(
    (Number(currentCase.nominal_deposit) * activeBpsForBeam) / 10000
  );
  const previewPetitionerUnits = Number(currentCase.nominal_deposit) - previewRespondentUnits;

  return (
    <div className="gazette-shell">
      {/* Session Opening Curtain (Once per session, click to skip, skipped under reduced-motion) */}
      {showCurtain && (
        <div className="session-curtain" onClick={dismissCurtain} role="dialog" aria-modal="true">
          <div className="curtain-card">
            <p className="curtain-eyebrow">GENLAYER STABLE STUDIONET · CHAIN ID 61999</p>
            <h1 className="curtain-title">{t.curtainTitle}</h1>
            <p className="curtain-sub">{t.curtainSub}</p>
            <button type="button" className="btn-primary" onClick={dismissCurtain}>
              {t.curtainSkip}
            </button>
          </div>
        </div>
      )}

      {/* Top Editorial Utility & Trust Bar */}
      <header className="gazette-topbar">
        <div className="topbar-left">
          <span className="chain-pill">STUDIONET 61999 · GAS = 0</span>
          <span className="mode-pill">
            {dataSourceMode === "STUDIONET_61999_LIVE"
              ? "LIVE CONTRACT SNAPSHOT"
              : "LOCAL REHEARSAL SNAPSHOT (NOT ON-CHAIN CONSENSUS)"}
          </span>
        </div>

        <div className="topbar-controls">
          <button
            type="button"
            className={`util-btn ${audioState.isEnabled ? "active" : ""}`}
            onClick={() => soundEngine.toggleManual()}
          >
            {audioState.manuallyDisabled
              ? t.audioOff
              : audioState.isEnabled
              ? t.audioOn
              : t.audioIdle}
          </button>

          <button
            type="button"
            className={`util-btn ${showClerkNotes ? "active" : ""}`}
            onClick={() => setShowClerkNotes((v) => !v)}
          >
            {showClerkNotes ? t.clerkNotesOn : t.clerkNotesOff}
          </button>

          <div className="lang-switch" role="group" aria-label="Language Switcher">
            {SUPPORTED_LANGUAGES.map((item) => (
              <button
                key={item.code}
                type="button"
                className={`lang-btn ${lang === item.code ? "active" : ""}`}
                onClick={() => setLang(item.code)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button type="button" className="wallet-btn" onClick={handleConnectWallet}>
            {walletInfo.address
              ? `${walletInfo.walletName}: ${walletInfo.address.slice(0, 6)}...${walletInfo.address.slice(-4)}`
              : t.walletConnectBtn}
          </button>
        </div>
      </header>

      {/* Honest Signer & Studionet Accounting Banner */}
      <div className="trust-strip">
        <span>{t.nominalNotice}</span>
        <span className="signer-badge">
          {walletInfo.address ? t.walletEphemeralBadge : t.walletReadOnlyBadge} (
          {walletInfo.ephemeralSignerAddress.slice(0, 10)}...)
        </span>
      </div>

      {/* First Screen Hero: Editorial Masthead + Live SVG Evidentiary Balance Rig */}
      <section className="hero-grid">
        <div className="hero-editorial">
          <p className="masthead-kicker">{t.mastheadTag}</p>
          <h1 className="masthead-display">{t.mastheadTitle}</h1>
          <h2 className="masthead-lead">{t.mastheadSubtitle}</h2>
          <p className="masthead-story">{t.heroStory}</p>

          {showClerkNotes && <div className="clerk-note">{t.clerkNoteBalance}</div>}

          <div className="docket-selector-bar">
            <label htmlFor="docket-select" className="docket-label">
              {t.presetSwitchLabel}
            </label>
            <select
              id="docket-select"
              className="docket-select"
              value={currentCase.case_id}
              onChange={(e) => {
                setSelectedCaseId(e.target.value);
                soundEngine.playPaperRustle();
              }}
            >
              {Object.values(courtSnapshot.cases).map((c) => (
                <option key={c.case_id} value={c.case_id}>
                  {c.case_id} · [{c.stage}] · {c.title}
                </option>
              ))}
            </select>
          </div>

          <div className="hero-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setActiveBench("JURY");
                document.getElementById("courtroom-stage")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {t.heroPrimaryCta}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setActiveBench("PETITIONER");
                document.getElementById("courtroom-stage")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {t.heroSecondaryCta}
            </button>
          </div>
        </div>

        {/* Technique 1: Concept Moves When Idle — Live SVG Evidentiary Balance Rig */}
        <div className="balance-rig-card">
          <div className="rig-header">
            <span className="rig-title">{t.balanceRigTitle}</span>
            <span className={`stage-tag stage-${currentCase.stage.toLowerCase()}`}>
              {currentCase.case_id} · {currentCase.stage}
            </span>
          </div>

          <svg
            viewBox="0 0 460 230"
            className="balance-svg"
            role="img"
            aria-label="Evidentiary Balance Scale"
          >
            {/* Base Pedestal & Fulcrum Pillar */}
            <rect x="170" y="205" width="120" height="12" fill="#151514" />
            <polygon points="230,52 216,205 244,205" fill="#2A2927" />
            <circle cx="230" cy="52" r="9" fill="#C83E2B" />

            {/* Tilting Beam Group Driven by Integer Basis Points */}
            <g
              style={{
                transform: `rotate(${beamAngleDeg}deg)`,
                transformOrigin: "230px 52px",
                transition: "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <line x1="75" y1="52" x2="385" y2="52" stroke="#151514" strokeWidth="6" />
              {/* Left Pan: Petitioner Refund */}
              <line x1="85" y1="52" x2="60" y2="128" stroke="#151514" strokeWidth="2" />
              <line x1="85" y1="52" x2="110" y2="128" stroke="#151514" strokeWidth="2" />
              <path d="M 45 128 Q 85 148 125 128 Z" fill="#C83E2B" />
              <text x="85" y="162" textAnchor="middle" className="svg-pan-text">
                {10000 - activeBpsForBeam} bps
              </text>
              <text x="85" y="178" textAnchor="middle" className="svg-pan-sub">
                Refund: {previewPetitionerUnits}
              </text>

              {/* Right Pan: Respondent Payout */}
              <line x1="375" y1="52" x2="350" y2="128" stroke="#151514" strokeWidth="2" />
              <line x1="375" y1="52" x2="400" y2="128" stroke="#151514" strokeWidth="2" />
              <path d="M 335 128 Q 375 148 415 128 Z" fill="#1B5E43" />
              <text x="375" y="162" textAnchor="middle" className="svg-pan-text">
                {activeBpsForBeam} bps
              </text>
              <text x="375" y="178" textAnchor="middle" className="svg-pan-sub">
                Payout: {previewRespondentUnits}
              </text>
            </g>
          </svg>

          <div className="rig-split-bar">
            <div className="rig-col">
              <span className="rig-label">{t.balanceLeftLabel}</span>
              <strong>
                {previewPetitionerUnits} / {currentCase.nominal_deposit} units (
                {10000 - activeBpsForBeam} bps)
              </strong>
            </div>
            <div className="rig-col right">
              <span className="rig-label">{t.balanceRightLabel}</span>
              <strong>
                {previewRespondentUnits} / {currentCase.nominal_deposit} units ({activeBpsForBeam}{" "}
                bps)
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* Four-Act Progress Stepper */}
      <section id="courtroom-stage" className="four-act-Readout">
        <div className="act-stepper">
          {[
            { key: "CHARTER_LOCKED", label: t.stageCharterLocked },
            { key: "EVIDENCE_FILED", label: t.stageEvidenceFiled },
            { key: "CROSS_EXAMINED", label: t.stageCrossExamined },
            { key: "SETTLED", label: t.stageSettled },
          ].map((step, idx) => {
            const order = ["CHARTER_LOCKED", "EVIDENCE_FILED", "CROSS_EXAMINED", "SETTLED"];
            const currentIdx = order.indexOf(currentCase.stage);
            const isDone = idx <= currentIdx;
            return (
              <div key={step.key} className={`act-step ${isDone ? "active" : ""}`}>
                <span className="act-num">0{idx + 1}</span>
                <span className="act-name">{step.label}</span>
              </div>
            );
          })}
        </div>

        {/* Transaction Status & Trust Feedback Banner */}
        <div className={`tx-feedback-banner status-${txLifecycle.status.toLowerCase()}`}>
          <div className="tx-status-main">
            <strong>
              {txLifecycle.status === "IDLE" && t.txStatusIdle}
              {txLifecycle.status === "REQUESTED" && t.txStatusRequested}
              {txLifecycle.status === "PENDING_CONSENSUS" && t.txStatusPending}
              {txLifecycle.status === "FINALIZED" && t.txStatusFinalized}
              {txLifecycle.status === "ABORTED" && t.txStatusAborted}
            </strong>
            {txLifecycle.message && <span className="tx-detail"> — {txLifecycle.message}</span>}
          </div>
          <div className="tx-meta-links">
            <span>RPC: {STUDIONET_RPC_URL}</span>
            {txLifecycle.txHash && (
              <span className="mono-hash">Tx: {txLifecycle.txHash.slice(0, 18)}...</span>
            )}
          </div>
        </div>

        {/* Four Courtroom Bench Switcher Tabs */}
        <nav className="bench-tabs" aria-label="Courtroom Perspectives">
          {[
            { id: "PETITIONER", label: t.benchPetitioner },
            { id: "RESPONDENT", label: t.benchRespondent },
            { id: "JURY", label: t.benchJury },
            { id: "PRECEDENTS", label: t.benchPrecedents },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`bench-tab ${activeBench === tab.id ? "active" : ""}`}
              onClick={() => {
                setActiveBench(tab.id);
                soundEngine.playPaperRustle();
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Active Bench Stage Content */}
        <div className="bench-stage-panel">
          {activeBench === "PETITIONER" && (
            <div className="bench-two-col">
              {/* Act I: Create / Lock Charter */}
              <form className="dossier-card" onSubmit={handleOpenEscrowCase}>
                <h3>{t.act1Title}</h3>
                <p className="card-sub">{t.createCaseModalTitle}</p>
                <label className="field-label">
                  Case Title (English On-Chain)
                  <input
                    type="text"
                    className="gazette-input"
                    value={newCaseDraft.title}
                    onChange={(e) => setNewCaseDraft({ ...newCaseDraft, title: e.target.value })}
                    required
                  />
                </label>
                <div className="field-row">
                  <label className="field-label">
                    Dispute Category Code
                    <input
                      type="text"
                      className="gazette-input mono"
                      value={newCaseDraft.category}
                      onChange={(e) =>
                        setNewCaseDraft({ ...newCaseDraft, category: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label className="field-label">
                    Nominal Escrow Deposit (Integer Units)
                    <input
                      type="number"
                      min="1000"
                      max="100000"
                      step="500"
                      className="gazette-input mono"
                      value={newCaseDraft.nominalDeposit}
                      onChange={(e) =>
                        setNewCaseDraft({ ...newCaseDraft, nominalDeposit: e.target.value })
                      }
                      required
                    />
                  </label>
                </div>
                <label className="field-label">
                  Acceptance Charter Clauses (Committed via Pure-Python SHA-256)
                  <textarea
                    rows="3"
                    className="gazette-textarea"
                    value={newCaseDraft.charterText}
                    onChange={(e) =>
                      setNewCaseDraft({ ...newCaseDraft, charterText: e.target.value })
                    }
                    required
                  />
                </label>
                <button type="submit" className="btn-primary full-width">
                  {t.btnLockCharter}
                </button>
              </form>

              {/* Act III: Cross-Examine & Tamper Witness Test */}
              <form className="dossier-card" onSubmit={handleFileRebuttal}>
                <h3>
                  {t.act3Title} ({currentCase.case_id})
                </h3>
                <div className="hash-readout">
                  <span>{t.charterHashLabel}:</span>
                  <code>{currentCase.charter_sha256}</code>
                </div>
                <label className="field-label">
                  {t.rebuttalBriefLabel}
                  <textarea
                    rows="3"
                    className="gazette-textarea"
                    value={rebuttalDraft.rebuttalBrief}
                    onChange={(e) =>
                      setRebuttalDraft({ ...rebuttalDraft, rebuttalBrief: e.target.value })
                    }
                    required
                  />
                </label>
                <div className="field-row">
                  <label className="field-label">
                    Disputed Clause Code
                    <input
                      type="text"
                      className="gazette-input mono"
                      value={rebuttalDraft.disputedClauseCode}
                      onChange={(e) =>
                        setRebuttalDraft({
                          ...rebuttalDraft,
                          disputedClauseCode: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="field-label">
                    {t.citedPrecedentLabel}
                    <select
                      className="gazette-input mono"
                      value={rebuttalDraft.citedPrecedentId}
                      onChange={(e) =>
                        setRebuttalDraft({
                          ...rebuttalDraft,
                          citedPrecedentId: e.target.value,
                        })
                      }
                    >
                      {Object.keys(courtSnapshot.precedents).map((pid) => (
                        <option key={pid} value={pid}>
                          {pid} ({courtSnapshot.precedents[pid].payout_bps} bps)
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field-label">
                  {t.tamperTestLabel}
                  <input
                    type="text"
                    className="gazette-input"
                    value={rebuttalDraft.assertedCharterText}
                    onChange={(e) =>
                      setRebuttalDraft({
                        ...rebuttalDraft,
                        assertedCharterText: e.target.value,
                      })
                    }
                  />
                  <small className="field-hint">{t.tamperTestHint}</small>
                </label>
                <button
                  type="submit"
                  className="btn-secondary full-width"
                  disabled={currentCase.stage === "SETTLED"}
                >
                  {t.btnFileRebuttal}
                </button>
              </form>
            </div>
          )}

          {activeBench === "RESPONDENT" && (
            <form className="dossier-card" onSubmit={handleFileEvidence}>
              <h3>
                {t.act2Title} ({currentCase.case_id})
              </h3>
              <p className="dual-source-callout">{t.dualSourceRuleNote}</p>
              {showClerkNotes && <div className="clerk-note">{t.clerkNoteFailover}</div>}

              <div className="field-row">
                <label className="field-label">
                  {t.primaryUrlLabel}
                  <input
                    type="url"
                    className="gazette-input mono"
                    value={evidenceDraft.primaryUrl}
                    onChange={(e) =>
                      setEvidenceDraft({ ...evidenceDraft, primaryUrl: e.target.value })
                    }
                    required
                  />
                </label>
                <label className="field-label">
                  {t.backupUrlLabel}
                  <input
                    type="url"
                    className="gazette-input mono"
                    value={evidenceDraft.backupUrl}
                    onChange={(e) =>
                      setEvidenceDraft({ ...evidenceDraft, backupUrl: e.target.value })
                    }
                    required
                  />
                </label>
              </div>

              <label className="field-label">
                {t.defenseBriefLabel}
                <textarea
                  rows="4"
                  className="gazette-textarea"
                  value={evidenceDraft.defenseBrief}
                  onChange={(e) =>
                    setEvidenceDraft({ ...evidenceDraft, defenseBrief: e.target.value })
                  }
                  required
                />
              </label>

              <button
                type="submit"
                className="btn-primary"
                disabled={currentCase.stage === "SETTLED"}
              >
                {t.btnFileEvidence}
              </button>
            </form>
          )}

          {activeBench === "JURY" && (
            <div className="bench-two-col">
              <div className="dossier-card">
                <h3>
                  {t.act4Title} · {currentCase.case_id}
                </h3>
                <div className="evidence-compare-box">
                  <div>
                    <strong>Locked Charter ({currentCase.nominal_deposit} nominal units):</strong>
                    <p>{currentCase.charter_text}</p>
                  </div>
                  <div>
                    <strong>Primary Evidence Source:</strong>
                    <p>
                      <a
                        href={currentCase.primary_url}
                        target="_blank"
                        rel="noreferrer"
                        className="source-link"
                      >
                        {currentCase.primary_url || "Not filed yet"}
                      </a>
                    </p>
                    <strong>Backup Mirror Source (Auto-Failover):</strong>
                    <p>
                      <a
                        href={currentCase.backup_url}
                        target="_blank"
                        rel="noreferrer"
                        className="source-link"
                      >
                        {currentCase.backup_url || "Not filed yet"}
                      </a>
                    </p>
                  </div>
                  <div>
                    <strong>Respondent Defense vs. Petitioner Rebuttal:</strong>
                    <p>
                      <em>Defense:</em> {currentCase.defense_brief || "Pending"}
                    </p>
                    <p>
                      <em>Rebuttal:</em> {currentCase.rebuttal_brief || "Pending"} (Cited:{" "}
                      <code>{currentCase.cited_precedent_id}</code>)
                    </p>
                  </div>
                </div>
              </div>

              <div className="dossier-card">
                <h3>Discrete Integer Basis-Point Tier Selection (Zero Floats)</h3>
                <p className="card-sub">
                  Validators converge on one of 5 exact integer tiers (`0`, `2500`, `5000`, `7500`,
                  `10000 bps`). Selecting a tier that diverges from `{currentCase.cited_precedent_id}`
                  by 5000 bps or more automatically appends a `PRECEDENT_DIVERGENCE_WITNESS`.
                </p>

                <div className="bps-tier-grid" role="radiogroup" aria-label="Basis Point Tiers">
                  {[
                    { bps: 0, code: "REJECT (0%)" },
                    { bps: 2500, code: "PARTIAL_LOW (25%)" },
                    { bps: 5000, code: "PARTIAL_MID (50%)" },
                    { bps: 7500, code: "PARTIAL_HIGH (75%)" },
                    { bps: 10000, code: "PASS (100%)" },
                  ].map((tier) => (
                    <button
                      key={tier.bps}
                      type="button"
                      disabled={currentCase.stage === "SETTLED"}
                      className={`bps-pill ${activeBpsForBeam === tier.bps ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedBpsTier(tier.bps);
                        soundEngine.playPaperRustle();
                      }}
                    >
                      <span className="bps-val">{tier.bps} bps</span>
                      <span className="bps-name">{tier.code}</span>
                    </button>
                  ))}
                </div>

                <div className="ruling-summary-banner">
                  <strong>Current Verdict Status: {currentCase.verdict_code}</strong>
                  <p>{currentCase.ruling_rationale}</p>
                </div>

                <div className="jury-action-stack">
                  <button
                    type="button"
                    className="btn-primary full-width"
                    disabled={currentCase.stage === "SETTLED"}
                    onClick={handleDeliberateAndSettle}
                  >
                    {t.btnDeliberate}
                  </button>
                  <button
                    type="button"
                    className="btn-outline-danger full-width"
                    disabled={currentCase.stage === "SETTLED"}
                    onClick={handleSimulateDualSourceOutage}
                  >
                    {t.btnSimDualFail}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeBench === "PRECEDENTS" && (
            <div className="precedents-bench">
              <h3>{t.precedentDrawerTitle}</h3>
              <p className="card-sub">{t.precedentDrawerHint}</p>
              {showClerkNotes && <div className="clerk-note">{t.clerkNoteWitness}</div>}

              {/* Technique 3: Pull-out Index Dossier Drawer with Preview */}
              <div className="dossier-drawer-grid">
                <div className="dossier-tab-list">
                  {Object.values(courtSnapshot.precedents).map((prec) => (
                    <button
                      key={prec.precedent_id}
                      type="button"
                      className={`dossier-folder-tab ${
                        activePrecedentId === prec.precedent_id ? "open" : ""
                      }`}
                      onMouseEnter={() => setActivePrecedentId(prec.precedent_id)}
                      onClick={() => {
                        setActivePrecedentId(prec.precedent_id);
                        soundEngine.playPaperRustle();
                      }}
                    >
                      <span className="folder-id">{prec.precedent_id}</span>
                      <span className="folder-cat">{prec.category}</span>
                      <span className="folder-bps">{prec.payout_bps} bps</span>
                    </button>
                  ))}
                </div>

                {courtSnapshot.precedents[activePrecedentId] && (
                  <div className="dossier-preview-sheet">
                    <div className="preview-header">
                      <h4>
                        {courtSnapshot.precedents[activePrecedentId].precedent_id} ·{" "}
                        {courtSnapshot.precedents[activePrecedentId].verdict_code}
                      </h4>
                      <span className="citation-badge">
                        Citations: {courtSnapshot.precedents[activePrecedentId].citations_count}
                      </span>
                    </div>
                    <p className="preview-principle">
                      {courtSnapshot.precedents[activePrecedentId].principle_summary}
                    </p>
                    <div className="preview-meta">
                      <span>
                        Source Case: {courtSnapshot.precedents[activePrecedentId].source_case_id}
                      </span>
                      <span>
                        Fault Code: {courtSnapshot.precedents[activePrecedentId].fault_code}
                      </span>
                      <span>
                        Settlement Tier: {courtSnapshot.precedents[activePrecedentId].payout_bps} bps
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Evolving State Section 1: Non-Overwriting Witness Log */}
      <section className="witness-section">
        <div className="section-head">
          <h2>{t.witnessLogTitle}</h2>
        </div>
        {courtSnapshot.witnesses.length === 0 ? (
          <p className="empty-witness">{t.witnessEmpty}</p>
        ) : (
          <div className="witness-cards">
            {courtSnapshot.witnesses.map((w) => (
              <div key={w.witness_id} className="witness-card">
                <div className="witness-top">
                  <span className="witness-badge">{w.witness_id}</span>
                  <strong>{w.witness_type}</strong>
                  <span className="mono">Case: {w.case_id}</span>
                </div>
                <p>{w.resolution}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Evolving State Section 2: Nominal Escrow & Reputation Ledger */}
      <section className="ledger-section">
        <div className="section-head">
          <h2>{t.ledgerSectionTitle}</h2>
        </div>
        <div className="ledger-cards-grid">
          {Object.values(courtSnapshot.accounts).map((acct) => (
            <div key={acct.party_id} className="party-ledger-card">
              <div className="party-card-top">
                <span className="party-id-mono">{acct.party_id}</span>
                <span className="rep-pill">
                  {t.colReputation}: {acct.reputation_score}
                </span>
              </div>
              <div className="party-metrics">
                <div>
                  <span className="metric-label">{t.colNominalBal}</span>
                  <strong className="metric-val">{acct.nominal_balance}</strong>
                </div>
                <div>
                  <span className="metric-label">{t.colLockedEscrow}</span>
                  <strong className="metric-val">{acct.locked_escrow}</strong>
                </div>
                <div>
                  <span className="metric-label">{t.colCasesWon}</span>
                  <strong className="metric-val">
                    {acct.rulings_won} / {acct.cases_participated}
                  </strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

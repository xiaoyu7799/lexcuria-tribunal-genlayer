import React, { useState, useEffect, useMemo, useRef } from "react";
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
  const shellRef = useRef(null);
  const rigCardRef = useRef(null);

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

  // 3D Tilt state for fine-pointer devices
  const [rigTilt, setRigTilt] = useState({ rx: 0, ry: 0 });

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
    backupUrl: "https://api.github.com/repos/octocat/Spoon-Knife",
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

  // Fine-pointer ambient spotlight tracker
  const handleShellPointerMove = (e) => {
    if (!shellRef.current) return;
    const rect = shellRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    shellRef.current.style.setProperty("--mx", `${x}px`);
    shellRef.current.style.setProperty("--my", `${y}px`);
  };

  const handleRigPointerMove = (e) => {
    if (!rigCardRef.current) return;
    if (window.matchMedia?.("(pointer: coarse)")?.matches) return;
    const rect = rigCardRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setRigTilt({
      rx: Number((-ny * 7).toFixed(2)),
      ry: Number((nx * 9).toFixed(2)),
    });
  };

  const handleRigPointerLeave = () => {
    setRigTilt({ rx: 0, ry: 0 });
  };

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
      backupUrl: currentCase.backup_url || "https://api.github.com/repos/octocat/Spoon-Knife",
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
    const depositInt = Math.max(
      1000,
      Math.min(100000, parseInt(newCaseDraft.nominalDeposit, 10) || 10000)
    );
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
            message: `${st.status} (Studionet 61999)`,
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
            reputation_score: Math.max(
              100,
              nextAccounts.petitioner_atlas_dao.reputation_score - 15
            ),
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
                bps >= 7500
                  ? resp.reputation_score + 18
                  : Math.max(100, resp.reputation_score - 16),
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
              evidence_source_used: "PRIMARY_WITH_BACKUP_EQUIVALENCE",
              fault_code: faultCode,
              ruling_rationale: rulingSummary,
              recorded_precedent_id: newPrecId,
              witness_ids: caseWitnessIds,
            },
          },
        };
      });

      soundEngine.playGavelStrike();
      setTxLifecycle({
        status: "FINALIZED",
        txHash: res.txHash,
        signerAddress: res.signerAddress,
        message: `FINALIZED (${res.mode}) · Settled at ${bps} bps`,
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

  // Demonstrate Dual-Source Fail-Safe
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

  // Compute Precision Horological Balance Beam rotation (-14 deg to +14 deg)
  const activeBpsForBeam =
    currentCase.stage === "SETTLED" ? Number(currentCase.payout_bps) : Number(selectedBpsTier);
  const beamAngleDeg = ((activeBpsForBeam - 5000) / 5000) * 14;
  const previewRespondentUnits = Math.floor(
    (Number(currentCase.nominal_deposit) * activeBpsForBeam) / 10000
  );
  const previewPetitionerUnits = Number(currentCase.nominal_deposit) - previewRespondentUnits;
  const respondentPct = Math.round(activeBpsForBeam / 100);
  const petitionerPct = 100 - respondentPct;

  return (
    <div className="gazette-shell" ref={shellRef} onPointerMove={handleShellPointerMove}>
      {/* Ambient Spotlight Overlay + Subtle Archival Grain */}
      <div className="spotlight-layer" aria-hidden="true" />
      <div className="grain-overlay" aria-hidden="true" />

      {/* Session Opening Curtain */}
      {showCurtain && (
        <div className="session-curtain" onClick={dismissCurtain} role="dialog" aria-modal="true">
          <div className="curtain-card">
            <div className="curtain-seal-ring">
              <span>LEXCURIA · SUPREME ON-CHAIN TRIBUNAL · 61999</span>
            </div>
            <p className="curtain-eyebrow">GENLAYER STABLE STUDIONET · CHAIN ID 61999</p>
            <h1 className="curtain-title">{t.curtainTitle}</h1>
            <p className="curtain-sub">{t.curtainSub}</p>
            <button type="button" className="btn-primary btn-gavel" onClick={dismissCurtain}>
              {t.curtainSkip}
            </button>
          </div>
        </div>
      )}

      {/* Architectural Top Ledger Bar */}
      <header className="gazette-topbar">
        <div className="topbar-left">
          <span className="chain-pill">
            <span className="pulse-dot" /> STUDIONET 61999 · GAS = 0
          </span>
          <span
            className={`mode-pill ${
              dataSourceMode === "STUDIONET_61999_LIVE" ? "mode-live" : ""
            }`}
          >
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

      {/* Honest Signer & Studionet Accounting Ribbon */}
      <div className="trust-strip">
        <span className="trust-notice-text">{t.nominalNotice}</span>
        <span className="signer-badge">
          {walletInfo.address ? t.walletEphemeralBadge : t.walletReadOnlyBadge} (
          {walletInfo.ephemeralSignerAddress.slice(0, 10)}...)
        </span>
      </div>

      {/* First Screen Editorial Masthead + Precision Horological Balance Instrument */}
      <section className="hero-grid">
        <div className="hero-editorial">
          <div className="editorial-meta-row">
            <span className="edition-vol">VOL. IV · DOSSIER {currentCase.case_id}</span>
            <span className="edition-sep">/</span>
            <span className="masthead-kicker">{t.mastheadTag}</span>
          </div>

          {/* Technique: Interactive Kinetic Split-Character Masthead */}
          <h1 className="masthead-display" aria-label={t.mastheadTitle}>
            {t.mastheadTitle.split("").map((char, idx) => (
              <span key={idx} className="kinetic-char" style={{ "--char-idx": idx }}>
                {char === " " ? "\u00A0" : char}
              </span>
            ))}
          </h1>

          <h2 className="masthead-lead">{t.mastheadSubtitle}</h2>
          <p className="masthead-story">{t.heroStory}</p>

          {showClerkNotes && (
            <div className="clerk-note">
              <span className="clerk-pin">✎</span>
              {t.clerkNoteBalance}
            </div>
          )}

          {/* Tactile Case File Switcher */}
          <div className="docket-selector-bar">
            <label htmlFor="docket-select" className="docket-label">
              {t.presetSwitchLabel}
            </label>
            <div className="select-wrapper">
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
              <span>{t.heroPrimaryCta}</span>
              <span className="btn-arrow">→</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setActiveBench("PETITIONER");
                document.getElementById("courtroom-stage")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <span>{t.heroSecondaryCta}</span>
            </button>
          </div>
        </div>

        {/* Precision Horological Brass & Obsidian Balance Instrument (3D Tilt + Idle Motion) */}
        <div
          ref={rigCardRef}
          onPointerMove={handleRigPointerMove}
          onPointerLeave={handleRigPointerLeave}
          className="balance-rig-card"
          style={{
            transform: `perspective(1100px) rotateX(${rigTilt.rx}deg) rotateY(${rigTilt.ry}deg)`,
          }}
        >
          {/* Rotating Wax Seal Stamp Badge */}
          <div className="rotating-seal-badge" aria-hidden="true">
            <svg viewBox="0 0 120 120" className="seal-svg">
              <defs>
                <path
                  id="sealCirclePath"
                  d="M 60, 60 m -44, 0 a 44,44 0 1,1 88,0 a 44,44 0 1,1 -88,0"
                />
              </defs>
              <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
              <circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" strokeWidth="1" />
              <text className="seal-ring-text">
                <textPath href="#sealCirclePath" startOffset="0%">
                  LEXCURIA TRIBUNAL · INTEGER BPS · 61999 ·
                </textPath>
              </text>
              <text x="60" y="65" textAnchor="middle" className="seal-center-bps">
                {activeBpsForBeam}
              </text>
            </svg>
          </div>

          <div className="rig-header">
            <div>
              <span className="rig-eyebrow">INSTRUMENT NO. 61999-A · ZERO-FLOAT CALIBRATION</span>
              <h3 className="rig-title">{t.balanceRigTitle}</h3>
            </div>
            <span className={`stage-tag stage-${currentCase.stage.toLowerCase()}`}>
              {currentCase.case_id} · {currentCase.stage}
            </span>
          </div>

          {/* Intricate Horological SVG Scale */}
          <svg
            viewBox="0 0 540 275"
            className="balance-svg"
            role="img"
            aria-label="Evidentiary Balance Scale"
          >
            <defs>
              <linearGradient id="brassGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#9c7a44" />
                <stop offset="50%" stopColor="#e5c88f" />
                <stop offset="100%" stopColor="#8c6b36" />
              </linearGradient>
              <linearGradient id="crimsonPan" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#e0533c" />
                <stop offset="100%" stopColor="#912314" />
              </linearGradient>
              <linearGradient id="emeraldPan" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#2ca374" />
                <stop offset="100%" stopColor="#124732" />
              </linearGradient>
              <radialGradient id="fulcrumGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(229, 200, 143, 0.45)" />
                <stop offset="100%" stopColor="rgba(229, 200, 143, 0)" />
              </radialGradient>
            </defs>

            {/* Architectural Background Dial Grid */}
            <circle cx="270" cy="78" r="145" fill="none" stroke="rgba(229,200,143,0.12)" strokeDasharray="2 5" />
            <circle cx="270" cy="78" r="95" fill="none" stroke="rgba(229,200,143,0.18)" />
            <path
              d="M 165 78 A 105 105 0 0 1 375 78"
              fill="none"
              stroke="rgba(229,200,143,0.35)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <line x1="270" y1="18" x2="270" y2="245" stroke="rgba(229,200,143,0.16)" strokeDasharray="3 3" />

            {/* Degree Scale Labels */}
            <text x="160" y="68" className="svg-dial-tick">-10000</text>
            <text x="270" y="24" textAnchor="middle" className="svg-dial-tick">5000 BPS EQUILIBRIUM</text>
            <text x="380" y="68" textAnchor="end" className="svg-dial-tick">+10000</text>

            {/* Stepped Brass Pedestal & Central Pillar */}
            <rect x="180" y="244" width="180" height="10" rx="2" fill="url(#brassGrad)" />
            <rect x="208" y="234" width="124" height="10" rx="1" fill="#5c4726" />
            <path d="M 254 78 L 240 234 L 300 234 L 286 78 Z" fill="url(#brassGrad)" opacity="0.9" />
            <line x1="270" y1="78" x2="270" y2="234" stroke="#151514" strokeWidth="2" />

            {/* Fulcrum Glow */}
            <circle cx="270" cy="78" r="36" fill="url(#fulcrumGlow)" className="idle-pulse-ring" />

            {/* Tilting Precision Beam Group */}
            <g
              style={{
                transform: `rotate(${beamAngleDeg}deg)`,
                transformOrigin: "270px 78px",
                transition: "transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {/* Vernier Needle Pointer */}
              <polygon points="270,30 265,78 275,78" fill="#e0533c" />

              {/* Main Tapered Brass Beam */}
              <polygon
                points="82,78 270,69 458,78 270,87"
                fill="url(#brassGrad)"
                stroke="#151514"
                strokeWidth="1.2"
              />
              {/* Animated Escrow Flow Line Along Beam */}
              <line
                x1="92"
                y1="78"
                x2="448"
                y2="78"
                stroke="#fff6e0"
                strokeWidth="1.5"
                strokeDasharray="6 8"
                className="beam-flow-line"
              />

              {/* Left Hanger Node (Petitioner Refund) */}
              <circle cx="92" cy="78" r="6" fill="#e0533c" stroke="#151514" strokeWidth="1.5" />
              <line x1="92" y1="84" x2="58" y2="162" stroke="#d8c39e" strokeWidth="1.4" strokeDasharray="3 2" />
              <line x1="92" y1="84" x2="126" y2="162" stroke="#d8c39e" strokeWidth="1.4" strokeDasharray="3 2" />
              <line x1="92" y1="84" x2="92" y2="162" stroke="rgba(216,195,158,0.45)" strokeWidth="1" />

              {/* Left Pan Dish & Data Plaque */}
              <path
                d="M 42 162 L 142 162 L 128 178 L 56 178 Z"
                fill="url(#crimsonPan)"
                stroke="#f5e9d3"
                strokeWidth="1"
              />
              <rect x="44" y="184" width="96" height="44" rx="3" fill="rgba(20,19,18,0.9)" stroke="#e0533c" strokeWidth="1" />
              <text x="92" y="202" textAnchor="middle" className="svg-pan-bps">
                {10000 - activeBpsForBeam} BPS
              </text>
              <text x="92" y="218" textAnchor="middle" className="svg-pan-units">
                REFUND: {previewPetitionerUnits}
              </text>

              {/* Right Hanger Node (Respondent Payout) */}
              <circle cx="448" cy="78" r="6" fill="#2ca374" stroke="#151514" strokeWidth="1.5" />
              <line x1="448" y1="84" x2="414" y2="162" stroke="#d8c39e" strokeWidth="1.4" strokeDasharray="3 2" />
              <line x1="448" y1="84" x2="482" y2="162" stroke="#d8c39e" strokeWidth="1.4" strokeDasharray="3 2" />
              <line x1="448" y1="84" x2="448" y2="162" stroke="rgba(216,195,158,0.45)" strokeWidth="1" />

              {/* Right Pan Dish & Data Plaque */}
              <path
                d="M 398 162 L 498 162 L 484 178 L 412 178 Z"
                fill="url(#emeraldPan)"
                stroke="#f5e9d3"
                strokeWidth="1"
              />
              <rect x="400" y="184" width="96" height="44" rx="3" fill="rgba(20,19,18,0.9)" stroke="#2ca374" strokeWidth="1" />
              <text x="448" y="202" textAnchor="middle" className="svg-pan-bps">
                {activeBpsForBeam} BPS
              </text>
              <text x="448" y="218" textAnchor="middle" className="svg-pan-units">
                PAYOUT: {previewRespondentUnits}
              </text>
            </g>

            {/* Central Fulcrum Rosette */}
            <circle cx="270" cy="78" r="14" fill="#151514" stroke="url(#brassGrad)" strokeWidth="3" />
            <circle cx="270" cy="78" r="5" fill="#e0533c" />
          </svg>

          {/* Proportional Liquidity Split Conduit Bar */}
          <div className="split-conduit-wrap">
            <div className="conduit-bar">
              <div
                className="conduit-segment petitioner"
                style={{ width: `${petitionerPct}%` }}
              >
                <span>{petitionerPct}%</span>
              </div>
              <div
                className="conduit-segment respondent"
                style={{ width: `${respondentPct}%` }}
              >
                <span>{respondentPct}%</span>
              </div>
            </div>

            <div className="rig-split-bar">
              <div className="rig-col">
                <span className="rig-label">{t.balanceLeftLabel}</span>
                <strong className="crimson-val">
                  {previewPetitionerUnits} / {currentCase.nominal_deposit} units (
                  {10000 - activeBpsForBeam} bps)
                </strong>
              </div>
              <div className="rig-col right">
                <span className="rig-label">{t.balanceRightLabel}</span>
                <strong className="emerald-val">
                  {previewRespondentUnits} / {currentCase.nominal_deposit} units (
                  {activeBpsForBeam} bps)
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Four-Act Architectural Timeline & Courtroom Amphitheater */}
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
            const isCurrent = idx === currentIdx;
            return (
              <div
                key={step.key}
                className={`act-step ${isDone ? "active" : ""} ${isCurrent ? "current" : ""}`}
              >
                <span className="act-watermark">0{idx + 1}</span>
                <span className="act-num">ACT 0{idx + 1}</span>
                <span className="act-name">{step.label}</span>
              </div>
            );
          })}
        </div>

        {/* Live Telemetry & Consensus Status Ticker */}
        <div className={`tx-feedback-banner status-${txLifecycle.status.toLowerCase()}`}>
          <div className="tx-status-main">
            <span className="status-beacon" />
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

        {/* Courtroom Bench Perspective Selector */}
        <nav className="bench-tabs" aria-label="Courtroom Perspectives">
          {[
            { id: "PETITIONER", code: "BENCH I", label: t.benchPetitioner },
            { id: "RESPONDENT", code: "BENCH II", label: t.benchRespondent },
            { id: "JURY", code: "CHAMBER III", label: t.benchJury },
            { id: "PRECEDENTS", code: "ARCHIVE IV", label: t.benchPrecedents },
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
              <span className="bench-code">{tab.code}</span>
              <span className="bench-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Active Bench Stage Content */}
        <div className="bench-stage-panel">
          {activeBench === "PETITIONER" && (
            <div className="bench-two-col">
              {/* Act I: Create / Lock Charter */}
              <form className="dossier-card paper-stack" onSubmit={handleOpenEscrowCase}>
                <div className="dossier-stamp">PETITIONER FILING · ACT I</div>
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
              <form className="dossier-card paper-stack" onSubmit={handleFileRebuttal}>
                <div className="dossier-stamp crimson">CROSS-EXAMINATION · ACT III</div>
                <h3>
                  {t.act3Title} ({currentCase.case_id})
                </h3>
                <div className="hash-readout">
                  <span className="hash-title">{t.charterHashLabel}</span>
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
            <form className="dossier-card paper-stack" onSubmit={handleFileEvidence}>
              <div className="dossier-stamp emerald">RESPONDENT DOCKET · ACT II</div>
              <h3>
                {t.act2Title} ({currentCase.case_id})
              </h3>
              <p className="dual-source-callout">{t.dualSourceRuleNote}</p>
              {showClerkNotes && (
                <div className="clerk-note">
                  <span className="clerk-pin">✎</span>
                  {t.clerkNoteFailover}
                </div>
              )}

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
              <div className="dossier-card paper-stack">
                <div className="dossier-stamp">EVIDENTIARY RECORD · {currentCase.case_id}</div>
                <h3>
                  {t.act4Title} · {currentCase.case_id}
                </h3>
                <div className="evidence-compare-box">
                  <div className="evidence-block">
                    <span className="block-tag">01 · LOCKED CHARTER ({currentCase.nominal_deposit} UNITS)</span>
                    <p>{currentCase.charter_text}</p>
                  </div>
                  <div className="evidence-block">
                    <span className="block-tag">02 · DUAL-SOURCE VERIFICATION ENDPOINTS</span>
                    <div className="endpoint-row">
                      <span className="ep-badge primary">PRIMARY</span>
                      <a
                        href={currentCase.primary_url}
                        target="_blank"
                        rel="noreferrer"
                        className="source-link"
                      >
                        {currentCase.primary_url || "Not filed yet"}
                      </a>
                    </div>
                    <div className="endpoint-row">
                      <span className="ep-badge backup">BACKUP</span>
                      <a
                        href={currentCase.backup_url}
                        target="_blank"
                        rel="noreferrer"
                        className="source-link"
                      >
                        {currentCase.backup_url || "Not filed yet"}
                      </a>
                    </div>
                  </div>
                  <div className="evidence-block">
                    <span className="block-tag">03 · ADVERSARIAL PLEADINGS</span>
                    <p>
                      <strong>Respondent Defense:</strong> {currentCase.defense_brief || "Pending"}
                    </p>
                    <p>
                      <strong>Petitioner Rebuttal:</strong> {currentCase.rebuttal_brief || "Pending"}{" "}
                      <span className="cite-chip">Cited: {currentCase.cited_precedent_id}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="dossier-card paper-stack">
                <div className="dossier-stamp emerald">TRIBUNAL CONSENSUS BENCH</div>
                <h3>Discrete Integer Basis-Point Tier Selection</h3>
                <p className="card-sub">
                  Validators converge on one of 5 exact integer tiers (`0`, `2500`, `5000`, `7500`,
                  `10000 bps`). Selecting a tier that diverges from `{currentCase.cited_precedent_id}`
                  by `>= 5000 bps` automatically appends a `PRECEDENT_DIVERGENCE_WITNESS`.
                </p>

                <div className="bps-tier-grid" role="radiogroup" aria-label="Basis Point Tiers">
                  {[
                    { bps: 0, pct: "0%", code: "REJECT" },
                    { bps: 2500, pct: "25%", code: "PARTIAL_LOW" },
                    { bps: 5000, pct: "50%", code: "PARTIAL_MID" },
                    { bps: 7500, pct: "75%", code: "PARTIAL_HIGH" },
                    { bps: 10000, pct: "100%", code: "PASS" },
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
                      <span className="bps-pct">{tier.pct}</span>
                      <span className="bps-val">{tier.bps} bps</span>
                      <span className="bps-name">{tier.code}</span>
                    </button>
                  ))}
                </div>

                <div className="ruling-summary-banner">
                  <div className="ruling-verdict-row">
                    <span>VERDICT STATUS:</span>
                    <strong className={`verdict-pill v-${currentCase.verdict_code.toLowerCase()}`}>
                      {currentCase.verdict_code} ({activeBpsForBeam} BPS)
                    </strong>
                  </div>
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
            <div className="precedents-bench dossier-card paper-stack">
              <div className="dossier-stamp">STARE DECISIS · ON-CHAIN CODEX</div>
              <h3>{t.precedentDrawerTitle}</h3>
              <p className="card-sub">{t.precedentDrawerHint}</p>
              {showClerkNotes && (
                <div className="clerk-note">
                  <span className="clerk-pin">✎</span>
                  {t.clerkNoteWitness}
                </div>
              )}

              {/* Technique 3: 3D Fanned Archive Rack + Wax-Sealed Inspection Sheet */}
              <div className="dossier-drawer-grid">
                <div className="dossier-tab-list">
                  {Object.values(courtSnapshot.precedents).map((prec, idx) => (
                    <button
                      key={prec.precedent_id}
                      type="button"
                      className={`dossier-folder-tab ${
                        activePrecedentId === prec.precedent_id ? "open" : ""
                      }`}
                      style={{ "--folder-idx": idx }}
                      onMouseEnter={() => setActivePrecedentId(prec.precedent_id)}
                      onClick={() => {
                        setActivePrecedentId(prec.precedent_id);
                        soundEngine.playPaperRustle();
                      }}
                    >
                      <div className="folder-top-row">
                        <span className="folder-id">{prec.precedent_id}</span>
                        <span className="folder-bps">{prec.payout_bps} BPS</span>
                      </div>
                      <div className="folder-cat">{prec.category}</div>
                      <div className="folder-mini-bar">
                        <span style={{ width: `${Math.round(prec.payout_bps / 100)}%` }} />
                      </div>
                    </button>
                  ))}
                </div>

                {courtSnapshot.precedents[activePrecedentId] && (
                  <div className="dossier-preview-sheet">
                    <div className="wax-seal-emblem" aria-hidden="true">
                      <span>STARE</span>
                      <strong>{courtSnapshot.precedents[activePrecedentId].payout_bps}</strong>
                      <span>BPS</span>
                    </div>
                    <div className="preview-header">
                      <div>
                        <span className="preview-kicker">CODIFIED JUDICIAL PRECEDENT</span>
                        <h4>
                          {courtSnapshot.precedents[activePrecedentId].precedent_id} ·{" "}
                          {courtSnapshot.precedents[activePrecedentId].verdict_code}
                        </h4>
                      </div>
                      <span className="citation-badge">
                        Citations: {courtSnapshot.precedents[activePrecedentId].citations_count}
                      </span>
                    </div>
                    <p className="preview-principle">
                      “{courtSnapshot.precedents[activePrecedentId].principle_summary}”
                    </p>
                    <div className="preview-meta">
                      <div className="meta-box">
                        <span className="meta-lbl">SOURCE CASE</span>
                        <strong>
                          {courtSnapshot.precedents[activePrecedentId].source_case_id}
                        </strong>
                      </div>
                      <div className="meta-box">
                        <span className="meta-lbl">FAULT CLASSIFICATION</span>
                        <strong>{courtSnapshot.precedents[activePrecedentId].fault_code}</strong>
                      </div>
                      <div className="meta-box">
                        <span className="meta-lbl">SETTLEMENT RATIO</span>
                        <strong>
                          {courtSnapshot.precedents[activePrecedentId].payout_bps} / 10000 BPS
                        </strong>
                      </div>
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
          <span className="section-kicker">IMMUTABLE AUDIT TRAIL · ZERO SILENT OVERWRITES</span>
          <h2>{t.witnessLogTitle}</h2>
        </div>
        {courtSnapshot.witnesses.length === 0 ? (
          <div className="empty-witness-box">
            <span className="seal-icon">⚖</span>
            <p className="empty-witness">{t.witnessEmpty}</p>
          </div>
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
          <span className="section-kicker">STUDIONET 61999 · EVOLVING REPUTATION & ESCROW STATE</span>
          <h2>{t.ledgerSectionTitle}</h2>
        </div>
        <div className="ledger-cards-grid">
          {Object.values(courtSnapshot.accounts).map((acct) => {
            const repPct = Math.min(100, Math.round((Number(acct.reputation_score) / 1000) * 100));
            return (
              <div key={acct.party_id} className="party-ledger-card">
                <div className="party-card-top">
                  <span className="party-id-mono">{acct.party_id}</span>
                  <span className="rep-pill">
                    {t.colReputation}: {acct.reputation_score}
                  </span>
                </div>

                {/* Visual Reputation Progress Gauge */}
                <div className="rep-gauge-track" aria-hidden="true">
                  <div className="rep-gauge-fill" style={{ width: `${repPct}%` }} />
                </div>

                <div className="party-metrics">
                  <div className="metric-cell">
                    <span className="metric-label">{t.colNominalBal}</span>
                    <strong className="metric-val">{acct.nominal_balance.toLocaleString()}</strong>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-label">{t.colLockedEscrow}</span>
                    <strong className="metric-val">{acct.locked_escrow.toLocaleString()}</strong>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-label">{t.colCasesWon}</span>
                    <strong className="metric-val">
                      {acct.rulings_won} / {acct.cases_participated}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
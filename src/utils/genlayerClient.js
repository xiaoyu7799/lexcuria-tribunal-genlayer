import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

export const STUDIONET_CHAIN_ID = 61999;
export const STUDIONET_CHAIN_HEX = "0xF22F";
export const STUDIONET_RPC_URL = "https://studio.genlayer.com/api";

// Initial fictional court state mirroring contracts/lexcuria_court.py
export const INITIAL_COURT_SNAPSHOT = {
  network_notice:
    "GenLayer Stable Studionet (Chain ID 61999) - Nominal accounting units only, zero real asset transfer.",
  case_counter: 1,
  precedent_counter: 1,
  witness_counter: 0,
  cases: {
    "CASE-001": {
      case_id: "CASE-001",
      title: "Fictional Milestone #42: Open-Source Specification & Dual-Mirror Delivery",
      category: "PROTOCOL_SPEC_AUDIT",
      petitioner_id: "petitioner_atlas_dao",
      respondent_id: "respondent_atelier_nova",
      nominal_deposit: 10000,
      charter_text:
        "Clause 1: Deliver open-source specification repository with public README. Clause 2: Include deterministic benchmark section and dual-source verification notes.",
      charter_sha256: "9f440c054956d45daa7fedb865f7629c19151d136d6b5cdc13903c9f9444fbf7",
      stage: "CROSS_EXAMINED",
      primary_url: "https://raw.githubusercontent.com/octocat/Spoon-Knife/main/README.md",
      backup_url: "https://cdn.jsdelivr.net/gh/octocat/Spoon-Knife@main/README.md",
      defense_brief:
        "Repository README and public metadata are live and verifiable at both primary and backup URLs. Core milestone structure is complete; minor telemetry appendix was deferred by mutual note.",
      rebuttal_brief:
        "Primary repository is reachable, but Clause 2 telemetry benchmark table is abbreviated. Requesting partial deduction under Precedent PREC-001.",
      disputed_clause_code: "CLAUSE_2_BENCHMARK_DEPTH",
      cited_precedent_id: "PREC-001",
      verdict_code: "PENDING",
      payout_bps: 0,
      respondent_payout: 0,
      petitioner_refund: 0,
      evidence_source_used: "UNRESOLVED",
      evidence_sha256: "",
      fault_code: "PENDING",
      ruling_rationale: "Awaiting validator courtroom consensus on Studionet (61999).",
      recorded_precedent_id: "",
      witness_ids: [],
    },
  },
  precedents: {
    "PREC-001": {
      precedent_id: "PREC-001",
      source_case_id: "CASE-GENESIS-000",
      category: "PROTOCOL_SPEC_AUDIT",
      evidence_tier: "VERIFIED_PUBLIC_REPO",
      verdict_code: "PARTIAL_HIGH",
      payout_bps: 7500,
      fault_code: "MINOR_DOC_OMISSION",
      principle_summary:
        "When core technical artifacts are verifiable at the primary repository URL but secondary appendix formatting is incomplete, award 7500 bps to Respondent and refund 2500 bps to Petitioner.",
      citations_count: 1,
    },
  },
  accounts: {
    petitioner_atlas_dao: {
      party_id: "petitioner_atlas_dao",
      nominal_balance: 42000,
      locked_escrow: 18000,
      reputation_score: 820,
      cases_participated: 2,
      rulings_won: 0,
    },
    respondent_atelier_nova: {
      party_id: "respondent_atelier_nova",
      nominal_balance: 20000,
      locked_escrow: 0,
      reputation_score: 840,
      cases_participated: 2,
      rulings_won: 1,
    },
    juror_pool_studionet: {
      party_id: "juror_pool_studionet",
      nominal_balance: 0,
      locked_escrow: 0,
      reputation_score: 900,
      cases_participated: 1,
      rulings_won: 1,
    },
  },
  witnesses: [],
};

// In-memory session ephemeral account (key never leaves browser, discarded on tab close)
let sessionEphemeralAccount = null;

export function getOrCreateEphemeralAccount() {
  if (!sessionEphemeralAccount) {
    sessionEphemeralAccount = createAccount();
  }
  return sessionEphemeralAccount;
}

export function detectInjectedProvider() {
  if (typeof window === "undefined") return null;
  if (window.okxwallet) {
    return { provider: window.okxwallet, walletName: "OKX Wallet" };
  }
  if (window.ethereum) {
    const isRabby = Boolean(window.ethereum.isRabby);
    const isCoinbase = Boolean(window.ethereum.isCoinbaseWallet);
    const walletName = isRabby
      ? "Rabby Wallet"
      : isCoinbase
      ? "Coinbase Wallet"
      : "Injected EVM Wallet";
    return { provider: window.ethereum, walletName };
  }
  return null;
}

export async function connectInjectedWallet() {
  const detected = detectInjectedProvider();
  if (!detected) {
    const ephemeral = getOrCreateEphemeralAccount();
    return {
      mode: "EPHEMERAL_FALLBACK",
      walletName: "Browser Ephemeral Test Signer",
      address: ephemeral.address,
      chainId: STUDIONET_CHAIN_ID,
      notice:
        "No injected EVM wallet detected. Activated in-browser ephemeral test account for Studionet (61999) interactions.",
    };
  }

  const { provider, walletName } = detected;
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = accounts?.[0] || "";

  let currentChainHex = await provider.request({ method: "eth_chainId" });
  let currentChainId = parseInt(currentChainHex, 16);

  if (currentChainId !== STUDIONET_CHAIN_ID) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: STUDIONET_CHAIN_HEX }],
      });
      currentChainId = STUDIONET_CHAIN_ID;
    } catch (switchErr) {
      if (switchErr?.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: STUDIONET_CHAIN_HEX,
              chainName: "GenLayer Stable Studionet",
              nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
              rpcUrls: [STUDIONET_RPC_URL],
            },
          ],
        });
        currentChainId = STUDIONET_CHAIN_ID;
      }
    }
  }

  const ephemeral = getOrCreateEphemeralAccount();
  return {
    mode: "INJECTED_WITH_EPHEMERAL_SIGNER",
    walletName,
    address,
    ephemeralSignerAddress: ephemeral.address,
    chainId: currentChainId,
    notice: `${walletName} connected (${address.slice(0, 6)}...${address.slice(
      -4
    )}). Write operations without Snap use the explicitly badged Ephemeral Test Signer (${ephemeral.address.slice(
      0,
      6
    )}...).`,
  };
}

export function createStudionetClient() {
  const ephemeral = getOrCreateEphemeralAccount();
  // genlayer-js 1.1.8: studionet already points to Stable Studionet 61999.
  return createClient({ chain: studionet, account: ephemeral });
}

export async function readCourtSnapshotOnChain(contractAddress, fallbackState) {
  const cleanAddr = (contractAddress || "").trim();
  if (!cleanAddr || !cleanAddr.startsWith("0x") || cleanAddr.length < 10) {
    return {
      source: "LOCAL_SEED_PREVIEW",
      snapshot: fallbackState,
    };
  }
  try {
    const client = createStudionetClient();
    const rawJson = await client.readContract({
      address: cleanAddr,
      functionName: "get_court_snapshot",
      args: [],
    });
    const parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
    return {
      source: "STUDIONET_61999_LIVE",
      snapshot: parsed,
    };
  } catch (err) {
    return {
      source: "LOCAL_SEED_PREVIEW",
      snapshot: fallbackState,
      warning: `Studionet read fallback (${err?.message || "RPC unreachable"})`,
    };
  }
}

export async function executeCourtWriteTransaction({
  contractAddress,
  functionName,
  args,
  onStageChange,
}) {
  const cleanAddr = (contractAddress || "").trim();
  const ephemeral = getOrCreateEphemeralAccount();

  onStageChange?.({
    status: "REQUESTED",
    signerAddress: ephemeral.address,
    txHash: "",
  });

  if (cleanAddr && cleanAddr.startsWith("0x") && cleanAddr.length >= 10) {
    const client = createStudionetClient();
    const txHash = await client.writeContract({
      address: cleanAddr,
      functionName,
      args,
      value: 0n,
    });
    onStageChange?.({
      status: "PENDING_CONSENSUS",
      signerAddress: ephemeral.address,
      txHash,
    });
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      status: "FINALIZED",
      retries: 40,
      interval: 4000,
    });
    onStageChange?.({
      status: "FINALIZED",
      signerAddress: ephemeral.address,
      txHash,
      receipt,
    });
    return { mode: "ONCHAIN_STUDIONET", txHash, receipt, signerAddress: ephemeral.address };
  }

  // No contract address configured: do NOT simulate a transaction.
  // Previously this path generated a fake hash and reported FINALIZED.
  // Now it throws, so the UI shows ABORTED / not-configured instead of a
  // fabricated FINALIZED receipt. Writes require a deployed contract.
  throw new Error(
    "CONTRACT_NOT_CONFIGURED: No VITE_LEXCURIA_CONTRACT_ADDRESS is set. No transaction was sent and nothing was FINALIZED. This is a local preview only, not on-chain."
  );
}

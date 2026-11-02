#!/usr/bin/env node
/**
 * LexCuria Deployment & Transaction Resume Script for GenLayer Stable Studionet
 * - Strictly enforces Chain ID 61999 and RPC https://studio.genlayer.com/api
 * - Enforces gas = 0 (zero cash cost on Studionet)
 * - Supports interrupted transaction polling via --tx-hash=0x... or LEXCURIA_RESUME_TX_HASH
 * - Ephemeral account generated in-memory only; private key is NEVER written to disk.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_CHAIN_ID = 61999;
const EXPECTED_RPC_URL = "https://studio.genlayer.com/api";

function parseResumeTxHash() {
  const cliArg = process.argv.find((arg) => arg.startsWith("--tx-hash="));
  if (cliArg) {
    return cliArg.split("=")[1]?.trim() || "";
  }
  return (process.env.LEXCURIA_RESUME_TX_HASH || "").trim();
}

async function verifyStudionetChainId(rpcUrl) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    }),
  });
  const payload = await response.json();
  const chainIdInt = parseInt(payload.result, 16);
  if (chainIdInt !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `CHAIN_ID_MISMATCH: Expected GenLayer Stable Studionet (${EXPECTED_CHAIN_ID}), got ${chainIdInt}`
    );
  }
  return chainIdInt;
}

async function main() {
  console.log("=== LexCuria Studionet Deployment Utility ===");
  console.log(`Target RPC : ${EXPECTED_RPC_URL}`);
  console.log(`Target Chain: ${EXPECTED_CHAIN_ID} (GenLayer Stable Studionet, gas = 0)`);

  await verifyStudionetChainId(EXPECTED_RPC_URL);

  // Ephemeral account in memory ONLY - never persisted to disk
  const ephemeralAccount = createAccount();
  console.log(`Ephemeral Deployer Address (in-memory only): ${ephemeralAccount.address}`);

  // genlayer-js 1.1.8: studionet chain already points to Stable Studionet
  // (id 61999, https://studio.genlayer.com/api); do not override its rpcUrls.
  const client = createClient({ chain: studionet, account: ephemeralAccount });

  let txHash = parseResumeTxHash();

  if (txHash) {
    console.log(`[RESUME MODE] Re-attaching to existing transaction hash: ${txHash}`);
    console.log("Skipping duplicate deployment broadcast; polling for FINALIZED status...");
  } else {
    const contractPath = path.resolve(__dirname, "../contracts/lexcuria_court.py");
    if (!fs.existsSync(contractPath)) {
      throw new Error(`Contract file missing at ${contractPath}`);
    }
    const contractCode = fs.readFileSync(contractPath, "utf-8");

    console.log("[DEPLOY MODE] Broadcasting LexCuriaCourt to Studionet (61999, gas: 0)...");
    // Studionet is gasless (gas price 0 on the network); 1.1.8 deployContract
    // takes no gas parameter.
    txHash = await client.deployContract({
      code: contractCode,
      args: [],
      leaderOnly: false,
    });
    console.log(`[BROADCAST COMPLETE] Transaction Hash: ${txHash}`);
    console.log(
      `If interrupted, resume without re-sending via:\n  LEXCURIA_RESUME_TX_HASH=${txHash} npm run deploy:studionet`
    );
  }

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: "FINALIZED",
    retries: 60,
    interval: 5000,
  });

  const deployedAddress =
    receipt?.data?.contract_address || receipt?.contract_address || receipt?.to || "CHECK_RECEIPT_JSON";

  console.log("=== DEPLOYMENT RECEIPT RECEIVED ===");
  console.log(`Transaction Hash : ${txHash}`);
  console.log(`Receipt Status   : ${receipt?.status || "UNKNOWN"}`);
  console.log(`Contract Address : ${deployedAddress}`);
}

main().catch((err) => {
  console.error("[DEPLOY SCRIPT ERROR]:", err.message || err);
  process.exit(1);
});

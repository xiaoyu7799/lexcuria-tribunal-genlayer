#!/usr/bin/env python3
"""
LOCAL MOCK TEST SUITE FOR LEXCURIA (NOT ON-CHAIN CONSENSUS RESULTS)
Explicitly labeled per specification:
This test runs against a deterministic local mock of the `genlayer` module to verify
pure-Python SHA-256 vectors, zero-float integer bps math, primary/backup source failover,
retry preservation when both sources fail, and non-overwriting witness generation.
"""

import hashlib
import json
import sys
import types
from pathlib import Path


# ----------------------------------------------------------------------------
# 1. Construct a local mock `genlayer` runtime before importing contract
# ----------------------------------------------------------------------------
mock_gl = types.ModuleType("genlayer")


class _PublicProxy:
    def write(self, fn):
        return fn

    def view(self, fn):
        return fn


class _EqPrincipleProxy:
    def strict_eq(self, fn):
        return fn()


class _ContractBase:
    pass


mock_gl.Contract = _ContractBase
mock_gl.public = _PublicProxy()
mock_gl.eq_principle = _EqPrincipleProxy()
mock_gl.u64 = int
# The contract does `from genlayer import *` and then uses `gl.*`.
# In the real GenLayer runtime that star import brings in `gl`; the mock
# must do the same, otherwise the contract fails with NameError: gl.
mock_gl.gl = mock_gl

# Controllable mock state for web fetches and LLM prompt responses
MOCK_WEB_RESPONSES = {}
MOCK_LLM_RESPONSE = json.dumps(
    {
        "status": "OK",
        "payout_bps": 7500,
        "fault_code": "MINOR_DOC_OMISSION",
        "evidence_tier": "VERIFIED_PUBLIC_REPO",
    }
)


class _MockWebResponse:
    def __init__(self, body):
        self.status = 200
        self.body = body


def _mock_get_webpage(url: str, mode: str = "text") -> str:
    if url in MOCK_WEB_RESPONSES:
        val = MOCK_WEB_RESPONSES[url]
        if isinstance(val, Exception):
            raise val
        return val
    raise RuntimeError(f"Simulated network failure for {url}")


def _mock_exec_prompt(prompt: str, response_format: str = "json"):
    # gl.nondet.exec_prompt with response_format="json" returns a parsed dict
    # in the proven contracts; the mock returns the parsed JSON dict.
    return json.loads(MOCK_LLM_RESPONSE)


class _MockWeb:
    def get(self, url: str):
        if url in MOCK_WEB_RESPONSES:
            val = MOCK_WEB_RESPONSES[url]
            if isinstance(val, Exception):
                raise val
            return _MockWebResponse(val)
        raise RuntimeError(f"Simulated network failure for {url}")


class _MockNondet:
    web = _MockWeb()
    exec_prompt = staticmethod(_mock_exec_prompt)


mock_gl.get_webpage = _mock_get_webpage
mock_gl.exec_prompt = _mock_exec_prompt
mock_gl.nondet = _MockNondet()
sys.modules["genlayer"] = mock_gl

# Import contract under test
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "contracts"))
from lexcuria_court import LexCuriaCourt, _pure_sha256_hex  # noqa: E402


def assert_no_floats(obj, path="root"):
    if isinstance(obj, float):
        raise AssertionError(f"FLOAT_DETECTED at {path}: {obj}")
    if isinstance(obj, dict):
        for k, v in obj.items():
            assert_no_floats(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            assert_no_floats(item, f"{path}[{idx}]")


def run_all_mock_tests():
    print("=== [LOCAL SIMULATION - NOT ON-CHAIN CONSENSUS] Starting LexCuria Mock Tests ===")

    # Test 1: Pure-Python SHA-256 against NIST & stdlib vectors
    test_vectors = [
        "",
        "abc",
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
        "LexCuria Charter Commitment Vector #2026-11",
    ]
    for vec in test_vectors:
        expected = hashlib.sha256(vec.encode("utf-8")).hexdigest()
        actual = _pure_sha256_hex(vec)
        assert actual == expected, f"SHA-256 mismatch for {vec!r}: {actual} != {expected}"
    print("[PASS] Test 1: Pure-Python SHA-256 matches stdlib hashlib across all test vectors.")

    # Test 2: Full 4-Act lifecycle + Charter Tamper Witness (non-overwriting)
    court = LexCuriaCourt()
    case_id = court.open_escrow_case(
        title="Fictional Spec Audit #02: Zero-Float Telemetry Schema",
        category="PROTOCOL_SPEC_AUDIT",
        petitioner_id="petitioner_atlas_dao",
        respondent_id="respondent_atelier_nova",
        nominal_deposit=10000,
        charter_text="Clause A: Provide JSON schema. Clause B: Provide fallback mirror.",
    )
    assert case_id == "CASE-002"

    court.file_evidence_dossier(
        case_id=case_id,
        primary_url="https://raw.githubusercontent.com/octocat/Spoon-Knife/main/README.md",
        backup_url="https://cdn.jsdelivr.net/gh/octocat/Spoon-Knife@main/README.md",
        defense_brief="Delivered schema and mirror notes at primary and backup endpoints.",
    )

    # Attempt to tamper with the locked charter during cross-examination
    court.file_cross_rebuttal(
        case_id=case_id,
        rebuttal_brief="Mirror notes are present but schema lacks optional appendix.",
        disputed_clause_code="CLAUSE_A_APPENDIX",
        cited_precedent_id="PREC-001",
        asserted_charter_text="TAMPERED CHARTER: Respondent must pay 10x penalty.",
    )

    snap_after_rebuttal = json.loads(court.get_court_snapshot())
    assert snap_after_rebuttal["cases"][case_id]["charter_text"] == (
        "Clause A: Provide JSON schema. Clause B: Provide fallback mirror."
    ), "Locked charter must not be overwritten!"
    assert len(snap_after_rebuttal["witnesses"]) == 1
    assert snap_after_rebuttal["witnesses"][0]["witness_type"] == "CHARTER_TAMPER_WITNESS"
    print("[PASS] Test 2: Charter tamper attempt preserved original charter and recorded CHARTER_TAMPER_WITNESS.")

    # Test 3: Both Primary & Backup sources fail -> raises BEFORE state change, stays CROSS_EXAMINED
    MOCK_WEB_RESPONSES.clear()
    failed_properly = False
    try:
        court.deliberate_and_settle(case_id)
    except Exception as exc:
        if "EXTERNAL_EVIDENCE_UNAVAILABLE" in str(exc):
            failed_properly = True
    assert failed_properly, "Must raise EXTERNAL_EVIDENCE_UNAVAILABLE when both URLs fail"
    snap_after_fail = json.loads(court.get_court_snapshot())
    assert snap_after_fail["cases"][case_id]["stage"] == "CROSS_EXAMINED", (
        "Case must remain CROSS_EXAMINED and retryable when external sources fail"
    )
    print("[PASS] Test 3: Dual-source failure aborted before state write; case remained CROSS_EXAMINED (retryable).")

    # Test 4: Primary fails, Backup succeeds + Divergence Witness when ruling diverges by >= 5000 bps
    MOCK_WEB_RESPONSES["https://raw.githubusercontent.com/octocat/Spoon-Knife/main/README.md"] = RuntimeError("Primary timeout")
    MOCK_WEB_RESPONSES["https://cdn.jsdelivr.net/gh/octocat/Spoon-Knife@main/README.md"] = (
        "Spoon-Knife README mirror: same public specification text as the primary README."
    )
    global MOCK_LLM_RESPONSE
    MOCK_LLM_RESPONSE = json.dumps(
        {
            "status": "OK",
            "payout_bps": 0,  # Diverges from PREC-001 (7500 bps) by 7500 bps >= 5000 bps
            "fault_code": "MATERIAL_BREACH",
            "evidence_tier": "VERIFIED_PUBLIC_REPO",
        }
    )

    new_prec_id = court.deliberate_and_settle(case_id)
    assert new_prec_id == "PREC-002"

    final_snap = json.loads(court.get_court_snapshot())
    assert_no_floats(final_snap)
    settled_case = final_snap["cases"][case_id]
    assert settled_case["stage"] == "SETTLED"
    assert settled_case["payout_bps"] == 0
    assert settled_case["respondent_payout"] == 0
    assert settled_case["petitioner_refund"] == 10000
    assert final_snap["precedents"]["PREC-001"]["payout_bps"] == 7500, "Historical precedent PREC-001 must not be overwritten"
    witness_types = [w["witness_type"] for w in final_snap["witnesses"]]
    assert "PRECEDENT_DIVERGENCE_WITNESS" in witness_types
    print("[PASS] Test 4: Backup failover succeeded, integer escrow split settled, PRECEDENT_DIVERGENCE_WITNESS recorded, zero floats verified.")
    # Test 5: Primary succeeds -> settle succeeds with integer split (fresh court)
    court2 = LexCuriaCourt()
    case2 = court2.open_escrow_case(
        title="Fictional Spec Audit #03: Primary Mirror Settle",
        category="PROTOCOL_SPEC_AUDIT",
        petitioner_id="petitioner_atlas_dao",
        respondent_id="respondent_atelier_nova",
        nominal_deposit=10000,
        charter_text="Clause A: Provide JSON schema. Clause B: Provide fallback mirror.",
    )
    court2.file_evidence_dossier(
        case_id=case2,
        primary_url="https://raw.githubusercontent.com/octocat/Spoon-Knife/main/README.md",
        backup_url="https://cdn.jsdelivr.net/gh/octocat/Spoon-Knife@main/README.md",
        defense_brief="Delivered schema and mirror notes at primary endpoint.",
    )
    court2.file_cross_rebuttal(
        case_id=case2,
        rebuttal_brief="Appendix abbreviated; partial deduction requested.",
        disputed_clause_code="CLAUSE_A_APPENDIX",
        cited_precedent_id="PREC-001",
        asserted_charter_text="",
    )
    MOCK_WEB_RESPONSES.clear()
    MOCK_WEB_RESPONSES["https://raw.githubusercontent.com/octocat/Spoon-Knife/main/README.md"] = (
        "Spoon-Knife README: public specification text, verifiable at primary URL."
    )
    MOCK_LLM_RESPONSE = json.dumps(
        {
            "status": "OK",
            "payout_bps": 7500,
            "fault_code": "MINOR_DOC_OMISSION",
            "evidence_tier": "VERIFIED_PUBLIC_REPO",
        }
    )
    prec2 = court2.deliberate_and_settle(case2)
    assert prec2 == "PREC-002"
    snap2 = json.loads(court2.get_court_snapshot())
    assert snap2["cases"][case2]["stage"] == "SETTLED"
    assert snap2["cases"][case2]["payout_bps"] == 7500
    assert snap2["cases"][case2]["respondent_payout"] == 7500
    assert snap2["cases"][case2]["petitioner_refund"] == 2500
    assert snap2["cases"][case2]["respondent_payout"] + snap2["cases"][case2]["petitioner_refund"] == 10000
    assert_no_floats(snap2)
    print("[PASS] Test 5: Primary-ok settle succeeded, integer split 7500/2500, PREC-002 minted, zero floats verified.")
    print("=== [LOCAL SIMULATION COMPLETE - ALL 5 TEST SUITES PASSED] ===")


if __name__ == "__main__":
    run_all_mock_tests()

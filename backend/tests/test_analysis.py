"""Missing information, contradictions, redaction and incident report.

Run from backend/:  python -m pytest   (or: python -m unittest discover -s tests -v)
Every test uses a throwaway data directory; the real backend/data is never touched.
"""

import asyncio
import hashlib
import io
import json
import re
import sys
import unittest
from pathlib import Path

from fastapi import UploadFile
from fastapi.testclient import TestClient

import test_ocr
import test_timeline
from app import derived_store, extraction_store, store
from app.main import app
from app.routers.analysis import (
    generate_report,
    get_contradictions,
    get_missing_info,
    get_redacted_evidence,
    get_report,
    run_contradictions,
    run_missing_info,
    run_redactions,
)
from app.routers.evidence import upload_evidence
from app.routers.extraction import extract_evidence, run_all
from app.routers.timeline import run_timeline

sys.path.insert(0, str(Path(__file__).parent / "fixtures"))
from case_set import build_case  # noqa: E402
from make_fixtures import PHISHING_LINES  # noqa: E402

PHISHING_TEXT = "\n".join(PHISHING_LINES)
PHISHING_PNG = Path(__file__).parent / "fixtures" / "phishing_screenshot.png"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class CaseTest(unittest.TestCase):
    setUp = test_timeline.TimelineTest.setUp
    tearDown = test_ocr.OcrTest.tearDown

    def upload(self, *files: tuple[str, bytes]) -> list[str]:
        response = asyncio.run(upload_evidence([UploadFile(file=io.BytesIO(b), filename=n) for n, b in files]))
        self.assertEqual(response.rejected, [])
        return [e.id for e in response.created]

    def analyze(self, text: str, name: str = "note.txt") -> str:
        (ev,) = self.upload((name, text.encode("utf-8")))
        extract_evidence(ev)
        return ev

    def claims(self) -> dict:
        return {c.id: c for r in extraction_store.list_all() for c in r.claims}


# ---------------------------------------------------------------------------
# 03 Missing information
# ---------------------------------------------------------------------------


class MissingInfoTest(CaseTest):
    def by_category(self, report, category):
        return [i for i in report.items if i.category == category]

    def test_phishing_unresolved_date_is_a_gap_not_a_normalized_date(self):
        ev = self.analyze(PHISHING_TEXT)
        timeline = run_timeline()
        report = run_missing_info()

        (item,) = self.by_category(report, "unresolved_date")
        self.assertEqual(item.severity, "high")
        self.assertEqual(item.status, "open")
        self.assertEqual(item.source_evidence_ids, [ev])
        self.assertIn("27/09/2026", item.description)
        self.assertIn("27/09/2026", item.supporting_text)
        claim = self.claims()[item.source_claim_ids[0]]
        self.assertEqual(claim.claim, item.supporting_text)
        event = next(e for e in timeline.events if claim.id in e.source_claim_ids)
        self.assertEqual(item.timeline_event_ids, [event.id])
        self.assertIsNone(event.date)  # still not normalized anywhere
        self.assertNotIn("2026-09-27", json.dumps(report.model_dump(mode="json")))  # never invented

    def test_phishing_relative_time_and_undated_times(self):
        self.analyze(PHISHING_TEXT)
        report = run_missing_info()
        unplaced = self.by_category(report, "unplaced_event")
        self.assertEqual([i.supporting_text for i in unplaced], ["The sender later claimed that no payment had been requested."])
        dateless = {i.supporting_text.split(",")[0] for i in self.by_category(report, "missing_date")}
        self.assertEqual(dateless, {"At 10:42 AM", "At 10:55 AM", "At 11:00 AM"})
        # the sender is never identified by phone/email in this evidence
        self.assertEqual(len(self.by_category(report, "unidentified_actor")), 1)
        # a transaction ID is stated, so none is reported missing
        self.assertEqual(self.by_category(report, "missing_transaction_id"), [])

    def test_each_category(self):
        self.analyze("Rs 900 was sent to the caller.", "a.txt")  # amount, no timestamp, no txn, unknown actor
        self.analyze("At 16:20 a payment of 5,000 was made.", "b.txt")  # bare number -> missing currency
        self.analyze("Afterwards I transferred the money.", "c.txt")  # relative time, no amount
        self.analyze("On 12 September 2026 Rs 300 was debited, UTR 412345678901.", "d.txt")  # no time
        self.upload(("legacy.doc", b"\xd0\xcf\x11\xe0 legacy"))  # unreadable
        extract_evidence("EV-005")
        self.upload(("pending.txt", b"never analyzed"))  # not analyzed
        report = run_missing_info()
        got = {(i.category, i.source_evidence_ids[0]) for i in report.items}
        for expected in [
            ("missing_timestamp", "EV-001"),
            ("missing_transaction_id", "EV-001"),
            ("unidentified_actor", "EV-001"),
            ("missing_currency", "EV-002"),
            ("missing_date", "EV-002"),
            ("unplaced_event", "EV-003"),
            ("missing_amount", "EV-003"),
            ("missing_time", "EV-004"),
            ("unreadable_evidence", "EV-005"),
            ("not_analyzed", "EV-006"),
        ]:
            self.assertIn(expected, got)
        currency = next(i for i in report.items if i.category == "missing_currency")
        self.assertIn("'5,000'", currency.description)
        self.assertEqual([i.severity for i in report.items], sorted((i.severity for i in report.items), key=["high", "medium", "low"].index))

    def test_complete_statement_has_no_gaps(self):
        self.analyze("On 2026-09-27 10:55 Rs 500 was debited, UTR 412345678901, sent to +91 98765 43210.")
        report = run_missing_info()
        self.assertEqual(report.status, "empty")
        self.assertEqual(report.items, [])

    def test_ids_stable_and_every_item_sourced(self):
        self.analyze(PHISHING_TEXT)
        first = run_missing_info()
        second = run_missing_info()
        self.assertEqual([(i.id, i.description) for i in first.items], [(i.id, i.description) for i in second.items])
        self.analyze("Rs 900 was sent to the caller.")
        third = {i.description + i.source_evidence_ids[0] + ",".join(i.source_claim_ids): i.id for i in run_missing_info().items}
        for i in first.items:
            self.assertEqual(third[i.description + i.source_evidence_ids[0] + ",".join(i.source_claim_ids)], i.id)
        texts = {r.evidence_id: r.extracted_text for r in extraction_store.list_all()}
        for i in first.items:
            self.assertTrue(i.id.startswith("MI-"))
            self.assertTrue(i.source_evidence_ids)
            if i.supporting_text:
                self.assertIn(i.supporting_text, texts[i.source_evidence_ids[0]])


# ---------------------------------------------------------------------------
# 04 Contradictions
# ---------------------------------------------------------------------------


class ContradictionTest(CaseTest):
    def test_phishing_payment_requested_vs_denied(self):
        ev = self.analyze(PHISHING_TEXT)
        report = run_contradictions()
        (c,) = report.contradictions
        self.assertEqual(c.type, "affirmed_vs_denied")
        self.assertEqual(c.status, "unresolved")
        self.assertIn("another payment of ₹10,000 was requested", c.claim_a.text)
        self.assertIn("no payment had been requested", c.claim_b.text)
        self.assertEqual((c.claim_a.evidence_id, c.claim_b.evidence_id), (ev, ev))
        claims = self.claims()
        for side in (c.claim_a, c.claim_b):
            self.assertEqual(claims[side.claim_id].claim, side.text)
            self.assertIn(side.claim_id, c.explanation)
        self.assertIn("neither is treated as correct", c.explanation)

    def test_denial_is_now_a_claim(self):
        self.analyze(PHISHING_TEXT)
        texts = [c.claim for c in self.claims().values()]
        self.assertIn("The sender later claimed that no payment had been requested.", texts)

    def assert_one(self, kind: str, a_fragment: str, b_fragment: str):
        found = [c for c in run_contradictions().contradictions if c.type == kind]
        self.assertEqual(len(found), 1, found)
        texts = {found[0].claim_a.text, found[0].claim_b.text}
        self.assertTrue(any(a_fragment in t for t in texts) and any(b_fragment in t for t in texts))
        return found[0]

    def test_conflicting_amount_same_transaction_across_evidence(self):
        a = self.analyze("At 10:55 AM ₹25,000 was debited, UTR 412345678901.")
        b = self.analyze("Rs 52,000 debited on 2026-09-27 10:55, UTR 412345678901.")
        c = self.assert_one("conflicting_amount", "₹25,000", "Rs 52,000")
        self.assertEqual({c.claim_a.evidence_id, c.claim_b.evidence_id}, {a, b})
        self.assertIn("412345678901", c.explanation)

    def test_conflicting_date_time_actor_same_transaction(self):
        self.analyze("On 2026-09-27 Rs 500 was sent to +91 98765 43210, UTR 412345678901.")
        self.analyze("On 2026-09-28 Rs 500 was sent to +91 91234 56789, UTR 412345678901.")
        self.assert_one("conflicting_date", "2026-09-27", "2026-09-28")
        self.assert_one("conflicting_actor", "98765", "91234")
        self.assertEqual([c for c in run_contradictions().contradictions if c.type == "conflicting_amount"], [])

    def test_conflicting_time_same_wording(self):
        self.analyze("At 10:55 AM ₹500 was debited from my account.")
        self.analyze("At 11:15 AM ₹500 was debited from my account.")
        self.assert_one("conflicting_time", "10:55", "11:15")

    def test_conflicting_transaction_id_same_wording(self):
        self.analyze("At 10:55 AM ₹500 was debited, reference REF778812.")
        self.analyze("At 10:55 AM ₹500 was debited, reference REF991100.")
        self.assert_one("conflicting_transaction_id", "REF778812", "REF991100")

    def test_unrelated_statements_are_not_contradictions(self):
        self.analyze("At 10:55 AM ₹500 was debited, UTR 412345678901.\nAt 11:30 AM ₹900 was debited, UTR 498765432109.")
        self.analyze("The caller asked me to share the OTP.\nI did not share my OTP.")  # request is not an act
        self.analyze("Transaction ID: TXN11111.\nTransaction ID: TXN22222.")  # two IDs, nothing else to anchor
        report = run_contradictions()
        self.assertEqual(report.contradictions, [])
        self.assertEqual(report.status, "empty")

    def test_ids_stable_across_runs_and_new_evidence(self):
        self.analyze(PHISHING_TEXT)
        first = run_contradictions().contradictions
        self.analyze("At 10:55 AM ₹25,000 was debited, UTR 412345678901.")
        self.analyze("Rs 52,000 debited on 2026-09-27 10:55, UTR 412345678901.")
        second = {(c.claim_a.claim_id, c.claim_b.claim_id, c.type): c.id for c in run_contradictions().contradictions}
        for c in first:
            self.assertEqual(second[(c.claim_a.claim_id, c.claim_b.claim_id, c.type)], c.id)
        self.assertEqual(len(second), 2)


# ---------------------------------------------------------------------------
# 05 Redaction
# ---------------------------------------------------------------------------

PII_TEXT = (
    "Name: Ravi Kumar\n"
    "Address: 12 MG Road, Bengaluru 560001\n"
    "Mr. Anil Sharma called from +91 98765 43210 and wrote from fraud@evil.example.com.\n"
    "He wrote again from fraud@evil.example.com and asked me to pay scammer@okaxis.\n"
    "Card 4111 1111 1111 1111 and A/c No: 123456789012 were used. Aadhaar 1234 5678 9012.\n"
    "At 10:55 AM ₹25,000 was debited, Transaction ID: TXN12345, see https://bank.example.com/v?u=9876543210."
)
PII_VALUES = [
    "Ravi Kumar", "12 MG Road", "Anil Sharma", "98765 43210", "fraud@evil.example.com", "scammer@okaxis",
    "4111 1111 1111 1111", "123456789012", "1234 5678 9012", "TXN12345", "9876543210",
]


class RedactionTest(CaseTest):
    def test_masks_every_identifier_and_keeps_structure(self):
        ev = self.analyze(PII_TEXT)
        item = next(i for i in run_redactions().items if i.evidence_id == ev)
        self.assertEqual(item.status, "redacted")
        for value in PII_VALUES:
            self.assertNotIn(value, item.redacted_text)
            for claim in item.claims:
                self.assertNotIn(value, claim.text)
        for placeholder in (
            "[REDACTED_NAME]", "[REDACTED_ADDRESS]", "[REDACTED_PHONE]", "[REDACTED_EMAIL]", "[REDACTED_UPI]",
            "[REDACTED_CARD]", "[REDACTED_ACCOUNT]", "[REDACTED_GOVERNMENT_ID]", "[REDACTED_TRANSACTION_ID]",
        ):
            self.assertIn(placeholder, item.redacted_text)
        self.assertEqual(item.redacted_text.count("[REDACTED_EMAIL]"), 2)  # every occurrence, not just the first
        # structure an investigator needs is kept
        self.assertEqual(item.redacted_text.count("\n"), PII_TEXT.count("\n"))
        for kept in ("At 10:55 AM ₹25,000 was debited", "https://bank.example.com/v?u=", "Name: ", "A/c No: "):
            self.assertIn(kept, item.redacted_text)
        # masked values are not stored anywhere in the redaction output
        stored = derived_store.redactions.path.read_text(encoding="utf-8")
        for value in PII_VALUES:
            self.assertNotIn(value, stored)

    def test_original_bytes_and_sha256_unchanged(self):
        content = PII_TEXT.encode("utf-8")
        (ev,) = self.upload(("pii.txt", content))
        extract_evidence(ev)
        record = store.get(ev)
        extractions_before = sha(extraction_store.EXTRACTIONS_PATH.read_bytes())
        registry_before = sha(store.REGISTRY_PATH.read_bytes())

        item = next(i for i in run_redactions().items if i.evidence_id == ev)
        generate_report()

        original = (store.UPLOADS_DIR / record.stored_filename).read_bytes()
        self.assertEqual(original, content)
        self.assertEqual(sha(original), record.sha256)
        self.assertEqual(item.source_sha256, record.sha256)
        self.assertEqual(store.get(ev), record)
        self.assertEqual(sha(store.REGISTRY_PATH.read_bytes()), registry_before)
        # the saved extraction still holds the unredacted text; redaction is a separate derivative
        self.assertEqual(sha(extraction_store.EXTRACTIONS_PATH.read_bytes()), extractions_before)
        self.assertEqual(extraction_store.get(ev).extracted_text, PII_TEXT)
        self.assertNotEqual(derived_store.redactions.path, extraction_store.EXTRACTIONS_PATH)

    def test_repeated_redaction_is_deterministic(self):
        self.analyze(PII_TEXT)
        self.analyze(PHISHING_TEXT)
        first = run_redactions()
        second = run_redactions()
        self.assertEqual(
            [i.model_dump() for i in first.items], [i.model_dump() for i in second.items]
        )

    def test_redacted_endpoint_and_unreadable_evidence(self):
        ev = self.analyze(PII_TEXT)
        with self.assertRaises(Exception):
            get_redacted_evidence(ev)  # nothing generated yet
        self.upload(("legacy.doc", b"\xd0\xcf\x11\xe0 legacy"))
        extract_evidence("EV-002")
        run_redactions()
        self.assertEqual(get_redacted_evidence(ev).status, "redacted")
        self.assertEqual(get_redacted_evidence("EV-002").status, "unavailable")


# ---------------------------------------------------------------------------
# 06 Incident report
# ---------------------------------------------------------------------------


class ReportTest(CaseTest):
    def section(self, report, key):
        return next(s for s in report.sections if s.key == key)

    def assert_traceable(self, report):
        claims = self.claims()
        texts = {r.evidence_id: r.extracted_text for r in extraction_store.list_all()}
        evidence_ids = {e.id for e in store.list_all()}
        for section in report.sections:
            for st in section.statements:
                self.assertTrue(set(st.evidence_ids) <= evidence_ids, st.text)
                self.assertTrue(set(st.claim_ids) <= set(claims), st.text)
        for st in self.section(report, "claims").statements:
            for cid in st.claim_ids:
                self.assertIn(claims[cid].source_evidence_ids[0], st.evidence_ids)
            for quoted in re.findall(r"“(.*?)”", st.text):
                self.assertTrue(any(quoted in t for t in texts.values()), quoted)  # verbatim from the evidence
        # every claim is quoted or referenced on the timeline or in the claims section
        listed = {c for key in ("timeline", "claims") for st in self.section(report, key).statements for c in st.claim_ids}
        self.assertEqual(listed, set(claims))
        items = {i.id for i in get_missing_info().items} | {c.id for c in get_contradictions().contradictions}
        for section in report.sections:
            for st in section.statements:
                self.assertTrue(set(st.item_ids) <= items, st.text)

    def test_report_from_text_and_ocr_screenshot(self):
        (txt, png) = self.upload(("phishing.txt", PHISHING_TEXT.encode()), ("phishing.png", PHISHING_PNG.read_bytes()))
        run_all()
        report = generate_report()

        self.assertEqual(report.status, "ready")
        self.assertEqual(
            [s.key for s in report.sections],
            ["summary", "evidence", "timeline", "claims", "missing", "contradictions", "redaction", "limitations"],
        )
        self.assert_traceable(report)
        claims_by_ev = {ev for st in self.section(report, "claims").statements for ev in st.evidence_ids}
        self.assertEqual(claims_by_ev, {txt, png})  # both TXT and OCR claims are in the report
        inventory = " ".join(st.text for st in self.section(report, "evidence").statements)
        self.assertIn("· ocr,", inventory)
        self.assertIn("· plain_text,", inventory)
        # timeline, gaps and contradictions all carry OCR-derived items
        self.assertTrue(any(png in st.evidence_ids for st in self.section(report, "timeline").statements))
        self.assertTrue(any(png in st.evidence_ids for st in self.section(report, "missing").statements))
        self.assertTrue(any(png in st.evidence_ids for st in self.section(report, "contradictions").statements))
        integrity = self.section(report, "redaction").statements
        self.assertIn("2 of 2 match their registered SHA-256", integrity[0].text)
        self.assertEqual(integrity[0].evidence_ids, [txt, png])
        # the text file and the OCR copy of the same statements are one contradiction, not four
        (conflict,) = get_contradictions().contradictions
        self.assertEqual({r.evidence_id for r in conflict.claims_a}, {txt, png})
        self.assertEqual({r.evidence_id for r in conflict.claims_b}, {txt, png})
        limitations = " ".join(st.text for st in self.section(report, "limitations").statements)
        self.assertIn("OCR", limitations)
        self.assertIn("not resolved", limitations)

    def test_redacted_report_and_markdown(self):
        self.analyze(PII_TEXT)
        generate_report()
        plain, redacted = get_report(False), get_report(True)
        self.assertFalse(plain.redacted)
        self.assertTrue(redacted.redacted)
        dump = json.dumps(redacted.model_dump(mode="json"), ensure_ascii=False)
        for value in PII_VALUES:
            self.assertNotIn(value, dump)
        self.assertIn("[REDACTED_TRANSACTION_ID]", dump)
        self.assertIn("TXN12345", json.dumps(plain.model_dump(mode="json")))
        # same structure and references, only the wording is masked
        self.assertEqual(
            [[(st.evidence_ids, st.claim_ids) for st in s.statements] for s in plain.sections],
            [[(st.evidence_ids, st.claim_ids) for st in s.statements] for s in redacted.sections],
        )

    def test_report_states_pending_and_is_reproducible(self):
        self.assertEqual(get_report().status, "pending")
        self.assertEqual(generate_report().status, "pending")
        self.analyze(PHISHING_TEXT)
        first, second = generate_report(), generate_report()
        strip = lambda r: [s.model_dump() for s in r.sections]  # noqa: E731
        self.assertEqual(strip(first), strip(second))


# ---------------------------------------------------------------------------
# HTTP API + ~50-evidence integration
# ---------------------------------------------------------------------------


class ApiIntegrationTest(CaseTest):
    def setUp(self):
        super().setUp()
        self.client = TestClient(app)

    def test_endpoints_before_any_data(self):
        for path in ("/api/missing-info", "/api/contradictions", "/api/redactions", "/api/report"):
            r = self.client.get(path)
            self.assertEqual(r.status_code, 200, path)
            self.assertEqual(r.json()["status"], "pending")
        self.assertEqual(self.client.get("/api/report/markdown").status_code, 404)
        self.assertEqual(self.client.get("/api/evidence/EV-999/redacted").status_code, 404)


    def run_scenario(self, files):
        """Full pipeline over HTTP: upload -> extraction/OCR -> report (timeline, gaps, contradictions, redaction)."""
        r = self.client.post("/api/evidence/upload", files=[("files", (n, b)) for n, b in files])
        self.assertEqual(r.status_code, 201, r.text)
        created = r.json()["created"]
        self.assertEqual(len(created), len(files))
        extracted = self.client.post("/api/extraction/run")
        self.assertEqual(extracted.status_code, 200)
        report = self.client.post("/api/report/generate")
        self.assertEqual(report.status_code, 200, report.text)
        get = lambda p: self.client.get(p).json()  # noqa: E731
        return {
            "created": created,
            "extractions": get("/api/extractions"),
            "timeline": get("/api/timeline"),
            "missing": get("/api/missing-info"),
            "contradictions": get("/api/contradictions"),
            "redactions": get("/api/redactions"),
            "report": report.json(),
            "report_redacted": get("/api/report?redacted=true"),
            "markdown": self.client.get("/api/report/markdown").text,
            "markdown_redacted": self.client.get("/api/report/markdown?redacted=true").text,
        }

    @staticmethod
    def comparable(run):
        """Everything except wall-clock timestamps."""
        drop = {"generated_at", "extracted_at", "uploaded_at"}

        def strip(x):
            if isinstance(x, dict):
                return {k: strip(v) for k, v in x.items() if k not in drop}
            if isinstance(x, list):
                return [strip(v) for v in x]
            return x

        return strip({k: v for k, v in run.items() if not k.startswith("markdown")})

    def test_fifty_evidence_case_end_to_end(self):
        files = build_case(50)
        self.assertEqual(len(files), 50)
        self.assertEqual(sum(n.endswith(".png") for n, _ in files), 1)  # mixed TXT + image (+ unreadable .doc)

        first = self.run_scenario(files)
        # determinism: an independent run from an empty data directory gives identical results
        self.tearDown()
        self.setUp()
        second = self.run_scenario(files)
        self.assertEqual(self.comparable(first), self.comparable(second))
        run = second
        ids = {e["filename"]: e["id"] for e in run["created"]}
        report = run["report"]
        self.assertEqual(report["status"], "ready")
        sections = {s["key"]: s["statements"] for s in report["sections"]}

        # --- originals unchanged, SHA-256 unchanged ---------------------------
        for (name, content), ev in zip(files, run["created"]):
            stored = store.UPLOADS_DIR / ev["stored_filename"]
            self.assertEqual(stored.read_bytes(), content, name)
            self.assertEqual(sha(content), ev["sha256"])
        self.assertEqual(self.client.get("/api/evidence").json(), run["created"])
        self.assertIn("50 of 50 match their registered SHA-256", sections["redaction"][0]["text"])
        self.assertTrue(all(r["source_sha256"] == ev["sha256"] for r, ev in zip(run["redactions"]["items"], run["created"])))

        # --- OCR evidence flows through every stage ------------------------------
        png = ids["phishing_screenshot.png"]
        ocr = next(r for r in run["extractions"] if r["evidence_id"] == png)
        self.assertEqual((ocr["status"], ocr["method"]), ("extracted", "ocr"))
        self.assertIsNotNone(ocr["ocr_raw_text"])
        self.assertTrue(any(png in e["source_evidence_ids"] for e in run["timeline"]["events"]))
        self.assertIn(("unresolved_date", png), {(i["category"], i["source_evidence_ids"][0]) for i in run["missing"]["items"]})
        self.assertTrue(any(png in [r["evidence_id"] for r in c["claims_a"] + c["claims_b"]] for c in run["contradictions"]["contradictions"]))
        self.assertEqual(len(sections["evidence"]), 50)

        # --- all source references valid -----------------------------------------
        evidence_ids = set(ids.values())
        claims = {c["id"]: c for r in run["extractions"] for c in r["claims"]}
        texts = {r["evidence_id"]: r["extracted_text"] for r in run["extractions"]}
        events = {e["id"] for e in run["timeline"]["events"]}
        items = {i["id"] for i in run["missing"]["items"]} | {c["id"] for c in run["contradictions"]["contradictions"]}
        for e in run["timeline"]["events"]:
            self.assertTrue(set(e["source_evidence_ids"]) <= evidence_ids and set(e["source_claim_ids"]) <= set(claims))
        for i in run["missing"]["items"]:
            self.assertTrue(set(i["source_evidence_ids"]) <= evidence_ids)
            self.assertTrue(set(i["source_claim_ids"]) <= set(claims))
            self.assertTrue(set(i["timeline_event_ids"]) <= events)
        for c in run["contradictions"]["contradictions"]:
            for ref in [c["claim_a"], c["claim_b"], *c["claims_a"], *c["claims_b"]]:
                self.assertEqual(claims[ref["claim_id"]]["claim"], ref["text"])
                self.assertEqual(claims[ref["claim_id"]]["source_evidence_ids"], [ref["evidence_id"]])
                self.assertIn(ref["text"], texts[ref["evidence_id"]])
        for s in report["sections"]:
            for st in s["statements"]:
                self.assertTrue(set(st["evidence_ids"]) <= evidence_ids, st["text"])
                self.assertTrue(set(st["claim_ids"]) <= set(claims), st["text"])
                self.assertTrue(set(st["event_ids"]) <= events, st["text"])
                self.assertTrue(set(st["item_ids"]) <= items, st["text"])

        # --- contradictions: exactly the planted ones, each reported once --------
        def members(c):
            return frozenset(r["evidence_id"] for r in c["claims_a"] + c["claims_b"])

        got = sorted((c["type"], sorted(members(c))) for c in run["contradictions"]["contradictions"])
        expected = sorted(
            (kind, sorted(ids[n] for n in names))
            for kind, names in [
                ("affirmed_vs_denied", ["later_note.txt", "phishing_screenshot.png"]),  # payment requested vs denied
                ("affirmed_vs_denied", ["complaint.txt", "followup_statement.txt"]),  # OTP shared vs not
                ("affirmed_vs_denied", ["complaint.txt", "followup_statement.txt"]),  # link clicked vs not
                ("conflicting_amount", ["complaint.txt", "bank_sms.txt"]),  # same UTR, same sentence
                ("conflicting_amount", ["police_note_a.txt", "police_note_b.txt"]),  # same wording
                ("conflicting_amount", ["bank_sms_split.txt", "complaint_followup.txt"]),  # adjacent-sentence link
            ]
        )
        self.assertEqual(got, expected)
        pairs = [
            (c["type"], frozenset((a["claim_id"], b["claim_id"])))
            for c in run["contradictions"]["contradictions"]
            for a in c["claims_a"]
            for b in c["claims_b"]
        ]
        self.assertEqual(len(pairs), len(set(pairs)))  # no claim pair is reported twice
        ambiguous = {ids["ambiguous_sms.txt"], ids["ambiguous_followup.txt"]}
        self.assertFalse(any(members(c) & ambiguous for c in run["contradictions"]["contradictions"]))
        fillers = {ids[n] for n, _ in files if n.startswith("bank_alert_")}
        self.assertFalse(any(members(c) & fillers for c in run["contradictions"]["contradictions"]))

        # --- gaps ------------------------------------------------------------------
        got_gaps = {(i["category"], i["source_evidence_ids"][0]) for i in run["missing"]["items"]}
        self.assertIn(("unreadable_evidence", ids["legacy_form.doc"]), got_gaps)
        self.assertIn(("unplaced_event", ids["later_note.txt"]), got_gaps)

        # --- redaction ---------------------------------------------------------------
        red = self.client.get(f"/api/evidence/{ids['merchant_email.txt']}/redacted").json()
        for placeholder in ("[REDACTED_EMAIL]", "[REDACTED_NAME]", "[REDACTED_ADDRESS]", "[REDACTED_TRANSACTION_ID]"):
            self.assertIn(placeholder, red["redacted_text"])
        self.assertEqual(len(run["redactions"]["items"]), 50)
        self.assertIn("412345678901", run["markdown"])
        self.assertNotIn("412345678901", run["markdown_redacted"])
        self.assertNotIn("98765 43210", json.dumps(run["report_redacted"], ensure_ascii=False))

        # --- concise report ----------------------------------------------------------
        # the inventory (one line per item) and the timeline (one line per event) are the record itself;
        # everything else is grouped rather than listed per claim / per item
        self.assertEqual(len(sections["timeline"]), len(run["timeline"]["events"]))
        self.assertLessEqual(len(sections["summary"]), 15)
        self.assertLessEqual(len(sections["claims"]), 20)
        self.assertTrue(any("claims with the same wording" in st["text"] for st in sections["claims"]))
        self.assertLessEqual(len(sections["redaction"]), 3)
        self.assertEqual(len(sections["missing"]), len({i["category"] for i in run["missing"]["items"]}))
        self.assertEqual(len(sections["contradictions"]), len(run["contradictions"]["contradictions"]))


# ---------------------------------------------------------------------------
# Quality: dedup, cross-sentence linking, OCR repair
# ---------------------------------------------------------------------------


class QualityTest(CaseTest):
    def test_equivalent_contradictions_are_merged_with_all_references(self):
        evs = [self.analyze(PHISHING_TEXT, f"copy{i}.txt") for i in range(3)]
        (c,) = run_contradictions().contradictions
        self.assertEqual(c.type, "affirmed_vs_denied")
        self.assertEqual([r.evidence_id for r in c.claims_a], evs)
        self.assertEqual([r.evidence_id for r in c.claims_b], evs)
        self.assertEqual((c.claim_a, c.claim_b), (c.claims_a[0], c.claims_b[0]))
        for r in c.claims_a + c.claims_b:
            self.assertIn(r.claim_id, c.explanation)

    def test_same_transaction_conflict_reported_once(self):
        self.analyze("At 10:55 AM ₹25,000 was debited, UTR 412345678901.")
        self.analyze("At 10:55 AM ₹25,000 was debited, UTR 412345678901.")  # restated
        self.analyze("At 10:55 AM ₹52,000 was debited, UTR 412345678901.")
        found = run_contradictions().contradictions
        self.assertEqual([c.type for c in found], ["conflicting_amount"])  # txn and same-wording anchors merged
        self.assertEqual((len(found[0].claims_a), len(found[0].claims_b)), (2, 1))

    def test_adjacent_sentences_share_a_transaction(self):
        self.analyze("Rs 7,500 debited from A/c No: XXXX9911 on 2026-09-27 12:10.\nUTR 455566677788.")
        self.analyze("At 12:10 PM ₹5,700 was debited, UTR 455566677788.")
        (c,) = run_contradictions().contradictions
        self.assertEqual(c.type, "conflicting_amount")
        self.assertIn("455566677788", c.explanation)

    def test_ambiguous_or_distant_sentences_are_not_linked(self):
        # ID between two amounts
        self.analyze("Rs 800 debited on 2026-09-20.\nUTR 466677788899.\nRs 900 debited on 2026-09-21.")
        self.analyze("UTR 466677788899 was for Rs 850.")
        # separated by a blank line (different paragraph)
        self.analyze("Rs 700 debited on 2026-09-22.\n\nUTR 477788899900.")
        self.analyze("UTR 477788899900 was for Rs 750.")
        # separated by another sentence
        self.analyze("Rs 600 debited on 2026-09-23. The bank called me. UTR 488899900011.")
        self.analyze("UTR 488899900011 was for Rs 650.")
        self.assertEqual(run_contradictions().contradictions, [])

    def test_ocr_repairs_keep_raw_text_and_recover_claims(self):
        (ev,) = self.upload(("shot.png", PHISHING_PNG.read_bytes()))
        result = extract_evidence(ev)
        self.assertIsNotNone(result.ocr_raw_text)
        self.assertNotEqual(result.ocr_raw_text, result.extracted_text)
        self.assertIn("OCR text repaired", result.notes[0])
        claims = [c.claim for c in result.claims]
        self.assertIn("The sender later claimed that no payment had been requested.", claims)
        self.assertTrue(any("another payment of 10,000 was requested" in c for c in claims))
        (c,) = run_contradictions().contradictions  # the screenshot alone now surfaces the conflict
        self.assertEqual(c.type, "affirmed_vs_denied")

    def test_ocr_cleanup_is_conservative(self):
        from app.extraction import clean_ocr_text

        repaired = {
            "The senderlater claimed that no payment had beenrequested.":
                "The sender later claimed that no payment had been requested.",
            "At10:55AM,atransactionof25,000wasrecorded": "At 10:55 AM,a transaction of 25,000 was recorded",
            "another payment of 10,0o0 was requested": "another payment of 10,000 was requested",
            "TransactionID:TxN12345.": "Transaction ID:TxN12345.",
        }
        for raw, expected in repaired.items():
            self.assertEqual(clean_ocr_text(raw)[0], expected)
        for untouched in (
            "Visit https://secure-bankverificationlogin.example.com/requestedpayment now",
            "Mail beenrequested@example.com",
            "Information Kolkata Bengaluru understanding TXN12345 USER1234 On 2026-09-27",
            "Order ORD778812, version 1.2.3, code l0ol, Studioon, Rioto",
        ):
            self.assertEqual(clean_ocr_text(untouched)[0], untouched)

    def test_text_evidence_is_not_ocr_repaired(self):
        glued = "The senderlater claimed that no payment had beenrequested."
        ev = self.analyze(glued)
        result = extraction_store.get(ev)
        self.assertEqual(result.extracted_text, glued)
        self.assertIsNone(result.ocr_raw_text)


if __name__ == "__main__":
    unittest.main()

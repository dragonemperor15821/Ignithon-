"""One-click case analysis: POST /api/case/analyze (and its streaming variant).

Run from backend/:  python -m pytest   (or: python -m unittest discover -s tests -v)
Every test uses a throwaway data directory; the real backend/data is never touched.
"""

import hashlib
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

import test_analysis
from app import extraction, extraction_store, store
from app.main import app
from app.routers import analysis, case
from app.routers import extraction as extraction_router
from app.routers import timeline as timeline_router

sys.path.insert(0, str(Path(__file__).parent / "fixtures"))
from case_set import BANK_STATEMENT_PDF, CORE, build_case, text_pdf  # noqa: E402

PHISHING_TEXT = test_analysis.PHISHING_TEXT
PHISHING_PNG = test_analysis.PHISHING_PNG
STAGE_ORDER = ["extraction", "timeline", "missing_info", "contradictions", "redaction", "report"]
CORE_TEXT = dict(CORE)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def strip_times(x):
    drop = {"generated_at", "extracted_at", "uploaded_at", "started_at", "finished_at", "duration_ms"}
    if isinstance(x, dict):
        return {k: strip_times(v) for k, v in x.items() if k not in drop}
    if isinstance(x, list):
        return [strip_times(v) for v in x]
    return x


class CaseApiTest(test_analysis.CaseTest):
    def setUp(self):
        super().setUp()
        self.client = TestClient(app)

    def upload_files(self, files):
        r = self.client.post("/api/evidence/upload", files=[("files", (n, b)) for n, b in files])
        self.assertEqual(r.status_code, 201, r.text)
        return {e["filename"]: e for e in r.json()["created"]}

    def analyze(self, **params):
        r = self.client.post("/api/case/analyze", params=params)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def state(self):
        get = lambda p: self.client.get(p).json()  # noqa: E731
        return {
            "evidence": get("/api/evidence"),
            "extractions": get("/api/extractions"),
            "timeline": get("/api/timeline"),
            "missing": get("/api/missing-info"),
            "contradictions": get("/api/contradictions"),
            "redactions": get("/api/redactions"),
            "report": get("/api/report"),
            "report_redacted": get("/api/report?redacted=true"),
        }

    def assert_counts_match_state(self, result, state):
        stages = result["stages"]
        self.assertEqual(stages["timeline"]["events"], len(state["timeline"]["events"]))
        self.assertEqual(stages["missing_info"]["items"], len(state["missing"]["items"]))
        self.assertEqual(stages["contradictions"]["items"], len(state["contradictions"]["contradictions"]))
        self.assertEqual(stages["redaction"]["items"], sum(i["status"] == "redacted" for i in state["redactions"]["items"]))
        self.assertEqual(stages["report"]["statements"], sum(len(s["statements"]) for s in state["report"]["sections"]))

    def assert_report_references_valid(self, state):
        evidence = {e["id"] for e in state["evidence"]}
        claims = {c["id"] for r in state["extractions"] for c in r["claims"]}
        events = {e["id"] for e in state["timeline"]["events"]}
        items = {i["id"] for i in state["missing"]["items"]} | {c["id"] for c in state["contradictions"]["contradictions"]}
        for section in state["report"]["sections"]:
            for st in section["statements"]:
                self.assertTrue(set(st["evidence_ids"]) <= evidence, st["text"])
                self.assertTrue(set(st["claim_ids"]) <= claims, st["text"])
                self.assertTrue(set(st["event_ids"]) <= events, st["text"])
                self.assertTrue(set(st["item_ids"]) <= items, st["text"])
        # the report reflects exactly the freshly generated layers
        report_events = [eid for s in state["report"]["sections"] if s["key"] == "timeline" for st in s["statements"] for eid in st["event_ids"]]
        self.assertEqual(report_events, [e["id"] for e in state["timeline"]["events"]])
        report_ct = [i for s in state["report"]["sections"] if s["key"] == "contradictions" for st in s["statements"] for i in st["item_ids"]]
        self.assertEqual(report_ct, [c["id"] for c in state["contradictions"]["contradictions"]])

    # --- basic shapes ---------------------------------------------------------

    def test_empty_case(self):
        result = self.analyze()
        self.assertEqual(result["status"], "empty")
        self.assertEqual((result["evidence_total"], result["evidence_analyzed"]), (0, 0))
        self.assertEqual(list(result["stages"]), STAGE_ORDER)
        self.assertTrue(all(s["status"] == "skipped" for s in result["stages"].values()))
        self.assertEqual(result["errors"], [])
        self.assertEqual(self.client.get("/api/report").json()["status"], "pending")
        overview = self.client.get("/api/case").json()
        self.assertEqual((overview["evidence_total"], overview["pending"]), (0, 0))
        self.assertEqual(overview["last_run"]["status"], "empty")

    def test_one_evidence_item(self):
        (ev,) = self.upload_files([("phishing.txt", PHISHING_TEXT.encode())]).values()
        overview = self.client.get("/api/case").json()
        self.assertEqual((overview["evidence_total"], overview["pending"], overview["evidence_by_type"]), (1, 1, {"text": 1}))

        result = self.analyze()
        self.assertEqual(result["status"], "completed")
        self.assertEqual((result["evidence_total"], result["evidence_analyzed"]), (1, 1))
        self.assertEqual(list(result["stages"]), STAGE_ORDER)
        self.assertTrue(all(s["status"] == "completed" for s in result["stages"].values()))
        self.assertEqual(result["stages"]["extraction"], {**result["stages"]["extraction"], "processed": 1, "reused": 0, "failed": 0})
        self.assertEqual(result["stages"]["contradictions"]["items"], 1)  # requested vs "no payment had been requested"
        state = self.state()
        self.assert_counts_match_state(result, state)
        self.assertEqual(state["report"]["status"], "ready")
        self.assertEqual(self.client.get("/api/case").json()["pending"], 0)
        self.assertEqual(self.client.get("/api/case").json()["last_run"]["stages"], result["stages"])
        self.assertEqual([e["id"] for e in state["evidence"]], [ev["id"]])

    def test_multiple_mixed_txt_pdf_png_with_ocr_downstream(self):
        pdf_name, pdf_lines = BANK_STATEMENT_PDF
        files = [
            ("complaint.txt", CORE_TEXT["complaint.txt"].encode()),
            ("bank_sms.txt", CORE_TEXT["bank_sms.txt"].encode()),
            (pdf_name, text_pdf(pdf_lines)),
            ("phishing.png", PHISHING_PNG.read_bytes()),
        ]
        created = self.upload_files(files)
        result = self.analyze()
        self.assertEqual(result["status"], "completed", result["errors"])
        self.assertEqual(result["evidence_by_type"], {"image": 1, "pdf": 1, "text": 2})
        self.assertEqual(result["evidence_analyzed"], 4)
        state = self.state()
        self.assert_counts_match_state(result, state)

        methods = {r["evidence_id"]: r["method"] for r in state["extractions"]}
        ids = {n: e["id"] for n, e in created.items()}
        self.assertEqual(methods, {ids["complaint.txt"]: "plain_text", ids["bank_sms.txt"]: "plain_text", ids[pdf_name]: "pypdf", ids["phishing.png"]: "ocr"})

        # every kind of evidence reaches the timeline
        on_timeline = {ev for e in state["timeline"]["events"] for ev in e["source_evidence_ids"]}
        self.assertEqual(on_timeline, set(ids.values()))
        # OCR evidence reaches gaps, contradictions and the report
        png = ids["phishing.png"]
        self.assertIn(("unresolved_date", png), {(i["category"], i["source_evidence_ids"][0]) for i in state["missing"]["items"]})
        members = [{r["evidence_id"] for r in c["claims_a"] + c["claims_b"]} for c in state["contradictions"]["contradictions"]]
        self.assertTrue(any(png in m for m in members))
        # the PDF joins the same-UTR amount conflict: 25,000 (complaint, PDF) vs 52,000 (bank SMS)
        amount = next(c for c in state["contradictions"]["contradictions"] if c["type"] == "conflicting_amount")
        self.assertEqual({r["evidence_id"] for r in amount["claims_a"]}, {ids["complaint.txt"], ids[pdf_name]})
        self.assertEqual({r["evidence_id"] for r in amount["claims_b"]}, {ids["bank_sms.txt"]})
        # PII in the PDF is redacted in the derived copy
        red = self.client.get(f"/api/evidence/{ids[pdf_name]}/redacted").json()
        self.assertIn("[REDACTED_PHONE]", red["redacted_text"])
        self.assertIn("[REDACTED_TRANSACTION_ID]", red["redacted_text"])
        inventory = next(s for s in state["report"]["sections"] if s["key"] == "evidence")["statements"]
        self.assertEqual([st["evidence_ids"] for st in inventory], [[i] for i in sorted(ids.values())])
        self.assert_report_references_valid(state)

    # --- failures ---------------------------------------------------------------

    def test_failed_items_are_recorded_and_the_rest_continue(self):
        created = self.upload_files(
            [
                ("phishing.txt", PHISHING_TEXT.encode()),
                ("broken.png", b"this is not really a png"),
                ("legacy.doc", b"\xd0\xcf\x11\xe0 legacy"),
                ("gone.txt", b"At 10:00 AM Rs 100 was debited."),
            ]
        )
        # an item whose original file disappeared makes the per-item extractor raise
        gone = store.UPLOADS_DIR / created["gone.txt"]["stored_filename"]
        gone.chmod(0o666)
        gone.unlink()

        result = self.analyze()
        self.assertEqual(result["status"], "completed_with_errors")
        self.assertTrue(all(s["status"] == "completed" for s in result["stages"].values()))
        ext = result["stages"]["extraction"]
        self.assertEqual((ext["processed"], ext["failed"]), (3, 3))  # the missing file never got as far as processing
        failed = {e["evidence_id"]: e for e in result["errors"]}
        self.assertEqual(set(failed), {created[n]["id"] for n in ("broken.png", "legacy.doc", "gone.txt")})
        self.assertTrue(all(e["stage"] == "extraction" for e in result["errors"]))
        self.assertIn("missing", failed[created["gone.txt"]["id"]]["message"])
        self.assertTrue(failed[created["broken.png"]["id"]]["message"].startswith("failed:"))
        self.assertEqual(result["evidence_analyzed"], 1)

        state = self.state()
        good = created["phishing.txt"]["id"]
        self.assertTrue(state["timeline"]["events"])
        self.assertTrue(all(e["source_evidence_ids"] == [good] for e in state["timeline"]["events"]))
        self.assertEqual(state["report"]["status"], "ready")
        inventory = next(s for s in state["report"]["sections"] if s["key"] == "evidence")["statements"]
        self.assertEqual(len(inventory), 4)  # failed items still appear, with their status

    def test_stage_failure_is_reported_not_hidden(self):
        self.upload_files([("phishing.txt", PHISHING_TEXT.encode())])
        with mock.patch.object(analysis, "run_contradictions", side_effect=RuntimeError("disk full")):
            result = self.analyze()
        self.assertEqual(result["status"], "failed")
        st = {k: v["status"] for k, v in result["stages"].items()}
        self.assertEqual(
            st,
            {"extraction": "completed", "timeline": "completed", "missing_info": "completed",
             "contradictions": "failed", "redaction": "skipped", "report": "skipped"},
        )
        self.assertEqual(result["stages"]["contradictions"]["error"], "RuntimeError: disk full")
        self.assertIn("contradictions stage failed", result["stages"]["report"]["error"])
        self.assertEqual(result["errors"], [{"stage": "contradictions", "evidence_id": None, "message": "RuntimeError: disk full"}])
        # no report is presented as fresh
        self.assertEqual(self.client.get("/api/report").json()["status"], "pending")
        # and the case can simply be re-run once the problem is gone
        self.assertEqual(self.analyze()["status"], "completed")

    def test_previously_unavailable_item_is_retried(self):
        created = self.upload_files([("shot.png", PHISHING_PNG.read_bytes())])
        missing = extraction.Unavailable("OCR engine not installed (rapidocr_onnxruntime); image text was not extracted")
        with mock.patch.object(extraction, "_get_ocr_engine", side_effect=missing):
            first = self.analyze()
        self.assertEqual(first["status"], "completed_with_errors")
        self.assertEqual(first["evidence_analyzed"], 0)
        self.assertEqual(self.client.get("/api/case").json()["pending"], 1)

        second = self.analyze()  # engine available again
        self.assertEqual(second["status"], "completed")
        self.assertEqual(second["stages"]["extraction"]["processed"], 1)
        self.assertEqual(extraction_store.get(created["shot.png"]["id"]).method, "ocr")

    # --- ordering, determinism, integrity -----------------------------------------

    def test_pipeline_runs_stages_in_order_on_fresh_results(self):
        self.upload_files([("phishing.txt", PHISHING_TEXT.encode()), ("shot.png", PHISHING_PNG.read_bytes())])
        calls = []

        def spy(module, name, label):
            real = getattr(module, name)

            def wrapper(*args, **kwargs):
                calls.append(label)
                return real(*args, **kwargs)

            return mock.patch.object(module, name, side_effect=wrapper)

        with (
            spy(extraction_router, "_run", "extraction"),
            spy(timeline_router, "run_timeline", "timeline"),
            spy(analysis, "run_missing_info", "missing_info"),
            spy(analysis, "run_contradictions", "contradictions"),
            spy(analysis, "run_redactions", "redaction"),
            spy(analysis, "save_report", "report"),
        ):
            result = self.analyze()
        self.assertEqual(result["status"], "completed")
        self.assertEqual(calls, ["extraction", "extraction", *STAGE_ORDER[1:]])  # each stage exactly once, in order
        self.assert_report_references_valid(self.state())

    def test_streamed_progress_matches_final_result(self):
        self.upload_files([("phishing.txt", PHISHING_TEXT.encode())])
        with self.client.stream("POST", "/api/case/analyze/stream") as r:
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.headers["content-type"], "application/x-ndjson")
            events = [json.loads(line) for line in r.iter_lines() if line]
        progress = [(e["stage"], e["result"]["status"]) for e in events if e["event"] == "stage"]
        self.assertEqual(progress, [(s, st) for s in STAGE_ORDER for st in ("running", "completed")])
        self.assertEqual([e["label"] for e in events if e["event"] == "stage"][::2], [label for _, label in case.STAGES])
        self.assertEqual(events[-1]["event"], "done")
        self.assertEqual(events[-1]["result"]["status"], "completed")
        self.assertEqual(self.client.get("/api/case").json()["last_run"]["stages"], events[-1]["result"]["stages"])

    def test_concurrent_run_is_rejected(self):
        self.assertTrue(case._running.acquire(blocking=False))
        try:
            self.assertEqual(self.client.post("/api/case/analyze").status_code, 409)
            self.assertEqual(self.client.post("/api/case/analyze/stream").status_code, 409)
        finally:
            case._running.release()
        self.assertEqual(self.client.post("/api/case/analyze").status_code, 200)

    def test_rerun_is_deterministic_and_keeps_ids(self):
        files = [("phishing.txt", PHISHING_TEXT.encode()), ("shot.png", PHISHING_PNG.read_bytes())]
        files += [(n, t.encode()) for n, t in CORE[:6]]
        files.append((BANK_STATEMENT_PDF[0], text_pdf(BANK_STATEMENT_PDF[1])))
        self.upload_files(files)
        first = self.analyze()
        state1 = strip_times(self.state())

        second = self.analyze()  # nothing pending: extraction results are reused untouched
        self.assertEqual(second["stages"]["extraction"], {**second["stages"]["extraction"], "processed": 0, "reused": len(files)})
        self.assertEqual(strip_times(self.state()), state1)

        forced = self.analyze(force="true")  # re-extract everything: stable IDs, identical results
        self.assertEqual(forced["stages"]["extraction"]["processed"], len(files))
        self.assertEqual(strip_times(self.state()), state1)
        for key in ("timeline", "missing_info", "contradictions", "redaction", "report"):
            self.assertEqual(strip_times(first["stages"][key]), strip_times(forced["stages"][key]))

    def test_original_evidence_bytes_and_sha256_unchanged(self):
        files = [
            ("phishing.txt", PHISHING_TEXT.encode()),
            (BANK_STATEMENT_PDF[0], text_pdf(BANK_STATEMENT_PDF[1])),
            ("shot.png", PHISHING_PNG.read_bytes()),
        ]
        created = self.upload_files(files)
        registry_before = sha(store.REGISTRY_PATH.read_bytes())
        self.analyze()
        self.analyze(force="true")
        for name, content in files:
            ev = created[name]
            stored = (store.UPLOADS_DIR / ev["stored_filename"]).read_bytes()
            self.assertEqual(stored, content, name)
            self.assertEqual(sha(stored), ev["sha256"])
        self.assertEqual(sha(store.REGISTRY_PATH.read_bytes()), registry_before)  # IDs, hashes, records untouched
        self.assertEqual(self.client.get("/api/evidence").json(), list(created.values()))

    def test_fifty_evidence_case_in_one_call(self):
        files = build_case(50)
        created = self.upload_files(files)
        result = self.analyze()
        self.assertEqual(result["evidence_total"], 50)
        self.assertEqual(result["evidence_analyzed"], 49)  # the legacy .doc cannot be read
        self.assertEqual(result["status"], "completed_with_errors")
        self.assertEqual([e["evidence_id"] for e in result["errors"]], [created["legacy_form.doc"]["id"]])
        self.assertTrue(all(s["status"] == "completed" for s in result["stages"].values()))
        state = self.state()
        self.assert_counts_match_state(result, state)
        self.assert_report_references_valid(state)
        self.assertEqual(result["stages"]["contradictions"]["items"], 6)
        for name, content in files:
            self.assertEqual((store.UPLOADS_DIR / created[name]["stored_filename"]).read_bytes(), content)


if __name__ == "__main__":
    unittest.main()

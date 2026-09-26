"""Image OCR tests. Run from backend/:  python -m unittest discover -s tests -v

Images go through the real upload endpoint, then extraction, then the timeline.
Every test uses a throwaway data directory; the real backend/data is never touched.
"""

import asyncio
import hashlib
import io
import os
import shutil
import stat
import unittest
from pathlib import Path
from unittest import mock

from fastapi import UploadFile
from PIL import Image

from app import extraction, store
from app.routers.evidence import upload_evidence
from app.routers.extraction import extract_evidence
from app.routers.timeline import run_timeline
import test_timeline
from test_timeline import MAIN

FIXTURES = Path(__file__).parent / "fixtures"
PHISHING_PNG = FIXTURES / "phishing_screenshot.png"


def _force_remove(func, path, _exc):
    os.chmod(path, stat.S_IWRITE)  # uploaded originals are read-only
    func(path)


class OcrTest(unittest.TestCase):
    setUp = test_timeline.TimelineTest.setUp

    def tearDown(self):
        shutil.rmtree(self.tmp, onerror=_force_remove)
        test_timeline.TimelineTest.tearDown(self)

    def upload(self, name: str, content: bytes):
        response = asyncio.run(upload_evidence([UploadFile(file=io.BytesIO(content), filename=name)]))
        self.assertEqual(len(response.created), 1, response.rejected)
        return response.created[0]

    def upload_phishing(self):
        return self.upload("phishing.png", PHISHING_PNG.read_bytes())

    @staticmethod
    def blank_png() -> bytes:
        buf = io.BytesIO()
        Image.new("RGB", (400, 200), "white").save(buf, format="PNG")
        return buf.getvalue()

    # --- successful OCR ----------------------------------------------------

    def test_ocr_extracts_text_entities_and_claims(self):
        ev = self.upload_phishing()
        result = extract_evidence(ev.id)

        self.assertEqual(result.status, "extracted")
        self.assertEqual(result.method, "ocr")
        self.assertEqual(result.confidence, extraction.METHOD_CONFIDENCE["ocr"])
        for fragment in ("27/09/2026", "https://secure-bank-login.example.com/verify", "another payment of"):
            self.assertIn(fragment, result.extracted_text)

        found = {(e.type, e.normalized or e.raw) for e in result.entities}
        self.assertIn(("url", "https://secure-bank-login.example.com/verify"), found)
        self.assertIn(("transaction_id", "TXN12345"), found)
        self.assertIn(("date", "27/09/2026"), found)
        for t in ("10:42", "10:55", "11:00"):
            self.assertIn(("time", t), found)

        # The OCR model has no '₹' glyph, so '₹25,000' reads as '25,000'. Without a currency
        # marker no amount is invented from the bare number.
        self.assertNotIn("amount", {e.type for e in result.entities})

        self.assertTrue(result.claims)
        for claim in result.claims:
            self.assertEqual(claim.source_evidence_ids, [ev.id])
            self.assertTrue(claim.id.startswith("CL-"))
            # claims are verbatim spans of the OCR text
            self.assertEqual(result.extracted_text[claim.char_start : claim.char_end], claim.claim)

    def test_ocr_is_deterministic(self):
        ev = self.upload_phishing()
        first = extract_evidence(ev.id)
        second = extract_evidence(ev.id)
        self.assertEqual(first.extracted_text, second.extracted_text)
        self.assertEqual([c.id for c in first.claims], [c.id for c in second.claims])

    # --- no text / failures ------------------------------------------------

    def test_image_without_text(self):
        ev = self.upload("blank.png", self.blank_png())
        result = extract_evidence(ev.id)
        self.assertEqual(result.status, "no_text")
        self.assertEqual(result.method, "ocr")
        self.assertEqual(result.claims, [])
        self.assertIn("OCR found no readable text in the image", result.notes)

    def test_corrupt_image_fails_with_message(self):
        ev = self.upload("broken.png", b"this is not really a png")
        result = extract_evidence(ev.id)
        self.assertEqual(result.status, "failed")
        self.assertTrue(result.notes and result.notes[0].startswith("Text extraction failed:"))
        self.assertEqual(result.claims, [])

    def test_engine_missing_reports_unavailable(self):
        ev = self.upload_phishing()
        missing = extraction.Unavailable("OCR engine not installed (rapidocr_onnxruntime); image text was not extracted")
        with mock.patch.object(extraction, "_get_ocr_engine", side_effect=missing):
            result = extract_evidence(ev.id)
        self.assertEqual(result.status, "unavailable")
        self.assertEqual(result.notes, [str(missing)])

    def test_engine_crash_reports_failed(self):
        ev = self.upload_phishing()
        broken = mock.Mock(side_effect=RuntimeError("onnx session error"))
        with mock.patch.object(extraction, "_get_ocr_engine", return_value=broken):
            result = extract_evidence(ev.id)
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.notes, ["Text extraction failed: onnx session error"])

    # --- integrity ---------------------------------------------------------

    def test_original_image_and_sha256_unchanged(self):
        content = PHISHING_PNG.read_bytes()
        ev = self.upload("phishing.png", content)
        self.assertEqual(ev.sha256, hashlib.sha256(content).hexdigest())

        extract_evidence(ev.id)
        run_timeline()

        stored = store.UPLOADS_DIR / ev.stored_filename
        self.assertEqual(stored.read_bytes(), content)
        self.assertEqual(store.get(ev.id), ev)  # registry record, incl. type and hash, untouched
        self.assertEqual(ev.type, "image")

    def test_text_evidence_unchanged(self):
        ev = self.upload("note.txt", MAIN.encode("utf-8"))
        result = extract_evidence(ev.id)
        self.assertEqual(result.method, "plain_text")
        self.assertEqual(result.confidence, 1.0)
        self.assertEqual(result.extracted_text, MAIN)
        self.assertEqual(
            [c.claim for c in result.claims],
            [
                "27 September 2026 at 10:42 AM, ₹25,000 was transferred to fraudster@example.com.",
                "Transaction ID TXN12345.",
                "At 11:00 AM another payment was requested.",
            ],
        )
        self.assertIn(("amount", "25000"), {(e.type, e.normalized) for e in result.entities})

    # --- timeline ------------------------------------------------------------

    def test_ocr_claims_feed_timeline(self):
        ev = self.upload_phishing()
        extract_evidence(ev.id)
        timeline = run_timeline()

        self.assertEqual(timeline.status, "ready")
        self.assertTrue(all(e.source_evidence_ids == [ev.id] for e in timeline.events))
        times = {e.time for e in timeline.events}
        self.assertTrue({"10:42", "10:55", "11:00"} <= times)
        # dd/mm/yyyy is never guessed, so the first event keeps its raw date and stays undated
        first = next(e for e in timeline.events if "27/09/2026" in e.description)
        self.assertEqual(first.date_raw, "27/09/2026")
        self.assertIsNone(first.date)
        self.assertEqual(first.placement, "undated")


if __name__ == "__main__":
    unittest.main()

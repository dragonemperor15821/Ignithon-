"""Integrity verification and chain-of-custody log. Throwaway data directory only."""

import unittest

from fastapi.testclient import TestClient

import test_analysis
from app import store
from app.main import app


class IntegrityAuditTest(test_analysis.CaseTest):
    def setUp(self):
        super().setUp()
        self.client = TestClient(app)
        r = self.client.post("/api/evidence/upload", files=[("files", ("note.txt", test_analysis.PHISHING_TEXT.encode()))])
        self.ev = r.json()["created"][0]
        self.path = store.UPLOADS_DIR / self.ev["stored_filename"]

    def test_verified_when_identical_and_evidence_untouched(self):
        before = self.path.read_bytes()
        r = self.client.get(f"/api/integrity/{self.ev['id']}").json()
        self.assertEqual(r["status"], "VERIFIED")
        self.assertEqual(r["actual_sha256"], self.ev["sha256"])
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual([x["status"] for x in self.client.get("/api/integrity").json()], ["VERIFIED"])

    def test_violation_when_bytes_change(self):
        self.path.chmod(0o666)
        self.path.write_bytes(self.path.read_bytes() + b" tampered")
        r = self.client.get(f"/api/integrity/{self.ev['id']}").json()
        self.assertEqual(r["status"], "INTEGRITY VIOLATION")
        self.assertEqual(r["expected_sha256"], self.ev["sha256"])
        self.assertNotEqual(r["actual_sha256"], self.ev["sha256"])

    def test_violation_when_original_missing(self):
        self.path.chmod(0o666)
        self.path.unlink()
        r = self.client.get(f"/api/integrity/{self.ev['id']}").json()
        self.assertEqual((r["status"], r["actual_sha256"]), ("INTEGRITY VIOLATION", None))
        self.assertEqual(self.client.get("/api/integrity/EV-999").status_code, 404)

    def test_audit_log_records_case_actions(self):
        self.client.post("/api/case/analyze")
        log = self.client.get("/api/audit").json()
        self.assertEqual(
            [(e["action"], e["evidence_id"]) for e in log],
            [
                ("evidence_uploaded", self.ev["id"]),
                ("sha256_calculated", self.ev["id"]),
                ("extraction_completed", self.ev["id"]),
                ("report_generated", None),
                ("case_analysis_completed", None),
            ],
        )
        self.assertEqual(log[1]["detail"], self.ev["sha256"])
        self.assertEqual(log[-1]["status"], "completed")
        self.assertEqual([e["seq"] for e in log], [1, 2, 3, 4, 5])
        self.assertTrue(all(e["timestamp"] for e in log))


if __name__ == "__main__":
    unittest.main()

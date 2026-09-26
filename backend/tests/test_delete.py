"""DELETE /api/evidence/{id}. Throwaway data directory only."""

import hashlib
import pathlib
import unittest
from unittest import mock

from fastapi.testclient import TestClient

import test_analysis
from app import extraction_store, store
from app.main import app


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class DeleteEvidenceTest(test_analysis.CaseTest):
    def setUp(self):
        super().setUp()
        self.client = TestClient(app)
        files = [("a.txt", b"At 10:00 AM Rs 100 was debited."), ("b.txt", b"At 11:00 AM Rs 200 was debited."), ("c.txt", b"At 12:00 PM Rs 300 was debited.")]
        r = self.client.post("/api/evidence/upload", files=[("files", f) for f in files])
        self.ev = {e["filename"]: e for e in r.json()["created"]}
        self.content = dict(files)
        self.client.post("/api/extraction/run")

    def path(self, name):
        return store.UPLOADS_DIR / self.ev[name]["stored_filename"]

    def test_successful_deletion_removes_only_that_evidence(self):
        target = self.ev["b.txt"]
        r = self.client.delete(f"/api/evidence/{target['id']}")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual((body["deleted"], body["filename"], body["sha256"]), (target["id"], "b.txt", target["sha256"]))
        self.assertTrue(body["file_removed"] and body["extraction_removed"])

        self.assertEqual([e["id"] for e in self.client.get("/api/evidence").json()], [self.ev["a.txt"]["id"], self.ev["c.txt"]["id"]])
        self.assertEqual(self.client.get(f"/api/evidence/{target['id']}").status_code, 404)
        self.assertIsNone(extraction_store.get(target["id"]))
        # other evidence untouched: bytes, hashes, extractions, integrity
        for name in ("a.txt", "c.txt"):
            self.assertEqual(self.path(name).read_bytes(), self.content[name])
            self.assertIsNotNone(extraction_store.get(self.ev[name]["id"]))
            self.assertEqual(self.client.get(f"/api/integrity/{self.ev[name]['id']}").json()["status"], "VERIFIED")
        # recorded in the chain of custody
        last = self.client.get("/api/audit").json()[-1]
        self.assertEqual((last["action"], last["evidence_id"], last["status"]), ("evidence_deleted", target["id"], "ok"))
        self.assertIn(target["sha256"], last["detail"])
        # IDs are never reused
        r = self.client.post("/api/evidence/upload", files=[("files", ("d.txt", b"new"))])
        self.assertEqual(r.json()["created"][0]["id"], "EV-004")

    def test_stored_file_is_removed(self):
        target = self.path("a.txt")
        self.assertTrue(target.exists())
        self.client.delete(f"/api/evidence/{self.ev['a.txt']['id']}")
        self.assertFalse(target.exists())
        self.assertTrue(self.path("b.txt").exists() and self.path("c.txt").exists())
        self.assertEqual(sorted(p.name for p in store.UPLOADS_DIR.iterdir()), sorted(self.ev[n]["stored_filename"] for n in ("b.txt", "c.txt")))

    def test_nonexistent_id_changes_nothing(self):
        registry = sha(store.REGISTRY_PATH.read_bytes())
        audit_len = len(self.client.get("/api/audit").json())
        r = self.client.delete("/api/evidence/EV-999")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.json()["detail"], "Evidence EV-999 not found")
        self.assertEqual(sha(store.REGISTRY_PATH.read_bytes()), registry)
        self.assertEqual(len(self.client.get("/api/audit").json()), audit_len)

    def test_failed_file_removal_keeps_the_evidence(self):
        target = self.ev["c.txt"]
        with mock.patch.object(pathlib.Path, "unlink", side_effect=PermissionError("file in use")):
            r = self.client.delete(f"/api/evidence/{target['id']}")
        self.assertEqual(r.status_code, 500)
        self.assertIn("file in use", r.json()["detail"])
        self.assertEqual(self.client.get(f"/api/evidence/{target['id']}").status_code, 200)
        self.assertEqual(self.path("c.txt").read_bytes(), self.content["c.txt"])
        self.assertIsNotNone(extraction_store.get(target["id"]))
        last = self.client.get("/api/audit").json()[-1]
        self.assertEqual((last["action"], last["status"]), ("evidence_deleted", "failed"))


if __name__ == "__main__":
    unittest.main()

"""Timeline tests. Run from backend/:  python -m unittest discover -s tests -v

Every test uses a throwaway data directory; the real backend/data is never touched.
"""

import hashlib
import json
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from app import extraction_store, store, timeline_store
from app.models import Evidence, Timeline
from app.routers.extraction import extract_evidence
from app.routers.timeline import get_timeline, get_timeline_event, run_timeline

MAIN = (
    "27 September 2026 at 10:42 AM, ₹25,000 was transferred to fraudster@example.com. "
    "Transaction ID TXN12345.\n"
    "At 11:00 AM another payment was requested."
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class TimelineTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="caseforge-test-"))
        self._saved = {
            (store, "DATA_DIR"): store.DATA_DIR,
            (store, "UPLOADS_DIR"): store.UPLOADS_DIR,
            (store, "REGISTRY_PATH"): store.REGISTRY_PATH,
            (extraction_store, "DATA_DIR"): extraction_store.DATA_DIR,
            (extraction_store, "EXTRACTIONS_PATH"): extraction_store.EXTRACTIONS_PATH,
            (timeline_store, "DATA_DIR"): timeline_store.DATA_DIR,
            (timeline_store, "TIMELINE_PATH"): timeline_store.TIMELINE_PATH,
        }
        store.DATA_DIR = extraction_store.DATA_DIR = timeline_store.DATA_DIR = self.tmp
        store.UPLOADS_DIR = self.tmp / "uploads"
        store.REGISTRY_PATH = self.tmp / "evidence.json"
        extraction_store.EXTRACTIONS_PATH = self.tmp / "extractions.json"
        timeline_store.TIMELINE_PATH = self.tmp / "timeline.json"
        store.UPLOADS_DIR.mkdir(parents=True)

    def tearDown(self):
        for (module, name), value in self._saved.items():
            setattr(module, name, value)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def add_evidence(self, text: str) -> str:
        eid = store.reserve_id()
        stored = f"{eid}.txt"
        (store.UPLOADS_DIR / stored).write_text(text, encoding="utf-8")
        store.add(
            Evidence(
                id=eid,
                filename=f"{eid}.txt",
                stored_filename=stored,
                type="text",
                mime_type="text/plain",
                size=len(text.encode()),
                sha256=hashlib.sha256(text.encode()).hexdigest(),
                uploaded_at=datetime.now(timezone.utc),
            )
        )
        extract_evidence(eid)
        return eid

    def by_text(self, timeline: Timeline, fragment: str):
        matches = [e for e in timeline.events if fragment in e.description]
        self.assertEqual(len(matches), 1, f"expected one event containing {fragment!r}")
        return matches[0]

    # 1
    def test_dated_timed_event(self):
        ev = self.add_evidence(MAIN)
        event = self.by_text(run_timeline(), "₹25,000")
        self.assertEqual((event.date, event.time), ("2026-09-27", "10:42"))
        self.assertEqual((event.date_raw, event.time_raw), ("27 September 2026", "10:42 AM"))
        self.assertEqual(event.placement, "dated")
        self.assertEqual(event.source_evidence_ids, [ev])

    # 2
    def test_time_without_date_stays_undated(self):
        self.add_evidence(MAIN)
        event = self.by_text(run_timeline(), "another payment")
        self.assertIsNone(event.date)
        self.assertIsNone(event.date_raw)
        self.assertEqual(event.time, "11:00")
        self.assertEqual(event.placement, "undated")

    # 3
    def test_ambiguous_date_not_normalized(self):
        self.add_evidence("On 02/03/2026 at 09:15 Rs 500 was debited.")
        event = self.by_text(run_timeline(), "Rs 500")
        self.assertIsNone(event.date)
        self.assertEqual(event.date_raw, "02/03/2026")
        self.assertEqual(event.placement, "undated")
        self.assertTrue(any("02/03/2026" in n for n in event.notes))

    # 4
    def test_sorted_chronologically(self):
        self.add_evidence(
            "On 2026-09-28 14:00 Rs 300 was debited.\n"
            "On 2026-09-27 18:30 Rs 200 was debited.\n"
            "On 2026-09-27 08:05 Rs 100 was debited."
        )
        dated = [e for e in run_timeline().events if e.placement == "dated"]
        self.assertEqual(
            [(e.date, e.time) for e in dated],
            [("2026-09-27", "08:05"), ("2026-09-27", "18:30"), ("2026-09-28", "14:00")],
        )

    # 5
    def test_unknown_time_gets_no_fake_timestamp(self):
        self.add_evidence("Rs 1,000 was sent to the caller.\n" + MAIN)
        timeline = run_timeline()
        event = self.by_text(timeline, "Rs 1,000")
        self.assertEqual((event.date, event.time, event.date_raw, event.time_raw), (None, None, None, None))
        # undated events come after all dated ones
        placements = [e.placement for e in timeline.events]
        self.assertEqual(placements, sorted(placements))

    # 6
    def test_every_event_has_sources(self):
        self.add_evidence(MAIN)
        self.add_evidence("At 11:00 AM another payment was requested.")  # same text, second source
        timeline = run_timeline()
        self.assertTrue(timeline.events)
        for e in timeline.events:
            self.assertTrue(e.source_evidence_ids)
            self.assertTrue(e.source_claim_ids)
        merged = self.by_text(timeline, "another payment")
        self.assertEqual(merged.source_evidence_ids, ["EV-001", "EV-002"])
        self.assertEqual(len(merged.source_claim_ids), 2)

    # 7
    def test_rerun_ids_are_deterministic(self):
        self.add_evidence(MAIN)
        first = run_timeline()
        extract_evidence("EV-001")  # re-analyze same evidence
        second = run_timeline()
        self.assertEqual(
            [(e.id, e.description) for e in first.events], [(e.id, e.description) for e in second.events]
        )
        self.add_evidence("On 2026-09-26 09:00 Rs 50 was debited.")
        third = run_timeline()
        ids = {e.description: e.id for e in third.events}
        for e in first.events:
            self.assertEqual(ids[e.description], e.id)  # existing IDs survive new evidence
        self.assertEqual(third.events[0].id, "TL-003")  # new, earliest event sorts first

    # 8 + 9
    def test_rerun_does_not_modify_evidence_or_extractions(self):
        self.add_evidence(MAIN)
        before = (sha(store.REGISTRY_PATH), sha(extraction_store.EXTRACTIONS_PATH))
        run_timeline()
        run_timeline()
        self.assertEqual(before, (sha(store.REGISTRY_PATH), sha(extraction_store.EXTRACTIONS_PATH)))

    # 10
    def test_no_invented_information(self):
        self.add_evidence(MAIN)
        self.add_evidence("On 02/03/2026 at 09:15 Rs 500 was debited. Call 9876543210 at 5 pm and 6 pm for Rs 20.")
        timeline = run_timeline()
        texts = {r.evidence_id: r.extracted_text for r in extraction_store.list_all()}
        claims = {c.id: c for r in extraction_store.list_all() for c in r.claims}
        for e in timeline.events:
            for eid in e.source_evidence_ids:
                self.assertIn(e.description, texts[eid])
            for cid in e.source_claim_ids:
                self.assertEqual(claims[cid].claim, e.description)
            for raw in (e.date_raw, e.time_raw):
                if raw:
                    self.assertIn(raw, e.description)
            if e.date or e.time:
                normalized = {x.normalized or "" for x in e.entities}
                if e.date:
                    self.assertTrue(any(n.startswith(e.date) for n in normalized))
                if e.time:
                    self.assertTrue(any(e.time in n for n in normalized))
        two_times = self.by_text(timeline, "5 pm")
        self.assertIsNone(two_times.time)  # two times stated -> neither chosen
        self.assertTrue(any("Multiple times" in n for n in two_times.notes))

    # 11
    def test_saved_timeline_survives_reload(self):
        self.add_evidence(MAIN)
        built = run_timeline()
        on_disk = Timeline.model_validate(json.loads(timeline_store.TIMELINE_PATH.read_text(encoding="utf-8"))["timeline"])
        self.assertEqual(on_disk.model_dump(), get_timeline().model_dump())
        self.assertEqual(on_disk.model_dump(), built.model_dump())
        self.assertEqual(get_timeline_event(built.events[0].id), built.events[0])

    def test_states(self):
        self.assertEqual(get_timeline().status, "pending")
        self.assertEqual(run_timeline().status, "pending")  # no extractions yet
        self.add_evidence("Visit www.example.com for details.")  # extracted, but no event-worthy claim
        self.assertEqual(run_timeline().status, "empty")
        self.add_evidence(MAIN)
        self.assertEqual(run_timeline().status, "ready")


if __name__ == "__main__":
    unittest.main()

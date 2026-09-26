"""JSON-file stores for derived analyses (missing information, contradictions,
redactions, report). Each lives in its own file under data/, separate from the
evidence registry, extractions and timeline, and never writes to them.

Item IDs are keyed on content, so an item keeps its ID across re-runs as long as
it still describes the same thing. IDs are never reused.
"""

import json
import os
import threading
from pathlib import Path
from typing import Callable

from pydantic import BaseModel

from app import store


class DerivedStore:
    def __init__(self, filename: str, prefix: str | None = None):
        self.filename = filename
        self.prefix = prefix
        self._lock = threading.Lock()

    @property
    def path(self) -> Path:
        return store.DATA_DIR / self.filename  # resolved per call so tests can redirect DATA_DIR

    def _load(self) -> dict:
        if not self.path.exists():
            return {"next_seq": 1, "ids": {}, "results": {}}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
        os.replace(tmp, self.path)

    def save(self, keys: list[str], build: Callable[[list[str]], dict[str, BaseModel]]) -> dict[str, BaseModel]:
        """Assign an ID to each key (in order), build the results with those IDs and persist them."""
        with self._lock:
            data = self._load()
            ids = []
            for key in keys:
                if key not in data["ids"]:
                    data["ids"][key] = f"{self.prefix}-{data['next_seq']:03d}"
                    data["next_seq"] += 1
                ids.append(data["ids"][key])
            built = build(ids)
            for name, model in built.items():
                data["results"][name] = model.model_dump(mode="json")
            self._save(data)
        return built

    def get(self, name: str) -> dict | None:
        with self._lock:
            return self._load()["results"].get(name)


missing_info = DerivedStore("missing_info.json", "MI")
contradictions = DerivedStore("contradictions.json", "CT")
redactions = DerivedStore("redactions.json")
report = DerivedStore("report.json")
case = DerivedStore("case.json")

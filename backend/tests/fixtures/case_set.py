"""Deterministic multi-evidence case for integration tests (50 items by default).

Hand-written core documents plant known contradictions and gaps; the remaining
items are generated bank SMS alerts that are mutually consistent (unique
reference numbers, so no contradictions among them). Nothing is random.

Planted findings:
- complaint.txt vs bank_sms.txt: same UTR 412345678901, amount ₹25,000 vs Rs 52,000 -> conflicting_amount
- complaint.txt vs followup_statement.txt: OTP shared vs "did not share my OTP" -> affirmed_vs_denied
- complaint.txt vs followup_statement.txt: "never clicked any link" vs "the link ... was clicked" -> affirmed_vs_denied
- police_note_a.txt vs police_note_b.txt: same wording and time, ₹25,000 vs ₹30,000 -> conflicting_amount
- legacy_form.doc: unreadable (.doc text extraction unsupported) -> unreadable_evidence
- later_note.txt: relative time, no amount, unidentified caller -> unplaced_event / missing_amount / unidentified_actor
- bank_sms_split.txt vs complaint_followup.txt: amount and UTR 455566677788 in adjacent sentences of the SMS
  are linked -> conflicting_amount (Rs 7,500 vs ₹5,700)
- ambiguous_sms.txt vs ambiguous_followup.txt: the UTR sits between two amounts, so it is not linked
  -> no contradiction
"""

from pathlib import Path

FIXTURES = Path(__file__).parent

CORE: list[tuple[str, str]] = [
    (
        "complaint.txt",
        "Complaint filed by Mrs. Anita Rao.\n"
        "On 2026-09-27 10:42 I received a call from +91 98765 43210 claiming to be from my bank.\n"
        "The caller asked me to share the OTP sent to my phone.\n"
        "I shared my OTP with the caller at 10:50 AM.\n"
        "At 10:55 AM ₹25,000 was debited, UTR 412345678901.\n"
        "I never clicked any link.",
    ),
    (
        "bank_sms.txt",
        "Rs 52,000 debited from A/c No: XXXX4821 on 2026-09-27 10:55, UTR 412345678901.",
    ),
    (
        "followup_statement.txt",
        "In a later statement the victim said: I did not share my OTP with anyone.\n"
        "The victim also said the link in the SMS was clicked on 2026-09-27.",
    ),
    (
        "chat_log.txt",
        "[10:40] Unknown: Your account is blocked. Verify at http://bank-verify.example.net/login\n"
        "[10:44] Unknown: Send the OTP now\n"
        "[11:05] Unknown: Pay Rs 10,000 more to unblock\n"
        "Contact: support@bank-verify.example.net",
    ),
    (
        "merchant_email.txt",
        "From: refunds@shop.example.com\n"
        "Name: Rahul Mehta\n"
        "Address: 14 Park Street, Kolkata 700016\n"
        "Refund of INR 1,200 for order ORD778812 was processed on 12 September 2026.",
    ),
    ("police_note_a.txt", "At 10:55 AM the victim lost ₹25,000."),
    ("police_note_b.txt", "At 10:55 AM the victim lost ₹30,000."),
    ("later_note.txt", "Later the caller asked for another payment."),
    # amount and UTR in adjacent sentences: linked unambiguously
    ("bank_sms_split.txt", "Rs 7,500 debited from A/c No: XXXX9911 on 2026-09-27 12:10.\nUTR 455566677788."),
    ("complaint_followup.txt", "At 12:10 PM ₹5,700 was debited, UTR 455566677788."),
    # UTR between two amounts: ambiguous, so it must NOT be linked to either
    ("ambiguous_sms.txt", "Rs 800 debited on 2026-09-20.\nUTR 466677788899.\nRs 900 debited on 2026-09-21."),
    ("ambiguous_followup.txt", "UTR 466677788899 was for Rs 850."),
]

LEGACY_DOC = ("legacy_form.doc", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1 legacy word document")
SCREENSHOT = ("phishing_screenshot.png", FIXTURES / "phishing_screenshot.png")


def text_pdf(lines: list[str]) -> bytes:
    """A minimal, valid single-page PDF with a real text layer (Helvetica). Deterministic bytes."""
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    ops = ["BT", "/F1 11 Tf", "14 TL", "50 780 Td"] + [f"({esc(l)}) Tj T*" for l in lines] + ["ET"]
    content = "\n".join(ops).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


BANK_STATEMENT_PDF = (
    "bank_statement.pdf",
    [
        "Account statement",
        "On 2026-09-27 10:55 Rs 25,000 was debited, UTR 412345678901.",
        "Beneficiary contact: +91 98765 43210",
    ],
)


def filler_sms(i: int) -> tuple[str, str]:
    return (
        f"bank_alert_{i:02d}.txt",
        f"Rs {100 + i * 37} debited from A/c No: XXXX{1000 + i} on 2026-09-{i % 20 + 1:02d} "
        f"{8 + i % 10:02d}:{i * 7 % 60:02d}. UTR {400000000000 + i * 1111}.",
    )


def build_case(total: int = 50, with_screenshot: bool = True) -> list[tuple[str, bytes]]:
    """(filename, content) pairs in upload order."""
    files = [(name, text.encode("utf-8")) for name, text in CORE]
    files.append(LEGACY_DOC)
    if with_screenshot:
        files.append((SCREENSHOT[0], SCREENSHOT[1].read_bytes()))
    i = 1
    while len(files) < total:
        name, text = filler_sms(i)
        files.append((name, text.encode("utf-8")))
        i += 1
    return files

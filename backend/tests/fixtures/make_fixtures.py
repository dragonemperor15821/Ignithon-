"""Regenerate the OCR image fixtures. Run from backend/:  python tests/fixtures/make_fixtures.py

The PNGs are committed so tests do not depend on locally installed fonts.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent

PHISHING_LINES = [
    "PHISHING INCIDENT TEST EVIDENCE",
    "",
    "On 27/09/2026 at 10:42 AM, I received a suspicious message from an unknown sender claiming that my bank account was compromised.",
    "",
    "The message contained the URL https://secure-bank-login.example.com/verify.",
    "",
    "At 10:42 AM, the sender requested that I verify my banking credentials through the link.",
    "",
    "Transaction ID: TXN12345.",
    "",
    "At 10:55 AM, a transaction of \u20b925,000 was recorded after the user entered their details.",
    "",
    "At 11:00 AM, another payment of \u20b910,000 was requested by the same sender.",
    "",
    "The sender later claimed that no payment had been requested.",
]


def render(lines: list[str], out: Path, font_path: str = "C:/Windows/Fonts/consola.ttf", size: int = 20) -> None:
    """Editor-style screenshot: monospace text on a dark background."""
    font = ImageFont.truetype(font_path, size)
    line_h = int(size * 1.6)
    width = max(int(font.getlength(line)) for line in lines) + 60
    image = Image.new("RGB", (width, line_h * len(lines) + 40), (24, 24, 27))
    draw = ImageDraw.Draw(image)
    for i, line in enumerate(lines):
        draw.text((30, 20 + i * line_h), line, fill=(220, 220, 220), font=font)
    image.save(out, optimize=True)


if __name__ == "__main__":
    render(PHISHING_LINES, HERE / "phishing_screenshot.png")
    print("wrote", HERE / "phishing_screenshot.png")

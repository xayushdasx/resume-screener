import json
import re
from difflib import SequenceMatcher
from pathlib import Path

from pypdf import PdfReader


ATTACHMENT_PATH = Path(
    r"C:\Users\ayush\.codex\attachments\952e51c1-985f-42f0-b714-d0010beb8809\pasted-text.txt"
)
RESUME_DIR = Path(
    r"C:\Users\ayush\Downloads\acad intern-20260615T075804Z-3-001\acad intern"
)
OUTPUT_PATH = Path(
    r"C:\Users\ayush\Desktop\resume-screener\outputs\952e51c1-985f-42f0-b714-d0010beb8809\p0_p1_contacts.json"
)


def clean_line(line: str) -> str:
    return (
        line.replace("\xa0", " ")
        .replace("â€™", "'")
        .replace("â€“", "-")
        .replace("â€”", "-")
        .replace("âˆ’", "-")
        .replace("â˜…", "★")
        .strip()
    )


def parse_rows(raw_text: str):
    lines = [clean_line(line) for line in raw_text.replace("\r\n", "\n").split("\n")]
    start_index = lines.index("Screened")
    data_lines = lines[start_index + 1 :]

    rows = []
    buffer = []
    for line in data_lines:
        if line == "View":
            record = [item for item in buffer if item]
            buffer = []
            if not record:
                continue

            initial = record[0] if len(record) > 0 else ""
            candidate = record[1] if len(record) > 1 else ""
            rating_index = next(
                (i for i, value in enumerate(record[2:], start=2) if re.fullmatch(r"(P0|P1|Reject)", value, re.I)),
                -1,
            )
            status_index = next(
                (
                    i
                    for i, value in enumerate(record[rating_index + 1 :], start=rating_index + 1)
                    if re.fullmatch(r"(Shortlisted|Rejected)", value, re.I)
                ),
                -1,
            )
            rows.append(
                {
                    "initial": initial,
                    "candidate": candidate,
                    "profile": " ".join(record[2:rating_index]).strip() if rating_index > 2 else "",
                    "rating": record[rating_index] if rating_index > -1 else "",
                    "status": record[status_index] if status_index > -1 else "",
                    "topReason": " ".join(record[status_index + 1 : len(record) - 3]).strip()
                    if status_index > -1 and len(record) >= status_index + 4
                    else "",
                    "experience": record[-3] if len(record) >= 3 else "",
                    "college": record[-2] if len(record) >= 2 else "",
                    "screened": record[-1] if len(record) >= 1 else "",
                }
            )
        else:
            buffer.append(line)
    return rows


def normalize_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def compact_normalized_text(text: str) -> str:
    return normalize_text(text).replace(" ", "")


def tokenize_name(name: str):
    return [token for token in normalize_text(name).split() if len(token) > 1]


def pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    parts = []
    for page in reader.pages[:3]:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            continue
    return "\n".join(parts)


def extract_email(text: str) -> str:
    matches = re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, flags=re.I)
    if not matches:
        return ""
    for email in matches:
        if not email.lower().endswith((".png", ".jpg", ".jpeg")):
            return email
    return matches[0]


def normalize_phone_candidate(raw: str) -> str:
    cleaned = re.sub(r"[^\d+]", "", raw)
    if cleaned.startswith("00"):
      cleaned = "+" + cleaned[2:]
    digits_only = re.sub(r"\D", "", cleaned)
    if len(digits_only) < 10 or len(digits_only) > 15:
        return ""
    if cleaned.startswith("+"):
        return "+" + digits_only
    return digits_only


def extract_phone(text: str) -> str:
    patterns = [
        r"(?:\+?\d[\d\-\s().]{8,}\d)",
    ]
    for pattern in patterns:
        for match in re.findall(pattern, text):
            phone = normalize_phone_candidate(match)
            if phone:
                return phone
    return ""


def score_candidate(name: str, resume_file: Path, resume_text: str) -> tuple[float, str]:
    tokens = tokenize_name(name)
    if not tokens:
        return 0.0, "no_tokens"

    normalized_name = normalize_text(name)
    compact_name = compact_normalized_text(name)
    filename_norm = normalize_text(resume_file.stem)
    top_text = "\n".join((resume_text or "").splitlines()[:12])
    text_norm = normalize_text(top_text)
    combined_norm = f"{filename_norm} {text_norm}".strip()
    compact_combined = compact_normalized_text(combined_norm)
    first_token = tokens[0]
    last_token = tokens[-1]

    exact_name_in_filename = normalized_name in filename_norm
    exact_name_in_text = normalized_name in text_norm
    exact_name_in_combined = normalized_name in combined_norm
    compact_exact_match = compact_name and compact_name in compact_combined
    first_present = first_token in combined_norm
    last_present = last_token in combined_norm
    all_present = all(token in combined_norm for token in tokens)
    significant_hits = sum(1 for token in tokens if token in combined_norm)
    token_ratio = significant_hits / len(tokens)
    seq_ratio = SequenceMatcher(None, normalized_name, combined_norm).ratio()

    if exact_name_in_filename or exact_name_in_text or exact_name_in_combined or compact_exact_match:
        return 1.0, "exact_name_match"

    if len(tokens) >= 2 and all_present:
        return 0.95, f"all_tokens_present={significant_hits}/{len(tokens)}"

    if len(tokens) >= 2 and first_present and last_present and token_ratio >= 0.66:
        return 0.88, f"first_last_present tokens={significant_hits}/{len(tokens)} seq={seq_ratio:.2f}"

    if len(tokens) == 2 and first_present and last_present:
        return 0.85, f"two_token_name_present seq={seq_ratio:.2f}"

    if len(tokens) >= 3 and token_ratio >= 0.8 and last_present:
        return 0.8, f"high_token_ratio tokens={significant_hits}/{len(tokens)} seq={seq_ratio:.2f}"

    if len(tokens) == 1 and first_present:
        return 0.6, f"single_token_present seq={seq_ratio:.2f}"

    return 0.0, f"insufficient_name_evidence tokens={significant_hits}/{len(tokens)} seq={seq_ratio:.2f}"


def main():
    raw_text = ATTACHMENT_PATH.read_text(encoding="utf-8")
    rows = [row for row in parse_rows(raw_text) if row["rating"].upper() in {"P0", "P1"}]

    resume_files = sorted(RESUME_DIR.glob("*.pdf*"))
    resume_cache = []
    for path in resume_files:
        try:
            text = pdf_text(path)
        except Exception:
            text = ""
        resume_cache.append(
            {
                "path": str(path),
                "name": path.name,
                "text": text,
            }
        )

    results = []
    used_paths = set()
    for row in rows:
        scored = []
        for resume in resume_cache:
            if resume["path"] in used_paths:
                continue
            score, reason = score_candidate(row["candidate"], Path(resume["path"]), resume["text"])
            if score > 0.34:
                scored.append((score, reason, resume))
        scored.sort(key=lambda item: item[0], reverse=True)

        best = scored[0] if scored else None
        matched_resume = best[2] if best else None
        if matched_resume:
            used_paths.add(matched_resume["path"])

        text = matched_resume["text"] if matched_resume else ""
        extracted_name = ""
        if text:
            first_lines = [clean_line(line) for line in text.splitlines() if clean_line(line)]
            extracted_name = first_lines[0] if first_lines else ""

        results.append(
            {
                **row,
                "resumeFile": matched_resume["name"] if matched_resume else "",
                "resumePath": matched_resume["path"] if matched_resume else "",
                "verifiedName": extracted_name,
                "email": extract_email(text) if text else "",
                "phone": extract_phone(text) if text else "",
                "matchScore": round(best[0], 4) if best else 0,
                "matchReason": best[1] if best else "no_match",
            }
        )

    OUTPUT_PATH.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    matched_count = sum(1 for item in results if item["resumeFile"])
    print(json.dumps({"p0_p1_count": len(results), "matched_count": matched_count, "output": str(OUTPUT_PATH)}, indent=2))


if __name__ == "__main__":
    main()

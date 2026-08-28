# Skill Matrix and Module Ownership

**Project:** VoiceTrace | **Developed by:** Team VoiceTracers | **Reference:** SIH 2026, PSID 260104

This file exists to make team division explicit before work starts: which module needs which skills, and who owns review of changes to it. Fill in the GitHub usernames once the team is finalized, then mirror the same names into `.github/CODEOWNERS`.

## 1. Module → Skill Requirements

| Module | Folder | Core skills needed | Nice to have |
|---|---|---|---|
| Detector | `/detector` | Python, PyTorch, basic audio signal processing (sample rate, windowing) | Prior exposure to speech/audio ML |
| Risk Engine | `/server/risk_engine.py` | Python, basic scoring/weighting logic design | Fraud/security domain thinking |
| API / Server | `/server` | Python, FastAPI, WebSockets, async programming | Twilio or telephony API experience |
| Dashboard | `/dashboard` | React, Tailwind/CSS, WebSocket client integration | Chart/data-viz libraries (Recharts, MUI) |
| Docs / SDLC | `/docs` | Technical writing, SRS/architecture documentation | SIH pitch-deck experience |

## 2. Suggested Team Assignment

| Role | Owns | Backup |
|---|---|---|
| ML lead | `/detector` | Risk engine formula tuning |
| Backend lead | `/server` (API, WebSockets, Twilio bridge) | Detector integration |
| Frontend lead | `/dashboard` | Demo script / presentation |
| Fourth member (if available) | `/docs`, integration testing, demo rehearsal | Floats across all modules as needed |

## 3. Ownership Table (fill in before first commit)

| Folder | Owner (GitHub username) |
|---|---|
| `/detector` | `@` |
| `/server` | `@` |
| `/dashboard` | `@` |
| `/docs` | `@` |

Copy this table's usernames directly into `.github/CODEOWNERS` so pull requests automatically request the right reviewer.

## 4. Working Agreement

- Each person branches off `main` for their module: `git checkout -b <name>/<feature>`.
- Cross-module changes (e.g. changing the JSON score contract in `ARCHITECTURE.md` Section 3) require a quick sync with the other owners before merging — that contract is the seam holding the three modules together.
- Merge to `main` via pull request; CODEOWNERS routes the review automatically.

# VoiceTrace vs. Capanicus.com — Full Comparative Audit & Upgrade Roadmap

**Prepared as:** a reverse-engineering-style teardown of both properties, followed by a gap analysis for taking VoiceTrace from "free hackathon dev-tool" to "capanicus.com-level public/commercial presence."
**Subjects:**
- **A — capanicus.com** — a 15-year-old IT outsourcing agency (VoIP/WebRTC/mobile/AI dev services), live commercial website
- **B — VoiceTrace** — SIH 2026 (PSID 260104) hackathon project, Team VoiceTracers — real-time voice-cloning/deepfake detection engine, currently source-code-only, no public web presence

**⚠️ Read section 0 first — it's a live security issue, not a comparison point.**

---

## 0. Immediate action required — credential exposure in the uploaded files

Before anything else in this report: **`ngrok.log` contains a partially-visible live `--authtoken` value in plaintext**, captured from a PowerShell command history line. Ngrok authtokens are tied to your account and, if fully leaked, let someone else spin up tunnels billed to (and trusted as) your identity — a real abuse/impersonation vector, not just noise.

**Do this now, regardless of anything else in this document:**
1. Rotate the ngrok authtoken from the ngrok dashboard (Auth → Your Authtokens → revoke + regenerate) — treat it as compromised even though only part of it is visible to me.
2. Delete `ngrok.log` from disk and make sure it was never committed to git (`git log --all --full-history -- ngrok.log`); if it was, that history needs scrubbing (`git filter-repo` or BFG), not just a new commit that deletes it.
3. Add `*.log` and `ngrok.log` explicitly to `.gitignore` (it's currently **not** in your `_gitignore`).
4. **`cloudflared.exe` (53 MB) should not live in the repo/uploads at all** — it's a third-party binary, Windows-specific, and bloats every clone. Add `*.exe` to `.gitignore` and document "install cloudflared separately" in the README instead.

This is the single highest-severity finding in this entire audit — higher than anything in the three QA reports below, because it's an active credential leak rather than a code-quality gap.

---

## Part A — capanicus.com: what "that level" actually consists of

Condensed from the earlier teardown, reframed around what's transferable to VoiceTrace:

| Dimension | What Capanicus has |
|---|---|
| **Public web presence** | Live domain, indexed, WordPress + Bootstrap/jQuery, SEO-optimized service pages |
| **Content marketing** | Monthly-cadence blog targeting keyword clusters (WebRTC, streaming, telemedicine) — 15+ years of accumulated topical authority |
| **Productized service pages** | 6 distinct service lines, each with its own landing page and CTA |
| **Social proof** | Client logo grid, "hundreds of clients," industries-served section |
| **Lead funnel** | Every page ends in a "Get in Touch" CTA wired to a contact form |
| **Credibility signals** | "15+ years," named tech stack (Asterisk/FreeSWITCH/Kamailio/A2Billing — the *exact* telephony stack VoiceTrace also touches) |
| **Technical depth** | Genuinely shallow — no evidence of novel IP, ML, or hard engineering; it's an outsourcing shop's marketing site, not a product |

**The honest read:** Capanicus is not a harder engineering achievement than VoiceTrace — it's a *business-presentation* achievement. VoiceTrace's actual technical core (a real spoof-detection model, streaming architecture, telephony integration attempts) is more technically ambitious than anything on capanicus.com. What Capanicus has that VoiceTrace doesn't is **packaging, distribution, and market presence** — a live site, content history, and a lead funnel. That's the gap to close, not the ML.

---

## Part B — VoiceTrace: consolidated engineering audit

Three independent audits exist in your files (`QA_AUDIT_REPORT.md`, `VoiceTrace_QA_Security_Audit_Report.md`, `VoiceTrace_QA_Audit_v2_SIH260104.md`), plus my own read of `config.yaml`, `docker-compose.yml`, `requirements.txt`, `CONTRIBUTING.md`, `implementation_plan.md`, and `asterisk_phase_prompts.md`. Consolidating them:

### B.1 — Architecture (verified from your files)

```
Ingress paths:          WebRTC (browser mic) │ Twilio Media Streams │ Asterisk AudioSocket (planned)
                                    │
                          StreamingDetector (1.0s window / 0.5s stride, 16kHz)
                                    │
                          BatchWorker → AASIST-L (~85K params, CPU, ~25ms/window)
                                    │
                          RiskEngine (weighted composite: spoof_prob 0.60,
                                      liveness 0.20, caller_ctx 0.10, txn_ctx 0.10)
                                    │
                          FastAPI + WebSocket broadcast → React dashboard
                                    │
                          (band == high) → incident report + Telegram alert
```

Supporting infra: `coturn` (TURN/STUN for WebRTC NAT traversal, Docker), Redis (optional pub/sub for multi-worker), SQLite via `aiosqlite` (call history — see B.3), ngrok/cloudflared for exposing localhost during demos.

This is a legitimate, non-trivial real-time ML system. That needs to be said plainly: the detection core is the hard part of this project, and it's real.

### B.2 — Timeline of findings across the three audits (this pattern matters)

Reading the audits in order reveals something more important than any single bug: **the fix cycles have been introducing new critical regressions as fast as they close old ones.**

| Audit | Headline finding | What happened next |
|---|---|---|
| **Audit 1** (`VoiceTrace_QA_Security_Audit_Report.md`) | Silent auth-bypass fallback to demo data; blocking PyTorch calls on the event loop; lock contention in the ring buffer | A fix commit (`antigravity/issue-fixes`) landed |
| **Audit 2** (`QA_AUDIT_REPORT.md`) | Broader pass — rated "Production-Ready with medium-priority improvements," found unbounded buffers, missing rate limiting, no graceful shutdown | Optimistic tone relative to what Audit 3 found on the same-era code |
| **Audit 3** (`VoiceTrace_QA_Audit_v2_SIH260104.md`, second pass post-fix) | **The fix pass broke the app entirely**: fail-closed auth ships with no default key and no doc update → every route 500s out of the box; the WS auth handshake was changed server-side but the frontend was never updated → **the real-time path is currently non-functional end-to-end**; the new batch-inference call now blocks the event loop directly (regressed from the old executor-offload pattern) | Not yet re-audited |

**The core lesson:** you don't currently have a stable "known-good" state to demo from without re-verifying the handshake yourself. Before touching anything else in this document, do a literal end-to-end smoke test — start the server, start the dashboard, make one call, confirm a score renders — because per Audit 3, that currently fails.

### B.3 — Full findings ledger (deduplicated, by severity)

**🔴 Critical**
1. **Credential leak** — ngrok authtoken in `ngrok.log` (this report, §0)
2. **WS auth handshake mismatch** — server expects a post-connect `{"type":"auth","api_key":...}` text frame; `useWebSocket.js`/`useMicStream.js` still send the key as a query param. Every WebSocket call currently fails after a 5s timeout. **This is the single most important fix — nothing else in the product works until this is closed.**
3. **Fail-closed with no default dev key** — `.env.example` ships `VOICETRACE_API_KEY` empty in some variants / `dev_key_123` in others (your two uploaded `.env`/`.env.example` files actually already set a default — good — but per Audit 3 this wasn't true at the commit they reviewed; **confirm this is still consistent across README, `.env.example`, and both frontend/backend before your next demo**)
4. **Silent fallback to mock/demo data on auth failure** (`useMicStream.js`) — a judge or user believes a live call is being scored when it's actually the hardcoded `DEMO_SEQUENCE`. This is worse than a crash because it fails silently and convincingly.
5. **ASR liveness challenge fails open** — `verify_response()` returns `True` on any exception, in the exact subsystem meant to catch spoofed responses. This directly undercuts the "prevention" half of your own PSID title.

**🟠 High**
6. Batch-inference forward pass now runs **on** the asyncio event loop (regression — used to be off it via `run_in_executor`) — every ~100ms batch freezes all WebSocket I/O for every concurrent call.
7. `speaker_embedding.py`'s `verify()`/`enroll()` also run PyTorch synchronously inside an `async def` — same class of bug, different file.
8. `np.concatenate` inside `streaming.py`'s lock — memory allocation while holding the lock stalls producer threads under load.
9. Dead code masquerading as a fix: `history_db.py` exists, has a docstring claiming it solves ephemeral-state loss, and is **never called from anywhere**. Call history still lives in browser `localStorage` only.
10. Voiceprint subsystem (`speaker_embedding.py`, `voiceprint_db.py`) is fully disconnected from any route, and its model checkpoints are unresolved Git LFS pointer files, not real weights — this capability doesn't exist despite being present in the tree.

**🟡 Medium**
11. Unbounded challenge-response audio buffer (no max size, only a "≥4s" trigger check)
12. No rate limiting per API key or per IP
13. `config/risk_weights.json` exists, is never read, and disagrees with the live weights in `config.yaml` — a landmine for the next person who edits the wrong file
14. Two divergent `StreamingDetector` implementations (`detector/stream.py` vs `detector/streaming.py`) with different, hardcoded windowing math — dead code that actively misleads
15. No graceful shutdown handler; no circuit breaker on model-load failure
16. Error messages leak internal exception text to API clients (`POST /analyze`)
17. `docs/ARCHITECTURE.md` still describes the pre-refactor pipeline — stale relative to the actual (and more complex) batch-worker design
18. Deprecated `ScriptProcessorNode` for mic capture (GC pressure, should migrate to `AudioWorklet`)

**🟢 Low / process**
19. Zero automated tests anywhere in the tree
20. `bump_fonts.py` is a blunt regex-based dev utility (bumps every `font-size`/`fontSize` by a flat +2 across the whole dashboard) — fine as a one-off, but it's exactly the kind of script that becomes a landmine if run twice or run against a file with a font size that shouldn't scale (e.g. an icon glyph sized in px)
21. `cloudflared.exe` and `ngrok.log` should never have been in a shareable folder (see §0)

### B.4 — What's genuinely strong (don't lose this in the fix-list noise)

- The **model choice and pipeline design** are sound: AASIST-L is an appropriate, lightweight, real spoof-detection architecture; the windowing/EMA-smoothing/composite-risk approach is a legitimate way to turn a per-window classifier into a stable, explainable, streaming risk signal.
- **Privacy-by-design is real, not marketing**: `retain_audio: false`, `retain_features: false`, explicit DPDP Act 2023 framing in `config.yaml` — this is more privacy engineering than most hackathon (or many commercial) projects bother with.
- **Config externalization discipline** (`CONTRIBUTING.md`'s "single source of truth" rule) is a good engineering habit that most of the bugs above are violations *of*, not evidence the rule is wrong.
- **The honesty of `implementation_plan.md`** — the "NOT 100% working, here's the real %" framing is exactly the right posture for a team that wants to actually ship, and it's rare to see a team audit their own hype this directly.
- **The Asterisk integration plan** (`asterisk_phase_prompts.md`) is well-sequenced and realistic (WSL2-native install to dodge the Docker-Desktop-on-Windows `--network=host` trap is a genuinely useful piece of debugging that most teams wouldn't find until demo day).

---

## Part C — Side-by-side: what each property is actually optimized for

These two things are not competitors — they're solving different problems. The comparison is useful precisely *because* it shows two different maturity axes:

| Axis | Capanicus.com | VoiceTrace (current) |
|---|---|---|
| Core technical difficulty | Low — templated agency site | High — real-time ML + telephony |
| Does the core thing work end-to-end today? | Yes (it's a website; websites mostly just work) | **No — WS auth handshake is broken per Audit 3** |
| Public presence | Live domain, 15 years of SEO | None — GitHub/local only |
| Security posture | Standard WP hardening concerns (plugin CVEs, generic) | Specific, audited, actively being fixed — but a live credential is currently leaked in your files |
| Business model clarity | Extremely clear (services → leads → contracts) | Undefined — hackathon submission, no stated path to product/OSS/business |
| Documentation | Marketing copy only, no technical docs | `README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md` (stale), `SRS.md` — more structured than Capanicus, just inward-facing |
| Test coverage | N/A | Zero |
| Cost to run | Real hosting spend | ₹0 (by design — `implementation_plan.md`) |

---

## Part D — Gap analysis: "free dev solution" → "Capanicus-level presence"

You said you want to keep this **free for developers** first, and separately want to reach Capanicus's level of public presence. Those two goals aren't in tension — Capanicus's actual moat is distribution, not paywalling. Here's what's structurally missing to get VoiceTrace from "a folder of files" to "a thing with a public identity," without giving up the free/open posture:

| Gap | What Capanicus has that VoiceTrace doesn't | Free-tier-compatible fix |
|---|---|---|
| No public landing page | Full marketing site | A single static page (GitHub Pages / Vercel free tier) — problem statement, live architecture diagram, demo video/GIF, "Try it" instructions. Zero cost. |
| No docs site | N/A (they don't need one) | Turn `docs/SRS.md` + `ARCHITECTURE.md` (once de-staled) into a rendered docs site — MkDocs or Docusaurus on GitHub Pages, free |
| No content/credibility trail | 15 years of blog posts | Not fakeable quickly — but a devlog (even 3–4 honest posts: "what we got wrong," "how AASIST-L was chosen," "the WSL2/Docker networking trap") builds the same kind of trust signal Capanicus gets from its blog, faster, because technical honesty reads as credible to the audience that matters for OSS |
| No visible "it works" proof | Client logos, "15+ years" | A recorded demo (30–60s screen capture of a real detection event triggering a dashboard spike) is worth more than any logo grid — but this requires §B.3 items #2–#5 to actually be fixed first, or the demo will be showing the mock fallback without realizing it |
| No clear licensing/positioning | N/A | `README.md` currently says "Add your team's chosen license before public submission" — this is still a placeholder. Pick MIT/Apache-2.0 now; "free for developers" isn't legally real until a license file exists |
| No install-from-scratch guarantee | N/A | Right now a fresh clone doesn't run (Audit 3, §1.1). "Free for developers" requires `git clone && follow README && it works` to be literally true. This is the highest-leverage fix for your stated goal — before any website work, this is what actually determines whether the "free dev solution" promise is real. |

---

## Part E — Recommended roadmap

### Phase 0 (today, before anything else)
- [ ] Rotate the leaked ngrok authtoken; purge `ngrok.log` / `cloudflared.exe` from anything shareable; update `.gitignore`

### Phase 1 — Make it actually run (1 week)
- [ ] Fix the WS auth handshake mismatch (Audit 3, §1.2) — send `{"type":"auth","api_key":...}` on `ws.onopen` in both `useWebSocket.js` and `useMicStream.js`; drop query-string auth
- [ ] Confirm `VOICETRACE_API_KEY` has a working, documented default across README + both `.env.example` files
- [ ] Remove the silent demo-data fallback on auth failure — fail loudly instead
- [ ] Fail-close the ASR challenge (`verify_response()` should return `False`, not `True`, on exception)
- [ ] Do one literal end-to-end smoke test and record it — this becomes your first real demo asset

### Phase 2 — Stability (1–2 weeks)
- [ ] Move batch inference and `speaker_embedding.verify()` off the event loop via `asyncio.to_thread`/executor
- [ ] Cap the challenge-response buffer and the streaming ring buffer
- [ ] Wire `history_db.py` into `batch_worker.py`/`connection_manager.py`, or delete it
- [ ] Delete `detector/stream.py` and `config/risk_weights.json` (or make them the source of truth and delete their duplicates)
- [ ] Add a minimal `tests/` covering the risk formula, the codec, and batch-worker windowing
- [ ] Update `ARCHITECTURE.md` to match the actual (batch-worker) pipeline

### Phase 3 — Make "free for developers" literally true (1 week)
- [ ] Add a real LICENSE file (MIT is the sane default per your own README)
- [ ] Verify `git clone → README steps → working demo` on a clean machine/VM, not just your dev box
- [ ] Publish the Asterisk WSL2 path as a documented, tested "Track A Demo Mode" (you already have the plan in `asterisk_phase_prompts.md` — finish executing it)

### Phase 4 — Capanicus-level public presence (parallel, ongoing)
- [ ] Static landing page (free hosting) with problem statement, architecture diagram, recorded demo
- [ ] Docs site from your existing `docs/` folder
- [ ] 3–5 honest devlog posts — the audit findings in this very document are, reframed, genuinely good content ("we found our own auth handshake was broken — here's how")
- [ ] Once Phase 1–2 are solid, a real end-to-end Twilio test call recording (per Audit 3 §6) is your single best credibility artifact — better than any logo grid Capanicus could show

### Phase 5 — Beyond Capanicus (where VoiceTrace can actually win)
Capanicus's ceiling is "trustworthy outsourcing shop." VoiceTrace's ceiling, if Phases 1–3 land, is "a real open-source security tool with a working demo, a documented architecture, and audited security posture publicly visible" — that's a stronger credibility position than a services agency's SEO blog, because it's *evidence*, not *marketing*. The roadmap above is explicitly sequenced so the credibility work in Phase 4 can't outrun the substance in Phases 1–2 — a polished landing page pointing at a product that fails on WS auth would be a worse outcome than the current "no website" state.

---

## Appendix — file-by-file notes from this upload batch

| File | Note |
|---|---|
| `_env` / `_env.example` | Consistent `dev_key_123` default present — good. Twilio auth token left blank, correctly not committed with a real value. |
| `_gitignore` | Solid coverage for Python/Node/models/DBs — missing `*.log` and `*.exe` (see §0) |
| `config.yaml` | Well-commented, DPDP-Act-aware, single source of truth as `CONTRIBUTING.md` promises — this file is the project's best-documented artifact |
| `docker-compose.yml` | Only defines `coturn` — Asterisk is correctly *not* in Docker per the WSL2 pivot in `implementation_plan.md`; consistent with that decision |
| `CONTRIBUTING.md` | Clear module ownership and data-contract rules — good process design, currently under-enforced by the code (see risk_weights.json duplication) |
| `implementation_plan.md` | The most self-aware document in the set — accurately separates proven vs. unbuilt, and correctly diagnosed the Docker-Desktop-on-Windows `--network=host` trap before it wasted demo-day time |
| `requirements.txt` | Reasonable and current (FastAPI 0.110+, Pydantic 2.6+, Torch 2.0+); `speechbrain` + `pyttsx3` + `edge-tts` confirm the voiceprint/TTS-sample subsystems exist in dependency form even though (per Audit 3) they're dead in code |
| `bump_fonts.py` | Utility script, not part of the product — flagged in §B.3 as a one-off risk, not a security issue |

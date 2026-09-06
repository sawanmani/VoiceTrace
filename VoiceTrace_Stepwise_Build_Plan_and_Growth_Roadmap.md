# VoiceTrace — Stepwise Build Plan: Basic → Advanced, Free-for-Developers Now, USP-Driven Growth Later

**Purpose of this document:** a literal, do-this-then-that build plan for VoiceTrace, ordered from "the repo doesn't even boot correctly" to "a platform with a defensible commercial edge" — without ever making the developer-facing core stop being free. Two tracks run in parallel from Level 3 onward:

- **Track F (Free Core)** — stays MIT/Apache-licensed, self-hostable, forever free. This is the trust foundation everything else stands on.
- **Track G (Growth)** — optional layers on top (hosting, support, enterprise features) that make money *without* touching what Track F gives away.

Everything is grounded in your actual repo state (from the three audits + `config.yaml`/`docker-compose.yml`/`requirements.txt`/`asterisk_phase_prompts.md`), not generic advice.

---

## How to read this document

Each Level has:
- **Goal** — the one-sentence definition of "done" for that level
- **Steps** — numbered, concrete, in order
- **Exit criteria** — the test that proves you're actually done, not just busy
- **Who can do this** — 🟢 good first contribution / 🟡 needs repo context / 🔴 core-team only
- **Est. effort** — from the audits' own estimates where available

---

## LEVEL 0 — Stop the bleeding (today, before any building)

**Goal:** nothing sensitive is exposed, and you have an honest baseline of what's broken.

**Steps:**
1. 🔴 Rotate the leaked ngrok authtoken (ngrok dashboard → revoke + regenerate).
2. 🔴 Delete `ngrok.log`, `cloudflared.exe` from anywhere they've been shared; check `git log --all --full-history -- ngrok.log` — if it was ever committed, scrub history with `git filter-repo`, don't just delete-and-commit.
3. 🟢 Add to `.gitignore`: `*.log`, `*.exe`, `cloudflared*`.
4. 🔴 Run the app once, end to end, on a clean checkout, and write down exactly what breaks. (Per Audit 3, expect the WebSocket auth handshake to fail — confirm this yourself rather than trusting the audit is still accurate; things may have moved.)

**Exit criteria:** no live secrets in any shared location; you have a fresh, personally-verified list of what currently works vs. doesn't.

**Effort:** 1–2 hours.

---

## LEVEL 1 — Make it run (Track F foundation)

**Goal:** `git clone → follow README → it works`, literally, on a clean machine. This is the single highest-leverage thing you can do — nothing below matters if this isn't true, and it's the actual definition of "free for developers" (a free thing that doesn't run isn't free, it's a time cost).

**Steps:**
1. 🔴 **Fix the WS auth handshake mismatch.** The backend expects a post-connect `{"type":"auth","api_key":...}` text frame; `useWebSocket.js` and `useMicStream.js` currently send the key as a query string instead. In both hooks, on `ws.onopen`, send the auth frame first, before anything else:
   ```js
   ws.onopen = () => {
     ws.send(JSON.stringify({ type: 'auth', api_key: apiKey }));
     // ...then proceed with normal logic
   };
   ```
   Drop the `?api_key=` query-string path entirely so there's only one code path to maintain.
2. 🔴 **Remove the silent demo-data fallback** in `useMicStream.js`. On auth failure or WS error, surface a visible error state in the UI instead of silently switching to `DEMO_SEQUENCE`. A free dev tool that lies to you about whether it's working is worse than one that visibly fails.
3. 🟡 Confirm `VOICETRACE_API_KEY` has one consistent default across: `README.md`, `_env.example`, `dashboard/.env` — all three currently need to agree or a new contributor hits a wall in minute one.
4. 🟡 Write down the literal first-run sequence as a numbered checklist in the README (not prose) — `pip install`, `npm install`, which `.env` files to copy where, which command starts what, in what order, and what URL to open.
5. 🟢 Add a `scripts/smoke_test.sh` (or `.ps1` for Windows, since your dev environment is Windows/WSL2) that: starts the server, waits for `/health` to return 200, opens a test WebSocket, sends a known test audio chunk, and asserts a score comes back. This becomes your CI gate later.

**Exit criteria:** a teammate who has never touched the repo can clone it, follow the README top-to-bottom, and see a real (not mock) risk score appear on the dashboard from their own microphone — timed, under 10 minutes.

**Effort:** 3–5 days (matches Audit 3's priority-1/2 estimate).

---

## LEVEL 2 — Make it stable under real use

**Goal:** the system doesn't fall over, silently misbehave, or lie about its own state under normal multi-call use.

**Steps:**
1. 🔴 **Fail-close the ASR liveness challenge.** `verify_response()` currently returns `True` on any exception — this is the exact subsystem meant to catch a spoofed response, and it's fault-tolerant in the wrong direction. Flip the default to `False` and log the exception.
2. 🔴 **Move blocking ML calls off the event loop.** Two places need this:
   - `batch_worker.py`'s forward pass — wrap in `await loop.run_in_executor(None, sync_forward_fn)`
   - `speaker_embedding.py`'s `verify()`/`enroll()` — same pattern, via `asyncio.to_thread()`
   Test this specifically with **2+ concurrent simulated calls** — the bug is invisible with one call and gets worse exactly under the load the batching worker exists to handle.
3. 🟡 **Fix the lock-held allocation** in `streaming.py`: move `np.concatenate`/array copying outside the `with self._lock:` block, or work on raw bytes and convert after releasing the lock.
4. 🟡 **Cap every unbounded buffer**: the ASR challenge-response buffer (add a hard max, not just a "≥4s" trigger check) and the streaming ring buffer.
5. 🟡 **Resolve the dead-code landmines** — pick one and delete the other for each pair:
   - `history_db.py` — either wire `log_event`/`save_call` into `batch_worker.py`/`connection_manager.disconnect_call`, or delete the file. Right now it's worse than absent, because its docstring claims a fix that doesn't exist.
   - `detector/stream.py` vs `detector/streaming.py` — delete `stream.py`, it's an unused, contradictory second implementation.
   - `config/risk_weights.json` vs `config.yaml` — delete the JSON file; `config.yaml` is the one actually read.
6. 🟢 Add a graceful shutdown hook (`@app.on_event("shutdown")`) that drains the batch queue and closes WebSockets cleanly.

**Exit criteria:** run 5 concurrent simulated calls for 5 minutes; no frozen dashboard updates, no memory growth, no crash, and killing the server with Ctrl+C doesn't corrupt state.

**Effort:** ~1–2 weeks.

---

## LEVEL 3 — Make it a real developer tool (Track F formalizes here)

**Goal:** VoiceTrace stops being "a folder that works on my machine" and becomes something a stranger can adopt, extend, and trust — this is where "free for developers" becomes a real product claim rather than an aspiration.

**Steps:**
1. 🔴 **Add a LICENSE file.** Your README currently says "Add your team's chosen license before public submission" — this is still a placeholder. Pick MIT (matches your own README's stated default) and add the actual `LICENSE` file. Nothing below this line is legally "free for developers" without it.
2. 🟡 **Write a real `ARCHITECTURE.md`** matching the *current* batch-worker pipeline (per Audit 3, the existing doc still describes the pre-refactor, non-batched design). Include the ingress-path diagram, the risk-scoring formula, and the auth flow.
3. 🟢 **Add a minimal test suite** (`tests/`) covering exactly what the audits flagged as untested:
   - `RiskEngine` composite-score math against `config.yaml`'s weights
   - The µ-law/PCM codec functions (`decode_twilio_chunk`, `_resample`)
   - `BatchWorker`'s windowing/stride math (this is precisely where the last regression hid — regression-proof it)
4. 🟢 **Wire the smoke test from Level 1 into CI** (GitHub Actions, free for public repos) so a broken WS handshake never ships to `main` silently again.
5. 🟡 **Publish a working "Demo Mode"** using the WSL2-native Asterisk path already planned in `asterisk_phase_prompts.md` — finish executing Phases 1–5 there, and document it as the zero-cost way to try VoiceTrace against a real SIP call, not just a browser mic.
6. 🟢 **Add `CONTRIBUTING.md`'s "good first issue" ladder** — literally label the Level 2 dead-code cleanups above as GitHub issues tagged `good-first-issue`; they're self-contained, well-specified, and low-risk. This is free contributor-acquisition and directly serves the "developer friendly" goal.
7. 🟡 **Document the API contract formally** — you already get Swagger/OpenAPI for free from FastAPI at `/docs`; link it from the README and add example `curl`/websocket-client snippets for `POST /analyze` and `WS /ws/call/{id}`.

**Exit criteria:** a developer who has never spoken to your team can (a) install it, (b) understand the architecture from docs alone, (c) run the test suite, (d) find and complete a `good-first-issue`, and (e) get a PR merged — without a single Slack/Discord message to your team.

**Effort:** ~2–3 weeks, parallelizable across contributors once Level 1–2 are stable.

---

## LEVEL 4 — Make it a platform (bridge between Track F and Track G)

**Goal:** VoiceTrace becomes something other tools plug into, not just a standalone app — this is what turns "a project" into "infrastructure," and infrastructure is what has commercial pull later without gatekeeping the core.

**Steps:**
1. 🟡 **Formalize the three ingress paths as a plugin interface** — WebRTC, Twilio, Asterisk/AudioSocket currently each have bespoke wiring. Extract a common `AudioSource` interface (`connect() → async iterator of PCM chunks`) so a fourth provider (e.g. Exotel, Ozonetel, Vonage — relevant for the Indian market Capanicus-style shops actually serve) is a contributor task, not a core-team rewrite.
2. 🟡 **Export the model to ONNX** (`deploy/onnx_export.py` already exists per Audit 3) and publish it — this unlocks on-device/mobile inference (relevant to the "detect on my personal phone" ambition flagged in Audit 3 §6) without you having to build the mobile app yourself.
3. 🟢 **Publish a minimal SDK/client library** (Python + JS) that wraps the WebSocket contract — `pip install voicetrace-client` / `npm install voicetrace-client` — so integrating VoiceTrace into someone else's call-center stack doesn't require reading your source.
4. 🟡 **Add a webhook/event system** for the incident-report flow (`generate_incident_report`) so third parties can receive `high`-band events without a direct WebSocket subscription — this is the seam where a future hosted/enterprise tier attaches cleanly later.
5. 🔴 **Load-test it for real** (Locust/K6, per the existing QA audit's own recommendation) and publish the numbers. "Handles N concurrent calls at P95 latency of X ms, on a $Y VPS" is a credibility artifact no amount of marketing copy can fake — and it's exactly the kind of evidence-based credibility that beats a services agency's SEO blog (see the earlier Capanicus comparison).

**Exit criteria:** a third party can integrate VoiceTrace into their own call pipeline using only the SDK + webhook docs, with zero VoiceTrace-team involvement, and you have published, reproducible load numbers.

**Effort:** 1–2 months, and this is genuinely "core team + community" work, not solo.

---

## LEVEL 5 — Track G: USP-driven growth (optional, doesn't touch Track F)

**Goal:** turn real technical differentiators into a business model, without ever making the self-hosted core less capable or less free.

### 5.1 — What your actual USPs are (be honest about this — don't invent ones)

| USP | Why it's real (not marketing fluff) | Who it matters to |
|---|---|---|
| **CPU-only, ~85K-parameter model** | Most spoof-detection research targets GPU inference; AASIST-L running well on CPU is a genuine deployability edge for anyone without ML infra | Call centers, SMBs, anyone who can't run GPU inference at the edge |
| **Privacy-by-design, DPDP Act 2023-aware** | `retain_audio: false` / `retain_features: false` isn't a checkbox, it's architectural — no code path persists raw audio at all | Indian enterprises (regulatory requirement), and globally as a trust signal |
| **Telephony-agnostic** | WebRTC + Twilio + Asterisk/AudioSocket in one system means you're not locked to one vendor the way most commercial anti-fraud voice tools are | Anyone who's already invested in a specific telephony stack |
| **Explainable composite risk, not a black box** | The weighted breakdown (`spoof_prob`/`liveness`/`caller_context`/`transaction_context`) is auditable — you can show *why* a score is what it is | Compliance/fraud teams who need to justify a block/allow decision |
| **Self-hostable, source-visible** | Enterprises with data-residency requirements can't send call audio to a third-party cloud API — a self-hosted option is structurally the only thing that satisfies that | Regulated industries (banking, healthcare, government) |

Notably: **your competitors (Pindrop, Nuance Gatekeeper, and similar commercial voice-fraud tools) are closed-source, cloud-only, and enterprise-priced.** "Open, self-hostable, CPU-friendly, and free at the core" is a real gap in that market, not a hypothetical one — but it only works if Levels 1–4 above are actually true first. A USP built on a system whose WS handshake doesn't work is not a USP, it's a claim you can't back up under a live demo.

### 5.2 — Growth layers that don't compromise the free core (open-core model)

1. **Hosted/managed tier (Track G revenue #1):** "Run VoiceTrace yourself for free forever, or let us run it for you" — same OSS core, you charge for uptime/ops/support, not for the detection capability itself. This is the standard, trust-preserving open-core pattern (GitLab, Sentry, Supabase all do this).
2. **Enterprise features that are genuinely enterprise-only, not artificially withheld:** SSO/SAML, audit-log retention/export, multi-tenant admin dashboards, SLA-backed support. None of these make the free single-tenant core worse.
3. **Certification/benchmark leadership:** publish your model's performance on public spoof-detection benchmarks (ASVspoof, etc.) and keep it updated — becoming *the* credible open number in this space is a moat competitors can't easily buy.
4. **Marketplace for `AudioSource` plugins** (from Level 4.1) — third parties build connectors for regional telephony providers (Exotel, Ozonetel, Knowlarity — the same names in your own `implementation_plan.md` cost table); you can eventually offer a hosted plugin directory without owning every integration yourself.
5. **Training-data/consulting arm** — the exact kind of custom-integration work Capanicus sells (VoIP/telephony dev services) is a legitimate adjacent revenue line for you specifically *because* you'll have deeper Asterisk/FreeSWITCH/telephony expertise than a generic agency once Level 4 is done — you'd be competing with Capanicus's own service category, except backed by a real open-source product instead of a portfolio site.

### 5.3 — Sequencing rule for Track G

**Do not start Level 5 work before Level 1–3 are solid.** A hosted tier or enterprise pitch built on top of a system where the free version doesn't reliably run (current state, per Audit 3) will burn credibility faster than it builds revenue — and unlike a marketing site, a broken live demo in front of a paying prospect is not recoverable in the same meeting.

---

## The contributor ladder (developer-friendliness, made concrete)

For "more developer friendly" to mean something, tasks need to exist at every skill level, clearly labeled:

| Tier | Example task (from this document) | Skill needed |
|---|---|---|
| 🟢 First PR | Delete `detector/stream.py`, update its one internal reference | Can read Python, follow instructions |
| 🟢 First PR | Add `*.log`/`*.exe` to `.gitignore`, write the smoke-test script | Basic shell scripting |
| 🟡 Second PR | Write the `RiskEngine` unit test against `config.yaml` weights | Understands pytest, reads one file's logic |
| 🟡 Intermediate | Fix the WS auth handshake in both frontend hooks | Needs to understand the client/server contract |
| 🟡 Intermediate | Extract the `AudioSource` plugin interface (Level 4.1) | Needs to understand all three ingress paths |
| 🔴 Core team | Move batch inference off the event loop under load-tested conditions | Needs to understand asyncio + the model's real-time constraints |
| 🔴 Core team | Load-testing + publishing performance numbers | Needs infra access + benchmarking discipline |

Publishing this table (or one like it) directly in `CONTRIBUTING.md`, with real GitHub issue links per row, is itself a Level 3 deliverable — it's the difference between "we welcome contributions" as a sentence and as a functioning on-ramp.

---

## One-page summary

```
Level 0  Stop the bleeding            → rotate secrets, gitignore fixed          [hours]
Level 1  Make it run                  → WS auth fixed, clean-clone works         [days]
Level 2  Make it stable               → fail-closed, off-loop inference, caps    [1-2 wks]
Level 3  Real dev tool (Track F)      → license, tests, docs, CI, contributor ladder [2-3 wks]
Level 4  Platform                     → plugin interface, SDK, load-tested numbers [1-2 mo]
Level 5  USP-driven growth (Track G)  → hosted tier, enterprise features, benchmarks [ongoing]
```

The free core (Track F) is everything through Level 4 — that's the whole product, self-hostable, forever. Track G is a business built *on top of* proven infrastructure, not a paywall bolted onto broken software. The order above is the order that actually protects the "free for developers" promise: you can't monetize trust you haven't earned yet, and right now (per your own audits) Level 1 isn't finished — that's where today's work starts.

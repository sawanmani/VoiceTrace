# VoiceTrace — Second-Pass QA Audit (post `32ca355`)

**Repo state:** `main` @ `3040d3d` (merge of `antigravity/issue-fixes`, "fix: resolve security, concurrency and connection issues", Aug 29 2026) — pulled fresh on top of the previous audit's commit `f0a4b64`.
**PSID:** 260104 — AI-Powered Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks.

The team clearly worked through the first report — the fail-open-by-default posture is gone in places, a batching architecture was added for throughput, and call history got a real DB. Good instincts. But the fix pass introduced two new, more severe problems than the ones it closed, and left the two biggest structural issues (dead voiceprint subsystem, orphaned config) untouched. I'll go hardest on what's actually broken right now, then do the requirements/alignment pass, then answer the real-time-call question directly.

---

## 1. What's broken *right now*, on a fresh clone

### 1.1 CRITICAL — the app does not run out of the box anymore

`server/main.py`'s new `ApiKeyMiddleware` and `_verify_ws_key_payload` both **fail closed if `VOICETRACE_API_KEY` is unset**:

```python
if not _API_KEY:
    return JSONResponse({"detail": "Server API key not configured (fail closed)"}, status_code=500)
```
```python
if not _API_KEY:
    await websocket.close(code=1011, reason="Server API key not configured")
    return False
```

`.env.example` does not set `VOICETRACE_API_KEY`. Nothing in the README, `CONTRIBUTING.md`, or `docs/ARCHITECTURE.md` mentions this variable. Follow the README's own setup steps exactly and:
- `POST /analyze` → `500`
- `WS /ws/call/{id}`, `/ws/score`, `/ws/twilio` → connection immediately closed

That's every route except `/health`. **Fail-closed auth was the right instinct** (I flagged fail-open as the top issue last time) — but shipping it with no default key, no doc update, and no dev-mode bypass means the fix didn't hollow out the vulnerability, it just replaced "insecure but demoable" with "secure but non-functional." Either ship a generated dev key in `.env.example` with a loud warning, or explicitly document that `VOICETRACE_API_KEY` is a hard prerequisite before "getting started" — right now a teammate or a judge will hit a wall in the first minute.

### 1.2 CRITICAL — even with a key set, the WebSocket auth handshake is broken between frontend and backend

This is the one to fix first. The backend's `_verify_ws_key_payload` now expects the **client to send a text frame after connecting**:

```python
message = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
data = json.loads(message)
if data.get("type") == "auth" and data.get("api_key") == _API_KEY:
    return True
```

The frontend (`dashboard/src/hooks/useWebSocket.js`) was **not touched by this commit**. It still does the old thing — appends the key as a query string and never sends any post-connect frame:

```js
const wsUrl = apiKey ? `${url}?api_key=${encodeURIComponent(apiKey)}` : url
const ws = new WebSocket(wsUrl)
```

The server no longer reads the query string at all. Result: set `VOICETRACE_API_KEY` and `VITE_API_KEY` correctly on both sides, and the dashboard **still can't connect** — every WS closes with code 1008 "Unauthorized" 5 seconds after connecting (or immediately, since the client never sends anything and the server's `receive_text()` will just wait out the 5s timeout, then close). I checked every page that calls `useWebSocket` (`Dashboard.jsx` → `/ws/score`; the call flow presumably in `useSession`/`useMicStream` → `/ws/call/{id}`) — none of them implement the new handshake.

**This means the real-time detection path — the entire point of the product — is currently non-functional on `main`, whether or not you configure an API key.** This isn't a style nit; it's the headline finding.

**Fix (concrete):** in `useWebSocket.js`'s `ws.onopen`, send `ws.send(JSON.stringify({type: 'auth', api_key: apiKey}))` immediately, before anything else, and drop the query-string logic. Test it — don't just eyeball it, since this exact class of bug (client/server contract silently diverging) is what caused this.

### 1.3 HIGH — the new batching worker blocks the asyncio event loop during every inference batch

`server/batch_worker.py` was added specifically to fix throughput/concurrency, and it's a reasonable design (drain all calls' ready windows every 100ms, batch them into one forward pass). But the forward pass itself runs **directly on the event loop, with no executor**:

```python
with torch.no_grad():
    last_hidden, logits = model(x)   # <-- blocks the entire asyncio loop
```

Compare this to the code it replaced (`_process_audio_chunk` in the old `main.py`), which ran inference via `loop.run_in_executor(...)` — off the event loop. That offloading is gone. While this batched forward pass runs (CPU inference on a stack of up to `MAX_CALLS` windows, each 64,600 samples), **no other coroutine can run**: no WebSocket frame is read or written for *any* call, `/health` stalls, new connections can't be accepted. It happens every ~100ms, for as long as inference takes.

For one call this might be tolerable. For a live demo with multiple concurrent calls (which is the batching worker's own justification for existing), this is a self-inflicted stutter that gets *worse* precisely when the system is under the load it was built to handle — the batching optimization increases per-tick batch size, which increases the freeze duration, which then applies to every other call sharing the loop. This directly undercuts NFR-1 ("risk score delivered within 2-3 seconds") under any real concurrency, and it'll be visible as dropped/delayed dashboard updates in a demo.

**Fix:** wrap the model call in `await loop.run_in_executor(None, lambda: model(x))` (note: can't use `torch.no_grad()` as a context manager across a thread boundary cleanly — move the no_grad + forward pass into a plain sync function and execute that in the executor).

### 1.4 MEDIUM — `history_db.py` is dead code that claims to fix the exact bug it doesn't fix

`server/history_db.py` was added in the same commit, with a docstring claiming it "Prevents the 'Ephemeral State' vulnerability where all history is lost on server restart." I grepped the entire `server/` tree: **`init_db`, `log_event`, `save_call`, and `get_recent_calls` are never called from anywhere.** `batch_worker.py` doesn't call `log_event` when it broadcasts a risk event; nothing calls `save_call` when a call ends. Call history still lives entirely in the browser's `localStorage` (`CallHistory.jsx`), which is exactly the ephemeral behavior this file's own docstring says it fixes.

This is worse than the file simply not existing, because a teammate reviewing the diff will reasonably conclude the ephemeral-state issue is closed. It isn't. Either wire `log_event`/`save_call` into `batch_worker.py` and `connection_manager.disconnect_call`, or pull the file until it's actually used.

---

## 2. Issues carried over from the first audit (unchanged)

- **`config/risk_weights.json`** is still present, still unread by any code, and still disagrees with `config.yaml`'s live weights. Not touched in either fix commit.
- **The voiceprint subsystem is still fully dead and still built on corrupted checkpoints.** `detector/speaker_embedding.py` and `server/voiceprint_db.py` remain unwired to any route; `models/spk_cache/*.ckpt` are still raw Git LFS pointer text files, not real weights (confirmed again on this pull — `models/spk_cache/embedding_model.ckpt` is still a `version https://git-lfs.github.com/spec/v1 ...` pointer, not an 83MB binary). This subsystem got *more* company files added this pull (`config.json`, `example1.wav`, `example2.flac`, `hyperparams.yaml`, `label_encoder.txt` all now sitting in `models/spk_cache/`) — someone re-ran the SpeechBrain download and committed the cache directory again, compounding the same mistake rather than fixing it.
- **The ASR challenge still fails open.** `server/challenge.py` wasn't touched by either fix commit — `verify_response()` still returns `True` on any exception. This is still the single biggest security gap relative to the product's stated purpose, and it wasn't part of either "fix" pass despite being flagged.
- **Still zero automated tests.** No `tests/` directory exists anywhere in the tree.
- **`detector/stream.py` vs `detector/streaming.py`**: a second, older, unused `StreamingDetector` implementation (`detector/stream.py`, 110 lines, a *different, non-batched, non-buffered* design with 2s windows / 1s hop hardcoded, contradicting `config.yaml`'s 1s/0.5s) sits in the tree with no imports anywhere except its own `__main__` block. This is confusing dead code that will actively mislead anyone who greps for "StreamingDetector" and finds two answers with different windowing math.

## 3. New alignment check: docs vs. code

`docs/ARCHITECTURE.md` still describes the pre-refactor pipeline verbatim: `"Chunker → StreamingDetector → RiskEngine → WebSocket"`, one detector per call scoring synchronously per chunk. It has **no mention of**:
- the batch worker / dynamic batching design (the biggest architectural change in the repo)
- the API-key requirement or the WS auth handshake
- `call_manager.py` / `history_db.py` as separate components

If a judge reads `ARCHITECTURE.md` and then reads `main.py`, they won't match. For an SIH round that scores on both technical depth and communication, a stale architecture doc next to a materially different implementation reads as unreviewed work — update it in the same PR as the refactor, not after.

---

## 4. Priority fix order (do these before anything else)

1. **Fix the WS auth handshake mismatch (§1.2)** — nothing else matters if the client can't talk to the server at all.
2. **Ship a working default (`VOICETRACE_API_KEY`) for dev/demo, and document it (§1.1).**
3. **Move the batch inference call off the event loop (§1.3).**
4. **Fail-close the ASR challenge (§1 of the previous audit, still open) — this is now the oldest unresolved critical finding.**
5. **Wire or delete `history_db.py` (§1.4)**, delete or fix `config/risk_weights.json`, delete `detector/stream.py`, and either finish or remove the voiceprint subsystem and its broken cache files.
6. Add even a minimal `tests/` covering the risk-score formula, the µ-law codec, and — now — the batch worker's windowing math, since that's exactly where the last regression hid.

---

## 5. How far along are you against the PSID goals?

Being direct about this, because it matters more than any individual bug: **the ML/detection core is genuinely good and close to PSID-complete; the delivery layer around it is currently the weak point, and right now it's actively regressed relative to two weeks ago.**

| PSID requirement area | State |
|---|---|
| Real-time-style streaming classification (FR-1–4) | Model, windowing, EMA smoothing, composite risk score all real and reasonably sound. **This is the strongest part of the submission.** |
| Live push of scores + recommendations (FR-6–8) | Implemented correctly in isolation, but **currently unreachable** from the shipped frontend due to §1.1/§1.2. On paper, done; in practice, demo-breaking. |
| Explainable sub-scores (FR-5, NFR-3) | Present but not defensible under questioning — they're unvalidated slices of an opaque hidden vector, not measured features. Fine as a placeholder, not fine as a claimed capability. |
| Liveness / anti-spoofing challenge (implied by the "prevention," not just "detection," half of the PSID title) | Implemented but fails open — the one place where the gap between "looks done" and "is done" is most consequential. |
| Caller-identity / voiceprint matching (mentioned as a stretch signal) | Not real. Disconnected, and the checkpoint it needs doesn't exist in the repo. |
| Config-driven, auditable, privacy-conscious design (NFR-2, NFR-5) | Mostly genuine (no raw audio persisted, CPU-only, config-driven thresholds) but undermined by the orphaned config file and the dead-but-documented history DB. |
| Actual real-time telephony integration (i.e., detecting a *live phone call*, not a simulated stream/file) | **Not attempted yet.** This is the biggest gap between what's built and what "real-time voice call detection" implies, and it's the subject of your next question — see §6. |

If I had to score it as a judge would: the detection science and backend architecture would read as "strong technical foundation, clearly more than a weekend of work." The delivery/integration layer would currently read as "broken on the day of the demo" unless §1.1–§1.3 are fixed, and the anti-spoofing/voiceprint claims would not survive direct questioning. Fixing the five items in §4 gets you back to where the *code* already claims to be. Getting to a genuinely "real-time phone call" system is a separate, larger jump — below.

---

## 6. Getting from "web-based simulation" to "detects real phone calls" — and the incoming-call popup idea

Your instinct (pop up an alert on incoming calls) is the right end-user shape, but it implies a very different architecture than what's built, because **a web dashboard, by design, cannot see or intercept a phone call.** The browser has no access to the telephony stack. To get from here to "a popup fires while someone is on a call," you need to solve three separate problems, in this order:

### Step 1 — decide *whose* calls you're protecting, because it changes everything

- **Call-center / enterprise inbound lines** (an organization's support line, a bank's IVR): you control the infrastructure. This is the realistic path for VoiceTrace as built, and it's what your Twilio Media Streams bridge (`/ws/twilio`) already targets. A telephony provider (Twilio, Exotel, Ozonetel — Indian providers matter for an SIH judge) forks live call audio to your WebSocket in real time; no phone/OS integration needed at all. This is 80% built already — the gap is fixing §1.1–§1.3 so the pipe actually works, plus load-testing it with real concurrent calls.
- **An individual's personal phone** (the "popup on my incoming call" framing you described): this is a fundamentally different, much harder problem, because you don't control the call path — the carrier does. There is no way for a third-party app to get live audio off a normal cellular voice call on iOS at all (Apple doesn't expose it, full stop), and on Android it's possible but requires either (a) the call to be a VoIP call your own app places/receives (WebRTC, not the cellular network), or (b) an on-device accessibility/call-recording hack that most Android versions restrict and Play Store policy discourages for exactly the reasons that make it powerful for fraud detection.

**Be explicit with your judges about which of these two you're building**, because "detect voice cloning on any incoming phone call" and "detect voice cloning on calls routed through our platform" are different products with different feasibility, and conflating them is the fastest way to lose credibility in Q&A.

### Step 2 — for the platform/carrier path (realistic for SIH scope): what to actually build next

1. Fix §1.1–§1.3 so the existing Twilio bridge is reliable under concurrency.
2. Add a real end-to-end test: place an actual Twilio test call (or use their audio-injection sandbox), feed it a known TTS clip mid-call, and confirm a `high` band event reaches the dashboard within your latency budget. This is the single most convincing demo artifact you could add — "here's a live inbound call, watch the score spike" beats any slide.
3. Build the "popup" as a **push notification to the agent's screen** (the call-center agent's dashboard, via the existing `/ws/score` channel you already broadcast on) rather than a phone-OS popup — that's a UI feature on top of what you have, not new plumbing.
4. If a consumer-facing angle is wanted, frame it as a **VoIP app you control** (a WebRTC-based calling app, or a browser extension that hooks WebRTC calls in Chrome for services like Google Meet/WhatsApp Web) — that's technically reachable with a MediaStream tap, unlike cellular calls.

### Step 3 — for the "my personal phone" path (harder, longer-term): what it would actually take

1. **Android only, realistically.** Use `CallScreeningService`/`InCallService` (Android's official call-screening APIs, used by Truecaller-style apps) to get call *metadata* (number, state) — this does **not** give you audio. For audio, you'd need the user to route the call through your app as a VoIP call, or use `AudioRecord` during a call with `RECORD_AUDIO` + special carrier/OEM permissions that vary by device and increasingly get blocked (Android 10+ restricts in-call audio capture heavily). Expect this to be a research spike, not a sprint task, and expect it to work inconsistently across OEMs.
2. If audio access is solved, on-device inference matters (privacy + latency + no dependency on a live connection to your server for something as sensitive as an ongoing personal call). Your model is CPU-only and reasonably small (AASIST-L) — export it via `deploy/onnx_export.py` (which already exists in your repo) to ONNX Runtime Mobile or TFLite, and run the classifier on-device. Don't ship a cloud round-trip for every 0.5s window on someone's personal call — that's both a privacy red flag and a latency/battery problem.
3. Popup UI = a foreground service + a system alert window (`SYSTEM_ALERT_WINDOW` permission) that overlays during an active call. This is exactly what call-blocking apps already do, so it's a known pattern — the hard part is Step 3.1, not the popup itself.

### Honest recommendation

For an SIH submission with limited runway left, **don't chase the personal-phone popup** — it's a multi-month systems-integration project across carrier/OS boundaries that has little to do with your actual contribution (the detection model). Spend the remaining time making the **carrier/Twilio path rock-solid and demoable end-to-end**, and pitch the personal-phone client as clearly-labeled future work / roadmap in your deck. Judges reward a narrow thing that provably works over a broad thing that's stubbed — and right now, per §1, even the narrow thing doesn't run. Close that gap first.

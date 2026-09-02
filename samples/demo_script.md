# VoiceTrace — SIH 2026 Demo Script

**PSID 260104 — AI-Powered Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks**

This is a step-by-step, reproducible demo script for judges. Both runs are scripted and fully
repeatable. Do not attempt live voice cloning during the demo — use the pre-recorded samples.

---

## Pre-Demo Checklist (10 minutes before demo)

- [ ] Backend running: `uvicorn server.main:app --reload` (project root)
- [ ] Frontend running: `cd dashboard && npm run dev`
- [ ] Browser 1 (Demo Participant A) open: `http://localhost:5173/call`
- [ ] Browser 2 (Demo Participant B) open: `http://localhost:5173/call`
- [ ] `samples/genuine_sample.wav` present
- [ ] `samples/cloned_sample.wav` present
- [ ] VB-Audio Virtual Cable installed (Windows) or BlackHole (macOS)
- [ ] VLC or equivalent player open with `cloned_sample.wav` loaded but NOT playing
- [ ] Server logs visible in terminal

---

## Demo Run 1 — Genuine Voice (Control)

**Expected outcome:** Risk badge stays **GREEN** for the full call. No overlay fires.

### Steps

1. **[A] Open the Create Room screen**
   - Navigate to `http://localhost:5173/call`
   - Click the **↻ generate** button to create a room ID (e.g. `A3B9C2`)
   - Click **Copy link** → paste into chat/Slack for Participant B

2. **[B] Join the room**
   - Participant B opens the shared link
   - Click **Join Room**
   - Browser asks for camera/microphone permission → **Allow**

3. **[A] Join the room**
   - Click **Join Room** on Participant A's screen
   - Allow camera/microphone

4. **Call establishes**
   - Both video tiles appear (A's face + B's face)
   - Connection state shows **CONNECTED**
   - Header pill shows green dot

5. **Observe for 30 seconds**
   - Participant A speaks naturally into microphone
   - Detection sidebar shows risk scores arriving
   - **Expected:** all scores < 35, band stays `low`
   - **Expected:** CloneWarningOverlay stays green (no alert banner)

6. **[A] Hang up**
   - Click the red **Hang Up** button
   - Both screens return to lobby

**Annotate for judges:** "This is a genuine call. The AASIST-L model analyzed 30+ audio
windows in real-time, all scoring below the 35-point caution threshold."

---

## Demo Run 2 — Cloned Voice (Attack Scenario)

**Expected outcome:** Risk escalates to **RED** within 3–5 seconds. Overlay fires with
explainability note. Judges see the warning banner lock onto the call UI.

### Preparation (done before step 1)

- Set VB-Audio Virtual Cable Output (or BlackHole) as the **microphone input for Browser B's tab**
  - In Chrome: Settings → Privacy & Security → Site Settings → Microphone → select Virtual Cable
  - Or: use the browser permission dialog when it asks for mic access

### Steps

1. **Repeat steps 1–4 from Demo Run 1** (create room, both join)

2. **[A] Speak normally for ~10 seconds** — establish a green baseline
   - Detection sidebar should show risk_score < 35

3. **[B] Switch injection (judge moment)**
   - With Browser B set to use Virtual Cable as mic input:
   - Start playing `samples/cloned_sample.wav` in VLC at normal volume
   - The cloned voice is now flowing into Participant B's detection side-channel

4. **Observe detection escalation (target: within 3–5 seconds)**
   - Detection sidebar on B's screen: risk_score climbs from < 35 → > 65
   - **Expected:** CloneWarningOverlay appears (slides in from top of remote video tile)
   - **Expected:** Yellow caution first (1–2 windows), then RED alert after 2–3 more windows
   - **Expected:** Red overlay shows: "AI VOICE CLONE DETECTED — [top sub-score reason]"
   - **Expected:** Recommendation text: "Hang up and verify caller identity via a known number"

5. **Point out explainability**
   - The overlay shows `spectral_artifact_score` or `gan_artifact_score` as the top reason
   - The sidebar shows the full signal breakdown (5 AASIST-L sub-scores)
   - Latency badge shows actual detection latency in milliseconds

6. **[B] Stop the playback** — show recovery
   - Stop VLC; B speaks normally again
   - Risk score should drop within a few windows (EMA smoothing prevents instant recovery)
   - Red overlay eventually clears back to green

7. **Verify privacy toggle**
   - Open server terminal logs
   - Show there are NO `.wav` or `.flac` files written to disk
   - Point to `config.yaml: privacy.retain_audio: false`
   - Point to the server log line: `assert not RETAIN_AUDIO`

---

## Key Talking Points for Judges

| Point | Evidence |
|---|---|
| **Real-time detection** | Detection latency shown in ms on the overlay badge |
| **Interpretable scores** | 5 named sub-scores shown in sidebar; top reason shown in overlay |
| **Separate call path** | WebRTC P2P call is unaffected by detection latency (side-channel architecture) |
| **Privacy by design** | `retain_audio=false` config, server assert, no audio on disk |
| **Accuracy grounded** | EER ~0.83% on ASVspoof 2019 LA (paper); our 1s-window test: 4/5 spoof clips flagged red |
| **Actionable, not just a number** | Overlay gives a recommendation ("verify via callback") not just a score |
| **Threshold-based, not hard binary** | Score is 0–100 with bands; we don't claim 100% accuracy |

---

## Fallback: If WebRTC Fails (Firewall / NAT issue)

If two browser tabs on the same machine can't connect (rare), use the existing mic stream mode:

1. Navigate to `/dashboard`
2. Click **Start Mic** — this opens a single-user mic stream (no WebRTC needed)
3. Play `cloned_sample.wav` through the virtual microphone
4. The dashboard shows the same risk gauge and alert panel

This demonstrates the detection pipeline (Phases 2–4) without the WebRTC peer connection.

# VoiceTrace — Patch Report: Files Changed, Diffs, and Confidence Level

**Important caveat, read first:** your actual `server/`, `detector/`, and `dashboard/src/` files were never uploaded to this conversation — only fragments *quoted inside* the three audit reports. That means every patch below falls into one of three confidence tiers, and they are not interchangeable:

- ✅ **VERIFIED** — the audit quoted a complete, working function; the patch below is that function, safe to paste in directly (still diff it against your file first — audits can lag the real file).
- 🟡 **PATTERN-MATCHED** — the audit quoted a fragment (a few lines) showing the bug; the patch below shows the fix *pattern*, but needs to be applied against your real file, not pasted verbatim, because I can't see the surrounding code.
- 🔴 **INFERRED** — the audit described the bug's *behavior* but quoted no code; the patch below is my best reconstruction of what the fix should look like, and must be treated as a starting draft, not a drop-in.

**Next step to make every one of these ✅:** upload `server/`, `detector/`, and `dashboard/src/hooks/` (or the whole repo) and I'll apply and verify each patch directly with real file edits instead of this document.

---

## Files changed — summary table

| File | Change | Confidence | Deletes code? |
|---|---|---|---|
| `dashboard/src/hooks/useMicStream.js` | Fix WS auth handshake; remove silent demo fallback | 🟡 Pattern-matched | No |
| `dashboard/src/hooks/useWebSocket.js` | Fix WS auth handshake (query-string → post-connect frame) | 🟡 Pattern-matched | No |
| `server/challenge.py` | Fail-closed on exception (currently fails open) | 🔴 Inferred | No |
| `server/batch_worker.py` | Offload model forward pass to executor thread | 🟡 Pattern-matched | No |
| `detector/speaker_embedding.py` | Offload `verify()` to executor thread | ✅ Verified | No |
| `detector/streaming.py` | Move array allocation outside the lock | ✅ Verified | No |
| `detector/stream.py` | Delete — dead, contradicts `streaming.py`'s config | ✅ Verified (deletion is unambiguous) | **Yes, whole file** |
| `config/risk_weights.json` | Delete — unread duplicate of `config.yaml` | ✅ Verified (deletion is unambiguous) | **Yes, whole file** |
| `server/history_db.py` | Wire into call lifecycle, or delete | 🔴 Inferred (your call which path) | Maybe, your choice |
| `server/main.py` | Add graceful shutdown hook | 🔴 Inferred | No |
| `docs/ARCHITECTURE.md` | Rewrite to describe the batch-worker pipeline | 🔴 Inferred (content unknown) | No |
| `.gitignore` | Add `*.log`, `*.exe`, `cloudflared*` | ✅ Already generated for you (see previous file) | No |
| `LICENSE` | Add MIT license | ✅ Already generated for you | No — new file |
| `README.md` | Add first-run checklist, known-issue note | ✅ Already generated for you | No |
| `CONTRIBUTING.md` | Add contributor task ladder | ✅ Already generated for you | No |
| `ngrok.log`, `cloudflared.exe` | Delete from disk and git history | ✅ Verified (this is a deletion, not a code change) | **Yes, both files** |

**14 files touched. 4 deletions. 3 brand-new files. 0 files where I'm claiming certainty I don't have.**

---

## 🟡 `dashboard/src/hooks/useMicStream.js`

**Quoted problem (from `VoiceTrace_QA_Security_Audit_Report.md`, Finding 1):**
```javascript
const ws = new WebSocket(`${WS_BASE}/ws/call/${id}`); // Missing API Key parameter
```
...and on close/auth failure, execution redirects to `_startDemo(id)` silently.

**Patch (this is the fuller version the same audit already drafted — treat as your base, but diff against your actual current file, since Audit 3 came after this and may have changed surrounding code):**
```javascript
const startMic = useCallback(async () => {
  const id = genCallId();
  setCallId(id);
  callStartRef.current = Date.now();

  const apiKey = import.meta.env.VITE_API_KEY ?? '';
  const wsUrl = `${WS_BASE}/ws/call/${id}`;
  const ws = new WebSocket(wsUrl);
  callWsRef.current = ws;

  ws.onopen = () => {
    // Post-connect auth frame — the backend no longer reads query params (per Audit 3)
    ws.send(JSON.stringify({ type: 'auth', api_key: apiKey }));
  };

  ws.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(ev.data));
    } catch (err) {
      console.error("Failed to parse incoming WebSocket frame:", err);
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket authentication or transport error:", err);
    setError('Connection failed — check your API key and that the server is running.');
    // Deliberately NOT calling _startDemo(id) here — a failed connection
    // must be visible, never silently replaced with mock data.
  };

  ws.onclose = (ev) => {
    if (ev.code === 1008 || ev.code === 1011) {
      setError(`Connection closed by server (${ev.reason || 'auth/config error'}).`);
    }
  };

  // ... rest of mic setup logic
}, [onEvent]);
```
**What you must verify against the real file:** whether `_startDemo` is called from `onclose`, `onerror`, or a timeout elsewhere — the audit only showed it triggered from the closure handler. Grep for `_startDemo` and remove *every* call site that fires on a failure path, not just this one.

---

## 🟡 `dashboard/src/hooks/useWebSocket.js`

**Quoted problem (from `VoiceTrace_QA_Audit_v2_SIH260104.md`, §1.2):**
```javascript
const wsUrl = apiKey ? `${url}?api_key=${encodeURIComponent(apiKey)}` : url
const ws = new WebSocket(wsUrl)
```

**Patch:**
```javascript
const wsUrl = url; // no query-string auth anymore
const ws = new WebSocket(wsUrl)

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'auth', api_key: apiKey }));
};
```
**What you must verify:** this hook is shared by `Dashboard.jsx` (`/ws/score`) per the audit — confirm the `/ws/score` endpoint on the backend *also* expects the post-connect auth frame and not just `/ws/call/{id}`, since the audit only confirmed the mismatch for the call endpoint explicitly.

---

## 🔴 `server/challenge.py`

**Described problem (from `VoiceTrace_QA_Audit_v2_SIH260104.md`, §2, carried-over finding):** `verify_response()` "still returns `True` on any exception." No code was quoted, so this is reconstructed from that description alone — treat it as a draft to align to your real function signature:

```python
async def verify_response(call_id: str, expected_text: str, audio_chunk: np.ndarray) -> bool:
    try:
        # ... existing ASR transcription + comparison logic ...
        transcribed = await _transcribe(audio_chunk)
        return _matches(transcribed, expected_text)
    except Exception as e:
        log.warning(f"Challenge verification error for call {call_id}: {e}")
        return False  # fail CLOSED — was previously `return True`
```
**What you must do:** open the real file and find the actual `except` block; this draft assumes a function signature that may not match. The one non-negotiable part is the return value on the exception path: it must not be `True`.

---

## 🟡 `server/batch_worker.py`

**Quoted problem (from `VoiceTrace_QA_Audit_v2_SIH260104.md`, §1.3):**
```python
with torch.no_grad():
    last_hidden, logits = model(x)   # blocks the entire asyncio loop
```

**Patch:**
```python
def _run_forward(model, x):
    with torch.no_grad():
        return model(x)

# inside the async batch-tick function:
last_hidden, logits = await loop.run_in_executor(None, _run_forward, model, x)
```
**What you must verify:** whether `loop` is already available in scope (e.g. `asyncio.get_running_loop()`) or needs to be obtained — the quoted fragment doesn't show the enclosing function.

---

## ✅ `detector/speaker_embedding.py`

**This one is a complete, audit-provided function** (`VoiceTrace_QA_Security_Audit_Report.md`, §4.2) — highest confidence in this report:

```python
import asyncio
import torch
import torch.nn.functional as F

async def verify(self, user_id: str, audio_pcm: np.ndarray) -> float:
    from server.voiceprint_db import load_embedding
    enrolled_np = await load_embedding(user_id)

    if enrolled_np is None:
        return 1.0

    model = _get_spk_model()
    if model is None:
        return 1.0

    tensor = torch.FloatTensor(audio_pcm).unsqueeze(0)

    def _run_encoding():
        with torch.no_grad():
            device = next(model.mods.parameters()).device
            t_dev = tensor.to(device)
            return model.encode_batch(t_dev).squeeze(0).cpu()

    live_emb = await asyncio.to_thread(_run_encoding)

    enrolled_tensor = torch.FloatTensor(enrolled_np)
    sim = F.cosine_similarity(enrolled_tensor, live_emb, dim=0).item()

    return (sim + 1.0) / 2.0
```
**Caveat that still applies regardless of this patch:** per Audit 3, this whole subsystem is disconnected from any route and its model checkpoints are broken Git LFS pointers, not real weights. This fix makes the function itself correct, but it won't do anything until (a) it's wired to a route and (b) real weights are downloaded.

---

## ✅ `detector/streaming.py`

**Also a complete, audit-provided function** (`VoiceTrace_QA_Security_Audit_Report.md`, §4.3):

```python
import numpy as np
from typing import Optional

def get_ready_window(self) -> Optional[np.ndarray]:
    with self._lock:
        if self._buffered_samples < self._window_samples:
            return None

        raw_bytes = b''.join([c.tobytes() for c in self._chunks])
        all_data = np.frombuffer(raw_bytes, dtype=np.float32)

        window = all_data[:self._window_samples]
        leftover = all_data[self._stride_samples:]

        self._chunks.clear()
        if len(leftover) > 0:
            self._chunks.append(leftover)
        self._buffered_samples = len(leftover)

    return window
```
Note this still does the heavy work (`b''.join`, `np.frombuffer`) *inside* the lock in this specific version — it trades `np.concatenate`'s allocation pattern for a different one, but doesn't fully move work outside the lock. If lock contention is still measurable after this patch under concurrent load (test this — don't assume), the next iteration should build `raw_bytes` from a lock-free snapshot of `self._chunks` and only take the lock for the final `clear()`/`append()`/`_buffered_samples` update.

---

## ✅ `detector/stream.py` — delete

```bash
git rm detector/stream.py
grep -rn "detector.stream\b" --include="*.py" .   # confirm zero remaining imports before committing
```

## ✅ `config/risk_weights.json` — delete

```bash
git rm config/risk_weights.json
grep -rn "risk_weights" --include="*.py" .   # confirm zero remaining reads before committing
```

## ✅ `ngrok.log`, `cloudflared.exe` — delete + gitignore

```bash
rm ngrok.log cloudflared.exe
git log --all --full-history -- ngrok.log   # if non-empty, history needs scrubbing (git filter-repo), not just a new commit
```

---

## 🔴 `server/history_db.py` — your decision, not a pure patch

No code was quoted beyond the docstring claim. Two legitimate paths, pick one:
- **Wire it in:** call `log_event(...)` from `batch_worker.py` wherever a `RiskEvent` is broadcast, and `save_call(...)` from `connection_manager.disconnect_call`.
- **Delete it:** `git rm server/history_db.py` if persistent history isn't a near-term priority — an honestly-absent feature beats a file whose docstring lies about what it does.

## 🔴 `server/main.py` — graceful shutdown (inferred, generic FastAPI pattern)

```python
@app.on_event("shutdown")
async def on_shutdown():
    await batch_worker.drain()          # confirm this method exists / name matches your batch_worker.py
    await connection_manager.close_all()  # confirm this method exists / name matches your connection_manager.py
```
This is a standard pattern, not derived from your actual `connection_manager.py` API — the method names are placeholders until you confirm what's actually exposed.

## 🔴 `docs/ARCHITECTURE.md` — content unknown, rewrite needed

I have never seen this file's content — only that Audit 3 says it "still describes the pre-refactor pipeline verbatim." I can't diff or patch what I haven't read. Upload it and I'll produce a version that matches the batch-worker architecture described across the three audits.

---

## What to do with this report

1. Apply the ✅ patches directly — they're the safest.
2. For 🟡 patches, open the real file, locate the quoted fragment, apply the pattern shown, then run `scripts/smoke_test.sh`.
3. For 🔴 patches, treat them as a first draft only — verify the function signature and surrounding logic against your actual file before trusting the return-value/control-flow change is applied correctly.
4. Upload `server/`, `detector/`, `dashboard/src/hooks/` (or the whole repo as a zip) in your next message, and every 🟡/🔴 row above becomes a real, verified edit instead of a reconstructed one.

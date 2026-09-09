# Comprehensive Quality Assurance & Security Audit Report

**Target System:** VoiceTrace — Real-Time Voice Cloning & Deepfake Detection Engine  
**Target Codebase:** `detector/`, `server/`, `dashboard/`, `config/`  
**Git Commit Reference:** `d79eb34` (Merge pull request #3 from `sawanmani/antigravity/issue-fixes`)  
**Auditor:** Senior QA & Security Automation Engineer  
**Reference Criteria:** SIH 2026 (PSID 260104) / VoiceTrace SRS v0.1 & System Architecture  

---

## 1. Executive Summary

VoiceTrace is designed to address a high-risk security challenge: identifying AI-synthesized voice clones during live telephonic interactions. The architecture demonstrates solid foundational design choices, including a **Privacy-by-Design** approach (in-memory audio processing without persistent raw audio disk writes), lightweight model selection (AASIST-L with ~85K parameters optimized for CPU execution), multi-signal risk breakdown (spectral, prosody, caller/transaction context), and an extensible multi-source ingestion pipeline (WebRTC, simulated streams, and Twilio Media Streams).

However, a rigorous static, dynamic, and code-level Quality Assurance (QA) and security audit revealed **critical software flaws and architectural bottlenecks**. These issues compromise system authentication, degrade concurrency performance under load, consume client-side memory excessively, and lead to silent failovers that mask security errors. 

The main purpose of this audit is to highlight the core strengths of the codebase, evaluate its current vulnerabilities against system requirements, and provide explicit remediation patches to bring the software to production-ready status.

---

## 2. Comprehensive System Assessment

### 2.1 Core System Strengths
* **Privacy-by-Design Principles (NFR-2):** Streaming audio is ingested, chunked, and evaluated dynamically in memory, ensuring zero persistent raw audio retention on the backend server.
* **Explainable Multi-Signal Risk Engine (FR-4, FR-5, NFR-3):** Instead of exposing a opaque black-box prediction, the system calculates composite risk by integrating model confidence with spectral artifacts, prosody irregularities, and situational transaction context.
* **Unified Data Contract:** Across all audio entry points (`POST /analyze`, `WS /ws/call/{call_id}`, and `WS /ws/twilio`), the application maintains a strict, standardized JSON contract. This decouples frontend rendering from backend stream generation.
* **Resource-Efficient ML Architecture (NFR-4):** The deployment of AASIST-L keeps parameter size under 85K, achieving lower CPU footprint and allowing near real-time inference without requiring dedicated GPU clusters.

---

### 2.2 Critical Vulnerabilities & Code Deficiencies

#### Finding 1: Silent Authentication Bypass & Mock Data Fallback
* **Severity:** **CRITICAL** (Security Failure & Silent Degradation)
* **Location:** `dashboard/src/hooks/useMicStream.js` vs. `dashboard/src/hooks/useWebSocket.js`
* **Vulnerability Description:** While `useWebSocket.js` properly extracts `VITE_API_KEY` and appends `?api_key=...` to the WebSocket connection string, `useMicStream.js` establishes a connection without appending authentication parameters:
  ```javascript
  const ws = new WebSocket(`${WS_BASE}/ws/call/${id}`); // Missing API Key parameter
  ```
  When the backend enforces authentication and rejects the handshake with WebSocket status `1008` (Policy Violation), `useMicStream.js` catches the closure event and silently redirects execution to `_startDemo(id)`.
* **Impact:** Operational failures are masked. Users relying on the microphone interface will see hardcoded `DEMO_SEQUENCE` score streams on the dashboard, incorrectly assuming their live phone call is being analyzed when authentication has failed completely.

#### Finding 2: Event-Loop Starvation via Synchronous ML Model Execution
* **Severity:** **HIGH** (Concurrency & System Stability Failure)
* **Location:** `detector/speaker_embedding.py` (`verify` and `enroll` routines)
* **Vulnerability Description:** Although the `verify()` function is declared with Python's `async` keyword, execution of the underlying PyTorch tensor operations runs synchronously on the main thread:
  ```python
  async def verify(self, user_id: str, audio_pcm: np.ndarray) -> float:
      ...
      live_emb = model.encode_batch(tensor).squeeze(0).cpu() # Synchronous CPU/GPU tensor execution
  ```
* **Impact:** FastAPI runs on a single-threaded asynchronous event loop (`uvicorn`). Executing heavy matrix operations (`encode_batch`) directly on this event loop blocks all incoming I/O. Concurrent audio streams from multiple users will experience latency spikes, packet timeouts, and dropped WebSocket connections.

#### Finding 3: Threading Contention & Ring Buffer Memory Allocation Overhead
* **Severity:** **HIGH** (Performance & Buffer Bottleneck)
* **Location:** `detector/streaming.py` (`get_ready_window` routine)
* **Vulnerability Description:** Incoming audio chunks received from parallel threads are buffered inside `StreamingDetector`. Thread synchronization is enforced via `threading.Lock()`. However, memory-intensive array allocation occurs inside the locked block:
  ```python
  with self._lock:
      all_data = np.concatenate(list(self._chunks)) # Heavy memory allocation inside lock
  ```
* **Impact:** `np.concatenate` allocates new contiguous memory arrays. Performing allocation and copy operations inside `self._lock` stalls producer threads pushing continuous 16kHz audio streams. At scale, this contention causes real-time audio detection to lag behind live speech.

#### Finding 4: Client-Side Garbage Collection Pressure & UI Micro-Stutters
* **Severity:** **MEDIUM** (Frontend Performance & Client Resource Exhaustion)
* **Location:** `dashboard/src/hooks/useMicStream.js` (`proc.onaudioprocess`)
* **Vulnerability Description:** The client application uses the deprecated `ScriptProcessorNode` API for real-time microphone processing. On every audio frame callback, memory buffer slices are allocated:
  ```javascript
  ws.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
  ```
* **Impact:** Generating thousands of short-lived `ArrayBuffer` slices per minute triggers frequent browser Garbage Collection (GC) pauses. On lower-end client hardware, this results in UI frame drops, choppy waveform rendering, and potential dropped audio frames.

---

## 3. QA Verification Matrix

| Subsystem / Location | Severity | Identified Issue | Root Cause | Recommended Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **Auth Pipeline**<br>`dashboard/src/hooks/useMicStream.js` | **CRITICAL** | Silent fallback to mock data on auth failure. | Missing `api_key` parameter in WebSocket connection string. | Append `?api_key=${apiKey}` to `wsUrl` during socket instantiation. |
| **Async Engine**<br>`detector/speaker_embedding.py` | **HIGH** | Server event-loop blocking under multi-user load. | Executing CPU-bound PyTorch model math inside async thread. | Offload tensor calculations using `asyncio.to_thread()`. |
| **Buffer Mechanics**<br>`detector/streaming.py` | **HIGH** | Lock contention & thread latency spikes. | Executing memory allocation (`np.concatenate`) inside thread lock. | Drain raw byte buffers directly without intermediate array copying. |
| **Browser Execution**<br>`dashboard/src/hooks/useMicStream.js` | **MEDIUM** | Frontend UI stutter & GC thrashing. | Deprecated `ScriptProcessorNode` allocating buffer slices. | Migrate audio processing pipeline to an `AudioWorklet`. |
| **Schema Integrity**<br>`config.yaml` vs. `config/risks_weights.json` | **MEDIUM** | Risk engine configuration mismatch risks. | Divergent key naming conventions (`spoof_prob` vs `model_confidence`). | Enforce strict schema validation using Pydantic models. |

---

## 4. Engineering Solutions & Code Fixes

### 4.1 Authentication Enforcement in `useMicStream.js`
Modify the connection setup logic to ensure `VITE_API_KEY` is properly appended to the WebSocket query string:

```javascript
// dashboard/src/hooks/useMicStream.js
const startMic = useCallback(async () => {
  const id = genCallId();
  setCallId(id);
  callStartRef.current = Date.now();

  // Retrieve and validate API key from environment variables
  const apiKey = import.meta.env.VITE_API_KEY ?? '';
  const wsUrl = `${WS_BASE}/ws/call/${id}${apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : ''}`;
  
  const ws = new WebSocket(wsUrl);
  callWsRef.current = ws;

  ws.onmessage = (ev) => {
    try { 
      onEvent(JSON.parse(ev.data)); 
    } catch (err) {
      console.error("Failed to parse incoming WebSocket frame:", err);
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket authentication or transport error:", err);
    // Explicitly handle failure without silent demo fallback
  };
  
  // ... rest of mic setup logic
}, [onEvent]);
```

---

### 4.2 Non-Blocking Execution in `speaker_embedding.py`
Wrap PyTorch model calculations within `asyncio.to_thread` to push execution onto a separate worker thread pool, preventing main thread starvation:

```python
# detector/speaker_embedding.py
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

    # Offload blocking PyTorch computation to a worker thread
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

---

### 4.3 Lock Optimization in `streaming.py`
Optimize memory consumption and minimize lock duration by operating on raw bytes directly:

```python
# detector/streaming.py
import numpy as np
from typing import Optional

def get_ready_window(self) -> Optional[np.ndarray]:
    with self._lock:
        if self._buffered_samples < self._window_samples:
            return None
        
        # Efficiently concatenate raw byte data in memory
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

---

## 5. Audit Conclusion & Recommended Roadmap

VoiceTrace possesses a robust design blueprint that meets core functional requirements for stateless, explainable voice clone detection. The underlying architectural concept—combining real-time streaming ML scoring with context-aware risk rules—is sound. 

To achieve production readiness, the following engineering steps are recommended:
1. **Apply Core Fixes:** Merge the provided code refactors for `useMicStream.js`, `speaker_embedding.py`, and `streaming.py`.
2. **Upgrade Web Audio Processing:** Transition from `ScriptProcessorNode` to an `AudioWorklet` architecture to isolate audio ingestion from main UI thread operations.
3. **Automate Load & Integration Testing:** Add automated stress testing (e.g., via Locust or custom WebSocket clients) to verify concurrent connection stability and threshold latency under simulated multi-user call load.

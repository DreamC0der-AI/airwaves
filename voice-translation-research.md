# Free Voice Translation Services Research

## The Problem

Radio Garden streams 90,000+ stations in many languages. We need a pipeline to translate live radio audio into a language the user understands.

## Pipeline

```
Audio Stream -> STT (Speech-to-Text) -> Translation -> TTS (Text-to-Speech, optional)
```

Or an all-in-one **speech-to-speech translation** model.

---

## 1. All-in-One Speech-to-Speech Translation

### Meta SeamlessM4T v2 / SeamlessStreaming

- **URL:** https://github.com/facebookresearch/seamless_communication
- **License:** CC-BY-NC 4.0 (non-commercial)
- **Languages:** ~100 input, ~35 speech output
- **Real-time:** Yes (~2s latency with SeamlessStreaming)
- **Requires:** GPU server, PyTorch
- **Verdict:** Best quality all-in-one solution, but non-commercial license

### Kyutai Hibiki / Hibiki-Zero

- **URL:** https://github.com/kyutai-labs/hibiki
- **License:** MIT
- **Languages:** Currently French -> English only (Hibiki-Zero expanding to multilingual)
- **Real-time:** Yes, streaming speech-to-speech
- **Runs on:** PyTorch, Rust, MLX (macOS/iOS)
- **Verdict:** Great architecture, MIT license, but very limited language support today

---

## 2. Speech-to-Text (STT)

### OpenAI Whisper (local, open source)

- **URL:** https://github.com/openai/whisper
- **License:** MIT
- **Languages:** 99+ (with built-in **translate-to-English** mode)
- **Real-time:** Chunk-based (30s segments)
- **Verdict:** Gold standard. Built-in translation to English eliminates need for a separate translation service.

### faster-whisper

- **URL:** https://github.com/SYSTRAN/faster-whisper (22k+ stars)
- **License:** MIT
- **Languages:** Same as Whisper (99+)
- **Real-time:** Yes, with VAD support. **4x faster** than original Whisper, less memory.
- **Verdict:** Best self-hosted option for production use.

### whisper_streaming

- **URL:** https://github.com/ufal/whisper_streaming (3.6k stars)
- **License:** Open source
- **What:** Real-time streaming wrapper around Whisper / faster-whisper
- **Verdict:** Pairs with faster-whisper for true real-time radio translation.

### whisper.cpp (including WASM)

- **URL:** https://github.com/ggml-org/whisper.cpp (48k+ stars)
- **License:** MIT
- **What:** C/C++ port of Whisper, includes **WebAssembly build** that runs in the browser
- **Real-time:** ~2-3x real-time for tiny/base models in browser
- **Verdict:** Enables fully client-side transcription + translation with zero server cost.

### Transformers.js (Whisper in browser)

- **URL:** https://github.com/huggingface/transformers.js (15k+ stars)
- **Demo:** https://github.com/xenova/whisper-web
- **License:** MIT
- **What:** Runs Whisper in the browser via ONNX Runtime / WebGPU
- **Verdict:** Modern browser-native option. Performance depends on user device.

### Web Speech API (browser-native)

- **URL:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- **Cost:** Free (built into browsers)
- **Real-time:** Yes
- **Limitations:** Chrome-only for STT (sends audio to Google servers), no translation, lower accuracy
- **Verdict:** Easiest to integrate, but least capable. Good fallback.

---

## 3. Text Translation (if STT doesn't include translation)

### LibreTranslate

- **URL:** https://github.com/LibreTranslate/LibreTranslate (14k+ stars)
- **License:** AGPL-3.0
- **Languages:** ~50
- **Self-host:** Docker image, unlimited usage
- **Public API:** Free with rate limits
- **Verdict:** Best free/open-source translation API.

### Argos Translate

- **URL:** https://github.com/argosopentech/argos-translate
- **License:** MIT
- **What:** Offline translation library (powers LibreTranslate)
- **Languages:** ~50

---

## 4. Text-to-Speech (TTS) — Optional

### Web SpeechSynthesis API (browser-native)

- **URL:** https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
- **Cost:** Free, zero setup
- **Languages:** 20-50+ voices depending on OS/browser
- **Verdict:** The obvious free choice for TTS.

### Piper TTS

- **URL:** https://github.com/rhasspy/piper (10k+ stars)
- **License:** Open source
- **Languages:** 30+, multiple voices
- **Can compile to WASM** for browser use

### Coqui TTS

- **URL:** https://github.com/coqui-ai/TTS (45k+ stars)
- **License:** Open source
- **Languages:** 16+
- **Note:** Project maintenance uncertain after Coqui company shutdown.

---

## 5. Cloud APIs with Free Tiers (Freemium)

| Service | Free Tier | Speed | Streaming |
|---------|-----------|-------|-----------|
| **Groq Whisper API** | Free tier available | 216-299x real-time | Chunk-based |
| **OpenAI Whisper API** | $5 credit (~833 min) | Fast | Chunk-based |
| **Google Cloud STT** | 60 min/month | Fast | True streaming (gRPC) |
| **Deepgram** | $200 credit (no expiry) | Sub-300ms | WebSocket streaming |
| **AssemblyAI** | Free tier (limited hours) | Fast | WebSocket streaming |

---

## Recommended Architectures

### Option A: Fully Client-Side (Zero Cost)

```
Radio Stream -> whisper.cpp WASM (STT + translate) -> Web SpeechSynthesis (TTS)
```

- Zero server cost, privacy-preserving
- Limited to small Whisper models (lower quality)
- Depends on user's device performance

### Option B: Lightweight Backend (Best Quality/Cost)

```
Radio Stream -> faster-whisper + whisper_streaming (STT + translate) -> Web SpeechSynthesis (TTS)
```

- High quality with Whisper large model
- Requires server with GPU (or fast CPU)
- Single T4 GPU can handle multiple concurrent streams

### Option C: Cloud API MVP (Easiest)

```
Radio Stream -> Groq Whisper API (STT + translate, chunked) -> Web SpeechSynthesis (TTS)
```

- Easiest to implement, extremely fast
- Free tier to start, low cost at scale
- Not true streaming (chunk-based with ~10-15s segments)

### Option D: All-in-One (Most Advanced)

```
Radio Stream -> SeamlessStreaming (speech-in -> translated speech + text out)
```

- Best end-to-end quality, ~2s latency
- Requires powerful GPU, non-commercial license

---

## Recommendation

**Start with Option C** (Groq Whisper API) for a quick MVP — Whisper's built-in translate-to-English mode means you only need one API call, no separate translation service. Migrate to **Option B** (self-hosted faster-whisper) for production. Explore **Option A** (client-side whisper.cpp WASM) as an experimental zero-cost feature.

# PlotCraft TH — Technical Specification & AI Fine-Tuning Guide (AI-Readable)

> **Purpose of this document:** Technical specification and end-to-end fine-tuning blueprint designed to be read by both **engineers** and **AI coding/training agents**. It documents the exact runtime contract, native Android LiteRT-LM bridge, prompt architecture, Zod JSON schemas, domain enum constraints, dataset schema, SFT/DPO/QAT training recipe, and `.litertlm` conversion pipeline for **PlotCraft TH (v4.0.0)**.

---

## 1. System & On-Device Runtime Architecture

### 1.1 Execution Stack
```text
React 19 + TypeScript (src/services/geminiService.ts)
  └── Capacitor JS Bridge (src/services/onDeviceLlm.ts)
        └── OnDeviceLLMPlugin.java (Capacitor @CapacitorPlugin("OnDeviceLLM"))
              └── LiteRtLmBridge.kt (Kotlin 2.4.21)
                    └── Google LiteRT-LM Android SDK (com.google.ai.edge.litertlm:litertlm-android:0.20.0)
                          ├── Backend.NPU(nativeLibraryDir)   [Qualcomm Hexagon QNN / HTP]
                          ├── Backend.GPU()                   [Adreno OpenCL / Vulkan fallback]
                          └── Backend.CPU()                   [XNNPACK fallback]
```

### 1.2 Exact Native Inference Contract (`LiteRtLmBridge.kt`)
Any fine-tuned model exported for this app MUST be compatible with the following runtime invocation:

- **EngineConfig:**
  - `modelPath`: Absolute path in app-private storage (`<filesDir>/litert_models/<filename>.litertlm`)
  - `backend`: Fallback order `NPU → GPU → CPU` (or user-selected `GPU` / `CPU`)
  - `cacheDir`: `context.cacheDir.absolutePath` (weight/shader compilation cache)
  - `maxNumTokens`: `maxOf(requestedContext, 6144)` (default `6144` tokens total = prompt + output)
- **ConversationConfig:**
  - `systemInstruction`: `Contents.of(systemInstruction)`
  - `samplerConfig`: `SamplerConfig(topK = 40, topP = 0.95, temperature = clamp(t, 0.05, 1.5))`
    - Structured JSON tasks force `temperature <= 0.3`
    - Prose generation tasks use user slider (`0.2`–`1.2`, default `0.7`)
  - `thinkingConfig`: **`ThinkingConfig(enableThinking = false)`** — **CRITICAL:** Models MUST be fine-tuned with thinking tokens disabled (`enable_thinking=False`).
  - `enableResponseFormat`: `true` when `jsonMode = true`
- **Generation Call:**
  - When `jsonMode = true`: `conversation.sendMessage(prompt, thinkingConfig = noThinking, responseFormat = ResponseFormat.json("{\"type\":\"object\"}"))` (with fallback to plain prompt if constrained decoding throws).
  - Output extraction: `message.contents.contents.filterIsInstance<Content.Text>().joinToString("") { it.text }`
- **Client-Side Guardrails (`geminiService.ts`):**
  - `maxRetries = 0` for `provider === 'on-device'` (prevents thermal runaway on mobile).
  - `extractJsonText()` strips Markdown fences (` ```json ... ``` `) and runs `repairTruncatedJson()` to close truncated quotes/brackets/braces before `JSON.parse()`.
  - `OnDeviceLLMPlugin.java` aborts inference if `PowerManager.getCurrentThermalStatus() == THERMAL_STATUS_CRITICAL`, and `MainActivity.onTrimMemory()` releases the engine on `TRIM_MEMORY_RUNNING_CRITICAL`.

---

## 2. Exact System Instructions & Prompt Layout

### 2.1 System Instructions (from `src/services/geminiService.ts`)

**Structured JSON Tasks (`BASE_SYSTEM_INSTRUCTION`):**
```text
Role: Master Thai Fiction Editor & Story Architect (Creative Fiction Outlining).
Strict Rules:
1. Return ONLY valid JSON matching the requested schema. No greetings, markdown, or extra text.
2. Never leave required fields empty or use placeholders ("TBD", "-").
3. Write ALL string values in natural, publication-grade Thai (avoid literal English translationese).
4. Match character names, tone, and diction to the specified genres and tone.
5. Keep outlines concise and actionable (goals, conflicts, outcomes)—do not write full prose dialogues in outline mode.
6. Treat PINNED LORE and PINNED CHARACTERS as strict canon; never contradict them.
7. Maintain strict continuity with Rolling Summary and prior cliffhangers; pace properly to targetChapterCount.
```

**Prose Generation Tasks (`PROSE_WRITER_SYSTEM_INSTRUCTION`):**
```text
Role: Master Thai Novelist.
Strict Rules:
1. Output ONLY the Thai novel prose (no meta commentary, no chapter headers unless natural, no markdown fences).
2. Write natural, vivid Thai literature (avoid literal English translationese).
3. Use "Show, Don't Tell": convey emotion via action, dialogue, sensory detail, and pacing.
4. Strictly respect PINNED LORE and PINNED CHARACTERS.
5. Connect seamlessly from the previous chapter's ending and end with a compelling cliffhanger.
```

### 2.2 Prompt-Cache-Friendly Block Ordering (Prefix Stability)
To maximize KV-cache reuse on mobile NPU/GPU, prompts are ordered from **most static (top)** to **most dynamic (bottom)**:
1. `[PINNED LORE]` & `[PINNED CHARACTERS]` (Filtered by relevance in Economy Mode)
2. `[WRITING STYLE]` (`POV`, `Style`, `Length`, `[STYLE ANCHOR]`)
3. `[ACTIVE PLOT BEATS]` (Beat Windowing: ±1 beat around current chapter)
4. `[CONTINUITY]` (`Rolling Summary` + tail 400–700 chars of previous chapter)
5. `[DYNAMIC TASK]` (Current chapter beat / selected passage / steering prompt)
6. `[ON-DEVICE COMPACT MODE]` suffix (injected automatically by `callOnDeviceProvider` for JSON tasks):
   ```text
   [ON-DEVICE COMPACT MODE: เขียนให้กระชับสุดๆ ข้อละ 1 ประโยคสั้น เพื่อให้จบภายในขีดจำกัดหน่วยความจำ ตอบเป็น JSON Object เท่านั้น ห้ามมีข้อความอื่น]:
   <jsonContract>
   ```

---

## 3. Exact Output Contracts (Zod Schemas in `src/types/novel.ts`)

Every synthetic training sample for structured tasks MUST pass `schema.safeParse(JSON.parse(output))` with zero errors.

### 3.1 `MacroOutlineResponseSchema` (Stage 1 — Macro Outliner)
```json
{
  "type": "object",
  "required": ["logline", "worldBuilding", "characters", "plotBeats"],
  "properties": {
    "suggestedTitle": { "type": "string", "minLength": 1 },
    "logline": { "type": "string", "minLength": 1 },
    "worldBuilding": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["category", "detail"],
        "properties": {
          "category": { "type": "string", "minLength": 1 },
          "detail": { "type": "string", "minLength": 1 }
        }
      }
    },
    "characters": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["name", "role", "goal", "flaw", "background"],
        "properties": {
          "name": { "type": "string", "minLength": 1 },
          "role": { "type": "string", "minLength": 1 },
          "archetype": { "type": "string" },
          "goal": { "type": "string", "minLength": 1 },
          "flaw": { "type": "string", "minLength": 1 },
          "background": { "type": "string", "minLength": 1 },
          "relationships": { "type": "string" }
        }
      }
    },
    "plotBeats": {
      "type": "array",
      "minItems": 1,
      "description": "MUST match exact beatCount & order of the requested structureTemplate",
      "items": {
        "type": "object",
        "required": ["beatName", "act", "summary"],
        "properties": {
          "beatName": { "type": "string", "minLength": 1 },
          "act": { "type": "string", "minLength": 1 },
          "summary": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

### 3.2 `ChapterBatchResponseSchema` (Stage 2 — Chapter Beats Expander)
```json
{
  "type": "object",
  "required": ["chapters", "updatedRollingSummary"],
  "properties": {
    "chapters": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["chapterNumber", "title", "goal", "conflict", "outcome", "cliffhanger", "summary"],
        "properties": {
          "chapterNumber": { "type": "integer", "minimum": 1 },
          "title": { "type": "string", "minLength": 1 },
          "linkedBeat": { "type": "string" },
          "goal": { "type": "string", "minLength": 1 },
          "conflict": { "type": "string", "minLength": 1 },
          "outcome": { "type": "string", "minLength": 1 },
          "cliffhanger": { "type": "string", "minLength": 1 },
          "summary": { "type": "string", "minLength": 1 }
        }
      }
    },
    "updatedRollingSummary": { "type": "string", "minLength": 1 }
  }
}
```

### 3.3 `AutoDirectorPlanSchema` (1-Click AI Story Director)
```json
{
  "type": "object",
  "required": [
    "titleOptions", "genres", "structureTemplate", "structureReason",
    "tone", "targetAudience", "targetChapterCount", "pov", "proseStyle", "chapterLength"
  ],
  "properties": {
    "titleOptions": { "type": "array", "minItems": 3, "items": { "type": "string" } },
    "genres": { "type": "array", "minItems": 1, "maxItems": 3, "items": { "type": "string" } },
    "structureTemplate": { "type": "string", "description": "Exact ID from Section 4.2" },
    "structureReason": { "type": "string", "minLength": 1 },
    "tone": { "type": "string", "minLength": 1 },
    "targetAudience": { "type": "string", "minLength": 1 },
    "targetChapterCount": { "type": "integer", "minimum": 5, "maximum": 60 },
    "pov": { "type": "string", "minLength": 1 },
    "proseStyle": { "type": "string", "minLength": 1 },
    "chapterLength": { "type": "string", "enum": ["short", "medium", "long"] }
  }
}
```

### 3.4 `OpeningHookSamplesSchema` (Style Anchor — 3 Samples)
```json
{
  "type": "object",
  "required": ["samples"],
  "properties": {
    "samples": {
      "type": "array",
      "minItems": 3,
      "items": {
        "type": "object",
        "required": ["styleName", "description", "excerpt"],
        "properties": {
          "styleName": { "type": "string", "minLength": 1 },
          "description": { "type": "string", "minLength": 1 },
          "excerpt": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

### 3.5 `ContinuityReportSchema` (Continuity & Plot Hole Auditor)
```json
{
  "type": "object",
  "required": ["overallScore", "summary", "issues"],
  "properties": {
    "overallScore": { "type": "number", "minimum": 0, "maximum": 100 },
    "summary": { "type": "string", "minLength": 1 },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["severity", "category", "location", "description", "suggestion"],
        "properties": {
          "severity": { "type": "string", "enum": ["high", "medium", "low"] },
          "category": { "type": "string", "minLength": 1 },
          "location": { "type": "string", "minLength": 1 },
          "description": { "type": "string", "minLength": 1 },
          "suggestion": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

### 3.6 Free-Text Tasks (Stage 3 & Utility)
- `writeChapterProse`: Raw Thai prose (no JSON, no markdown code fences). Target lengths: `short` (~1,200–1,800 words), `medium` (~2,000–2,800 words), `long` (~3,200–4,200 words).
- `refineSelectedProse` (Highlight-to-Refine): Output ONLY the replacement Thai text for `[SELECTED PASSAGE TO REWRITE]` that blends seamlessly between `[BEFORE]` and `[AFTER]`.
- `compressRollingSummary`: Dense Thai continuity summary (≤ 150–200 Thai words).

---

## 4. Domain Knowledge Base Constraints (`src/data/knowledgeBase.ts`)

Synthetic datasets and fine-tuned models MUST use these exact domain values:

### 4.1 Allowed `genres` (`nameTh`, pick 1–3)
`แฟนตาซี`, `สืบสวนสอบสวนและระทึกขวัญ`, `โรแมนติก`, `ไซไฟและดิสโทเปีย`, `สยองขวัญและเหนือธรรมชาติ`, `ดราม่าและสะท้อนชีวิต`, `แอ็กชันและผจญภัย`, `ย้อนยุคและอิงประวัติศาสตร์`

### 4.2 Allowed `structureTemplate` IDs & Required `plotBeats.length`
| Exact `id` | `beatCount` | Primary Use Case |
| :--- | :---: | :--- |
| `Three-Act Structure` | 6 | General / fast mobile outline |
| `Save the Cat!` | 15 | Commercial web novel / pacing |
| `The Hero's Journey` | 12 | Fantasy / Isekai / Adventure |
| `Kishōtenketsu` | 4 | Slice of Life / Twist / Drama |
| `Freytag's Pyramid` | 5 | Tragedy / Horror / Intense Drama |
| `Dan Harmon's Story Circle` | 8 | Character-driven / Series |
| `Mystery & Whodunit Structure` | 6 | Detective / Crime / Whodunit |

---

## 5. Dataset Construction Specification (`dataset.jsonl`)

### 5.1 Recommended Mixture (3,000–5,000 Verified Examples)
- **25% Stage 1 (`MacroOutlineResponseSchema`)**: Balanced across all 7 structures and 8 genres, both `scratch` and `import` modes. Keep per-field strings concise so total JSON stays within **900–1,600 tokens** in Thai.
- **25% Stage 2 (`ChapterBatchResponseSchema`)**: Batches of 3 chapters (Economy Mode) and 5 chapters, testing strict `PINNED LORE` / `PINNED CHARACTERS` retention and sequential `chapterNumber`.
- **30% Stage 3 (`writeChapterProse` + `refineSelectedProse`)**: High-quality native Thai prose (ReadAWrite / Dek-D / Literary / Period Thai), adhering to `[STYLE ANCHOR]` and POV.
- **20% Auxiliary Tasks**: `AutoDirectorPlanSchema`, `OpeningHookSamplesSchema`, `ContinuityReportSchema`, `compressRollingSummary`.

### 5.2 Record Format & Automated Filtering Pipeline
Each line in `train.jsonl` / `val.jsonl` uses OpenAI/ChatML messages:
```json
{
  "task_type": "stage1_macro_outline",
  "messages": [
    { "role": "system", "content": "<exact systemInstruction>" },
    { "role": "user", "content": "<exact prompt from geminiService.ts>" },
    { "role": "assistant", "content": "<validated raw JSON string or Thai prose>" }
  ]
}
```
**Mandatory Automated Filters before Training:**
1. **Schema Validation:** 100% of JSON task outputs MUST pass the corresponding Zod schema in `src/types/novel.ts`.
2. **Token Budget Gate:** Drop or compress any training sample where `prompt_tokens + completion_tokens > 4096` (or `6144` for long Stage 3 chapters).
3. **Thai Quality Filter:** Reject outputs containing English translationese clichés, placeholder strings (`"TBD"`, `"-"`), or Markdown code fences around JSON.
4. **Canon Consistency Check:** For Stage 2 & 3 samples, verify pinned character names appear spelled identically to the prompt.

---

## 6. Training Pipeline (SFT → DPO → QAT → `.litertlm`)

### 6.1 Base Model Selection
- **`google/gemma-4-E2B-it`** (Recommended for mobile): Lowest thermal footprint, fastest TTFT/TPS on Snapdragon 8 Elite Gen 5; once fine-tuned on PlotCraft TH schemas, outperforms untuned 4B models on JSON accuracy.
- **`google/gemma-4-E4B-it`**: Higher ceiling for literary Thai prose in Stage 3; requires strict `enable_thinking=False` and compact Stage 1 targets.

### 6.2 Stage A — LoRA / QLoRA SFT (`Unsloth` / `TRL`)
```python
from datasets import load_dataset
from trl import SFTConfig, SFTTrainer
from unsloth import FastLanguageModel

MODEL_NAME = "google/gemma-4-E2B-it"
MAX_SEQ_LEN = 4096

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=MODEL_NAME,
    max_seq_length=MAX_SEQ_LEN,
    dtype=None,
    load_in_4bit=True,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=32,
    lora_alpha=64,
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    bias="none",
    use_gradient_checkpointing="unsloth",
)

dataset = load_dataset("json", data_files="plotcraft_train.jsonl", split="train")

def format_chat(example):
    return {
        "text": tokenizer.apply_chat_template(
            example["messages"],
            tokenize=False,
            add_generation_prompt=False,
            enable_thinking=False,  # MUST match LiteRtLmBridge.kt ThinkingConfig(enableThinking = false)
        )
    }

dataset = dataset.map(format_chat)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    args=SFTConfig(
        output_dir="./outputs/plotcraft-gemma4",
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LEN,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=8,  # effective batch size = 16
        num_train_epochs=2,
        learning_rate=2e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        bf16=True,
        packing=False,                  # CRITICAL: never pack across distinct JSON objects
        save_strategy="epoch",
    ),
)

trainer.train()
model.save_pretrained_merged("./merged/plotcraft-gemma4-bf16", tokenizer, save_method="merged_16bit")
```

### 6.3 Stage B — Optional DPO (Thai Prose Quality) & QAT (INT4 Preservation)
- **DPO (`TRL DPOTrainer`):** 500–1,000 preference pairs `(chosen = natural Thai prose, rejected = flat/translationese prose)`, `beta = 0.1`, `lr = 5e-6`, 1 epoch.
- **QAT (Quantization-Aware Training):** 0.5–1 epoch with fake INT4 weight quantization (`lr = 2e-5`) before final export to prevent Thai tokenization and JSON syntax degradation after 4-bit quantization.

### 6.4 Stage C — Export to `.litertlm` (`ai-edge-torch`)
1. Convert merged Hugging Face checkpoint using **Google `ai-edge-torch` Generative API** with **INT4 weight quantization** (`dynamic_int4` / `weight_only_int4`) and `kv_cache_max_len = 6144`.
2. Bundle tokenizer + metadata into a single `.litertlm` archive (e.g., `plotcraft-gemma4-e2b-th-int4.litertlm`).
3. **Optional Multi-LoRA Architecture:** `litertlm-android:0.20.0` exposes `ConversationConfig(loraConfig = ...)`. Instead of merging a single generalist model, you can keep 1 base `.litertlm` on device and swap lightweight LoRA adapters (~30–80 MB each):
   - `plotcraft-architect-json.lora` (Stage 1, Stage 2, Continuity Audit)
   - `plotcraft-writer-thai.lora` (Stage 3 Prose & Highlight-to-Refine)

---

## 7. Automated Evaluation Protocol (Pre-Deployment Gate)

Run a held-out **50-case evaluation suite** covering all 7 structures and 8 genres before deploying `.litertlm` to Android:

| Metric | Pass Threshold | Verification Method |
| :--- | :---: | :--- |
| **JSON Parse Rate (1st try)** | `>= 98%` | Raw output parses with `JSON.parse()` without `repairTruncatedJson()` |
| **Zod Schema Pass Rate** | `>= 95%` | Passes exact Zod validators in `src/types/novel.ts` |
| **Beat Count Exact Match** | `>= 98%` | `plotBeats.length === template.beatCount` |
| **Pinned Canon Fidelity** | `>= 90%` | Zero contradictions against `PINNED LORE` / `PINNED CHARACTERS` |
| **On-Device Latency (SM8850)** | `>= 15 tok/s` | Measured via `adb logcat -s LiteRtLmBridge` (`thermalStatus < severe`) |

---

## 8. Recommended Engineering Additions to This Repository

To operationalize this fine-tuning loop directly inside `Novelcraft-th-moblie`, consider adding:
1. **`scripts/generate-dataset.ts`**: Node/TS generator that imports `GENRES`, `STORY_STRUCTURES`, prompt builders, and Zod schemas directly from `src/` to synthesize and validate `train.jsonl` / `val.jsonl`.
2. **In-App Human-in-the-Loop Export (`exportTrainingJsonl`)**: Export user-edited outlines and refined Thai chapters from IndexedDB as high-signal SFT/DPO pairs.
3. **`loraPath` Support in `LiteRtLmBridge.kt` & `OnDeviceLLMPlugin.java`**: Wire `ConversationConfig(loraConfig = ...)` so the app automatically attaches the JSON-Architect LoRA for Stage 1–2 and the Thai-Prose LoRA for Stage 3.
4. **`scripts/eval-model.ts`**: Automated 50-case benchmark runner reporting Zod pass rate, beat-count accuracy, and token efficiency.

# Changelog

บันทึกการเปลี่ยนแปลงและพัฒนาการของโปรเจกต์ **PlotCraft TH**

---

## [4.0.0] — Android Mobile App & On-Device Local AI (LiteRT-LM)
### Added
- **Android Mobile Wrapper (Capacitor 8):** แปลงโปรเจกต์เป็นแอป Android (`th.plotcraft.novelstudio`) รองรับ Safe Area, `CapacitorHttp` (ไม่ติด CORS), และแชร์/บันทึกไฟล์ผ่าน `@capacitor/filesystem` + `@capacitor/share`
- **On-Device Local AI (`com.google.ai.edge.litertlm:litertlm-android:0.20.0`):**
  - สร้าง `OnDeviceLLMPlugin.java` + `LiteRtLmBridge.kt` (Kotlin `2.4.21`) รองรับการรันไฟล์ `.litertlm` / `.task` ออฟไลน์บนมือถือ พร้อม Fallback อัตโนมัติ `NPU → GPU → CPU`
  - เพิ่มหน้า **Local AI Model Manager (`OnDeviceModelManager.tsx`)** รองรับการ **นำเข้าไฟล์จากเครื่องมือถือ (Android File Picker)**, **ดาวน์โหลดจาก URL ใดก็ได้** (พร้อม HTTP Range Resume และปุ่มลัดลิงก์ Hugging Face), สแกนไฟล์ในเครื่องอัตโนมัติ และสวิตช์เลือก Backend (`NPU→GPU` / `GPU` / `CPU`)
  - ตรวจจับฮาร์ดแวร์ Snapdragon (`SM8850`), RAM, พื้นที่ว่าง, อุณหภูมิเครื่อง (Thermal Guard) และคืนหน่วยความจำอัตโนมัติใน `MainActivity.onTrimMemory()`
- **Gemma 4 Mobile JSON & Speed Tuning:**
  - ปิด Thinking Mode (`ThinkingConfig(enableThinking = false)`) เพื่อลดเวลาตอบและความร้อนบนมือถือ
  - เปิด Native JSON Constrained Decoding (`ResponseFormat.json`) + ดึงข้อความจาก `Content.Text.text` โดยตรง + ขยาย Context เป็น `6,144` tokens
  - ปิด Auto-Retry วนซ้ำในโหมด On-Device (`maxRetries = 0`), เพิ่ม `repairTruncatedJson()` ซ่อม JSON ที่ถูกตัดจบ และเพิ่ม Compact Prompt
  - จำกัด Auto-Write Batch บนโหมด Local AI เป็นชุดละไม่เกิน 2 ตอนพร้อมพักเครื่อง 2.5 วินาที

### Changed / Removed (Mobile Cleanup)
- ตัดส่วนที่เฉพาะเว็บ/เดสก์ท็อปออก: ลบ `api/cors-proxy.ts`, `vercel.json`, middleware CORS Proxy ใน `vite.config.ts` และ Checkbox CORS Proxy ใน `ApiKeyModal.tsx`
- ปรับรายการ AI Provider ให้กระชับสำหรับมือถือ เหลือ 4 ตัวเลือกหลัก: **Local AI (.litertlm ออฟไลน์)**, **OpenRouter**, **Google Gemini API** และ **Custom OpenAI API**
- ซ่อนช่อง `Fast Model` อัตโนมัติเมื่อเลือกโหมด Local AI เพื่อลดการ Unload/Reload โมเดลขนาดใหญ่
- ปรับเมนู Export ให้กระชับ คง **โครงเรื่อง Markdown (`.md`)** (สำหรับส่งให้ AI ภายนอก), **ต้นฉบับ (`.md` / `.txt`)** และ **Backup (`.json`)**

---

## [3.1.0] — Token Optimization Suite
### Added
- **Smart Context Pruning:** เพิ่ม Beat Windowing (ส่งเฉพาะ 3 จังหวะที่เกี่ยวข้อง) และ Character Relevance Filter (ส่งโปรไฟล์เต็มเฉพาะตัวเอกและตัวละครที่ปรากฏในตอน)
- **Highlight-to-Refine:** ลากคลุมเฉพาะย่อหน้าที่ต้องการแก้ใน `WriterTab` เพื่อปรับเฉพาะท่อนนั้น (ลด Token 80–90%)
- **Prompt Caching Layout:** จัดเรียงส่วนคงที่ (`Pinned Lore`, `Pinned Characters`, `Style Anchor`) ไว้ด้านบนสุด และย่อ System Prompts ให้กระชับ
- **Dual-Model Routing (`fastModel`):** แยกโมเดลประหยัดสำหรับงานเบาออกจากโมเดลหลัก
- **Rolling Summary Compression:** ปุ่มบีบอัดสรุปสะสมด้วย Fast Model ใน `OverviewTab`
- **Token Estimator & Economy Mode (`⚡`):** แสดงประมาณการ Token แบบเรียลไทม์ เตือนเมื่อปักหมุดเกิน 10 การ์ด และลดขนาด Batch ตอนจาก 5 เหลือ 3 ตอนเมื่อเปิดโหมดประหยัด

---

## [3.0.0] — Auto-Pilot Novel Studio
### Added
- **1-Click AI Story Director:** โหมดแต่งสำเร็จรูปที่พิมพ์แค่ไอเดียสั้นๆ แล้วให้ AI เลือกชื่อเรื่อง 3 ตัวเลือก แนว ทฤษฎีพร้อมเหตุผล โทน จำนวนตอน และ POV ให้อัตโนมัติ
- **Full Auto-Pilot Pipeline:** สร้างโครงสร้างมหภาค (Stage 1) → แตกตอนที่ 1–5 (Stage 2) → แต่งนิยายเต็มตอนที่ 1 (Stage 3) ในคำสั่งเดียว
- **Stage 3 Prose Writer (`WriterTab`):** แท็บแต่งนิยายฉบับเต็มพร้อม Auto-Pilot แต่งต่อเนื่องทุกตอนที่เหลือ และคำสั่งด่วนปรับสำนวน/ขยายฉาก
- **Style Anchor (`StyleAnchorModal`):** ลองชิม 3 สำนวนเปิดเรื่องแล้วล็อกสำนวนที่ชอบคุมโทนทั้งเรื่อง
- **Continuity Audit (`ContinuityAuditModal`):** AI บรรณาธิการให้คะแนนความสมเหตุสมผล (0–100) พร้อมชี้พล็อตโฮลและวิธีแก้
- **Trope Boosters & Random Seed Ideas:** ชิปเติมรสชาติ 12 แบบ และปุ่มสุ่มไอเดียตั้งต้น
- **Manuscript Export:** ส่งออกเฉพาะต้นฉบับนิยายพร้อมลง ReadAWrite / Dek-D (`.md`, `.txt`)
- อัปเกรด `schemaVersion` เป็น `3` (รองรับ `writingStyle` และ `chapter.content`)

---

## [2.1.0] — Universal Multi-Provider AI & CORS Proxy
### Added
- รองรับ AI API ทุกค่าย: OpenRouter, Google Gemini, OpenAI, Anthropic Claude, DeepSeek, Groq, Typhoon (SCB 10X), Ollama / LM Studio และ Custom OpenAI-Compatible API
- ปุ่ม **ดึงรายชื่อโมเดลที่ใช้ได้จริง (`GET /models`)** เพื่อไม่ให้ติดปัญหาชื่อโมเดลเก่าหมดอายุ
- แยกเก็บ API Key รายผู้ให้บริการใน LocalStorage
- เพิ่ม **Local CORS Proxy (`/api/cors-proxy`)** ใน `vite.config.ts` และ **Vercel Edge Function** ใน `api/cors-proxy.ts` พร้อมป้องกัน SSRF
- เพิ่ม `vercel.json` และ `.gitignore` พร้อม Deploy ขึ้น Vercel

---

## [1.0.0] — Core Thai Novel Outliner (Initial Build)
### Added
- ระบบวางโครงเรื่องนิยาย 2 ระยะ (Stage 1 Macro Outliner + Stage 2 Chapter Beats Expander)
- คลังแนวนิยาย 8 แนวหลัก (ผสมได้ 3 แนว) และ 7 ทฤษฎีโครงสร้างการเล่าเรื่องสากล
- พื้นที่ทำงาน 4 แท็บ: Overview & Plot Beats, World-Building (Lore Pinning), Characters (Relationships & Pinning), Chapter Beats
- Inline Editing, Granular Regeneration พร้อม Steering Prompt, Undo Stack (20 ขั้น), Auto-Save ลง IndexedDB (Dexie.js)
- โหมด Import Draft (`.txt` / `.md`) และ Export/Import Backup (`.md`, `.txt`, `.json`)
- ระบบ Auto-Retry (Exponential Backoff), AbortController Cancel, Zod Validation และ Safety Settings

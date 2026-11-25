# PlotCraft TH — สตูดิโอวางโครงเรื่องและแต่งนิยายภาษาไทยด้วย AI (Mobile & Local AI)

> **Structured Thai Novel Outliner & Auto-Pilot Prose Studio (Android Capacitor + LiteRT-LM)**  
> แอปพลิเคชันสำหรับนักเขียนนิยายไทยแบบ **Local-First & Offline-Capable** ช่วยตั้งแต่คิดไอเดีย วางโครงเรื่องตามทฤษฎีการเล่าเรื่องสากล จัดการ Lore/ตัวละคร แตกโครงรายตอน ไปจนถึงแต่งเนื้อหานิยายฉบับเต็ม โดยรองรับทั้ง **Local AI ออฟไลน์บนมือถือ (Gemma 4 ผ่าน Google LiteRT-LM)** และ **Cloud AI API**

---

## จุดเด่นหลัก (Key Highlights)

- **แอป Android พร้อม Local AI ออฟไลน์ (`LiteRT-LM 0.20.0`):**
  - รองรับการ **นำเข้าไฟล์ `.litertlm` / `.task` จากเครื่องมือถือ** (Android File Picker) หรือ **ดาวน์โหลดจาก URL** แบบ Resume ได้
  - เลือก Backend ได้อิสระ (**`NPU → GPU`**, **`GPU`**, **`CPU`**) พร้อมตรวจจับชิป Snapdragon (`SM8850`), RAM, พื้นที่ว่าง และอุณหภูมิเครื่อง
  - ปรับจูนเฉพาะสำหรับ Gemma 4 บนมือถือ: ปิด Thinking Mode (`ThinkingConfig(enableThinking = false)`), เปิด Native JSON Mode (`ResponseFormat.json`), ขยาย Context เป็น 6,144 tokens, ปิด Auto-Retry วนซ้ำ และมี JSON Auto-Repair
- **รองรับ Cloud API ผ่าน Native HTTP (ไม่ติด CORS):** OpenRouter (รวมทุกค่าย), Google Gemini API และ Custom OpenAI-Compatible API
- **โหมดแต่งนิยายสำเร็จรูป (Auto-Pilot Novel Studio):** พิมพ์แค่ไอเดีย 1–3 ประโยค ให้ **AI Story Director** เลือกชื่อเรื่อง แนว ทฤษฎีโครงเรื่อง โทน และ POV ให้ครบ แล้วรันสร้างโครง + ตอนที่ 1–5 + แต่งตอนที่ 1 ทันที
- **คลังความรู้การเล่าเรื่องในตัว:** แนวนิยาย 8 แนวหลัก (ผสมได้สูงสุด 3 แนว), ทฤษฎีโครงสร้าง 7 ทฤษฎีสากล, และ 12 Trope Boosters
- **กระบวนการสร้าง 3 ระยะ (Stage 1 → 2 → 3):**
  - **Stage 1 (Macro Outliner):** สร้าง Logline, World-Building, Characters, Plot Beats
  - **Stage 2 (Chapter Beats Expander):** แตกโครงรายตอนทีละชุด พร้อมอัปเดต `Rolling Summary` อัตโนมัติ
  - **Stage 3 (AI Prose Writer):** แต่งเนื้อหานิยายเต็มตอน + **Style Anchor** + **Highlight-to-Refine** (แก้เฉพาะย่อหน้า) + คุมความร้อน NPU/GPU (จำกัด Batch ชุดละ 2 ตอนพร้อมพักเครื่องบนโหมด Local AI)
- **ระบบประหยัด Token ครบชุด:** Smart Context Pruning, Beat Windowing, Highlight-to-Refine, Rolling Summary Compression และ Economy Mode (`⚡`)
- **ส่งออกและแชร์ตรงบนมือถือ (`@capacitor/filesystem` + `@capacitor/share`):**
  - Export **โครงเรื่อง Markdown (`.md`)** สำหรับส่งต่อให้ AI ภายนอกช่วยแต่งหรือเปิดใน Obsidian
  - Export **ต้นฉบับนิยาย (`.md` / `.txt`)** พร้อมลง ReadAWrite / Dek-D
  - Export / Import **Backup (`.json`)**

---

## Tech Stack

| หมวดหมู่ | เทคโนโลยี |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS v4, Lucide Icons |
| **Mobile Wrapper** | Capacitor 8 (`@capacitor/android`, `CapacitorHttp`, `Filesystem`, `Share`, `App`) |
| **On-Device AI** | Google LiteRT-LM Android (`com.google.ai.edge.litertlm:litertlm-android:0.20.0`), Kotlin `2.4.21` |
| **Cloud AI** | `@google/genai`, OpenAI-Compatible Fetch Adapter (ผ่าน Native `CapacitorHttp`) |
| **Validation & Storage** | Zod, Dexie.js (IndexedDB), LocalStorage, Zustand |

---

## การติดตั้งและเริ่มต้นใช้งาน (Quick Start)

### ข้อกำหนดเบื้องต้น
- Node.js 20+ และ npm
- Android Studio (พร้อม JDK 21 และ Android SDK สำหรับ Build APK)

### คำสั่งหลัก
```bash
# 1. ติดตั้ง Dependencies
npm install

# 2. รันโหมดพัฒนาบนเบราว์เซอร์
npm run dev

# 3. Build เว็บและ Sync ลงโปรเจกต์ Android
npm run cap:sync

# 4. เปิดโปรเจกต์ Android ใน Android Studio
npm run cap:open
```

### Build และติดตั้ง APK ผ่านบรรทัดคำสั่ง (Windows PowerShell)
ดูขั้นตอนเต็ม (รวมวิธีแก้ปัญหาโฟลเดอร์ภาษาไทยและการติดตั้งผ่าน `adb install -r`) ได้ที่ [docs/ANDROID_NPU_SETUP.md](./docs/ANDROID_NPU_SETUP.md)

---

## โครงสร้างโฟลเดอร์ (Project Structure)

```text
Novelcarft-th/
├── android/                                   # โปรเจกต์ Android Native (Capacitor + Gradle 8.14.2)
│   └── app/src/main/java/th/plotcraft/novelstudio/
│       ├── MainActivity.java                  # ลงทะเบียน Plugin + onTrimMemory() คืน RAM
│       ├── OnDeviceLLMPlugin.java             # Capacitor Plugin: File Picker, URL Download, Scan, Thermal Guard
│       └── LiteRtLmBridge.kt                  # Kotlin Bridge: LiteRT-LM 0.20.0 (NPU/GPU/CPU, JSON Mode, No-Thinking)
├── docs/
│   ├── ANDROID_NPU_SETUP.md                   # คู่มือ Build APK, ติดตั้งผ่าน ADB และรัน Gemma 4 บนมือถือ
│   ├── PRODUCT_SPEC.md                        # สเปกผลิตภัณฑ์ (v3)
│   ├── ARCHITECTURE.md                        # สถาปัตยกรรมระบบ Data Schema & Token Optimization
│   ├── AI_PROMPT_RULES.md                     # กฎเหล็กของ AI และ Prompt Engineering
│   └── USER_GUIDE.md                          # คู่มือการใช้งานสำหรับนักเขียน
├── src/
│   ├── components/
│   │   ├── workspace/
│   │   │   ├── OverviewTab.tsx                # แท็บ 1: Logline, Rolling Summary & Plot Beats
│   │   │   ├── WorldBuildingTab.tsx           # แท็บ 2: Lore Bible & Pinning
│   │   │   ├── CharactersTab.tsx              # แท็บ 3: ตัวละคร ความสัมพันธ์ & Pinning
│   │   │   ├── ChaptersTab.tsx                # แท็บ 4: โครงสร้างรายตอน (Stage 2)
│   │   │   └── WriterTab.tsx                  # แท็บ 5: แต่งนิยายเต็มตอน (Stage 3 + Highlight-to-Refine)
│   │   ├── ApiKeyModal.tsx                    # ตั้งค่า Local AI & Cloud API (OpenRouter / Gemini / Custom)
│   │   ├── OnDeviceModelManager.tsx           # จัดการไฟล์ .litertlm (นำเข้าไฟล์ / โหลด URL / เลือก Backend)
│   │   ├── ContinuityAuditModal.tsx           # AI บรรณาธิการตรวจพล็อตโฮล
│   │   ├── Dashboard.tsx                      # คลังโปรเจกต์ ค้นหา ทำสำเนา Backup/Restore
│   │   ├── Header.tsx                         # แถบนำทางหลักและสถานะ AI
│   │   ├── NewProjectWizard.tsx               # 3 โหมดสร้างโปรเจกต์ (Auto-Pilot / Custom / Import)
│   │   ├── SteeringModal.tsx                  # หน้าต่างใส่คำสั่งเพิ่มเติม (Steering Prompt)
│   │   ├── StyleAnchorModal.tsx               # ลองชิม 3 สำนวนเปิดเรื่อง (Style Anchor)
│   │   ├── ToastContainer.tsx                 # ระบบแจ้งเตือน
│   │   └── Workspace.tsx                      # พื้นที่ทำงาน 5 แท็บ + Token Estimator + Export (.md/.txt/.json)
│   ├── data/
│   │   ├── aiProviders.ts                     # Preset 4 ค่ายหลัก (Local AI, OpenRouter, Gemini, Custom API)
│   │   └── knowledgeBase.ts                   # 8 แนวนิยาย, 7 ทฤษฎีโครงเรื่อง, Trope Boosters
│   ├── db/
│   │   └── database.ts                        # Dexie.js IndexedDB & LocalStorage helpers
│   ├── services/
│   │   ├── geminiService.ts                   # Multi-Provider AI Engine + JSON Auto-Repair + Token Pruning
│   │   └── onDeviceLlm.ts                     # TypeScript Bridge เชื่อม Native OnDeviceLLMPlugin
│   ├── store/
│   │   └── useAppStore.ts                     # Zustand Global Store & Undo Stack
│   ├── types/
│   │   └── novel.ts                           # TypeScript Types & Zod Schemas (v3)
│   └── utils/
│       ├── exporter.ts                        # Export/Share ไฟล์ (.md, .txt, .json) รองรับ Native Android
│       └── tokenEstimator.ts                  # ตัวประมาณการ Token ภาษาไทย/อังกฤษ
├── capacitor.config.ts                        # ตั้งค่า Capacitor Android + Native CapacitorHttp
├── CHANGELOG.md
└── vite.config.ts
```

---

## สารบัญเอกสาร (Documentation Index)

- [คู่มือ Build แอป Android & รัน Local AI (Gemma 4)](./docs/ANDROID_NPU_SETUP.md)
- [สเปกผลิตภัณฑ์ (Product Specification)](./docs/PRODUCT_SPEC.md)
- [สถาปัตยกรรมระบบและโครงสร้างข้อมูล (Architecture & Schema)](./docs/ARCHITECTURE.md)
- [กฎเหล็กของ AI และ Prompt Engineering (AI Prompt Rules)](./docs/AI_PROMPT_RULES.md)
- [คู่มือการใช้งานสำหรับนักเขียน (User Guide)](./docs/USER_GUIDE.md)
- [ประวัติการพัฒนา (Changelog)](./CHANGELOG.md)

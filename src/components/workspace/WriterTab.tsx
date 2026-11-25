import { useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Feather,
  Palette,
  Play,
  Scissors,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  CHAPTER_LENGTH_OPTIONS,
  POV_PRESETS,
  PROSE_REFINE_PRESETS,
  PROSE_STYLE_PRESETS,
} from '../../data/knowledgeBase';
import { refineChapterProse, refineSelectedProse, writeChapterProse } from '../../services/geminiService';
import { estimateTokens } from '../../utils/tokenEstimator';
import { SteeringModal } from '../SteeringModal';
import { StyleAnchorModal } from '../StyleAnchorModal';

export function WriterTab() {
  const {
    activeProject,
    apiKey,
    aiSettings,
    isAIConfigured,
    setApiModalOpen,
    setActiveTab,
    updateActiveProject,
    isGenerating,
    startGeneration,
    updateGenerationLabel,
    endGeneration,
    addToast,
  } = useAppStore();

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showBeatRef, setShowBeatRef] = useState(true);
  const [writeModalOpen, setWriteModalOpen] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [styleAnchorOpen, setStyleAnchorOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const proseRef = useRef<HTMLTextAreaElement>(null);

  if (!activeProject) return null;

  const { chapters } = activeProject;
  const ws = activeProject.metadata.writingStyle ?? {
    pov: POV_PRESETS[0],
    proseStyle: PROSE_STYLE_PRESETS[0],
    chapterLength: 'medium' as const,
    styleAnchor: '',
  };

  const safeIdx = Math.min(selectedIdx, Math.max(0, chapters.length - 1));
  const currentChapter = chapters[safeIdx];
  const writtenCount = chapters.filter((c) => c.content?.trim()).length;

  const updateWritingStyle = (patch: Partial<typeof ws>) => {
    updateActiveProject(
      (p) => {
        p.metadata.writingStyle = {
          ...(p.metadata.writingStyle ?? ws),
          ...patch,
        };
        return p;
      },
      false
    );
  };

  const handleWriteCurrentChapter = async (steeringPrompt: string) => {
    setWriteModalOpen(false);
    if (!currentChapter) return;
    if (!isAIConfigured()) {
      setApiModalOpen(true);
      return;
    }

    const controller = startGeneration(
      `Stage 3: กำลังแต่งนิยายเต็มตอน — ตอนที่ ${currentChapter.chapterNumber}: "${currentChapter.title}"...`
    );

    try {
      const prose = await writeChapterProse({
        apiKey,
        settings: aiSettings,
        project: activeProject,
        chapterIndex: safeIdx,
        steeringPrompt,
        signal: controller.signal,
        onRetry: (a, ms) =>
          updateGenerationLabel(`ลองใหม่ครั้งที่ ${a} (รอ ${Math.round(ms / 1000)} วิ)...`),
      });

      await updateActiveProject((p) => {
        p.chapters[safeIdx].content = prose;
        return p;
      });

      addToast({
        type: 'success',
        title: `แต่งตอนที่ ${currentChapter.chapterNumber} เสร็จเรียบร้อย!`,
        description: `ความยาว ${prose.length.toLocaleString()} ตัวอักษร`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'แต่งเนื้อเรื่องไม่สำเร็จ',
        description: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      endGeneration();
    }
  };

  const handleAutoWriteBatch = async () => {
    if (!isAIConfigured()) {
      setApiModalOpen(true);
      return;
    }

    const unwrittenIndices = chapters
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => !c.content?.trim())
      .map(({ idx }) => idx);

    if (unwrittenIndices.length === 0) {
      addToast({
        type: 'info',
        title: 'แต่งครบทุกตอนที่มีโครงเรื่องแล้ว!',
        description: 'สามารถสร้างโครงสร้างตอนชุดถัดไปในแท็บ โครงสร้างรายตอน ได้เลย',
      });
      return;
    }

    const isOnDevice = aiSettings.provider === 'on-device';
    const targetIndices = isOnDevice ? unwrittenIndices.slice(0, 2) : unwrittenIndices;

    const controller = startGeneration(
      isOnDevice
        ? `On-Device NPU: เริ่มแต่ง ${targetIndices.length} ตอน (จำกัดชุดละ 2 ตอนเพื่อคุมความร้อนมือถือ)...`
        : `Auto-Pilot: เริ่มแต่งต่อเนื่องอัตโนมัติ ${targetIndices.length} ตอน...`
    );

    let completed = 0;
    try {
      for (const idx of targetIndices) {
        if (controller.signal.aborted) break;
        const latestProject = useAppStore.getState().activeProject;
        if (!latestProject) break;

        const ch = latestProject.chapters[idx];
        setSelectedIdx(idx);
        updateGenerationLabel(
          `Auto-Pilot (${completed + 1}/${targetIndices.length}): กำลังแต่งตอนที่ ${ch.chapterNumber} "${ch.title}"...`
        );

        const prose = await writeChapterProse({
          apiKey,
          settings: aiSettings,
          project: latestProject,
          chapterIndex: idx,
          signal: controller.signal,
          onRetry: (a, ms) =>
            updateGenerationLabel(
              `ตอนที่ ${ch.chapterNumber}: ลองใหม่ครั้งที่ ${a} (รอ ${Math.round(ms / 1000)} วิ)...`
            ),
        });

        await updateActiveProject((p) => {
          p.chapters[idx].content = prose;
          return p;
        });
        completed++;

        // Thermal cooldown between chapters on mobile NPU
        if (isOnDevice && completed < targetIndices.length && !controller.signal.aborted) {
          updateGenerationLabel('กำลังพัก NPU 2.5 วินาทีเพื่อคุมอุณหภูมิเครื่อง...');
          await new Promise((r) => setTimeout(r, 2500));
        }
      }

      if (completed > 0) {
        addToast({
          type: 'success',
          title: `Auto-Pilot แต่งเสร็จแล้ว ${completed} ตอน!`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      if (!controller.signal.aborted) {
        addToast({
          type: 'error',
          title: `หยุด Auto-Pilot หลังแต่งเสร็จ ${completed} ตอน`,
          description: msg,
        });
      }
    } finally {
      endGeneration();
    }
  };

  const selectedText =
    selectionRange && currentChapter?.content
      ? currentChapter.content.slice(selectionRange.start, selectionRange.end)
      : '';
  const hasSelection = selectedText.trim().length >= 10;

  const handleSelectText = () => {
    const el = proseRef.current;
    if (!el) return;
    if (el.selectionEnd - el.selectionStart >= 10) {
      setSelectionRange({ start: el.selectionStart, end: el.selectionEnd });
    } else {
      setSelectionRange(null);
    }
  };

  const handleRefine = async (instructionText: string, onlySelection = false) => {
    const clean = instructionText.trim();
    if (!clean || !currentChapter?.content?.trim()) return;
    setRefineOpen(false);
    setRefineInstruction('');

    if (!isAIConfigured()) {
      setApiModalOpen(true);
      return;
    }

    if (onlySelection && selectionRange && hasSelection) {
      const full = currentChapter.content;
      const beforeContext = full.slice(0, selectionRange.start);
      const targetSlice = full.slice(selectionRange.start, selectionRange.end);
      const afterContext = full.slice(selectionRange.end);

      const controller = startGeneration(
        `Highlight-to-Refine: กำลังปรับเฉพาะท่อนที่เลือก (~${estimateTokens(targetSlice)} tok)...`
      );
      try {
        const revised = await refineSelectedProse({
          apiKey,
          settings: aiSettings,
          project: activeProject,
          beforeContext,
          selectedText: targetSlice,
          afterContext,
          instruction: clean,
          signal: controller.signal,
          onRetry: (a, ms) =>
            updateGenerationLabel(`ลองใหม่ครั้งที่ ${a} (รอ ${Math.round(ms / 1000)} วิ)...`),
        });

        await updateActiveProject((p) => {
          p.chapters[safeIdx].content = `${beforeContext}${revised}${afterContext}`;
          return p;
        });
        setSelectionRange(null);
        addToast({
          type: 'success',
          title: 'ปรับเฉพาะท่อนที่เลือกเรียบร้อย! (ประหยัด Token ~85%)',
          description: 'สามารถกด Undo ด้านบนเพื่อย้อนกลับได้',
        });
      } catch (err) {
        addToast({
          type: 'error',
          title: 'ปรับเฉพาะท่อนที่เลือกไม่สำเร็จ',
          description: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
        });
      } finally {
        endGeneration();
      }
      return;
    }

    const controller = startGeneration(`กำลังปรับปรุงสำนวนตอนที่ ${currentChapter.chapterNumber} ทั้งตอน...`);
    try {
      const refined = await refineChapterProse({
        apiKey,
        settings: aiSettings,
        project: activeProject,
        chapterIndex: safeIdx,
        instruction: clean,
        signal: controller.signal,
        onRetry: (a, ms) =>
          updateGenerationLabel(`ลองใหม่ครั้งที่ ${a} (รอ ${Math.round(ms / 1000)} วิ)...`),
      });

      await updateActiveProject((p) => {
        p.chapters[safeIdx].content = refined;
        return p;
      });
      addToast({
        type: 'success',
        title: `ปรับปรุงตอนที่ ${currentChapter.chapterNumber} เรียบร้อยแล้ว`,
        description: 'สามารถกด Undo ด้านบนเพื่อย้อนกลับเป็นฉบับก่อนหน้าได้',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'ปรับปรุงเนื้อเรื่องไม่สำเร็จ',
        description: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      endGeneration();
    }
  };

  const handleCopyProse = async () => {
    if (!currentChapter?.content) return;
    await navigator.clipboard.writeText(
      `ตอนที่ ${currentChapter.chapterNumber}: ${currentChapter.title}\n\n${currentChapter.content}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (chapters.length === 0) {
    return (
      <div className="bg-white rounded-2xl border-2 border-dashed border-stone-200 p-12 text-center">
        <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center mx-auto mb-3">
          <Feather className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-stone-900">ยังไม่มีโครงสร้างรายตอนสำหรับแต่งเนื้อเรื่อง</h3>
        <p className="text-xs text-stone-500 max-w-md mx-auto mt-1.5 leading-relaxed">
          ไปที่แท็บ "โครงสร้างรายตอน" เพื่อสร้างตอนชุดแรกก่อน จากนั้นกลับมาแต่งเนื้อหานิยายฉบับเต็มที่นี่ได้เลย
        </p>
        <button
          type="button"
          onClick={() => setActiveTab('chapters')}
          className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          ไปที่แท็บโครงสร้างรายตอน
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Writing Style Controls */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Feather className="w-5 h-5 text-violet-600" />
            <h2 className="text-base font-bold text-stone-900">
              สตูดิโอแต่งนิยายเต็มตอน (Stage 3 • แต่งแล้ว {writtenCount}/{chapters.length} ตอน)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStyleAnchorOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                ws.styleAnchor
                  ? 'bg-violet-50 border-violet-300 text-violet-800 hover:bg-violet-100'
                  : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              {ws.styleAnchor ? 'Style Anchor (ตั้งค่าแล้ว)' : 'ลองชิม 3 สำนวน (Style Anchor)'}
            </button>

            <button
              type="button"
              disabled={isGenerating}
              onClick={handleAutoWriteBatch}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:opacity-95 disabled:opacity-50 shadow-xs"
            >
              <Play className="w-3.5 h-3.5" />
              Auto-Pilot แต่งตอนที่เหลือทั้งหมด
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-stone-500 mb-1">มุมมองการเล่า (POV)</label>
            <input
              type="text"
              list="pov-presets"
              value={ws.pov}
              onChange={(e) => updateWritingStyle({ pov: e.target.value })}
              className="w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-1.5 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <datalist id="pov-presets">
              {POV_PRESETS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-500 mb-1">สไตล์สำนวนภาษา</label>
            <input
              type="text"
              list="prose-style-presets"
              value={ws.proseStyle}
              onChange={(e) => updateWritingStyle({ proseStyle: e.target.value })}
              className="w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-1.5 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <datalist id="prose-style-presets">
              {PROSE_STYLE_PRESETS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-500 mb-1">ความยาวเป้าหมายต่อตอน</label>
            <select
              value={ws.chapterLength}
              onChange={(e) =>
                updateWritingStyle({ chapterLength: e.target.value as 'short' | 'medium' | 'long' })
              }
              className="w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-1.5 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {CHAPTER_LENGTH_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Split View: Chapter Sidebar + Prose Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Chapter Selector List */}
        <aside className="lg:col-span-3 space-y-1.5 max-h-[680px] overflow-y-auto pr-1">
          {chapters.map((ch, idx) => {
            const active = idx === safeIdx;
            const hasProse = Boolean(ch.content?.trim());
            return (
              <button
                key={`${ch.chapterNumber}-${idx}`}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  active
                    ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-indigo-700">ตอนที่ {ch.chapterNumber}</span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      hasProse ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {hasProse ? `${ch.content.length.toLocaleString()} ตัวอักษร` : 'ยังไม่แต่ง'}
                  </span>
                </div>
                <p className="text-xs font-semibold text-stone-900 mt-1 line-clamp-1">{ch.title}</p>
              </button>
            );
          })}
        </aside>

        {/* Prose Editor Panel */}
        <section className="lg:col-span-9 bg-white rounded-2xl border border-stone-200 overflow-hidden flex flex-col">
          {/* Chapter Action Bar */}
          <div className="px-5 py-3.5 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2 bg-stone-50/50">
            <div>
              <h3 className="text-base font-bold text-stone-900">
                ตอนที่ {currentChapter.chapterNumber}: {currentChapter.title}
              </h3>
              <p className="text-[11px] text-stone-500">
                {currentChapter.content?.trim()
                  ? `ความยาว ${currentChapter.content.length.toLocaleString()} ตัวอักษร`
                  : 'ยังไม่ได้แต่งเนื้อเรื่องของตอนนี้'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentChapter.content?.trim() && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyProse}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </button>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setRefineOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    ปรับสำนวน / ขยายฉาก
                  </button>
                </>
              )}

              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setWriteModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {currentChapter.content?.trim() ? 'แต่งตอนนี้ใหม่ด้วย AI' : 'แต่งตอนนี้ให้เสร็จด้วย AI'}
              </button>
            </div>
          </div>

          {/* Highlight-to-Refine Quick Bar (80-90% Token Savings!) */}
          {hasSelection && (
            <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-emerald-900">
                <Scissors className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Highlight-to-Refine:</strong> เลือกไว้ {selectedText.length.toLocaleString()} ตัวอักษร (~{estimateTokens(selectedText)} tok) — แก้เฉพาะท่อนนี้ประหยัด Token ได้ 80–90%
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRefineOpen(true)}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
              >
                ปรับเฉพาะท่อนที่เลือก
              </button>
            </div>
          )}

          {/* Refine Drawer */}
          {refineOpen && currentChapter.content?.trim() && (
            <div className="px-5 py-3.5 bg-amber-50/60 border-b border-amber-200/80 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-amber-950">
                  {hasSelection
                    ? `โหมดประหยัด: ปรับเฉพาะท่อนที่เลือก (${selectedText.length} ตัวอักษร)`
                    : 'เลือกคำสั่งปรับปรุงทั้งตอน (หรือลากคลุมเฉพาะย่อหน้าด้านล่างเพื่อประหยัด Token):'}
                </p>
                {hasSelection && (
                  <button
                    type="button"
                    onClick={() => setSelectionRange(null)}
                    className="text-[11px] font-semibold text-stone-500 hover:text-stone-800 underline"
                  >
                    เปลี่ยนเป็นแก้ทั้งตอน
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PROSE_REFINE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => handleRefine(preset, hasSelection)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={refineInstruction}
                  onChange={(e) => setRefineInstruction(e.target.value)}
                  placeholder="หรือพิมพ์คำสั่งปรับปรุงเอง เช่น เพิ่มฉากปะทะคารมให้ดุเดือดขึ้น..."
                  className="flex-1 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  disabled={isGenerating || !refineInstruction.trim()}
                  onClick={() => handleRefine(refineInstruction, hasSelection)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {hasSelection ? 'ปรับเฉพาะท่อนที่เลือก' : 'ปรับปรุงทั้งตอน'}
                </button>
              </div>
            </div>
          )}

          {/* Collapsible Beat Reference */}
          <div className="border-b border-stone-100 bg-stone-50/30">
            <button
              type="button"
              onClick={() => setShowBeatRef(!showBeatRef)}
              className="w-full px-5 py-2 flex items-center justify-between text-xs font-semibold text-stone-500 hover:text-stone-800"
            >
              <span>โครงเรื่องอ้างอิงของตอนนี้ (Goal / Conflict / Outcome / Cliffhanger)</span>
              {showBeatRef ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showBeatRef && (
              <div className="px-5 pb-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-stone-600">
                <div><strong className="text-emerald-700">เป้าหมาย:</strong> {currentChapter.goal}</div>
                <div><strong className="text-rose-700">ความขัดแย้ง:</strong> {currentChapter.conflict}</div>
                <div><strong className="text-sky-700">ผลลัพธ์:</strong> {currentChapter.outcome}</div>
                <div><strong className="text-amber-700">จุดทิ้งท้าย:</strong> {currentChapter.cliffhanger}</div>
              </div>
            )}
          </div>

          {/* Literary Prose Textarea */}
          <div className="p-5 flex-1">
            <textarea
              ref={proseRef}
              rows={20}
              value={currentChapter.content ?? ''}
              onSelect={handleSelectText}
              onChange={(e) => {
                setSelectionRange(null);
                updateActiveProject(
                  (p) => {
                    p.chapters[safeIdx].content = e.target.value;
                    return p;
                  },
                  false
                );
              }}
              placeholder='กดปุ่ม "แต่งตอนนี้ให้เสร็จด้วย AI" ด้านบน เพื่อให้ AI เขียนเนื้อหานิยายฉบับเต็มตามโครงเรื่องที่วางไว้ หรือเริ่มพิมพ์เนื้อเรื่องเองที่นี่ได้เลย...'
              className="w-full min-h-[460px] rounded-xl border border-stone-200 bg-stone-50/20 px-5 py-4 text-[15px] text-stone-900 leading-[1.95] font-[Sarabun] focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
          </div>
        </section>
      </div>

      <SteeringModal
        open={writeModalOpen}
        title={`แต่งนิยายฉบับเต็ม — ตอนที่ ${currentChapter.chapterNumber}`}
        description="AI จะใช้ข้อมูลปักหมุด, Rolling Summary, ย่อหน้าท้ายของตอนก่อนหน้า, Style Anchor และโครงเรื่องของตอนนี้มาแต่งเป็นนิยายพร้อมอ่าน"
        placeholder="เช่น อยากให้เปิดฉากด้วยเสียงฝนตกในคืนมืด และเน้นบทสนทนาที่เฉือดเฉือน (เว้นว่างได้)"
        confirmLabel="เริ่มแต่งเนื้อเรื่อง"
        onClose={() => setWriteModalOpen(false)}
        onConfirm={handleWriteCurrentChapter}
      />

      <StyleAnchorModal open={styleAnchorOpen} onClose={() => setStyleAnchorOpen(false)} />
    </div>
  );
}

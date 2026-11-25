import { useState } from 'react';
import {
  BookOpenText,
  BookText,
  CheckCircle2,
  Download,
  Feather,
  FileCode2,
  FileText,
  Globe2,
  ListOrdered,
  Loader2,
  ShieldCheck,
  Undo2,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { estimateProjectContextTokens } from '../utils/tokenEstimator';
import {
  exportAsJson,
  exportAsMarkdown,
  exportManuscriptAsMarkdown,
  exportManuscriptAsText,
} from '../utils/exporter';
import { OverviewTab } from './workspace/OverviewTab';
import { WorldBuildingTab } from './workspace/WorldBuildingTab';
import { CharactersTab } from './workspace/CharactersTab';
import { ChaptersTab } from './workspace/ChaptersTab';
import { WriterTab } from './workspace/WriterTab';
import { ContinuityAuditModal } from './ContinuityAuditModal';
import type { WorkspaceTab } from '../types/novel';

export function Workspace() {
  const {
    activeProject,
    activeTab,
    setActiveTab,
    updateActiveProject,
    undoStack,
    undoActiveProject,
    lastSavedAt,
    aiSettings,
    toggleEconomyMode,
    isGenerating,
    generationLabel,
    cancelGeneration,
  } = useAppStore();

  const [exportOpen, setExportOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  if (!activeProject) return null;

  const writtenCount = activeProject.chapters.filter((c) => c.content?.trim()).length;
  const tokenStats = estimateProjectContextTokens(activeProject, aiSettings.economyMode);

  const tabs: { id: WorkspaceTab; label: string; icon: typeof BookText; badge?: number | string }[] = [
    {
      id: 'overview',
      label: 'ภาพรวม & โครงเรื่องหลัก',
      icon: BookText,
      badge: activeProject.macroOutline.plotBeats.length,
    },
    {
      id: 'world',
      label: 'โลกและกฎเกณฑ์',
      icon: Globe2,
      badge: activeProject.macroOutline.worldBuilding.length,
    },
    {
      id: 'characters',
      label: 'ตัวละคร',
      icon: Users,
      badge: activeProject.macroOutline.characters.length,
    },
    {
      id: 'chapters',
      label: 'โครงสร้างรายตอน',
      icon: ListOrdered,
      badge: activeProject.chapters.length,
    },
    {
      id: 'writer',
      label: 'แต่งนิยายเต็มตอน',
      icon: Feather,
      badge: `${writtenCount}/${activeProject.chapters.length}`,
    },
  ];

  const savedTime = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Workspace Top Bar */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {activeProject.metadata.genres.map((g) => (
              <span
                key={g}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700"
              >
                {g}
              </span>
            ))}
            <span className="text-[11px] text-stone-400">
              • {activeProject.metadata.structureTemplate}
            </span>
          </div>
          <input
            type="text"
            value={activeProject.metadata.title}
            onChange={(e) =>
              updateActiveProject(
                (p) => {
                  p.metadata.title = e.target.value;
                  return p;
                },
                false
              )
            }
            className="text-xl sm:text-2xl font-bold text-stone-900 bg-transparent hover:bg-stone-50 focus:bg-white rounded-lg px-1.5 -ml-1.5 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl font-mono font-semibold border ${
              tokenStats.isHighPinned
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-stone-50 border-stone-200 text-stone-600'
            }`}
            title={
              tokenStats.isHighPinned
                ? `ปักหมุดไว้ ${tokenStats.pinnedCount} การ์ด (แนะนำไม่เกิน 10 เพื่อประหยัด Token)`
                : `ประมาณการบริบทพื้นฐานต่อการยิง AI 1 ครั้ง (ปักหมุด ${tokenStats.pinnedCount} การ์ด)`
            }
          >
            ~{tokenStats.tokens.toLocaleString()} tok
            {tokenStats.isHighPinned && ' ⚠️'}
          </span>

          <button
            type="button"
            onClick={toggleEconomyMode}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              aiSettings.economyMode
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
            }`}
            title="สลับโหมดประหยัด Token (Smart Context Pruning + 3 ตอน/ชุด)"
          >
            <Zap className="w-3.5 h-3.5" />
            {aiSettings.economyMode ? 'ประหยัด: เปิด' : 'โหมดประหยัด'}
          </button>

          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-xl font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            บันทึกอัตโนมัติ{savedTime ? ` (${savedTime})` : ''}
          </span>

          <button
            type="button"
            onClick={() => setAuditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100 transition-colors"
            title="ให้ AI บรรณาธิการตรวจพล็อตโฮลทั้งเรื่อง"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            ตรวจพล็อตโฮล
          </button>

          <button
            type="button"
            onClick={undoActiveProject}
            disabled={undoStack.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition-colors"
            title="ย้อนกลับก่อนการเจนหรือการลบครั้งล่าสุด"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Undo ({undoStack.length})
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>

            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-stone-200 py-1.5 z-20">
                  {writtenCount > 0 && (
                    <>
                      <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-600">
                        ต้นฉบับนิยาย ({writtenCount} ตอนที่แต่งแล้ว)
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          exportManuscriptAsMarkdown(activeProject);
                          setExportOpen(false);
                        }}
                        className="w-full px-3.5 py-2 text-left text-xs font-medium text-stone-700 hover:bg-violet-50 hover:text-violet-800 flex items-center gap-2.5"
                      >
                        <BookOpenText className="w-4 h-4 text-violet-600" />
                        <div>
                          <p className="font-semibold">ต้นฉบับนิยาย (.md)</p>
                          <p className="text-[10px] text-stone-400">เฉพาะเนื้อเรื่องพร้อมลงเว็บ</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          exportManuscriptAsText(activeProject);
                          setExportOpen(false);
                        }}
                        className="w-full px-3.5 py-2 text-left text-xs font-medium text-stone-700 hover:bg-violet-50 hover:text-violet-800 flex items-center gap-2.5"
                      >
                        <FileText className="w-4 h-4 text-violet-500" />
                        <div>
                          <p className="font-semibold">ต้นฉบับนิยาย (.txt)</p>
                          <p className="text-[10px] text-stone-400">ก๊อปปี้ลง ReadAWrite / Dek-D</p>
                        </div>
                      </button>
                      <div className="my-1 border-t border-stone-100" />
                    </>
                  )}

                  <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    โครงเรื่องทั้งหมด (Outline & Lore)
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      exportAsMarkdown(activeProject);
                      setExportOpen(false);
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-stone-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5"
                  >
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <div>
                      <p className="font-semibold">โครงเรื่อง Markdown (.md)</p>
                      <p className="text-[10px] text-stone-400">ส่งให้ AI ภายนอกแต่งต่อ / เปิดใน Obsidian</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      exportAsJson(activeProject);
                      setExportOpen(false);
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-stone-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5"
                  >
                    <FileCode2 className="w-4 h-4 text-amber-600" />
                    <div>
                      <p className="font-semibold">JSON Backup (.json)</p>
                      <p className="text-[10px] text-stone-400">สำรองข้อมูล / ย้ายเครื่อง</p>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Inline AI Generation Progress Banner */}
      {isGenerating && (
        <div className="mb-5 rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
            <p className="text-xs sm:text-sm font-medium text-indigo-950 truncate">
              {generationLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={cancelGeneration}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 shrink-0"
          >
            <XCircle className="w-3.5 h-3.5" />
            ยกเลิก
          </button>
        </div>
      )}

      {/* 5 Workspace Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-5 border-b border-stone-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                active
                  ? tab.id === 'writer'
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xs'
                    : 'bg-indigo-600 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                    active ? 'bg-white/20 text-white' : 'bg-stone-200/80 text-stone-600'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tab Content */}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'world' && <WorldBuildingTab />}
      {activeTab === 'characters' && <CharactersTab />}
      {activeTab === 'chapters' && <ChaptersTab />}
      {activeTab === 'writer' && <WriterTab />}

      <ContinuityAuditModal open={auditOpen} onClose={() => setAuditOpen(false)} />
    </main>
  );
}

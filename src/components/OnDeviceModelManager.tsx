import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  FolderOpen,
  HardDrive,
  Link2,
  Loader2,
  Play,
  Smartphone,
  Square,
  Thermometer,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  cancelOnDeviceModelDownload,
  deleteOnDeviceModel,
  downloadOnDeviceModelFromUrl,
  getDeviceHardwareInfo,
  importOnDeviceModelFile,
  isNativeMobileApp,
  loadOnDeviceModel,
  QUICK_MODEL_LINKS,
  scanInstalledOnDeviceModels,
  subscribeDownloadProgress,
  unloadOnDeviceModel,
  type AcceleratorBackend,
  type DeviceHardwareInfo,
  type DownloadProgressEvent,
  type LocalModelStatus,
} from '../services/onDeviceLlm';
import { useAppStore } from '../store/useAppStore';

interface Props {
  selectedModelId: string;
  onSelectModel: (filename: string) => void;
}

export function OnDeviceModelManager({ selectedModelId, onSelectModel }: Props) {
  const addToast = useAppStore((s) => s.addToast);
  const [hwInfo, setHwInfo] = useState<DeviceHardwareInfo | null>(null);
  const [installedModels, setInstalledModels] = useState<LocalModelStatus[]>([]);
  const [activeTransfer, setActiveTransfer] = useState<DownloadProgressEvent | null>(null);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [backendChoice, setBackendChoice] = useState<AcceleratorBackend>('gpu');

  const native = isNativeMobileApp();

  const refreshAll = async () => {
    try {
      const [info, list] = await Promise.all([
        getDeviceHardwareInfo(),
        scanInstalledOnDeviceModels(),
      ]);
      setHwInfo(info);
      setInstalledModels(list);
      // Auto-select first installed model if current selection isn't installed
      if (list.length > 0 && !list.some((m) => m.filename === selectedModelId)) {
        const loaded = list.find((m) => m.loaded);
        onSelectModel(loaded ? loaded.filename : list[0].filename);
      }
    } catch (err) {
      console.error('Failed to scan on-device models:', err);
    }
  };

  useEffect(() => {
    void refreshAll();
    let active = true;
    const handlePromise = subscribeDownloadProgress((evt) => {
      if (!active) return;
      if (evt.status === 'completed' || evt.status === 'error' || evt.status === 'paused') {
        setActiveTransfer(null);
        void refreshAll();
      } else {
        setActiveTransfer(evt);
      }
    });
    return () => {
      active = false;
      void handlePromise.then((h) => h?.remove());
    };
  }, []);

  const handleImportFile = async () => {
    if (!native) {
      addToast({ type: 'warning', title: 'ใช้งานได้เฉพาะบนแอป Android' });
      return;
    }
    try {
      const res = await importOnDeviceModelFile();
      onSelectModel(res.filename);
      addToast({
        type: 'success',
        title: `นำเข้าไฟล์สำเร็จ (${(res.sizeBytes / 1e9).toFixed(2)} GB)`,
        description: res.filename,
      });
      await refreshAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('ยกเลิก')) {
        addToast({ type: 'error', title: 'นำเข้าไฟล์ไม่สำเร็จ', description: msg });
      }
    }
  };

  const handleDownloadUrl = async () => {
    if (!native) {
      addToast({ type: 'warning', title: 'ใช้งานได้เฉพาะบนแอป Android' });
      return;
    }
    if (!urlInput.trim()) {
      addToast({ type: 'warning', title: 'กรุณาวาง URL ไฟล์ .litertlm ก่อนครับ' });
      return;
    }
    try {
      setActiveTransfer({
        modelId: 'downloading',
        bytesDownloaded: 0,
        totalBytes: 0,
        progress: 0,
        status: 'downloading',
      });
      const res = await downloadOnDeviceModelFromUrl(urlInput.trim());
      setUrlInput('');
      onSelectModel(res.filename);
      addToast({
        type: 'success',
        title: 'ดาวน์โหลดโมเดลสำเร็จ!',
        description: `${res.filename} (${(res.sizeBytes / 1e9).toFixed(2)} GB)`,
      });
      await refreshAll();
    } catch (err) {
      setActiveTransfer(null);
      addToast({
        type: 'error',
        title: 'ดาวน์โหลดไม่สำเร็จ',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleCancelTransfer = async () => {
    await cancelOnDeviceModelDownload(activeTransfer?.modelId);
    setActiveTransfer(null);
    addToast({ type: 'info', title: 'หยุดการดาวน์โหลด/นำเข้าแล้ว' });
  };

  const handleLoad = async (filename: string) => {
    setLoadingFile(filename);
    try {
      const res = await loadOnDeviceModel(filename, backendChoice, 4096);
      onSelectModel(filename);
      await refreshAll();
      addToast({
        type: 'success',
        title: `โหลดโมเดลเข้า ${res.backendUsed.toUpperCase()} สำเร็จ`,
        description: `ใช้เวลา ${(res.loadTimeMs / 1000).toFixed(1)} วิ • พร้อมใช้งานออฟไลน์`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'โหลดโมเดลไม่สำเร็จ',
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoadingFile(null);
    }
  };

  const handleUnload = async () => {
    await unloadOnDeviceModel();
    await refreshAll();
    addToast({ type: 'info', title: 'คืนหน่วยความจำ RAM/GPU แล้ว' });
  };

  const handleDelete = async (filename: string) => {
    await deleteOnDeviceModel(filename);
    await refreshAll();
    addToast({ type: 'info', title: `ลบไฟล์ ${filename} ออกจากเครื่องแล้ว` });
  };

  return (
    <div className="space-y-3.5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5">
      {/* Hardware Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-indigo-200/70">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-indigo-950">
              Local AI Model Manager (.litertlm)
            </div>
            <div className="text-[11px] text-indigo-800/80">
              {hwInfo?.isNativeAndroid
                ? `SoC: ${hwInfo.socModel} (${hwInfo.socManufacturer})`
                : 'ใช้งานได้เฉพาะบนแอป Android'}
            </div>
          </div>
        </div>

        {hwInfo?.isNativeAndroid && (
          <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              <Zap className="w-3 h-3" />
              {hwInfo.isSnapdragon8EliteGen5 ? 'SM8850' : hwInfo.socModel}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-stone-700 border border-stone-200">
              <HardDrive className="w-3 h-3" />
              ว่าง {(hwInfo.availableStorageMb / 1024).toFixed(1)} GB
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-stone-700 border border-stone-200">
              <Thermometer className="w-3 h-3" />
              {hwInfo.thermalStatus}
            </span>
          </div>
        )}
      </div>

      {/* Add Model: File Import OR Download from URL */}
      <div className="rounded-xl bg-white border border-stone-200 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-stone-800">เพิ่มโมเดลลงเครื่อง</span>
          <button
            type="button"
            disabled={Boolean(activeTransfer)}
            onClick={() => void handleImportFile()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            นำเข้าไฟล์ .litertlm จากเครื่อง
          </button>
        </div>

        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Link2 className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="หรือวาง URL ไฟล์ .litertlm (รองรับโหลดต่อเมื่อเน็ตหลุด)..."
              className="w-full rounded-lg border border-stone-300 pl-8 pr-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="button"
            disabled={Boolean(activeTransfer) || !urlInput.trim()}
            onClick={() => void handleDownloadUrl()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-40 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            โหลด
          </button>
        </div>

        {/* 1-Tap Helper Links */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[10px] text-stone-400">ลิงก์ด่วน:</span>
          {QUICK_MODEL_LINKS.map((item) => (
            <button
              key={item.url}
              type="button"
              onClick={() => setUrlInput(item.url)}
              className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 hover:bg-indigo-100 hover:text-indigo-800 transition-colors"
            >
              {item.label} ({item.sizeLabel})
            </button>
          ))}
        </div>

        {/* Transfer Progress */}
        {activeTransfer && (
          <div className="pt-2 border-t border-stone-100 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-indigo-700">
              <span>
                {activeTransfer.message || 'กำลังดาวน์โหลด...'} {activeTransfer.progress.toFixed(1)}%
              </span>
              <button
                type="button"
                onClick={() => void handleCancelTransfer()}
                className="inline-flex items-center gap-1 text-rose-600 font-semibold hover:underline"
              >
                <Square className="w-3 h-3" />
                หยุด
              </button>
            </div>
            <div className="w-full h-2 rounded-full bg-indigo-100 overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, activeTransfer.progress))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Backend Selector + Installed Models */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-indigo-950">
            ไฟล์โมเดลในเครื่อง ({installedModels.length})
          </span>
          <div className="inline-flex items-center gap-1 bg-white rounded-lg p-0.5 border border-stone-200 text-[10px] font-semibold">
            {(
              [
                { id: 'npu-qnn', label: 'NPU→GPU' },
                { id: 'gpu', label: 'GPU (แนะนำ)' },
                { id: 'cpu', label: 'CPU' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setBackendChoice(opt.id)}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  backendChoice === opt.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {installedModels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-indigo-200 bg-white/70 p-4 text-center text-xs text-stone-500">
            ยังไม่มีไฟล์โมเดลในเครื่อง — กด <strong>"นำเข้าไฟล์ .litertlm จากเครื่อง"</strong> หรือวาง URL ด้านบนได้เลย
          </div>
        ) : (
          installedModels.map((m) => {
            const isSelected = selectedModelId === m.filename;
            const sizeGb = (m.sizeBytes / 1e9).toFixed(2);
            return (
              <div
                key={m.filename}
                onClick={() => onSelectModel(m.filename)}
                className={`rounded-xl border p-3 bg-white transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-500 ring-1 ring-indigo-500'
                    : 'border-stone-200 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold font-mono text-stone-900 truncate">
                      {m.filename}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-500">
                      <span>{sizeGb} GB</span>
                      {m.loaded && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          โหลดอยู่ ({m.activeBackend?.toUpperCase()})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className="mt-2.5 flex flex-wrap items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!m.loaded ? (
                    <button
                      type="button"
                      disabled={loadingFile === m.filename}
                      onClick={() => void handleLoad(m.filename)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {loadingFile === m.filename ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      โหลดใช้งาน ({backendChoice.toUpperCase()})
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleUnload()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                    >
                      <Cpu className="w-3.5 h-3.5" />
                      คืน RAM (Unload)
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleDelete(m.filename)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-stone-600 hover:text-rose-600 hover:bg-rose-50 ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ลบไฟล์
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

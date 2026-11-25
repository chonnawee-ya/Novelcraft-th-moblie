import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AI_PROVIDER_PRESETS, getPresetById } from '../data/aiProviders';
import { fetchAvailableModels, testAIConnection } from '../services/geminiService';
import { OnDeviceModelManager } from './OnDeviceModelManager';
import type { AISettings } from '../types/novel';

export function ApiKeyModal() {
  const {
    apiModalOpen,
    setApiModalOpen,
    apiKeysMap,
    aiSettings,
    saveAIConfig,
    clearApiKeyForPreset,
    setApiStatus,
    addToast,
  } = useAppStore();

  const [presetId, setPresetId] = useState(aiSettings.presetId);
  const [baseUrl, setBaseUrl] = useState(aiSettings.baseUrl);
  const [model, setModel] = useState(aiSettings.model);
  const [fastModel, setFastModel] = useState(aiSettings.fastModel ?? '');
  const [temperature, setTemperature] = useState(aiSettings.temperature);
  const [economyMode, setEconomyMode] = useState(Boolean(aiSettings.economyMode));
  const [draftKey, setDraftKey] = useState(apiKeysMap[aiSettings.presetId] ?? '');
  const [showKey, setShowKey] = useState(false);

  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const activePreset = getPresetById(presetId);

  useEffect(() => {
    if (apiModalOpen) {
      setPresetId(aiSettings.presetId);
      setBaseUrl(aiSettings.baseUrl);
      setModel(aiSettings.model);
      setFastModel(aiSettings.fastModel ?? '');
      setTemperature(aiSettings.temperature);
      setEconomyMode(Boolean(aiSettings.economyMode));
      setDraftKey(apiKeysMap[aiSettings.presetId] ?? '');
      setFetchedModels([]);
      setTestResult(null);
    }
  }, [apiModalOpen, aiSettings, apiKeysMap]);

  if (!apiModalOpen) return null;

  const handleSelectPreset = (newPresetId: string) => {
    const preset = getPresetById(newPresetId);
    setPresetId(preset.id);
    setBaseUrl(preset.baseUrl);
    setModel(preset.defaultModel);
    setDraftKey(apiKeysMap[preset.id] ?? '');
    setFetchedModels([]);
    setTestResult(null);
  };

  const buildDraftSettings = (): AISettings => ({
    provider: activePreset.provider,
    presetId: activePreset.id,
    baseUrl: baseUrl.trim(),
    model: model.trim(),
    fastModel: activePreset.provider === 'on-device' ? '' : fastModel.trim(),
    temperature,
    useCorsProxy: false,
    economyMode,
  });

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setTestResult(null);
    try {
      const models = await fetchAvailableModels(draftKey, buildDraftSettings());
      setFetchedModels(models);
      if (models.length > 0) {
        if (!models.includes(model.trim())) {
          setModel(models[0]);
        }
        addToast({
          type: 'success',
          title: `ดึงรายชื่อโมเดลสำเร็จ (${models.length} รุ่น)`,
          description: 'สามารถเลือกโมเดลจากรายการด้านล่างได้เลย',
        });
      } else {
        addToast({ type: 'warning', title: 'ไม่พบรายชื่อโมเดลจากผู้ให้บริการนี้' });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'ดึงรายชื่อโมเดลไม่สำเร็จ',
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const settings = buildDraftSettings();
    const res = await testAIConnection(draftKey, settings);
    setTestResult(res);
    setTesting(false);
    if (res.ok) {
      saveAIConfig(settings, draftKey);
      setApiStatus('connected');
    } else {
      setApiStatus('error');
    }
  };

  const handleSave = () => {
    const settings = buildDraftSettings();
    if (!settings.model) {
      setTestResult({ ok: false, message: 'กรุณาระบุชื่อโมเดล (Model ID)' });
      return;
    }
    saveAIConfig(settings, draftKey);
    addToast({
      type: 'success',
      title: 'บันทึกการตั้งค่า AI แล้ว',
      description: `${activePreset.name} • ${settings.model}`,
    });
    setApiModalOpen(false);
  };

  const handleClearKey = () => {
    setDraftKey('');
    clearApiKeyForPreset(presetId);
    setTestResult(null);
    addToast({ type: 'info', title: `ล้าง API Key ของ ${activePreset.name} แล้ว` });
  };

  const modelOptions = Array.from(new Set([...fetchedModels, ...activePreset.suggestedModels]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">ตั้งค่า AI Provider & โมเดล</h2>
              <p className="text-xs text-stone-500">
                เลือกใช้งาน On-Device NPU (Gemma 4 ออฟไลน์) หรือเชื่อมต่อ Cloud API (OpenRouter / Gemini / Custom)
              </p>
            </div>
          </div>
          <button
            onClick={() => setApiModalOpen(false)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[76vh] overflow-y-auto">
          {/* Provider Preset Grid */}
          <div>
            <label className="block text-sm font-bold text-stone-800 mb-2">
              1. เลือกผู้ให้บริการ AI (Provider)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AI_PROVIDER_PRESETS.map((p) => {
                const selected = presetId === p.id;
                const hasSavedKey = Boolean(apiKeysMap[p.id]);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p.id)}
                    className={`text-left p-2.5 rounded-xl border transition-all ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500'
                        : 'border-stone-200 hover:border-stone-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-stone-900 truncate">{p.name}</span>
                      {p.badge && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 shrink-0">
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasSavedKey || !p.requiresApiKey ? 'bg-emerald-500' : 'bg-stone-300'
                        }`}
                      />
                      <span className="text-[10px] text-stone-500 truncate">
                        {!p.requiresApiKey ? 'ไม่ต้องใช้คีย์' : hasSavedKey ? 'บันทึกคีย์ไว้แล้ว' : 'ยังไม่ใส่คีย์'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-stone-500 mt-2">{activePreset.description}</p>
          </div>

          {/* On-Device Model Manager (Gemma 4 E4B NPU) */}
          {activePreset.provider === 'on-device' && (
            <OnDeviceModelManager selectedModelId={model} onSelectModel={setModel} />
          )}

          {/* Base URL (for non-Gemini & non-On-Device) */}
          {activePreset.provider !== 'gemini' && activePreset.provider !== 'on-device' && (
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                API Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* API Key Input (hidden for On-Device NPU) */}
          {activePreset.provider !== 'on-device' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-stone-700 inline-flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                API Key {!activePreset.requiresApiKey && <span className="font-normal text-stone-400">(ไม่บังคับ)</span>}
              </label>
              {activePreset.keyGuideUrl && (
                <a
                  href={activePreset.keyGuideUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
                >
                  {activePreset.keyGuideLabel}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder={activePreset.keyPlaceholder}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
                  title={showKey ? 'ซ่อนคีย์' : 'แสดงคีย์'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {draftKey && (
                  <button
                    type="button"
                    onClick={handleClearKey}
                    className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg"
                    title="ล้างคีย์"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Model ID Input + Fetch Models */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-stone-700">
                2. ชื่อโมเดล (Model ID — พิมพ์เองหรือเลือกจากรายการก็ได้)
              </label>
              {activePreset.provider !== 'anthropic' && (
                <button
                  type="button"
                  onClick={handleFetchModels}
                  disabled={fetchingModels || (activePreset.requiresApiKey && !draftKey.trim())}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                >
                  {fetchingModels ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  ดึงรายชื่อโมเดลที่ใช้ได้จริง
                </button>
              )}
            </div>

            <input
              type="text"
              list="ai-model-options"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="พิมพ์ชื่อโมเดล เช่น google/gemini-2.5-flash, gpt-4o-mini, deepseek-chat"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <datalist id="ai-model-options">
              {modelOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>

            {modelOptions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {modelOptions.slice(0, 12).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className={`text-[11px] font-mono px-2 py-0.5 rounded-lg border transition-colors ${
                      model === m
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-stone-50 text-stone-600 border-stone-200 hover:border-indigo-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dual-Model Routing & Economy Mode */}
          <div className="rounded-xl bg-emerald-50/60 border border-emerald-200/80 p-3.5 space-y-3">
            {activePreset.provider !== 'on-device' && (
              <div>
                <label className="block text-xs font-bold text-emerald-950 mb-1">
                  โมเดลประหยัดสำหรับงานเบา (Fast Model — ไม่บังคับ)
                </label>
                <input
                  type="text"
                  list="ai-model-options"
                  value={fastModel}
                  onChange={(e) => setFastModel(e.target.value)}
                  placeholder="เช่น gpt-4o-mini, gemini-2.5-flash (เว้นว่างเพื่อใช้โมเดลหลัก)"
                  className="w-full rounded-xl border border-emerald-300/80 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-emerald-800/80 mt-1">
                  ใช้กับงานเบา (Auto-Director, Logline, เพิ่ม Lore/ตัวละคร, บีบอัดสรุป) เพื่อประหยัดค่า API 50–70%
                </p>
              </div>
            )}

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={economyMode}
                onChange={(e) => setEconomyMode(e.target.checked)}
                className="mt-0.5 accent-emerald-600 rounded"
              />
              <div className="text-xs">
                <span className="font-bold text-emerald-950 block">เปิดโหมดประหยัด Token (Economy Mode)</span>
                <span className="text-[11px] text-emerald-800/85">
                  บีบอัดบริบทให้กระชับ ส่งเฉพาะตัวละครและจังหวะที่เกี่ยวข้อง และสร้างตอนชุดละ 3 ตอนแทน 5 ตอน
                </span>
              </div>
            </label>
          </div>

          {/* Test Connection */}
          <div>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !model.trim() || (activePreset.requiresApiKey && !draftKey.trim())}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-stone-100 text-stone-800 hover:bg-stone-200 disabled:opacity-50 transition-colors"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              ทดสอบการเชื่อมต่อ (Test Connection)
            </button>

            {testResult && (
              <div
                className={`mt-2.5 flex items-start gap-2 rounded-xl p-3 text-xs border ${
                  testResult.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                )}
                <span className="break-words">{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Temperature Slider */}
          <div className="pt-3 border-t border-stone-100">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-stone-800 inline-flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                ระดับความสร้างสรรค์ (Temperature)
              </label>
              <span className="text-xs font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                {temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={0.2}
              max={1.2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-[11px] text-stone-500 mt-0.5">
              <span>0.2 รัดกุม/สืบสวน</span>
              <span>0.7 สมดุล (แนะนำ)</span>
              <span>1.2 แหวกแนว/แฟนตาซี</span>
            </div>
          </div>

          {/* Privacy Warning */}
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200/80 p-3 text-xs text-amber-900">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <p className="leading-relaxed">
              <strong>ความเป็นส่วนตัว:</strong> API Key ของทุกผู้ให้บริการเก็บไว้ในเบราว์เซอร์ของคุณเท่านั้น (LocalStorage) และส่งตรงไปยังผู้ให้บริการ AI ที่คุณเลือกโดยไม่ผ่านเซิร์ฟเวอร์ตัวกลาง
            </p>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-stone-50 border-t border-stone-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setApiModalOpen(false)}
            className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-200/70 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors"
          >
            บันทึกการตั้งค่า
          </button>
        </div>
      </div>
    </div>
  );
}

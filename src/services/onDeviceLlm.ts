import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type AcceleratorBackend = 'npu-qnn' | 'gpu' | 'cpu';

export interface QuickModelLink {
  label: string;
  sizeLabel: string;
  url: string;
}

export interface DeviceHardwareInfo {
  isNativeAndroid: boolean;
  socModel: string;
  socManufacturer: string;
  isSnapdragon8EliteGen5: boolean;
  supportsQnnNpu: boolean;
  totalRamMb: number;
  availableStorageMb: number;
  thermalStatus: 'none' | 'light' | 'moderate' | 'severe' | 'critical' | 'unknown';
  recommendedBackend: AcceleratorBackend;
}

export interface LocalModelStatus {
  modelId: string;
  filename: string;
  installed: boolean;
  sizeBytes: number;
  loaded: boolean;
  activeBackend?: AcceleratorBackend;
}

export interface DownloadProgressEvent {
  modelId: string;
  bytesDownloaded: number;
  totalBytes: number;
  progress: number; // 0..100
  status: 'downloading' | 'paused' | 'completed' | 'error';
  message?: string;
}

export interface TokenStreamEvent {
  requestId: string;
  token: string;
  done: boolean;
}

export interface OnDeviceGenerateOptions {
  modelId: string;
  systemInstruction: string;
  prompt: string;
  cacheablePrefix?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  preferredBackend?: AcceleratorBackend;
}

export interface OnDeviceGenerateResult {
  text: string;
  backendUsed: AcceleratorBackend;
  tokensGenerated: number;
  tokensPerSec: number;
  ttftMs: number;
  prefixCacheHit: boolean;
}

export interface OnDeviceLLMPlugin {
  getDeviceInfo(): Promise<DeviceHardwareInfo>;
  scanModels(): Promise<{ models: LocalModelStatus[] }>;
  importModelFile(): Promise<{ ok: boolean; filename: string; sizeBytes: number }>;
  downloadModel(options: {
    url: string;
    filename?: string;
  }): Promise<{ ok: boolean; filename: string; path: string; sizeBytes: number }>;
  cancelDownload(options: { modelId?: string }): Promise<{ ok: boolean }>;
  deleteModel(options: { filename: string }): Promise<{ ok: boolean }>;
  loadModel(options: {
    filename: string;
    preferredBackend?: AcceleratorBackend;
    maxContextLength?: number;
  }): Promise<{ ok: boolean; backendUsed: AcceleratorBackend; loadTimeMs: number }>;
  unloadModel(): Promise<{ ok: boolean }>;
  generate(options: OnDeviceGenerateOptions): Promise<OnDeviceGenerateResult>;
  abortGeneration(): Promise<{ ok: boolean }>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (event: DownloadProgressEvent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'tokenStream',
    listenerFunc: (event: TokenStreamEvent) => void
  ): Promise<PluginListenerHandle>;
}

/**
 * Optional 1-tap helper links so users don't have to type long Hugging Face URLs by hand.
 * Users can paste ANY .litertlm / .task URL or import directly from phone storage.
 */
export const QUICK_MODEL_LINKS: QuickModelLink[] = [
  {
    label: 'Gemma 4 E2B (NPU / เบาและเร็วกว่า)',
    sizeLabel: '2.44 GB',
    url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it_NPU_Uncompiled.litertlm',
  },
  {
    label: 'Gemma 4 E2B (Android GPU)',
    sizeLabel: '2.18 GB',
    url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-gpu.litertlm',
  },
  {
    label: 'Gemma 4 E4B (Android GPU)',
    sizeLabel: '3.08 GB',
    url: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-gpu.litertlm',
  },
];

const OnDeviceLLMNative = registerPlugin<OnDeviceLLMPlugin>('OnDeviceLLM');

export function isNativeMobileApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function getDeviceHardwareInfo(): Promise<DeviceHardwareInfo> {
  if (!isNativeMobileApp()) {
    return {
      isNativeAndroid: false,
      socModel: 'Web Browser',
      socManufacturer: 'Browser',
      isSnapdragon8EliteGen5: false,
      supportsQnnNpu: false,
      totalRamMb: 0,
      availableStorageMb: 0,
      thermalStatus: 'unknown',
      recommendedBackend: 'cpu',
    };
  }
  return OnDeviceLLMNative.getDeviceInfo();
}

export async function scanInstalledOnDeviceModels(): Promise<LocalModelStatus[]> {
  if (!isNativeMobileApp()) return [];
  const res = await OnDeviceLLMNative.scanModels();
  return res.models ?? [];
}

export async function importOnDeviceModelFile(): Promise<{
  ok: boolean;
  filename: string;
  sizeBytes: number;
}> {
  if (!isNativeMobileApp()) {
    throw new Error('ฟีเจอร์นำเข้าไฟล์ .litertlm ใช้งานได้เฉพาะบนแอป Android เท่านั้น');
  }
  return OnDeviceLLMNative.importModelFile();
}

export async function downloadOnDeviceModelFromUrl(
  url: string,
  filename?: string
): Promise<{ ok: boolean; filename: string; path: string; sizeBytes: number }> {
  if (!isNativeMobileApp()) {
    throw new Error('ฟีเจอร์ดาวน์โหลดโมเดลใช้งานได้เฉพาะบนแอป Android เท่านั้น');
  }
  return OnDeviceLLMNative.downloadModel({ url: url.trim(), filename: filename?.trim() || undefined });
}

export async function cancelOnDeviceModelDownload(modelId?: string): Promise<void> {
  if (!isNativeMobileApp()) return;
  await OnDeviceLLMNative.cancelDownload({ modelId });
}

export async function deleteOnDeviceModel(filename: string): Promise<void> {
  if (!isNativeMobileApp()) return;
  await OnDeviceLLMNative.deleteModel({ filename });
}

export async function loadOnDeviceModel(
  filename: string,
  preferredBackend: AcceleratorBackend = 'gpu',
  maxContextLength = 4096
): Promise<{ ok: boolean; backendUsed: AcceleratorBackend; loadTimeMs: number }> {
  if (!isNativeMobileApp()) {
    throw new Error('ไม่สามารถโหลดโมเดลบนเบราว์เซอร์ได้ กรุณาใช้งานผ่านแอป Android');
  }
  return OnDeviceLLMNative.loadModel({
    filename,
    preferredBackend,
    maxContextLength,
  });
}

export async function unloadOnDeviceModel(): Promise<void> {
  if (!isNativeMobileApp()) return;
  await OnDeviceLLMNative.unloadModel();
}

export async function generateWithOnDeviceLLM(
  options: OnDeviceGenerateOptions,
  signal?: AbortSignal
): Promise<OnDeviceGenerateResult> {
  if (!isNativeMobileApp()) {
    throw new Error(
      'โหมด On-Device AI ใช้งานได้เฉพาะบนแอป Android — หากใช้งานบนเว็บ กรุณาเลือก OpenRouter หรือ Google Gemini แทนครับ'
    );
  }

  const onAbort = () => {
    void OnDeviceLLMNative.abortGeneration();
  };
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    return await OnDeviceLLMNative.generate(options);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function subscribeDownloadProgress(
  callback: (event: DownloadProgressEvent) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeMobileApp()) return null;
  return OnDeviceLLMNative.addListener('downloadProgress', callback);
}

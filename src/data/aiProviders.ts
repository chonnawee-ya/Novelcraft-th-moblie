import type { AIProviderType } from '../types/novel';

export interface AIProviderPreset {
  id: string;
  name: string;
  badge?: string;
  provider: AIProviderType;
  baseUrl: string;
  defaultModel: string;
  suggestedModels: string[];
  requiresApiKey: boolean;
  keyPlaceholder: string;
  keyGuideUrl?: string;
  keyGuideLabel?: string;
  description: string;
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: 'on-device-npu',
    name: 'Local AI (.litertlm ออฟไลน์)',
    badge: 'ออฟไลน์',
    provider: 'on-device',
    baseUrl: 'local://litert-lm',
    defaultModel: '',
    suggestedModels: [],
    requiresApiKey: false,
    keyPlaceholder: '(รันออฟไลน์บนเครื่อง ไม่ต้องใช้ API Key)',
    description:
      'นำเข้าไฟล์ .litertlm จากเครื่องมือถือ หรือดาวน์โหลดจาก URL ใดก็ได้ เพื่อรันออฟไลน์ผ่าน LiteRT-LM (NPU / GPU / CPU)',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (รวมทุกค่าย)',
    badge: 'API แนะนำ',
    provider: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.5-flash-preview',
    suggestedModels: [
      'google/gemini-2.5-flash-preview',
      'anthropic/claude-3.7-sonnet',
      'openai/gpt-4o-mini',
      'deepseek/deepseek-chat-v3-0324',
    ],
    requiresApiKey: true,
    keyPlaceholder: 'sk-or-v1-...',
    keyGuideUrl: 'https://openrouter.ai/keys',
    keyGuideLabel: 'ขอคีย์ที่ OpenRouter',
    description: 'ใช้คีย์เดียวสลับได้ทั้ง Gemini, Claude, GPT, DeepSeek เชื่อมต่อตรงจากมือถือผ่าน Native HTTP',
  },
  {
    id: 'gemini',
    name: 'Google Gemini API',
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.5-flash',
    suggestedModels: [
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ],
    requiresApiKey: true,
    keyPlaceholder: 'AIzaSy...',
    keyGuideUrl: 'https://aistudio.google.com/apikey',
    keyGuideLabel: 'ขอคีย์ที่ Google AI Studio',
    description: 'เชื่อมต่อตรงกับ Google Gemini API กด "ดึงรายชื่อโมเดล" เพื่อดูรุ่นล่าสุดที่ใช้ได้กับคีย์ของคุณ',
  },
  {
    id: 'custom',
    name: 'Custom OpenAI API',
    provider: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    defaultModel: '',
    suggestedModels: [],
    requiresApiKey: true,
    keyPlaceholder: 'กรอก API Key (ถ้ามี)',
    description: 'เชื่อมต่อกับผู้ให้บริการใดก็ได้ที่รองรับมาตรฐาน OpenAI Chat Completions (เช่น DeepSeek, Typhoon, Groq, LAN)',
  },
];

export function getPresetById(id: string): AIProviderPreset {
  return AI_PROVIDER_PRESETS.find((p) => p.id === id) ?? AI_PROVIDER_PRESETS[0];
}

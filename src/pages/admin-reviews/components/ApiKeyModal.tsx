import { useState } from 'react';
import type { AIProvider } from '@/services/reviewService';
import {
  saveApiKey, getApiKey, clearApiKey,
  saveGeminiKey, getGeminiKey, clearGeminiKey,
  saveProvider, getProvider,
} from '@/services/reviewService';

interface ApiKeyModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function ApiKeyModal({ onClose, onSaved }: ApiKeyModalProps) {
  const [openaiKey, setOpenaiKey] = useState(getApiKey());
  const [geminiKey, setGeminiKey] = useState(getGeminiKey());
  const [provider, setProvider] = useState<AIProvider>(getProvider());
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGemini, setShowGemini] = useState(false);

  const handleSave = () => {
    if (provider === 'openai' && !openaiKey.trim()) return;
    if (provider === 'gemini' && !geminiKey.trim()) return;

    if (openaiKey.trim()) saveApiKey(openaiKey.trim());
    else clearApiKey();

    if (geminiKey.trim()) saveGeminiKey(geminiKey.trim());
    else clearGeminiKey();

    saveProvider(provider);
    onSaved();
    onClose();
  };

  const canSave = (provider === 'openai' && openaiKey.trim()) || (provider === 'gemini' && geminiKey.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[#13151f] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-500/15">
              <i className="ri-key-2-line text-emerald-400 text-lg" />
            </div>
            <h3 className="text-white font-bold text-base">Cài đặt AI Provider</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <i className="ri-close-line" />
          </button>
        </div>

        {/* Provider selector */}
        <p className="text-white/50 text-xs mb-2 uppercase tracking-wider font-medium">Chọn AI Provider</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {/* OpenAI */}
          <button
            onClick={() => setProvider('openai')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer text-left ${
              provider === 'openai'
                ? 'bg-emerald-500/10 border-emerald-500/40'
                : 'bg-[#1a1d2e] border-white/10 hover:border-white/20'
            }`}
          >
            <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${provider === 'openai' ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
              <i className={`ri-openai-line text-base ${provider === 'openai' ? 'text-emerald-400' : 'text-white/40'}`} />
            </div>
            <div>
              <p className={`text-sm font-semibold ${provider === 'openai' ? 'text-emerald-400' : 'text-white/60'}`}>OpenAI</p>
              <p className="text-white/25 text-xs">GPT-4o mini</p>
            </div>
            {provider === 'openai' && (
              <i className="ri-checkbox-circle-fill text-emerald-400 ml-auto text-base" />
            )}
          </button>

          {/* Gemini */}
          <button
            onClick={() => setProvider('gemini')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer text-left ${
              provider === 'gemini'
                ? 'bg-violet-500/10 border-violet-500/40'
                : 'bg-[#1a1d2e] border-white/10 hover:border-white/20'
            }`}
          >
            <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${provider === 'gemini' ? 'bg-violet-500/20' : 'bg-white/5'}`}>
              <i className={`ri-gemini-line text-base ${provider === 'gemini' ? 'text-violet-400' : 'text-white/40'}`} />
            </div>
            <div>
              <p className={`text-sm font-semibold ${provider === 'gemini' ? 'text-violet-400' : 'text-white/60'}`}>Gemini</p>
              <p className="text-white/25 text-xs">Gemini 2.5 Flash-Lite (free)</p>
            </div>
            {provider === 'gemini' && (
              <i className="ri-checkbox-circle-fill text-violet-400 ml-auto text-base" />
            )}
          </button>
        </div>

        {/* OpenAI Key */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-white/50 text-xs font-medium">OpenAI API Key</label>
            {getApiKey() && (
              <button onClick={() => { clearApiKey(); setOpenaiKey(''); }} className="text-red-400/60 hover:text-red-400 text-xs cursor-pointer transition-colors">
                Xóa key
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type={showOpenai ? 'text' : 'password'}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
              className={`w-full bg-[#1a1d2e] border rounded-xl px-4 py-2.5 text-white text-sm pr-12 focus:outline-none placeholder-white/20 transition-colors ${
                provider === 'openai' ? 'border-emerald-500/30 focus:border-emerald-500/60' : 'border-white/10 focus:border-white/25'
              }`}
            />
            <button
              onClick={() => setShowOpenai((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-white/30 hover:text-white/70 cursor-pointer"
            >
              <i className={showOpenai ? 'ri-eye-off-line' : 'ri-eye-line'} />
            </button>
          </div>
          <p className="text-white/20 text-xs mt-1">
            Lấy tại{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="nofollow noreferrer" className="text-emerald-400/60 hover:text-emerald-400">
              platform.openai.com
            </a>
          </p>
        </div>

        {/* Gemini Key */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-white/50 text-xs font-medium">Gemini API Key</label>
            {getGeminiKey() && (
              <button onClick={() => { clearGeminiKey(); setGeminiKey(''); }} className="text-red-400/60 hover:text-red-400 text-xs cursor-pointer transition-colors">
                Xóa key
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type={showGemini ? 'text' : 'password'}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza..."
              className={`w-full bg-[#1a1d2e] border rounded-xl px-4 py-2.5 text-white text-sm pr-12 focus:outline-none placeholder-white/20 transition-colors ${
                provider === 'gemini' ? 'border-violet-500/30 focus:border-violet-500/60' : 'border-white/10 focus:border-white/25'
              }`}
            />
            <button
              onClick={() => setShowGemini((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-white/30 hover:text-white/70 cursor-pointer"
            >
              <i className={showGemini ? 'ri-eye-off-line' : 'ri-eye-line'} />
            </button>
          </div>
          <p className="text-white/20 text-xs mt-1">
            Lấy tại{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="nofollow noreferrer" className="text-violet-400/60 hover:text-violet-400">
              aistudio.google.com
            </a>
            {' '}— miễn phí!
          </p>
        </div>

        {/* Info */}
        <div className="flex items-start gap-2 bg-white/[0.04] border border-white/8 rounded-xl px-3 py-2.5 mb-4">
          <i className="ri-shield-check-line text-white/30 text-sm mt-0.5 flex-shrink-0" />
          <p className="text-white/30 text-xs leading-relaxed">
            API key chỉ lưu trong phiên làm việc (sessionStorage), không lưu vĩnh viễn và không gửi đi đâu ngoài API tương ứng.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all cursor-pointer"
        >
          Lưu & Sử dụng {provider === 'gemini' ? 'Gemini' : 'OpenAI'}
        </button>
      </div>
    </div>
  );
}

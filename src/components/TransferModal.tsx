import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Smartphone, MonitorSmartphone, Check } from 'lucide-react';
import type { TransferState } from '../hooks/useTransfer';

interface TransferModalProps {
  isDarkMode: boolean;
  state: TransferState;
  /** Skip the send/receive picker and open directly in receive mode (e.g. via ?join= link). */
  startInReceive?: boolean;
  /** Pre-filled code for receive mode (may be incomplete while the user types). */
  initialCode?: string;
  onStartSending: () => void | Promise<void>;
  onStartReceiving: (code: string) => void | Promise<void>;
  onCancelConnect: () => void;
  onConfirmReceive: () => void;
  onClose: () => void;
}

export default function TransferModal({
  isDarkMode,
  state,
  startInReceive = false,
  initialCode = '',
  onStartSending,
  onStartReceiving,
  onCancelConnect,
  onConfirmReceive,
  onClose,
}: TransferModalProps) {
  const [mode, setMode] = useState<'idle' | 'send' | 'receive'>(startInReceive ? 'receive' : 'idle');
  const [codeInput, setCodeInput] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Note: the modal unmounts when closed, so `initialCode` reliably seeds the
  // receive form (e.g. when opened via a ?join= link) without needing an effect.

  // Focus the code input when switching to receive mode
  useEffect(() => {
    if (mode === 'receive') inputRef.current?.focus();
  }, [mode]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(state.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const sendUrl = state.code
    ? `${window.location.origin}${window.location.pathname}?join=${state.code}`
    : '';

  const cardBg = isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';
  const secondaryButton = `flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
    isDarkMode
      ? 'border-slate-700 text-slate-300 hover:bg-slate-800 active:bg-slate-700'
      : 'border-slate-200 text-slate-600 hover:bg-slate-100 active:bg-slate-200'
  }`;
  const primaryButton = `flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isDarkMode
      ? 'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700'
      : 'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700'
  }`;
  const statusText = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Transfer notes"
        className={`w-full max-w-sm rounded-xl border shadow-2xl p-5 ${cardBg}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <MonitorSmartphone size={17} />
            Transfer notes
          </h2>
          <button type="button" onClick={onClose} className={`p-1 rounded-md ${isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
            <X size={16} />
          </button>
        </div>

        {mode === 'idle' && (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                setMode('send');
                onStartSending();
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors ${
                isDarkMode
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-emerald-700 active:bg-slate-700'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-emerald-300 active:bg-slate-100'
              }`}
            >
              <Smartphone size={17} className="text-emerald-500" />
              <span className="text-left">
                Send this device's notes
                <span className={`block text-xs ${statusText}`}>Show a code, connect on the other device</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode('receive')}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors ${
                isDarkMode
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-emerald-700 active:bg-slate-700'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-emerald-300 active:bg-slate-100'
              }`}
            >
              <MonitorSmartphone size={17} className="text-emerald-500" />
              <span className="text-left">
                Receive notes here
                <span className={`block text-xs ${statusText}`}>Type the code shown on the other device</span>
              </span>
            </button>
          </div>
        )}

        {mode === 'send' && (
          <div className="flex flex-col items-center gap-3">
            <div className={`w-full text-center text-sm ${statusText}`}>
              On the other device, open NoteCal and choose "Receive notes here", then enter this code:
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className={`font-mono text-2xl font-bold tracking-[0.25em] py-1.5 px-4 rounded-lg border transition-colors ${
                isDarkMode ? 'bg-slate-800/60 border-slate-700 text-emerald-400 hover:border-emerald-600' : 'bg-slate-50 border-slate-200 text-emerald-600 hover:border-emerald-400'
              }`}
              data-tooltip-id="header-tooltip"
              data-tooltip-content="Copy code"
            >
              {copied ? <Check size={28} className="tracking-normal" /> : state.code}
            </button>
            {sendUrl && (
              <div className="rounded-xl bg-white p-2 shadow-sm border border-slate-200">
                <QRCodeSVG value={sendUrl} size={140} />
              </div>
            )}
            <div className={`text-sm text-center ${state.status === 'sent' ? 'text-emerald-500' : statusText}`}>
              {state.status === 'sent' ? '✓ Notes transferred' : state.status === 'error' ? state.error : !state.code ? 'Preparing code...' : 'Waiting for the other device to connect…'}
            </div>
            {state.status === 'sent' ? (
              <button type="button" onClick={onClose} className={primaryButton}>
                Done
              </button>
            ) : state.status === 'error' ? (
              <div className="flex gap-2 w-full">
                <button type="button" onClick={onClose} className={secondaryButton}>
                  Cancel
                </button>
                <button type="button" onClick={onStartSending} className={primaryButton}>
                  Generate new code
                </button>
              </div>
            ) : (
              <button type="button" onClick={onClose} className={secondaryButton}>
                Cancel
              </button>
            )}
          </div>
        )}

        {mode === 'receive' && (
          <div className="flex flex-col gap-3">
            {state.status !== 'received' && (
              <>
                <div className={`w-full text-sm ${statusText}`}>
                  Enter the code shown on the other device:
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={8}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^2-9A-HJ-KMNP-Z]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onStartReceiving(codeInput);
                  }}
                  placeholder="8-character code"
                  className={`w-full font-mono text-xl font-bold tracking-[0.3em] text-center uppercase py-2 px-3 rounded-lg border outline-none transition-colors ${
                    isDarkMode
                      ? 'bg-slate-800/60 border-slate-700 text-emerald-400 focus:border-emerald-600'
                      : 'bg-slate-50 border-slate-200 text-emerald-600 focus:border-emerald-400'
                  }`}
                />
                {state.status === 'error' && <div className="text-sm text-red-500">{state.error}</div>}
                {(state.status === 'idle' || state.status === 'error') && (
                  <button type="button" onClick={() => onStartReceiving(codeInput)} className={primaryButton} disabled={!codeInput.trim()}>
                    Connect
                  </button>
                )}
                {(state.status === 'connecting' || state.status === 'waiting') && (
                  <>
                    <div className={`text-sm text-center ${statusText}`}>Connecting… keep both devices on this screen</div>
                    <button type="button" onClick={onCancelConnect} className={secondaryButton}>
                      Change code
                    </button>
                  </>
                )}
              </>
            )}
            {state.status === 'received' && state.receivedPreview && (
              <>
                <div className="text-sm text-emerald-500">✓ Received notebook</div>
                <div className={`rounded-lg border px-3 py-2 text-sm max-h-40 overflow-y-auto ${
                  isDarkMode ? 'border-slate-700 bg-slate-800/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}>
                  {state.receivedPreview.titles.map((title, i) => (
                    <div key={i} className="truncate">• {title}</div>
                  ))}
                </div>
                <div className={`text-xs ${statusText}`}>This will replace your current notes on this device.</div>
                <div className="flex gap-2">
                  <button type="button" onClick={onClose} className={secondaryButton}>
                    Discard
                  </button>
                  <button type="button" onClick={onConfirmReceive} className={primaryButton}>
                    Replace my notes
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

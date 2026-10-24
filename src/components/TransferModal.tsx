import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Smartphone, MonitorSmartphone, Check, ScanQrCode, Link2 } from 'lucide-react';
import type { TransferState } from '../hooks/useTransfer';

interface TransferModalProps {
  isDarkMode: boolean;
  state: TransferState;
  /** Skip the send/receive picker and open directly in receive mode (e.g. via ?join= link). */
  startInReceive?: boolean;
  /** Skip the picker and open the "send these notes?" confirmation (e.g. via ?send= link). */
  startInSend?: boolean;
  /** Pre-filled code for receive mode (may be incomplete while the user types). */
  initialCode?: string;
  onStartSending: () => void | Promise<void>;
  onStartReceiving: (code: string) => void | Promise<void>;
  /** Open a fresh room and show a QR for the sending device to scan. */
  onStartReceivingWithQr: () => void | Promise<void>;
  /** Confirmed a ?send= link: join the receiving device's room and push. */
  onConfirmSend: () => void | Promise<void>;
  onCancelConnect: () => void;
  onConfirmReceive: () => void;
  onClose: () => void;
}

const CODE_CHARS = '2-9A-HJ-KMNP-Z';
// Non-consuming terminator so a link with trailing whitespace still matches.
const CODE_LINK_PATTERN = new RegExp(`[?&](?:join|send)=([${CODE_CHARS}]{8})(?=\\s|$|[&#])`, 'i');
const CODE_INPUT_PATTERN = new RegExp(`[^${CODE_CHARS}]`, 'g');

/**
 * Accept either a typed code or a whole transfer link (?join= / ?send=), since
 * people paste links far more often than they retype eight characters.
 */
const sanitizeCodeInput = (value: string) => {
  const fromLink = value.trim().match(CODE_LINK_PATTERN);
  if (fromLink) return fromLink[1].toUpperCase();
  // Never grind a pasted URL down into a plausible-looking fake code.
  if (value.includes('://')) return '';
  return value.toUpperCase().replace(CODE_INPUT_PATTERN, '').slice(0, 8);
};

export default function TransferModal({
  isDarkMode,
  state,
  startInReceive = false,
  startInSend = false,
  initialCode = '',
  onStartSending,
  onStartReceiving,
  onStartReceivingWithQr,
  onConfirmSend,
  onCancelConnect,
  onConfirmReceive,
  onClose,
}: TransferModalProps) {
  const [mode, setMode] = useState<'idle' | 'send' | 'receive'>(
    startInSend ? 'send' : startInReceive ? 'receive' : 'idle',
  );
  const [codeInput, setCodeInput] = useState(initialCode);
  const [sendViaLink, setSendViaLink] = useState(startInSend);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
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

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  // Sender's QR: scanning it makes the other device join as the receiver.
  const sendUrl = state.code ? `${baseUrl}?join=${state.code}` : '';
  // Receiver's QR: scanning it makes the other device join as the sender.
  const receiveUrl = state.code ? `${baseUrl}?send=${state.code}` : '';

  const handleCopyLink = () => {
    if (!sendUrl) return;
    navigator.clipboard.writeText(sendUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    }).catch(() => {});
  };

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
  const codeChip = `font-mono text-2xl font-bold tracking-[0.25em] py-1.5 px-4 rounded-lg border transition-colors ${
    isDarkMode
      ? 'bg-slate-800/60 border-slate-700 text-emerald-400 hover:border-emerald-600'
      : 'bg-slate-50 border-slate-200 text-emerald-600 hover:border-emerald-400'
  }`;
  const previewBox = `rounded-lg border px-3 py-2 text-sm max-h-40 overflow-y-auto ${
    isDarkMode ? 'border-slate-700 bg-slate-800/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'
  }`;
  const divider = `flex items-center gap-2 text-xs ${statusText}`;
  const dividerLine = `h-px flex-1 ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`;

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
                <span className={`block text-xs ${statusText}`}>Enter a code, or show a QR to scan</span>
              </span>
            </button>
          </div>
        )}

        {mode === 'send' && state.status === 'ready-to-send' && state.sendPreview && (
          <div className="flex flex-col gap-3">
            <div className={`w-full text-sm ${statusText}`}>Send this device's notes to the other device?</div>
            <div className={previewBox}>
              {state.sendPreview.titles.map((title, i) => (
                <div key={i} className="truncate">• {title}</div>
              ))}
            </div>
            {state.sendPreview.looksEmpty && (
              <div className="text-sm text-amber-500">
                This browser has no notes saved. Open NoteCal the way you normally do, then scan the QR from there.
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={secondaryButton}>
                Cancel
              </button>
              <button type="button" onClick={onConfirmSend} className={primaryButton}>
                Send {state.sendPreview.titles.length} {state.sendPreview.titles.length === 1 ? 'note' : 'notes'}
              </button>
            </div>
          </div>
        )}

        {mode === 'send' && state.status !== 'ready-to-send' && (
          <div className="flex flex-col items-center gap-3">
            {state.status === 'connecting' ? (
              <div className={`w-full text-center text-sm ${statusText}`}>Connecting to the other device…</div>
            ) : state.code && !sendViaLink ? (
              <>
                <div className={`w-full text-center text-sm ${statusText}`}>
                  On the other device, open NoteCal and choose "Receive notes here", then enter this code:
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className={codeChip}
                  aria-label={`Copy transfer code ${state.code}`}
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
                {sendUrl && (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className={`flex items-center gap-1.5 text-xs transition-colors ${
                      isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {copiedLink ? <Check size={13} /> : <Link2 size={13} />}
                    {copiedLink ? 'Link copied' : 'Copy link instead'}
                  </button>
                )}
              </>
            ) : null}
            {state.status !== 'connecting' && (
              <div className={`text-sm text-center ${state.status === 'sent' ? 'text-emerald-500' : statusText}`} role="status">
                {state.status === 'sent' ? '✓ Notes transferred' : state.status === 'error' ? state.error : !state.code ? 'Preparing code...' : 'Waiting for the other device to connect…'}
              </div>
            )}
            {state.status === 'sent' ? (
              <button type="button" onClick={onClose} className={primaryButton}>
                Done
              </button>
            ) : state.status === 'error' ? (
              <div className="flex gap-2 w-full">
                <button type="button" onClick={onClose} className={secondaryButton}>
                  Cancel
                </button>
                {sendViaLink && state.code ? (
                  <button type="button" onClick={onConfirmSend} className={primaryButton}>
                    Try again
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSendViaLink(false);
                      onStartSending();
                    }}
                    className={primaryButton}
                  >
                    Generate new code
                  </button>
                )}
              </div>
            ) : (
              <button type="button" onClick={onClose} className={secondaryButton}>
                Cancel
              </button>
            )}
          </div>
        )}

        {mode === 'receive' && state.status === 'pairing' && (
          <div className="flex flex-col items-center gap-3">
            <div className={`w-full text-center text-sm ${statusText}`}>
              Scan this with the sending device's camera:
            </div>
            {receiveUrl && (
              <div className="rounded-xl bg-white p-2 shadow-sm border border-slate-200">
                <QRCodeSVG value={receiveUrl} size={180} />
              </div>
            )}
            <button
              type="button"
              onClick={handleCopyCode}
              className={`${codeChip} text-lg`}
              aria-label={`Copy transfer code ${state.code}`}
              data-tooltip-id="header-tooltip"
              data-tooltip-content="Copy code"
            >
              {copied ? <Check size={22} className="tracking-normal" /> : state.code}
            </button>
            <div className={`text-sm text-center ${statusText}`} role="status">Waiting for the other device to scan…</div>
            <button type="button" onClick={onCancelConnect} className={secondaryButton}>
              Cancel
            </button>
          </div>
        )}

        {mode === 'receive' && state.status !== 'pairing' && state.status !== 'received' && (
          <div className="flex flex-col gap-3">
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
              value={codeInput}
              onChange={(e) => setCodeInput(sanitizeCodeInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && codeInput.length === 8) onStartReceiving(codeInput);
              }}
              placeholder="8-character code"
              className={`w-full font-mono text-xl font-bold tracking-[0.3em] text-center uppercase py-2 px-3 rounded-lg border outline-none transition-colors ${
                isDarkMode
                  ? 'bg-slate-800/60 border-slate-700 text-emerald-400 focus:border-emerald-600'
                  : 'bg-slate-50 border-slate-200 text-emerald-600 focus:border-emerald-400'
              }`}
            />
            {state.status === 'error' && <div role="alert" className="text-sm text-red-500">{state.error}</div>}
            {(state.status === 'idle' || state.status === 'error') && (
              <button type="button" onClick={() => onStartReceiving(codeInput)} className={primaryButton} disabled={codeInput.length !== 8}>
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
            {(state.status === 'idle' || state.status === 'error') && (
              <>
                <div className={divider}>
                  <div className={dividerLine} />
                  or
                  <div className={dividerLine} />
                </div>
                <button
                  type="button"
                  onClick={onStartReceivingWithQr}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    isDarkMode
                      ? 'border-slate-700 text-slate-300 hover:bg-slate-800 active:bg-slate-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-100 active:bg-slate-200'
                  }`}
                >
                  <ScanQrCode size={16} />
                  Show a QR for the other device to scan
                </button>
              </>
            )}
          </div>
        )}

        {mode === 'receive' && state.status === 'received' && state.receivedPreview && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-emerald-500" role="status">✓ Received notebook</div>
            <div className={previewBox}>
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
          </div>
        )}
      </div>
    </div>
  );
}

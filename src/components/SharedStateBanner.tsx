import { Link } from 'lucide-react';

interface SharedStateBannerProps {
  isDarkMode: boolean;
  onGoBack: () => void;
}

export default function SharedStateBanner({ isDarkMode, onGoBack }: SharedStateBannerProps) {
  return (
    <div className={`flex items-center justify-between px-5 sm:px-6 py-2 border-b text-sm transition-colors ${
      isDarkMode
        ? 'bg-slate-900 border-slate-800 text-slate-400'
        : 'bg-white border-slate-200 text-slate-500'
    }`}>
      <div className="flex items-center gap-2">
        <Link size={14} className="text-emerald-500" />
        <span>Viewing a shared notebook</span>
      </div>
      <button
        onClick={onGoBack}
        className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${
          isDarkMode
            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
        }`}
      >
        Go back
      </button>
    </div>
  );
}

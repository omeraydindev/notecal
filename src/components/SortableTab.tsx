import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import type { NoteTab } from '../types';

export interface SortableTabProps {
  tab: NoteTab;
  index: number;
  isActive: boolean;
  isDarkMode: boolean;
  isRenaming: boolean;
  renameDraft: string;
  tabsLength: number;
  onSelect: () => void;
  onClose: () => void;
  onBeginRename: () => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export default function SortableTab({
  tab,
  index,
  isActive,
  isDarkMode,
  isRenaming,
  renameDraft,
  tabsLength,
  onSelect,
  onClose,
  onBeginRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  renameInputRef,
  onKeyDown,
}: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const title = tab.title.trim() || (index === 0 ? 'New Note' : `New Note (${index + 1})`);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group flex shrink-0 basis-22 sm:basis-26 items-center h-9 border-r text-sm transition-all duration-150 cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'opacity-0'
          : isActive
            ? isDarkMode
              ? 'bg-slate-900 border-slate-700 text-slate-100 shadow-[inset_0_2px_0_#10b981]'
              : 'bg-white border-slate-300 text-slate-900 shadow-[inset_0_2px_0_#059669]'
            : isDarkMode
              ? 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-white hover:text-slate-800'
      }`}
    >
      {isActive && isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameDraft}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              onRenameCommit();
            } else if (e.key === 'F2') {
              e.preventDefault();
              onBeginRename();
            } else if (e.key === 'Escape') {
              onRenameCancel();
            }
          }}
          className={`min-w-0 flex-1 h-full px-3 bg-transparent outline-none ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}
          aria-label="Rename current tab"
        />
      ) : (
        <button type="button"
          onClick={(event) => {
            if (event.shiftKey && tabsLength > 1) {
              onClose();
              return;
            }
            onSelect();
          }}
          onDoubleClick={() => onBeginRename()}
          onKeyDown={onKeyDown}
          className={`min-w-0 flex-1 h-full px-3 ${tabsLength === 1 ? 'text-center' : 'text-left'}`}
          title={`${title} (double-click or F2 to rename${tabsLength > 1 ? ', shift-click to close' : ''})`}
        >
          <span className="block truncate">{title}</span>
        </button>
      )}
      {tabsLength > 1 && (
        <button type="button"
          aria-label={`Close ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`mr-2 shrink-0 p-0.5 opacity-60 transition-colors group-hover:opacity-100 ${
            isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200'
          }`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

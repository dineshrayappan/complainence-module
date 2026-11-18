import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  CheckSquare,
  Square,
  History,
  Clock,
  Sparkles,
  Search,
  Filter,
  Check,
  RotateCcw,
  Trash2,
  Bookmark,
  Layers,
  SlidersHorizontal,
  ChevronRight,
  Info,
} from 'lucide-react';

export const ExportColumnsModal = ({
  isOpen,
  onClose,
  initialFormat = 'CSV', // 'CSV' | 'PDF'
  activeReportTab = 'audit-register',
  reportTitle = 'Master Register',
  availableColumns = [],
  presets = [],
  datasetCount = 0,
  isExporting = false,
  onExecuteExport,
}) => {
  const [format, setFormat] = useState(initialFormat);
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [includePhotos, setIncludePhotos] = useState(true);
  const [historyList, setHistoryList] = useState([]);
  const [savePresetName, setSavePresetName] = useState('');
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);

  const storageKeyHistory = `garment_qms_export_col_hist_${activeReportTab}`;
  const storageKeyLastSelection = `garment_qms_export_last_cols_${activeReportTab}`;

  // Update format when initialFormat changes upon opening
  useEffect(() => {
    if (isOpen) {
      setFormat(initialFormat || 'CSV');
      setSearchQuery('');
      setShowSavePresetInput(false);
      setSavePresetName('');
    }
  }, [isOpen, initialFormat]);

  // Load history & initial selection on tab or modal open
  useEffect(() => {
    if (!isOpen) return;

    try {
      const storedHist = localStorage.getItem(storageKeyHistory);
      const parsedHist = storedHist ? JSON.parse(storedHist) : [];
      setHistoryList(Array.isArray(parsedHist) ? parsedHist : []);

      const storedLast = localStorage.getItem(storageKeyLastSelection);
      if (storedLast) {
        const parsedLast = JSON.parse(storedLast);
        if (Array.isArray(parsedLast) && parsedLast.length > 0) {
          // Verify at least one ID exists in availableColumns
          const validIds = parsedLast.filter((id) =>
            availableColumns.some((col) => col.id === id)
          );
          if (validIds.length > 0) {
            setSelectedIds(validIds);
            return;
          }
        }
      }

      // Default: select default columns or all columns
      const defaultCols = availableColumns
        .filter((col) => col.default !== false)
        .map((col) => col.id);
      setSelectedIds(defaultCols.length > 0 ? defaultCols : availableColumns.map((c) => c.id));
    } catch (err) {
      console.warn('Failed to load export columns history:', err);
      setSelectedIds(availableColumns.map((c) => c.id));
    }
  }, [isOpen, activeReportTab, storageKeyHistory, storageKeyLastSelection, availableColumns]);

  // Extract distinct categories
  const categories = useMemo(() => {
    const set = new Set();
    availableColumns.forEach((col) => {
      if (col.category) set.add(col.category);
    });
    return Array.from(set);
  }, [availableColumns]);

  // Filter columns by category and search
  const filteredColumns = useMemo(() => {
    return availableColumns.filter((col) => {
      const matchesCategory =
        selectedCategory === 'ALL' || col.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        col.label.toLowerCase().includes(q) ||
        col.id.toLowerCase().includes(q) ||
        (col.category && col.category.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [availableColumns, selectedCategory, searchQuery]);

  // Toggle single column
  const toggleColumn = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Select all visible / all columns
  const handleSelectAll = () => {
    setSelectedIds(availableColumns.map((c) => c.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleInvertSelection = () => {
    const current = new Set(selectedIds);
    const inverted = availableColumns
      .filter((c) => !current.has(c.id))
      .map((c) => c.id);
    setSelectedIds(inverted);
  };

  // Apply a preset
  const handleApplyPreset = (preset) => {
    if (!preset || !Array.isArray(preset.columns)) return;
    const validIds = preset.columns.filter((id) =>
      availableColumns.some((col) => col.id === id)
    );
    setSelectedIds(validIds);
  };

  // Check if a list of columns matches current selection
  const isSelectionMatching = (colIds) => {
    if (!Array.isArray(colIds)) return false;
    if (colIds.length !== selectedIds.length) return false;
    const s1 = new Set(colIds);
    return selectedIds.every((id) => s1.has(id));
  };

  // Save history item to localStorage
  const saveToHistory = (columnsToSave, customLabel = null) => {
    try {
      const colMap = new Map(availableColumns.map((c) => [c.id, c.label]));
      const summaryLabels = columnsToSave
        .map((id) => colMap.get(id) || id)
        .slice(0, 3)
        .join(', ');
      const extraCount = columnsToSave.length > 3 ? ` +${columnsToSave.length - 3} more` : '';
      const summaryText = `${summaryLabels}${extraCount}`;

      const now = new Date();
      const dateStr = `${now.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      const newEntry = {
        id: `hist_${Date.now()}`,
        name:
          customLabel ||
          `Export ${historyList.length + 1} (${columnsToSave.length} cols)`,
        format,
        columns: columnsToSave,
        summary: summaryText,
        timestamp: Date.now(),
        dateStr,
        isCustom: !!customLabel,
      };

      // Filter out duplicate selections
      const filtered = historyList.filter(
        (h) => !isSelectionMatching(h.columns)
      );

      const updatedHistory = [newEntry, ...filtered].slice(0, 8);
      setHistoryList(updatedHistory);
      localStorage.setItem(storageKeyHistory, JSON.stringify(updatedHistory));
      localStorage.setItem(storageKeyLastSelection, JSON.stringify(columnsToSave));
    } catch (err) {
      console.warn('Failed to save export history:', err);
    }
  };

  // Delete single history item
  const handleDeleteHistoryItem = (e, id) => {
    e.stopPropagation();
    try {
      const updated = historyList.filter((item) => item.id !== id);
      setHistoryList(updated);
      localStorage.setItem(storageKeyHistory, JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to delete history item:', err);
    }
  };

  // Clear all history
  const handleClearHistory = () => {
    try {
      setHistoryList([]);
      localStorage.removeItem(storageKeyHistory);
    } catch (err) {
      console.warn('Failed to clear history:', err);
    }
  };

  // Save current selection as named preset
  const handleSaveNamedPreset = (e) => {
    e.preventDefault();
    if (!savePresetName.trim()) return;
    saveToHistory(selectedIds, savePresetName.trim());
    setSavePresetName('');
    setShowSavePresetInput(false);
  };

  // Trigger export
  const handleDownload = () => {
    if (selectedIds.length === 0) return;
    saveToHistory(selectedIds);
    onExecuteExport({
      format,
      selectedColumnIds: selectedIds,
      includePhotos,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* 1. Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-2xl ${format === 'PDF'
                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'
                }`}
            >
              {format === 'PDF' ? (
                <FileText className="w-5 h-5" />
              ) : (
                <FileSpreadsheet className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Export Checklist &amp; Column Selector
                </h2>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {reportTitle}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose the exact columns you want to download. Past choices are automatically saved below.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Format Switcher */}
            <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setFormat('CSV')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${format === 'CSV'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat('PDF')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${format === 'PDF'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Section A: History & Saved Presets */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600 dark:text-cyan-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Past Export Selections &amp; Quick Presets
                </span>
                {historyList.length > 0 && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                    {historyList.length} recent
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSavePresetInput((prev) => !prev)}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Bookmark className="w-3 h-3" />
                  <span>{showSavePresetInput ? 'Cancel' : 'Save current as preset'}</span>
                </button>
                {historyList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="text-[11px] font-semibold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                    title="Clear history"
                  >
                    Clear history
                  </button>
                )}
              </div>
            </div>

            {/* Save Preset Input Form */}
            {showSavePresetInput && (
              <form
                onSubmit={handleSaveNamedPreset}
                className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-xl border border-indigo-200 dark:border-indigo-800"
              >
                <input
                  type="text"
                  placeholder="Enter preset name (e.g. Weekly Management Review)..."
                  value={savePresetName}
                  onChange={(e) => setSavePresetName(e.target.value)}
                  className="flex-1 text-xs px-2 py-1 bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!savePresetName.trim()}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                >
                  Save ({selectedIds.length} cols)
                </button>
              </form>
            )}

            {/* Presets and History Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Built-in Presets */}
              <button
                type="button"
                onClick={handleSelectAll}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${selectedIds.length === availableColumns.length
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                  }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>All Columns ({availableColumns.length})</span>
              </button>

              {presets.map((preset, idx) => {
                const isActive = isSelectionMatching(preset.columns);
                return (
                  <button
                    key={preset.id || idx}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${isActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                      }`}
                  >
                    <span>{preset.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-md ${isActive
                        ? 'bg-white/20 text-white font-bold'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                    >
                      {preset.columns.length}
                    </span>
                  </button>
                );
              })}

              {/* History Entries */}
              {historyList.map((item, idx) => {
                const isActive = isSelectionMatching(item.columns);
                return (
                  <div
                    key={item.id || idx}
                    onClick={() => setSelectedIds(item.columns)}
                    className={`group relative flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${isActive
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-600'
                      }`}
                    title={`Exported on ${item.dateStr}: ${item.summary}`}
                  >
                    <Clock
                      className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'
                        }`}
                    />
                    <div className="flex flex-col text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold">
                          {item.name || `Export #${idx + 1}`}
                        </span>
                        <span
                          className={`text-[10px] px-1 rounded ${isActive
                            ? 'bg-white/20 text-white font-bold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}
                        >
                          {item.columns.length} cols
                        </span>
                      </div>
                      <span
                        className={`text-[10px] truncate max-w-[140px] sm:max-w-[200px] ${isActive ? 'text-white/80' : 'text-slate-400'
                          }`}
                      >
                        {item.summary}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                      className={`p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity ml-1`}
                      title="Remove from history"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>



          {/* Section D: Columns Checklist Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 px-1">
              <span>
                Available Columns ({filteredColumns.length})
              </span>
              <span className="text-indigo-600 dark:text-cyan-400 font-extrabold">
                {selectedIds.length} of {availableColumns.length} selected
              </span>
            </div>

            {filteredColumns.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <Info className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No columns match your search "{searchQuery}".
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('ALL');
                  }}
                  className="mt-2 text-xs font-bold text-indigo-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {filteredColumns.map((col) => {
                  const isChecked = selectedIds.includes(col.id);
                  return (
                    <div
                      key={col.id}
                      onClick={() => toggleColumn(col.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${isChecked
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-80'
                        }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-4 h-4 rounded-md flex items-center justify-center transition-colors ${isChecked
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-300 dark:border-slate-600'
                            }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-xs font-bold truncate ${isChecked
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-400'
                              }`}
                          >
                            {col.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section E: PDF Extra Options (Photos Toggle) */}
          {format === 'PDF' && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Include Photographic Evidence Dossier
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Embeds before &amp; after proof photos on separate pages after the data register table.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePhotos}
                  onChange={(e) => setIncludePhotos(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-rose-600"></div>
              </label>
            </div>
          )}

          {/* Section F: Selected Columns Order Preview Pills */}
          {selectedIds.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 block mb-1.5 uppercase tracking-wider">
                Export Column Order Preview ({selectedIds.length} columns)
              </span>
              <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto p-1">
                {selectedIds.map((id, index) => {
                  const col = availableColumns.find((c) => c.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                    >
                      <span className="text-[10px] text-slate-400">
                        {index + 1}.
                      </span>
                      <span>{col ? col.label : id}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleColumn(id);
                        }}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 3. Footer Action Bar */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/70">
          <div className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
            <span>
              Target Dataset:{' '}
              <strong className="text-slate-900 dark:text-white">
                {datasetCount} records
              </strong>
            </span>
            <span className="mx-2">•</span>
            <span>
              Selected:{' '}
              <strong className="text-indigo-600 dark:text-cyan-400">
                {selectedIds.length} of {availableColumns.length} columns
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              id="btn-confirm-export"
              onClick={handleDownload}
              disabled={selectedIds.length === 0 || isExporting}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${format === 'PDF'
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                }`}
            >
              <Download className="w-4 h-4" />
              <span>
                {isExporting
                  ? `Compiling ${format}...`
                  : `Download ${format} (${selectedIds.length} Columns)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Layers,
  Plus,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Users,
  ClipboardList,
  Check,
  X,
  ArrowRight,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { unitService } from '../services/api';
import { useUnit } from '../context/UnitContext';

export const UnitManagementPanel = ({ showToast }) => {
  const { units, activeUnitId, switchUnit, refreshUnits } = useUnit();

  const [loading, setLoading] = useState(true);
  const [unassignedData, setUnassignedData] = useState({ complaints: 0, users: 0, tasks: 0 });
  const [refreshing, setRefreshing] = useState(false);

  // Migration form state
  const [targetMigrationUnit, setTargetMigrationUnit] = useState('UNIT-1');
  const [migrationType, setMigrationType] = useState('ALL'); // 'ALL' | 'COMPLAINTS' | 'USERS'
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);

  // Edit Unit Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', code: '', description: '', address: '', isActive: true });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Create Unit Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ unitId: '', name: '', code: '', description: '', address: '' });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadUnassigned = useCallback(async () => {
    try {
      const res = await unitService.getUnassignedRecords();
      if (res.data?.success && res.data.unassigned) {
        setUnassignedData(res.data.unassigned);
      }
    } catch (err) {
      console.warn('Failed to load unassigned records count:', err);
    }
  }, []);

  const reloadAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([refreshUnits(), loadUnassigned()]);
    setRefreshing(false);
    setLoading(false);
  }, [refreshUnits, loadUnassigned]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  // Open Edit Unit Modal
  const handleOpenEdit = (unit) => {
    setEditingUnit(unit);
    setEditForm({
      name: unit.name || '',
      code: unit.code || '',
      description: unit.description || '',
      address: unit.address || '',
      isActive: unit.isActive !== false,
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  // Submit Edit Unit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditLoading(true);

    try {
      const res = await unitService.updateUnit(editingUnit.unitId, editForm);
      if (res.data?.success) {
        setIsEditModalOpen(false);
        await reloadAll();
        if (showToast) showToast(`Unit ${editForm.name} updated successfully!`);
      }
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update unit details.');
    } finally {
      setEditLoading(false);
    }
  };

  // Open Create Unit Modal
  const handleOpenCreate = () => {
    const nextNum = (units.length || 0) + 1;
    setCreateForm({
      unitId: `UNIT-${nextNum}`,
      name: `Unit ${nextNum}`,
      code: `U${nextNum}`,
      description: `Factory Plant Production & Operations Division Unit ${nextNum}`,
      address: '',
    });
    setCreateError('');
    setIsCreateModalOpen(true);
  };

  // Submit Create Unit
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);

    try {
      const res = await unitService.createUnit(createForm);
      if (res.data?.success) {
        setIsCreateModalOpen(false);
        await reloadAll();
        if (showToast) showToast(`Unit ${createForm.name} created successfully!`);
      }
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create unit.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Run Safe Migration Assignment
  const handleRunMigration = async () => {
    const targetUnitObj = units.find((u) => u.unitId === targetMigrationUnit);
    const unitName = targetUnitObj?.name || targetMigrationUnit;

    const confirmMsg =
      `Confirm Mapping Migration:\n\n` +
      `Assign unassigned ${migrationType === 'ALL' ? 'NC records and Users' : migrationType} to: [${unitName}] (${targetMigrationUnit})?\n\n` +
      `Existing data will be safely mapped without deleting, resetting, or altering historical photos and audits.`;

    if (!window.confirm(confirmMsg)) return;

    setMigrating(true);
    setMigrationResult(null);

    try {
      const res = await unitService.assignRecords({
        unitId: targetMigrationUnit,
        recordType: migrationType,
      });

      if (res.data?.success) {
        setMigrationResult({
          success: true,
          message: res.data.message || 'Records mapped successfully.',
          updated: res.data.updated || {},
        });
        await reloadAll();
        if (showToast) showToast(`Mapped unassigned records to ${unitName} successfully!`);
      }
    } catch (err) {
      setMigrationResult({
        success: false,
        message: err.response?.data?.message || 'Failed to assign records to unit.',
      });
    } finally {
      setMigrating(false);
    }
  };

  const hasUnassigned = (unassignedData.complaints || 0) > 0 || (unassignedData.users || 0) > 0;

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* 1. Header Banner */}
      <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-r from-indigo-900/40 via-slate-900/60 to-indigo-950/40 border border-indigo-500/20 shadow-md backdrop-blur-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Company Unit Management &amp; Data Isolation
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
            Manage factory plant units (<strong>Unit 1</strong> &amp; <strong>Unit 2</strong>), configure unit settings, assign personnel, and safely review or map unassigned legacy records without data loss.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reloadAll}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            title="Refresh unit data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all hover:scale-102 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Unit</span>
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs text-slate-500 font-semibold block mb-1">Configured Units</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">{units.length}</span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono block mt-1">● Active Plants</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-500/20 shadow-xs">
          <span className="text-xs text-indigo-600 dark:text-cyan-400 font-semibold block mb-1">Active Unit View</span>
          <span className="text-sm font-black text-slate-900 dark:text-white truncate block">
            {activeUnitId === 'ALL' ? 'All Units (Company Wide)' : units.find((u) => u.unitId === activeUnitId)?.name || activeUnitId}
          </span>
          <span className="text-[10px] text-slate-400 font-mono block mt-1">Filtered in Header</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-500/20 shadow-xs">
          <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold block mb-1">Unassigned NCs</span>
          <span className="text-2xl font-black text-amber-700 dark:text-amber-300">{unassignedData.complaints || 0}</span>
          <span className="text-[10px] text-slate-400 font-mono block mt-1">Preserved in All-Units view</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-purple-500/20 shadow-xs">
          <span className="text-xs text-purple-600 dark:text-purple-400 font-semibold block mb-1">Unassigned Personnel</span>
          <span className="text-2xl font-black text-purple-700 dark:text-purple-300">{unassignedData.users || 0}</span>
          <span className="text-[10px] text-slate-400 font-mono block mt-1">Assignable below</span>
        </div>
      </div>

      {/* 3. Units Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Plant Units Directory
          </h3>
          <span className="text-xs text-indigo-600 dark:text-cyan-400 font-mono">
            {units.length} Registered Divisions
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {units.map((unit) => {
            const isActivePlant = unit.isActive !== false;
            const isCurrentView = activeUnitId === unit.unitId;

            return (
              <div
                key={unit.unitId}
                className={`p-5 rounded-2xl border transition-all relative flex flex-col justify-between ${
                  isCurrentView
                    ? 'bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/40 dark:to-slate-900 border-indigo-500 shadow-md ring-1 ring-indigo-500/40'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white flex items-center justify-center font-black text-base shadow-xs shrink-0">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                            {unit.name}
                          </h4>
                          {isCurrentView && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-indigo-600 text-white">
                              Active View
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 font-mono text-xs">
                          <span className="font-bold text-indigo-600 dark:text-cyan-400">
                            ID: {unit.unitId}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            CODE: {unit.code}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                        isActivePlant
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {isActivePlant ? 'Operational' : 'Inactive'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
                    {unit.description || 'Dedicated manufacturing plant facility.'}
                  </p>

                  {unit.address && (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 mb-3">
                      <strong>Address:</strong> {unit.address}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      switchUnit(unit.unitId);
                      if (showToast) showToast(`Switched active scope to ${unit.name}`);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isCurrentView
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {isCurrentView ? '✓ Currently Viewing' : 'Switch to this Unit'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(unit)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Unit</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Safe Legacy Records Review & Mapping Tool */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-amber-300/80 dark:border-amber-800/80 shadow-md space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Unassigned Legacy Records Review &amp; Migration
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                Rule 7 Compliant • 100% Data Preservation
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              As required by company rules, existing production NCs and personnel without a confirmed unit mapping are safely preserved and accessible in the <strong>All Units (Company Wide)</strong> view. They are never blindly overwritten. Use this tool to map them to the verified factory plant unit.
            </p>
          </div>
        </div>

        {/* Current Unassigned Status Callout */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs">
          <div className="flex items-center gap-2.5">
            <ClipboardList className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Unmapped NC Records:</span>
              <strong className="text-slate-900 dark:text-white font-bold">{unassignedData.complaints || 0} Records</strong>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Unmapped Personnel Accounts:</span>
              <strong className="text-slate-900 dark:text-white font-bold">{unassignedData.users || 0} Accounts</strong>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Evidence &amp; Photos:</span>
              <strong className="text-emerald-700 dark:text-emerald-300 font-bold">100% Intact &amp; Preserved</strong>
            </div>
          </div>
        </div>

        {/* Mapping Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Target Destination Unit
            </label>
            <select
              value={targetMigrationUnit}
              onChange={(e) => setTargetMigrationUnit(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {units.map((u) => (
                <option key={u.unitId} value={u.unitId}>
                  {u.name} ({u.unitId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Records To Map
            </label>
            <select
              value={migrationType}
              onChange={(e) => setMigrationType(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Unassigned Records (NCs + Personnel)</option>
              <option value="COMPLAINTS">NC &amp; CAP Records Only</option>
              <option value="USERS">Personnel Accounts Only</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleRunMigration}
              disabled={migrating || !hasUnassigned}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {migrating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Mapping Records...</span>
                </>
              ) : (
                <>
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Map Unassigned Records</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Migration Feedback Result */}
        {migrationResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
              migrationResult.success
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            {migrationResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <div className="flex-1">
              <span className="font-bold">{migrationResult.message}</span>
              {migrationResult.updated && (
                <span className="text-[11px] font-mono ml-2 opacity-90">
                  (NCs updated: {migrationResult.updated.complaints || 0}, Users updated: {migrationResult.updated.users || 0})
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ================= MODAL: EDIT UNIT ================= */}
      {isEditModalOpen && editingUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-indigo-50/50 dark:bg-indigo-950/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Edit {editingUnit.name} ({editingUnit.unitId})
                  </h3>
                  <p className="text-[11px] text-slate-500">Configure unit name and details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-3.5 text-xs">
              {editError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 text-rose-700 dark:text-rose-200 text-xs">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Unit Name *
                </label>
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Unit Code *
                </label>
                <input
                  required
                  value={editForm.code}
                  onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Physical Plant Address / Location
                </label>
                <input
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  placeholder="e.g. Building B, Industrial Complex, Plot 14"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Operational Plant Status
                </label>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, isActive: !editForm.isActive })}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    editForm.isActive
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300'
                  }`}
                >
                  {editForm.isActive ? 'Active (Operational)' : 'Inactive'}
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
                >
                  {editLoading ? 'Saving...' : 'Save Unit Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE UNIT ================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-indigo-50/50 dark:bg-indigo-950/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Add Factory Plant Unit
                  </h3>
                  <p className="text-[11px] text-slate-500">Register a new manufacturing unit</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-3.5 text-xs">
              {createError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 text-rose-700 dark:text-rose-200 text-xs">
                  {createError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Unit ID *
                  </label>
                  <input
                    required
                    value={createForm.unitId}
                    onChange={(e) => setCreateForm({ ...createForm, unitId: e.target.value.toUpperCase() })}
                    placeholder="e.g. UNIT-2"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Unit Code *
                  </label>
                  <input
                    required
                    value={createForm.code}
                    onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. U2"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Unit Name *
                </label>
                <input
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. Unit 2 (Fabric & Dyeing Division)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Operational scope, departments, or production lines in this unit..."
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Physical Plant Address / Location
                </label>
                <input
                  value={createForm.address}
                  onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                  placeholder="e.g. South Campus, Block C"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
                >
                  {createLoading ? 'Registering...' : 'Register Plant Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnitManagementPanel;

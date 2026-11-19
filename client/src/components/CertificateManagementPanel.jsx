import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Award,
  FileText,
  Calendar,
  Building2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Upload,
  Download,
  Search,
  Plus,
  Edit3,
  Trash2,
  Eye,
  RefreshCw,
  AlertCircle,
  Clock,
  X,
  FileCheck,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { certificateService } from '../services/api';

// Helper to format date as DD Mon YYYY (e.g. 24 Jul 2026)
const formatDate = (dateString) => {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

// Format date for HTML date input: YYYY-MM-DD
const formatDateForInput = (dateString) => {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
};

export const CertificateManagementPanel = ({ showToast }) => {
  const [certificates, setCertificates] = useState([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    valid: 0,
    expiringSoon: 0,
    expired: 0,
    expiring30: 0,
    expiring60: 0,
    expiring90: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'VALID' | 'EXPIRING_SOON' | 'EXPIRED'
  const [unitFilter, setUnitFilter] = useState('ALL'); // 'ALL' | 'BOTH' | 'UNIT-1' | 'UNIT-2' | 'UNASSIGNED'

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCert, setEditingCert] = useState(null); // null = create new, object = edit
  const [viewingCert, setViewingCert] = useState(null);
  const [deleteConfirmCert, setDeleteConfirmCert] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    certificateNumber: '',
    issueDate: '',
    expiryDate: '',
    unitId: 'BOTH',
    issuingAgency: '',
    description: '',
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const fileInputRef = useRef(null);

  // Fetch Certificates
  const fetchCertificates = async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    try {
      const res = await certificateService.getCertificates({
        search: searchQuery || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        unitId: unitFilter !== 'ALL' ? unitFilter : undefined,
      });
      if (res.data?.success) {
        setCertificates(res.data.certificates || []);
        if (res.data.metrics) {
          setMetrics(res.data.metrics);
        }
      }
    } catch (err) {
      console.error('Error fetching certificates:', err);
      if (showToast) showToast('Failed to load certificates. Please refresh.', 'error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCertificates();
  }, [statusFilter, unitFilter]);

  // Handle Search submit / debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCertificates(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingCert(null);
    setFormData({
      name: '',
      certificateNumber: '',
      issueDate: '',
      expiryDate: '',
      unitId: 'BOTH',
      issuingAgency: '',
      description: '',
    });
    setSelectedFile(null);
    setFilePreview(null);
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (cert) => {
    setEditingCert(cert);
    setFormData({
      name: cert.name || '',
      certificateNumber: cert.certificateNumber || '',
      issueDate: formatDateForInput(cert.issueDate),
      expiryDate: formatDateForInput(cert.expiryDate),
      unitId: cert.unitId || 'BOTH',
      issuingAgency: cert.issuingAgency || '',
      description: cert.description || '',
    });
    setSelectedFile(null);
    setFilePreview(cert.documentUrl || null);
    setIsFormModalOpen(true);
  };

  // Handle File Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      if (showToast) showToast('File size exceeds 30MB limit.', 'error');
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (rev) => setFilePreview(rev.target?.result);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  // Quick unit assignment directly from table
  const handleQuickUnitChange = async (cert, newUnitId) => {
    try {
      const res = await certificateService.updateCertificate(cert._id || cert.id, {
        unitId: newUnitId,
      });
      if (res.data?.success) {
        if (showToast) {
          const uLabel =
            newUnitId === 'BOTH'
              ? 'Both Units'
              : newUnitId === 'UNIT-2'
              ? 'Unit 2'
              : newUnitId === 'UNIT-1'
              ? 'Unit 1'
              : 'Unassigned';
          showToast(`Assigned '${cert.name}' to ${uLabel}`);
        }
        fetchCertificates(true);
      }
    } catch (err) {
      console.error('Quick unit update error:', err);
      if (showToast) showToast('Could not update certificate unit assignment.', 'error');
    }
  };

  // Submit Add / Edit Form
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      if (showToast) showToast('Certification Name is required.', 'error');
      return;
    }
    if (!formData.issueDate || !formData.expiryDate) {
      if (showToast) showToast('Valid From and Valid To dates are required.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const formPayload = new FormData();
      formPayload.append('name', formData.name.trim());
      formPayload.append('certificateNumber', formData.certificateNumber.trim());
      formPayload.append('issueDate', formData.issueDate);
      formPayload.append('expiryDate', formData.expiryDate);
      formPayload.append('unitId', formData.unitId);
      formPayload.append('issuingAgency', formData.issuingAgency.trim());
      formPayload.append('description', formData.description.trim());

      if (selectedFile) {
        formPayload.append('document', selectedFile);
      }

      let res;
      if (editingCert) {
        res = await certificateService.updateCertificate(editingCert._id || editingCert.id, formPayload);
      } else {
        res = await certificateService.createCertificate(formPayload);
      }

      if (res.data?.success) {
        if (showToast) {
          showToast(editingCert ? 'Certificate updated successfully!' : 'Certificate created successfully!');
        }
        setIsFormModalOpen(false);
        fetchCertificates(true);
      }
    } catch (err) {
      console.error('Save certificate error:', err);
      const msg = err.response?.data?.message || 'Failed to save certificate.';
      if (showToast) showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Certificate
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmCert) return;
    setDeleting(true);
    try {
      const res = await certificateService.deleteCertificate(deleteConfirmCert._id || deleteConfirmCert.id);
      if (res.data?.success) {
        if (showToast) showToast(`Certificate '${deleteConfirmCert.name}' archived.`);
        setDeleteConfirmCert(null);
        fetchCertificates(true);
      }
    } catch (err) {
      console.error('Delete certificate error:', err);
      if (showToast) showToast('Failed to delete certificate.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Direct Download Trigger
  const handleDownload = (cert) => {
    if (!cert.documentUrl) {
      if (showToast) showToast('No document uploaded for this certificate yet.', 'warning');
      return;
    }
    const downloadUrl = certificateService.downloadCertificateUrl(cert._id || cert.id);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    link.download = cert.documentName || `${cert.name}_Certificate.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Group expiring soon certificates for the clean watchlist
  const expiringAlerts = useMemo(() => {
    const list = certificates.filter((c) => c.status === 'EXPIRING_SOON' || c.status === 'EXPIRED');
    return list.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [certificates]);

  return (
    <div className="space-y-4">
      {/* 1. Clean Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Compliance Certification Management
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                Plant Accreditations
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Factory audit accreditations, multi-unit coverage & validity tracking across plant operations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchCertificates(true)}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
            title="Refresh certificate status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Certificate</span>
          </button>
        </div>
      </div>

      {/* 2. Top Metric Summary Cards (4 Clean, Uniform Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Accreditations */}
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-4 rounded-xl bg-white dark:bg-slate-900 border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'ALL'
              ? 'border-indigo-500 ring-2 ring-indigo-500/10'
              : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1.5">
            <span className="font-medium">Total Accreditations</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
            {metrics.total}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Active factory compliance records</p>
        </div>

        {/* Valid & Compliant */}
        <div
          onClick={() => setStatusFilter('VALID')}
          className={`p-4 rounded-xl bg-white dark:bg-slate-900 border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'VALID'
              ? 'border-emerald-500 ring-2 ring-emerald-500/10'
              : 'border-slate-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1.5">
            <span className="font-medium">Valid & Compliant</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            {metrics.valid}
          </div>
          <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1">
            &gt; 90 days validity window remaining
          </p>
        </div>

        {/* Expiring Soon */}
        <div
          onClick={() => setStatusFilter('EXPIRING_SOON')}
          className={`p-4 rounded-xl bg-white dark:bg-slate-900 border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'EXPIRING_SOON'
              ? 'border-amber-500 ring-2 ring-amber-500/10'
              : 'border-slate-200/80 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1.5">
            <span className="font-medium">Expiring Soon</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
            {metrics.expiringSoon}
          </div>
          <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1">
            Renewal needed within ≤ 90 days
          </p>
        </div>

        {/* Expired */}
        <div
          onClick={() => setStatusFilter('EXPIRED')}
          className={`p-4 rounded-xl bg-white dark:bg-slate-900 border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'EXPIRED'
              ? 'border-rose-500 ring-2 ring-rose-500/10'
              : 'border-slate-200/80 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1.5">
            <span className="font-medium">Expired</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 font-mono">
            {metrics.expired}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {metrics.expired === 0 ? 'Zero expired records' : 'Requires immediate renewal action'}
          </p>
        </div>
      </div>

      {/* 3. Renewal Notification Watchlist (Neat & Clean Pill Strip) */}
      {expiringAlerts.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 text-amber-900 dark:text-amber-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold">Expiry Watchlist:</span>{' '}
              <span className="text-xs text-amber-800/90 dark:text-amber-300/90">
                {expiringAlerts.length} certification{expiringAlerts.length > 1 ? 's' : ''} approaching renewal window
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {expiringAlerts.slice(0, 4).map((c) => {
              const isUrgent = c.daysRemaining <= 30;
              return (
                <button
                  key={c.id || c._id}
                  onClick={() => setViewingCert(c)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                    isUrgent
                      ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900 hover:bg-rose-100'
                      : 'bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="font-mono font-bold text-[11px]">({c.daysRemaining}d)</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Sleek Search and Status Filter Toolbar */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by certification name, certificate #, or agency..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Unit Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Plant Unit:</span>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Units</option>
              <option value="BOTH">🏢 Both Units</option>
              <option value="UNIT-1">📍 Unit 1</option>
              <option value="UNIT-2">📍 Unit 2</option>
              <option value="UNASSIGNED">⚠️ Unassigned</option>
            </select>

            {(searchQuery || statusFilter !== 'ALL' || unitFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setUnitFilter('ALL');
                }}
                className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Clean Status Pill Tabs */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/60 overflow-x-auto no-scrollbar">
          {[
            { id: 'ALL', label: 'All Certifications', count: metrics.total },
            { id: 'VALID', label: 'Valid', count: metrics.valid },
            { id: 'EXPIRING_SOON', label: 'Expiring Soon', count: metrics.expiringSoon },
            { id: 'EXPIRED', label: 'Expired', count: metrics.expired },
          ].map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isActive
                      ? 'bg-indigo-200/60 dark:bg-indigo-800/60 text-indigo-900 dark:text-indigo-100 font-bold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Main Certificates Table (High-Readability, Modern Styling) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-semibold text-[11px]">
                <th className="py-3 px-4 w-10 text-center">#</th>
                <th className="py-3 px-4">Certification & Scope</th>
                <th className="py-3 px-4">Certificate Number</th>
                <th className="py-3 px-4">Plant Unit</th>
                <th className="py-3 px-4">Validity Period</th>
                <th className="py-3 px-4">Days Left</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Attachment</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-16 text-center text-slate-400 font-mono text-xs">
                    <div className="w-7 h-7 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto mb-2" />
                    <span>Loading compliance certification records...</span>
                  </td>
                </tr>
              ) : certificates.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-16 text-center text-slate-400 text-xs">
                    <Award className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600 dark:text-slate-300">No certification records found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Try adjusting your search query or unit filter</p>
                  </td>
                </tr>
              ) : (
                certificates.map((cert, index) => {
                  const isExpSoon = cert.status === 'EXPIRING_SOON';
                  const isExp = cert.status === 'EXPIRED';

                  return (
                    <tr
                      key={cert.id || cert._id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* S.No */}
                      <td className="py-3.5 px-4 text-center font-mono text-slate-400 text-xs">
                        {cert.serialNo || index + 1}
                      </td>

                      {/* Certification Name & Agency */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 font-bold text-xs border border-indigo-100 dark:border-indigo-900/50">
                            {cert.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900 dark:text-white block truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {cert.name}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate block max-w-xs">
                              {cert.issuingAgency || 'Standard Accreditation'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Certificate Number */}
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                        {cert.certificateNumber || '—'}
                      </td>

                      {/* Plant Unit Select Chip */}
                      <td className="py-3.5 px-4">
                        <select
                          value={cert.unitId || 'BOTH'}
                          onChange={(e) => handleQuickUnitChange(cert, e.target.value)}
                          className={`text-xs font-semibold px-2 py-1 rounded-lg border cursor-pointer outline-none transition-all ${
                            cert.unitId === 'BOTH'
                              ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/60'
                              : cert.unitId === 'UNIT-1'
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/60'
                              : cert.unitId === 'UNIT-2'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                          }`}
                          title="Click to change plant unit assignment"
                        >
                          <option value="BOTH">🏢 Both Units</option>
                          <option value="UNIT-1">📍 Unit 1</option>
                          <option value="UNIT-2">📍 Unit 2</option>
                          <option value="UNASSIGNED">⚠️ Unassigned</option>
                        </select>
                      </td>

                      {/* Validity Period: Issue Date to Expiry Date */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        <span>{formatDate(cert.issueDate)}</span>
                        <span className="text-slate-400 mx-1.5">→</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {formatDate(cert.expiryDate)}
                        </span>
                      </td>

                      {/* Days Left */}
                      <td className="py-3.5 px-4 font-mono text-xs">
                        {isExp ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">
                            Expired
                          </span>
                        ) : cert.daysRemaining <= 30 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">
                            {cert.daysRemaining}d left
                          </span>
                        ) : cert.daysRemaining <= 90 ? (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            {cert.daysRemaining}d left
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {cert.daysRemaining}d left
                          </span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4">
                        {isExp ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                            Expired
                          </span>
                        ) : isExpSoon ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                            Expiring Soon
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                            Valid
                          </span>
                        )}
                      </td>

                      {/* Attachment Button */}
                      <td className="py-3.5 px-4 text-center">
                        {cert.documentUrl ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => setViewingCert(cert)}
                              className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Preview Document"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDownload(cert)}
                              className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Download Document"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenEditModal(cert)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                          >
                            <Upload className="w-3 h-3" />
                            <span>Attach</span>
                          </button>
                        )}
                      </td>

                      {/* Row Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewingCert(cert)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(cert)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Edit Certificate"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmCert(cert)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Archive Certificate"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Add / Edit Certificate Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {editingCert ? 'Edit Compliance Certificate' : 'Add New Certificate'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {editingCert
                      ? `Updating details for ${editingCert.name}`
                      : 'Register plant accreditation & upload document'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitForm} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Row 1: Certification Name & Certificate No. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Certification Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. WRAP (HO), BSCI, GOTS, ISO 9001..."
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Certificate Number
                  </label>
                  <input
                    type="text"
                    value={formData.certificateNumber}
                    onChange={(e) => setFormData({ ...formData, certificateNumber: e.target.value })}
                    placeholder="e.g. WRAP-2026-001, GOTS-4412..."
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Row 2: Plant Unit & Issuing Authority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Plant Unit Coverage *
                  </label>
                  <select
                    value={formData.unitId}
                    onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-semibold cursor-pointer"
                  >
                    <option value="BOTH">🏢 Both Units</option>
                    <option value="UNIT-1">📍 Unit 1</option>
                    <option value="UNIT-2">📍 Unit 2</option>
                    <option value="UNASSIGNED">⚠️ Unassigned (Pending Assignment)</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Certifications common to plant operations apply across both Unit 1 and Unit 2.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Issuing Authority / Agency
                  </label>
                  <input
                    type="text"
                    value={formData.issuingAgency}
                    onChange={(e) => setFormData({ ...formData, issuingAgency: e.target.value })}
                    placeholder="e.g. Control Union, WRAP, OEKO-TEX..."
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>
              </div>

              {/* Row 3: Validity Window (Issue Date & Expiry Date) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Valid From (Issue Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Valid To (Expiry Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono cursor-pointer"
                  />
                </div>
              </div>

              {/* Row 4: Description / Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description / Accreditation Scope
                </label>
                <textarea
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional scope details, certified fabric categories, facility notes..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium resize-none"
                />
              </div>

              {/* Row 5: Certificate Document Upload (PDF or Image) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Upload Certificate Document (PDF or Image)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 hover:border-indigo-400 transition-all cursor-pointer text-center"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      <FileCheck className="w-4 h-4 text-emerald-500" />
                      <span>{selectedFile.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  ) : filePreview ? (
                    <div className="flex items-center justify-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      <FileCheck className="w-4 h-4 text-emerald-500" />
                      <span>Document attached (Click to replace file)</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-5 h-5 text-indigo-500 mx-auto" />
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Click to browse or drop certificate file
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">Supports PDF, PNG, JPG up to 30MB</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>{editingCert ? 'Save Changes' : 'Create Certificate'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: View Certificate Details & Document Viewer */}
      {viewingCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{viewingCert.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase ${
                        viewingCert.status === 'EXPIRED'
                          ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                          : viewingCert.status === 'EXPIRING_SOON'
                          ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                          : 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                      }`}
                    >
                      {viewingCert.status === 'EXPIRING_SOON' ? 'Expiring Soon' : viewingCert.status}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Certificate No: {viewingCert.certificateNumber || 'Unspecified'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingCert(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Details Content */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Meta Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Plant Unit</span>
                  <div className="mt-0.5">
                    {viewingCert.unitId === 'BOTH' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        🏢 Both Units
                      </span>
                    ) : viewingCert.unitId === 'UNIT-1' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        📍 Unit 1
                      </span>
                    ) : viewingCert.unitId === 'UNIT-2' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        📍 Unit 2
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                        ⚠️ Unassigned
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Valid From</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 mt-0.5 block">
                    {formatDate(viewingCert.issueDate)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Valid To</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 mt-0.5 block font-semibold">
                    {formatDate(viewingCert.expiryDate)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Days Remaining</span>
                  <span
                    className={`font-mono font-bold mt-0.5 block ${
                      viewingCert.daysRemaining < 0
                        ? 'text-rose-600'
                        : viewingCert.daysRemaining <= 90
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {viewingCert.daysRemaining < 0 ? 'Expired' : `${viewingCert.daysRemaining} Days`}
                  </span>
                </div>
              </div>

              {viewingCert.issuingAgency && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
                    Issuing Authority / Agency
                  </span>
                  <p className="text-slate-800 dark:text-slate-200 font-medium">{viewingCert.issuingAgency}</p>
                </div>
              )}

              {viewingCert.description && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
                    Description & Scope
                  </span>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    {viewingCert.description}
                  </p>
                </div>
              )}

              {/* Document Viewer Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Certificate Document Attachment
                  </span>
                  {viewingCert.documentUrl && (
                    <button
                      onClick={() => handleDownload(viewingCert)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download File</span>
                    </button>
                  )}
                </div>

                {viewingCert.documentUrl ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-3 min-h-[200px]">
                    {viewingCert.documentUrl.startsWith('data:image/') ||
                    /\.(png|jpe?g|webp|gif)$/i.test(viewingCert.documentName || '') ? (
                      <img
                        src={viewingCert.documentUrl}
                        alt={viewingCert.name}
                        className="max-h-72 object-contain rounded-lg shadow-xs"
                      />
                    ) : (
                      <div className="w-full flex flex-col items-center justify-center py-6 space-y-3">
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-slate-900 dark:text-white text-xs">
                            {viewingCert.documentName || 'Certificate Document (PDF)'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Compliance document available
                          </p>
                        </div>
                        <button
                          onClick={() => handleDownload(viewingCert)}
                          className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Open Document</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-slate-400">
                    <FileText className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto mb-1.5" />
                    <p className="font-semibold text-xs text-slate-600 dark:text-slate-400">
                      No document attached yet
                    </p>
                    <button
                      onClick={() => {
                        setViewingCert(null);
                        handleOpenEditModal(viewingCert);
                      }}
                      className="mt-2.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800/60 hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      Upload Now
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 flex items-center justify-end gap-2.5 shrink-0">
              <button
                onClick={() => setViewingCert(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const cert = viewingCert;
                  setViewingCert(null);
                  handleOpenEditModal(cert);
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Certificate</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Delete Confirmation Modal */}
      {deleteConfirmCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-5 text-center">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Archive Certificate?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Are you sure you want to archive <span className="font-semibold text-slate-800 dark:text-slate-200">'{deleteConfirmCert.name}'</span>?
            </p>

            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setDeleteConfirmCert(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deleting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>Confirm Archive</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CertificateManagementPanel;

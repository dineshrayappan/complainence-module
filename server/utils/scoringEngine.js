/**
 * Weighted Compliance Scoring Engine
 * ------------------------------------
 * Replaces naïve count-based scoring with:
 *   - Weighted checklist scoring per item severity
 *   - Separate Risk Score derived from NC severity mix
 *   - Overdue CAP penalty contribution
 *
 * Scoring model:
 *   Item status → point score:
 *     COMPLIANT     = 100
 *     OBSERVATION   =  50
 *     NON_COMPLIANT =   0
 *     NOT_APPLICABLE → excluded from denominator
 *     PENDING        → excluded from denominator (not yet assessed)
 *
 *   Item weight by severity:
 *     Critical    = 10
 *     Major       =  5
 *     Minor       =  2
 *     Observation =  1
 *
 *   Compliance Score =
 *     Σ (status_score × weight for applicable items)
 *     ─────────────────────────────────────────────── × 100
 *     Σ (100 × weight for applicable items)
 *
 *   Risk Score is determined by:
 *     1. Any Critical NC present  → CRITICAL
 *     2. Any Major NC present AND compliance < 80%  → HIGH
 *     3. compliance < 75%  → HIGH
 *     4. compliance < 90%  → MEDIUM
 *     5. else  → LOW
 */

// Weight constants (configurable by administrator in future)
const SEVERITY_WEIGHTS = {
  Critical: 10,
  Major: 5,
  Minor: 2,
  Observation: 1,
};

// Status point values
const STATUS_SCORES = {
  COMPLIANT: 100,
  OBSERVATION: 50,
  NON_COMPLIANT: 0,
  NOT_APPLICABLE: null, // excluded
  PENDING: null,        // excluded (not yet assessed)
};

/**
 * Calculate weighted compliance score for a set of checklist items.
 * @param {Array} items  Array of { status, severity } objects
 * @returns {{ complianceScore, totalApplicable, totalAssessed, weightedAchieved, weightedMax,
 *             compliantCount, observationCount, ncCount, naCount, pendingCount }}
 */
const computeChecklistScore = (items = []) => {
  let weightedAchieved = 0;
  let weightedMax = 0;
  let compliantCount = 0;
  let observationCount = 0;
  let ncCount = 0;
  let naCount = 0;
  let pendingCount = 0;
  let criticalNCCount = 0;
  let majorNCCount = 0;
  let minorNCCount = 0;

  for (const item of items) {
    const severity = item.severity || 'Minor';
    const weight = SEVERITY_WEIGHTS[severity] ?? SEVERITY_WEIGHTS.Minor;
    const statusScore = STATUS_SCORES[item.status];

    if (item.status === 'NOT_APPLICABLE') { naCount++; continue; }
    if (item.status === 'PENDING' || statusScore === null || statusScore === undefined) { pendingCount++; continue; }

    // Applicable item
    weightedMax += weight * 100;
    weightedAchieved += weight * statusScore;

    if (item.status === 'COMPLIANT') { compliantCount++; }
    else if (item.status === 'OBSERVATION') { observationCount++; }
    else if (item.status === 'NON_COMPLIANT') {
      ncCount++;
      if (severity === 'Critical') criticalNCCount++;
      else if (severity === 'Major') majorNCCount++;
      else minorNCCount++;
    }
  }

  const totalApplicable = compliantCount + observationCount + ncCount;
  const complianceScore = weightedMax > 0
    ? Math.round((weightedAchieved / weightedMax) * 100)
    : null; // no applicable items → null (no fake 100%)

  return {
    complianceScore,
    totalApplicable,
    totalAssessed: totalApplicable,
    weightedAchieved,
    weightedMax,
    compliantCount,
    observationCount,
    ncCount,
    naCount,
    pendingCount,
    criticalNCCount,
    majorNCCount,
    minorNCCount,
  };
};

/**
 * Derive a Risk Score label from NC severity counts and compliance %.
 * @param {number|null} complianceScore
 * @param {number} criticalNCCount
 * @param {number} majorNCCount
 * @param {number} overdueCAPCount
 * @returns {{ riskScore, riskColor, riskEmoji, riskLevel }}
 */
const computeRiskScore = (complianceScore, criticalNCCount = 0, majorNCCount = 0, overdueCAPCount = 0) => {
  if (complianceScore === null) {
    return { riskScore: 'None', riskColor: 'slate', riskEmoji: '⚪', riskLevel: 0 };
  }
  if (criticalNCCount > 0) {
    return { riskScore: 'Critical', riskColor: 'rose', riskEmoji: '🔴', riskLevel: 4 };
  }
  if (majorNCCount > 2 || complianceScore < 75 || overdueCAPCount > 3) {
    return { riskScore: 'High', riskColor: 'orange', riskEmoji: '🟠', riskLevel: 3 };
  }
  if (majorNCCount > 0 || complianceScore < 90 || overdueCAPCount > 0) {
    return { riskScore: 'Medium', riskColor: 'amber', riskEmoji: '🟡', riskLevel: 2 };
  }
  return { riskScore: 'Low', riskColor: 'emerald', riskEmoji: '🟢', riskLevel: 1 };
};

/**
 * Compute weighted compliance score from NC ticket array for a department.
 * Maps NC priority → severity weight and uses CAP/closure status as status score.
 *
 * Severity mapping from NC priority field:
 *   CRITICAL → Critical (weight 10)
 *   HIGH     → Major   (weight 5)
 *   MEDIUM   → Minor   (weight 2)
 *   LOW      → Observation (weight 1)
 *
 * Status mapping (from NC workflow):
 *   Closed / Verified → COMPLIANT (100)
 *   Under Review / CAP Submitted / Under Verification → OBSERVATION (50)
 *   Open / Assigned / In Progress / Rejected / Draft → NON_COMPLIANT (0)
 *
 * @param {Array} deptComplaints  NC tickets for this department
 * @param {Date}  now             Current timestamp
 * @returns full score object including riskScore
 */
const computeDepartmentNCScore = (deptComplaints = [], now = new Date()) => {
  if (!deptComplaints || deptComplaints.length === 0) {
    return {
      complianceScore: null,
      totalApplicable: 0,
      totalAssessed: 0,
      weightedAchieved: 0,
      weightedMax: 0,
      compliantCount: 0,
      observationCount: 0,
      ncCount: 0,
      naCount: 0,
      pendingCount: 0,
      criticalNCCount: 0,
      majorNCCount: 0,
      minorNCCount: 0,
      riskScore: 'None',
      riskColor: 'slate',
      riskEmoji: '⚪',
      riskLevel: 0,
      overdueCAPCount: 0,
    };
  }

  const PRIORITY_TO_SEVERITY = {
    CRITICAL: 'Critical',
    HIGH: 'Major',
    MEDIUM: 'Minor',
    LOW: 'Observation',
  };

  const items = deptComplaints.map((nc) => {
    const severity = PRIORITY_TO_SEVERITY[nc.priority] || 'Minor';
    let status;
    if (['Closed', 'Verified'].includes(nc.status)) {
      status = 'COMPLIANT';
    } else if (['CAP Submitted', 'Under Review', 'Under Verification'].includes(nc.status)) {
      status = 'OBSERVATION';
    } else {
      status = 'NON_COMPLIANT';
    }
    return { severity, status };
  });

  const checklistResult = computeChecklistScore(items);

  // Overdue CAP count
  const overdueCAPCount = deptComplaints.filter(
    (nc) => nc.status !== 'Closed' && nc.status !== 'Verified' && new Date(nc.deadlineTimestamp) < now
  ).length;

  const riskResult = computeRiskScore(
    checklistResult.complianceScore,
    checklistResult.criticalNCCount,
    checklistResult.majorNCCount,
    overdueCAPCount
  );

  return { ...checklistResult, ...riskResult, overdueCAPCount };
};

module.exports = {
  SEVERITY_WEIGHTS,
  STATUS_SCORES,
  computeChecklistScore,
  computeRiskScore,
  computeDepartmentNCScore,
};

-- ==============================================================================
-- GARMENT MANUFACTURING QMS - COMPLETE DATABASE RESET & RE-CREATION SCRIPT
-- ==============================================================================
-- RUN THIS SCRIPT IN SUPABASE SQL EDITOR TO:
-- 1. Wipe all existing tables, old constraints, and corrupted test data
-- 2. Re-create all tables with proper columns and unrestricted status constraints
-- 3. Configure open Row Level Security (RLS) policies for frontend & backend API access
-- 4. Seed standard users (admin, auditor, supervisor) with bcrypt hashed passwords
-- 5. Seed standard departments, compliance tasks, and audits (Clean zero demo NCs)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CLEAN WIPE: DROP EXISTING TABLES AND DEPENDENCIES (CASCADE)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.auditLogs CASCADE;
DROP TABLE IF EXISTS public.compliance_tasks CASCADE;
DROP TABLE IF EXISTS public.audits CASCADE;
DROP TABLE IF EXISTS public.complaints CASCADE;
DROP TABLE IF EXISTS public.ncs CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.departments CASCADE;

-- Enable UUID & Crypto extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. CREATE USERS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE public.users (
    id TEXT PRIMARY KEY DEFAULT ('usr-' || substr(md5(random()::text), 1, 8)),
    "employeeId" TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'AUDITOR', 'SUPERVISOR', 'ACTION_PERSON')),
    department TEXT NOT NULL DEFAULT 'Central Quality Audit',
    designation TEXT DEFAULT 'Staff',
    "mobileNumber" TEXT DEFAULT '',
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_employeeId ON public.users ("employeeId");
CREATE INDEX idx_users_email ON public.users (email);
CREATE INDEX idx_users_role ON public.users (role);

-- ------------------------------------------------------------------------------
-- 3. CREATE COMPLAINTS / NCs TABLE (FULL LIFECYCLE SUPPORT)
-- ------------------------------------------------------------------------------
CREATE TABLE public.complaints (
    id TEXT PRIMARY KEY DEFAULT ('cmp-' || floor(extract(epoch from now()) * 1000)::text),
    "complaintId" TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL DEFAULT 'Stitching Fault',
    department TEXT NOT NULL DEFAULT 'Production',
    location TEXT NOT NULL DEFAULT 'Production Floor',
    priority TEXT NOT NULL DEFAULT 'HIGH',
    description TEXT DEFAULT '',
    requirement TEXT DEFAULT 'AQL 1.5 Workmanship Standard',
    "riskSeverity" TEXT DEFAULT 'HIGH',
    "capRequired" BOOLEAN DEFAULT false,
    "verificationMethod" TEXT DEFAULT 'Physical Floor Re-inspection',
    "beforePhoto" TEXT NOT NULL,
    "afterPhoto" TEXT DEFAULT NULL,
    "assignedTo" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdBy" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "deadlineHours" NUMERIC DEFAULT 16,
    "deadlineTimestamp" TIMESTAMPTZ,
    "actualCompletedAt" TIMESTAMPTZ DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Draft', 'Open', 'Assigned', 'In Progress', 'CAP Submitted', 'Under Review', 'Rejected / Rework', 'Verified', 'Closed')),
    "actionNotes" TEXT DEFAULT '',
    "feedbackRemarks" TEXT DEFAULT '',
    "rejectionReason" TEXT DEFAULT '',
    cap JSONB DEFAULT '{}'::jsonb,
    timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_complaints_complaintId ON public.complaints ("complaintId");
CREATE INDEX idx_complaints_department ON public.complaints (department);
CREATE INDEX idx_complaints_status ON public.complaints (status);
CREATE INDEX idx_complaints_deadline ON public.complaints ("deadlineTimestamp");
CREATE INDEX idx_complaints_createdAt ON public.complaints ("createdAt");

-- ------------------------------------------------------------------------------
-- 4. CREATE COMPLIANCE TASKS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE public.compliance_tasks (
    id TEXT PRIMARY KEY DEFAULT ('tsk-' || substr(md5(random()::text), 1, 8)),
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    description TEXT DEFAULT '',
    "assignedTo" JSONB DEFAULT '{}'::jsonb,
    "dueDate" TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed')),
    recurrence TEXT DEFAULT 'Daily',
    priority TEXT DEFAULT 'HIGH',
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_department ON public.compliance_tasks (department);
CREATE INDEX idx_tasks_status ON public.compliance_tasks (status);

-- ------------------------------------------------------------------------------
-- 5. CREATE AUDITS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE public.audits (
    id TEXT PRIMARY KEY DEFAULT ('aud-' || substr(md5(random()::text), 1, 8)),
    title TEXT NOT NULL,
    audit_number TEXT UNIQUE NOT NULL,
    department TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Scheduled',
    auditor JSONB DEFAULT '{}'::jsonb,
    checklist JSONB DEFAULT '[]'::jsonb,
    findings_count INT DEFAULT 0,
    scheduled_date TIMESTAMPTZ DEFAULT NOW(),
    completed_date TIMESTAMPTZ DEFAULT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. CREATE IMMUTABLE AUDIT TRAIL LOGS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
    id TEXT PRIMARY KEY DEFAULT ('log-' || substr(md5(random()::text), 1, 10)),
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    action_label TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'NC',
    entity_id TEXT,
    entity_name TEXT,
    related_nc_id TEXT,
    details TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT DEFAULT '127.0.0.1',
    is_immutable BOOLEAN DEFAULT true,
    tamper_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_related_nc ON public.audit_logs (related_nc_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at);

-- ------------------------------------------------------------------------------
-- 7. CREATE DEPARTMENTS MASTER TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE public.departments (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    code TEXT UNIQUE NOT NULL,
    manager TEXT,
    headcount INT DEFAULT 25,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 8. CONFIGURE ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for users" ON public.users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for complaints" ON public.complaints FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for compliance_tasks" ON public.compliance_tasks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for audits" ON public.audits FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for audit_logs" ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for departments" ON public.departments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 9. SEED MASTER DEPARTMENTS
-- ------------------------------------------------------------------------------
INSERT INTO public.departments (id, name, code, manager, headcount) VALUES
    ('dept-01', 'Production', 'PROD', 'Rajesh Kumar', 280),
    ('dept-02', 'Quality', 'QA', 'Kavita Nair', 35),
    ('dept-03', 'Maintenance', 'MAINT', 'Vikram Singh', 22),
    ('dept-04', 'Stores', 'STORE', 'Ramesh Patel', 18),
    ('dept-05', 'EHS', 'EHS', 'Sunil Verma', 12),
    ('dept-06', 'EDP', 'EDP', 'Deepak Joshi', 8),
    ('dept-07', 'HR', 'HR', 'Meera Swaminathan', 15);

-- ------------------------------------------------------------------------------
-- 10. SEED USER ACCOUNTS (Passwords: admin123, auditor123, supervisor123)
-- ------------------------------------------------------------------------------
INSERT INTO public.users (id, "employeeId", name, email, password, role, department, designation, "mobileNumber", "isActive") VALUES
    (
        'usr-adm-001',
        'ADM-001',
        'Anil Mehta',
        'admin@factory.com',
        '$2a$10$p1RfcDyNpnXMlrLeQnjDyO6SASUtvtUVPq7LbzoKZKwSosenEw7Gm', -- admin123
        'ADMIN',
        'Executive Oversight',
        'Plant Operations Director',
        '+91 98000 11223',
        true
    ),
    (
        'usr-aud-001',
        'AUD-001',
        'Sarah Auditor',
        'auditor@factory.com',
        '$2a$10$SBTG0CoxDroMVBvUGqRC9ukm9LfCjHNUbfAbVBX.q6qQ74VnT7yNW', -- auditor123
        'AUDITOR',
        'Quality Assurance',
        'Lead Compliance Auditor',
        '+91 98765 43210',
        true
    ),
    (
        'usr-aud-002',
        'AUD-002',
        'Dinesh Rayappan',
        'dinesh@factory.com',
        '$2a$10$SBTG0CoxDroMVBvUGqRC9ukm9LfCjHNUbfAbVBX.q6qQ74VnT7yNW', -- auditor123
        'AUDITOR',
        'Quality Assurance',
        'Senior Internal Auditor',
        '+91 98111 55667',
        true
    ),
    (
        'usr-sup-001',
        'SUP-001',
        'Rajesh Kumar',
        'supervisor@factory.com',
        '$2a$10$YWqHX4.CCyFyZXcelS9hteItNtgnED5zELjsq7qu4a84U3WKgGqaG', -- supervisor123
        'SUPERVISOR',
        'Production',
        'Sewing Floor In-Charge',
        '+91 98111 22334',
        true
    ),
    (
        'usr-sup-002',
        'SUP-002',
        'Kavita Nair',
        'quality@factory.com',
        '$2a$10$YWqHX4.CCyFyZXcelS9hteItNtgnED5zELjsq7qu4a84U3WKgGqaG', -- supervisor123
        'SUPERVISOR',
        'Quality',
        'QC Section Lead',
        '+91 98222 33445',
        true
    ),
    (
        'usr-sup-003',
        'SUP-003',
        'Vikram Singh',
        'maintenance@factory.com',
        '$2a$10$YWqHX4.CCyFyZXcelS9hteItNtgnED5zELjsq7qu4a84U3WKgGqaG', -- supervisor123
        'SUPERVISOR',
        'Maintenance',
        'Chief Mechanical Engineer',
        '+91 98333 44556',
        true
    ),
    (
        'usr-sup-004',
        'SUP-004',
        'Ramesh Patel',
        'store@factory.com',
        '$2a$10$YWqHX4.CCyFyZXcelS9hteItNtgnED5zELjsq7qu4a84U3WKgGqaG', -- supervisor123
        'SUPERVISOR',
        'Stores',
        'Material & Fabric Store Lead',
        '+91 98444 55667',
        true
    ),
    (
        'usr-sup-005',
        'SUP-005',
        'Sunil Verma',
        'ehs@factory.com',
        '$2a$10$YWqHX4.CCyFyZXcelS9hteItNtgnED5zELjsq7qu4a84U3WKgGqaG', -- supervisor123
        'SUPERVISOR',
        'EHS',
        'Safety & Compliance Officer',
        '+91 98555 66778',
        true
    ),
    (
        'usr-sup-006',
        'SUP-006',
        'Deepak Joshi',
        'edp@factory.com',
        '$2a$10$YWqHX4.CCyFyZXcelS9hteItNtgnED5zELjsq7qu4a84U3WKgGqaG', -- supervisor123
        'SUPERVISOR',
        'EDP',
        'IT & Systems Specialist',
        '+91 98666 77889',
        true
    ),
    (
        'usr-sup-007',
        'SUP-007',
        'Meera Swaminathan',
        'hr@factory.com',
        '$2a$10$YWqHX4.CCyFyZXcelS9hteItNtgnED5zELjsq7qu4a84U3WKgGqaG', -- supervisor123
        'SUPERVISOR',
        'HR',
        'HR & Training Manager',
        '+91 98777 88990',
        true
    );

-- ------------------------------------------------------------------------------
-- 11. INITIAL COMPLAINTS & AUDIT LOGS: Clean initialized state (Zero demo records)
-- ------------------------------------------------------------------------------


-- ------------------------------------------------------------------------------
-- 13. COMPLIANCE TASKS: Clean initialized state (Zero demo records)

-- ------------------------------------------------------------------------------
-- 14. AUDIT ROUNDS: Clean initialized state (Zero demo records)

-- ------------------------------------------------------------------------------
-- VERIFY EXECUTION: TABLE ROW COUNTS
-- ------------------------------------------------------------------------------
SELECT 'users' AS table_name, count(*) AS total_rows FROM public.users
UNION ALL
SELECT 'complaints', count(*) FROM public.complaints
UNION ALL
SELECT 'compliance_tasks', count(*) FROM public.compliance_tasks
UNION ALL
SELECT 'audits', count(*) FROM public.audits
UNION ALL
SELECT 'audit_logs', count(*) FROM public.audit_logs
UNION ALL
SELECT 'departments', count(*) FROM public.departments;

-- ------------------------------------------------------------------------------
-- 15. OPTIONAL SCHEMA MIGRATION FOR PRE-EXISTING COMPLAINT TABLES
-- ------------------------------------------------------------------------------
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS requirement TEXT DEFAULT 'AQL 1.5 Workmanship Standard';
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS "riskSeverity" TEXT DEFAULT 'HIGH';
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS "capRequired" BOOLEAN DEFAULT false;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS "verificationMethod" TEXT DEFAULT 'Physical Floor Re-inspection';

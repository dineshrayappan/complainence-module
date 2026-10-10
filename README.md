# 🧵 Textile & Garment Manufacturing Complaints Management System (QMS)

An enterprise-grade, closed-loop Quality Management & Defect Rectification Platform designed for textile apparel factories. It enforces strict **12h–24h resolution SLAs**, separates operational roles into dedicated security portals, captures before/after visual proof, and provides real-time executive oversight.

---

## 🌟 Key Features

### 1. Dedicated Multi-Role Portals
- 👑 **Executive Admin Portal**:
  - Plant-wide operational oversight and inactivity radar.
  - Line-by-line supervisor accountability scorecard.
  - Live cross-factory audit trail event stream.
  - **Personnel & Credential Management**: Onboard new Auditors & Supervisors, define credentials, reset passwords, and toggle access.
- 🛡️ **Internal Auditor Portal**:
  - Factory-wide roving defect logging.
  - Before-photo capture via Rear Camera / Canvas compression.
  - SLA timer activation (12h Critical, 24h Major).
  - Final closed-loop verification (Approve & Close or Reject for Rework).
- 🔧 **Line Supervisor Portal**:
  - Production line filtering (Sewing Line 1, Line 2, Spreading & Cutting, Finishing & Packing).
  - Live 12–24h countdown timer badges with SLA breach detection.
  - Start progress action and After-photo proof uploads.

---

## 🔑 System Login Credentials

| Role | Employee ID | Email / Username Shortcut | Password | Scope & Authority |
| :--- | :--- | :--- | :--- | :--- |
| 👑 **Executive Admin** | `ADMIN` / `ADM-001` | `admin@factory.com` or `admin` | `admin123` | Executive oversight, user credential management, factory analytics |

> Additional Auditor or Line Supervisor accounts can be created at any time through the **Personnel Management** section inside the Executive Admin Portal.

---

## 🏗️ Architecture & Technology Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Axios, HTML5 Canvas WebP compression.
- **Backend**: Node.js, Express.js, MongoDB (Mongoose), JWT Authentication, Multer file uploads, BcryptJS.
- **Real-time SLA**: Dynamic 12–24h SLA countdown engine with automated breach tracking.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- MongoDB instance (e.g. `mongodb://127.0.0.1:27017/garment_qms` or MongoDB Atlas)

### Installation
```bash
# Clone the repository
git clone https://github.com/dineshrayappan/complainence-module.git
cd complainence-module

# Install dependencies for root, server, and client
npm run install:all
```

### Environment Configuration
Copy `.env.example` in the `server` folder:
```bash
cp server/.env.example server/.env
```
Configure your `MONGODB_URI` and `JWT_SECRET` as needed.

### Running Locally
```bash
# Start both server and client concurrently
npm run dev
```
- **Web App**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000/api`

---

## 📄 License
MIT License

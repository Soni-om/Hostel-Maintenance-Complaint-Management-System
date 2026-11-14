# HostelCare — Backend Deployment & Cloud MySQL Architecture Guide

**Version:** 1.0.0  
**Phase:** Phase 5 — Deployment & Operations  
**Scope:** Express.js Backend, Managed Cloud MySQL, Durable Private Storage & Disaster Recovery  
**Target Provider:** Railway (with Render & Aiven Alternative Paths)  
**Security Level:** Production Hardened (Zero Secret Leakage, TLS/SSL, Strict CORS, RBAC)

---

## 1. System Deployment Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │               CLIENT DEVICES                 │
                    │      Desktop / Mobile / Tablet Browsers      │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           │ HTTPS (Port 443)
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │            REVERSE PROXY & CDN               │
                    │        Railway Edge / Cloudflare SSL         │
                    └──────────────────────┬───────────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        │ (Internal TLS / Port Forwarding)     │
                        ▼                                     ▼
     ┌────────────────────────────────────┐ ┌────────────────────────────────────┐
     │      HOSTELCARE EXPRESS API        │ │       PERSISTENT VOLUME DISK       │
     │     Node.js 20 LTS (ES Modules)    │ │        (Durable File Storage)      │
     │   Start Command: `npm start`       │─┼─► `/app/backend/uploads/complaints`│
     │   Binding: `0.0.0.0:${PORT}`       │ │   (Survives reboots & deploys)     │
     └──────────────────┬─────────────────┘ └────────────────────────────────────┘
                        │
                        │ Private VPC / TLS Encrypted TCP
                        ▼
     ┌───────────────────────────────────────────────────────────────────────────┐
     │                     MANAGED CLOUD MYSQL (MySQL 8.0+)                      │
     │          Host: `mysql.railway.internal` (or `DATABASE_URL`)               │
     │      Tables: users, complaints, assignments, status_history, feedback     │
     │      Automated Backups • Connection Pooling • Parameterized Queries       │
     └───────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Platform Selection: Railway

Railway is selected as the primary hosting and managed database platform for HostelCare due to:
1. **Integrated Full-Stack Stack**: Native co-location of Express web services and managed MySQL inside a private virtual network.
2. **Automated HTTPS & Custom Domains**: Generates free SSL certificates (`*.up.railway.app`) with automatic renewal and HTTP-to-HTTPS redirect.
3. **Environment Injection**: Auto-generates and connects `DATABASE_URL`, `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`.
4. **Durable File Storage**: First-class support for persistent volume mounts, ensuring uploaded maintenance defect photos persist across container redeployments.
5. **Git-Integrated Continuous Deployment**: Triggers automated builds directly on pushes to the GitHub repository.

---

## 3. Step-by-Step Production Deployment Guide

### Step 1: Provision Managed MySQL Database in Railway
1. Sign in to [Railway](https://railway.com/) and click **New Project**.
2. Select **Provision MySQL**.
3. Railway immediately initializes a dedicated MySQL 8.0 instance.
4. Navigate to the MySQL service **Variables** tab to view your credentials:
   - `DATABASE_URL` (Internal connection string: `mysql://root:password@mysql.railway.internal:3306/railway`)
   - `MYSQL_PUBLIC_URL` (Public TCP proxy for running local migrations or backups)
   - `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`

---

### Step 2: Deploy Database Schema & Seed Data
Before starting the Express API, deploy the relational schema and initial seed data using the automated deployment runner:

```bash
# Set target database URL to your Railway MySQL public proxy or cloud instance:
export DATABASE_URL="mysql://root:YOUR_PASSWORD@YOUR_PUBLIC_HOST:YOUR_PORT/railway"
export DB_SSL=true

# Deploy tables and seed initial data:
node backend/database/deploySchema.js --seed
```

**Verification Checkpoint:**
The runner executes 19 DDL statements with foreign key protection, verifies all 8 tables (`users`, `complaint_categories`, `complaints`, `complaint_assignments`, `complaint_status_history`, `complaint_attachments`, `feedback`, `hostel_blocks`), and displays the record count table.

---

### Step 3: Deploy Express Backend Service from GitHub
1. In the same Railway project, click **New Service** $\rightarrow$ **GitHub Repo**.
2. Select repository: `https://github.com/Soni-om/Hostel-Maintenance-Complaint-Management-System.git`.
3. Railway automatically detects `package.json` and uses the Nixpacks Node.js builder.
4. Verify the build and deploy configuration in `railway.json`:
   - **Start Command**: `npm start` (runs `node server.js`).
   - **Healthcheck Path**: `/api/health`.
   - **Healthcheck Timeout**: `120s`.
   - **Restart Policy**: `ON_FAILURE` (max 10 retries).

---

### Step 4: Configure Production Environment Variables
Navigate to your Express service **Variables** tab in Railway and configure the following production keys:

| Environment Variable | Recommended Production Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production mode and disables verbose dev logs. |
| `PORT` | Auto-injected by Railway (e.g. `5000`) | Service port binding (`0.0.0.0:${PORT}`). |
| `API_PREFIX` | `/api/v1` | REST API version prefix. |
| `DATABASE_URL` | `${{MySQL.DATABASE_URL}}` | References Railway's internal MySQL private network string. |
| `DB_SSL` | `false` (inside Railway VPC) / `true` (if external) | Enables TLS/SSL encryption for database packets. |
| `DB_CONNECTION_LIMIT` | `10` | Size of MySQL connection pool. |
| `JWT_SECRET` | *(64-character random hex string)* | Cryptographic HMAC secret for signing auth tokens. |
| `JWT_EXPIRES_IN` | `7d` | Session lifetime for issued JWT tokens. |
| `FRONTEND_ORIGIN` | `https://your-domain.up.railway.app,http://localhost:5000` | Comma-separated list of permitted CORS web origins. |
| `UPLOAD_DIR` | `/app/backend/uploads` | Path to persistent volume mount for defect images. |
| `MAX_FILE_SIZE_BYTES`| `5242880` | Enforces 5MB upload ceiling. |

> [!CAUTION]
> **Secret Hygiene:** Never commit `.env` files to Git. Generate `JWT_SECRET` using:
> `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`

---

### Step 5: Configure Durable Private File Storage
1. On your Express service in Railway, go to the **Settings** $\rightarrow$ **Volumes** tab.
2. Click **Add Volume**.
3. Set Mount Path: `/app/backend/uploads`.
4. Size: `5 GB` (standard initial volume).
5. Railway mounts this persistent disk to the container. All uploaded maintenance defect photos stored by `backend/src/utils/fileStorage.js` are written to `/app/backend/uploads/complaints` and persist across container redeployments, restarts, and rollbacks.

---

### Step 6: Configure HTTPS and Frontend CORS Allowlist
1. Under service **Settings** $\rightarrow$ **Networking**, click **Generate Domain**.
2. Railway provisions an HTTPS domain: `https://<service-name>.up.railway.app`.
3. In `backend/src/app.js`, `trust proxy` is enabled to support Railway's edge reverse proxy.
4. Set `FRONTEND_ORIGIN` in environment variables to match your exact live web app domain (e.g. `https://hostelcare.up.railway.app`).

---

## 4. Health Probes & Monitoring

The backend exposes dual health check endpoints designed for production uptime monitors (e.g., BetterStack, UptimeRobot, Railway Healthcheck):

### 1. Application & Database Health Probe
- **Endpoint:** `GET /api/health` (also `GET /api/v1/health`)
- **Access:** Public
- **HTTP Status:** `200 OK` (Healthy) / `503 Service Unavailable` (Degraded)
- **Response Format:**
  ```json
  {
    "status": "healthy",
    "application": "HostelCare",
    "version": "1.0.0",
    "environment": "production",
    "uptimeSeconds": 1420,
    "timestamp": "2026-11-14T08:30:00.000Z",
    "database": {
      "status": "connected",
      "latencyMs": 14,
      "database": "railway"
    }
  }
  ```
- **Security Check:** Strictly masks all passwords, tokens, usernames, and connection URIs.

### 2. Dedicated Database Health Probe
- **Endpoint:** `GET /api/health/db` (also `GET /api/v1/health/db`)
- **Access:** Public
- **HTTP Status:** `200 OK` (Database reachable) / `503 Service Unavailable`
- **Response Format:**
  ```json
  {
    "success": true,
    "database": {
      "status": "connected",
      "latencyMs": 12,
      "targetDatabase": "railway"
    },
    "timestamp": "2026-11-14T08:30:00.000Z"
  }
  ```

---

## 5. Automated Database Backup & Disaster Recovery Procedures

### 1. Running Automated Backup
HostelCare includes an integrated backup utility that exports table definitions, relational constraints, and record data into standard timestamped SQL archive files:

```bash
# Run backup utility against configured database:
node backend/database/backupDatabase.js
```

**Output:**
- Creates backup file in `backend/database/backups/hostelcare_backup_YYYY-MM-DDTHH-MM-SS.sql`.
- Exports all 8 tables in referential integrity order:
  1. `hostel_blocks`
  2. `users`
  3. `complaint_categories`
  4. `complaints`
  5. `complaint_assignments`
  6. `complaint_status_history`
  7. `complaint_attachments`
  8. `feedback`
- The `backups/` directory is strictly excluded from Git tracking via `.gitignore`.

### 2. Automated Scheduled Backups (Cron Job)
In production, schedule daily backups using a container cron job or external task runner:

```bash
# Daily backup at 02:00 AM UTC
0 2 * * * cd /app && node backend/database/backupDatabase.js >> /var/log/hostelcare_backup.log 2>&1
```

### 3. Disaster Recovery & Database Restoration
To restore a backup file to a fresh or recovered MySQL instance:

```bash
# Restoration via MySQL CLI:
mysql -h <HOST> -P <PORT> -u <USER> -p<PASSWORD> <DATABASE_NAME> < backend/database/backups/hostelcare_backup_YYYY-MM-DDTHH-MM-SS.sql
```

---

## 6. Rollback & Failover Procedures

If a newly deployed version introduces unexpected regressions:
1. **Instant Container Rollback (Railway)**:
   - Navigate to the **Deployments** tab.
   - Locate the previous successful deployment.
   - Click the options menu (`...`) $\rightarrow$ **Rollback to this deployment**.
   - Railway switches active traffic to the previous container image in under 10 seconds.
2. **Database Schema Rollback**:
   - If a breaking schema change was applied, restore the pre-deployment database dump using the disaster recovery procedure above.
3. **Environment Variable Rollback**:
   - Railway maintains variable history; revert any misconfigured environment keys in the **Variables** tab.

# MetricsEdu
> *"One Connected Platform. One Smart Classroom"*

**MetricsEdu** is a full-featured MERN (MongoDB, Express, React, Node.js) platform with **Tailwind CSS**, **JWT authentication**, and **Multi-Face Automated Vision Attendance** (via `@vladmandic/face-api` client-side neural networks and server-side 128D Euclidean vector matching), completely developed in pure JavaScript / Node.js with **zero Python dependency**.

---

## 🌟 New Features & Capabilities

1. **High-Definition Logo Branding**:
   - Crisp rendering of the emblem, rising graduation torch, and book icon with true logo palette (Midnight Deep Navy `#071b34`, Electric Cyan `#00a896`, Flame Green `#00C49F`).
2. **Institution-Isolated Seed Dataset**:
   - 200 students in every supported institute/diploma semester, school standard, and PUC year/department.
   - 30 teachers per institute/diploma branch and PUC department, plus 30 school teachers.
   - Separate admin accounts for institute, school, PUC, and diploma.
   - Student portraits and classroom photos use the local assets in `server/uploads`.
3. **Admin Timetable Management (Manual & Automated)**:
   - Weekly timetable view scoped by institution and cohort.
   - **⚡ 1-Click Auto-Generate Timetable**: Builds conflict-free lecture schedules for each division.
   - **Manual Slot Entry & Editing**: Custom subject, faculty, time slot, and lecture hall assignment.
   - Subjects keep the same title and code across divisions; teacher assignments and course records are division-specific.
4. **Student Division Allocations (Manual & Automated)**:
   - Students are assigned to Divisions A-D, 50 students per division in the seed dataset.
   - **⚡ 1-Click Auto-Splitter**: Allocates students while respecting the configured class strength.
   - **Manual Edit Mode**: Re-assign individual students anytime.
5. **Interactive Admin Deep-Linking**:
   - Clicking any dashboard KPI or card immediately opens its dedicated page (Timetable, Divisions, Teachers, Users, Calendar, or Attendance Audit).
6. **Smart Biometric Photo Visibility (Student Dashboard)**:
   - Once a student's photo is enrolled, the large upload card is hidden.
   - **Appears only if AI confidence drops below 40%**: Notifies the student with a high-priority alert to upload an updated clear photo.
7. **Strict Present / Absent Attendance**:
   - Removed 'Late' status completely.
   - Attendance reports exportable in **PDF**, **Excel (.xlsx)**, and **CSV** with attached daily classroom photos!
8. **Academic Calendar and Learning Posts**:
   - Admins schedule holidays, exams, and events visible to relevant students and teachers.
   - Calendar, announcements, and study materials have separate dashboard pages. Admin announcements reach both teachers and students; teachers can publish course-specific announcements, quizzes, and downloadable materials to their assigned classes.

---

## 🔑 Demo Credentials

All seed accounts use the password shown for their role.

| Institution | Role | Login Identifier | Password |
| :--- | :--- | :--- | :--- |
| Institute | Admin | `ADM-INST-001` | `adminpassword123` |
| Institute | Teacher | `TCH-101` | `teacherpassword123` |
| Institute | Student | `1MS22CS001` | `studentpassword123` |
| School | Admin | `ADM-SCH-001` | `adminpassword123` |
| School | Teacher | `TCH-SCH-01` | `teacherpassword123` |
| School | Student | `SCH-10-001` | `studentpassword123` |
| PU College | Admin | `ADM-PUC-001` | `adminpassword123` |
| PU College | Teacher | `TCH-PUC-SCI-01` | `teacherpassword123` |
| PU College | Student | `PUC-1PUC-S-001` | `studentpassword123` |
| Diploma | Admin | `ADM-DIP-001` | `adminpassword123` |
| Diploma | Teacher | `TCH-DIP-DCS-01` | `teacherpassword123` |
| Diploma | Student | `DIP-DCS-001` | `studentpassword123` |

## Deploy to Vercel

The repository includes Vercel routing for the React client and Express API. Before deployment:

1. Push the repository to GitHub and import it into Vercel using the repository root as the project root.
2. Create a hosted MongoDB database (for example, MongoDB Atlas) and set these Vercel environment variables for every required environment:
   - `MONGO_URI` — hosted MongoDB connection string.
   - `JWT_SECRET` — a newly generated, high-entropy signing secret.
   - `BLOB_READ_WRITE_TOKEN` — the Vercel Blob read/write token.
   - `ADMIN_REGISTRATION_CODE` — optional invitation code for admin registration (`ADMIN_SECRET_KEY` is accepted for legacy local configuration).
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS` — configure a production email provider for password reset.
3. Create a Vercel Blob store and attach its token to the project. Set `VITE_USE_VERCEL_BLOB=true` as a Vercel environment variable so the client uploads files directly to Blob instead of sending them through the serverless function. New classroom photos, student profile photos, and study materials are stored as public Blob URLs; local development continues to use `server/uploads`.
4. Deploy. Vercel builds `client` and routes `/api/*` to the Express function in `api/index.js`.

Vercel functions do not have persistent local storage. Do not copy the local `server/data/db` database or uploaded files into a deployment; migrate production data to hosted MongoDB and re-upload any assets that must persist. Never commit `.env` files.

The local `server/.env` was removed from Git tracking to prevent future deployments from bundling it. Because it was previously tracked, rotate its database credentials, JWT signing secret, and admin invitation secret before deploying; deleting a file does not erase it from prior Git history.

## Run Locally

Start the API from the `server` directory so it loads `server/.env` and the current routes:

```powershell
cd server
npm start
```

In a second terminal, start the client:

```powershell
cd client
npm run dev
```

After pulling backend route changes, restart the API process before refreshing the client.

## Local Development Dataset

The reset mode is deliberately limited to the loopback MongoDB database named `metricsedu`. It refuses production mode, remote hosts, and unexpected collections. It drops and recreates the app collections, so use it only when you intend to replace the local dataset.

```powershell
node server/reset_and_seed_local.js --dry-run
node server/reset_and_seed_local.js --confirm-reset
```

The seeded demo passwords, repeated local portrait images, and simulated attendance records are for local development only. Students must register their own face before biometric attendance is used; replace the demo credentials and records before any production use.

### Seed a new hosted MongoDB database

The same generator can seed the full demo dataset into a hosted database, but only when the target `metricsedu` database is empty. It never drops or overwrites remote collections. First allow your computer's current IP in MongoDB Atlas Network Access, and create a database/user with a strong password. The seeder accepts the Atlas driver URI with or without the `/metricsedu` path and URL-encodes special characters in the username/password. From PowerShell, run:

```powershell
$secureUri = Read-Host "Paste the rotated Atlas connection URI" -AsSecureString
$uriPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUri)
try {
  $env:MONGO_URI = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($uriPointer)
  node server/reset_and_seed_local.js --dry-run --confirm-seed-remote
  if ($LASTEXITCODE -ne 0) { throw "Dataset validation failed; no data was written." }
  node server/reset_and_seed_local.js --confirm-seed-remote
  if ($LASTEXITCODE -ne 0) { throw "Dataset seed failed; inspect the reported database error." }
} finally {
  Remove-Item Env:MONGO_URI -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($uriPointer)
}
```

The dataset includes 4 admins, 600 teachers (30 per department), 26,400 students (200 per cohort), courses, timetables, semester configurations, and demo attendance. Demo passwords are `adminpassword123`, `teacherpassword123`, and `studentpassword123`; change them immediately after seeding. The demo images point to local `/uploads` assets and are not automatically copied to Vercel Blob, so upload production images separately. Do not run `--confirm-reset` with a hosted URI.

## Admin Registration

Admin registration is available from the Register form and requires a server-side invitation code. Set `ADMIN_REGISTRATION_CODE` in `server/.env` before starting the API; do not put this value in client configuration or commit it. An invited admin joins the selected institution's existing tenant, so their access stays within that institution.

The admin Users page searches and paginates results on the server (50 users per page). PUC administrators can filter student records by 1st PUC or 2nd PUC.

Teacher rosters and student rosters can be filtered by department; PUC lists also support Science, Arts, and Commerce. Automatic division allocation distributes students as evenly as possible across the selected divisions. Teachers can switch between their assigned schedule and all timetables for their department.

Schedule Setup keeps each subject's title and code identical across divisions while saving its teacher assignment per division. Enter total teaching hours for the semester; generation converts that total using the configured semester dates and distributes classes across Monday–Saturday. Division letters are stored as course metadata and are not added to course codes or titles. Timetables can be downloaded as CSV or PDF.

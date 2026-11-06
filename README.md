# MetricsEdu
> *"One Connected Platform. One Smart Classroom"*

**MetricsEdu** is a full-featured MERN (MongoDB, Express, React, Node.js) platform with **Tailwind CSS**, **Passport.js Authentication**, and **Multi-Face Automated Vision Attendance** (via `@vladmandic/face-api` client-side neural networks and server-side 128D Euclidean vector matching), completely developed in pure JavaScript / Node.js with **zero Python dependency**.

---

## 🌟 New Features & Capabilities

1. **High-Definition Logo Branding**:
   - Crisp rendering of the emblem, rising graduation torch, and book icon with true logo palette (Midnight Deep Navy `#071b34`, Electric Cyan `#00a896`, Flame Green `#00C49F`).
2. **60 Students per Class & Realistic 60-Seat Classroom Photos**:
   - Seeded with 60 realistic students (`1MS22CS001` through `1MS22CS060`) with genuine portrait photographs.
   - High-resolution photographs of large 60-seat lecture halls for Division A and Division B.
   - Face detection and visual bounding box overlays scaled across lecture rows.
3. **Admin Timetable Management (Manual & Automated)**:
   - Weekly timetable view (Monday through Saturday, 9 AM to 4 PM).
   - **⚡ 1-Click Auto-Generate Timetable**: Builds conflict-free lecture schedules for each division.
   - **Manual Slot Entry & Editing**: Custom subject, faculty, time slot, and lecture hall assignment.
4. **Student Division Allocations (Manual & Automated)**:
   - Put students into Division A and Division B.
   - **⚡ 1-Click Auto-Splitter**: Divides 60 students into 50/50 batches.
   - **Manual Edit Mode**: Re-assign individual students anytime.
5. **Interactive Admin Deep-Linking**:
   - Clicking any dashboard KPI or card immediately opens its dedicated page (Timetable, Divisions, Teachers, Users, or Attendance Audit).
6. **Smart Biometric Photo Visibility (Student Dashboard)**:
   - Once a student's photo is enrolled, the large upload card is hidden.
   - **Appears only if AI confidence drops below 40%**: Notifies the student with a high-priority alert to upload an updated clear photo.
7. **Strict Present / Absent Attendance**:
   - Removed 'Late' status completely.
   - Attendance reports exportable in **PDF**, **Excel (.xlsx)**, and **CSV** with attached daily classroom photos!

---

## 🔑 Demo Credentials

| Role | Name | Login Identifier | Password | Key Portal Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | Super Admin | `ADM-2026-001` | `adminpassword123` | Timetables, Division Allocator, Faculty Mapping, Users |
| **Teacher** | Dr. Ramesh Sharma | `TCH-101` | `teacherpassword123` | 60-Student Classroom Vision Scanner, Daily History, PDF/Excel |
| **Student** | Aarav Patel | `1MS22CS001` | `studentpassword123` | Biometric Face Profile, 75% Attendance Alerts, Subject Logs |

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Export Attendance Session as Microsoft Excel (.xlsx) Sheet
 */
export function exportToExcel(session) {
  if (!session) return;

  const courseCode = session.course?.code || 'CS';
  const courseTitle = session.course?.title || 'Lecture Session';
  const teacherName = session.teacher?.name || 'Faculty Member';
  const dateStr = new Date(session.sessionDate).toLocaleDateString();
  const classroom = session.classroom || 'Smart Classroom';

  // 1. Header Information rows
  const worksheetData = [
    ['METRICSEDU - SMART CLASSROOM ATTENDANCE SYSTEM'],
    ['Tagline: "One Connected Platform. One Smart Classroom"'],
    [],
    ['Course Code:', courseCode, 'Subject Title:', courseTitle],
    ['Faculty / Lecturer:', teacherName, 'Classroom:', classroom],
    ['Lecture Date:', dateStr, 'Status:', 'Finalized Daily Record'],
    ['Total Enrolled:', session.totalEnrolled, 'Total Present:', session.totalPresent],
    ['Total Absent:', session.totalAbsent, 'Attendance Percentage:', `${session.attendancePercentage}%`],
    [],
    ['Sl No', 'USN', 'Student Name', 'Attendance Status', 'Vision Match Confidence', 'Manual Override']
  ];

  // 2. Student Rows
  (session.records || []).forEach((rec, idx) => {
    worksheetData.push([
      idx + 1,
      rec.usn,
      rec.name,
      rec.status, // 'Present' or 'Absent'
      `${rec.confidence || 0}%`,
      rec.isManuallyOverridden ? 'Yes' : 'No'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set column widths
  ws['!cols'] = [
    { wch: 8 },  // Sl No
    { wch: 16 }, // USN
    { wch: 28 }, // Name
    { wch: 18 }, // Status
    { wch: 24 }, // Confidence
    { wch: 18 }  // Override
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Attendance');

  const fileName = `Attendance_${courseCode}_${new Date(session.sessionDate).toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Export Attendance Session as High Quality PDF Document
 */
export function exportToPDF(session) {
  if (!session) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const courseCode = session.course?.code || 'CS';
  const courseTitle = session.course?.title || 'Academic Lecture';
  const teacherName = session.teacher?.name || 'Faculty';
  const dateStr = new Date(session.sessionDate).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const classroom = session.classroom || 'Smart Classroom';

  // 1. Header Banner (Brand Colors from Logo: Midnight Navy #0b2545)
  doc.setFillColor(11, 37, 69);
  doc.rect(0, 0, 595.28, 90, 'F');

  // Accent Teal Stripe from Logo (#00a896)
  doc.setFillColor(0, 168, 150);
  doc.rect(0, 87, 595.28, 5, 'F');

  // Title & Tagline
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('MetricsEdu', 40, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 230, 215);
  doc.text('One Connected Platform. One Smart Classroom', 40, 60);

  doc.setFontSize(9);
  doc.setTextColor(200, 220, 240);
  doc.text('Daily Biometric Facial Vision Attendance Record', 40, 75);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(`Date: ${dateStr}`, 420, 42);
  doc.setFontSize(9);
  doc.setTextColor(180, 210, 235);
  doc.text(`Room: ${classroom}`, 420, 60);

  // 2. Metadata Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(11, 37, 69);
  doc.text(`${courseCode}: ${courseTitle}`, 40, 120);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 90, 100);
  doc.text(`Faculty / Lecturer: ${teacherName}`, 40, 136);

  // Summary Stat Pills
  const statsY = 152;
  const statBoxWidth = 120;
  const statBoxHeight = 36;

  // Box 1: Enrolled
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(40, statsY, statBoxWidth, statBoxHeight, 4, 4, 'F');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL ENROLLED', 48, statsY + 14);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${session.totalEnrolled}`, 48, statsY + 30);

  // Box 2: Present
  doc.setFillColor(236, 253, 245);
  doc.roundedRect(170, statsY, statBoxWidth, statBoxHeight, 4, 4, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(5, 150, 105);
  doc.text('PRESENT (AI VISION)', 178, statsY + 14);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(4, 120, 87);
  doc.text(`${session.totalPresent}`, 178, statsY + 30);

  // Box 3: Absent
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(300, statsY, statBoxWidth, statBoxHeight, 4, 4, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(225, 29, 72);
  doc.text('ABSENT', 308, statsY + 14);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(190, 18, 60);
  doc.text(`${session.totalAbsent}`, 308, statsY + 30);

  // Box 4: Attendance Rate
  const isHealthy = session.attendancePercentage >= 75;
  doc.setFillColor(isHealthy ? 236 : 254, isHealthy ? 253 : 243, isHealthy ? 245 : 199);
  doc.roundedRect(430, statsY, statBoxWidth + 5, statBoxHeight, 4, 4, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(isHealthy ? 4 : 180, isHealthy ? 120 : 83, isHealthy ? 87 : 9);
  doc.text('ATTENDANCE RATE', 438, statsY + 14);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(isHealthy ? 4 : 180, isHealthy ? 120 : 83, isHealthy ? 87 : 9);
  doc.text(`${session.attendancePercentage}%`, 438, statsY + 30);

  // 3. Table of Students
  const tableData = (session.records || []).map((rec, i) => [
    i + 1,
    rec.usn,
    rec.name,
    rec.status,
    rec.status === 'Present' ? `${rec.confidence}%` : '—',
    rec.isManuallyOverridden ? 'Manual Override' : 'AI Detected'
  ]);

  autoTable(doc, {
    startY: statsY + 48,
    head: [['#', 'USN', 'Student Name', 'Status', 'Match Confidence', 'Verification Mode']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [11, 37, 69],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 5
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 80, fontStyle: 'bold' },
      2: { cellWidth: 160 },
      3: { cellWidth: 70, fontStyle: 'bold' },
      4: { cellWidth: 85 },
      5: { cellWidth: 95 }
    },
    didParseCell: (data) => {
      if (data.column.index === 3) {
        if (data.cell.raw === 'Present') {
          data.cell.styles.textColor = [5, 150, 105];
        } else {
          data.cell.styles.textColor = [225, 29, 72];
        }
      }
    }
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 150, 160);
    doc.text(
      `Generated by MetricsEdu - Automated Vision Attendance Platform • Page ${i} of ${pageCount}`,
      40,
      820
    );
  }

  const fileName = `Attendance_${courseCode}_${new Date(session.sessionDate).toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

/**
 * Export Attendance Session as CSV Document (Direct Client-Side Download)
 */
export function exportToCSV(session) {
  if (!session) return;

  const courseCode = session.course?.code || 'CS';
  const courseTitle = session.course?.title || 'Academic Lecture';
  const teacherName = session.teacher?.name || 'Faculty Member';
  const dateStr = new Date(session.sessionDate).toLocaleDateString();
  const classroom = session.classroom || 'Class Room: AS-11';
  const timeSlot = session.timeSlot || '08:30 AM - 09:25 AM';

  let csv = `METRICSEDU - SMART CLASSROOM ATTENDANCE SYSTEM\r\n`;
  csv += `Tagline: "One Connected Platform. One Smart Classroom"\r\n\r\n`;
  csv += `Course Code,${courseCode},Subject Title,"${courseTitle}"\r\n`;
  csv += `Faculty / Lecturer,"${teacherName}",Classroom,"${classroom}",Time Slot,"${timeSlot}"\r\n`;
  csv += `Lecture Date,${dateStr},Attendance Rate,${session.attendancePercentage || 0}%\r\n`;
  csv += `Total Enrolled,${session.totalEnrolled || 0},Total Present,${session.totalPresent || 0},Total Absent,${session.totalAbsent || 0}\r\n\r\n`;
  csv += `Sl No,USN / Roll No,Student Name,Attendance Status,Vision Match Confidence,Verification Mode\r\n`;

  (session.records || []).forEach((rec, idx) => {
    const usn = rec.usn || (rec.student?.usn) || 'N/A';
    const name = (rec.name || rec.student?.name || 'Student').replace(/"/g, '""');
    const status = rec.status || 'Absent';
    const conf = rec.confidence !== undefined ? `${rec.confidence}%` : (status === 'Present' ? '92%' : '0%');
    const mode = rec.isManuallyOverridden ? 'Manual Override' : 'AI Facial Vision';
    csv += `${idx + 1},${usn},"${name}",${status},${conf},${mode}\r\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const cleanDate = new Date(session.sessionDate).toISOString().slice(0, 10);
  link.setAttribute('download', `Attendance_${courseCode}_${cleanDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Universal Attendance Downloader (PDF, Excel, CSV)
 */
export function downloadAttendance(session, format = 'csv') {
  if (!session) return;
  switch (format.toLowerCase()) {
    case 'pdf':
      return exportToPDF(session);
    case 'excel':
    case 'xlsx':
      return exportToExcel(session);
    case 'csv':
    default:
      return exportToCSV(session);
  }
}

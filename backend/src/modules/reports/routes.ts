import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requirePermission } from '../../middleware/auth';
import { validateQuery, query } from '../../middleware/validate';
import { monthYearQuery } from '../../lib/schemas';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { addMinutesToTime, isoDate, monthName, monthRange, to12Hour } from '../../lib/time';
import { spreadsheetSafe } from '../../lib/sanitize';
import { getAutoclaveSettings } from '../settings/service';
import { listCleaning } from '../autoclave/service';

const router = Router();

function filename(name: string) {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_');
}

router.get(
  '/autoclave/excel',
  requirePermission('reports:read'),
  validateQuery(monthYearQuery),
  asyncHandler(async (_req, res) => {
    const { month, year } = query<z.infer<typeof monthYearQuery>>(res);
    const { start, end } = monthRange(year, month);
    const [logs, cleaning, settings] = await Promise.all([
      prisma.autoclaveLog.findMany({
        where: { logDate: { gte: start, lt: end } },
        include: { responsible: { select: { name: true } } },
        orderBy: [{ logDate: 'asc' }, { cycleLoadName: 'asc' }],
      }),
      listCleaning(month, year),
      getAutoclaveSettings(),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LabFlow';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Autoclave Log Book', { views: [{ state: 'frozen', xSplit: 0, ySplit: 6 }] });
    sheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Name of Cycle Load', key: 'cycle', width: 28 },
      { header: 'Autoclave Start Time', key: 'aStart', width: 20 },
      { header: 'Sterilization Start Time', key: 'sStart', width: 22 },
      { header: 'Temperature', key: 'temp', width: 14 },
      { header: 'Pressure', key: 'pressure', width: 14 },
      { header: 'End Time', key: 'end', width: 16 },
      { header: 'Cleaning (weekly)', key: 'cleaning', width: 22 },
      { header: 'Done By', key: 'doneBy', width: 24 },
    ];

    sheet.getRow(1).values = [`PETLAD MAHAL AROGYA MANDAL PHARMACY - Piplata`];
    sheet.getRow(2).values = [`Autoclave Log Book (Sterilization) - ${monthName(month)} ${year}`];
    sheet.getRow(3).values = [`Format No.: ${settings.documentFormatNo || '-'}`, `SOP Ref.: ${settings.documentSopReference || '-'}`, `Equipment No.: ${settings.equipmentNumber || '-'}`];
    sheet.getRow(4).values = [`Defaults: ${settings.autoclaveStartTime} / ${settings.sterilizationStartTime} / ${settings.temperature}°${settings.temperatureUnit} / ${settings.pressure} ${settings.pressureUnit} / ${settings.durationMinutes} min`];
    sheet.getRow(5).values = [`Notes: Draft/Pending/Verified statuses are not shown as approval signatures.`];
    sheet.mergeCells('A1:I1');
    sheet.mergeCells('A2:I2');
    sheet.mergeCells('A3:C3');
    sheet.mergeCells('D3:E3');
    sheet.mergeCells('F3:I3');
    sheet.addRow([]);
    const headerRow = sheet.getRow(7);
    headerRow.values = ['Date', 'Name of Cycle Load', 'Autoclave Start Time', 'Sterilization Start Time', 'Temperature', 'Pressure', 'End Time', 'Cleaning (weekly)', 'Done By'];
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F7F9' } };
    headerRow.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

    for (const log of logs) {
      const row = sheet.addRow([
        spreadsheetSafe(isoDate(log.logDate)),
        spreadsheetSafe(log.cycleLoadName),
        spreadsheetSafe(to12Hour(log.autoclaveStartTime)),
        spreadsheetSafe(to12Hour(log.sterilizationStartTime)),
        spreadsheetSafe(`${log.temperature}°${log.temperatureUnit}`),
        spreadsheetSafe(`${log.pressure} ${log.pressureUnit}`),
        spreadsheetSafe(to12Hour(log.endTime)),
        spreadsheetSafe(''),
        spreadsheetSafe(log.responsible?.name ?? ''),
      ]);
      row.getCell(1).numFmt = '@';
    }

    sheet.addRow([]);
    const cleanHeader = sheet.addRow(['Weekly Cleaning Schedule']);
    cleanHeader.font = { bold: true };
    sheet.addRow(['Scheduled Date', 'Status', 'Completed Date', 'Responsible', 'Remarks']);
    for (const c of cleaning) {
      sheet.addRow([
        spreadsheetSafe(isoDate(c.scheduledDate)),
        spreadsheetSafe(c.status),
        spreadsheetSafe(c.completedAt ? isoDate(c.completedAt) : ''),
        spreadsheetSafe(c.responsibleUser?.name ?? ''),
        spreadsheetSafe(c.remarks ?? ''),
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename(`Autoclave_Log_${monthName(month)}_${year}.xlsx`)}"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }),
);

router.get(
  '/autoclave/pdf',
  requirePermission('reports:read'),
  validateQuery(monthYearQuery),
  asyncHandler(async (_req, res) => {
    const { month, year } = query<z.infer<typeof monthYearQuery>>(res);
    const { start, end } = monthRange(year, month);
    const [logs, cleaning, settings] = await Promise.all([
      prisma.autoclaveLog.findMany({
        where: { logDate: { gte: start, lt: end } },
        include: { responsible: { select: { name: true } } },
        orderBy: [{ logDate: 'asc' }, { cycleLoadName: 'asc' }],
      }),
      listCleaning(month, year),
      getAutoclaveSettings(),
    ]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename(`Autoclave_Log_${monthName(month)}_${year}.pdf`)}"`,
    );
    res.setHeader('Cache-Control', 'no-store');

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    doc.pipe(res);

    doc.fontSize(12).text('PETLAD MAHAL AROGYA MANDAL PHARMACY', { align: 'center' });
    doc.fontSize(11).text('Piplata', { align: 'center' });
    doc.fontSize(10).text(`Autoclave Log Book (Sterilization) - ${monthName(month)} ${year}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(8).text(
      `Format No.: ${settings.documentFormatNo || '-'}   SOP Ref.: ${settings.documentSopReference || '-'}   Equipment No.: ${settings.equipmentNumber || '-'}`,
    );
    doc.text(`Defaults: ${settings.autoclaveStartTime} / ${settings.sterilizationStartTime} / ${settings.temperature}°${settings.temperatureUnit} / ${settings.pressure} ${settings.pressureUnit} / ${settings.durationMinutes} min`);
    doc.text('Status: Draft/Pending Verification/Verified — not to be read as approval signatures.');
    doc.moveDown(0.5);

    const headers = ['Date', 'Cycle Load', 'Auto Start', 'Ster Start', 'Temp', 'Press', 'End', 'Done By'];
    const widths = [60, 150, 55, 55, 40, 40, 50, 80];
    let x = 36;
    doc.fontSize(7).font('Helvetica-Bold');
    for (let i = 0; i < headers.length; i += 1) {
      doc.text(headers[i], x, doc.y, { width: widths[i], align: 'left' });
      x += widths[i];
    }
    doc.moveDown();
    doc.font('Helvetica').fontSize(7);
    for (const log of logs) {
      if (doc.y > 520) doc.addPage();
      x = 36;
      const row = [isoDate(log.logDate), log.cycleLoadName, to12Hour(log.autoclaveStartTime), to12Hour(log.sterilizationStartTime), `${log.temperature}°${log.temperatureUnit}`, `${log.pressure} ${log.pressureUnit}`, to12Hour(log.endTime), log.responsible?.name ?? ''];
      for (let i = 0; i < row.length; i += 1) {
        doc.text(String(row[i]).slice(0, 60), x, doc.y, { width: widths[i] });
        x += widths[i];
      }
      doc.moveDown(0.4);
    }

    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(9).text('Weekly Cleaning Schedule');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(7).text('Scheduled | Status | Completed | Responsible | Remarks');
    for (const c of cleaning) {
      doc.text(
        `${isoDate(c.scheduledDate)} | ${c.status} | ${c.completedAt ? isoDate(c.completedAt) : '-'} | ${c.responsibleUser?.name ?? '-'} | ${c.remarks ?? ''}`,
      );
    }
    doc.fontSize(7).text(`Page ${doc.bufferedPageRange().count}`, 36, doc.page.height - 30, { align: 'left' });

    doc.end();
  }),
);

router.get(
  '/monthly/excel',
  requirePermission('reports:read'),
  validateQuery(monthYearQuery),
  asyncHandler(async (_req, res) => {
    const { month, year } = query<z.infer<typeof monthYearQuery>>(res);
    const { start, end } = monthRange(year, month);
    const samples = await prisma.sample.findMany({
      where: { registrationDate: { gte: start, lt: end } },
      orderBy: [{ registrationDate: 'asc' }, { sampleName: 'asc' }],
      include: { import: { select: { filename: true } } },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Monthly Samples');
    sheet.columns = [
      { header: 'Registration Date', key: 'date', width: 16 },
      { header: 'Sample Identifier', key: 'id', width: 22 },
      { header: 'Sample Name', key: 'name', width: 40 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Import', key: 'import', width: 30 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const s of samples) {
      sheet.addRow([
        spreadsheetSafe(isoDate(s.registrationDate)),
        spreadsheetSafe(s.sampleIdentifier ?? ''),
        spreadsheetSafe(s.sampleName),
        spreadsheetSafe(s.sampleCategory),
        spreadsheetSafe(s.import.filename),
      ]);
    }

    const daily = new Map<string, number>();
    for (const s of samples) daily.set(isoDate(s.registrationDate), (daily.get(isoDate(s.registrationDate)) ?? 0) + 1);
    sheet.addRow([]);
    sheet.addRow(['Daily counts']).font = { bold: true };
    for (const [date, count] of [...daily.entries()].sort()) {
      sheet.addRow([spreadsheetSafe(date), spreadsheetSafe(count)]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename(`Monthly_Lab_Report_${monthName(month)}_${year}.xlsx`)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }),
);

router.get(
  '/monthly/pdf',
  requirePermission('reports:read'),
  validateQuery(monthYearQuery),
  asyncHandler(async (_req, res) => {
    const { month, year } = query<z.infer<typeof monthYearQuery>>(res);
    const { start, end } = monthRange(year, month);
    const samples = await prisma.sample.findMany({
      where: { registrationDate: { gte: start, lt: end } },
      orderBy: [{ registrationDate: 'asc' }, { sampleName: 'asc' }],
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename(`Monthly_Lab_Report_${monthName(month)}_${year}.pdf`)}"`);
    res.setHeader('Cache-Control', 'no-store');

    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    doc.pipe(res);
    doc.fontSize(12).text(`Monthly Lab Report - ${monthName(month)} ${year}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(9).text(`Total registered samples: ${samples.length}`);
    doc.moveDown();
    doc.fontSize(8);
    for (const s of samples.slice(0, 500)) {
      if (doc.y > 740) doc.addPage();
      doc.text(`${isoDate(s.registrationDate)} | ${s.sampleIdentifier || '-'} | ${s.sampleName.slice(0, 80)} | ${s.sampleCategory}`);
    }
    if (samples.length > 500) doc.text(`... and ${samples.length - 500} more rows (see Excel export)`);
    doc.end();
  }),
);

export default router;

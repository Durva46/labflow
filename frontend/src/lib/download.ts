export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function suggestFilenameFromTemplate(
  kind: 'autoclave' | 'monthly',
  format: 'xlsx' | 'pdf',
  month: number,
  year: number,
): string {
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const name = monthNames[month - 1] ?? '';
  if (kind === 'autoclave') {
    return `Autoclave_Log_${name}_${year}.${format}`;
  }
  return `Monthly_Lab_Report_${name}_${year}.${format}`;
}

// Shared API types. These mirror docs/API.md. Do not invent fields that the
// contract does not expose.

export type Role = 'ADMIN' | 'LAB_MANAGER' | 'LAB_STAFF';
export type SampleCategory = 'WATER' | 'NON_WATER' | 'UNKNOWN';
export type VerificationStatus = 'DRAFT' | 'PENDING_VERIFICATION' | 'VERIFIED';
export type MediaStatus = 'DRAFT' | 'RECORDED';
export type CleaningStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE';

export interface ApiEnvelope<T> {
  data: T;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiListEnvelope<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface AuthMe {
  user: User;
  permissions: unknown;
}

export interface ImportRecord {
  id: string;
  filename: string;
  fileHash: string;
  reportingMonth: number;
  reportingYear: number;
  status: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  uploadedBy: { id: string; name: string } | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ImportPreview {
  headers: string[];
  detectedMapping: ColumnMapping | null;
  categories: { water: number; nonWater: number; unknown: number };
  dailyCounts: { date: string; total: number }[];
}

export interface ImportRowError {
  rowNumber: number;
  message: string;
}

export interface ImportResult extends ImportRecord {
  preview?: ImportPreview;
  errors?: ImportRowError[];
}

export interface Sample {
  id: string;
  sampleIdentifier: string;
  sampleName: string;
  registrationDate: string;
  sampleCategory: SampleCategory;
  importId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailySummaryDay {
  date: string;
  total: number;
  water: number;
  nonWater: number;
  unknown: number;
}

export interface DailySummary {
  days: DailySummaryDay[];
  totals: { total: number; water: number; nonWater: number; unknown: number };
}

export interface MediaPreparation {
  id: string;
  sampleId: string | null;
  sampleName: string | null;
  sampleIdentifier: string | null;
  preparationDate: string;
  mediaType: string;
  batchNo: string | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  status: MediaStatus;
  createdBy: { id: string; name: string } | string | null;
  updatedBy: { id: string; name: string } | string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutoclaveLog {
  id: string;
  logDate: string;
  cycleLoadName: string;
  sampleId: string | null;
  autoclaveStartTime: string;
  sterilizationStartTime: string;
  temperature: number | null;
  temperatureUnit: string;
  pressure: number | null;
  pressureUnit: string;
  sterilizationDurationMinutes: number | null;
  endTime: string;
  endTimeOverridden: boolean;
  verificationStatus: VerificationStatus;
  responsibleUser: { id: string; name: string } | null;
  responsibleUserId: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutoclaveSettings {
  id: string;
  labName: string;
  labAddress: string;
  documentFormatNo: string;
  documentSopReference: string;
  equipmentNumber: string;
  autoclaveStartTime: string;
  sterilizationStartTime: string;
  temperature: number;
  temperatureUnit: string;
  pressure: number;
  pressureUnit: string;
  durationMinutes: number;
  cleaningAnchorDate: string;
  cleaningFirstIntervalDays: number;
  cleaningIntervalDays: number;
  groupingRule: string;
  updatedAt: string;
}

export interface CleaningRecord {
  id: string;
  scheduledDate: string;
  completedAt: string | null;
  status: CleaningStatus;
  responsibleUser: { id: string; name: string } | string | null;
  remarks: string | null;
}

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  createdAt: string;
}

export interface DashboardData {
  reportingMonth: number;
  reportingYear: number;
  importStatus: { state: string; import: ImportRecord | null };
  samples: { total: number; water: number; nonWater: number; unknown: number };
  media: { total: number; draft: number; recorded: number };
  autoclave: {
    total: number;
    draft: number;
    pendingVerification: number;
    verified: number;
  };
  cleaning: {
    scheduled: number;
    completed: number;
    pending: number;
    overdue: number;
    nextDue: string | null;
    items: CleaningRecord[];
  };
  recentActivity: ActivityItem[];
}

export interface ColumnMapping {
  sampleIdentifier: string;
  sampleName: string;
  registrationDate: string;
  sampleCategory: string;
}

export interface ClassificationRule {
  match: string;
  category: 'WATER' | 'NON_WATER';
}

export interface LabSettings {
  labName: string;
  labAddress: string;
  documentFormatNo: string;
  documentSopReference: string;
  equipmentNumber: string;
  columnMapping: ColumnMapping;
  classificationRules: ClassificationRule[];
  retentionDays: number;
}

export interface GenerateResult {
  created: number;
  skipped: number;
  groupingRule?: string;
}

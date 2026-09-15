
export enum AppLanguage {
  CN = 'zh-CN',
  EN = 'en-US',
  LAO = 'lo-LA'
}

export enum TranslationMode {
  ALL = 'all',       // 全文档连续自动流水线 (全86页分批)
  RANGE = 'range',   // 指定页码区间 (如 1-4, 5-10, 14, 34-36)
}

export interface TranslationState {
  isProcessing: boolean;
  sourceFiles: string[]; // Base64 strings
  translatedMarkdown: string;
  error: string | null;
  originalFileName: string | null;
  totalPages: number;
  currentBatchStart: number;
  currentBatchEnd: number;
  progressPercent: number;
  statusMessage: string;
}

export interface UIContent {
  title: string;
  upload: string;
  startExecution: string;
  stop: string;
  reset: string;
  saveToDrive: string;
  downloadMd: string;
  downloadWord: string;
  errorTitle: string;
  retry: string;
  dropzoneText: string;
  processingText: string;
  translateAll: string;
  translateRange: string;
  pageRangeTitle: string;
  batchSizeLabel: string;
  fileInfoPages: string;
}

export type I18nData = Record<AppLanguage, UIContent>;


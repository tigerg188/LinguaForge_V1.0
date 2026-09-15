import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload as UploadIcon, 
  Play as PlayIcon, 
  Square as StopIcon, 
  RotateCcw as ResetIcon, 
  Download as DownloadIcon, 
  FileText as WordIcon,
  Cloud as DriveIcon, 
  Globe as GlobeIcon, 
  AlertTriangle as ErrorIcon,
  Loader2 as SpinnerIcon,
  Layers as LayersIcon,
  BookOpen as BookIcon,
  CheckCircle2 as CheckIcon,
  ListFilter as FilterIcon,
  FileCheck2 as FileCheckIcon
} from 'lucide-react';
import { AppLanguage, TranslationState, TranslationMode } from './types';
import { I18N, GEMINI_MODEL } from './constants';
import { translatePage } from './services/geminiService';
import { fileToBase64, downloadMarkdown, downloadDocx } from './utils/fileUtils';
import { getPDFPageCount, extractPDFPageRange } from './utils/pdfUtils';
import MarkdownViewer from './components/MarkdownViewer';

const PRESET_RANGES = [
  { label: "1-3 页 (1625号通知主文)", start: 1, end: 3 },
  { label: "4-13 页 (1431号总则与标准)", start: 4, end: 13 },
  { label: "14-18 页 (逆变器/电缆规格表)", start: 14, end: 18 },
  { label: "19-24 页 (断路器/防孤岛/罚则)", start: 19, end: 24 },
  { label: "25-32 页 (申请表与流程图)", start: 25, end: 32 },
  { label: "33-36 页 (单线图/系统拓扑图)", start: 33, end: 36 },
  { label: "37-45 页 (验收测试表单)", start: 37, end: 45 },
  { label: "46-57 页 (设备数据采集表)", start: 46, end: 57 },
  { label: "58-67 页 (标准购电合同文本)", start: 58, end: 67 },
  { label: "68 页 (能矿部2188号通知)", start: 68, end: 68 },
  { label: "69-79 页 (2585号技术规程)", start: 69, end: 79 },
  { label: "80-86 页 (3161号购电决定)", start: 80, end: 86 }
];

const App: React.FC = () => {
  const [lang, setLang] = useState<AppLanguage>(AppLanguage.CN);
  const [state, setState] = useState<TranslationState>({
    isProcessing: false,
    sourceFiles: [],
    translatedMarkdown: "",
    error: null,
    originalFileName: null,
    totalPages: 1,
    currentBatchStart: 0,
    currentBatchEnd: 0,
    progressPercent: 0,
    statusMessage: "",
  });

  const [isExportingWord, setIsExportingWord] = useState(false);
  const [translationMode, setTranslationMode] = useState<TranslationMode>(TranslationMode.ALL);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(3);
  const [batchSize, setBatchSize] = useState<number>(2); // 2 pages per batch is optimal for complex tables & diagrams
  const [appendMode, setAppendMode] = useState<boolean>(true);

  const rawPdfBytesRef = useRef<Uint8Array | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ui = I18N[lang];

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('laoDocLang') as AppLanguage;
      if (savedLang && Object.values(AppLanguage).includes(savedLang)) {
        setLang(savedLang);
      } else {
        const browserLang = navigator.language || '';
        if (browserLang.includes('lo')) setLang(AppLanguage.LAO);
        else if (browserLang.includes('en')) setLang(AppLanguage.EN);
      }
    } catch {
      // In sandboxed iframes or private modes, localStorage might throw SecurityError
    }
  }, []);

  const handleLangChange = (newLang: AppLanguage) => {
    setLang(newLang);
    try {
      localStorage.setItem('laoDocLang', newLang);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  };

  const resetAll = () => {
    abortControllerRef.current?.abort();
    rawPdfBytesRef.current = null;
    setState({
      isProcessing: false,
      sourceFiles: [],
      translatedMarkdown: "",
      error: null,
      originalFileName: null,
      totalPages: 1,
      currentBatchStart: 0,
      currentBatchEnd: 0,
      progressPercent: 0,
      statusMessage: "",
    });
  };

  const stopTranslation = () => {
    abortControllerRef.current?.abort();
    setState(prev => ({ 
      ...prev, 
      isProcessing: false,
      statusMessage: "用户已暂停/停止翻译进程，已完成内容已保存。"
    }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    resetAll();
    const isPDF = file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');

    try {
      if (isPDF) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        rawPdfBytesRef.current = bytes;
        const pages = await getPDFPageCount(bytes);

        setRangeStart(1);
        setRangeEnd(Math.min(pages, 3));

        setState(prev => ({
          ...prev,
          sourceFiles: ['PDF_LOADED'],
          originalFileName: file.name,
          totalPages: pages,
          statusMessage: `已就绪：检测到 ${file.name}，共 ${pages} 页`,
        }));
      } else {
        const base64 = await fileToBase64(file);
        rawPdfBytesRef.current = null;
        setState(prev => ({
          ...prev,
          sourceFiles: [base64],
          originalFileName: file.name,
          totalPages: 1,
          statusMessage: `已就绪：图像文件 ${file.name}`,
        }));
      }
    } catch (err: any) {
      setState(prev => ({ 
        ...prev, 
        error: err.message || "无法读取上传的文件，请确保文件未损坏。" 
      }));
    }
  };

  const executeTranslationPipeline = async (startPage: number, endPage: number, stepSize: number, append: boolean) => {
    if (state.sourceFiles.length === 0 || state.isProcessing) return;

    abortControllerRef.current = new AbortController();
    const isPDF = rawPdfBytesRef.current !== null;

    setState(prev => ({
      ...prev,
      isProcessing: true,
      translatedMarkdown: append ? prev.translatedMarkdown : "",
      error: null,
      progressPercent: 0,
      statusMessage: isPDF 
        ? `开始执行分页流水线 (第 ${startPage} 页 至 第 ${endPage} 页 / 共 ${state.totalPages} 页)...`
        : `正在翻译图像文档...`
    }));

    try {
      if (!isPDF) {
        // Single image translation
        const base64 = state.sourceFiles[0];
        await translatePage(
          base64,
          'image/jpeg',
          (chunk) => {
            setState(prev => ({
              ...prev,
              translatedMarkdown: prev.translatedMarkdown + chunk
            }));
          },
          abortControllerRef.current.signal
        );

        setState(prev => ({
          ...prev,
          isProcessing: false,
          progressPercent: 100,
          statusMessage: "翻译已全部完成！"
        }));
        return;
      }

      // Multi-page PDF pipeline
      const totalPagesInJob = endPage - startPage + 1;
      let pagesCompleted = 0;

      for (let currStart = startPage; currStart <= endPage; currStart += stepSize) {
        if (abortControllerRef.current.signal.aborted) break;

        const currEnd = Math.min(currStart + stepSize - 1, endPage);
        const batchPercent = Math.round((pagesCompleted / totalPagesInJob) * 100);

        setState(prev => ({
          ...prev,
          currentBatchStart: currStart,
          currentBatchEnd: currEnd,
          progressPercent: batchPercent,
          statusMessage: `正在处理 第 ${currStart}${currEnd > currStart ? `-${currEnd}` : ''} 页 / 共 ${state.totalPages} 页 (${batchPercent}%)...`
        }));

        // Extract sub-PDF for current batch
        const slice = await extractPDFPageRange(rawPdfBytesRef.current!, currStart, currEnd);
        
        // Add divider banner in markdown
        const pageHeader = `\n\n---\n\n### 📄 第 ${currStart}${currEnd > currStart ? `-${currEnd}` : ''} 页 / 共 ${state.totalPages} 页\n\n`;
        setState(prev => ({
          ...prev,
          translatedMarkdown: prev.translatedMarkdown + pageHeader
        }));

        // Send slice to Gemini
        await translatePage(
          slice.base64,
          'application/pdf',
          (chunk) => {
            setState(prev => ({
              ...prev,
              translatedMarkdown: prev.translatedMarkdown + chunk
            }));
          },
          abortControllerRef.current.signal,
          {
            startPage: currStart,
            endPage: currEnd,
            totalPages: state.totalPages
          }
        );

        pagesCompleted += (currEnd - currStart + 1);
        const newPercent = Math.min(100, Math.round((pagesCompleted / totalPagesInJob) * 100));

        setState(prev => ({
          ...prev,
          progressPercent: newPercent,
          statusMessage: `第 ${currStart}${currEnd > currStart ? `-${currEnd}` : ''} 页已完成，准备处理下一批次...`
        }));

        // Brief breather to avoid hitting immediate rate thresholds
        if (currEnd < endPage) {
          await new Promise(res => setTimeout(res, 800));
        }
      }

      if (!abortControllerRef.current.signal.aborted) {
        setState(prev => ({
          ...prev,
          isProcessing: false,
          progressPercent: 100,
          statusMessage: `翻译流水线已顺利完成！共处理 ${totalPagesInJob} 页。`
        }));
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setState(prev => ({
          ...prev,
          error: err.message || "翻译处理发生异常，请检查网络后点击重试当前批次。",
          isProcessing: false,
          statusMessage: "处理中断，已保存前面所有已完成的页码内容。"
        }));
      }
    }
  };

  const handleStartAll = () => {
    executeTranslationPipeline(1, state.totalPages, batchSize, false);
  };

  const handleStartRange = () => {
    const s = Math.max(1, Math.min(rangeStart, state.totalPages));
    const e = Math.max(s, Math.min(rangeEnd, state.totalPages));
    executeTranslationPipeline(s, e, batchSize, appendMode);
  };

  const handleResumeCurrentBatch = () => {
    if (state.currentBatchStart > 0) {
      executeTranslationPipeline(state.currentBatchStart, state.totalPages, batchSize, true);
    } else {
      handleStartAll();
    }
  };

  const saveToGoogleDrive = () => {
    setState(prev => ({ ...prev, error: "保存至 Google Drive 功能需要配置 Google Workspace API 权限。" }));
  };

  const handleDownload = () => {
    const name = state.originalFileName ? state.originalFileName.split('.')[0] : 'document';
    downloadMarkdown(state.translatedMarkdown, `${name}-中译稿.md`);
  };

  const handleDownloadWord = async () => {
    if (!state.translatedMarkdown || isExportingWord) return;
    try {
      setIsExportingWord(true);
      const name = state.originalFileName ? state.originalFileName.split('.')[0] : 'document';
      await downloadDocx(state.translatedMarkdown, `${name}-中译稿.docx`);
    } catch (err: any) {
      console.error("Failed to generate docx:", err);
      setState(prev => ({ ...prev, error: "Word 文档生成失败: " + (err?.message || "未知错误") }));
    } finally {
      setIsExportingWord(false);
    }
  };

  const isPDF = rawPdfBytesRef.current !== null || (state.originalFileName?.toLowerCase().endsWith('.pdf') ?? false);

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] overflow-hidden text-slate-900 font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-[#0F172A] text-white shadow-xl px-6 py-3.5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg transform rotate-2">
            <span className="text-lg font-black italic">L</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
                {ui.title}
              </h1>
              <span className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Multi-Page Pipeline
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium tracking-wide">
              支持超长多页 PDF 批量分片、单线图拓扑转写、表格 1:1 版式复现
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-800/80 rounded-full px-3.5 py-1.5 border border-slate-700">
            <GlobeIcon className="w-3.5 h-3.5 text-slate-300" />
            <select 
              value={lang} 
              onChange={(e) => handleLangChange(e.target.value as AppLanguage)}
              className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer ml-2 outline-none uppercase text-slate-200"
            >
              <option value={AppLanguage.CN} className="text-black">中文 (CN)</option>
              <option value={AppLanguage.EN} className="text-black">English (EN)</option>
              <option value={AppLanguage.LAO} className="text-black">ລາວ (LO)</option>
            </select>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-[1px_0_10px_rgba(0,0,0,0.03)] z-10 overflow-y-auto">
          <div className="p-5 space-y-5">
            {/* Upload Section */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">文档上传</h3>
                {state.originalFileName && (
                  <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100 flex items-center gap-1">
                    <FileCheckIcon className="w-3 h-3" /> 已载入
                  </span>
                )}
              </div>
              <label className="group relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl hover:border-teal-500 hover:bg-teal-50/30 transition-all cursor-pointer shadow-sm">
                <div className="flex flex-col items-center justify-center pt-3 pb-4 text-center px-4">
                  <div className="mb-2 text-slate-400 group-hover:text-teal-500 transition-colors transform group-hover:scale-110 duration-200">
                    <UploadIcon className="w-6 h-6" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-600 group-hover:text-teal-700 leading-tight">
                    {state.originalFileName ? state.originalFileName : ui.dropzoneText}
                  </p>
                  <p className="text-[9px] text-slate-400 mt-1">支持 80+ 页超长 PDF / 扫描公文</p>
                </div>
                <input type="file" className="hidden" accept="application/pdf,image/*" onChange={handleFileUpload} />
              </label>

              {state.sourceFiles.length > 0 && isPDF && (
                <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-[11px] font-medium">文档规模：</span>
                    <span className="font-extrabold text-teal-700 bg-teal-100/60 px-2 py-0.5 rounded-md">
                      共 {state.totalPages} 页
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">文件名称：</span>
                    <span className="font-semibold text-slate-700 truncate max-w-[150px]" title={state.originalFileName || ''}>
                      {state.originalFileName}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* Translation Mode & Settings */}
            {state.sourceFiles.length > 0 && isPDF && (
              <section className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">翻译模式</h3>
                  <span className="text-[10px] text-slate-400 font-mono">分片预算: 8192 tok</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTranslationMode(TranslationMode.ALL)}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      translationMode === TranslationMode.ALL
                        ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <LayersIcon className="w-3.5 h-3.5" />
                    <span>连续全本流水线</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTranslationMode(TranslationMode.RANGE)}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      translationMode === TranslationMode.RANGE
                        ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FilterIcon className="w-3.5 h-3.5" />
                    <span>指定页码翻译</span>
                  </button>
                </div>

                {/* Batch Size Selection */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-bold">{ui.batchSizeLabel}：</span>
                    <select
                      value={batchSize}
                      onChange={(e) => setBatchSize(Number(e.target.value))}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 outline-none"
                    >
                      <option value={1}>1 页 / 批（最高精细度）</option>
                      <option value={2}>2 页 / 批（推荐，防截断）</option>
                      <option value={3}>3 页 / 批（适合纯文字章）</option>
                      <option value={4}>4 页 / 批（高速）</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    将 86 页文档按批次切片，彻底消除 4 页截断问题，图表与单线图完整展开。
                  </p>
                </div>

                {/* Range Controls */}
                {translationMode === TranslationMode.RANGE && (
                  <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-200/60 space-y-2 text-xs">
                    <div className="font-bold text-teal-900 text-[11px] flex items-center justify-between">
                      <span>{ui.pageRangeTitle}</span>
                      <span className="text-teal-600 font-mono">1 ~ {state.totalPages} 页</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-1 bg-white px-2 py-1.5 rounded-lg border border-teal-200">
                        <span className="text-[10px] text-slate-400">从</span>
                        <input
                          type="number"
                          min={1}
                          max={state.totalPages}
                          value={rangeStart}
                          onChange={(e) => setRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full text-center font-bold text-slate-800 outline-none"
                        />
                        <span className="text-[10px] text-slate-400">页</span>
                      </div>
                      <span className="text-slate-400 font-bold">-</span>
                      <div className="flex-1 flex items-center gap-1 bg-white px-2 py-1.5 rounded-lg border border-teal-200">
                        <span className="text-[10px] text-slate-400">至</span>
                        <input
                          type="number"
                          min={1}
                          max={state.totalPages}
                          value={rangeEnd}
                          onChange={(e) => setRangeEnd(Math.min(state.totalPages, parseInt(e.target.value) || 1))}
                          className="w-full text-center font-bold text-slate-800 outline-none"
                        />
                        <span className="text-[10px] text-slate-400">页</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 text-[11px]">
                      <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={appendMode}
                          onChange={(e) => setAppendMode(e.target.checked)}
                          className="rounded border-teal-400 text-teal-600 focus:ring-0 cursor-pointer"
                        />
                        <span>追加到现有译文后面</span>
                      </label>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="pt-2 border-t border-teal-100">
                      <span className="text-[10px] text-teal-800 font-bold block mb-1.5">快捷章节选择：</span>
                      <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto pr-1 text-[10px]">
                        {PRESET_RANGES.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setRangeStart(preset.start);
                              setRangeEnd(Math.min(preset.end, state.totalPages));
                            }}
                            className="text-left px-2 py-1 rounded bg-white hover:bg-teal-100/70 border border-teal-100 text-slate-700 truncate transition-colors cursor-pointer"
                            title={preset.label}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Execution Controls */}
            <section className="space-y-2.5 pt-2 border-t border-slate-100">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">执行控制</h3>
              
              {translationMode === TranslationMode.ALL ? (
                <button 
                  onClick={handleStartAll}
                  disabled={state.sourceFiles.length === 0 || state.isProcessing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-40 shadow-lg shadow-emerald-600/20 transition-all text-xs cursor-pointer disabled:cursor-not-allowed"
                >
                  <PlayIcon className="w-4 h-4 fill-current" />
                  <span>连续批量翻译全部 (共 {state.totalPages} 页)</span>
                </button>
              ) : (
                <button 
                  onClick={handleStartRange}
                  disabled={state.sourceFiles.length === 0 || state.isProcessing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 disabled:opacity-40 shadow-lg shadow-teal-600/20 transition-all text-xs cursor-pointer disabled:cursor-not-allowed"
                >
                  <PlayIcon className="w-4 h-4 fill-current" />
                  <span>翻译指定页码 (第 {rangeStart} - {rangeEnd} 页)</span>
                </button>
              )}

              {state.isProcessing && (
                <button 
                  onClick={stopTranslation}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl font-bold hover:bg-rose-100 transition-all text-xs border border-rose-200 cursor-pointer shadow-sm"
                >
                  <StopIcon className="w-4 h-4 fill-current" />
                  <span>暂停 / 停止流水线</span>
                </button>
              )}

              {state.error && state.currentBatchStart > 0 && !state.isProcessing && (
                <button 
                  onClick={handleResumeCurrentBatch}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-all text-xs shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  <PlayIcon className="w-3.5 h-3.5 fill-current" />
                  <span>从中断处继续 (第 {state.currentBatchStart} 页)</span>
                </button>
              )}

              <button 
                onClick={resetAll}
                disabled={state.isProcessing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 disabled:opacity-40 transition-all text-xs cursor-pointer disabled:cursor-not-allowed"
              >
                <ResetIcon className="w-3.5 h-3.5" />
                <span>清空与重置</span>
              </button>
            </section>

            {/* Progress Display */}
            {(state.isProcessing || state.progressPercent > 0) && (
              <section className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">翻译总体进度</span>
                  <span className="font-extrabold text-teal-600 font-mono">{state.progressPercent}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300 rounded-full"
                    style={{ width: `${state.progressPercent}%` }}
                  ></div>
                </div>
                {state.statusMessage && (
                  <p className="text-[10px] text-slate-500 leading-tight break-words">
                    {state.statusMessage}
                  </p>
                )}
              </section>
            )}

            {/* Export Section */}
            <section className="space-y-2.5 pt-2 border-t border-slate-100">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">导出选项</h3>
              <button 
                onClick={handleDownloadWord}
                disabled={!state.translatedMarkdown || isExportingWord}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-40 shadow-md shadow-blue-600/20 transition-all text-xs cursor-pointer disabled:cursor-not-allowed"
                title="导出为 Microsoft Word (.docx) 文档"
              >
                {isExportingWord ? (
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <WordIcon className="w-4 h-4" />
                )}
                <span>{isExportingWord ? "正在生成 Word..." : ui.downloadWord}</span>
              </button>
              <button 
                onClick={handleDownload}
                disabled={!state.translatedMarkdown}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 disabled:opacity-40 shadow-md shadow-teal-600/20 transition-all text-xs cursor-pointer disabled:cursor-not-allowed"
                title="导出为 Markdown (.md) 文件"
              >
                <DownloadIcon className="w-4 h-4" />
                <span>{ui.downloadMd}</span>
              </button>
            </section>
          </div>

          <div className="mt-auto p-4 bg-slate-50 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${state.isProcessing ? 'bg-amber-400 animate-pulse' : (state.sourceFiles.length > 0 ? 'bg-emerald-500' : 'bg-slate-300')}`}></div>
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">
                {state.isProcessing ? '流水线处理中' : (state.sourceFiles.length > 0 ? `已装载 ${state.totalPages} 页` : '待机就绪')}
              </p>
            </div>
            <p className="text-[9px] text-slate-400 font-mono">模型: {GEMINI_MODEL}</p>
          </div>
        </aside>

        {/* Main Workspace Preview */}
        <section className="flex-1 flex overflow-hidden relative bg-slate-100/50">
          <div className="w-full flex flex-col bg-white">
            {/* Top Toolbar */}
            <div className="h-11 px-5 bg-teal-500/5 flex justify-between items-center border-b border-teal-500/10">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-black text-teal-800 uppercase tracking-widest flex items-center gap-1.5">
                  <BookIcon className="w-3.5 h-3.5 text-teal-600" /> 译文输出与版式预览
                </span>
                {state.totalPages > 1 && (
                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    文档规模: 共 {state.totalPages} 页
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {state.translatedMarkdown && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownloadWord}
                      disabled={isExportingWord}
                      className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200/60 transition-colors cursor-pointer"
                      title="快速下载 Word (.docx)"
                    >
                      {isExportingWord ? <SpinnerIcon className="w-3 h-3 animate-spin" /> : <WordIcon className="w-3 h-3" />}
                      <span>下载 Word (.docx)</span>
                    </button>
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200/60 transition-colors cursor-pointer"
                      title="快速下载 Markdown (.md)"
                    >
                      <DownloadIcon className="w-3 h-3" />
                      <span>下载 Markdown (.md)</span>
                    </button>
                  </div>
                )}
                {state.isProcessing && (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-teal-500 rounded-full animate-ping"></span>
                    <span className="text-[11px] font-bold text-teal-600">
                      {state.currentBatchStart > 0 
                        ? `正在输出第 ${state.currentBatchStart}-${state.currentBatchEnd} 页...`
                        : ui.processingText}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-10 bg-slate-50/60 relative">
              {state.error ? (
                <div className="max-w-lg mx-auto mt-16 p-8 bg-rose-50 rounded-3xl border border-rose-100 text-center shadow-sm">
                   <div className="inline-flex items-center justify-center p-4 bg-rose-100 text-rose-600 rounded-full mb-4">
                     <ErrorIcon className="w-7 h-7" />
                   </div>
                   <h3 className="text-lg font-black text-rose-900 mb-2">{ui.errorTitle}</h3>
                   <div className="text-xs text-rose-700 leading-relaxed mb-6 bg-white/70 p-4 rounded-xl border border-rose-100 text-left font-medium">
                     {state.error}
                     {state.currentBatchStart > 0 && (
                       <div className="mt-2 pt-2 border-t border-rose-100 text-[11px] text-slate-600">
                         在第 {state.currentBatchStart} 页暂停。已完成页码译文已安全保存在内存中，无需从第 1 页重新开始。
                       </div>
                     )}
                   </div>
                   <div className="flex items-center justify-center gap-3">
                     {state.currentBatchStart > 0 && (
                       <button onClick={handleResumeCurrentBatch} className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-md cursor-pointer">
                         从第 {state.currentBatchStart} 页重试继续
                       </button>
                     )}
                     <button onClick={resetAll} className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-all shadow-md cursor-pointer">
                       {ui.reset}
                     </button>
                   </div>
                </div>
              ) : state.translatedMarkdown ? (
                <div className="max-w-4xl mx-auto min-h-full bg-white shadow-[0_2px_25px_rgba(0,0,0,0.06)] border border-slate-200/80 p-12 rounded-lg">
                  <MarkdownViewer content={state.translatedMarkdown} />
                  {state.isProcessing && (
                    <div className="mt-8 pt-8 border-t border-slate-100 flex flex-col gap-2.5 animate-pulse">
                      <div className="flex items-center gap-2 text-xs font-bold text-teal-600">
                        <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                        <span>正在连续生成后续页码（第 {state.currentBatchStart}-{state.currentBatchEnd} 页）...</span>
                      </div>
                      <div className="h-3.5 bg-slate-100 rounded w-full"></div>
                      <div className="h-3.5 bg-slate-100 rounded w-5/6"></div>
                      <div className="h-3.5 bg-slate-100 rounded w-4/6"></div>
                    </div>
                  )}
                </div>
              ) : state.isProcessing ? (
                <div className="mt-32 flex flex-col items-center text-teal-700">
                  <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-5"></div>
                  <p className="font-extrabold text-lg">AI 正在分片解析并翻译文档...</p>
                  <p className="text-xs text-slate-500 mt-2 max-w-sm text-center">
                    当前正在处理第 1 批次（第 {state.currentBatchStart || 1} 至 {state.currentBatchEnd || batchSize} 页），请稍候...
                  </p>
                </div>
              ) : (
                <div className="mt-36 flex flex-col items-center justify-center text-slate-300">
                  <BookIcon className="w-14 h-14 stroke-1 mb-3" />
                  <p className="font-bold text-base text-slate-400">准备就绪，等待启动翻译流水线</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md text-center">
                    上传 86 页老挝语公文后，点击左侧【连续批量翻译全部】或指定页码区间，系统将自动分页分批高保真翻译。
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#0F172A] border-t border-slate-800 px-6 py-2 flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest">
        <div className="flex gap-6">
          <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-teal-400 rounded-full"></span> 模型: {GEMINI_MODEL}</span>
          <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-teal-400 rounded-full"></span> 引擎: 老挝语公文多页分批高精度排版引擎</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400">A4 • 12pt 正体宋体 • 国徽自动填充 • 单线图拓扑转写</span>
          <span className="text-teal-800">•</span>
          <span className="text-emerald-400">Ready</span>
        </div>
      </footer>
    </div>
  );
};

export default App;

import { useState, useEffect, useRef } from 'react';
import { X, Download, Share2, Star, Link2, ChevronRight, ChevronLeft } from 'lucide-react';
import { FilesService } from '@/services';
import { useI18n } from '@/i18n/I18nContext';
import { FileIcon } from './FileIcon';
import { formatBytes, formatDate, getFileIconName } from '@/utils/format';
import type { FileEntity } from '@/types';

interface FilePreviewerProps {
  file: FileEntity | null;
  onClose: () => void;
  onShowLinked?: (file: FileEntity) => void;
}

export function FilePreviewer({ file, onClose, onShowLinked }: FilePreviewerProps) {
  const { t, lang } = useI18n();
  const [linkedFile, setLinkedFile] = useState<FileEntity | null>(null);

  useEffect(() => {
    if (!file) return;
    FilesService.markOpened(file.id);
    FilesService.getLinkedFile(file.id).then(setLinkedFile);
  }, [file]);

  if (!file) return null;

  const type = getFileIconName(file.mimeType);

  const download = () => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const share = async () => {
    if (navigator.share) {
      try {
        const fileToShare = new File([file.blob], file.name, { type: file.mimeType });
        await navigator.share({ files: [fileToShare], title: file.name });
      } catch { /* user cancelled */ }
    } else {
      download();
    }
  };

  const toggleFav = () => {
    FilesService.toggleFavorite(file.id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col animate-fade-in" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 h-14 bg-slate-900 text-white safe-top">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{file.name}</p>
          <p className="text-xs text-slate-400">{formatBytes(file.size)} · {formatDate(file.createdAt, lang)}</p>
        </div>
        {linkedFile && (
          <button
            onClick={() => onShowLinked?.(linkedFile)}
            className="flex items-center gap-1 bg-primary-600 hover:bg-primary-700 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            <Link2 size={14} />
            {t('showAnswer')}
          </button>
        )}
        <button onClick={toggleFav} className="p-2 rounded-lg hover:bg-slate-700 transition-colors">
          <Star size={20} fill={file.favorite ? '#f59e0b' : 'none'} color={file.favorite ? '#f59e0b' : 'currentColor'} />
        </button>
        <button onClick={share} className="p-2 rounded-lg hover:bg-slate-700 transition-colors">
          <Share2 size={20} />
        </button>
        <button onClick={download} className="p-2 rounded-lg hover:bg-slate-700 transition-colors">
          <Download size={20} />
        </button>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700 transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950">
        <PreviewContent file={file} type={type} />
      </div>
    </div>
  );
}

function PreviewContent({ file, type }: { file: FileEntity; type: string }) {
  const url = URL.createObjectURL(file.blob);
  const [pdfPages, setPdfPages] = useState<number>(0);
  const [textContent, setTextContent] = useState<string>('');
  const [sheetData, setSheetData] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pdfPageNum, setPdfPageNum] = useState(1);

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    if (type === 'word') {
      file.blob.arrayBuffer().then(buf => {
        import('mammoth').then(mammoth => {
          mammoth.convertToHtml({ arrayBuffer: buf })
            .then((r: { value: string }) => setTextContent(r.value))
            .catch(() => setError('preview_failed'));
        });
      });
    } else if (type === 'excel') {
      file.blob.arrayBuffer().then(buf => {
        import('xlsx').then(XLSX => {
          const wb = XLSX.read(buf, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const html = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
          setSheetData(html);
        });
      });
    } else if (type === 'pdf') {
      loadPdf();
    }
  }, [file, type]);

  const loadPdf = async () => {
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      const buf = await file.blob.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      setPdfPages(pdf.numPages);
      renderPdfPage(pdf, 1);
    } catch {
      setError('preview_failed');
    }
  };

  const renderPdfPage = async (pdf: any, pageNum: number) => {
    const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
  };

  if (type === 'image') {
    return (
      <div className="flex items-center justify-center min-h-full p-4">
        <img src={url} alt={file.name} className="max-w-full max-h-full rounded-lg shadow-lg" style={{ touchAction: 'manipulation' }} />
      </div>
    );
  }

  if (type === 'video') {
    return (
      <div className="flex items-center justify-center min-h-full p-4">
        <video src={url} controls className="max-w-full max-h-full rounded-lg" />
      </div>
    );
  }

  if (type === 'audio') {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-8 gap-4">
        <FileIcon mimeType={file.mimeType} size={80} />
        <p className="text-slate-700 dark:text-slate-300 font-semibold">{file.name}</p>
        <audio src={url} controls className="w-full max-w-md" />
      </div>
    );
  }

  if (type === 'pdf') {
    if (error) return <FallbackPreview file={file} url={url} />;
    return (
      <div className="flex flex-col items-center min-h-full">
        <canvas id="pdf-canvas" className="shadow-lg bg-white" />
        {pdfPages > 1 && (
          <div className="flex items-center gap-4 my-4 bg-white dark:bg-slate-800 rounded-xl px-4 py-2 shadow">
            <button
              onClick={() => {
                const n = Math.max(1, pdfPageNum - 1);
                setPdfPageNum(n);
                import('pdfjs-dist').then(async pdfjs => {
                  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
                  const buf = await file.blob.arrayBuffer();
                  const pdf = await pdfjs.getDocument({ data: buf }).promise;
                  renderPdfPage(pdf, n);
                });
              }}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <ChevronRight size={20} />
            </button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {pdfPageNum} / {pdfPages}
            </span>
            <button
              onClick={() => {
                const n = Math.min(pdfPages, pdfPageNum + 1);
                setPdfPageNum(n);
                import('pdfjs-dist').then(async pdfjs => {
                  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
                  const buf = await file.blob.arrayBuffer();
                  const pdf = await pdfjs.getDocument({ data: buf }).promise;
                  renderPdfPage(pdf, n);
                });
              }}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <ChevronLeft size={20} />
            </button>
          </div>
        )}
      </div>
    );
  }

  if (type === 'word') {
    if (error) return <FallbackPreview file={file} url={url} />;
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div
          className="bg-white dark:bg-slate-100 rounded-xl shadow-lg p-8 min-h-[60vh] prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: textContent || `<p class="text-slate-400">${'...'}</p>` }}
        />
      </div>
    );
  }

  if (type === 'excel') {
    if (error) return <FallbackPreview file={file} url={url} />;
    return (
      <div className="overflow-auto p-4">
        <table className="border-collapse bg-white dark:bg-slate-800 mx-auto text-sm">
          <tbody>
            {sheetData.map((row, i) => (
              <tr key={i} className={i === 0 ? 'font-bold bg-slate-100 dark:bg-slate-700' : ''}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-slate-800 dark:text-slate-200"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <FallbackPreview file={file} url={url} />;
}

function FallbackPreview({ file, url }: { file: FileEntity; url: string }) {
  const { t, lang } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8 gap-4">
      <FileIcon mimeType={file.mimeType} size={80} />
      <p className="text-slate-700 dark:text-slate-300 font-semibold text-center">{file.name}</p>
      <p className="text-sm text-slate-500">{formatBytes(file.size)} · {formatDate(file.createdAt, lang)}</p>
      <p className="text-sm text-slate-400 text-center max-w-xs">{t('preview')} — {t('download')}</p>
      <a href={url} download={file.name} className="btn-primary">
        <Download size={18} />
        {t('download')}
      </a>
    </div>
  );
}

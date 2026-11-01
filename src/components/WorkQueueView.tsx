import React, { useState } from 'react';
import {
  Play,
  Pause,
  Trash2,
  ArrowUp,
  FolderPlus,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileVideo,
  ChevronRight,
  Download,
  UploadCloud,
} from 'lucide-react';
import { VideoJob } from '../types/dichphim';
import { createPipelineSteps } from '../data/initialData';

interface WorkQueueViewProps {
  jobs: VideoJob[];
  setJobs: React.Dispatch<React.SetStateAction<VideoJob[]>>;
  onOpenInEditor: (movieId: string) => void;
}

function parseEpisodeFromFileName(fileName: string, fallbackIndex: number): number {
  const patterns = [
    /[Tt]ap[_\s-]*0*(\d+)/i,
    /[Ee][Pp]?[_\s-]*0*(\d+)/i,
    /第\s*0*(\d+)\s*[集话]/,
    /[_\s-\[]0*(\d{1,3})[_\s-\].]/,
  ];
  for (const regex of patterns) {
    const match = fileName.match(regex);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  return fallbackIndex;
}

export const WorkQueueView: React.FC<WorkQueueViewProps> = ({
  jobs,
  setJobs,
  onOpenInEditor,
}) => {
  const [selectedJobId, setSelectedJobId] = useState<string>(jobs[0]?.id || '');
  const [workerCount, setWorkerCount] = useState<number>(3);
  const [asrDevice, setAsrDevice] = useState<'CUDA (RTX 4070 Ti 12GB)' | 'CPU (8 luồng)'>(
    'CUDA (RTX 4070 Ti 12GB)'
  );
  const [watchFolderEnabled, setWatchFolderEnabled] = useState<boolean>(true);
  const [autoWorkerEnabled, setAutoWorkerEnabled] = useState<boolean>(false);
  const [batchFolderInput, setBatchFolderInput] = useState<string>(
    'D:\\PhimTrungQuoc\\TruongNguyetKiemTon\\Tap15.mp4, 第16集_长月剑尊.mkv, Tap17_4K.mp4'
  );
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'queued' | 'completed'>(
    'all'
  );
  const filePickerRef = React.useRef<HTMLInputElement | null>(null);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0];

  React.useEffect(() => {
    if (!autoWorkerEnabled) return;
    const timer = window.setInterval(() => {
      setJobs((prev) => {
        let changed = false;
        const nextJobs = prev.map((job) => {
          if (job.status !== 'running') return job;
          changed = true;
          const currentRunningIdx = job.steps.findIndex((s) => s.status === 'running');
          const nextOrder =
            currentRunningIdx === -1 ? 1 : Math.min(11, currentRunningIdx + 2);
          const newOverall = nextOrder > 10 ? 100 : Math.min(98, nextOrder * 10 - 2);
          return {
            ...job,
            status: nextOrder > 10 ? ('completed' as const) : ('running' as const),
            overallProgress: newOverall,
            speedMultiplier: nextOrder > 10 ? 0 : 14.2,
            etaSeconds: nextOrder > 10 ? 0 : Math.max(8, 200 - newOverall * 2),
            steps: createPipelineSteps(nextOrder, nextOrder > 10 ? 100 : 75),
          };
        });
        return changed ? nextJobs : prev;
      });
    }, 2200);
    return () => window.clearInterval(timer);
  }, [autoWorkerEnabled, setJobs]);

  const appendFilesToQueue = (
    rawItems: Array<{ name: string; sizeMb?: number }>
  ) => {
    if (rawItems.length === 0) return;

    const parsedItems = rawItems
      .map((item, idx) => {
        const cleanFile = item.name.split(/[\\/]/).pop() || item.name;
        const epNum = parseEpisodeFromFileName(cleanFile, 15 + idx);
        return { cleanFile, epNum, sizeMb: item.sizeMb };
      })
      .sort((a, b) => a.epNum - b.epNum);

    const newJobs: VideoJob[] = parsedItems.map((item, idx) => ({
      id: `job-batch-${Date.now()}-${idx}`,
      movieId: 'movie-xianxia-01',
      movieTitleVi: 'Trường Nguyệt Kiếm Tôn',
      movieTitleZh: '长月剑尊',
      episodeNumber: item.epNum,
      episodeTitle: `Tập ${String(item.epNum).padStart(2, '0')} - Tự động nhận diện từ tên file`,
      fileName: item.cleanFile,
      fileSizeMb: item.sizeMb ?? 920 + idx * 45,
      durationSeconds: 2700,
      resolution: '1920x1080 (H.264)',
      status: autoWorkerEnabled ? 'running' : 'queued',
      priority: 65 - idx * 2,
      currentStepCode: 'EXTRACT_AUDIO',
      overallProgress: autoWorkerEnabled ? 8 : 0,
      speedMultiplier: autoWorkerEnabled ? 14.2 : 0,
      etaSeconds: 185,
      workerDevice: asrDevice,
      asrModel: 'faster-whisper-large-v3',
      enableVocalSeparation: true,
      enableHardsubOcr: true,
      enableTwoPassReview: true,
      enableTwoPass: true,
      enableTtsDubbing: false,
      steps: createPipelineSteps(autoWorkerEnabled ? 1 : 0, autoWorkerEnabled ? 40 : 0),
    }));

    setJobs((prev) => [...prev, ...newJobs]);
    if (newJobs[0]) {
      setSelectedJobId(newJobs[0].id);
    }
  };

  const handleAddBatchFiles = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchFolderInput.trim()) return;
    const rawNames = batchFolderInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
    appendFilesToQueue(rawNames);
    setBatchFolderInput('');
  };

  const handlePickDeviceFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length > 0) {
      appendFilesToQueue(
        fileList.map((f) => ({
          name: f.name,
          sizeMb: Math.max(1, Math.round(f.size / (1024 * 1024))),
        }))
      );
    }
    e.target.value = '';
  };

  const handleDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files || []).map((f) => ({
      name: f.name,
      sizeMb: Math.max(1, Math.round(f.size / (1024 * 1024))),
    }));
    if (droppedFiles.length > 0) {
      appendFilesToQueue(droppedFiles);
    }
  };

  const handleExportSystemLog = () => {
    const now = new Date().toISOString();
    const logLines = [
      `====================================================================`,
      `DỊCHPHIM AI - NHẬT KÝ HỆ THỐNG & CHẨN ĐOÁN LỖI (${now})`,
      `Thiết bị xử lý ASR: ${asrDevice} | Pool Workers: ${workerCount}`,
      `SQLite Journal Mode: WAL | Foreign Keys: ON`,
      `====================================================================`,
      ...jobs.map(
        (j) =>
          `[${j.status.toUpperCase()}] Job=${j.id} | File="${j.fileName}" | Tập=${j.episodeNumber} | Tiến độ=${j.overallProgress}% | Bước=${j.currentStepCode} | Tốc độ=${j.speedMultiplier}x`
      ),
    ].join('\n');

    const blob = new Blob([logLines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dichphim_ai_diagnostic_${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleJobStatus = (jobId: string) => {
    setJobs((prev) =>
      prev.map((job) => {
        if (job.id !== jobId) return job;
        if (job.status === 'running') {
          return { ...job, status: 'paused', speedMultiplier: 0 };
        }
        if (job.status === 'paused' || job.status === 'queued' || job.status === 'failed') {
          const nextStepOrder = job.overallProgress === 0 ? 1 : 6;
          return {
            ...job,
            status: 'running',
            speedMultiplier: 13.5,
            errorMessageVi: undefined,
            steps: createPipelineSteps(
              nextStepOrder,
              Math.max(25, job.overallProgress)
            ),
          };
        }
        return job;
      })
    );
  };

  const handleBoostPriority = (jobId: string) => {
    setJobs((prev) => {
      const updated = prev.map((job) =>
        job.id === jobId ? { ...job, priority: Math.min(99, job.priority + 15) } : job
      );
      return [...updated].sort((a, b) => b.priority - a.priority);
    });
  };

  const handleDeleteJob = (jobId: string) => {
    setJobs((prev) => {
      const remaining = prev.filter((j) => j.id !== jobId);
      if (selectedJobId === jobId && remaining.length > 0) {
        setSelectedJobId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleAdvanceStepSimulation = (jobId: string) => {
    setJobs((prev) =>
      prev.map((job) => {
        if (job.id !== jobId) return job;
        const currentRunningIdx = job.steps.findIndex((s) => s.status === 'running');
        const nextOrder =
          currentRunningIdx === -1 ? 1 : Math.min(11, currentRunningIdx + 2);
        const newOverall = nextOrder > 10 ? 100 : Math.min(98, nextOrder * 10 - 4);
        return {
          ...job,
          status: nextOrder > 10 ? 'completed' : 'running',
          overallProgress: newOverall,
          speedMultiplier: nextOrder > 10 ? 0 : 14.8,
          etaSeconds: nextOrder > 10 ? 0 : Math.max(12, 220 - newOverall * 2),
          steps: createPipelineSteps(nextOrder, nextOrder > 10 ? 100 : 65),
        };
      })
    );
  };

  const filteredJobs = jobs.filter((j) =>
    statusFilter === 'all' ? true : j.status === statusFilter
  );

  const runningCount = jobs.filter((j) => j.status === 'running').length;
  const completedCount = jobs.filter((j) => j.status === 'completed').length;

  return (
    <div className="space-y-6">
      <input
        ref={filePickerRef}
        type="file"
        multiple
        accept="video/*,.mkv,.mp4,.webm,.mov,.avi"
        onChange={handlePickDeviceFiles}
        className="hidden"
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Vùng Kéo Thả Video / Thư Mục */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDropFiles}
          className={`lg:col-span-7 bg-white dark:bg-slate-900 border rounded-xl p-5 flex flex-col justify-between transition-colors ${
            isDraggingOver
              ? 'border-amber-500 bg-amber-500/5'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Kéo Thả Video Hoặc Cả Thư Mục Phim Vào Đây
                </h2>
              </div>
              <button
                type="button"
                onClick={() => filePickerRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileVideo className="w-3.5 h-3.5" />
                <span>Chọn File Video Từ Máy</span>
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              Kéo thả trực tiếp các file .mp4 / .mkv vào vùng này, bấm chọn file từ thiết bị hoặc dán danh sách bên dưới. Hệ thống tự động nhận diện số tập (Tap01, E02, 第3集) và lưu checkpoint SQLite.
            </p>
          </div>

          <form onSubmit={handleAddBatchFiles} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={batchFolderInput}
                onChange={(e) => setBatchFolderInput(e.target.value)}
                placeholder="Nhập danh sách tên file hoặc đường dẫn thư mục (cách nhau dấu phẩy)..."
                className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Thêm Vào Hàng Đợi</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Thư mục theo dõi:{' '}
                <code className="text-slate-700 dark:text-slate-300">
                  D:\PhimTrungQuoc\AutoWatch
                </code>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAutoWorkerEnabled(!autoWorkerEnabled)}
                  className={`font-medium whitespace-nowrap shrink-0 cursor-pointer hover:underline ${
                    autoWorkerEnabled
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {autoWorkerEnabled ? 'Auto-Worker: Đang tự chạy' : 'Auto-Worker: Chạy tay'}
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setWatchFolderEnabled(!watchFolderEnabled)}
                  className="text-amber-600 dark:text-amber-400 hover:underline font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {watchFolderEnabled ? 'Theo dõi thư mục: Bật' : 'Theo dõi thư mục: Tắt'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Cấu hình Worker Pool, GPU/VRAM & Nút Xuất Log */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Điều Phối Đa Luồng & Tăng Tốc GPU
                </h2>
              </div>
              <button
                type="button"
                onClick={handleExportSystemLog}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>Xuất log</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/80">
                <span className="text-slate-600 dark:text-slate-400">Thiết bị nhận diện giọng nói (ASR)</span>
                <button
                  type="button"
                  onClick={() =>
                    setAsrDevice(
                      asrDevice.startsWith('CUDA')
                        ? 'CPU (8 luồng)'
                        : 'CUDA (RTX 4070 Ti 12GB)'
                    )
                  }
                  className="font-mono font-medium text-slate-900 dark:text-slate-100 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
                >
                  {asrDevice}
                </button>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/80">
                <span className="text-slate-600 dark:text-slate-400">
                  Số luồng dịch song song (Pool Workers)
                </span>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 6].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setWorkerCount(num)}
                      className={`w-6 h-6 rounded text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                        workerCount === num
                          ? 'bg-amber-600 text-white font-semibold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>
              Đang chạy: <strong className="text-slate-900 dark:text-slate-100">{runningCount}</strong> · Hoàn tất:{' '}
              <strong className="text-slate-900 dark:text-slate-100">{completedCount}</strong>
            </span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              Tốc độ TB: gấp 13.8x thời lượng thực
            </span>
          </div>
        </div>
      </div>

      {/* Bảng hàng đợi bên trái + Chi tiết 10 bước Pipeline bên phải */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Danh Sách Công Việc ({filteredJobs.length} video)
            </h3>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'running', label: 'Đang xử lý' },
                  { id: 'queued', label: 'Đang chờ' },
                  { id: 'completed', label: 'Hoàn tất' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredJobs.map((job) => {
              const isSelected = job.id === selectedJob?.id;
              return (
                <div
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`p-4 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/5 dark:bg-amber-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5 tabular-nums">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {job.movieTitleVi} ({job.movieTitleZh})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Tập {String(job.episodeNumber).padStart(2, '0')}</span>
                        <span aria-hidden="true">·</span>
                        <span>Ưu tiên {job.priority}</span>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {job.episodeTitle}
                      </h4>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5 tabular-nums">
                        {job.fileName} · {job.fileSizeMb} MB · {job.resolution}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {job.status !== 'completed' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggleJobStatus(job.id)}
                            title={job.status === 'running' ? 'Tạm dừng (Lưu checkpoint)' : 'Tiếp tục xử lý'}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            {job.status === 'running' ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdvanceStepSimulation(job.id)}
                            title="Chạy bước tiếp theo trong Pipeline"
                            className="px-2.5 py-1 rounded-lg bg-amber-600/10 text-amber-700 dark:text-amber-300 hover:bg-amber-600/20 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Tiến 1 bước
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBoostPriority(job.id)}
                            title="Tăng độ ưu tiên"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenInEditor(job.movieId)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Sửa phụ đề
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteJob(job.id)}
                        title="Hủy / Xóa khỏi hàng đợi"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 mt-3">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="text-slate-600 dark:text-slate-400">
                        {job.status === 'completed'
                          ? 'Hoàn tất 10/10 bước · Đã đưa vào Kho phim'
                          : job.status === 'paused'
                          ? 'Đã tạm dừng (Checkpoint lưu trong SQLite)'
                          : job.steps.find((s) => s.status === 'running')?.nameVi ||
                            'Đang chờ trong hàng đợi...'}
                      </span>
                      <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                        {job.overallProgress}%
                        {job.speedMultiplier > 0 && ` · ${job.speedMultiplier}x`}
                        {job.etaSeconds > 0 && job.status === 'running' && ` · còn ${job.etaSeconds}s`}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          job.status === 'completed'
                            ? 'bg-emerald-500'
                            : job.status === 'paused'
                            ? 'bg-slate-400'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${job.overallProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chi tiết 10 bước Pipeline */}
        {selectedJob && (
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                  Chi tiết Pipeline 10 bước (Có lưu Checkpoint SQLite)
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {selectedJob.movieTitleVi} — Tập {selectedJob.episodeNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onOpenInEditor(selectedJob.movieId)}
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Mở trình sửa phụ đề</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {selectedJob.steps.map((step) => (
                <div
                  key={step.code}
                  className={`p-3 rounded-lg border text-xs transition-colors ${
                    step.status === 'running'
                      ? 'border-amber-500/50 bg-amber-500/5 dark:bg-amber-500/10'
                      : step.status === 'completed'
                      ? 'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50'
                      : 'border-slate-200/50 dark:border-slate-800/60 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {step.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : step.status === 'running' ? (
                        <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : step.status === 'failed' ? (
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                      ) : (
                        <FileVideo className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {step.nameVi}
                      </span>
                    </div>
                    <span className="font-mono text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
                      {step.progress}%
                    </span>
                  </div>

                  {step.checkpointInfo && (
                    <div className="mt-1.5 pl-6 text-xs text-amber-700 dark:text-amber-300 font-mono">
                      Checkpoint: {step.checkpointInfo}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

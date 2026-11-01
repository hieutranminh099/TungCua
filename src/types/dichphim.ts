export type MovieGenre =
  | 'co_trang'
  | 'kiem_hiep'
  | 'tien_hiep'
  | 'ngon_tinh'
  | 'hien_dai'
  | 'hai'
  | 'hanh_dong';

export type MovieEra = 'co_dai' | 'dan_quoc' | 'hien_dai' | 'huyen_huyen';

export type TranslationStyle = 'sat_nghia' | 'muot_ma' | 'hai_huoc' | 'trang_trong';

export type PipelineStepCode =
  | 'EXTRACT_AUDIO'
  | 'VAD_SEGMENT'
  | 'ASR_TRANSCRIBE'
  | 'OCR_HARDSUB'
  | 'AI_MOVIE_PROFILE'
  | 'AI_CONTEXT_TRANSLATE'
  | 'GENERATE_SUBTITLES'
  | 'TTS_DUBBING'
  | 'EXPORT_VIDEO'
  | 'LIBRARY_IMPORT';

export interface PipelineStep {
  code: PipelineStepCode;
  order: number;
  nameVi: string;
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
  progress: number;
  checkpointInfo?: string;
}

export interface VideoJob {
  id: string;
  movieId: string;
  movieTitleVi: string;
  movieTitleZh: string;
  episodeNumber: number;
  episodeTitle: string;
  fileName: string;
  fileSizeMb: number;
  durationSeconds: number;
  resolution: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  priority: number;
  currentStepCode: PipelineStepCode;
  overallProgress: number;
  speedMultiplier: number;
  etaSeconds: number;
  workerDevice: 'CUDA (RTX 4070 Ti 12GB)' | 'Apple MPS' | 'CPU (8 luồng)';
  asrModel: 'faster-whisper-large-v3' | 'faster-whisper-medium' | 'funasr-paraformer-zh';
  enableVocalSeparation: boolean;
  enableHardsubOcr: boolean;
  enableTwoPassReview: boolean;
  enableTtsDubbing: boolean;
  errorMessageVi?: string;
  steps: PipelineStep[];
}

export interface SubtitleLine {
  id: string;
  episodeId: string;
  index: number;
  startMs: number;
  endMs: number;
  speakerNameVi: string;
  speakerNameZh: string;
  source: 'ASR' | 'OCR' | 'MERGED';
  textZh: string;
  textPinyin: string;
  textViDraft: string;
  textVi: string;
  confidence: number;
  cps: number;
  editStatus: 'ai_pass1' | 'ai_pass2' | 'user_edited' | 'locked';
  aiNotes: string;
}

export interface CharacterProfile {
  id: string;
  nameZh: string;
  nameVi: string;
  gender: 'Nam' | 'Nữ' | 'Khác';
  estimatedAge: string;
  role: 'Chính' | 'Phản diện' | 'Phụ';
  selfPronounDefault: string;
  addressOthersDefault: string;
  personalityAndTone: string;
  ttsVoiceId: string;
  verified: boolean;
}

export interface CharacterRelationship {
  id: string;
  fromNameVi: string;
  toNameVi: string;
  relationType: string;
  pronounSelf: string;
  pronounTarget: string;
  contextNote: string;
}

export interface GlossaryEntry {
  id: string;
  termZh: string;
  termVi: string;
  category: 'person' | 'sect' | 'skill' | 'location' | 'cultivation_realm' | 'idiom' | 'slang';
  hanVietLiteral: string;
  usageNote: string;
  source: 'ai_suggested' | 'user_added' | 'learned_from_edit';
  approved: boolean;
}

export interface MovieRecord {
  id: string;
  titleZh: string;
  titleVi: string;
  titlePinyin: string;
  genre: MovieGenre;
  era: MovieEra;
  translationStyle: TranslationStyle;
  synopsis: string;
  addressingGuide: string;
  posterTheme: 'xianxia' | 'wuxia_palace' | 'modern_romance';
  totalEpisodes: number;
  completedEpisodes: number;
  characters: CharacterProfile[];
  relationships: CharacterRelationship[];
  glossary: GlossaryEntry[];
  subtitles: SubtitleLine[];
  watchProgressSeconds: number;
  durationSeconds: number;
}

export interface PairedDevice {
  id: string;
  deviceName: string;
  platform: 'Android' | 'iOS';
  ipAddress: string;
  lastSync: string;
  online: boolean;
  offlineDownloadedCount: number;
}

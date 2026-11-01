import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn, ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESOURCES_ROOT = process.env.DICHPHIM_RESOURCES_DIR || __dirname;
const DATA_ROOT =
  process.env.DICHPHIM_DATA_DIR || path.resolve(RESOURCES_ROOT, "backend");

let pythonBackendProc: ChildProcess | null = null;
const PYTHON_BACKEND_PORT = Number(process.env.DICHPHIM_BACKEND_PORT || 8443);

function ensurePythonBackendRunning(): void {
  if (pythonBackendProc && !pythonBackendProc.killed) return;
  const scriptPath = path.resolve(RESOURCES_ROOT, "backend", "main.py");
  if (!fs.existsSync(scriptPath)) return;

  const pyCmd = process.platform === "win32" ? "python" : "python3";
  try {
    pythonBackendProc = spawn(
      pyCmd,
      [
        scriptPath,
        "--host",
        "127.0.0.1",
        "--port",
        String(PYTHON_BACKEND_PORT),
        "--data-dir",
        DATA_ROOT,
        "--resources-dir",
        RESOURCES_ROOT,
      ],
      {
        stdio: "ignore",
        windowsHide: true,
      }
    );
    pythonBackendProc.on("exit", () => {
      pythonBackendProc = null;
    });
  } catch {
    pythonBackendProc = null;
  }
}

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function readPromptFile(filename: string, fallback: string): string {
  try {
    const filePath = path.resolve(RESOURCES_ROOT, "prompts", filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    console.error(`Error reading prompt file ${filename}:`, err);
  }
  return fallback;
}

// Lưu trữ trạng thái đồng bộ trên Server để Máy tính và Điện thoại đồng bộ thời gian thực
const STATE_FILE = path.resolve(DATA_ROOT, "runtime_sync_state.json");

function loadSyncedState(): Record<string, any> | null {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch (_) {}
  return null;
}

function saveSyncedState(state: Record<string, any>): void {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save state:", err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "25mb" }));

  // ==========================================================================
  // 1. ĐỒNG BỘ KHO PHIM & TIẾN ĐỘ MÁY TÍNH <-> ĐIỆN THOẠI (LAN & CLOUD SYNC)
  // ==========================================================================
  let currentPairingCode = "849-206";

  app.get("/api/state", (_req, res) => {
    const saved = loadSyncedState();
    res.json({ ok: true, state: saved, pairingCode: currentPairingCode });
  });

  app.post("/api/state", (req, res) => {
    const { movies, jobs, devices } = req.body || {};
    const existing = loadSyncedState() || {};
    const nextState = {
      movies: movies ?? existing.movies,
      jobs: jobs ?? existing.jobs,
      devices: devices ?? existing.devices,
      updatedAt: new Date().toISOString(),
    };
    saveSyncedState(nextState);
    res.json({ ok: true, updatedAt: nextState.updatedAt });
  });

  // POST /api/lan/pair — Ghép đôi điện thoại bằng mã 6 số hoặc QR
  app.post("/api/lan/pair", (req, res) => {
    const { code, deviceName, platform } = req.body || {};
    const cleanInput = String(code || "").replace(/\D/g, "");
    const cleanTarget = currentPairingCode.replace(/\D/g, "");
    if (cleanInput && cleanInput !== cleanTarget) {
      res.status(400).json({
        ok: false,
        error: "Mã ghép đôi 6 số không khớp. Vui lòng kiểm tra lại mã trên màn hình máy tính.",
      });
      return;
    }

    const state = loadSyncedState() || {};
    const devices = Array.isArray(state.devices) ? state.devices : [];
    const newDevice = {
      id: `dev-mobile-${Date.now()}`,
      deviceName: deviceName || "Điện thoại mới ghép đôi",
      platform: platform === "iOS" ? "iOS" : "Android",
      ipAddress: req.ip || "192.168.1.88",
      lastSync: "Vừa ghép đôi thành công qua LAN",
      online: true,
      offlineDownloadedCount: 0,
    };
    state.devices = [newDevice, ...devices];
    saveSyncedState(state);

    res.json({
      ok: true,
      token: `dp_lan_token_${Date.now()}`,
      device: newDevice,
    });
  });

  // PUT /api/lan/subtitles/:movieId/lines/:lineId — Sửa phụ đề trên điện thoại đồng bộ về PC
  app.put("/api/lan/subtitles/:movieId/lines/:lineId", (req, res) => {
    const { movieId, lineId } = req.params;
    const { textVi, deviceName } = req.body || {};
    const state = loadSyncedState();
    if (state && Array.isArray(state.movies)) {
      state.movies = state.movies.map((m: any) => {
        if (m.id !== movieId) return m;
        return {
          ...m,
          subtitles: (m.subtitles || []).map((s: any) =>
            s.id === lineId
              ? {
                  ...s,
                  textVi: textVi ?? s.textVi,
                  editStatus: "user_edited",
                  aiNotes: `Đã sửa từ ${deviceName || "App Điện thoại"} · Đồng bộ tức thì về Máy tính`,
                }
              : s
          ),
        };
      });
      saveSyncedState(state);
    }
    res.json({ ok: true });
  });

  // PUT /api/lan/progress/:movieId — Đồng bộ tiến độ xem phim 2 chiều
  app.put("/api/lan/progress/:movieId", (req, res) => {
    const { movieId } = req.params;
    const { positionSeconds } = req.body || {};
    const state = loadSyncedState();
    if (state && Array.isArray(state.movies)) {
      state.movies = state.movies.map((m: any) =>
        m.id === movieId
          ? { ...m, watchProgressSeconds: Number(positionSeconds) || m.watchProgressSeconds }
          : m
      );
      saveSyncedState(state);
    }
    res.json({ ok: true });
  });

  // ==========================================================================
  // 2. API AI NHẬN DẠNG & DỊCH VIDEO / AUDIO THỰC TẾ (GEMINI 3.8 FLASH MULTIMODAL)
  // ==========================================================================
  app.post("/api/ai/transcribe-media", async (req, res) => {
    try {
      const { mimeType, base64Data, movieProfile, fileName } = req.body || {};
      if (!base64Data) {
        res.status(400).json({ ok: false, error: "Thiếu dữ liệu media để nhận dạng." });
        return;
      }

      const ai = getGenAIClient();
      const prompt = `Bạn là hệ thống nhận dạng giọng nói/phụ đề tiếng Trung (ASR + OCR) và dịch giả phim Trung - Việt theo ngữ cảnh.
File đầu vào: "${fileName || "video.mp4"}"
Hồ sơ phim hiện tại:
${JSON.stringify(movieProfile || {}, null, 2)}

Hãy nghe âm thanh / đọc phụ đề chữ Hán trong media này (nếu media không có tiếng Trung rõ ràng, hãy trích xuất lời thoại hoặc tạo mẫu phụ đề khớp nội dung cảnh quay) và trả về danh sách các câu phụ đề gồm:
- start_ms, end_ms (mili-giây tăng dần hợp lý)
- speaker_name_vi, speaker_name_zh
- text_zh (chữ Hán giản thể)
- text_pinyin (phiên âm Pinyin có thanh điệu)
- text_vi (bản dịch tiếng Việt chuẩn xưng hô cổ trang/hiện đại theo Hồ sơ phim, tối đa 42 ký tự/dòng, CPS <= 17)
- confidence (0.0 -> 1.0)
- ai_notes (giải thích xưng hô hoặc thuật ngữ đã dùng)`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "video/mp4",
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                start_ms: { type: Type.INTEGER },
                end_ms: { type: Type.INTEGER },
                speaker_name_vi: { type: Type.STRING },
                speaker_name_zh: { type: Type.STRING },
                text_zh: { type: Type.STRING },
                text_pinyin: { type: Type.STRING },
                text_vi: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                ai_notes: { type: Type.STRING },
              },
            },
          },
        },
      });

      const lines = JSON.parse((response.text ?? "[]").trim());
      res.json({ ok: true, lines });
    } catch (error: any) {
      console.error("Error in /api/ai/transcribe-media:", error);
      res.status(500).json({
        ok: false,
        error: error?.message || "Lỗi khi nhận dạng và dịch media bằng Gemini AI.",
      });
    }
  });

  // Bước 5: Phân tích Hồ sơ phim bằng AI
  app.post("/api/ai/analyze-movie", async (req, res) => {
    try {
      const { titleZh, sampleLines } = req.body;
      const ai = getGenAIClient();
      const systemInstruction = readPromptFile(
        "movie_analysis.md",
        "Bạn là chuyên gia phân tích ngữ cảnh phim Trung - Việt."
      );

      const prompt = `Tên phim gốc (nếu có): ${titleZh || "Chưa rõ"}
Dưới đây là mẫu hội thoại tiếng Trung trích từ phim:
${JSON.stringify(sampleLines || [], null, 2)}

Hãy phân tích và trả về Hồ sơ phim (thể loại, bối cảnh, quy tắc xưng hô, danh sách nhân vật, quan hệ xưng hô giữa các nhân vật, và từ điển thuật ngữ Hán-Việt/tiếng Việt nhất quán).`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title_vi: { type: Type.STRING },
              genre: { type: Type.STRING },
              era: { type: Type.STRING },
              synopsis: { type: Type.STRING },
              addressing_guide: { type: Type.STRING },
              characters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name_zh: { type: Type.STRING },
                    name_vi: { type: Type.STRING },
                    gender: { type: Type.STRING },
                    estimated_age: { type: Type.STRING },
                    role: { type: Type.STRING },
                    self_pronoun_default: { type: Type.STRING },
                    address_others_default: { type: Type.STRING },
                    personality_and_tone: { type: Type.STRING },
                  },
                },
              },
              relationships: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    from_name_vi: { type: Type.STRING },
                    to_name_vi: { type: Type.STRING },
                    relation_type: { type: Type.STRING },
                    pronoun_self: { type: Type.STRING },
                    pronoun_target: { type: Type.STRING },
                    context_note: { type: Type.STRING },
                  },
                },
              },
              glossary: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term_zh: { type: Type.STRING },
                    term_vi: { type: Type.STRING },
                    category: { type: Type.STRING },
                    han_viet_literal: { type: Type.STRING },
                    usage_note: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json({ ok: true, profile: parsed });
    } catch (error: any) {
      console.error("Error in /api/ai/analyze-movie:", error);
      res.status(500).json({
        ok: false,
        error: error?.message || "Không thể phân tích hồ sơ phim bằng AI.",
      });
    }
  });

  // Bước 6 (Lượt 1): Dịch lô câu theo ngữ cảnh + Hồ sơ phim + Từ điển
  app.post("/api/ai/translate-batch", async (req, res) => {
    try {
      const {
        movieProfile,
        translationStyle,
        contextBefore,
        targetLines,
        contextAfter,
      } = req.body;

      const ai = getGenAIClient();
      const systemInstruction = readPromptFile(
        "batch_translate.md",
        "Bạn là dịch giả phụ đề phim Trung - Việt cao cấp."
      );

      const prompt = `## 1. HỒ SƠ PHIM & QUY TẮC XƯNG HÔ
${JSON.stringify(movieProfile, null, 2)}

## 2. PHONG CÁCH DỊCH YÊU CẦU: ${translationStyle || "Mượt mà tự nhiên"}
- Giới hạn hiển thị: tối đa 42 ký tự/dòng, tối đa 2 dòng, tốc độ đọc CPS <= 17 ký tự/giây.

## 3. CỬA SỔ NGỮ CẢNH TRƯỚC (CHỈ THAM KHẢO, KHÔNG DỊCH LẠI):
${JSON.stringify(contextBefore || [], null, 2)}

## 4. CÁC CÂU CẦN DỊCH (TARGET LINES - BẮT BUỘC DỊCH ĐẦY ĐỦ THEO ID):
${JSON.stringify(targetLines || [], null, 2)}

## 5. CỬA SỔ NGỮ CẢNH SAU (CHỈ THAM KHẢO, KHÔNG DỊCH LẠI):
${JSON.stringify(contextAfter || [], null, 2)}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text_vi: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                ai_notes: { type: Type.STRING },
              },
            },
          },
        },
      });

      const translations = JSON.parse((response.text ?? "[]").trim());
      res.json({ ok: true, translations });
    } catch (error: any) {
      console.error("Error in /api/ai/translate-batch:", error);
      res.status(500).json({
        ok: false,
        error: error?.message || "Lỗi khi gọi AI dịch lô phụ đề.",
      });
    }
  });

  // Bước 6 (Lượt 2): Rà soát tính nhất quán xưng hô, thuật ngữ và CPS
  app.post("/api/ai/review-pass2", async (req, res) => {
    try {
      const { movieProfile, translationStyle, lines } = req.body;
      const ai = getGenAIClient();
      const systemInstruction = readPromptFile(
        "second_pass_review.md",
        "Bạn là biên tập viên trưởng rà soát phụ đề phim Trung - Việt."
      );

      const prompt = `## HỒ SƠ PHIM & TỪ ĐIỂN CHUẨN
${JSON.stringify(movieProfile, null, 2)}

## PHONG CÁCH DỊCH: ${translationStyle || "Mượt mà tự nhiên"}

## DANH SÁCH CÂU CẦN RÀ SOÁT LƯỢT 2:
${JSON.stringify(lines || [], null, 2)}

Hãy kiểm tra và sửa lại các câu bị lệch xưng hô giữa các nhân vật, sai thuật ngữ từ điển, hoặc câu quá dài (CPS > 17 ký tự/giây). Trả về danh sách JSON đầy đủ các câu sau khi rà soát.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text_vi: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                ai_notes: { type: Type.STRING },
              },
            },
          },
        },
      });

      const reviewedLines = JSON.parse((response.text ?? "[]").trim());
      res.json({ ok: true, reviewedLines });
    } catch (error: any) {
      console.error("Error in /api/ai/review-pass2:", error);
      res.status(500).json({
        ok: false,
        error: error?.message || "Lỗi khi rà soát phụ đề lượt 2.",
      });
    }
  });

  // Đề xuất từ điển thuật ngữ mới bằng AI
  app.post("/api/ai/suggest-glossary", async (req, res) => {
    try {
      const { genre, era, lines } = req.body;
      const ai = getGenAIClient();
      const systemInstruction = readPromptFile(
        "glossary_extract.md",
        "Bạn là chuyên gia trích xuất thuật ngữ phim Trung - Việt."
      );

      const prompt = `Thể loại phim: ${genre || "co_trang"} | Bối cảnh: ${era || "co_dai"}
Danh sách câu thoại:
${JSON.stringify(lines || [], null, 2)}

Hãy trích xuất các tên riêng, môn phái, công pháp, cảnh giới, thành ngữ hoặc tiếng lóng xuất hiện trong đoạn hội thoại trên.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term_zh: { type: Type.STRING },
                term_vi: { type: Type.STRING },
                category: { type: Type.STRING },
                han_viet_literal: { type: Type.STRING },
                usage_note: { type: Type.STRING },
              },
            },
          },
        },
      });

      const suggestions = JSON.parse((response.text ?? "[]").trim());
      res.json({ ok: true, suggestions });
    } catch (error: any) {
      console.error("Error in /api/ai/suggest-glossary:", error);
      res.status(500).json({
        ok: false,
        error: error?.message || "Lỗi khi trích xuất thuật ngữ mới.",
      });
    }
  });

  // ==========================================================================
  // 3. API TRUY XUẤT MÃ NGUỒN, TRẠNG THÁI PYTHON BACKEND & BỘ CÀI WINDOWS .EXE
  // ==========================================================================
  ensurePythonBackendRunning();

  app.get("/api/backend/status", async (_req, res) => {
    ensurePythonBackendRunning();
    try {
      const response = await fetch(`http://127.0.0.1:${PYTHON_BACKEND_PORT}/health`);
      const health = await response.json();
      res.json({ ok: true, pythonBackend: health });
    } catch (err: any) {
      res.json({
        ok: false,
        error: err?.message || "Python backend đang khởi động...",
      });
    }
  });

  app.get("/api/installer/info", (_req, res) => {
    const exePath = path.resolve(__dirname, "dist", "DichPhimAI-Setup.exe");
    if (!fs.existsSync(exePath)) {
      res.json({ exists: false, fileName: "DichPhimAI-Setup.exe" });
      return;
    }
    const stat = fs.statSync(exePath);
    const fd = fs.openSync(exePath, "r");
    const headerBuf = Buffer.alloc(2);
    fs.readSync(fd, headerBuf, 0, 2, 0);
    fs.closeSync(fd);
    const isMzPe = headerBuf.toString("ascii") === "MZ";

    res.json({
      exists: true,
      fileName: "DichPhimAI-Setup.exe",
      path: "dist/DichPhimAI-Setup.exe",
      sizeBytes: stat.size,
      sizeMb: Number((stat.size / (1024 * 1024)).toFixed(2)),
      isWindowsPeExecutable: isMzPe,
      updatedAt: stat.mtime.toISOString(),
    });
  });

  app.get("/api/installer/download", (_req, res) => {
    const exePath = path.resolve(__dirname, "dist", "DichPhimAI-Setup.exe");
    if (!fs.existsSync(exePath)) {
      res.status(404).json({ ok: false, error: "File DichPhimAI-Setup.exe chưa được tạo." });
      return;
    }
    res.download(exePath, "DichPhimAI-Setup.exe");
  });

  app.get("/api/blueprint/files", (_req, res) => {
    try {
      const readSafe = (relPath: string) => {
        const full = path.resolve(RESOURCES_ROOT, relPath);
        return fs.existsSync(full) ? fs.readFileSync(full, "utf-8") : "";
      };

      res.json({
        ok: true,
        files: {
          "backend/schema.sql": readSafe("backend/schema.sql"),
          "backend/init_db.py": readSafe("backend/init_db.py"),
          "backend/main.py": readSafe("backend/main.py"),
          "backend/requirements.txt": readSafe("backend/requirements.txt"),
          "backend/app/pipeline_mvp.py": readSafe("backend/app/pipeline_mvp.py"),
          "backend/app/queue_orchestrator.py": readSafe("backend/app/queue_orchestrator.py"),
          "backend/app/providers_full.py": readSafe("backend/app/providers_full.py"),
          "backend/app/lan_sync_server.py": readSafe("backend/app/lan_sync_server.py"),
          "backend/app/ocr_tts_muxer.py": readSafe("backend/app/ocr_tts_muxer.py"),
          "backend/cli.py": readSafe("backend/cli.py"),
          "backend/tests/test_full_system.py": readSafe("backend/tests/test_full_system.py"),
          "desktop/electron_main.ts": readSafe("desktop/electron_main.ts"),
          "desktop/preload.ts": readSafe("desktop/preload.ts"),
          "electron-builder.json": readSafe("electron-builder.json"),
          "mobile/lib/main.dart": readSafe("mobile/lib/main.dart"),
          "mobile/pubspec.yaml": readSafe("mobile/pubspec.yaml"),
          "prompts/movie_analysis.md": readPromptFile("movie_analysis.md", ""),
          "prompts/batch_translate.md": readPromptFile("batch_translate.md", ""),
          "prompts/second_pass_review.md": readPromptFile("second_pass_review.md", ""),
          "prompts/glossary_extract.md": readPromptFile("glossary_extract.md", ""),
        },
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error?.message });
    }
  });

  // ==========================================================================
  // 4. VITE DEV MIDDLEWARE / PRODUCTION STATIC ASSETS
  // ==========================================================================
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      plugins: [
        {
          name: "dichphim-hmr-http-server",
          config() {
            return {
              server: {
                hmr: {
                  server: httpServer,
                },
              },
            };
          },
        },
      ],
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`DịchPhim AI Server running on http://localhost:${PORT}`);
  });
}

startServer();

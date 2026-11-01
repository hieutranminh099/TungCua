var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_url = require("url");
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_meta = {};
import_dotenv.default.config();
var __filename = (0, import_url.fileURLToPath)(import_meta.url);
var __dirname = import_path.default.dirname(__filename);
function getGenAIClient() {
  return new import_genai.GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function readPromptFile(filename, fallback) {
  try {
    const filePath = import_path.default.resolve(__dirname, "prompts", filename);
    if (import_fs.default.existsSync(filePath)) {
      return import_fs.default.readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    console.error(`Error reading prompt file ${filename}:`, err);
  }
  return fallback;
}
var STATE_FILE = import_path.default.resolve(__dirname, "backend", "runtime_sync_state.json");
function loadSyncedState() {
  try {
    if (import_fs.default.existsSync(STATE_FILE)) {
      return JSON.parse(import_fs.default.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch (_) {
  }
  return null;
}
function saveSyncedState(state) {
  try {
    import_fs.default.mkdirSync(import_path.default.dirname(STATE_FILE), { recursive: true });
    import_fs.default.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save state:", err);
  }
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json({ limit: "25mb" }));
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
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveSyncedState(nextState);
    res.json({ ok: true, updatedAt: nextState.updatedAt });
  });
  app.post("/api/lan/pair", (req, res) => {
    const { code, deviceName, platform } = req.body || {};
    const cleanInput = String(code || "").replace(/\D/g, "");
    const cleanTarget = currentPairingCode.replace(/\D/g, "");
    if (cleanInput && cleanInput !== cleanTarget) {
      res.status(400).json({
        ok: false,
        error: "M\xE3 gh\xE9p \u0111\xF4i 6 s\u1ED1 kh\xF4ng kh\u1EDBp. Vui l\xF2ng ki\u1EC3m tra l\u1EA1i m\xE3 tr\xEAn m\xE0n h\xECnh m\xE1y t\xEDnh."
      });
      return;
    }
    const state = loadSyncedState() || {};
    const devices = Array.isArray(state.devices) ? state.devices : [];
    const newDevice = {
      id: `dev-mobile-${Date.now()}`,
      deviceName: deviceName || "\u0110i\u1EC7n tho\u1EA1i m\u1EDBi gh\xE9p \u0111\xF4i",
      platform: platform === "iOS" ? "iOS" : "Android",
      ipAddress: req.ip || "192.168.1.88",
      lastSync: "V\u1EEBa gh\xE9p \u0111\xF4i th\xE0nh c\xF4ng qua LAN",
      online: true,
      offlineDownloadedCount: 0
    };
    state.devices = [newDevice, ...devices];
    saveSyncedState(state);
    res.json({
      ok: true,
      token: `dp_lan_token_${Date.now()}`,
      device: newDevice
    });
  });
  app.put("/api/lan/subtitles/:movieId/lines/:lineId", (req, res) => {
    const { movieId, lineId } = req.params;
    const { textVi, deviceName } = req.body || {};
    const state = loadSyncedState();
    if (state && Array.isArray(state.movies)) {
      state.movies = state.movies.map((m) => {
        if (m.id !== movieId) return m;
        return {
          ...m,
          subtitles: (m.subtitles || []).map(
            (s) => s.id === lineId ? {
              ...s,
              textVi: textVi ?? s.textVi,
              editStatus: "user_edited",
              aiNotes: `\u0110\xE3 s\u1EEDa t\u1EEB ${deviceName || "App \u0110i\u1EC7n tho\u1EA1i"} \xB7 \u0110\u1ED3ng b\u1ED9 t\u1EE9c th\xEC v\u1EC1 M\xE1y t\xEDnh`
            } : s
          )
        };
      });
      saveSyncedState(state);
    }
    res.json({ ok: true });
  });
  app.put("/api/lan/progress/:movieId", (req, res) => {
    const { movieId } = req.params;
    const { positionSeconds } = req.body || {};
    const state = loadSyncedState();
    if (state && Array.isArray(state.movies)) {
      state.movies = state.movies.map(
        (m) => m.id === movieId ? { ...m, watchProgressSeconds: Number(positionSeconds) || m.watchProgressSeconds } : m
      );
      saveSyncedState(state);
    }
    res.json({ ok: true });
  });
  app.post("/api/ai/transcribe-media", async (req, res) => {
    try {
      const { mimeType, base64Data, movieProfile, fileName } = req.body || {};
      if (!base64Data) {
        res.status(400).json({ ok: false, error: "Thi\u1EBFu d\u1EEF li\u1EC7u media \u0111\u1EC3 nh\u1EADn d\u1EA1ng." });
        return;
      }
      const ai = getGenAIClient();
      const prompt = `B\u1EA1n l\xE0 h\u1EC7 th\u1ED1ng nh\u1EADn d\u1EA1ng gi\u1ECDng n\xF3i/ph\u1EE5 \u0111\u1EC1 ti\u1EBFng Trung (ASR + OCR) v\xE0 d\u1ECBch gi\u1EA3 phim Trung - Vi\u1EC7t theo ng\u1EEF c\u1EA3nh.
File \u0111\u1EA7u v\xE0o: "${fileName || "video.mp4"}"
H\u1ED3 s\u01A1 phim hi\u1EC7n t\u1EA1i:
${JSON.stringify(movieProfile || {}, null, 2)}

H\xE3y nghe \xE2m thanh / \u0111\u1ECDc ph\u1EE5 \u0111\u1EC1 ch\u1EEF H\xE1n trong media n\xE0y (n\u1EBFu media kh\xF4ng c\xF3 ti\u1EBFng Trung r\xF5 r\xE0ng, h\xE3y tr\xEDch xu\u1EA5t l\u1EDDi tho\u1EA1i ho\u1EB7c t\u1EA1o m\u1EABu ph\u1EE5 \u0111\u1EC1 kh\u1EDBp n\u1ED9i dung c\u1EA3nh quay) v\xE0 tr\u1EA3 v\u1EC1 danh s\xE1ch c\xE1c c\xE2u ph\u1EE5 \u0111\u1EC1 g\u1ED3m:
- start_ms, end_ms (mili-gi\xE2y t\u0103ng d\u1EA7n h\u1EE3p l\xFD)
- speaker_name_vi, speaker_name_zh
- text_zh (ch\u1EEF H\xE1n gi\u1EA3n th\u1EC3)
- text_pinyin (phi\xEAn \xE2m Pinyin c\xF3 thanh \u0111i\u1EC7u)
- text_vi (b\u1EA3n d\u1ECBch ti\u1EBFng Vi\u1EC7t chu\u1EA9n x\u01B0ng h\xF4 c\u1ED5 trang/hi\u1EC7n \u0111\u1EA1i theo H\u1ED3 s\u01A1 phim, t\u1ED1i \u0111a 42 k\xFD t\u1EF1/d\xF2ng, CPS <= 17)
- confidence (0.0 -> 1.0)
- ai_notes (gi\u1EA3i th\xEDch x\u01B0ng h\xF4 ho\u1EB7c thu\u1EADt ng\u1EEF \u0111\xE3 d\xF9ng)`;
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "video/mp4",
                data: base64Data
              }
            },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.ARRAY,
            items: {
              type: import_genai.Type.OBJECT,
              properties: {
                start_ms: { type: import_genai.Type.INTEGER },
                end_ms: { type: import_genai.Type.INTEGER },
                speaker_name_vi: { type: import_genai.Type.STRING },
                speaker_name_zh: { type: import_genai.Type.STRING },
                text_zh: { type: import_genai.Type.STRING },
                text_pinyin: { type: import_genai.Type.STRING },
                text_vi: { type: import_genai.Type.STRING },
                confidence: { type: import_genai.Type.NUMBER },
                ai_notes: { type: import_genai.Type.STRING }
              }
            }
          }
        }
      });
      const lines = JSON.parse((response.text ?? "[]").trim());
      res.json({ ok: true, lines });
    } catch (error) {
      console.error("Error in /api/ai/transcribe-media:", error);
      res.status(500).json({
        ok: false,
        error: error?.message || "L\u1ED7i khi nh\u1EADn d\u1EA1ng v\xE0 d\u1ECBch media b\u1EB1ng Gemini AI."
      });
    }
  });
  app.post("/api/ai/analyze-movie", async (req, res) => {
    try {
      const { titleZh, sampleLines } = req.body;
      const ai = getGenAIClient();
      const systemInstruction = readPromptFile(
        "movie_analysis.md",
        "B\u1EA1n l\xE0 chuy\xEAn gia ph\xE2n t\xEDch ng\u1EEF c\u1EA3nh phim Trung - Vi\u1EC7t."
      );
      const prompt = `T\xEAn phim g\u1ED1c (n\u1EBFu c\xF3): ${titleZh || "Ch\u01B0a r\xF5"}
D\u01B0\u1EDBi \u0111\xE2y l\xE0 m\u1EABu h\u1ED9i tho\u1EA1i ti\u1EBFng Trung tr\xEDch t\u1EEB phim:
${JSON.stringify(sampleLines || [], null, 2)}

H\xE3y ph\xE2n t\xEDch v\xE0 tr\u1EA3 v\u1EC1 H\u1ED3 s\u01A1 phim (th\u1EC3 lo\u1EA1i, b\u1ED1i c\u1EA3nh, quy t\u1EAFc x\u01B0ng h\xF4, danh s\xE1ch nh\xE2n v\u1EADt, quan h\u1EC7 x\u01B0ng h\xF4 gi\u1EEFa c\xE1c nh\xE2n v\u1EADt, v\xE0 t\u1EEB \u0111i\u1EC3n thu\u1EADt ng\u1EEF H\xE1n-Vi\u1EC7t/ti\u1EBFng Vi\u1EC7t nh\u1EA5t qu\xE1n).`;
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              title_vi: { type: import_genai.Type.STRING },
              genre: { type: import_genai.Type.STRING },
              era: { type: import_genai.Type.STRING },
              synopsis: { type: import_genai.Type.STRING },
              addressing_guide: { type: import_genai.Type.STRING },
              characters: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    name_zh: { type: import_genai.Type.STRING },
                    name_vi: { type: import_genai.Type.STRING },
                    gender: { type: import_genai.Type.STRING },
                    estimated_age: { type: import_genai.Type.STRING },
                    role: { type: import_genai.Type.STRING },
                    self_pronoun_default: { type: import_genai.Type.STRING },
                    address_others_default: { type: import_genai.Type.STRING },
                    personality_and_tone: { type: import_genai.Type.STRING }
                  }
                }
              },
              relationships: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    from_name_vi: { type: import_genai.Type.STRING },
                    to_name_vi: { type: import_genai.Type.STRING },
                    relation_type: { type: import_genai.Type.STRING },
                    pronoun_self: { type: import_genai.Type.STRING },
                    pronoun_target: { type: import_genai.Type.STRING },
                    context_note: { type: import_genai.Type.STRING }
                  }
                }
              },
              glossary: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    term_zh: { type: import_genai.Type.STRING },
                    term_vi: { type: import_genai.Type.STRING },
                    category: { type: import_genai.Type.STRING },
                    han_viet_literal: { type: import_genai.Type.STRING },
                    usage_note: { type: import_genai.Type.STRING }
                  }
                }
              }
            }
          }
        }
      });
      const parsed = JSON.parse((response.text ?? "{}").trim());
      res.json({ ok: true, profile: parsed });
    } catch (error) {
      console.error("Error in /api/ai/analyze-movie:", error);
      res.status(500).json({
        ok: false,
        error: error?.message || "Kh\xF4ng th\u1EC3 ph\xE2n t\xEDch h\u1ED3 s\u01A1 phim b\u1EB1ng AI."
      });
    }
  });
  app.post("/api/ai/translate-batch", async (req, res) => {
    try {
      const {
        movieProfile,
        translationStyle,
        contextBefore,
        targetLines,
        contextAfter
      } = req.body;
      const ai = getGenAIClient();
      const systemInstruction = readPromptFile(
        "batch_translate.md",
        "B\u1EA1n l\xE0 d\u1ECBch gi\u1EA3 ph\u1EE5 \u0111\u1EC1 phim Trung - Vi\u1EC7t cao c\u1EA5p."
      );
      const prompt = `## 1. H\u1ED2 S\u01A0 PHIM & QUY T\u1EAEC X\u01AFNG H\xD4
${JSON.stringify(movieProfile, null, 2)}

## 2. PHONG C\xC1CH D\u1ECACH Y\xCAU C\u1EA6U: ${translationStyle || "M\u01B0\u1EE3t m\xE0 t\u1EF1 nhi\xEAn"}
- Gi\u1EDBi h\u1EA1n hi\u1EC3n th\u1ECB: t\u1ED1i \u0111a 42 k\xFD t\u1EF1/d\xF2ng, t\u1ED1i \u0111a 2 d\xF2ng, t\u1ED1c \u0111\u1ED9 \u0111\u1ECDc CPS <= 17 k\xFD t\u1EF1/gi\xE2y.

## 3. C\u1EECA S\u1ED4 NG\u1EEE C\u1EA2NH TR\u01AF\u1EDAC (CH\u1EC8 THAM KH\u1EA2O, KH\xD4NG D\u1ECACH L\u1EA0I):
${JSON.stringify(contextBefore || [], null, 2)}

## 4. C\xC1C C\xC2U C\u1EA6N D\u1ECACH (TARGET LINES - B\u1EAET BU\u1ED8C D\u1ECACH \u0110\u1EA6Y \u0110\u1EE6 THEO ID):
${JSON.stringify(targetLines || [], null, 2)}

## 5. C\u1EECA S\u1ED4 NG\u1EEE C\u1EA2NH SAU (CH\u1EC8 THAM KH\u1EA2O, KH\xD4NG D\u1ECACH L\u1EA0I):
${JSON.stringify(contextAfter || [], null, 2)}`;
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.ARRAY,
            items: {
              type: import_genai.Type.OBJECT,
              properties: {
                id: { type: import_genai.Type.STRING },
                text_vi: { type: import_genai.Type.STRING },
                confidence: { type: import_genai.Type.NUMBER },
                ai_notes: { type: import_genai.Type.STRING }
              }
            }
          }
        }
      });
      const translations = JSON.parse((response.text ?? "[]").trim());
      res.json({ ok: true, translations });
    } catch (error) {
      console.error("Error in /api/ai/translate-batch:", error);
      res.status(500).json({
        ok: false,
        error: error?.message || "L\u1ED7i khi g\u1ECDi AI d\u1ECBch l\xF4 ph\u1EE5 \u0111\u1EC1."
      });
    }
  });
  app.post("/api/ai/review-pass2", async (req, res) => {
    try {
      const { movieProfile, translationStyle, lines } = req.body;
      const ai = getGenAIClient();
      const systemInstruction = readPromptFile(
        "second_pass_review.md",
        "B\u1EA1n l\xE0 bi\xEAn t\u1EADp vi\xEAn tr\u01B0\u1EDFng r\xE0 so\xE1t ph\u1EE5 \u0111\u1EC1 phim Trung - Vi\u1EC7t."
      );
      const prompt = `## H\u1ED2 S\u01A0 PHIM & T\u1EEA \u0110I\u1EC2N CHU\u1EA8N
${JSON.stringify(movieProfile, null, 2)}

## PHONG C\xC1CH D\u1ECACH: ${translationStyle || "M\u01B0\u1EE3t m\xE0 t\u1EF1 nhi\xEAn"}

## DANH S\xC1CH C\xC2U C\u1EA6N R\xC0 SO\xC1T L\u01AF\u1EE2T 2:
${JSON.stringify(lines || [], null, 2)}

H\xE3y ki\u1EC3m tra v\xE0 s\u1EEDa l\u1EA1i c\xE1c c\xE2u b\u1ECB l\u1EC7ch x\u01B0ng h\xF4 gi\u1EEFa c\xE1c nh\xE2n v\u1EADt, sai thu\u1EADt ng\u1EEF t\u1EEB \u0111i\u1EC3n, ho\u1EB7c c\xE2u qu\xE1 d\xE0i (CPS > 17 k\xFD t\u1EF1/gi\xE2y). Tr\u1EA3 v\u1EC1 danh s\xE1ch JSON \u0111\u1EA7y \u0111\u1EE7 c\xE1c c\xE2u sau khi r\xE0 so\xE1t.`;
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.ARRAY,
            items: {
              type: import_genai.Type.OBJECT,
              properties: {
                id: { type: import_genai.Type.STRING },
                text_vi: { type: import_genai.Type.STRING },
                confidence: { type: import_genai.Type.NUMBER },
                ai_notes: { type: import_genai.Type.STRING }
              }
            }
          }
        }
      });
      const reviewedLines = JSON.parse((response.text ?? "[]").trim());
      res.json({ ok: true, reviewedLines });
    } catch (error) {
      console.error("Error in /api/ai/review-pass2:", error);
      res.status(500).json({
        ok: false,
        error: error?.message || "L\u1ED7i khi r\xE0 so\xE1t ph\u1EE5 \u0111\u1EC1 l\u01B0\u1EE3t 2."
      });
    }
  });
  app.post("/api/ai/suggest-glossary", async (req, res) => {
    try {
      const { genre, era, lines } = req.body;
      const ai = getGenAIClient();
      const systemInstruction = readPromptFile(
        "glossary_extract.md",
        "B\u1EA1n l\xE0 chuy\xEAn gia tr\xEDch xu\u1EA5t thu\u1EADt ng\u1EEF phim Trung - Vi\u1EC7t."
      );
      const prompt = `Th\u1EC3 lo\u1EA1i phim: ${genre || "co_trang"} | B\u1ED1i c\u1EA3nh: ${era || "co_dai"}
Danh s\xE1ch c\xE2u tho\u1EA1i:
${JSON.stringify(lines || [], null, 2)}

H\xE3y tr\xEDch xu\u1EA5t c\xE1c t\xEAn ri\xEAng, m\xF4n ph\xE1i, c\xF4ng ph\xE1p, c\u1EA3nh gi\u1EDBi, th\xE0nh ng\u1EEF ho\u1EB7c ti\u1EBFng l\xF3ng xu\u1EA5t hi\u1EC7n trong \u0111o\u1EA1n h\u1ED9i tho\u1EA1i tr\xEAn.`;
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.ARRAY,
            items: {
              type: import_genai.Type.OBJECT,
              properties: {
                term_zh: { type: import_genai.Type.STRING },
                term_vi: { type: import_genai.Type.STRING },
                category: { type: import_genai.Type.STRING },
                han_viet_literal: { type: import_genai.Type.STRING },
                usage_note: { type: import_genai.Type.STRING }
              }
            }
          }
        }
      });
      const suggestions = JSON.parse((response.text ?? "[]").trim());
      res.json({ ok: true, suggestions });
    } catch (error) {
      console.error("Error in /api/ai/suggest-glossary:", error);
      res.status(500).json({
        ok: false,
        error: error?.message || "L\u1ED7i khi tr\xEDch xu\u1EA5t thu\u1EADt ng\u1EEF m\u1EDBi."
      });
    }
  });
  app.get("/api/blueprint/files", (_req, res) => {
    try {
      const readSafe = (relPath) => {
        const full = import_path.default.resolve(__dirname, relPath);
        return import_fs.default.existsSync(full) ? import_fs.default.readFileSync(full, "utf-8") : "";
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
          "mobile/lib/main.dart": readSafe("mobile/lib/main.dart"),
          "mobile/pubspec.yaml": readSafe("mobile/pubspec.yaml"),
          "prompts/movie_analysis.md": readPromptFile("movie_analysis.md", ""),
          "prompts/batch_translate.md": readPromptFile("batch_translate.md", ""),
          "prompts/second_pass_review.md": readPromptFile("second_pass_review.md", ""),
          "prompts/glossary_extract.md": readPromptFile("glossary_extract.md", "")
        }
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message });
    }
  });
  const httpServer = import_http.default.createServer(app);
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer
        }
      },
      plugins: [
        {
          name: "dichphim-hmr-http-server",
          config() {
            return {
              server: {
                hmr: {
                  server: httpServer
                }
              }
            };
          }
        }
      ],
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`D\u1ECBchPhim AI Server running on http://localhost:${PORT}`);
  });
}
startServer();

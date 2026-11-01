import { MovieRecord, PairedDevice, PipelineStep, VideoJob } from '../types/dichphim';

export function createPipelineSteps(
  activeIndex: number,
  activeProgress: number,
  failedIndex?: number
): PipelineStep[] {
  const definitions: Array<{ code: PipelineStep['code']; nameVi: string }> = [
    { code: 'EXTRACT_AUDIO', nameVi: '1. Trích âm thanh (FFmpeg 16kHz WAV / Demucs)' },
    { code: 'VAD_SEGMENT', nameVi: '2. Phát hiện giọng nói (Silero VAD chia đoạn)' },
    { code: 'ASR_TRANSCRIBE', nameVi: '3. Nhận dạng tiếng Trung (faster-whisper large-v3)' },
    { code: 'OCR_HARDSUB', nameVi: '4. OCR chữ cứng đáy hình (PaddleOCR 0.5s)' },
    { code: 'AI_MOVIE_PROFILE', nameVi: '5. Phân tích Hồ sơ phim & Xưng hô bằng AI' },
    { code: 'AI_CONTEXT_TRANSLATE', nameVi: '6. Dịch ngữ cảnh 2 lượt & Chấm điểm tự tin' },
    { code: 'GENERATE_SUBTITLES', nameVi: '7. Xuất phụ đề SRT / ASS / VTT song ngữ' },
    { code: 'TTS_DUBBING', nameVi: '8. Lồng tiếng Việt đa nhân vật (TTS)' },
    { code: 'EXPORT_VIDEO', nameVi: '9. Đóng gói video FFmpeg (Hardsub / Softsub)' },
    { code: 'LIBRARY_IMPORT', nameVi: '10. Đưa vào Kho phim & Đồng bộ LAN' },
  ];

  return definitions.map((def, idx) => {
    const order = idx + 1;
    if (failedIndex !== undefined && order === failedIndex) {
      return {
        code: def.code,
        order,
        nameVi: def.nameVi,
        status: 'failed',
        progress: activeProgress,
        checkpointInfo: 'Đã lưu checkpoint lô 14/22 vào SQLite',
      };
    }
    if (order < activeIndex) {
      return {
        code: def.code,
        order,
        nameVi: def.nameVi,
        status: 'completed',
        progress: 100,
      };
    }
    if (order === activeIndex) {
      return {
        code: def.code,
        order,
        nameVi: def.nameVi,
        status: 'running',
        progress: activeProgress,
        checkpointInfo: `Đang xử lý đoạn ${Math.max(1, Math.floor(activeProgress / 12))}/8`,
      };
    }
    return {
      code: def.code,
      order,
      nameVi: def.nameVi,
      status: 'pending',
      progress: 0,
    };
  });
}

export const INITIAL_MOVIES: MovieRecord[] = [
  {
    id: 'movie-xianxia-01',
    titleZh: '长月剑尊',
    titleVi: 'Trường Nguyệt Kiếm Tôn',
    titlePinyin: 'Cháng Yuè Jiàn Zūn',
    genre: 'tien_hiep',
    era: 'huyen_huyen',
    translationStyle: 'muot_ma',
    synopsis:
      'Đạm Đài Tẫn — Ma Tôn mang Tà Cốt ngàn năm — đối đầu cùng Lê Tô Tô, đệ tử chân truyền Hành Dương Tông vượt thời không trở về 500 năm trước để ngăn chặn đại kiếp tam giới.',
    addressingGuide:
      'Cổ trang / Tiên hiệp huyền huyễn: Tuyệt đối dùng hệ thống đại từ Hán-Việt cổ điển (bổn tọa, ta - ngươi, sư phụ - đồ nhi, sư huynh - tiểu sư muội, các hạ - tại hạ). Không dùng "tôi - bạn" hoặc "anh - cô".',
    posterTheme: 'xianxia',
    totalEpisodes: 40,
    completedEpisodes: 12,
    watchProgressSeconds: 1420,
    durationSeconds: 2740,
    characters: [
      {
        id: 'char-1',
        nameZh: '澹台烬',
        nameVi: 'Đạm Đài Tẫn',
        gender: 'Nam',
        estimatedAge: '22 tuổi (500 năm tu vi)',
        role: 'Chính',
        selfPronounDefault: 'bổn tọa / ta',
        addressOthersDefault: 'ngươi',
        personalityAndTone: 'Lạnh lùng, bá đạo, giọng văn cô đọng, uy nghiêm của bậc Ma Tôn',
        ttsVoiceId: 'vi-VN-NamMinhNeural (Trầm - Uy nghiêm)',
        verified: true,
      },
      {
        id: 'char-2',
        nameZh: '黎苏苏',
        nameVi: 'Lê Tô Tô',
        gender: 'Nữ',
        estimatedAge: '19 tuổi',
        role: 'Chính',
        selfPronounDefault: 'ta / đệ tử',
        addressOthersDefault: 'ngươi / người',
        personalityAndTone: 'Kiên định, chính trực, lễ độ với trưởng bối nhưng quyết liệt trước tà ma',
        ttsVoiceId: 'vi-VN-HoaiMyNeural (Trong trẻo - Kiên nghị)',
        verified: true,
      },
      {
        id: 'char-3',
        nameZh: '衢玄子',
        nameVi: 'Cù Huyền Tử',
        gender: 'Nam',
        estimatedAge: 'Trưởng lão 800 tuổi',
        role: 'Phụ',
        selfPronounDefault: 'vi sư / bản tọa',
        addressOthersDefault: 'đồ nhi / chư vị',
        personalityAndTone: 'Điềm đạm, từ tốn, chưởng môn Hành Dương Tông',
        ttsVoiceId: 'vi-VN-NamMinhNeural (Cao niên - Trầm ổn)',
        verified: true,
      },
      {
        id: 'char-4',
        nameZh: '萧凛',
        nameVi: 'Tiêu Lẫm',
        gender: 'Nam',
        estimatedAge: '24 tuổi',
        role: 'Phụ',
        selfPronounDefault: 'sư huynh / tại hạ',
        addressOthersDefault: 'sư muội / các hạ',
        personalityAndTone: 'Ôn nhu, quân tử, đại sư huynh Tiêu Dao Tông',
        ttsVoiceId: 'vi-VN-NamMinhNeural (Ấm áp - Quân tử)',
        verified: true,
      },
    ],
    relationships: [
      {
        id: 'rel-1',
        fromNameVi: 'Đạm Đài Tẫn',
        toNameVi: 'Lê Tô Tô',
        relationType: 'Túc địch / Phu thê định mệnh',
        pronounSelf: 'ta / bổn tọa',
        pronounTarget: 'ngươi / nàng',
        contextNote: 'Tập 1-10 xưng Bổn tọa - Ngươi; từ Tập 11 khi nảy sinh tình cảm đổi sang Ta - Nàng.',
      },
      {
        id: 'rel-2',
        fromNameVi: 'Lê Tô Tô',
        toNameVi: 'Cù Huyền Tử',
        relationType: 'Đồ đệ - Sư phụ (Chưởng môn)',
        pronounSelf: 'đệ tử / con',
        pronounTarget: 'sư phụ / người',
        contextNote: 'Luôn giữ kính ngữ trang trọng suốt bộ phim.',
      },
      {
        id: 'rel-3',
        fromNameVi: 'Tiêu Lẫm',
        toNameVi: 'Lê Tô Tô',
        relationType: 'Sư huynh - Sư muội đồng đạo',
        pronounSelf: 'sư huynh',
        pronounTarget: 'tiểu sư muội',
        contextNote: 'Xưng hô thân thiết, lễ nghĩa tiên môn.',
      },
    ],
    glossary: [
      {
        id: 'gloss-1',
        termZh: '衡阳宗',
        termVi: 'Hành Dương Tông',
        category: 'sect',
        hanVietLiteral: 'Hành Dương Tông',
        usageNote: 'Đệ nhất tiên môn chính phái, nơi Lê Tô Tô tu luyện',
        source: 'ai_suggested',
        approved: true,
      },
      {
        id: 'gloss-2',
        termZh: '邪骨',
        termVi: 'Tà Cốt',
        category: 'skill',
        hanVietLiteral: 'Tà Cốt',
        usageNote: 'Cội nguồn ma lực trong cơ thể Đạm Đài Tẫn, không dịch là "xương xấu"',
        source: 'user_added',
        approved: true,
      },
      {
        id: 'gloss-3',
        termZh: '倾世之玉',
        termVi: 'Khuynh Thế Chi Ngọc',
        category: 'skill',
        hanVietLiteral: 'Khuynh Thế Chi Ngọc',
        usageNote: 'Thượng cổ thần khí trấn phái',
        source: 'ai_suggested',
        approved: true,
      },
      {
        id: 'gloss-4',
        termZh: '过去镜',
        termVi: 'Quá Khứ Kính',
        category: 'skill',
        hanVietLiteral: 'Quá Khứ Kính',
        usageNote: 'Pháp bảo soi chiếu nhân quả 500 năm trước',
        source: 'ai_suggested',
        approved: true,
      },
      {
        id: 'gloss-5',
        termZh: '元神俱灭',
        termVi: 'nguyên thần câu diệt',
        category: 'idiom',
        hanVietLiteral: 'Nguyên thần câu diệt',
        usageNote: 'Thành ngữ chỉ sự tan biến hoàn toàn cả hồn lẫn xác trong tiên hiệp',
        source: 'learned_from_edit',
        approved: true,
      },
    ],
    subtitles: [
      {
        id: 'sub-101',
        episodeId: 'ep-xianxia-01',
        index: 1,
        startMs: 2000,
        endMs: 6200,
        speakerNameVi: 'Cù Huyền Tử',
        speakerNameZh: '衢玄子',
        source: 'MERGED',
        textZh: '苏苏，魔神澹台烬已经彻底炼化了邪骨，三界危在旦夕。',
        textPinyin: 'Sūsū, móshén Tántái Jìn yǐjīng chèdǐ liànhuàle xiégǔ, sānjiè wēi zài dànxī.',
        textViDraft: 'Tô Tô, Ma thần Đạm Đài Tẫn đã luyện hóa hoàn toàn Tà Cốt, tam giới nguy kịch sớm chiều.',
        textVi: 'Tô Tô, Ma thần Đạm Đài Tẫn đã luyện hóa Tà Cốt, tam giới nguy trong sớm tối.',
        confidence: 0.98,
        cps: 15.2,
        editStatus: 'ai_pass2',
        aiNotes: 'Đã khớp thuật ngữ "Tà Cốt" và rút gọn câu còn 15.2 ký tự/giây.',
      },
      {
        id: 'sub-102',
        episodeId: 'ep-xianxia-01',
        index: 2,
        startMs: 6500,
        endMs: 10300,
        speakerNameVi: 'Lê Tô Tô',
        speakerNameZh: '黎苏苏',
        source: 'ASR',
        textZh: '师父，弟子愿借过去镜回到五百年前，在他成魔之前抽毁邪骨！',
        textPinyin: 'Shīfu, dìzǐ yuàn jiè Guòqù Jìng huídào wǔbǎi nián qián, zài tā chéng mó zhīqián chōuhuǐ xiégǔ!',
        textViDraft: 'Sư phụ, đệ tử nguyện mượn Quá Khứ Kính về 500 năm trước, rút hủy Tà Cốt trước khi hắn thành ma!',
        textVi: 'Sư phụ, đệ tử nguyện mượn Quá Khứ Kính về 500 năm trước, hủy Tà Cốt trước khi hắn nhập ma!',
        confidence: 0.96,
        cps: 16.4,
        editStatus: 'ai_pass2',
        aiNotes: 'Xưng hô chuẩn: Sư phụ - Đệ tử. Đổi "thành ma" thành "nhập ma" đúng văn phong tiên hiệp.',
      },
      {
        id: 'sub-103',
        episodeId: 'ep-xianxia-01',
        index: 3,
        startMs: 10800,
        endMs: 15100,
        speakerNameVi: 'Đạm Đài Tẫn',
        speakerNameZh: '澹台烬',
        source: 'MERGED',
        textZh: '衡阳宗的余孽？凭你们这群蝼蚁，也妄想逆转本座的天命？',
        textPinyin: 'Héngyáng Zōng de yúniè? Píng nǐmen zhè qún lóuyǐ, yě wàngxiǎng nìzhuǎn běnzuò de tiānmìng?',
        textViDraft: 'Dư nghiệt của Hành Dương Tông? Dựa vào lũ kiến hôi các ngươi mà cũng đòi nghịch chuyển thiên mệnh của bổn tọa?',
        textVi: 'Dư nghiệt Hành Dương Tông? Lũ sâu kiến các ngươi mà dám nghịch chuyển thiên mệnh của bổn tọa?',
        confidence: 0.95,
        cps: 15.8,
        editStatus: 'ai_pass2',
        aiNotes: 'Giữ ngôi tự xưng "bổn tọa" của Đạm Đài Tẫn, dịch thành ngữ "蝼蚁" là "lũ sâu kiến".',
      },
      {
        id: 'sub-104',
        episodeId: 'ep-xianxia-01',
        index: 4,
        startMs: 15500,
        endMs: 19200,
        speakerNameVi: 'Tiêu Lẫm',
        speakerNameZh: '萧凛',
        source: 'ASR',
        textZh: '小师妹快走！我以倾世之玉布下结界，替你挡住他片刻！',
        textPinyin: 'Xiǎo shīmèi kuài zǒu! Wǒ yǐ Qīngshì Zhī Yù bùxià jiéjiè, tì nǐ dǎngzhù tā piànkè!',
        textViDraft: 'Tiểu sư muội mau đi! Tôi dùng Khuynh Thế Chi Ngọc lập kết giới cản hắn giúp muội một lát!',
        textVi: 'Tiểu sư muội mau đi! Sư huynh dùng Khuynh Thế Chi Ngọc lập kết giới cản hắn giúp muội!',
        confidence: 0.94,
        cps: 16.1,
        editStatus: 'user_edited',
        aiNotes: 'Lượt 2 đã sửa đại từ "Tôi" ở bản nháp thành "Sư huynh" theo quan hệ Tiêu Lẫm -> Lê Tô Tô.',
      },
      {
        id: 'sub-105',
        episodeId: 'ep-xianxia-01',
        index: 5,
        startMs: 19600,
        endMs: 23400,
        speakerNameVi: 'Đạm Đài Tẫn',
        speakerNameZh: '澹台烬',
        source: 'ASR',
        textZh: '区区结丹期修士，哪怕祭出本命仙器，今日也必叫你元神俱灭！',
        textPinyin: 'Qūqū jiédānqī xiūshì, nǎpà jìchū běnmìng xiānqì, jīnrì yě bì jiào nǐ yuánshén jù miè!',
        textViDraft: 'Chỉ là tu sĩ Kết Đan Kỳ, dù có tế ra bản mệnh tiên khí thì hôm nay cũng khiến ngươi nguyên thần câu diệt!',
        textVi: 'Chỉ là tu sĩ Kết Đan Kỳ, dù tế ra bản mệnh tiên khí cũng phải nguyên thần câu diệt!',
        confidence: 0.68,
        cps: 15.5,
        editStatus: 'ai_pass1',
        aiNotes: 'Cảnh báo độ tự tin (0.68): Cụm "本命仙器" (bản mệnh tiên khí) phát âm gần giống "本门仙器" (bản môn tiên khí) trong đoạn nhạc nền lớn, cần kiểm tra lại.',
      },
      {
        id: 'sub-106',
        episodeId: 'ep-xianxia-01',
        index: 6,
        startMs: 24000,
        endMs: 28200,
        speakerNameVi: 'Lê Tô Tô',
        speakerNameZh: '黎苏苏',
        source: 'MERGED',
        textZh: '澹台烬，哪怕跨越五百年沧海桑田，我也绝不会让你毁掉苍生！',
        textPinyin: 'Tántái Jìn, nǎpà kuàyuè wǔbǎi nián cānghǎi sāngtián, wǒ yě jué bù huì ràng nǐ huǐdiào cāngshēng!',
        textViDraft: 'Đạm Đài Tẫn, dù vượt qua 500 năm bãi bể nương dâu, ta cũng tuyệt đối không để ngươi hủy diệt thương sinh!',
        textVi: 'Đạm Đài Tẫn, dù qua 500 năm bể dâu, ta quyết không để ngươi hủy diệt thương sinh!',
        confidence: 0.97,
        cps: 15.0,
        editStatus: 'ai_pass2',
        aiNotes: 'Thành ngữ "沧海桑田" (thương hải tang điền) dịch thoát ý là "bể dâu" để vừa khít giới hạn 42 ký tự/dòng.',
      },
    ],
  },
  {
    id: 'movie-wuxia-02',
    titleZh: '庆余风云',
    titleVi: 'Khánh Dư Phong Vân',
    titlePinyin: 'Qìng Yú Fēng Yún',
    genre: 'co_trang',
    era: 'co_dai',
    translationStyle: 'trang_trong',
    synopsis:
      'Phạm Nhàn từ Đạm Châu bước vào kinh thành Nam Khánh, đối mặt với những cuộc đấu trí căng thẳng giữa Giám Sát Viện và triều đình.',
    addressingGuide:
      'Cổ trang triều đình quyền mưu: Dùng Trẫm - Thần, Bệ hạ - Vi thần, Đại nhân - Hạ quan, Tại hạ - Các hạ, Công tử - Cô nương.',
    posterTheme: 'wuxia_palace',
    totalEpisodes: 36,
    completedEpisodes: 36,
    watchProgressSeconds: 2610,
    durationSeconds: 2680,
    characters: [
      {
        id: 'char-w1',
        nameZh: '范闲',
        nameVi: 'Phạm Nhàn',
        gender: 'Nam',
        estimatedAge: '21 tuổi',
        role: 'Chính',
        selfPronounDefault: 'ta / vi thần / tại hạ',
        addressOthersDefault: 'ngươi / bệ hạ / đại nhân',
        personalityAndTone: 'Thông minh, sắc sảo, linh hoạt giữa lễ nghi triều đình và khẩu khí giang hồ',
        ttsVoiceId: 'vi-VN-NamMinhNeural',
        verified: true,
      },
      {
        id: 'char-w2',
        nameZh: '陈萍萍',
        nameVi: 'Trần Bình Bình',
        gender: 'Nam',
        estimatedAge: '55 tuổi',
        role: 'Phụ',
        selfPronounDefault: 'lão phu / ta',
        addressOthersDefault: 'ngươi / Phạm Nhàn',
        personalityAndTone: 'Thâm trầm, quyền uy, Viện trưởng Giám Sát Viện',
        ttsVoiceId: 'vi-VN-NamMinhNeural',
        verified: true,
      },
    ],
    relationships: [
      {
        id: 'rel-w1',
        fromNameVi: 'Phạm Nhàn',
        toNameVi: 'Trần Bình Bình',
        relationType: 'Hậu bối - Viện trưởng Giám Sát Viện',
        pronounSelf: 'vãn bối / con',
        pronounTarget: 'Viện trưởng / thúc thúc',
        contextNote: 'Kính trọng như bậc cha chú.',
      },
    ],
    glossary: [
      {
        id: 'gloss-w1',
        termZh: '鉴查院',
        termVi: 'Giám Sát Viện',
        category: 'sect',
        hanVietLiteral: 'Giám Tra Viện',
        usageNote: 'Cơ quan tình báo tối cao của Nam Khánh',
        source: 'user_added',
        approved: true,
      },
    ],
    subtitles: [
      {
        id: 'sub-201',
        episodeId: 'ep-wuxia-01',
        index: 1,
        startMs: 1200,
        endMs: 5600,
        speakerNameVi: 'Trần Bình Bình',
        speakerNameZh: '陈萍萍',
        source: 'ASR',
        textZh: '鉴查院立院之本，便是监察百官，哪怕皇子犯法亦与庶民同罪。',
        textPinyin: 'Jiànchá Yuàn lì yuàn zhī běn, biàn shì jiānchá bǎiguān, nǎpà huángzǐ fànfǎ yì yǔ shùmín tóng zuì.',
        textViDraft: 'Gốc rễ lập viện của Giám Sát Viện là giám sát bách quan, hoàng tử phạm pháp cũng đồng tội với thứ dân.',
        textVi: 'Gốc rễ của Giám Sát Viện là giám sát bách quan, hoàng tử phạm pháp cũng xử như thứ dân.',
        confidence: 0.96,
        cps: 15.6,
        editStatus: 'ai_pass2',
        aiNotes: 'Giữ nguyên tên riêng Giám Sát Viện.',
      },
    ],
  },
  {
    id: 'movie-modern-03',
    titleZh: '偷偷藏不住的星光',
    titleVi: 'Vụng Trộm Ánh Sao Đêm',
    titlePinyin: 'Tōutōu Cáng Bù Zhù De Xīngguāng',
    genre: 'ngon_tinh',
    era: 'hien_dai',
    translationStyle: 'muot_ma',
    synopsis:
      'Chuyện tình thanh xuân ấm áp giữa Tang Trĩ và Đoàn Gia Hứa từ những năm tháng giảng đường đại học ở Nam Vu đến khi trưởng thành.',
    addressingGuide:
      'Hiện đại / Ngôn tình thanh xuân: Đoàn Gia Hứa - Tang Trĩ xưng "Anh - Em" tự nhiên, ấm áp; bạn cùng phòng ký túc xá xưng "Tớ - Cậu" hoặc "Bà - Tui".',
    posterTheme: 'modern_romance',
    totalEpisodes: 25,
    completedEpisodes: 8,
    watchProgressSeconds: 890,
    durationSeconds: 2520,
    characters: [
      {
        id: 'char-m1',
        nameZh: '段嘉许',
        nameVi: 'Đoàn Gia Hứa',
        gender: 'Nam',
        estimatedAge: '26 tuổi',
        role: 'Chính',
        selfPronounDefault: 'anh',
        addressOthersDefault: 'em / cô bé',
        personalityAndTone: 'Dịu dàng, chiều chuộng, nói chuyện tinh tế',
        ttsVoiceId: 'vi-VN-NamMinhNeural',
        verified: true,
      },
      {
        id: 'char-m2',
        nameZh: '桑稚',
        nameVi: 'Tang Trĩ',
        gender: 'Nữ',
        estimatedAge: '20 tuổi',
        role: 'Chính',
        selfPronounDefault: 'em',
        addressOthersDefault: 'anh Gia Hứa',
        personalityAndTone: 'Trong sáng, chân thành, đôi lúc ngại ngùng',
        ttsVoiceId: 'vi-VN-HoaiMyNeural',
        verified: true,
      },
    ],
    relationships: [
      {
        id: 'rel-m1',
        fromNameVi: 'Đoàn Gia Hứa',
        toNameVi: 'Tang Trĩ',
        relationType: 'Anh trai bạn thân -> Người yêu',
        pronounSelf: 'anh',
        pronounTarget: 'em',
        contextNote: 'Xưng Anh - Em xuyên suốt.',
      },
    ],
    glossary: [
      {
        id: 'gloss-m1',
        termZh: '南芜大学',
        termVi: 'Đại học Nam Vu',
        category: 'location',
        hanVietLiteral: 'Nam Vu Đại Học',
        usageNote: 'Trường đại học nơi Tang Trĩ theo học',
        source: 'ai_suggested',
        approved: true,
      },
    ],
    subtitles: [
      {
        id: 'sub-301',
        episodeId: 'ep-modern-01',
        index: 1,
        startMs: 1500,
        endMs: 5200,
        speakerNameVi: 'Đoàn Gia Hứa',
        speakerNameZh: '段嘉许',
        source: 'ASR',
        textZh: '刚下晚自习？南芜今晚降温了，怎么只穿这么薄的外套？',
        textPinyin: 'Gāng xià wǎn zìxí? Nánwú jīnwǎn jiàngwēn le, zěnme zhǐ chuān zhème báo de wàitào?',
        textViDraft: 'Vừa tan học tối à? Nam Vu tối nay trở lạnh rồi, sao em chỉ mặc áo khoác mỏng thế này?',
        textVi: 'Vừa tan ca tự học tối à? Tối nay Nam Vu trở lạnh, sao em mặc áo khoác mỏng thế?',
        confidence: 0.98,
        cps: 15.8,
        editStatus: 'ai_pass2',
        aiNotes: 'Dùng đại từ "em" tự nhiên theo quan hệ Đoàn Gia Hứa -> Tang Trĩ.',
      },
    ],
  },
];

export const INITIAL_JOBS: VideoJob[] = [
  {
    id: 'job-01',
    movieId: 'movie-xianxia-01',
    movieTitleVi: 'Trường Nguyệt Kiếm Tôn',
    movieTitleZh: '长月剑尊',
    episodeNumber: 13,
    episodeTitle: 'Tập 13 - Đại Điện Phá Tà Cốt',
    fileName: 'TruongNguyetKiemTon_Tap13_4K_60fps.mkv',
    fileSizeMb: 1420,
    durationSeconds: 2740,
    resolution: '3840x2160 (HEVC)',
    status: 'running',
    priority: 95,
    currentStepCode: 'AI_CONTEXT_TRANSLATE',
    overallProgress: 64,
    speedMultiplier: 14.2,
    etaSeconds: 78,
    workerDevice: 'CUDA (RTX 4070 Ti 12GB)',
    asrModel: 'faster-whisper-large-v3',
    enableVocalSeparation: true,
    enableHardsubOcr: true,
    enableTwoPassReview: true,
    enableTtsDubbing: false,
    steps: createPipelineSteps(6, 68),
  },
  {
    id: 'job-02',
    movieId: 'movie-xianxia-01',
    movieTitleVi: 'Trường Nguyệt Kiếm Tôn',
    movieTitleZh: '长月剑尊',
    episodeNumber: 14,
    episodeTitle: 'Tập 14 - Quá Khứ Kính Nghịch Chuyển',
    fileName: '长月剑尊_第14集_1080p.mp4',
    fileSizeMb: 860,
    durationSeconds: 2690,
    resolution: '1920x1080 (H.264)',
    status: 'running',
    priority: 85,
    currentStepCode: 'ASR_TRANSCRIBE',
    overallProgress: 31,
    speedMultiplier: 11.8,
    etaSeconds: 165,
    workerDevice: 'CUDA (RTX 4070 Ti 12GB)',
    asrModel: 'faster-whisper-large-v3',
    enableVocalSeparation: true,
    enableHardsubOcr: true,
    enableTwoPassReview: true,
    enableTtsDubbing: false,
    steps: createPipelineSteps(3, 52),
  },
  {
    id: 'job-03',
    movieId: 'movie-modern-03',
    movieTitleVi: 'Vụng Trộm Ánh Sao Đêm',
    movieTitleZh: '偷偷藏不住的星光',
    episodeNumber: 9,
    episodeTitle: 'Tập 09 - Tuyết Đầu Mùa Ở Nam Vu',
    fileName: 'VungTromAnhSao_E09_WEB-DL.mp4',
    fileSizeMb: 690,
    durationSeconds: 2520,
    resolution: '1920x1080 (H.264)',
    status: 'queued',
    priority: 70,
    currentStepCode: 'EXTRACT_AUDIO',
    overallProgress: 0,
    speedMultiplier: 0,
    etaSeconds: 210,
    workerDevice: 'CUDA (RTX 4070 Ti 12GB)',
    asrModel: 'faster-whisper-large-v3',
    enableVocalSeparation: false,
    enableHardsubOcr: false,
    enableTwoPassReview: true,
    enableTtsDubbing: true,
    steps: createPipelineSteps(0, 0),
  },
  {
    id: 'job-04',
    movieId: 'movie-xianxia-01',
    movieTitleVi: 'Trường Nguyệt Kiếm Tôn',
    movieTitleZh: '长月剑尊',
    episodeNumber: 12,
    episodeTitle: 'Tập 12 - Hành Dương Tông Đại Kiếp',
    fileName: 'TruongNguyetKiemTon_Tap12_1080p.mp4',
    fileSizeMb: 910,
    durationSeconds: 2710,
    resolution: '1920x1080 (H.264)',
    status: 'completed',
    priority: 50,
    currentStepCode: 'LIBRARY_IMPORT',
    overallProgress: 100,
    speedMultiplier: 15.1,
    etaSeconds: 0,
    workerDevice: 'CUDA (RTX 4070 Ti 12GB)',
    asrModel: 'faster-whisper-large-v3',
    enableVocalSeparation: true,
    enableHardsubOcr: true,
    enableTwoPassReview: true,
    enableTtsDubbing: true,
    steps: createPipelineSteps(11, 100),
  },
];

export const INITIAL_PAIRED_DEVICES: PairedDevice[] = [
  {
    id: 'dev-iphone-16',
    deviceName: 'iPhone 16 Pro Max (Minh Hiếu)',
    platform: 'iOS',
    ipAddress: '192.168.1.45',
    lastSync: 'Vừa xong · Đang xem Tập 12 (23:40)',
    online: true,
    offlineDownloadedCount: 4,
  },
  {
    id: 'dev-galaxy-tab',
    deviceName: 'Samsung Galaxy Tab S9 Ultra',
    platform: 'Android',
    ipAddress: '192.168.1.68',
    lastSync: '18 phút trước · Đã tải 6 tập xem offline',
    online: true,
    offlineDownloadedCount: 6,
  },
];

export const PHASE_0_PROJECT_TREE = `dichphim-ai/
├── README.md                                  # Hướng dẫn tổng quan & Kiến trúc hệ thống
├── LICENSE
├── .gitignore
│
├── prompts/                                   # Toàn bộ System Prompt tiếng Việt/Anh cho LLM
│   ├── movie_analysis.md                      # Prompt phân tích Hồ sơ phim, nhân vật, xưng hô
│   ├── batch_translate.md                     # Prompt dịch theo lô kèm cửa sổ ngữ cảnh (Lượt 1)
│   ├── second_pass_review.md                  # Prompt rà soát nhất quán xưng hô & CPS (Lượt 2)
│   └── glossary_extract.md                    # Prompt trích xuất tên riêng & thành ngữ Hán-Việt
│
├── backend/                                   # Backend Python 3.11 + FastAPI + AI Pipeline
│   ├── pyproject.toml                         # Cấu hình project Python & pytest
│   ├── requirements.txt                       # Danh sách thư viện Python ghim phiên bản chuẩn
│   ├── schema.sql                             # Schema SQLite đầy đủ (11 bảng + Indexes + WAL)
│   ├── main.py                                # Điểm vào FastAPI Server (REST API + WebSocket + LAN mDNS)
│   ├── cli.py                                 # Giao diện dòng lệnh chạy thử MVP (Giai đoạn 1)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py                          # Quản lý cấu hình, đường dẫn FFmpeg, Keychain API Key
│   │   ├── database.py                        # Kết nối SQLAlchemy 2.0 (SQLite WAL mode)
│   │   ├── models.py                          # ORM Models khớp với schema.sql
│   │   ├── schemas.py                         # Pydantic v2 Schemas kiểm tra dữ liệu đầu ra LLM & API
│   │   ├── hardware.py                        # Tự phát hiện NVIDIA CUDA / Apple MPS / CPU & VRAM
│   │   ├── pipeline/                          # 10 bước xử lý mỗi video có lưu Checkpoint
│   │   │   ├── orchestrator.py                # Điều phối Job Queue, Pool Worker, Resume khi gián đoạn
│   │   │   ├── step01_audio.py                # FFmpeg trích WAV 16kHz mono + Demucs tách nhạc nền
│   │   │   ├── step02_vad.py                  # Silero VAD cắt đoạn thông minh (3-5 phút/đoạn)
│   │   │   ├── step03_asr.py                  # faster-whisper (large-v3/medium) & FunASR Paraformer
│   │   │   ├── step04_ocr.py                  # PaddleOCR đọc phụ đề cứng đáy khung hình (0.5s/lần)
│   │   │   ├── step05_movie_profile.py        # AI phân tích thể loại, nhân vật, quan hệ xưng hô
│   │   │   ├── step06_translator.py           # Dịch ngữ cảnh 2 lượt + Rate limit + Exponential backoff
│   │   │   ├── step07_subtitle_writer.py      # Xuất SRT, ASS (có style), VTT & Song ngữ Trung-Việt
│   │   │   ├── step08_tts_dubbing.py          # Edge-TTS / VietTTS lồng tiếng đa nhân vật & trộn audio
│   │   │   ├── step09_video_muxer.py          # FFmpeg gắn phụ đề mềm (softsub) hoặc đốt phụ đề cứng
│   │   │   └── step10_library_import.py       # Chụp ảnh bìa đẹp nhất, đưa vào Kho phim & bắn sự kiện WS
│   │   ├── providers/                         # Lớp trừu tượng TranslationProvider
│   │   │   ├── base.py                        # Abstract Base Class TranslationProvider
│   │   │   ├── gemini_provider.py             # Google GenAI SDK (gemini-3.8-flash / gemini-4-argon)
│   │   │   ├── claude_provider.py             # Anthropic Claude Provider
│   │   │   ├── openai_provider.py             # OpenAI Compatible Provider
│   │   │   └── ollama_provider.py             # Local LLM qua Ollama (chạy hoàn toàn offline)
│   │   ├── sync/                              # Đồng bộ Kho phim Máy tính <-> Điện thoại
│   │   │   ├── sync_interface.py              # Interface trừu tượng (LAN Sync / Cloud Supabase / Firebase)
│   │   │   ├── lan_server.py                  # HTTP Range Video Streaming, QR Pairing, Token Auth
│   │   │   └── mdns_broadcaster.py            # Phát quảng bá dịch vụ _dichphim._tcp.local. trong LAN
│   │   └── utils/
│   │       ├── episode_parser.py              # Tự nhận diện số tập (Tap01, E02, 第3集, EP04...)
│   │       ├── folder_watcher.py              # Watchdog theo dõi thư mục tự động dịch video mới
│   │       └── logger.py                      # Ghi log xoay vòng ra file & nén xuất log báo lỗi
│   └── tests/                                 # Unit Tests cốt lõi (pytest)
│       ├── test_batch_chunker.py              # Test chia lô câu thoại kèm cửa sổ ngữ cảnh
│       ├── test_llm_json_parser.py            # Test kiểm tra schema JSON & tự sửa lỗi JSON hỏng
│       ├── test_job_queue.py                  # Test hàng đợi ưu tiên, tạm dừng, phục hồi checkpoint
│       └── test_srt_ass_writer.py             # Test tính toán CPS <= 17, ngắt dòng <= 42 ký tự, xuất SRT
│
├── desktop/                                   # Ứng dụng Desktop (Electron + React + TypeScript + Tailwind)
│   ├── package.json
│   ├── electron/
│   │   ├── main.ts                            # Khởi động/tắt tiến trình Python FastAPI ngầm, IPC, Tray
│   │   └── preload.ts                         # Cầu nối bảo mật ContextBridge
│   └── src/
│       ├── App.tsx                            # Giao diện chính tiếng Việt (Sáng/Tối)
│       ├── components/
│       │   ├── WorkQueueView.tsx              # Màn hình Hàng đợi kéo thả & tiến độ 10 bước
│       │   ├── SubtitleEditorView.tsx         # Trình chỉnh sửa phụ đề + Video Player + Học từ sửa lỗi
│       │   ├── MovieProfileView.tsx           # Quản lý Hồ sơ phim, Nhân vật, Quan hệ, Từ điển Hán-Việt
│       │   ├── LibrarySyncView.tsx            # Kho phim & Ghép đôi điện thoại bằng mã QR / 6 số
│       │   └── SettingsView.tsx               # Cấu hình AI, GPU/VRAM, ASR Model, Thư mục theo dõi
│       └── services/
│           └── apiClient.ts                   # Giao tiếp REST + WebSocket với Python Backend
│
└── mobile/                                    # Ứng dụng Điện thoại Flutter (Android + iOS)
    ├── pubspec.yaml                           # Cấu hình thư viện Flutter (Dart 3.5+)
    └── lib/
        ├── main.dart                          # Điểm vào ứng dụng, Theme Sáng/Tối tối ưu một tay
        ├── core/
        │   ├── database/local_sqlite.dart     # SQLite cục bộ trên điện thoại (cache & xem offline)
        │   └── sync/sync_repository.dart      # Đồng bộ 2 chiều qua LAN HTTP Range + WebSocket
        └── features/
            ├── pairing/qr_scanner_screen.dart # Quét QR hoặc nhập mã 6 số ghép đôi với máy tính
            ├── library/library_screen.dart    # Kho phim, Đang xem dở, Mới thêm, Quản lý tải Offline
            ├── player/video_player_screen.dart# Phát stream LAN, phụ đề song ngữ, chọn track lồng tiếng
            └── editor/mobile_sub_editor.dart  # Chạm vào câu phụ đề để sửa trực tiếp & đồng bộ về PC`;

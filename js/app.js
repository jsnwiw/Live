/**
 * ==============================================================================
 * [js/app.js] 메인 애플리케이션 컨트롤러 (Main Application Controller)
 * ==============================================================================
 * 본 파일은 브라우저 DOM과 오디오 엔진, 비주얼라이저, 사용자 제스처를 총괄 연동합니다:
 * 1. Web Audio API 첫 클릭 자동 시작 (Autoplay 정책 해제)
 * 2. 6개 채널 세로 페이더 슬라이더 및 아날로그 로터리 노브 이벤트 바인딩
 * 3. 3D 공간 음향(Spatial Audio) 원룸 2D 평면도 사운드 퍽(Puck) 드래그 앤 드롭
 * 4. 컴퓨터 현재 시각(04:00~24:00) 기반 자동/수동 시간대 무드 조명 (Dawn/Day/Sunset/Midnight)
 * 5. 25분 뽀모도로 스터디 타이머 & 528Hz 싱잉볼 차임벨 알림
 * 6. 수면 슬립 페이드아웃 타이머 (마지막 3분 지수 감쇠)
 * 7. Zen Focus 대형 디지털 시계 전체화면 몰입 모드 (단축키: F)
 * 8. 33⅓ RPM 회전 바이닐 LP 턴테이블 위젯 인터랙션
 * 9. 실시간 6채널 VU 레벨 미터 애니메이션 루프
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. 전역 오디오 엔진 및 캔버스 비주얼라이저, 픽셀 룸 인스턴스 참조
  const audioEngine = window.audioEngine;
  const visualizer = new window.Visualizer('visualizer-canvas');
  visualizer.start();

  const pixelRoom = new window.PixelRoom('pixel-room-canvas');
  pixelRoom.start();

  let isStarted = false; // 오디오 컨텍스트 최초 시작 플래그

  // 2. 5가지 감성 사운드 프리셋 설정 정의 (각 채널 볼륨, 노브 수치, 테마)
  const presets = {
    midnight: {
      name: '심야 서재',
      icon: '🌙',
      rain: { vol: 0.65, reverb: 0.5 },
      cafe: { vol: 0.15, tone: 0.4 },
      fire: { vol: 0.45, crackle: 0.6 },
      ocean: { vol: 0.20, surge: 0.4 },
      binaural: { vol: 0.30, mode: 'alpha' },
      beat: { vol: 0.55, bpm: 72 },
      theme: 'midnight'
    },
    cafe: {
      name: '비 내리는 카페',
      icon: '☕',
      rain: { vol: 0.70, reverb: 0.3 },
      cafe: { vol: 0.75, tone: 0.7 },
      fire: { vol: 0.00, crackle: 0.2 },
      ocean: { vol: 0.00, surge: 0.3 },
      binaural: { vol: 0.15, mode: 'alpha' },
      beat: { vol: 0.40, bpm: 78 },
      theme: 'sunset'
    },
    fireplace: {
      name: '아늑한 오두막 벽난로',
      icon: '🔥',
      rain: { vol: 0.30, reverb: 0.6 },
      cafe: { vol: 0.00, tone: 0.3 },
      fire: { vol: 0.85, crackle: 0.8 },
      ocean: { vol: 0.00, surge: 0.2 },
      binaural: { vol: 0.25, mode: 'theta' },
      beat: { vol: 0.35, bpm: 68 },
      theme: 'sunset'
    },
    cyber: {
      name: '사이버펑크 네온',
      icon: '⚡',
      rain: { vol: 0.80, reverb: 0.7 },
      cafe: { vol: 0.20, tone: 0.8 },
      fire: { vol: 0.10, crackle: 0.3 },
      ocean: { vol: 0.30, surge: 0.6 },
      binaural: { vol: 0.35, mode: 'alpha' },
      beat: { vol: 0.75, bpm: 84 },
      theme: 'cyberpunk'
    },
    ocean: {
      name: '달빛 밤바다 산책',
      icon: '🌊',
      rain: { vol: 0.40, reverb: 0.6 },
      cafe: { vol: 0.00, tone: 0.3 },
      fire: { vol: 0.20, crackle: 0.4 },
      ocean: { vol: 0.85, surge: 0.75 },
      binaural: { vol: 0.40, mode: 'theta' },
      beat: { vol: 0.30, bpm: 66 },
      theme: 'midnight'
    }
  };

  let currentPresetKey = 'midnight';

  // ================= 1. 사용자 첫 제스처 시 오디오 컨텍스트 기동 =================
  const startAudioOnInteraction = async () => {
    if (!isStarted) {
      await audioEngine.init();
      isStarted = true;
      const playBtn = document.getElementById('btn-master-play');
      if (playBtn) {
        playBtn.innerHTML = `
          <svg class="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          <span class="text-xs font-semibold text-emerald-400 hidden md:inline">재생</span>
        `;
      }
      // 시작 안내 오버레이 부드럽게 제거
      const overlay = document.getElementById('start-overlay');
      if (overlay) {
        overlay.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => overlay.remove(), 400);
      }
    }
  };

  window.addEventListener('click', startAudioOnInteraction, { once: true });
  window.addEventListener('keydown', startAudioOnInteraction, { once: true });

  const startOverlay = document.getElementById('start-overlay');
  if (startOverlay) {
    startOverlay.addEventListener('click', startAudioOnInteraction);
  }

  // ================= 2. 마스터 일시정지 / 재생 버튼 =================
  const masterPlayBtn = document.getElementById('btn-master-play');
  if (masterPlayBtn) {
    masterPlayBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await startAudioOnInteraction();
      if (audioEngine.ctx.state === 'running') {
        audioEngine.ctx.suspend();
        masterPlayBtn.innerHTML = `
          <svg class="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <span class="text-xs font-semibold text-slate-400 hidden md:inline">일시정지</span>
        `;
        setTurntableSpin(false);
      } else {
        audioEngine.ctx.resume();
        masterPlayBtn.innerHTML = `
          <svg class="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          <span class="text-xs font-semibold text-emerald-400 hidden md:inline">재생</span>
        `;
        if (audioEngine.channels.beat.isPlaying) setTurntableSpin(true);
      }
    });
  }

  // ================= 3. 마스터 음소거(Mute) 버튼 =================
  const masterMuteBtn = document.getElementById('btn-master-mute');
  if (masterMuteBtn) {
    masterMuteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const muted = audioEngine.toggleMasterMute();
      if (muted) {
        masterMuteBtn.classList.add('text-rose-400', 'border-rose-500/40', 'bg-rose-500/10');
        setTurntableSpin(false);
      } else {
        masterMuteBtn.classList.remove('text-rose-400', 'border-rose-500/40', 'bg-rose-500/10');
        if (audioEngine.channels.beat.isPlaying) setTurntableSpin(true);
      }
    });
  }

  // ================= 4. 빈티지 바이닐 LP 잡음 FX 토글 버튼 =================
  const vinylFxBtn = document.getElementById('btn-vinyl-fx');
  if (vinylFxBtn) {
    vinylFxBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await startAudioOnInteraction();
      const active = audioEngine.toggleVinylFX();
      if (active) {
        vinylFxBtn.classList.add('text-amber-300', 'border-amber-400', 'bg-amber-500/20');
      } else {
        vinylFxBtn.classList.remove('text-amber-300', 'border-amber-400', 'bg-amber-500/20');
      }
    });
  }

  // ================= 5. 중앙 바이닐 턴테이블 위젯 회전 & 비트 연동 =================
  const turntableDeck = document.getElementById('turntable-deck');
  const vinylDisc = document.getElementById('vinyl-disc');
  const tonearm = document.getElementById('tonearm');

  function setTurntableSpin(spinning) {
    if (spinning) {
      vinylDisc?.classList.add('spinning');
      tonearm?.classList.add('playing');
    } else {
      vinylDisc?.classList.remove('spinning');
      tonearm?.classList.remove('playing');
    }
  }

  if (turntableDeck) {
    turntableDeck.addEventListener('click', async () => {
      await startAudioOnInteraction();
      const isPlaying = audioEngine.toggleChannelMute('beat');
      setTurntableSpin(isPlaying);
      const muteBtn = document.getElementById('btn-beat-mute');
      if (muteBtn) {
        if (isPlaying) {
          muteBtn.classList.remove('opacity-40', 'grayscale');
          muteBtn.classList.add('text-cyan-400');
        } else {
          muteBtn.classList.add('opacity-40', 'grayscale');
          muteBtn.classList.remove('text-cyan-400');
        }
      }
    });
  }

  // ================= 6. 시간대별 실시간 무드 조명 로직 =================
  const selectTimeMood = document.getElementById('select-time-mood');
  const currentMoodLabel = document.getElementById('current-mood-label');

  /**
   * 실제 컴퓨터 시각에 따라 환경 무드 결정
   */
  function determineAutoMood() {
    const hours = new Date().getHours();
    if (hours >= 4 && hours < 7) return { key: 'dawn', name: '새벽 안개 (05:00)' };
    if (hours >= 7 && hours < 17) return { key: 'day', name: '맑은 한낮 (14:00)' };
    if (hours >= 17 && hours < 20) return { key: 'sunset', name: '노을빛 저녁 (18:30)' };
    return { key: 'midnight', name: '고요한 심야 (23:00)' };
  }

  /**
   * 지정된 무드를 바디 속성 및 비주얼라이저에 반영
   */
  function applyTimeMood(moodKey) {
    let activeKey = moodKey;
    let labelName = '실시간 무드 동기화';

    if (moodKey === 'auto') {
      const autoData = determineAutoMood();
      activeKey = autoData.key;
      labelName = `자동: ${autoData.name}`;
    } else {
      const names = {
        dawn: '새벽 안개 (05:00)',
        day: '맑은 한낮 (14:00)',
        sunset: '노을빛 저녁 (18:30)',
        midnight: '고요한 심야 (23:00)'
      };
      labelName = names[activeKey] || activeKey;
    }

    document.body.setAttribute('data-time-mood', activeKey);
    if (currentMoodLabel) currentMoodLabel.textContent = labelName;

    // 비주얼라이저의 네온 색상 팔레트와 시간대 조명 동기화
    const themeMap = {
      dawn: 'cyberpunk',
      day: 'forest',
      sunset: 'sunset',
      midnight: 'midnight'
    };
    visualizer.setTheme(themeMap[activeKey] || 'midnight');

    // 픽셀 룸 창밖 풍경 실시간 동기화
    if (pixelRoom) {
      pixelRoom.setTimeMood(activeKey);
    }
  }

  if (selectTimeMood) {
    selectTimeMood.addEventListener('change', (e) => {
      applyTimeMood(e.target.value);
    });
    // 최초 실행 시 자동 시간대 계산 적용
    applyTimeMood('auto');
    // 10분마다 실제 시각 재확인
    setInterval(() => {
      if (selectTimeMood.value === 'auto') applyTimeMood('auto');
    }, 600000);
  }

  // ================= 7. 아날로그 로터리 노브 초기화 =================
  const rainReverbKnob = new window.RotaryKnob('#knob-rain-reverb', {
    min: 0, max: 1, step: 0.01, defaultValue: 0.40, unit: '%', label: '잔향감',
    onChange: (val) => audioEngine.setRainReverb(val)
  });

  const cafeToneKnob = new window.RotaryKnob('#knob-cafe-tone', {
    min: 0, max: 1, step: 0.01, defaultValue: 0.60, unit: 'Hz', label: '음색 필터',
    onChange: (val) => audioEngine.setCafeTone(val)
  });

  const fireCrackleKnob = new window.RotaryKnob('#knob-fire-crackle', {
    min: 0, max: 1, step: 0.01, defaultValue: 0.70, unit: 'POP', label: '타닥거림',
    onChange: (val) => audioEngine.setFireCrackle(val)
  });

  const oceanSurgeKnob = new window.RotaryKnob('#knob-ocean-surge', {
    min: 0, max: 1, step: 0.01, defaultValue: 0.50, unit: 'SURGE', label: '파도 세기',
    onChange: (val) => audioEngine.setOceanSurge(val)
  });

  const beatBpmKnob = new window.RotaryKnob('#knob-beat-bpm', {
    min: 60, max: 110, step: 1, defaultValue: 76, unit: 'BPM', label: '비트 템포',
    onChange: (val) => audioEngine.setBeatBpm(val)
  });

  // ================= 8. 바이노럴 비트 모드 선택 버튼 =================
  const binauralBtns = document.querySelectorAll('.binaural-mode-btn');
  binauralBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = btn.getAttribute('data-binaural');
      audioEngine.setBinauralMode(mode);
      binauralBtns.forEach(b => {
        if (b.getAttribute('data-binaural') === mode) {
          b.classList.add('bg-indigo-500/20', 'text-indigo-300', 'border-indigo-400/50');
          b.classList.remove('bg-white/5', 'text-slate-400', 'border-white/10');
        } else {
          b.classList.remove('bg-indigo-500/20', 'text-indigo-300', 'border-indigo-400/50');
          b.classList.add('bg-white/5', 'text-slate-400', 'border-white/10');
        }
      });
    });
  });

  // ================= 9. 6채널 세로 페이더 슬라이더 인터랙션 =================
  const channelSliders = {};
  const channelIds = ['rain', 'cafe', 'fire', 'ocean', 'binaural', 'beat'];

  channelIds.forEach(chId => {
    const track = document.getElementById(`slider-${chId}-track`);
    const fill = document.getElementById(`slider-${chId}-fill`);
    const thumb = document.getElementById(`slider-${chId}-thumb`);
    const valText = document.getElementById(`slider-${chId}-val`);
    const muteBtn = document.getElementById(`btn-${chId}-mute`);

    if (!track) return;
    let isDragging = false;

    // 슬라이더 시각적 높이 및 텍스트 퍼센트 갱신
    const updateSliderUI = (val) => {
      const pct = Math.round(val * 100);
      if (fill) fill.style.height = `${pct}%`;
      if (thumb) thumb.style.bottom = `${pct}%`;
      if (valText) valText.textContent = `${pct}%`;
    };

    // 마우스 Y좌표로부터 볼륨 비율 계산 (0.0 ~ 1.0)
    const handleSlide = (clientY) => {
      const rect = track.getBoundingClientRect();
      let ratio = (rect.bottom - clientY) / rect.height;
      ratio = Math.max(0, Math.min(1, ratio));
      audioEngine.setChannelVolume(chId, ratio);
      updateSliderUI(ratio);
    };

    track.addEventListener('mousedown', (e) => {
      isDragging = true;
      handleSlide(e.clientY);
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) handleSlide(e.clientY);
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    // 모바일 터치 슬라이드 지원
    track.addEventListener('touchstart', (e) => {
      isDragging = true;
      handleSlide(e.touches[0].clientY);
    });
    window.addEventListener('touchmove', (e) => {
      if (isDragging) handleSlide(e.touches[0].clientY);
    });
    window.addEventListener('touchend', () => { isDragging = false; });

    // 채널 개별 뮤트 토글
    if (muteBtn) {
      if (!audioEngine.channels[chId].isPlaying) {
        muteBtn.classList.add('opacity-40', 'grayscale');
        muteBtn.classList.remove('text-cyan-400');
      }
      muteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await startAudioOnInteraction();
        const isPlaying = audioEngine.toggleChannelMute(chId);
        if (isPlaying) {
          muteBtn.classList.remove('opacity-40', 'grayscale');
          muteBtn.classList.add('text-cyan-400');
        } else {
          muteBtn.classList.add('opacity-40', 'grayscale');
          muteBtn.classList.remove('text-cyan-400');
        }
        if (chId === 'beat') setTurntableSpin(isPlaying);
      });
    }

    channelSliders[chId] = {
      setVal: (v) => {
        audioEngine.setChannelVolume(chId, v);
        updateSliderUI(v);
      }
    };

    updateSliderUI(audioEngine.channels[chId].volume);
  });

  // ================= 10. 프리셋 일괄 전환 처리 =================
  const presetPills = document.querySelectorAll('.preset-pill');
  const presetTitle = document.getElementById('current-preset-name');
  const presetIcon = document.getElementById('current-preset-icon');

  function applyPreset(key) {
    const p = presets[key];
    if (!p) return;
    currentPresetKey = key;

    if (presetTitle) presetTitle.textContent = p.name;
    if (presetIcon) presetIcon.textContent = p.icon;

    // 6개 채널 볼륨 동기화
    channelSliders.rain?.setVal(p.rain.vol);
    channelSliders.cafe?.setVal(p.cafe.vol);
    channelSliders.fire?.setVal(p.fire.vol);
    channelSliders.ocean?.setVal(p.ocean.vol);
    channelSliders.binaural?.setVal(p.binaural.vol);
    channelSliders.beat?.setVal(p.beat.vol);

    // 노브 수치 동기화
    rainReverbKnob.setValue(p.rain.reverb);
    cafeToneKnob.setValue(p.cafe.tone);
    fireCrackleKnob.setValue(p.fire.crackle);
    oceanSurgeKnob.setValue(p.ocean.surge);
    beatBpmKnob.setValue(p.beat.bpm);

    // 바이노럴 버튼 동기화
    const targetModeBtn = document.querySelector(`[data-binaural="${p.binaural.mode}"]`);
    targetModeBtn?.click();

    presetPills.forEach(pill => {
      if (pill.getAttribute('data-preset') === key) {
        pill.classList.add('bg-white/15', 'border-cyan-400/60', 'text-white');
        pill.classList.remove('bg-white/5', 'border-white/10', 'text-slate-400');
      } else {
        pill.classList.remove('bg-white/15', 'border-cyan-400/60', 'text-white');
        pill.classList.add('bg-white/5', 'border-white/10', 'text-slate-400');
      }
    });

    setTurntableSpin(p.beat.vol > 0.05);
  }

  presetPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      startAudioOnInteraction();
      applyPreset(pill.getAttribute('data-preset'));
    });
  });

  // ================= 11. 실시간 6채널 VU 레벨 미터 애니메이션 루프 =================
  const vuMeters = {
    rain: document.getElementById('vu-meter-rain'),
    cafe: document.getElementById('vu-meter-cafe'),
    fire: document.getElementById('vu-meter-fire'),
    ocean: document.getElementById('vu-meter-ocean'),
    binaural: document.getElementById('vu-meter-binaural'),
    beat: document.getElementById('vu-meter-beat')
  };

  function updateVUMeters() {
    const isPlayingGlobal = audioEngine.ctx && audioEngine.ctx.state === 'running' && !audioEngine.isMuted;

    channelIds.forEach(chId => {
      const meterEl = vuMeters[chId];
      if (!meterEl) return;
      const ch = audioEngine.channels[chId];

      if (isPlayingGlobal && ch.isPlaying && ch.volume > 0.01) {
        // 채널 볼륨에 비례하며 자연스러운 떨림(Jitter) 부여
        const jitter = Math.random() * 0.25;
        const targetHeight = Math.min(100, Math.max(5, (ch.volume * 85) + (jitter * 20)));
        meterEl.style.height = `${targetHeight}%`;
      } else {
        meterEl.style.height = '0%';
      }
    });

    requestAnimationFrame(updateVUMeters);
  }
  requestAnimationFrame(updateVUMeters);

  // ================= 12. 3D 공간 음향 원룸 평면도 드래그 앤 드롭 인터랙션 =================
  const spatialModal = document.getElementById('spatial-modal');
  const btnSpatialModal = document.getElementById('btn-spatial-modal');
  const btnCloseSpatial = document.getElementById('btn-close-spatial');
  const btnResetSpatial = document.getElementById('btn-reset-spatial');
  const arena = document.getElementById('floorplan-arena');

  btnSpatialModal?.addEventListener('click', async () => {
    await startAudioOnInteraction();
    spatialModal.classList.remove('opacity-0', 'pointer-events-none');
    renderAllPuckPositions();
  });

  btnCloseSpatial?.addEventListener('click', () => {
    spatialModal.classList.add('opacity-0', 'pointer-events-none');
  });

  // 정규화 좌표 (-1.0 ~ +1.0)를 캔버스 픽셀 좌표(left, top)로 변환
  function normToArenaPixels(normX, normY) {
    if (!arena) return { left: 0, top: 0 };
    const w = arena.clientWidth;
    const h = arena.clientHeight;
    const left = ((normX + 1) / 2) * w;
    const top = ((normY + 1) / 2) * h;
    return { left, top };
  }

  // 픽셀 좌표를 정규화 좌표 (-1.0 ~ +1.0)로 역변환
  function arenaPixelsToNorm(leftPx, topPx) {
    if (!arena) return { normX: 0, normY: 0 };
    const w = arena.clientWidth;
    const h = arena.clientHeight;
    const normX = (leftPx / w) * 2 - 1;
    const normY = (topPx / h) * 2 - 1;
    return {
      normX: Math.max(-1, Math.min(1, normX)),
      normY: Math.max(-1, Math.min(1, normY))
    };
  }

  // 전체 사운드 퍽의 초기 위치 렌더링
  function renderAllPuckPositions() {
    channelIds.forEach(id => {
      const puck = document.getElementById(`puck-${id}`);
      if (!puck) return;
      const ch = audioEngine.channels[id];
      const pos = normToArenaPixels(ch.posX, ch.posY);
      puck.style.left = `${pos.left}px`;
      puck.style.top = `${pos.top}px`;
    });
  }

  // 6개 사운드 퍽에 마우스/터치 드래그 이벤트 바인딩
  channelIds.forEach(id => {
    const puck = document.getElementById(`puck-${id}`);
    if (!puck) return;

    let isDraggingPuck = false;

    const onPointerDown = (clientX, clientY) => {
      isDraggingPuck = true;
      puck.style.zIndex = 30;
      updatePuckFromPointer(clientX, clientY);
    };

    const updatePuckFromPointer = (clientX, clientY) => {
      const rect = arena.getBoundingClientRect();
      const leftPx = clientX - rect.left;
      const topPx = clientY - rect.top;

      puck.style.left = `${Math.max(20, Math.min(rect.width - 20, leftPx))}px`;
      puck.style.top = `${Math.max(20, Math.min(rect.height - 20, topPx))}px`;

      const norm = arenaPixelsToNorm(leftPx, topPx);
      audioEngine.updateChannelSpatialPosition(id, norm.normX, norm.normY);
    };

    puck.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onPointerDown(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (isDraggingPuck) updatePuckFromPointer(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingPuck) {
        isDraggingPuck = false;
        puck.style.zIndex = 20;
      }
    });

    // 모바일 터치 드래그 지원
    puck.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
    });

    window.addEventListener('touchmove', (e) => {
      if (isDraggingPuck) updatePuckFromPointer(e.touches[0].clientX, e.touches[0].clientY);
    });

    window.addEventListener('touchend', () => {
      isDraggingPuck = false;
      puck.style.zIndex = 20;
    });
  });

  // 공간 음향 기본 위치 리셋
  btnResetSpatial?.addEventListener('click', () => {
    const defaults = {
      rain: [-0.75, -0.65],
      cafe: [0.70, 0.70],
      fire: [0.80, -0.40],
      ocean: [-0.90, 0.20],
      binaural: [0.00, 0.00],
      beat: [0.00, -0.50]
    };
    channelIds.forEach(id => {
      const def = defaults[id];
      audioEngine.updateChannelSpatialPosition(id, def[0], def[1]);
    });
    renderAllPuckPositions();
  });

  // ================= 13. 뽀모도로 스터디 타이머 로직 =================
  let pomoDuration = 25 * 60;
  let pomoTimeLeft = pomoDuration;
  let pomoTimerId = null;
  let isPomoRunning = false;
  let currentPomoMode = 'focus';

  const pomoModal = document.getElementById('pomodoro-modal');
  const btnPomoModal = document.getElementById('btn-pomodoro-modal');
  const btnClosePomo = document.getElementById('btn-close-pomodoro');
  const btnPomoToggle = document.getElementById('btn-pomo-toggle');
  const btnPomoReset = document.getElementById('btn-pomo-reset');
  const headerPomoDisplay = document.getElementById('header-pomo-display');
  const modalPomoTime = document.getElementById('pomo-modal-time');
  const modalPomoLabel = document.getElementById('pomo-modal-label');
  const pomoProgressRing = document.getElementById('pomo-progress-ring');
  const zenPomoStatus = document.getElementById('zen-pomo-status');

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function updatePomoUI() {
    const formatted = formatTime(pomoTimeLeft);
    if (headerPomoDisplay) headerPomoDisplay.textContent = formatted;
    if (modalPomoTime) modalPomoTime.textContent = formatted;
    if (zenPomoStatus) zenPomoStatus.textContent = `POMODORO: ${formatted}`;

    if (pomoProgressRing) {
      const totalCirc = 276.46;
      const progress = pomoTimeLeft / pomoDuration;
      pomoProgressRing.style.strokeDashoffset = totalCirc * (1 - progress);
    }
  }

  function startPomoTimer() {
    if (pomoTimerId) clearInterval(pomoTimerId);
    isPomoRunning = true;
    btnPomoToggle.textContent = '일시정지 (PAUSE)';
    btnPomoToggle.classList.replace('bg-cyan-500', 'bg-amber-500');

    pomoTimerId = setInterval(() => {
      pomoTimeLeft--;
      updatePomoUI();

      if (pomoTimeLeft <= 0) {
        clearInterval(pomoTimerId);
        pomoTimerId = null;
        isPomoRunning = false;
        btnPomoToggle.textContent = '시작 (START)';
        btnPomoToggle.classList.replace('bg-amber-500', 'bg-cyan-500');

        // 세션 완료 알림 싱잉볼 차임벨 연주
        audioEngine.playChime();
        alert(currentPomoMode === 'focus' ? '🧘 집중 세션 완료! 5분 휴식을 시작해보세요.' : '✨ 휴식 끝! 새로운 집중 세션을 시작하세요.');
        setPomoMode(currentPomoMode === 'focus' ? 'short' : 'focus');
      }
    }, 1000);
  }

  function pausePomoTimer() {
    if (pomoTimerId) clearInterval(pomoTimerId);
    isPomoRunning = false;
    btnPomoToggle.textContent = '계속하기 (RESUME)';
    btnPomoToggle.classList.replace('bg-amber-500', 'bg-cyan-500');
  }

  function resetPomoTimer() {
    pausePomoTimer();
    pomoTimeLeft = pomoDuration;
    btnPomoToggle.textContent = '시작 (START)';
    updatePomoUI();
  }

  function setPomoMode(mode) {
    currentPomoMode = mode;
    if (mode === 'focus') pomoDuration = 25 * 60;
    else if (mode === 'short') pomoDuration = 5 * 60;
    else if (mode === 'long') pomoDuration = 15 * 60;
    modalPomoLabel.textContent = mode.toUpperCase() + ' TIME';
    resetPomoTimer();

    document.querySelectorAll('.pomo-mode-btn').forEach(b => {
      if (b.getAttribute('data-pomo-mode') === mode) {
        b.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-400/50');
        b.classList.remove('bg-white/5', 'text-slate-400', 'border-white/10');
      } else {
        b.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-400/50');
        b.classList.add('bg-white/5', 'text-slate-400', 'border-white/10');
      }
    });
  }

  document.querySelectorAll('.pomo-mode-btn').forEach(b => {
    b.addEventListener('click', () => setPomoMode(b.getAttribute('data-pomo-mode')));
  });

  btnPomoToggle?.addEventListener('click', () => {
    startAudioOnInteraction();
    if (isPomoRunning) pausePomoTimer();
    else startPomoTimer();
  });

  btnPomoReset?.addEventListener('click', resetPomoTimer);
  btnPomoModal?.addEventListener('click', () => pomoModal.classList.remove('opacity-0', 'pointer-events-none'));
  btnClosePomo?.addEventListener('click', () => pomoModal.classList.add('opacity-0', 'pointer-events-none'));

  // ================= 14. 수면 슬립 타이머 로직 =================
  const sleepModal = document.getElementById('sleep-modal');
  const btnSleepModal = document.getElementById('btn-sleep-modal');
  const btnCloseSleep = document.getElementById('btn-close-sleep');
  const sleepActiveBox = document.getElementById('sleep-active-box');
  const sleepCountdown = document.getElementById('sleep-countdown');
  const btnCancelSleep = document.getElementById('btn-cancel-sleep');
  const headerSleepDisplay = document.getElementById('header-sleep-display');

  btnSleepModal?.addEventListener('click', () => sleepModal.classList.remove('opacity-0', 'pointer-events-none'));
  btnCloseSleep?.addEventListener('click', () => sleepModal.classList.add('opacity-0', 'pointer-events-none'));

  document.querySelectorAll('.sleep-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.getAttribute('data-sleep-mins'), 10);
      startAudioOnInteraction();
      sleepActiveBox.classList.remove('hidden');

      audioEngine.startSleepTimer(
        mins,
        (secsLeft) => {
          const formatted = formatTime(secsLeft);
          if (sleepCountdown) sleepCountdown.textContent = formatted;
          if (headerSleepDisplay) headerSleepDisplay.textContent = formatted;
        },
        () => {
          if (headerSleepDisplay) headerSleepDisplay.textContent = 'SLEEP';
          sleepActiveBox.classList.add('hidden');
          masterPlayBtn?.click();
        }
      );
      sleepModal.classList.add('opacity-0', 'pointer-events-none');
    });
  });

  btnCancelSleep?.addEventListener('click', () => {
    audioEngine.cancelSleepTimer();
    sleepActiveBox.classList.add('hidden');
    if (headerSleepDisplay) headerSleepDisplay.textContent = 'SLEEP';
  });

  // ================= 15. Zen Focus 전체화면 모드 =================
  const btnZenMode = document.getElementById('btn-zen-mode');
  const btnExitZen = document.getElementById('btn-exit-zen');
  const zenClock = document.getElementById('zen-clock');

  function toggleZenMode() {
    document.body.classList.toggle('zen-active');
  }

  btnZenMode?.addEventListener('click', toggleZenMode);
  btnExitZen?.addEventListener('click', toggleZenMode);

  // 실시간 디지털 시계 루프 (1초 주기)
  function updateZenClock() {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    if (zenClock) zenClock.textContent = `${h}:${m}:${s}`;
  }
  setInterval(updateZenClock, 1000);
  updateZenClock();

  // ================= 17. [신규 기능 1] 비주얼라이저 모드 토글 (Ring / VU / Wave / Bars) =================
  const btnVisualMode = document.getElementById('btn-visual-mode');
  const labelVisualMode = document.getElementById('label-visual-mode');

  btnVisualMode?.addEventListener('click', (e) => {
    e.stopPropagation();
    const nextMode = visualizer.toggleNextMode();
    if (labelVisualMode) {
      const modeNames = { ring: '네온 링', vu: 'VU 바늘', wave: '오실로 파형', bars: '스펙트럼 바' };
      labelVisualMode.textContent = modeNames[nextMode] || nextMode;
    }
  });

  // ================= 18. [신규 기능 2] 중앙 센터피스 탭 전환 (턴테이블 vs 픽셀 룸) =================
  const tabTurntable = document.getElementById('tab-turntable');
  const tabPixelRoom = document.getElementById('tab-pixel-room');
  const pixelRoomDeck = document.getElementById('pixel-room-deck');

  function switchCenterpiece(activeTab) {
    if (activeTab === 'turntable') {
      turntableDeck?.classList.remove('hidden');
      pixelRoomDeck?.classList.add('hidden');
      tabTurntable?.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-400/40');
      tabTurntable?.classList.remove('text-slate-400');
      tabPixelRoom?.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-400/40');
      tabPixelRoom?.classList.add('text-slate-400');
    } else {
      turntableDeck?.classList.add('hidden');
      pixelRoomDeck?.classList.remove('hidden');
      pixelRoom.resize();
      tabPixelRoom?.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-400/40');
      tabPixelRoom?.classList.remove('text-slate-400');
      tabTurntable?.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-400/40');
      tabTurntable?.classList.add('text-slate-400');
    }
  }

  tabTurntable?.addEventListener('click', (e) => {
    e.stopPropagation();
    switchCenterpiece('turntable');
  });

  tabPixelRoom?.addEventListener('click', (e) => {
    e.stopPropagation();
    switchCenterpiece('pixelRoom');
  });

  // ================= 19. [신규 기능 3] Lo-Fi Vintage FX Rack 제어 =================
  const vintageModal = document.getElementById('vintage-fx-modal');
  const btnVintageModal = document.getElementById('btn-vintage-fx-modal');
  const btnCloseVintage = document.getElementById('btn-close-vintage-fx');

  // Muffled Filter
  const toggleMuffled = document.getElementById('toggle-muffled');
  const sliderMuffledCutoff = document.getElementById('slider-muffled-cutoff');
  const labelMuffledCutoff = document.getElementById('label-muffled-cutoff');
  let isMuffledActive = false;

  // Tape Wow & Flutter
  const toggleWowFlutter = document.getElementById('toggle-wow-flutter');
  const sliderWowDepth = document.getElementById('slider-wow-depth');
  const labelWowDepth = document.getElementById('label-wow-depth');
  let isWowActive = false;

  // Tape Warmth Saturation
  const toggleTapeWarmth = document.getElementById('toggle-tape-warmth');
  const sliderTapeDrive = document.getElementById('slider-tape-drive');
  const labelTapeDrive = document.getElementById('label-tape-drive');
  let isWarmthActive = false;

  // Vinyl Crackle
  const toggleVinylCrackle = document.getElementById('toggle-vinyl-crackle');
  const sliderVinylLevel = document.getElementById('slider-vinyl-level');
  const labelVinylLevel = document.getElementById('label-vinyl-level');

  btnVintageModal?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await startAudioOnInteraction();
    vintageModal?.classList.remove('opacity-0', 'pointer-events-none');
  });

  btnCloseVintage?.addEventListener('click', () => {
    vintageModal?.classList.add('opacity-0', 'pointer-events-none');
  });

  // Muffled 토글
  toggleMuffled?.addEventListener('click', async () => {
    await startAudioOnInteraction();
    isMuffledActive = !isMuffledActive;
    const cutoff = parseInt(sliderMuffledCutoff.value, 10);
    audioEngine.setMuffled(isMuffledActive, cutoff);
    if (isMuffledActive) {
      toggleMuffled.textContent = '켜짐';
      toggleMuffled.classList.replace('text-slate-400', 'text-amber-300');
      toggleMuffled.classList.add('bg-amber-500/20', 'border-amber-400/50');
    } else {
      toggleMuffled.textContent = '꺼짐';
      toggleMuffled.classList.replace('text-amber-300', 'text-slate-400');
      toggleMuffled.classList.remove('bg-amber-500/20', 'border-amber-400/50');
    }
  });

  sliderMuffledCutoff?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    labelMuffledCutoff.textContent = `${val}Hz`;
    if (isMuffledActive) audioEngine.setMuffled(true, val);
  });

  // Tape Wow/Flutter 토글
  toggleWowFlutter?.addEventListener('click', async () => {
    await startAudioOnInteraction();
    isWowActive = !isWowActive;
    const depthVal = parseInt(sliderWowDepth.value, 10) * 0.0006;
    audioEngine.setWowFlutter(isWowActive, depthVal, 0.55);
    if (isWowActive) {
      toggleWowFlutter.textContent = '켜짐';
      toggleWowFlutter.classList.replace('text-slate-400', 'text-cyan-300');
      toggleWowFlutter.classList.add('bg-cyan-500/20', 'border-cyan-400/50');
    } else {
      toggleWowFlutter.textContent = '꺼짐';
      toggleWowFlutter.classList.replace('text-cyan-300', 'text-slate-400');
      toggleWowFlutter.classList.remove('bg-cyan-500/20', 'border-cyan-400/50');
    }
  });

  sliderWowDepth?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    labelWowDepth.textContent = `${val * 10}%`;
    if (isWowActive) audioEngine.setWowFlutter(true, val * 0.0006, 0.55);
  });

  // Tape Warmth 토글
  toggleTapeWarmth?.addEventListener('click', async () => {
    await startAudioOnInteraction();
    isWarmthActive = !isWarmthActive;
    const drive = parseInt(sliderTapeDrive.value, 10) / 100;
    audioEngine.setTapeWarmth(isWarmthActive, drive);
    if (isWarmthActive) {
      toggleTapeWarmth.textContent = '켜짐';
      toggleTapeWarmth.classList.replace('text-slate-400', 'text-orange-300');
      toggleTapeWarmth.classList.add('bg-orange-500/20', 'border-orange-400/50');
    } else {
      toggleTapeWarmth.textContent = '꺼짐';
      toggleTapeWarmth.classList.replace('text-orange-300', 'text-slate-400');
      toggleTapeWarmth.classList.remove('bg-orange-500/20', 'border-orange-400/50');
    }
  });

  sliderTapeDrive?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    labelTapeDrive.textContent = `${val}%`;
    if (isWarmthActive) audioEngine.setTapeWarmth(true, val / 100);
  });

  // Vinyl Crackle 토글
  toggleVinylCrackle?.addEventListener('click', async () => {
    await startAudioOnInteraction();
    const active = audioEngine.toggleVinylFX();
    if (active) {
      toggleVinylCrackle.textContent = '켜짐';
      toggleVinylCrackle.classList.replace('text-slate-400', 'text-purple-300');
      toggleVinylCrackle.classList.add('bg-purple-500/20', 'border-purple-400/50');
    } else {
      toggleVinylCrackle.textContent = '꺼짐';
      toggleVinylCrackle.classList.replace('text-purple-300', 'text-slate-400');
      toggleVinylCrackle.classList.remove('bg-purple-500/20', 'border-purple-400/50');
    }
  });

  sliderVinylLevel?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    labelVinylLevel.textContent = `${val}%`;
    audioEngine.setVinylLevel(val / 100);
  });

  // ================= 20. [신규 기능 4] Keyboard Typing ASMR 제어 =================
  const typingModal = document.getElementById('typing-modal');
  const btnTypingModal = document.getElementById('btn-typing-modal');
  const btnCloseTyping = document.getElementById('btn-close-typing');
  const btnToggleTyping = document.getElementById('btn-toggle-typing');
  const labelTypingStatus = document.getElementById('label-typing-status');
  const btnModeMech = document.getElementById('btn-mode-mechanical');
  const btnModeTypewriter = document.getElementById('btn-mode-typewriter');
  const sliderTypingVol = document.getElementById('slider-typing-vol');
  const labelTypingVol = document.getElementById('label-typing-vol');
  const typingTestInput = document.getElementById('typing-test-input');

  let isTypingActive = false;

  btnTypingModal?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await startAudioOnInteraction();
    typingModal?.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => typingTestInput?.focus(), 100);
  });

  btnCloseTyping?.addEventListener('click', () => {
    typingModal?.classList.add('opacity-0', 'pointer-events-none');
  });

  btnToggleTyping?.addEventListener('click', async () => {
    await startAudioOnInteraction();
    isTypingActive = !isTypingActive;
    audioEngine.setTypingASMR(isTypingActive);

    if (isTypingActive) {
      btnToggleTyping.textContent = '켜짐';
      btnToggleTyping.classList.replace('text-slate-400', 'text-cyan-300');
      btnToggleTyping.classList.add('bg-cyan-500/20', 'border-cyan-400/50');
      if (labelTypingStatus) {
        labelTypingStatus.textContent = '타건: 켬';
        btnTypingModal.classList.add('border-cyan-400/50', 'text-cyan-300', 'bg-cyan-500/15');
      }
    } else {
      btnToggleTyping.textContent = '꺼짐';
      btnToggleTyping.classList.replace('text-cyan-300', 'text-slate-400');
      btnToggleTyping.classList.remove('bg-cyan-500/20', 'border-cyan-400/50');
      if (labelTypingStatus) {
        labelTypingStatus.textContent = '타건 ASMR';
        btnTypingModal.classList.remove('border-cyan-400/50', 'text-cyan-300', 'bg-cyan-500/15');
      }
    }
  });

  btnModeMech?.addEventListener('click', () => {
    audioEngine.setTypingASMR(isTypingActive, 'mechanical');
    btnModeMech.classList.add('border-cyan-400/50', 'bg-cyan-500/20', 'text-cyan-300');
    btnModeMech.classList.remove('border-white/10', 'bg-white/5', 'text-slate-400');
    btnModeTypewriter.classList.remove('border-cyan-400/50', 'bg-cyan-500/20', 'text-cyan-300');
    btnModeTypewriter.classList.add('border-white/10', 'bg-white/5', 'text-slate-400');
  });

  btnModeTypewriter?.addEventListener('click', () => {
    audioEngine.setTypingASMR(isTypingActive, 'typewriter');
    btnModeTypewriter.classList.add('border-cyan-400/50', 'bg-cyan-500/20', 'text-cyan-300');
    btnModeTypewriter.classList.remove('border-white/10', 'bg-white/5', 'text-slate-400');
    btnModeMech.classList.remove('border-cyan-400/50', 'bg-cyan-500/20', 'text-cyan-300');
    btnModeMech.classList.add('border-white/10', 'bg-white/5', 'text-slate-400');
  });

  sliderTypingVol?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    labelTypingVol.textContent = `${val}%`;
    audioEngine.setTypingASMR(isTypingActive, undefined, val / 100);
  });

  // 모달 바깥 배경 클릭 시 닫기
  window.addEventListener('click', (e) => {
    if (e.target === pomoModal) pomoModal.classList.add('opacity-0', 'pointer-events-none');
    if (e.target === sleepModal) sleepModal.classList.add('opacity-0', 'pointer-events-none');
    if (e.target === spatialModal) spatialModal.classList.add('opacity-0', 'pointer-events-none');
    if (e.target === vintageModal) vintageModal.classList.add('opacity-0', 'pointer-events-none');
    if (e.target === typingModal) typingModal.classList.add('opacity-0', 'pointer-events-none');
  });

  // ================= 16. 키보드 단축키 및 타이핑 ASMR 사운드 트리거 =================
  window.addEventListener('keydown', (e) => {
    // 키 종류 파악 (Space, Enter, Backspace, 일반키)
    let keyType = 'key';
    if (e.code === 'Space') keyType = 'space';
    else if (e.code === 'Enter') keyType = 'enter';
    else if (e.code === 'Backspace') keyType = 'backspace';

    // 타이핑 ASMR 사운드 재생
    if (audioEngine && audioEngine.typingASMR.enabled) {
      audioEngine.playTypingSound(keyType);
    }

    // 입력 폼에 포커스되어 있는 경우 전역 단축키는 가로채지 않음
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.code === 'KeyF') {
      e.preventDefault();
      toggleZenMode();
    } else if (e.code === 'Escape') {
      document.body.classList.remove('zen-active');
      pomoModal.classList.add('opacity-0', 'pointer-events-none');
      sleepModal.classList.add('opacity-0', 'pointer-events-none');
      spatialModal.classList.add('opacity-0', 'pointer-events-none');
      vintageModal?.classList.add('opacity-0', 'pointer-events-none');
      typingModal?.classList.add('opacity-0', 'pointer-events-none');
    } else if (e.code === 'Space') {
      e.preventDefault();
      masterMuteBtn?.click();
    } else if (e.key === '1') {
      document.getElementById('btn-rain-mute')?.click();
    } else if (e.key === '2') {
      document.getElementById('btn-cafe-mute')?.click();
    } else if (e.key === '3') {
      document.getElementById('btn-fire-mute')?.click();
    } else if (e.key === '4') {
      document.getElementById('btn-ocean-mute')?.click();
    } else if (e.key === '5') {
      document.getElementById('btn-binaural-mute')?.click();
    } else if (e.key === '6') {
      document.getElementById('btn-beat-mute')?.click();
    }
  });
});

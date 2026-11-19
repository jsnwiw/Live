/**
 * ==============================================================================
 * [js/visualizer.js] 오디오 반응형 비주얼라이저 & 유리창 빗방울 물리 엔진
 * ==============================================================================
 * HTML5 Canvas 2D API를 활용하여 다음 기능을 실시간으로 렌더링합니다:
 * 1. Web Audio AnalyserNode 기반의 FFT 주파수 원형 네온 리플(Circular Ripple)
 * 2. 베이스(저음역대) 비트에 반응하여 고동치는 중심 코어 및 부유 파티클
 * 3. 빗소리(Rain) 볼륨과 연동되어 유리창에 맺히고 중력에 의해 흘러내리는 빗방울 시뮬레이션
 */

class Visualizer {
  /**
   * 비주얼라이저 생성자
   * @param {string} canvasId - 렌더링 대상 캔버스 엘리먼트의 ID
   */
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.animationId = null;

    // 1. 테마별 컬러 팔레트 정의 (네온 시안, 로즈, 앰버, 에메랄드)
    this.themeColors = {
      midnight: {
        primary: 'rgb(56, 189, 248)',      // 밝은 시안 블루
        secondary: 'rgb(168, 85, 247)',    // 네온 퍼플
        glow: 'rgba(56, 189, 248, 0.45)',  // 중심 광원 글로우
        particle: 'rgba(125, 211, 252, '   // 파티클 색상 베이스
      },
      cyberpunk: {
        primary: 'rgb(244, 63, 94)',       // 네온 로즈/마젠타
        secondary: 'rgb(6, 182, 212)',     // 시안
        glow: 'rgba(244, 63, 94, 0.45)',
        particle: 'rgba(251, 113, 133, '
      },
      sunset: {
        primary: 'rgb(245, 158, 11)',      // 따뜻한 앰버
        secondary: 'rgb(239, 68, 68)',     // 노을 레드
        glow: 'rgba(245, 158, 11, 0.45)',
        particle: 'rgba(252, 211, 77, '
      },
      forest: {
        primary: 'rgb(16, 185, 129)',      // 에메랄드 그린
        secondary: 'rgb(20, 184, 166)',    // 틸 그린
        glow: 'rgba(16, 185, 129, 0.45)',
        particle: 'rgba(110, 231, 183, '
      }
    };

    this.currentTheme = 'midnight';

    // 2. 비주얼라이저 모드: 'ring' (원형 리플) | 'vu' (레트로 VU 바늘) | 'wave' (오실로스코프 파형) | 'bars' (스펙트럼 바)
    this.mode = 'ring';
    this.availableModes = ['ring', 'vu', 'wave', 'bars'];

    // VU 미터 바늘 물리 댐핑 변수
    this.vuNeedleL = -0.6; // 라디안
    this.vuNeedleR = -0.6;
    this.peakBars = new Array(36).fill(0);

    // 3. 부유 파티클 풀(Pool) 초기화
    this.particles = [];
    this.particleCount = 65;
    this.initParticles();

    // 3. 유리창 빗방울 풀(Pool) 및 설정
    this.raindrops = [];
    this.maxRaindrops = 70;
    this.lastDropTime = 0;

    // 4. 오디오 주파수 완충(Smoothing) 변수
    this.smoothBass = 0;
    this.smoothMid = 0;
    this.smoothTreble = 0;

    // 5. 화면 크기 반응형 리사이즈 등록
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * 비주얼라이저의 활성 테마 색상 변경
   * @param {string} themeName - 'midnight' | 'cyberpunk' | 'sunset' | 'forest'
   */
  setTheme(themeName) {
    if (this.themeColors[themeName]) {
      this.currentTheme = themeName;
    }
  }

  /**
   * 비주얼라이저 디스플레이 모드 설정
   * @param {string} mode - 'ring' | 'vu' | 'wave' | 'bars'
   */
  setMode(mode) {
    if (this.availableModes.includes(mode)) {
      this.mode = mode;
    }
  }

  /**
   * 다음 비주얼라이저 모드로 순환 토글
   */
  toggleNextMode() {
    const nextIdx = (this.availableModes.indexOf(this.mode) + 1) % this.availableModes.length;
    this.mode = this.availableModes[nextIdx];
    return this.mode;
  }

  /**
   * 기기의 DevicePixelRatio를 반영한 고해상도 캔버스 크기 조정
   */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.parentElement.clientWidth;
    this.height = this.canvas.parentElement.clientHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  /**
   * 화면 전체에 은은하게 떠다니는 배경 파티클 생성
   */
  initParticles() {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push({
        x: Math.random() * (window.innerWidth || 800),
        y: Math.random() * (window.innerHeight || 600),
        radius: Math.random() * 2.5 + 1,
        baseSpeedX: (Math.random() - 0.5) * 0.4,
        baseSpeedY: -Math.random() * 0.6 - 0.2, // 위로 천천히 부유
        opacity: Math.random() * 0.5 + 0.2
      });
    }
  }

  /**
   * 유리창 빗방울 생성 함수
   * 빗소리 볼륨 강도에 따라 크기와 흘러내림 여부 결정
   * @param {number} rainIntensity - 빗소리 채널 볼륨 (0.0 ~ 1.0)
   */
  spawnRaindrop(rainIntensity) {
    if (this.raindrops.length >= this.maxRaindrops) return;
    const isDrip = Math.random() < 0.25; // 약 25% 확률로 아래로 주르륵 흘러내림
    this.raindrops.push({
      x: Math.random() * this.width,
      y: Math.random() * this.height * 0.8,
      radius: Math.random() * 2.8 + (isDrip ? 2.5 : 1.2),
      opacity: Math.random() * 0.4 + 0.25,
      isDrip: isDrip,
      speedY: isDrip ? (Math.random() * 1.5 + 0.8) * rainIntensity : 0, // 빗소리가 클수록 빠르게 낙하
      trail: [], // 흘러내린 자리에 남는 물방울 잔상
      life: Math.random() * 600 + 400
    });
  }

  /**
   * 유리창 빗방울 물리 업데이트 및 렌더링
   * 굴절 광택 효과 및 물길(Trail) 표현
   */
  updateAndDrawRaindrops(ctx, rainVolume) {
    const now = Date.now();
    // 빗소리 볼륨이 클수록 빗방울 생성 간격이 짧아짐
    if (rainVolume > 0.05 && now - this.lastDropTime > (350 / Math.max(0.2, rainVolume))) {
      this.spawnRaindrop(rainVolume);
      this.lastDropTime = now;
    }

    for (let i = this.raindrops.length - 1; i >= 0; i--) {
      const drop = this.raindrops[i];
      drop.life--;

      // 아래로 흘러내리는 경우 Y좌표 이동 및 궤적 기록
      if (drop.isDrip) {
        drop.y += drop.speedY;
        if (Math.random() < 0.3) {
          drop.trail.push({ x: drop.x + (Math.random() - 0.5) * 1.5, y: drop.y, r: drop.radius * 0.35, alpha: 0.25 });
        }
      }

      // 빗방울이 지나간 자리에 남는 미세 잔상 렌더링
      for (let t of drop.trail) {
        t.alpha -= 0.003;
        if (t.alpha > 0) {
          ctx.fillStyle = `rgba(186, 230, 253, ${t.alpha})`;
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      drop.trail = drop.trail.filter(t => t.alpha > 0);

      // 본체 빗방울 렌더링 (유리 질감 방사형 그라데이션)
      ctx.save();
      const grad = ctx.createRadialGradient(drop.x - drop.radius * 0.3, drop.y - drop.radius * 0.3, 0.5, drop.x, drop.y, drop.radius);
      grad.addColorStop(0, `rgba(255, 255, 255, ${drop.opacity * 1.2})`);
      grad.addColorStop(0.5, `rgba(186, 230, 253, ${drop.opacity * 0.6})`);
      grad.addColorStop(1, `rgba(15, 23, 42, 0.4)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      if (drop.isDrip) {
        ctx.ellipse(drop.x, drop.y, drop.radius * 0.8, drop.radius * 1.2, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      }
      ctx.fill();

      // 빛 반사 하이라이트 핀포인트
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(drop.x - drop.radius * 0.35, drop.y - drop.radius * 0.35, drop.radius * 0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // 화면 아래로 벗어나거나 수명이 다한 물방울 제거
      if (drop.y > this.height + 20 || drop.life <= 0) {
        this.raindrops.splice(i, 1);
      }
    }
  }

  /**
   * 렌더링 애니메이션 루프 시작
   */
  start() {
    if (this.animationId) return;
    const render = () => {
      this.draw();
      this.animationId = requestAnimationFrame(render);
    };
    this.animationId = requestAnimationFrame(render);
  }

  /**
   * 렌더링 애니메이션 루프 정지
   */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * 매 프레임 실행되는 메인 캔버스 렌더링 함수
   */
  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const colors = this.themeColors[this.currentTheme];

    // 이전 프레임 클리어
    ctx.clearRect(0, 0, w, h);

    // 1. Web Audio API에서 실시간 FFT 주파수 스펙트럼 데이터 수집
    let freqData = new Uint8Array(64);
    let bass = 0, mid = 0, treble = 0;
    let rainVolume = 0.5;

    if (window.audioEngine) {
      if (window.audioEngine.channels && window.audioEngine.channels.rain) {
        const rainCh = window.audioEngine.channels.rain;
        rainVolume = (rainCh.isPlaying && !window.audioEngine.isMuted) ? rainCh.volume : 0;
      }

      if (window.audioEngine.analyser) {
        const analyser = window.audioEngine.analyser;
        const bufferLength = analyser.frequencyBinCount;
        const fArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(fArray);

        // 원형 링을 위해 64개 빈(Bin)으로 다운샘플링
        const step = Math.floor(bufferLength / 64);
        for (let i = 0; i < 64; i++) {
          freqData[i] = fArray[i * step] || 0;
        }

        // 주파수 대역별(저음, 중음, 고음) 에너지 계산
        for (let i = 0; i < 8; i++) bass += fArray[i];
        for (let i = 8; i < 28; i++) mid += fArray[i];
        for (let i = 28; i < 64; i++) treble += fArray[i];

        bass = bass / 8 / 255;
        mid = mid / 20 / 255;
        treble = treble / 36 / 255;
      }
    }

    // 소리가 멈춰있을 때 자연스러운 호흡(Ambient Breathing) 연출
    if (bass === 0 && mid === 0) {
      const t = Date.now() * 0.002;
      bass = 0.15 + Math.sin(t) * 0.08;
      mid = 0.12 + Math.cos(t * 1.3) * 0.06;
      treble = 0.1 + Math.sin(t * 0.8) * 0.04;
    }

    // 급격한 떨림 방지를 위한 지수 평활화(Exponential Smoothing)
    this.smoothBass += (bass - this.smoothBass) * 0.15;
    this.smoothMid += (mid - this.smoothMid) * 0.15;
    this.smoothTreble += (treble - this.smoothTreble) * 0.15;

    const centerX = w / 2;
    const centerY = h / 2;

    // [레이어 1] 배경 부유 파티클 렌더링
    this.drawParticles(ctx, w, h, colors, this.smoothBass);

    // [레이어 2] 화면 중앙 앰비언트 글로우 오라(Ambient Glow Orbs)
    const glowRadius = Math.min(w, h) * 0.22 * (1 + this.smoothBass * 0.45);
    const gradGlow = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, glowRadius);
    gradGlow.addColorStop(0, colors.glow);
    gradGlow.addColorStop(0.5, 'rgba(15, 23, 42, 0.2)');
    gradGlow.addColorStop(1, 'rgba(10, 14, 23, 0)');

    ctx.fillStyle = gradGlow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // [레이어 3 & 4] 선택된 모드에 따른 비주얼라이저 렌더링
    if (this.mode === 'ring') {
      this.drawRingVisual(ctx, w, h, colors, freqData, centerX, centerY);
    } else if (this.mode === 'vu') {
      this.drawVUNeedles(ctx, w, h, colors, this.smoothBass, this.smoothMid, this.smoothTreble);
    } else if (this.mode === 'wave') {
      this.drawOscilloscope(ctx, w, h, colors);
    } else if (this.mode === 'bars') {
      this.drawCyberpunkBars(ctx, w, h, colors, freqData);
    }

    // [레이어 5] 유리창 빗방울 물리 레이어 렌더링
    this.updateAndDrawRaindrops(ctx, rainVolume);
  }

  /**
   * [Mode 1: Ring] 원형 네온 리플 & 중심 펄스 코어
   */
  drawRingVisual(ctx, w, h, colors, freqData, centerX, centerY) {
    const baseRadius = Math.min(w, h) * 0.18;
    const points = 64;
    const angleStep = (Math.PI * 2) / points;

    // 외곽 주파수 링
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = colors.primary;
    ctx.shadowColor = colors.primary;
    ctx.shadowBlur = 15 + this.smoothBass * 20;

    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const idx = i % points;
      const amp = (freqData[idx] / 255) * 45 * (1 + this.smoothBass * 0.8);
      const r = baseRadius + amp;
      const angle = i * angleStep;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 내부 보조 하모닉 링
    ctx.save();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = colors.secondary;
    ctx.shadowColor = colors.secondary;
    ctx.shadowBlur = 10;

    const innerRadius = baseRadius * 0.75;
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const idx = (points - 1 - (i % points));
      const amp = (freqData[idx] / 255) * 25 * (1 + this.smoothTreble * 0.6);
      const r = innerRadius - amp * 0.5;
      const angle = i * angleStep;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 중심부 네온 코어 펄스
    ctx.save();
    const coreRadius = (baseRadius * 0.42) * (1 + this.smoothBass * 0.15);
    const coreGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    coreGrad.addColorStop(0.7, colors.secondary);
    coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0.2)');

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * [Mode 2: VU Meter] 클래식 레트로 카세트 데크 듀얼 아날로그 바늘 미터
   */
  drawVUNeedles(ctx, w, h, colors, bass, mid, treble) {
    const meterWidth = Math.min(260, w * 0.38);
    const meterHeight = meterWidth * 0.55;
    const gap = 20;
    const centerY = h * 0.46;
    const leftX = (w / 2) - meterWidth - (gap / 2);
    const rightX = (w / 2) + (gap / 2);

    // 바늘 목표 각도 계산 (베이스 + 미드에 반응, -42도 ~ +42도)
    const targetAngleL = -0.75 + (bass * 1.25 + mid * 0.25) * 1.5;
    const targetAngleR = -0.75 + (bass * 0.9 + treble * 0.6) * 1.5;

    // 물리적 바늘 스프링 탄성 댐핑
    this.vuNeedleL += (Math.max(-0.75, Math.min(0.75, targetAngleL)) - this.vuNeedleL) * 0.18;
    this.vuNeedleR += (Math.max(-0.75, Math.min(0.75, targetAngleR)) - this.vuNeedleR) * 0.18;

    this.renderSingleVUMeter(ctx, leftX, centerY - meterHeight / 2, meterWidth, meterHeight, this.vuNeedleL, 'LEFT CHANNEL', colors);
    this.renderSingleVUMeter(ctx, rightX, centerY - meterHeight / 2, meterWidth, meterHeight, this.vuNeedleR, 'RIGHT CHANNEL', colors);
  }

  renderSingleVUMeter(ctx, x, y, width, height, needleAngle, label, colors) {
    ctx.save();

    // 1. 빈티지 오디오 미터 하우징 (따뜻한 레트로 백라이트)
    ctx.fillStyle = 'rgba(10, 15, 25, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, width, height, 12) : ctx.rect(x, y, width, height);
    ctx.fill();
    ctx.stroke();

    // 백라이트 은은한 앰버 웜톤 글로우
    const bgGrad = ctx.createRadialGradient(x + width / 2, y + height * 0.75, 5, x + width / 2, y + height * 0.75, width * 0.6);
    bgGrad.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
    bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // 2. 아치형 눈금 호 (Arc Scales: -20 ~ 0dB Black, 0 ~ +3dB Red)
    const pivotX = x + width / 2;
    const pivotY = y + height * 0.95;
    const arcRadius = height * 0.78;

    // 안전 구역 (-20 ~ 0dB)
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, arcRadius, -Math.PI * 0.75, -Math.PI * 0.46, false);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 레드존 (0 ~ +3dB)
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, arcRadius, -Math.PI * 0.46, -Math.PI * 0.25, false);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // dB 눈금 틱
    const ticks = [
      { a: -0.72, text: '-20' },
      { a: -0.52, text: '-10' },
      { a: -0.32, text: '-5' },
      { a: -0.15, text: '-3' },
      { a: 0.0, text: '0' },
      { a: 0.18, text: '+1' },
      { a: 0.35, text: '+3' }
    ];

    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ticks.forEach(t => {
      const rad = -Math.PI * 0.5 + t.a;
      const x1 = pivotX + Math.cos(rad) * (arcRadius - 4);
      const y1 = pivotY + Math.sin(rad) * (arcRadius - 4);
      const x2 = pivotX + Math.cos(rad) * (arcRadius + 4);
      const y2 = pivotY + Math.sin(rad) * (arcRadius + 4);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = t.a >= 0 ? '#ef4444' : 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const tx = pivotX + Math.cos(rad) * (arcRadius - 10);
      const ty = pivotY + Math.sin(rad) * (arcRadius - 10);
      ctx.fillStyle = t.a >= 0 ? '#ef4444' : 'rgba(148, 163, 184, 0.7)';
      ctx.fillText(t.text, tx, ty);
    });

    // 3. 미터 라벨 및 VU 텍스트
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('VU', pivotX, y + height * 0.36);
    ctx.font = '7px monospace';
    ctx.fillStyle = colors.primary;
    ctx.fillText(label, pivotX, y + height - 8);

    // 4. 아날로그 바늘 (Needle)
    const angle = -Math.PI * 0.5 + needleAngle;
    const needleLen = arcRadius * 0.95;
    const nx = pivotX + Math.cos(angle) * needleLen;
    const ny = pivotY + Math.sin(angle) * needleLen;

    ctx.save();
    ctx.strokeStyle = needleAngle > 0.05 ? '#f43f5e' : colors.primary;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.restore();

    // 5. 피봇 캡 (Pivot Cap)
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  /**
   * [Mode 3: Waveform] 네온 오실로스코프 파형선
   */
  drawOscilloscope(ctx, w, h, colors) {
    if (!window.audioEngine || !window.audioEngine.analyser) return;
    const analyser = window.audioEngine.analyser;
    const bufferLength = analyser.fftSize;
    const timeData = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(timeData);

    const centerY = h * 0.48;
    const sliceWidth = w / bufferLength;

    ctx.save();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = colors.primary;
    ctx.shadowColor = colors.primary;
    ctx.shadowBlur = 12 + this.smoothBass * 15;

    ctx.beginPath();
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = timeData[i] / 128.0; // 0.0 ~ 2.0
      const y = centerY + (v - 1.0) * (h * 0.22) * (1 + this.smoothBass * 0.5);

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();

    // 2차 하모닉 잔상
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = colors.secondary;
    ctx.shadowColor = colors.secondary;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    x = 0;
    for (let i = 0; i < bufferLength; i += 2) {
      const v = timeData[i] / 128.0;
      const y = centerY - (v - 1.0) * (h * 0.12) * (1 + this.smoothTreble * 0.4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth * 2;
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * [Mode 4: Bars] 32밴드 네온 스펙트럼 바 & 피크 홀드
   */
  drawCyberpunkBars(ctx, w, h, colors, freqData) {
    const bars = 36;
    const barWidth = Math.min(18, (w * 0.7) / bars);
    const startX = (w - (bars * (barWidth + 4))) / 2;
    const baseY = h * 0.65;
    const maxBarHeight = h * 0.28;

    for (let i = 0; i < bars; i++) {
      const val = (freqData[i % freqData.length] / 255);
      const targetH = Math.max(4, val * maxBarHeight * (1 + this.smoothBass * 0.5));
      const x = startX + i * (barWidth + 4);
      const y = baseY - targetH;

      // 피크 홀드 바 낙하 애니메이션
      if (targetH > (this.peakBars[i] || 0)) {
        this.peakBars[i] = targetH;
      } else {
        this.peakBars[i] = Math.max(0, (this.peakBars[i] || 0) - 1.5);
      }

      // 바 그라데이션
      const barGrad = ctx.createLinearGradient(x, baseY, x, y);
      barGrad.addColorStop(0, colors.secondary);
      barGrad.addColorStop(1, colors.primary);

      ctx.fillStyle = barGrad;
      ctx.fillRect(x, y, barWidth, targetH);

      // 피크 캡 (Peak Cap)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, baseY - this.peakBars[i] - 2, barWidth, 2);
    }
  }
  
  /**
   * 배경 파티클의 위치 이동 및 박자에 맞춘 투명도/크기 펄스
   */
  drawParticles(ctx, w, h, colors, bassIntensity) {
    for (let p of this.particles) {
      const speedMultiplier = 1 + bassIntensity * 2.5;
      p.x += p.baseSpeedX * speedMultiplier;
      p.y += p.baseSpeedY * speedMultiplier;

      // 화면 가장자리 루프
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      const dynamicRadius = p.radius * (1 + bassIntensity * 0.8);
      const dynamicOpacity = Math.min(1, p.opacity + bassIntensity * 0.4);

      ctx.fillStyle = colors.particle + dynamicOpacity + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, dynamicRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// 전역 객체에 등록
window.Visualizer = Visualizer;

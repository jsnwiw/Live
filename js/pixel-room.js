/**
 * ==============================================================================
 * [js/pixel-room.js] 감성 픽셀 아트 원룸 스튜디오 씬 렌더러 (Pixel Room Scene)
 * ==============================================================================
 * HTML5 Canvas의 픽셀 배율(image-rendering: pixelated)을 활용하여
 * 외부 이미지 에셋 없이 순수 절차적 도트 그래픽으로 렌더링합니다:
 * 1. 시간대별(Dawn, Day, Sunset, Midnight) 창밖 실시간 하늘 & 달/해 & 별빛
 * 2. 빗소리(Rain) 볼륨과 연동되는 창밖 대각선 픽셀 빗줄기
 * 3. 책상 위 머그잔에서 모락모락 피어오르는 따뜻한 증기(Steam) 픽셀 물리
 * 4. 창가 방석에서 웅크려 잠자는 고양이의 부드러운 들숨날숨(Breathing) & 꼬리 흔들림
 * 5. 고양이 인터랙션: 클릭 시 야옹 하트(❤️) 픽셀 파티클 팝업
 * 6. 작업 모니터 화면의 은은한 네온 스캔라인
 */

class PixelRoom {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // 픽셀 아트 내부 가상 해상도 (160 x 120 픽셀)
    this.internalWidth = 160;
    this.internalHeight = 120;
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.internalWidth;
    this.offscreenCanvas.height = this.internalHeight;
    this.offCtx = this.offscreenCanvas.getContext('2d');
    this.offCtx.imageSmoothingEnabled = false;

    this.animationId = null;
    this.currentTimeMood = 'midnight';
    this.timeTick = 0;

    // 1. 커피 머그잔 김(Steam) 파티클 풀
    this.steamParticles = [];
    // 2. 창밖 빗줄기 파티클 풀
    this.rainDrops = [];
    // 3. 고양이 인터랙션 하트 파티클 풀
    this.heartParticles = [];
    // 4. 깜빡이는 별빛 좌표 목록
    this.stars = [];
    for (let i = 0; i < 18; i++) {
      this.stars.push({
        x: 14 + Math.random() * 56,
        y: 12 + Math.random() * 38,
        twinkleSpeed: 0.03 + Math.random() * 0.05,
        phase: Math.random() * Math.PI * 2
      });
    }

    // 캔버스 크기 맞춤
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // 고양이 클릭 인터랙션 바인딩
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.imageSmoothingEnabled = false;
  }

  setTimeMood(mood) {
    this.currentTimeMood = mood;
  }

  handleClick(e) {
    // 캔버스 클릭 시 고양이 주변 클릭 감지하여 하트 팝업
    const rect = this.canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * this.internalWidth;
    const clickY = ((e.clientY - rect.top) / rect.height) * this.internalHeight;

    // 고양이 방석 위치: (88, 70, w: 26, h: 20)
    if (clickX >= 80 && clickX <= 118 && clickY >= 65 && clickY <= 95) {
      this.spawnHeart(98, 70);
    }
  }

  spawnHeart(x, y) {
    this.heartParticles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y,
      vy: -0.4,
      life: 50,
      maxLife: 50
    });
  }

  start() {
    if (this.animationId) return;
    const loop = () => {
      this.render();
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  render() {
    this.timeTick++;
    const ctx = this.offCtx;
    const w = this.internalWidth;
    const h = this.internalHeight;

    // 0. 가상 픽셀 버퍼 초기화
    ctx.clearRect(0, 0, w, h);

    // 1. 방 벽면 & 바닥 베이스 (원룸 인테리어)
    this.drawRoomBase(ctx, w, h);

    // 2. 창문 & 시간대별 실시간 창밖 하늘 / 날씨
    this.drawWindowAndSky(ctx);

    // 3. 작업 책상 & 듀얼 모니터
    this.drawDeskAndMonitor(ctx);

    // 4. 따뜻한 머그잔 & 모락모락 김 피어오름
    this.drawMugAndSteam(ctx);

    // 5. 창가 방석 위 잠자는 픽셀 고양이
    this.drawSleepingCat(ctx);

    // 6. 하트 파티클
    this.drawHearts(ctx);

    // 7. 가상 160x120 픽셀 버퍼를 메인 화면 캔버스로 확대 투영 (Nearest Neighbor)
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * 1. 방 벽면과 마룻바닥
   */
  drawRoomBase(ctx, w, h) {
    // 벽면 (아늑한 딥 네이비 / 차콜 톤)
    let wallColor = '#121626';
    let floorColor = '#1c1724';
    let baseboardColor = '#2b2138';

    if (this.currentTimeMood === 'dawn') {
      wallColor = '#181830';
      floorColor = '#22192e';
    } else if (this.currentTimeMood === 'day') {
      wallColor = '#1e293b';
      floorColor = '#332338';
    } else if (this.currentTimeMood === 'sunset') {
      wallColor = '#221429';
      floorColor = '#2d1825';
    }

    ctx.fillStyle = wallColor;
    ctx.fillRect(0, 0, w, 88);

    // 걸레받이 (Baseboard)
    ctx.fillStyle = baseboardColor;
    ctx.fillRect(0, 86, w, 3);

    // 마룻바닥 (Wood Floor)
    ctx.fillStyle = floorColor;
    ctx.fillRect(0, 89, w, h - 89);

    // 마룻바닥 나무 결 라인
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    for (let y = 96; y < h; y += 8) {
      ctx.fillRect(0, y, w, 1);
    }
  }

  /**
   * 2. 창문 & 시간대별 하늘, 별, 비
   */
  drawWindowAndSky(ctx) {
    const wx = 12;
    const wy = 10;
    const ww = 60;
    const wh = 52;

    // 창문 바깥 하늘 그라데이션
    const skyGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
    if (this.currentTimeMood === 'dawn') {
      skyGrad.addColorStop(0, '#1a183d');
      skyGrad.addColorStop(0.6, '#4c264a');
      skyGrad.addColorStop(1, '#9b4c6e');
    } else if (this.currentTimeMood === 'day') {
      skyGrad.addColorStop(0, '#2563eb');
      skyGrad.addColorStop(0.6, '#38bdf8');
      skyGrad.addColorStop(1, '#bae6fd');
    } else if (this.currentTimeMood === 'sunset') {
      skyGrad.addColorStop(0, '#2e1065');
      skyGrad.addColorStop(0.4, '#831843');
      skyGrad.addColorStop(0.8, '#ea580c');
      skyGrad.addColorStop(1, '#fde047');
    } else { // midnight
      skyGrad.addColorStop(0, '#040714');
      skyGrad.addColorStop(0.7, '#0b112c');
      skyGrad.addColorStop(1, '#11183c');
    }

    ctx.fillStyle = skyGrad;
    ctx.fillRect(wx, wy, ww, wh);

    // 달 / 해 렌더링
    if (this.currentTimeMood === 'midnight') {
      // 은은한 초승달
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(wx + 45, wy + 16, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skyGrad; // 오프셋 깎아서 초승달 연출
      ctx.beginPath();
      ctx.arc(wx + 43, wy + 14, 5, 0, Math.PI * 2);
      ctx.fill();

      // 반짝이는 별빛
      ctx.fillStyle = '#ffffff';
      this.stars.forEach(s => {
        const tw = Math.sin(this.timeTick * s.twinkleSpeed + s.phase);
        if (tw > 0.2) {
          ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
        }
      });
    } else if (this.currentTimeMood === 'sunset') {
      // 지평선에 걸친 노을 붉은 태양
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(wx + 42, wy + 38, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.currentTimeMood === 'day') {
      // 밝은 낮 태양 & 흘러가는 구름
      ctx.fillStyle = '#fef9c3';
      ctx.beginPath();
      ctx.arc(wx + 48, wy + 14, 6, 0, Math.PI * 2);
      ctx.fill();

      // 뭉게구름
      const cloudX = wx + ((this.timeTick * 0.15) % (ww + 20)) - 10;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(cloudX, wy + 20, 14, 4);
      ctx.fillRect(cloudX + 3, wy + 17, 8, 3);
    }

    // 빗소리가 켜져 있을 때 창문 비 내림
    let rainVol = 0.5;
    if (window.audioEngine && window.audioEngine.channels && window.audioEngine.channels.rain) {
      const r = window.audioEngine.channels.rain;
      rainVol = (r.isPlaying && !window.audioEngine.isMuted) ? r.volume : 0;
    }

    if (rainVol > 0.05) {
      if (Math.random() < rainVol * 1.5) {
        this.rainDrops.push({
          x: wx + Math.random() * (ww - 2),
          y: wy,
          speed: 1.8 + Math.random() * 1.5
        });
      }

      ctx.fillStyle = 'rgba(186, 230, 253, 0.7)';
      for (let i = this.rainDrops.length - 1; i >= 0; i--) {
        const d = this.rainDrops[i];
        d.y += d.speed;
        d.x -= 0.4; // 비스듬히 내리는 비
        ctx.fillRect(Math.floor(d.x), Math.floor(d.y), 1, 3);
        if (d.y > wy + wh || d.x < wx) {
          this.rainDrops.splice(i, 1);
        }
      }
    }

    // 창문 프레임 & 십자 격자 (Window Frame)
    ctx.fillStyle = '#2d334a';
    ctx.fillRect(wx - 2, wy - 2, ww + 4, 2); // 상단
    ctx.fillRect(wx - 2, wy + wh, ww + 4, 4); // 창틀 턱 (Sill)
    ctx.fillRect(wx - 2, wy, 2, wh); // 좌측
    ctx.fillRect(wx + ww, wy, 2, wh); // 우측
    ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh); // 세로 중앙 바
    ctx.fillRect(wx, wy + wh / 2 - 1, ww, 2); // 가로 중앙 바
  }

  /**
   * 3. 작업 책상과 듀얼 모니터
   */
  drawDeskAndMonitor(ctx) {
    // 책상 본체 (Desk)
    ctx.fillStyle = '#3a2e4c';
    ctx.fillRect(90, 82, 65, 5); // 상판
    ctx.fillStyle = '#261e33';
    ctx.fillRect(94, 87, 4, 28); // 왼쪽 다리
    ctx.fillRect(148, 87, 4, 28); // 오른쪽 다리

    // 메인 작업 모니터
    ctx.fillStyle = '#1e1a2e';
    ctx.fillRect(116, 54, 30, 22); // 모니터 베젤
    ctx.fillStyle = '#110e1c';
    ctx.fillRect(128, 76, 6, 6); // 스탠드 목
    ctx.fillRect(124, 81, 14, 2); // 스탠드 받침

    // 모니터 화면 (코딩 코드 라인)
    const screenGlow = (this.timeTick % 40 < 20) ? '#081726' : '#0a1d30';
    ctx.fillStyle = screenGlow;
    ctx.fillRect(118, 56, 26, 18);

    // 화면 속 네온 코드 라인
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(120, 58, 12, 1);
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(122, 61, 8, 1);
    ctx.fillStyle = '#34d399';
    ctx.fillRect(120, 64, 16, 1);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(124, 67, 10, 1);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(120, 70, 7, 1);

    // 모니터 화면 불빛이 책상에 비치는 반사광
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.fillRect(114, 82, 34, 2);
  }

  /**
   * 4. 커피 머그잔과 모락모락 김 피어오름
   */
  drawMugAndSteam(ctx) {
    const mx = 98;
    const my = 75;

    // 머그잔 바디 (Mug)
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(mx, my, 6, 7);
    // 머그잔 손잡이
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(mx - 2, my + 2, 2, 3);
    // 커피 액체 윗면
    ctx.fillStyle = '#78350f';
    ctx.fillRect(mx + 1, my, 4, 1);

    // 김(Steam) 파티클 생성
    if (this.timeTick % 8 === 0 && this.steamParticles.length < 15) {
      this.steamParticles.push({
        x: mx + 2 + Math.random() * 2,
        y: my - 1,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -0.35,
        life: 0,
        maxLife: 35 + Math.random() * 15
      });
    }

    // 김 렌더링
    for (let i = this.steamParticles.length - 1; i >= 0; i--) {
      const p = this.steamParticles[i];
      p.life++;
      p.y += p.vy;
      p.x += p.vx + Math.sin((p.life + this.timeTick) * 0.15) * 0.2;

      const alpha = 1.0 - (p.life / p.maxLife);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.45})`;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);

      if (p.life >= p.maxLife) {
        this.steamParticles.splice(i, 1);
      }
    }
  }

  /**
   * 5. 창가 방석 위 잠자는 픽셀 고양이
   */
  drawSleepingCat(ctx) {
    const cx = 36;
    const cy = 76;

    // 푹신한 방석 (Cushion)
    ctx.fillStyle = '#831843';
    ctx.fillRect(cx - 8, cy + 6, 26, 5);
    ctx.fillStyle = '#be185d';
    ctx.fillRect(cx - 6, cy + 5, 22, 2);

    // 고양이 호흡(Breathing): 흉부 오르내림
    const breath = Math.sin(this.timeTick * 0.06);
    const breathOffset = breath > 0 ? 1 : 0;

    // 고양이 웅크린 몸통 (치즈 태비 오렌지 캣)
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(cx - 2, cy + 1 - breathOffset, 14, 6 + breathOffset);
    ctx.fillRect(cx, cy - breathOffset, 10, 2);

    // 하얀 배 털
    ctx.fillStyle = '#ffedd5';
    ctx.fillRect(cx + 2, cy + 4, 6, 3);

    // 웅크린 얼굴 & 귀
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(cx + 9, cy + 2, 4, 4);
    // 뾰족 귀 2개
    ctx.fillRect(cx + 10, cy, 1, 2);
    ctx.fillRect(cx + 12, cy, 1, 2);
    // 편안하게 감은 눈 (Sleeping eyes)
    ctx.fillStyle = '#431407';
    ctx.fillRect(cx + 11, cy + 4, 2, 1);

    // 나른한 꼬리 흔들림 (Tail sway)
    const tailWiggle = Math.sin(this.timeTick * 0.08) > 0.4 ? 1 : 0;
    ctx.fillStyle = '#c2410c';
    ctx.fillRect(cx - 4, cy + 3 - tailWiggle, 3, 2);
    ctx.fillRect(cx - 5, cy + 2 - tailWiggle * 2, 2, 2);

    // "Z z z" 잠꼬대 텍스트 이펙트
    if (this.timeTick % 80 < 50) {
      const zY = cy - 4 - Math.floor((this.timeTick % 80) * 0.15);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.75)';
      ctx.font = '6px monospace';
      ctx.fillText('z', cx + 15, zY);
    }
  }

  /**
   * 6. 고양이 클릭 하트 팝업
   */
  drawHearts(ctx) {
    for (let i = this.heartParticles.length - 1; i >= 0; i--) {
      const h = this.heartParticles[i];
      h.life--;
      h.y += h.vy;

      const alpha = h.life / h.maxLife;
      ctx.fillStyle = `rgba(244, 63, 94, ${alpha})`;
      const px = Math.floor(h.x);
      const py = Math.floor(h.y);

      // 미니 픽셀 하트 (3x3 도트)
      ctx.fillRect(px, py + 1, 1, 2);
      ctx.fillRect(px + 1, py, 1, 3);
      ctx.fillRect(px + 2, py + 1, 1, 2);

      if (h.life <= 0) {
        this.heartParticles.splice(i, 1);
      }
    }
  }
}

// 전역 객체 등록
window.PixelRoom = PixelRoom;

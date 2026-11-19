/**
 * ==============================================================================
 * [js/audio-engine.js] Web Audio API 절차적 사운드 신시사이저 & 3D 공간 음향 엔진
 * ==============================================================================
 * 외부 mp3 파일 없이도 브라우저 내장 Web Audio API를 통해 다음 사운드를 절차적으로 합성합니다:
 * 1. Rain (핑크 노이즈 + 바이쿼드 필터 + 컨볼버 리버브 잔향)
 * 2. Cafe (저주파 웅성거림 럼블 + 밴드패스 필터 + 간헐적 컵 달그락 톤)
 * 3. Fireplace (브라운 노이즈 불길 + 포아송 분포 스냅/크랙클 타닥거림)
 * 4. Ocean Waves (핑크 노이즈 + LFO 저주파 발진기 파도 서지 스윕)
 * 5. Binaural Beats (StereoPanner 좌/우 귀 주파수 위상차로 10Hz/6Hz/3Hz 뇌파 동조)
 * 6. Lo-Fi Beat (재즈 7th/9th Rhodes 전자피아노 코드 진행 + 붐뱁 드럼 시퀀서)
 * 7. Master Vinyl FX (LP 먼지 정전기 팝 & 카세트 테이프 히스)
 * 8. Spatial 3D Audio (PannerNode HRTF 공간 음향 원룸 3차원 배치)
 * 9. Tibetan Chime (528Hz 솔페지오 싱잉볼 타이머 차임벨)
 */

class AudioEngine {
  constructor() {
    // Web Audio 컨텍스트 및 마스터 노드
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.isMuted = false;
    this.previousMasterVolume = 0.8;
    this.masterVolume = 0.8;

    // 마스터 빈티지 바이닐 LP FX 상태
    this.vinylActive = false;
    this.vinylGain = null;

    // 마스터 빈티지 Lo-Fi FX 랙 상태
    this.lofiFX = {
      muffled: { enabled: false, cutoff: 680 },
      wowFlutter: { enabled: false, depth: 0.0025, speed: 0.55 },
      tapeWarmth: { enabled: false, amount: 0.35 },
      vinylCrackle: { enabled: false, volume: 0.28 }
    };
    this.muffledFilterNode = null;
    this.tapeDelayNode = null;
    this.tapeLfoNode = null;
    this.tapeLfoGain = null;
    this.tapeDriveNode = null;

    // 실시간 타이핑 ASMR 설정 (기계식 키보드 & 빈티지 타자기)
    this.typingASMR = {
      enabled: false,
      mode: 'mechanical', // 'mechanical' | 'typewriter'
      volume: 0.65
    };

    // 3D 공간 음향 사용 여부
    this.isSpatial3DActive = true;

    // 6개 채널 정의 및 초기 3D 원룸 평면도 정규화 좌표 (-1.0 ~ +1.0)
    // 청취자(Listener/ME)는 방 중앙 (0, 0, 0)에 위치합니다.
    this.channels = {
      rain: {
        id: 'rain',
        name: 'Rain & Storm',
        volume: 0.5,
        reverb: 0.4,
        nodes: {},
        isPlaying: true,
        customBuffer: null,
        // 좌측 창가 위치
        posX: -0.75,
        posY: -0.65
      },
      cafe: {
        id: 'cafe',
        name: 'Cafe Ambience',
        volume: 0.4,
        tone: 0.6,
        nodes: {},
        isPlaying: true,
        customBuffer: null,
        // 우측 후방 현관문 위치
        posX: 0.7,
        posY: 0.7
      },
      fire: {
        id: 'fire',
        name: 'Cozy Fireplace',
        volume: 0.6,
        crackle: 0.7,
        nodes: {},
        isPlaying: true,
        customBuffer: null,
        // 우측 벽난로 위치
        posX: 0.8,
        posY: -0.4
      },
      ocean: {
        id: 'ocean',
        name: 'Night Ocean Waves',
        volume: 0.35,
        surge: 0.5,
        nodes: {},
        isPlaying: true,
        // 먼 좌측 발코니/테라스 위치
        posX: -0.9,
        posY: 0.2
      },
      binaural: {
        id: 'binaural',
        name: 'Binaural Beats (Alpha/Theta)',
        volume: 0.25,
        mode: 'alpha', // 'alpha'(10Hz 집중) | 'theta'(6Hz 명상) | 'delta'(3Hz 수면)
        nodes: {},
        isPlaying: false,
        // 머리 중심 바이노럴 위치
        posX: 0.0,
        posY: 0.0
      },
      beat: {
        id: 'beat',
        name: 'Lo-Fi Chill Beat',
        volume: 0.5,
        bpm: 76,
        nodes: {},
        isPlaying: true,
        beatTimer: null,
        // 중앙 스튜디오 데스크 턴테이블 위치
        posX: 0.0,
        posY: -0.5
      }
    };

    this.reverbBuffer = null;
    this.sleepTimerId = null;
  }

  /**
   * 사용자 첫 인터랙션(클릭 등) 시 AudioContext 활성화
   * 브라우저의 오디오 자동재생(Autoplay) 정책 준수
   */
  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();

    // 1. 마스터 볼륨 게인 노드
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

    // 2. 비주얼라이저 FFT 주파수 분석용 AnalyserNode
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;

    // 3. Lo-Fi Vintage FX Chain & 오디오 그래프 연결
    // Master Gain -> Tape Drive(Warmth) -> Tape Wow/Flutter Delay -> Muffled LPF Filter -> Analyser -> Destination
    this.setupLofiFXChain();

    // 4. 3D 오디오 청취자(Listener) 위치를 원점 (0, 0, 0)으로 설정
    if (this.ctx.listener) {
      if (this.ctx.listener.positionX) {
        this.ctx.listener.positionX.setValueAtTime(0, this.ctx.currentTime);
        this.ctx.listener.positionY.setValueAtTime(0, this.ctx.currentTime);
        this.ctx.listener.positionZ.setValueAtTime(0, this.ctx.currentTime);
        this.ctx.listener.forwardX.setValueAtTime(0, this.ctx.currentTime);
        this.ctx.listener.forwardY.setValueAtTime(0, this.ctx.currentTime);
        this.ctx.listener.forwardZ.setValueAtTime(-1, this.ctx.currentTime);
        this.ctx.listener.upX.setValueAtTime(0, this.ctx.currentTime);
        this.ctx.listener.upY.setValueAtTime(1, this.ctx.currentTime);
        this.ctx.listener.upZ.setValueAtTime(0, this.ctx.currentTime);
      } else if (this.ctx.listener.setOrientation) {
        this.ctx.listener.setPosition(0, 0, 0);
        this.ctx.listener.setOrientation(0, 0, -1, 0, 1, 0);
      }
    }

    // 5. 알고리즘 리버브 임펄스 생성
    this.createReverbImpulse();

    // 6. 마스터 빈티지 바이닐 잡음 모듈
    this.setupVinylModule();

    // 7. 6개 채널별 사운드 신시사이저 초기화
    this.setupRainChannel();
    this.setupCafeChannel();
    this.setupFireChannel();
    this.setupBeatChannel();
    this.setupOceanChannel();
    this.setupBinauralChannel();

    // 8. 초기 3D 공간 음향 위치 적용
    Object.keys(this.channels).forEach(id => {
      this.updateChannelSpatialPosition(id, this.channels[id].posX, this.channels[id].posY);
    });
  }

  /**
   * 잔향 효과(Reverb Convolver)를 위한 알고리즘 지수 감쇠 임펄스 응답 버퍼 생성
   */
  createReverbImpulse() {
    const rate = this.ctx.sampleRate;
    const length = rate * 2.5; // 2.5초 감쇠
    const decay = 2.0;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      const factor = Math.exp(-n * decay);
      left[i] = (Math.random() * 2 - 1) * factor;
      right[i] = (Math.random() * 2 - 1) * factor;
    }
    this.reverbBuffer = impulse;
  }

  /**
   * 각 채널에 적용될 Web Audio HRTF 3D PannerNode 생성기
   * @param {number} posX - 좌우 좌표 (-1.0 ~ +1.0)
   * @param {number} posY - 전후 좌표 (-1.0 ~ +1.0)
   * @returns {PannerNode}
   */
  createSpatialPanner(posX, posY) {
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF'; // 사람의 머리 형태를 모델링한 고품질 입체음향
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10;
    panner.rolloffFactor = 0.8;
    panner.coneInnerAngle = 360;

    const x = posX * 3.0; // 방 가로 폭 스케일링 (미터 단위)
    const y = 0.2;        // 귀 높이 살짝 위
    const z = posY * 3.0; // 방 세로 깊이 스케일링

    if (panner.positionX) {
      panner.positionX.setValueAtTime(x, this.ctx.currentTime);
      panner.positionY.setValueAtTime(y, this.ctx.currentTime);
      panner.positionZ.setValueAtTime(z, this.ctx.currentTime);
    } else if (panner.setPosition) {
      panner.setPosition(x, y, z);
    }
    return panner;
  }

  /**
   * 2D 평면도 드래그 시 실시간으로 3D 공간 음향 위치를 갱신
   */
  updateChannelSpatialPosition(channelId, posX, posY) {
    const ch = this.channels[channelId];
    if (!ch) return;
    ch.posX = Math.max(-1, Math.min(1, posX));
    ch.posY = Math.max(-1, Math.min(1, posY));

    if (ch.nodes.spatialPanner && this.ctx) {
      const x = ch.posX * 3.0;
      const y = 0.2;
      const z = ch.posY * 3.0;
      const now = this.ctx.currentTime;

      if (ch.nodes.spatialPanner.positionX) {
        ch.nodes.spatialPanner.positionX.linearRampToValueAtTime(x, now + 0.05);
        ch.nodes.spatialPanner.positionY.linearRampToValueAtTime(y, now + 0.05);
        ch.nodes.spatialPanner.positionZ.linearRampToValueAtTime(z, now + 0.05);
      } else if (ch.nodes.spatialPanner.setPosition) {
        ch.nodes.spatialPanner.setPosition(x, y, z);
      }
    }
  }

  /**
   * 마스터 빈티지 바이닐(LP) 먼지 잡음 및 바늘 지지직 소리 모듈 설정
   */
  setupVinylModule() {
    const bufferSize = this.ctx.sampleRate * 3;
    const vinylBuf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = vinylBuf.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      let val = (Math.random() * 2 - 1) * 0.05;
      if (Math.random() < 0.00035) { // 간헐적인 먼지 튐 (Dust Crackle)
        val += (Math.random() * 2 - 1) * 0.8;
      }
      data[i] = val;
    }

    const vinylSource = this.ctx.createBufferSource();
    vinylSource.buffer = vinylBuf;
    vinylSource.loop = true;

    const vinylFilter = this.ctx.createBiquadFilter();
    vinylFilter.type = 'bandpass';
    vinylFilter.frequency.setValueAtTime(1800, this.ctx.currentTime);
    vinylFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);

    this.vinylGain = this.ctx.createGain();
    this.vinylGain.gain.setValueAtTime(this.vinylActive ? 0.28 : 0, this.ctx.currentTime);

    vinylSource.connect(vinylFilter);
    vinylFilter.connect(this.vinylGain);
    this.vinylGain.connect(this.masterGain);

    vinylSource.start(0);
  }

  /**
   * Lo-Fi Vintage FX Chain 구성
   * 오디오 흐름: Master Gain -> Tape Drive(Warmth) -> Tape Wow/Flutter Delay -> Muffled LPF Filter -> Analyser -> Destination
   */
  setupLofiFXChain() {
    if (!this.ctx) return;

    // 1. Tape Drive / Warmth (WaveShaperNode)
    this.tapeDriveNode = this.ctx.createWaveShaper();
    this.tapeDriveNode.oversample = '4x';
    this.tapeDriveNode.curve = this.makeTapeWarmthCurve(this.lofiFX.tapeWarmth.enabled ? this.lofiFX.tapeWarmth.amount : 0);

    // 2. Tape Wow & Flutter (DelayNode + LFO Oscillator)
    this.tapeDelayNode = this.ctx.createDelay(1.0);
    this.tapeDelayNode.delayTime.setValueAtTime(0.015, this.ctx.currentTime); // 15ms 중심 지연

    this.tapeLfoNode = this.ctx.createOscillator();
    this.tapeLfoNode.type = 'sine';
    this.tapeLfoNode.frequency.setValueAtTime(this.lofiFX.wowFlutter.speed, this.ctx.currentTime);

    this.tapeLfoGain = this.ctx.createGain();
    const lfoAmount = this.lofiFX.wowFlutter.enabled ? this.lofiFX.wowFlutter.depth : 0;
    this.tapeLfoGain.gain.setValueAtTime(lfoAmount, this.ctx.currentTime);

    this.tapeLfoNode.connect(this.tapeLfoGain);
    this.tapeLfoGain.connect(this.tapeDelayNode.delayTime);
    this.tapeLfoNode.start(0);

    // 3. Muffled Lowpass Filter (BiquadFilterNode)
    this.muffledFilterNode = this.ctx.createBiquadFilter();
    this.muffledFilterNode.type = 'lowpass';
    const initCutoff = this.lofiFX.muffled.enabled ? this.lofiFX.muffled.cutoff : 20000;
    this.muffledFilterNode.frequency.setValueAtTime(initCutoff, this.ctx.currentTime);
    this.muffledFilterNode.Q.setValueAtTime(0.8, this.ctx.currentTime);

    // 4. 노드 체인 직렬 연결
    this.masterGain.connect(this.tapeDriveNode);
    this.tapeDriveNode.connect(this.tapeDelayNode);
    this.tapeDelayNode.connect(this.muffledFilterNode);
    this.muffledFilterNode.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  /**
   * Tape Warmth 아날로그 새츄레이션(포화) 곡선 생성
   */
  makeTapeWarmthCurve(amount) {
    const n_samples = 2048;
    const curve = new Float32Array(n_samples);
    if (!amount || amount <= 0) {
      for (let i = 0; i < n_samples; i++) {
        curve[i] = (i * 2) / n_samples - 1;
      }
      return curve;
    }
    const drive = 1 + amount * 3.5;
    for (let i = 0; i < n_samples; i++) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
    }
    return curve;
  }

  /**
   * Muffled(먹먹한 톤) 필터 제어
   */
  setMuffled(enabled, cutoff) {
    this.lofiFX.muffled.enabled = !!enabled;
    if (cutoff !== undefined) {
      this.lofiFX.muffled.cutoff = Math.max(200, Math.min(20000, cutoff));
    }
    if (this.muffledFilterNode && this.ctx) {
      const targetFreq = this.lofiFX.muffled.enabled ? this.lofiFX.muffled.cutoff : 20000;
      this.muffledFilterNode.frequency.cancelScheduledValues(this.ctx.currentTime);
      this.muffledFilterNode.frequency.linearRampToValueAtTime(targetFreq, this.ctx.currentTime + 0.08);
    }
  }

  /**
   * Tape Wow & Flutter (피치 울림/테이프 늘어짐) 제어
   */
  setWowFlutter(enabled, depth, speed) {
    this.lofiFX.wowFlutter.enabled = !!enabled;
    if (depth !== undefined) this.lofiFX.wowFlutter.depth = depth;
    if (speed !== undefined) this.lofiFX.wowFlutter.speed = speed;
    if (this.tapeLfoGain && this.tapeLfoNode && this.ctx) {
      const targetDepth = this.lofiFX.wowFlutter.enabled ? this.lofiFX.wowFlutter.depth : 0;
      this.tapeLfoGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.tapeLfoGain.gain.linearRampToValueAtTime(targetDepth, this.ctx.currentTime + 0.08);
      if (speed !== undefined) {
        this.tapeLfoNode.frequency.setValueAtTime(this.lofiFX.wowFlutter.speed, this.ctx.currentTime);
      }
    }
  }

  /**
   * Tape Warmth(테이프 아날로그 온기/배음 왜곡) 제어
   */
  setTapeWarmth(enabled, amount) {
    this.lofiFX.tapeWarmth.enabled = !!enabled;
    if (amount !== undefined) this.lofiFX.tapeWarmth.amount = Math.max(0, Math.min(1, amount));
    if (this.tapeDriveNode) {
      const curveAmount = this.lofiFX.tapeWarmth.enabled ? this.lofiFX.tapeWarmth.amount : 0;
      this.tapeDriveNode.curve = this.makeTapeWarmthCurve(curveAmount);
    }
  }

  /**
   * 바이닐 LP 노이즈 레벨 제어
   */
  setVinylLevel(volume) {
    this.lofiFX.vinylCrackle.volume = Math.max(0, Math.min(1, volume));
    if (this.vinylActive && this.vinylGain && this.ctx) {
      this.vinylGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.vinylGain.gain.linearRampToValueAtTime(this.lofiFX.vinylCrackle.volume, this.ctx.currentTime + 0.05);
    }
  }

  toggleVinylFX() {
    this.vinylActive = !this.vinylActive;
    if (this.vinylGain && this.ctx) {
      const target = this.vinylActive ? (this.lofiFX.vinylCrackle.volume || 0.28) : 0;
      this.vinylGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.vinylGain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.1);
    }
    return this.vinylActive;
  }

  /**
   * 키보드 타건 ASMR 설정 제어
   */
  setTypingASMR(enabled, mode, volume) {
    if (enabled !== undefined) this.typingASMR.enabled = !!enabled;
    if (mode !== undefined) this.typingASMR.mode = mode;
    if (volume !== undefined) this.typingASMR.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * 실시간 키보드 타건 ASMR 사운드 절차적 합성 및 재생
   * @param {'key'|'space'|'enter'|'backspace'} keyType
   */
  playTypingSound(keyType = 'key') {
    if (!this.ctx || this.ctx.state !== 'running' || !this.typingASMR.enabled) return;

    const t = this.ctx.currentTime;
    const vol = this.typingASMR.volume * 0.7;

    if (this.typingASMR.mode === 'typewriter') {
      // 빈티지 타자기 사운드
      if (keyType === 'enter') {
        const bellOsc = this.ctx.createOscillator();
        const bellGain = this.ctx.createGain();
        bellOsc.type = 'sine';
        bellOsc.frequency.setValueAtTime(2400, t);
        bellGain.gain.setValueAtTime(vol * 0.45, t);
        bellGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
        bellOsc.connect(bellGain);
        bellGain.connect(this.masterGain);
        bellOsc.start(t);
        bellOsc.stop(t + 0.8);
      }

      const noiseLen = 0.04;
      const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * noiseLen), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.25));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(keyType === 'space' ? 1400 : 2100 + Math.random() * 400, t);
      filter.Q.setValueAtTime(3.5, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol * (keyType === 'space' ? 0.85 : 0.65), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + noiseLen);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(t);
      noise.stop(t + noiseLen);

    } else {
      // 기계식 키보드 사운드 (Thock + Tick)
      const tickOsc = this.ctx.createOscillator();
      const tickGain = this.ctx.createGain();
      tickOsc.type = 'triangle';
      const baseFreq = keyType === 'space' ? 420 : keyType === 'enter' ? 490 : 680 + Math.random() * 120;
      tickOsc.frequency.setValueAtTime(baseFreq * 2.1, t);
      tickOsc.frequency.exponentialRampToValueAtTime(baseFreq, t + 0.022);
      tickGain.gain.setValueAtTime(vol * 0.4, t);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      tickOsc.connect(tickGain);
      tickGain.connect(this.masterGain);
      tickOsc.start(t);
      tickOsc.stop(t + 0.035);

      const bodyOsc = this.ctx.createOscillator();
      const bodyGain = this.ctx.createGain();
      bodyOsc.type = 'sine';
      const bodyFreq = keyType === 'space' ? 115 : keyType === 'enter' ? 135 : 175 + Math.random() * 25;
      bodyOsc.frequency.setValueAtTime(bodyFreq, t);
      bodyOsc.frequency.exponentialRampToValueAtTime(55, t + 0.05);
      bodyGain.gain.setValueAtTime(vol * 0.55, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(this.masterGain);
      bodyOsc.start(t);
      bodyOsc.stop(t + 0.07);
    }
  }

  // ================= 1. Rain (빗소리) 채널 합성 =================
  setupRainChannel() {
    const ch = this.channels.rain;
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(ch.volume, this.ctx.currentTime);
    const panner = this.createSpatialPanner(ch.posX, ch.posY);

    // 핑크 노이즈(Pink Noise) 필터링으로 포근한 빗소리 생성
    const bufferSize = this.ctx.sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.07;
      b6 = white * 0.115926;
    }

    const rainSource = this.ctx.createBufferSource();
    rainSource.buffer = noiseBuffer;
    rainSource.loop = true;

    // 빗소리 로우패스 필터
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.setValueAtTime(1300, this.ctx.currentTime);
    rainFilter.Q.setValueAtTime(1.1, this.ctx.currentTime);

    // 리버브 컨볼버 연결
    const convolver = this.ctx.createConvolver();
    convolver.buffer = this.reverbBuffer;
    const wetGain = this.ctx.createGain();
    wetGain.gain.setValueAtTime(ch.reverb, this.ctx.currentTime);
    const dryGain = this.ctx.createGain();
    dryGain.gain.setValueAtTime(1.0 - ch.reverb * 0.5, this.ctx.currentTime);

    rainSource.connect(rainFilter);
    rainFilter.connect(dryGain);
    rainFilter.connect(convolver);
    convolver.connect(wetGain);

    dryGain.connect(gainNode);
    wetGain.connect(gainNode);

    // 채널 게인 -> 3D 입체 음향 Panner -> 마스터
    gainNode.connect(panner);
    panner.connect(this.masterGain);

    rainSource.start(0);
    ch.nodes = { source: rainSource, gainNode, rainFilter, wetGain, dryGain, spatialPanner: panner };
  }

  // ================= 2. Cafe (카페 소음) 채널 합성 =================
  setupCafeChannel() {
    const ch = this.channels.cafe;
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(ch.volume, this.ctx.currentTime);
    const panner = this.createSpatialPanner(ch.posX, ch.posY);

    // 카페 내부 웅성거림 럼블 노이즈
    const bufferSize = this.ctx.sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
    const left = noiseBuffer.getChannelData(0);
    const right = noiseBuffer.getChannelData(1);

    let lastL = 0, lastR = 0;
    for (let i = 0; i < bufferSize; i++) {
      const whiteL = Math.random() * 2 - 1;
      const whiteR = Math.random() * 2 - 1;
      lastL = (lastL + 0.02 * whiteL) / 1.02;
      lastR = (lastR + 0.02 * whiteR) / 1.02;
      left[i] = lastL * 3.5;
      right[i] = lastR * 3.5;
    }

    const murmurSource = this.ctx.createBufferSource();
    murmurSource.buffer = noiseBuffer;
    murmurSource.loop = true;

    // 대역통과 필터로 사람 말소리 대역 강조
    const cafeFilter = this.ctx.createBiquadFilter();
    cafeFilter.type = 'bandpass';
    cafeFilter.frequency.setValueAtTime(450, this.ctx.currentTime);
    cafeFilter.Q.setValueAtTime(0.8, this.ctx.currentTime);

    murmurSource.connect(cafeFilter);
    cafeFilter.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.masterGain);
    murmurSource.start(0);

    // 간헐적으로 들리는 컵/유리잔 달그락 소리 스케줄러
    setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || !ch.isPlaying || ch.volume < 0.05) return;
      if (Math.random() > 0.45) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      const freq = 2100 + Math.random() * 1500;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      oscGain.gain.setValueAtTime(ch.volume * 0.08, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc.connect(oscGain);
      oscGain.connect(gainNode);
      osc.start(now);
      osc.stop(now + 0.36);
    }, 2800);

    ch.nodes = { source: murmurSource, gainNode, cafeFilter, spatialPanner: panner };
  }

  // ================= 3. Fireplace (장작불) 채널 합성 =================
  setupFireChannel() {
    const ch = this.channels.fire;
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(ch.volume, this.ctx.currentTime);
    const panner = this.createSpatialPanner(ch.posX, ch.posY);

    // 따뜻한 브라운 노이즈 (불길 타는 소리)
    const bufferSize = this.ctx.sampleRate * 3;
    const flameBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const out = flameBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      out[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = out[i];
      out[i] *= 2.8;
    }

    const flameSource = this.ctx.createBufferSource();
    flameSource.buffer = flameBuffer;
    flameSource.loop = true;

    const flameFilter = this.ctx.createBiquadFilter();
    flameFilter.type = 'lowpass';
    flameFilter.frequency.setValueAtTime(320, this.ctx.currentTime);

    flameSource.connect(flameFilter);
    flameFilter.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.masterGain);
    flameSource.start(0);

    // 포아송 확률 분포 기반 타닥타닥 튀는 나무 크랙클(Crackling)
    setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || !ch.isPlaying || ch.volume < 0.05) return;
      if (Math.random() > 0.65) return;

      const count = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < count; k++) {
        const offset = Math.random() * 0.08;
        const now = this.ctx.currentTime + offset;
        const clickBuf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.035), this.ctx.sampleRate);
        const clickData = clickBuf.getChannelData(0);
        for (let i = 0; i < clickData.length; i++) {
          clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickData.length * 0.15));
        }

        const clickSource = this.ctx.createBufferSource();
        clickSource.buffer = clickBuf;

        const crackleFilter = this.ctx.createBiquadFilter();
        crackleFilter.type = 'highpass';
        crackleFilter.frequency.setValueAtTime(900 + Math.random() * 1200, now);

        const crackleGain = this.ctx.createGain();
        crackleGain.gain.setValueAtTime(ch.volume * ch.crackle * 0.45, now);

        clickSource.connect(crackleFilter);
        crackleFilter.connect(crackleGain);
        crackleGain.connect(gainNode);
        clickSource.start(now);
      }
    }, 180);

    ch.nodes = { source: flameSource, gainNode, flameFilter, spatialPanner: panner };
  }

  // ================= 4. Lo-Fi Beat (비트) 채널 합성 =================
  setupBeatChannel() {
    const ch = this.channels.beat;
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(ch.volume, this.ctx.currentTime);
    const panner = this.createSpatialPanner(ch.posX, ch.posY);

    gainNode.connect(panner);
    panner.connect(this.masterGain);

    ch.nodes = { gainNode, spatialPanner: panner };
    this.startBeatSequencer();
  }

  /**
   * 16분음표 단위 로파이 재즈 코드 & 붐뱁 드럼 시퀀서 루프
   */
  startBeatSequencer() {
    const ch = this.channels.beat;
    if (ch.beatTimer) clearInterval(ch.beatTimer);

    // 감성 재즈 7th/9th 화음 진행 (Dm9 -> G13 -> Cmaj9 -> Am7)
    const chords = [
      [293.66, 349.23, 440.0, 523.25, 659.25], // Dm9
      [196.00, 392.00, 493.88, 587.33, 659.25], // G13
      [261.63, 329.63, 392.00, 493.88, 587.33], // Cmaj9
      [220.00, 329.63, 440.00, 523.25, 659.25]  // Am7
    ];

    let step = 0;
    const intervalMs = () => (60000 / ch.bpm) / 4; // 16분음표 간격

    const tick = () => {
      if (!this.ctx || this.ctx.state !== 'running' || !ch.isPlaying || ch.volume < 0.05) {
        step = (step + 1) % 64;
        return;
      }

      const now = this.ctx.currentTime;
      const beat16 = step % 16;
      const chordIdx = Math.floor(step / 16) % 4;

      // 1. 붐뱁 킥 (0, 10번째 16분음표)
      if (beat16 === 0 || beat16 === 10) {
        this.playLoFiKick(now, ch.nodes.gainNode, ch.volume);
      }
      // 2. 스네어 (4, 12번째 16분음표)
      if (beat16 === 4 || beat16 === 12) {
        this.playLoFiSnare(now, ch.nodes.gainNode, ch.volume);
      }
      // 3. 하이햇 (짝수 16분음표 미세 스윙)
      if (beat16 % 2 === 0) {
        const vel = (beat16 % 4 === 0 ? 0.35 : 0.2) + (Math.random() * 0.1 - 0.05);
        this.playLoFiHat(now, ch.nodes.gainNode, ch.volume * vel);
      }
      // 4. Rhodes 피아노 코드 타건
      if (beat16 === 0) {
        const chord = chords[chordIdx];
        chord.forEach((freq, idx) => {
          this.playRhodesNote(now + idx * 0.035, freq, ch.nodes.gainNode, ch.volume * 0.28);
        });
      }

      step = (step + 1) % 64;
    };

    ch.beatTimer = setInterval(tick, intervalMs());
    ch.updateBpm = (newBpm) => {
      ch.bpm = newBpm;
      clearInterval(ch.beatTimer);
      ch.beatTimer = setInterval(tick, intervalMs());
    };
  }

  // 808 서브 베이스 킥
  playLoFiKick(time, destination, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.16);
    gain.gain.setValueAtTime(volume * 0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(time);
    osc.stop(time + 0.26);
  }

  // 스냅 노이즈 스네어
  playLoFiSnare(time, destination, volume) {
    const bufferSize = this.ctx.sampleRate * 0.18;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1400, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    noise.start(time);
  }

  // 빈티지 하이햇
  playLoFiHat(time, destination, volume) {
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    noise.start(time);
  }

  // 따뜻한 Rhodes 일렉트릭 피아노 건반 음
  playRhodesNote(time, freq, destination, volume) {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const noteGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, time);
    filter.frequency.exponentialRampToValueAtTime(450, time + 1.8);

    noteGain.gain.setValueAtTime(0.0001, time);
    noteGain.gain.linearRampToValueAtTime(volume, time + 0.04);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, time + 2.2);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(destination);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 2.3);
    osc2.stop(time + 2.3);
  }

  // ================= 5. Ocean Waves (파도 소리) 채널 합성 =================
  setupOceanChannel() {
    const ch = this.channels.ocean;
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(ch.isPlaying ? ch.volume : 0, this.ctx.currentTime);
    const panner = this.createSpatialPanner(ch.posX, ch.posY);

    const bufferSize = this.ctx.sampleRate * 5;
    const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
    const left = noiseBuffer.getChannelData(0);
    const right = noiseBuffer.getChannelData(1);

    for (let i = 0; i < bufferSize; i++) {
      left[i] = (Math.random() * 2 - 1) * 0.4;
      right[i] = (Math.random() * 2 - 1) * 0.4;
    }

    const oceanSource = this.ctx.createBufferSource();
    oceanSource.buffer = noiseBuffer;
    oceanSource.loop = true;

    const oceanFilter = this.ctx.createBiquadFilter();
    oceanFilter.type = 'lowpass';
    oceanFilter.frequency.setValueAtTime(400, this.ctx.currentTime);
    oceanFilter.Q.setValueAtTime(2.0, this.ctx.currentTime);

    // 약 8.3초 주기로 밀려왔다 밀려가는 파도 LFO (저주파 발진기)
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime);

    const lfoFilterGain = this.ctx.createGain();
    lfoFilterGain.gain.setValueAtTime(280, this.ctx.currentTime);
    lfo.connect(lfoFilterGain);
    lfoFilterGain.connect(oceanFilter.frequency);

    const waveGain = this.ctx.createGain();
    const lfoAmpGain = this.ctx.createGain();
    lfoAmpGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    lfo.connect(lfoAmpGain);
    lfoAmpGain.connect(waveGain.gain);

    oceanSource.connect(oceanFilter);
    oceanFilter.connect(waveGain);
    waveGain.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.masterGain);

    lfo.start(0);
    oceanSource.start(0);

    ch.nodes = { source: oceanSource, gainNode, oceanFilter, lfo, lfoFilterGain, spatialPanner: panner };
  }

  // ================= 6. Binaural Beats (뇌파 동조) 채널 합성 =================
  setupBinauralChannel() {
    const ch = this.channels.binaural;
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(ch.isPlaying ? ch.volume : 0, this.ctx.currentTime);

    const baseFreq = 200; // 200Hz 포근한 베이스 캐리어
    const offsets = { alpha: 10, theta: 6, delta: 3 };
    const beatOffset = offsets[ch.mode] || 10;

    // 좌측 귀: 200Hz
    const oscLeft = this.ctx.createOscillator();
    oscLeft.type = 'sine';
    oscLeft.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    const pannerLeft = this.ctx.createStereoPanner();
    pannerLeft.pan.setValueAtTime(-1, this.ctx.currentTime);

    // 우측 귀: 200Hz + offset
    const oscRight = this.ctx.createOscillator();
    oscRight.type = 'sine';
    oscRight.frequency.setValueAtTime(baseFreq + beatOffset, this.ctx.currentTime);
    const pannerRight = this.ctx.createStereoPanner();
    pannerRight.pan.setValueAtTime(1, this.ctx.currentTime);

    oscLeft.connect(pannerLeft);
    oscRight.connect(pannerRight);
    pannerLeft.connect(gainNode);
    pannerRight.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscLeft.start(0);
    oscRight.start(0);

    ch.nodes = { oscLeft, oscRight, gainNode, baseFreq };
  }

  setBinauralMode(mode) {
    const ch = this.channels.binaural;
    ch.mode = mode;
    const offsets = { alpha: 10, theta: 6, delta: 3 };
    const beatOffset = offsets[mode] || 10;
    if (ch.nodes.oscRight && this.ctx) {
      ch.nodes.oscRight.frequency.cancelScheduledValues(this.ctx.currentTime);
      ch.nodes.oscRight.frequency.linearRampToValueAtTime(ch.nodes.baseFreq + beatOffset, this.ctx.currentTime + 0.2);
    }
  }

  // ================= 528Hz 솔페지오 싱잉볼 타이머 차임벨 =================
  playChime() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = [528, 1056, 1584, 2112];
    const gains = [0.4, 0.2, 0.08, 0.03];

    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gains[idx], now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 4.0);
    });
  }

  // ================= 채널별 컨트롤 메서드 =================
  setChannelVolume(channelId, val) {
    const ch = this.channels[channelId];
    if (!ch) return;
    ch.volume = Math.max(0, Math.min(1, val));
    if (ch.nodes.gainNode && this.ctx) {
      ch.nodes.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
      ch.nodes.gainNode.gain.linearRampToValueAtTime(ch.isPlaying ? ch.volume : 0, this.ctx.currentTime + 0.05);
    }
  }

  toggleChannelMute(channelId) {
    const ch = this.channels[channelId];
    if (!ch) return false;
    ch.isPlaying = !ch.isPlaying;
    if (ch.nodes.gainNode && this.ctx) {
      ch.nodes.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
      ch.nodes.gainNode.gain.linearRampToValueAtTime(ch.isPlaying ? ch.volume : 0, this.ctx.currentTime + 0.05);
    }
    return ch.isPlaying;
  }

  setRainReverb(val) {
    const ch = this.channels.rain;
    ch.reverb = val;
    if (ch.nodes.wetGain && this.ctx) {
      ch.nodes.wetGain.gain.linearRampToValueAtTime(val * 1.2, this.ctx.currentTime + 0.05);
      ch.nodes.dryGain.gain.linearRampToValueAtTime(1.0 - val * 0.5, this.ctx.currentTime + 0.05);
    }
  }

  setCafeTone(val) {
    const ch = this.channels.cafe;
    ch.tone = val;
    if (ch.nodes.cafeFilter && this.ctx) {
      const freq = 200 + val * 1000;
      ch.nodes.cafeFilter.frequency.linearRampToValueAtTime(freq, this.ctx.currentTime + 0.05);
    }
  }

  setFireCrackle(val) {
    this.channels.fire.crackle = val;
  }

  setBeatBpm(bpm) {
    const ch = this.channels.beat;
    ch.bpm = bpm;
    if (ch.updateBpm) ch.updateBpm(bpm);
  }

  setOceanSurge(val) {
    const ch = this.channels.ocean;
    ch.surge = val;
    if (ch.nodes.lfoFilterGain && this.ctx) {
      ch.nodes.lfoFilterGain.gain.linearRampToValueAtTime(100 + val * 400, this.ctx.currentTime + 0.05);
    }
  }

  setMasterVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, this.ctx.currentTime + 0.05);
    }
  }

  toggleMasterMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      const target = this.isMuted ? 0 : this.masterVolume;
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.05);
    }
    return this.isMuted;
  }

  // ================= 슬립 타이머 (마지막 3분 지수 페이드아웃) =================
  startSleepTimer(minutes, onTick, onComplete) {
    if (this.sleepTimerId) clearInterval(this.sleepTimerId);
    let secondsLeft = minutes * 60;
    const fadeDuration = Math.min(180, secondsLeft); // 마지막 3분 페이드
    const initialVolume = this.masterVolume;

    this.sleepTimerId = setInterval(() => {
      secondsLeft--;
      if (onTick) onTick(secondsLeft);

      if (secondsLeft <= fadeDuration && secondsLeft > 0) {
        const factor = secondsLeft / fadeDuration;
        this.setMasterVolume(initialVolume * factor);
      }

      if (secondsLeft <= 0) {
        clearInterval(this.sleepTimerId);
        this.sleepTimerId = null;
        if (this.ctx) this.ctx.suspend();
        if (onComplete) onComplete();
      }
    }, 1000);
  }

  cancelSleepTimer() {
    if (this.sleepTimerId) {
      clearInterval(this.sleepTimerId);
      this.sleepTimerId = null;
    }
  }
}

// 전역 싱글톤 인스턴스
window.audioEngine = new AudioEngine();

/**
 * ==============================================================================
 * [js/knob.js] 아날로그 로터리 노브 (Rotary Knob) 컴포넌트
 * ==============================================================================
 * 마우스 드래그(상/하), 마우스 휠, 터치 제스처를 지원하며,
 * 280도 회전 각도 및 SVG 프로그레스 호(Arc)를 실시간으로 렌더링하는 커스텀 노브 UI 클래스입니다.
 */

class RotaryKnob {
  /**
   * 로터리 노브 인스턴스 생성자
   * @param {string|HTMLElement} element - 노브가 렌더링될 DOM 선택자 또는 엘리먼트
   * @param {Object} options - 노브 설정 옵션 (min, max, step, defaultValue, unit, label, onChange)
   */
  constructor(element, options = {}) {
    this.el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.el) return;

    // 1. 기본 설정값 초기화
    this.min = options.min !== undefined ? options.min : 0;          // 최솟값
    this.max = options.max !== undefined ? options.max : 1;          // 최댓값
    this.step = options.step !== undefined ? options.step : 0.01;    // 조절 단위
    this.value = options.defaultValue !== undefined ? options.defaultValue : this.min; // 현재 값
    this.unit = options.unit || '';                                  // 화면에 표시될 단위 기호 (%, Hz 등)
    this.label = options.label || '';                                // 하단 라벨 (REVERB, FILTER 등)
    this.onChange = options.onChange || (() => {});                  // 값 변경 시 호출될 콜백 함수
    
    // 2. 각도 범위 정의: -140도(최솟값) ~ +140도(최댓값) -> 총 280도 회전
    this.minAngle = -140;
    this.maxAngle = 140;
    this.currentAngle = this.valueToAngle(this.value);

    // 3. 드래그 조작 상태 변수
    this.isDragging = false;
    this.startY = 0;
    this.startValue = 0;

    // 4. UI 렌더링 및 이벤트 바인딩
    this.render();
    this.bindEvents();
    this.updateUI();
  }

  /**
   * 현재 값(Value)을 회전 각도(Degree)로 변환
   * @param {number} val - 현재 수치
   * @returns {number} 회전 각도 (-140 ~ +140)
   */
  valueToAngle(val) {
    const ratio = (val - this.min) / (this.max - this.min);
    return this.minAngle + ratio * (this.maxAngle - this.minAngle);
  }

  /**
   * 회전 각도(Degree)를 해당 수치(Value)로 변환
   * @param {number} angle - 회전 각도
   * @returns {number} 클램핑 및 스텝 단위가 적용된 수치
   */
  angleToValue(angle) {
    const clampedAngle = Math.max(this.minAngle, Math.min(this.maxAngle, angle));
    const ratio = (clampedAngle - this.minAngle) / (this.maxAngle - this.minAngle);
    let val = this.min + ratio * (this.max - this.min);
    if (this.step) {
      val = Math.round(val / this.step) * this.step;
    }
    return Math.max(this.min, Math.min(this.max, val));
  }

  /**
   * 노브의 내부 HTML 구조 생성 및 렌더링
   * SVG 원형 링(Arc)과 회전 노브 바디, 값 표시 뱃지 구성
   */
  render() {
    this.el.innerHTML = `
      <div class="flex flex-col items-center select-none group">
        <div class="relative w-16 h-16 flex items-center justify-center">
          <!-- 배경 SVG 및 진행률 아크(Arc) 표시 -->
          <svg class="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 64 64">
            <!-- 고정 배경 트랙 -->
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255, 255, 255, 0.07)" stroke-width="3" stroke-dasharray="130 200" stroke-linecap="round" />
            <!-- 실시간 동적 프로그레스 호 -->
            <circle class="knob-progress-arc" cx="32" cy="32" r="26" fill="none" stroke="#38bdf8" stroke-width="3.5" stroke-dasharray="0 200" stroke-linecap="round" style="transition: stroke-dasharray 0.05s ease;" />
          </svg>

          <!-- 회전하는 노브 본체 (Rotor) -->
          <div class="knob-rotor w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 via-slate-850 to-slate-900 border border-slate-600/60 shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center transition-all duration-75 relative group-hover:border-cyan-400/50">
            <!-- 회전 각도를 나타내는 상단 네온 인디케이터 핀 -->
            <div class="knob-notch w-1 h-3.5 bg-cyan-400 rounded-full absolute top-1 shadow-[0_0_8px_#38bdf8]"></div>
            <!-- 중앙 캡 -->
            <div class="w-4 h-4 rounded-full bg-slate-900/80 border border-slate-700/80"></div>
          </div>
        </div>

        <!-- 수치 및 단위 표시 뱃지 -->
        <div class="mt-1.5 flex items-center gap-1 font-mono text-[11px] text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
          <span class="knob-value-display font-medium text-cyan-400">${this.formatValue(this.value)}</span>
          <span class="text-slate-500 text-[10px]">${this.unit}</span>
        </div>
        <!-- 노브 하단 명칭 라벨 -->
        <span class="text-[11px] font-medium text-slate-400 mt-0.5">${this.label}</span>
      </div>
    `;

    // DOM 참조 저장
    this.rotorEl = this.el.querySelector('.knob-rotor');
    this.valueEl = this.el.querySelector('.knob-value-display');
    this.arcEl = this.el.querySelector('.knob-progress-arc');
  }

  /**
   * 화면에 표시될 수치 포맷팅 (정수 또는 소수점 2자리)
   */
  formatValue(val) {
    if (this.step >= 1) return Math.round(val);
    return val.toFixed(2);
  }

  /**
   * 마우스 드래그, 휠, 터치 제스처 이벤트 리스너 바인딩
   */
  bindEvents() {
    const rotor = this.rotorEl;

    // [마우스 클릭 시 드래그 시작]
    rotor.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.startY = e.clientY;
      this.startValue = this.value;
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    });

    // [마우스 이동 시 상하 드래그로 수치 변경]
    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      // 130px 드래그 시 전체 최소-최대 범위 도달
      const deltaY = this.startY - e.clientY;
      const range = this.max - this.min;
      const stepValue = (deltaY / 130) * range;
      let targetValue = this.startValue + stepValue;

      targetValue = Math.max(this.min, Math.min(this.max, targetValue));
      if (this.step) {
        targetValue = Math.round(targetValue / this.step) * this.step;
      }

      this.setValue(targetValue, true);
    });

    // [마우스 클릭 해제 시 드래그 종료]
    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        document.body.style.cursor = 'default';
      }
    });

    // [마우스 휠 굴림을 통한 정밀 미세 조절]
    rotor.addEventListener('wheel', (e) => {
      e.preventDefault();
      const stepIncrement = (this.step >= 1 ? this.step : (this.max - this.min) * 0.03);
      const delta = e.deltaY < 0 ? stepIncrement : -stepIncrement;
      let targetValue = this.value + delta;
      targetValue = Math.max(this.min, Math.min(this.max, targetValue));
      this.setValue(targetValue, true);
    }, { passive: false });

    // [모바일/태블릿 터치 제스처 지원]
    rotor.addEventListener('touchstart', (e) => {
      this.isDragging = true;
      this.startY = e.touches[0].clientY;
      this.startValue = this.value;
    });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging) return;
      const deltaY = this.startY - e.touches[0].clientY;
      const range = this.max - this.min;
      const stepValue = (deltaY / 130) * range;
      let targetValue = this.startValue + stepValue;
      targetValue = Math.max(this.min, Math.min(this.max, targetValue));
      this.setValue(targetValue, true);
    });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });
  }

  /**
   * 노브의 값을 프로그래밍 방식으로 설정
   * @param {number} val - 설정할 새로운 값
   * @param {boolean} triggerChange - onChange 콜백 실행 여부
   */
  setValue(val, triggerChange = true) {
    this.value = Math.max(this.min, Math.min(this.max, val));
    this.currentAngle = this.valueToAngle(this.value);
    this.updateUI();

    if (triggerChange && this.onChange) {
      this.onChange(this.value);
    }
  }

  /**
   * 노브의 시각적 요소(회전 각도, 텍스트 수치, SVG 프로그레스 호) 동기화
   */
  updateUI() {
    // 1. 노브 본체 회전 각도 적용
    if (this.rotorEl) {
      this.rotorEl.style.transform = `rotate(${this.currentAngle}deg)`;
    }
    // 2. 값 표시 텍스트 갱신
    if (this.valueEl) {
      this.valueEl.textContent = this.formatValue(this.value);
    }
    // 3. SVG 프로그레스 원호 길이 계산 및 반영 (280도 커버)
    if (this.arcEl) {
      const ratio = (this.value - this.min) / (this.max - this.min);
      const maxDash = 127;
      const strokeVal = Math.max(0, ratio * maxDash);
      this.arcEl.style.strokeDasharray = `${strokeVal} 200`;
    }
  }
}

// 전역 객체에 등록
window.RotaryKnob = RotaryKnob;

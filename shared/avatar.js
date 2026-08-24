/**
 * Streamer Support - Shared Avatar Engine (Image & Face Tracking Upgraded)
 */

export const AvatarStates = {
  IDLE: 'IDLE',
  TALKING: 'TALKING',
  HAPPY: 'HAPPY',
  SAD: 'SAD',
  SURPRISED: 'SURPRISED',
  ANGRY: 'ANGRY',
  THINKING: 'THINKING',
  AI_RESPONSE: 'AI_RESPONSE',
  STOPPED: 'STOPPED'
};

const lerp = (start, end, amt) => (1 - amt) * start + amt * end;

export class AvatarEngine {
  constructor(svgId, wrapperId) {
    // Keep parameters for backward compatibility in main.js
    this.wrapperId = wrapperId || svgId;
    this.wrapper = null;
    this.container = null;
    this.imgFront = null;
    this.imgBack = null;
    
    this.currentState = AvatarStates.IDLE;
    this.mode = 'manual'; // 'manual' or 'tracking'
    
    // Face tracking target coordinates
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.targetRoll = 0;
    this.targetX = 0;
    this.targetY = 0;
    
    // Interpolated smoothed values
    this.smoothedYaw = 0;
    this.smoothedPitch = 0;
    this.smoothedRoll = 0;
    this.smoothedX = 0;
    this.smoothedY = 0;
    
    this.isBlinking = false;
    this.isSpeaking = false;
    this.overrideExpression = null;
    this.overrideTimeout = null;
    
    // Loop frames
    this.frameId = null;
    this.blinkLoopTimeout = null;
    
    // Speech mouth state cycling
    this.mouthOpenState = false;
    this.lastMouthToggle = 0;

    // Gesture Mapping config
    this.gestureToStateMap = {
      'ONE_FINGER': 'thinking',
      'TWO_FINGERS': 'happy',
      'THREE_FINGERS': 'laugh',
      'THUMBS_UP': 'excited',
      'OPEN_PALM': 'wave',
      'FIST': 'angry',
      'NONE': null
    };
  }

  mount() {
    this.wrapper = document.getElementById(this.wrapperId);
    if (this.wrapper) {
      this.container = this.wrapper.querySelector('.avatar-stage-container');
      
      const isMobile = this.wrapperId.includes('mobile');
      const prefix = isMobile ? 'mobile' : 'desktop';
      
      this.imgFront = document.getElementById(`${prefix}-avatar-img-front`);
      this.imgBack = document.getElementById(`${prefix}-avatar-img-back`);
    }
    
    this.isSpeaking = false;
    this.isBlinking = false;
    this.overrideExpression = null;
    if (this.overrideTimeout) clearTimeout(this.overrideTimeout);
    
    // Set initial mode UI states
    this.setMode(this.mode);
    this.setExpression('idle');
    
    // Start requestAnimationFrame loop
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.updateFrame();
  }

  applyConfig(config) {
    if (config.defaultExpression) {
      this.setExpression(config.defaultExpression);
    }
  }

  setAvatarState(state) {
    if (this.currentState === AvatarStates.STOPPED && state !== AvatarStates.IDLE && state !== AvatarStates.STOPPED) {
      this.currentState = AvatarStates.IDLE;
    }
    
    this.currentState = state;
    
    // Synchronize manual button grid highlight
    this.syncActiveButton(state.toLowerCase());
    
    switch (state) {
      case AvatarStates.IDLE:
        this.isSpeaking = false;
        break;
      case AvatarStates.TALKING:
        this.isSpeaking = true;
        break;
      case AvatarStates.STOPPED:
        this.isSpeaking = false;
        this.setOverrideExpression('sad');
        break;
      default:
        // Handle override reactions (HAPPY, SAD, ANGRY, SURPRISED, THINKING)
        this.setOverrideExpression(state.toLowerCase());
        break;
    }
    
    // Dispatch custom event for system notifications
    window.dispatchEvent(new CustomEvent('avatarStateChanged', { detail: { state } }));
  }

  setMode(mode) {
    this.mode = mode; // 'manual' or 'tracking'
    
    if (this.container) {
      if (mode === 'tracking') {
        this.container.classList.remove('idle-animating');
      } else {
        this.container.classList.add('idle-animating');
      }
    }
    
    const isMobile = this.wrapperId && this.wrapperId.includes('mobile');
    const prefix = isMobile ? 'mobile' : 'desktop';
    
    // Update badge status
    const modeBadge = document.getElementById(`${prefix}-avatar-mode-text`);
    if (modeBadge) {
      if (mode === 'tracking') {
        modeBadge.textContent = '● CAMERA TRACKING';
        modeBadge.parentElement?.classList.add('tracking-active');
      } else {
        modeBadge.textContent = '● MANUAL CONTROL';
        modeBadge.parentElement?.classList.remove('tracking-active');
      }
    }
    
    // Dim panel in tracking
    const exprPanel = document.getElementById(`${prefix}-expression-panel`);
    if (exprPanel) {
      if (mode === 'tracking') {
        exprPanel.classList.add('disabled');
      } else {
        exprPanel.classList.remove('disabled');
      }
    }
    
    // Highlight buttons
    const btnManual = document.getElementById(`${prefix}-mode-manual`);
    const btnTracking = document.getElementById(`${prefix}-mode-tracking`);
    if (btnManual && btnTracking) {
      if (mode === 'manual') {
        btnManual.classList.add('active');
        btnTracking.classList.remove('active');
      } else {
        btnManual.classList.remove('active');
        btnTracking.classList.add('active');
      }
    }
  }

  setOverrideExpression(expr) {
    this.overrideExpression = expr;
    this.syncActiveButton(expr);
    
    if (this.overrideTimeout) clearTimeout(this.overrideTimeout);
    
    // If in tracking mode, overrides expire after 3 seconds to return to face matching
    if (this.mode === 'tracking') {
      this.overrideTimeout = setTimeout(() => {
        this.overrideExpression = null;
        this.syncActiveButton(null);
      }, 3000);
    }
  }

  setExpression(expr) {
    if (!this.imgFront || !this.imgBack) return;
    
    const cleanExpr = expr.toLowerCase();
    const newSrc = `public/avatar/avatar-${cleanExpr}.png`;
    
    // Check if we are already showing or transitions are in progress
    if (this.imgFront.src.endsWith(newSrc) && this.imgFront.classList.contains('active')) {
      return;
    }
    
    // Swap source to back element
    this.imgBack.src = newSrc;
    
    // Trigger opacity cross-fade
    this.imgFront.classList.remove('active');
    this.imgBack.classList.add('active');
    
    // Swapping handles
    const temp = this.imgFront;
    this.imgFront = this.imgBack;
    this.imgBack = temp;
  }

  syncActiveButton(expr) {
    const isMobile = this.wrapperId && this.wrapperId.includes('mobile');
    const prefix = isMobile ? 'mobile' : 'desktop';
    
    const buttons = document.querySelectorAll(`#${prefix}-expression-panel .expr-btn`);
    buttons.forEach(btn => {
      if (expr && btn.getAttribute('data-expr') === expr.toLowerCase()) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  updateFaceMesh(landmarks) {
    if (!landmarks || this.mode !== 'tracking') return;
    
    // Key landmarks mapping
    const nose = landmarks.nose;
    const cheekL = landmarks.cheekL;
    const cheekR = landmarks.cheekR;
    const forehead = landmarks.forehead;
    const chin = landmarks.chin;
    const eyeL_inner = landmarks.eyeL_inner;
    const eyeL_outer = landmarks.eyeL_outer;
    const eyeR_inner = landmarks.eyeR_inner;
    const eyeR_outer = landmarks.eyeR_outer;
    const eyelidL_top = landmarks.eyelidL_top;
    const eyelidL_bottom = landmarks.eyelidL_bottom;
    const eyelidR_top = landmarks.eyelidR_top;
    const eyelidR_bottom = landmarks.eyelidR_bottom;
    
    // 1. Yaw estimation (Left/Right look rotation)
    const d_nose_left = Math.hypot(nose.x - cheekL.x, nose.y - cheekL.y);
    const d_nose_right = Math.hypot(nose.x - cheekR.x, nose.y - cheekR.y);
    const d_cheeks = Math.hypot(cheekR.x - cheekL.x, cheekR.y - cheekL.y);
    const yawRatio = d_nose_left / d_cheeks;
    this.targetYaw = (yawRatio - 0.5) * 110; 
    this.targetYaw = Math.max(-12, Math.min(12, this.targetYaw));
    
    // 2. Pitch estimation (Up/Down head tilt)
    const d_nose_forehead = Math.hypot(nose.x - forehead.x, nose.y - forehead.y);
    const d_forehead_chin = Math.hypot(chin.x - forehead.x, chin.y - forehead.y);
    const pitchRatio = d_nose_forehead / d_forehead_chin;
    this.targetPitch = (pitchRatio - 0.41) * 80;
    this.targetPitch = Math.max(-8, Math.min(8, this.targetPitch));
    
    // 3. Roll estimation (Left/Right tilt angle)
    const dy = eyeR_outer.y - eyeL_outer.y;
    const dx = eyeR_outer.x - eyeL_outer.x;
    this.targetRoll = Math.atan2(dy, dx) * (180 / Math.PI);
    this.targetRoll = Math.max(-8, Math.min(8, this.targetRoll));
    
    // 4. Translate X and Y (face centering)
    // Horizontal center maps from 0.5 camera coordinate center.
    // Invert X because camera preview is mirrored.
    this.targetX = (0.5 - nose.x) * 140;
    this.targetX = Math.max(-25, Math.min(25, this.targetX));
    
    this.targetY = (nose.y - 0.52) * 120;
    this.targetY = Math.max(-15, Math.min(15, this.targetY));
    
    // 5. Eye Blink Estimation
    const eyeL_open = Math.hypot(eyelidL_top.x - eyelidL_bottom.x, eyelidL_top.y - eyelidL_bottom.y);
    const eyeL_width = Math.hypot(eyeL_inner.x - eyeL_outer.x, eyeL_inner.y - eyeL_outer.y);
    const blinkRatioL = eyeL_open / eyeL_width;
    
    const eyeR_open = Math.hypot(eyelidR_top.x - eyelidR_bottom.x, eyelidR_top.y - eyelidR_bottom.y);
    const eyeR_width = Math.hypot(eyeR_inner.x - eyeR_outer.x, eyeR_inner.y - eyeR_outer.y);
    const blinkRatioR = eyeR_open / eyeR_width;
    
    // Blink threshold below 0.115
    this.isBlinking = (blinkRatioL < 0.115 || blinkRatioR < 0.115);
  }

  updateFrame() {
    if (this.currentState === AvatarStates.STOPPED) {
      if (this.container) this.container.style.transform = '';
      this.setExpression('sad');
      return;
    }
    
    const interpFactor = 0.16; // Interpolation speed
    
    if (this.mode === 'tracking') {
      this.smoothedYaw = lerp(this.smoothedYaw, this.targetYaw, interpFactor);
      this.smoothedPitch = lerp(this.smoothedPitch, this.targetPitch, interpFactor);
      this.smoothedRoll = lerp(this.smoothedRoll, this.targetRoll, interpFactor);
      this.smoothedX = lerp(this.smoothedX, this.targetX, interpFactor);
      this.smoothedY = lerp(this.smoothedY, this.targetY, interpFactor);
      
      if (this.container) {
        // Mirrored camera coordinate space rotation
        this.container.style.transform = `
          translateX(${this.smoothedX}px)
          translateY(${this.smoothedY}px)
          rotateY(${-this.smoothedYaw}deg)
          rotateX(${this.smoothedPitch}deg)
          rotateZ(${this.smoothedRoll}deg)
        `;
      }
      
      // Tracking Expression Resolver
      if (this.isBlinking) {
        this.setExpression('wink');
      } else if (this.overrideExpression) {
        this.setExpression(this.overrideExpression);
      } else if (this.isSpeaking) {
        const now = Date.now();
        if (now - this.lastMouthToggle > 130) {
          this.mouthOpenState = !this.mouthOpenState;
          this.lastMouthToggle = now;
        }
        this.setExpression(this.mouthOpenState ? 'talking' : 'idle');
      } else {
        this.setExpression('idle');
      }
    } else {
      // Manual/Override alignment reset
      this.smoothedYaw = lerp(this.smoothedYaw, 0, 0.08);
      this.smoothedPitch = lerp(this.smoothedPitch, 0, 0.08);
      this.smoothedRoll = lerp(this.smoothedRoll, 0, 0.08);
      this.smoothedX = lerp(this.smoothedX, 0, 0.08);
      this.smoothedY = lerp(this.smoothedY, 0, 0.08);
      
      if (this.container) {
        this.container.style.transform = `
          translateX(${this.smoothedX}px)
          translateY(${this.smoothedY}px)
          rotateY(${this.smoothedYaw}deg)
          rotateX(${this.smoothedPitch}deg)
          rotateZ(${this.smoothedRoll}deg)
        `;
      }
      
      this.setExpression(this.overrideExpression || 'idle');
    }
    
    this.frameId = requestAnimationFrame(() => this.updateFrame());
  }

  updateHandGesture(gestureName) {
    if (this.mode !== 'tracking') return;
    const targetState = this.gestureToStateMap[gestureName];
    if (targetState) {
      this.setOverrideExpression(targetState);
    }
  }

  // Fallback / legacy methods
  startBlinkLoop() {}
  stopLoops() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
  }
}

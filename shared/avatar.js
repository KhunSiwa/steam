/**
 * Streamer Support - Shared Avatar Engine
 */

export const AvatarStates = {
  IDLE: 'IDLE',
  TALKING: 'TALKING',
  BLINK: 'BLINK',
  HAPPY: 'HAPPY',
  SAD: 'SAD',
  SURPRISED: 'SURPRISED',
  ANGRY: 'ANGRY',
  THINKING: 'THINKING',
  AI_RESPONSE: 'AI_RESPONSE',
  STOPPED: 'STOPPED'
};

export class AvatarEngine {
  constructor(svgId, wrapperId) {
    this.svg = null;
    this.wrapper = null;
    this.mouth = null;
    this.eyebrowL = null;
    this.eyebrowR = null;
    this.svgId = svgId;
    this.wrapperId = wrapperId;
    
    this.currentState = AvatarStates.IDLE;
    this.defaultExpression = 'neutral';
    this.isSpeaking = false;
    
    // Animation loops
    this.blinkTimeout = null;
    this.lookTimeout = null;
    this.reactionTimeout = null;
    this.speechTimeout = null;
    
    // Pre-calculated paths for mouth and eyebrows
    this.mouthPaths = {
      neutral: "M 182 215 Q 200 222 218 215",
      happy: "M 182 215 Q 200 236 218 215 Z",
      sad: "M 182 222 Q 200 212 218 222",
      surprised: "M 192 218 A 8 8 0 1 1 208 218 A 8 8 0 1 1 192 218",
      angry: "M 185 224 Q 200 216 215 224 Z",
      thinking: "M 185 218 L 215 218",
      ai_response: "M 180 212 Q 200 240 220 212 Z",
      
      // Lipsync frames
      talk_open_wide: "M 182 215 Q 200 245 218 215 Z",
      talk_open_mid: "M 182 215 Q 200 232 218 215 Z",
      talk_open_narrow: "M 188 218 A 6 10 0 1 1 212 218 A 6 10 0 1 1 188 218",
      talk_closed: "M 182 215 Q 200 218 218 215"
    };

    this.eyebrowPaths = {
      neutral: {
        l: "M 148 152 Q 160 146 172 152",
        r: "M 228 152 Q 240 146 252 152"
      },
      happy: {
        l: "M 148 148 Q 160 140 172 148",
        r: "M 228 148 Q 240 140 252 148"
      },
      sad: {
        l: "M 148 146 Q 160 152 172 152",
        r: "M 228 152 Q 240 152 252 146"
      },
      surprised: {
        l: "M 148 144 Q 160 134 172 144",
        r: "M 228 144 Q 240 134 252 144"
      },
      angry: {
        l: "M 148 146 L 172 156",
        r: "M 228 156 L 252 146"
      },
      thinking: {
        l: "M 148 148 Q 160 146 172 154",
        r: "M 228 144 Q 240 136 252 144"
      }
    };
  }

  mount() {
    this.svg = document.getElementById(this.svgId);
    this.wrapper = document.getElementById(this.wrapperId);
    if (this.svg) {
      this.mouth = this.svg.querySelector('#mouth');
      this.eyebrowL = this.svg.querySelector('#eyebrow-l');
      this.eyebrowR = this.svg.querySelector('#eyebrow-r');
    }
    
    // Clear any previous running loops
    this.stopLoops();
    
    // Start standard loops
    this.startBlinkLoop();
    this.startEyeLookLoop();
    this.setAvatarState(AvatarStates.IDLE);
  }

  stopLoops() {
    if (this.blinkTimeout) clearTimeout(this.blinkTimeout);
    if (this.lookTimeout) clearTimeout(this.lookTimeout);
    if (this.reactionTimeout) clearTimeout(this.reactionTimeout);
    if (this.speechTimeout) clearTimeout(this.speechTimeout);
  }

  applyConfig(config) {
    if (!this.wrapper || !this.svg) return;
    
    this.wrapper.style.transform = `scale(${config.scale}) translateY(${config.yOffset}px)`;
    this.svg.className.baseVal = `style-${config.archetype}`;
    if (!config.showHeadset) {
      this.svg.classList.add('hide-headsets');
    } else {
      this.svg.classList.remove('hide-headsets');
    }

    this.defaultExpression = config.defaultExpression;
    this.setAvatarState(AvatarStates.IDLE);
  }

  setAvatarState(state) {
    if (!this.svg) return;
    
    if (this.currentState === AvatarStates.STOPPED && state !== AvatarStates.IDLE && state !== AvatarStates.STOPPED) {
      this.currentState = AvatarStates.IDLE;
    }

    // Clear state classes
    Object.values(AvatarStates).forEach(s => {
      this.svg.classList.remove(`state-${s.toLowerCase()}`);
    });
    
    this.currentState = state;
    this.svg.classList.add(`state-${state.toLowerCase()}`);
    
    if (this.reactionTimeout) {
      clearTimeout(this.reactionTimeout);
      this.reactionTimeout = null;
    }

    // Sync UI active dev-buttons
    const btn = document.querySelector(`.demo-btn[data-state="${state}"]`);
    if (btn) {
      document.querySelectorAll('.demo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    // Dispatch custom event for UI updates
    const event = new CustomEvent('avatarStateChanged', { detail: { state } });
    window.dispatchEvent(event);

    switch (state) {
      case AvatarStates.IDLE:
        this.stopTalkingAnimation();
        this.setExpression(this.defaultExpression);
        break;
      case AvatarStates.TALKING:
        this.startTalkingAnimation();
        break;
      case AvatarStates.BLINK:
        this.triggerBlinkAction();
        break;
      case AvatarStates.HAPPY:
        this.stopTalkingAnimation();
        this.setExpression('happy');
        this.reactionTimeout = setTimeout(() => this.setAvatarState(AvatarStates.IDLE), 1500);
        break;
      case AvatarStates.SAD:
        this.stopTalkingAnimation();
        this.setExpression('sad');
        this.reactionTimeout = setTimeout(() => this.setAvatarState(AvatarStates.IDLE), 1800);
        break;
      case AvatarStates.SURPRISED:
        this.stopTalkingAnimation();
        this.setExpression('surprised');
        this.reactionTimeout = setTimeout(() => this.setAvatarState(AvatarStates.IDLE), 1500);
        break;
      case AvatarStates.ANGRY:
        this.stopTalkingAnimation();
        this.setExpression('angry');
        this.reactionTimeout = setTimeout(() => this.setAvatarState(AvatarStates.IDLE), 1800);
        break;
      case AvatarStates.THINKING:
        this.stopTalkingAnimation();
        this.setExpression('thinking');
        // AI thinking will hold this state. Manual trigger will time out:
        if (!this.isSpeaking && this.reactionTimeout === null && !this.svg.classList.contains('ai-active')) {
          this.reactionTimeout = setTimeout(() => this.setAvatarState(AvatarStates.IDLE), 2000);
        }
        break;
      case AvatarStates.AI_RESPONSE:
        this.stopTalkingAnimation();
        this.setExpression('ai_response');
        this.reactionTimeout = setTimeout(() => this.setAvatarState(AvatarStates.IDLE), 2500);
        break;
      case AvatarStates.STOPPED:
        this.stopTalkingAnimation();
        this.setExpression('sad');
        break;
    }
  }

  setExpression(expr) {
    if (this.isSpeaking || !this.mouth || !this.eyebrowL || !this.eyebrowR) return;
    
    const mouthPath = this.mouthPaths[expr] || this.mouthPaths.neutral;
    const eyebrow = this.eyebrowPaths[expr] || this.eyebrowPaths.neutral;

    this.mouth.setAttribute('d', mouthPath);
    this.eyebrowL.setAttribute('d', eyebrow.l);
    this.eyebrowR.setAttribute('d', eyebrow.r);
  }

  startTalkingAnimation() {
    if (this.isSpeaking) return;
    this.isSpeaking = true;
    this.animateSpeechCycle();
  }

  stopTalkingAnimation() {
    this.isSpeaking = false;
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
      this.speechTimeout = null;
    }
    
    const expr = (this.currentState !== AvatarStates.TALKING && this.currentState !== AvatarStates.STOPPED)
      ? this.currentState.toLowerCase() 
      : this.defaultExpression;
    this.setExpression(expr);
  }

  animateSpeechCycle() {
    if (!this.isSpeaking || !this.mouth) return;

    const talkPaths = [
      this.mouthPaths.talk_closed,
      this.mouthPaths.talk_open_mid,
      this.mouthPaths.talk_open_wide,
      this.mouthPaths.talk_open_narrow
    ];
    
    const randomPath = talkPaths[Math.floor(Math.random() * talkPaths.length)];
    this.mouth.setAttribute('d', randomPath);

    // Natural randomized talking timers
    const timings = [85, 110, 95, 140];
    const duration = timings[Math.floor(Math.random() * timings.length)];

    this.speechTimeout = setTimeout(() => {
      this.animateSpeechCycle();
    }, duration);
  }

  triggerBlinkAction() {
    const eyeL = this.svg?.querySelector('.eye-blink-l');
    const eyeR = this.svg?.querySelector('.eye-blink-r');
    
    if (eyeL && eyeR) {
      eyeL.classList.add('blink-active');
      eyeR.classList.add('blink-active');
      
      setTimeout(() => {
        eyeL.classList.remove('blink-active');
        eyeR.classList.remove('blink-active');
        if (this.currentState === AvatarStates.BLINK) {
          this.setAvatarState(AvatarStates.IDLE);
        }
      }, 130);
    }
  }

  startBlinkLoop() {
    const triggerBlink = () => {
      if (this.currentState !== AvatarStates.STOPPED) {
        const eyeL = this.svg?.querySelector('.eye-blink-l');
        const eyeR = this.svg?.querySelector('.eye-blink-r');
        
        if (eyeL && eyeR) {
          eyeL.classList.add('blink-active');
          eyeR.classList.add('blink-active');
          
          setTimeout(() => {
            eyeL.classList.remove('blink-active');
            eyeR.classList.remove('blink-active');
          }, 120);
        }
      }
      
      const nextBlink = Math.random() * 3000 + 3000; // 3-6s
      this.blinkTimeout = setTimeout(triggerBlink, nextBlink);
    };
    
    this.blinkTimeout = setTimeout(triggerBlink, 3000);
  }

  startEyeLookLoop() {
    const triggerLook = () => {
      if (this.isSpeaking || this.currentState !== AvatarStates.IDLE || !this.svg) {
        const nextLook = Math.random() * 4000 + 4000;
        this.lookTimeout = setTimeout(triggerLook, nextLook);
        return;
      }
      
      const pupilL = this.svg.querySelector('#pupil-l');
      const pupilR = this.svg.querySelector('#pupil-r');
      
      if (pupilL && pupilR) {
        const states = [
          { x: 0, y: 0 },
          { x: -2.5, y: 0 },
          { x: 2.5, y: 0 },
          { x: 0, y: -2.5 }
        ];
        
        const target = states[Math.floor(Math.random() * states.length)];
        pupilL.style.transform = `translate(${target.x}px, ${target.y}px)`;
        pupilR.style.transform = `translate(${target.x}px, ${target.y}px)`;
        
        setTimeout(() => {
          pupilL.style.transform = `translate(0px, 0px)`;
          pupilR.style.transform = `translate(0px, 0px)`;
        }, Math.random() * 800 + 1200);
      }
      
      const nextLook = Math.random() * 5000 + 5000;
      this.lookTimeout = setTimeout(triggerLook, nextLook);
    };
    
    this.lookTimeout = setTimeout(triggerLook, 5000);
  }
}

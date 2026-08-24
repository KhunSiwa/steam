/**
 * Streamer Support - Main Application Orchestrator (ES Module)
 */

import { StateManager, AppStates } from './shared/state.js';
import { CameraSystem } from './shared/camera.js';
import { MicrophoneSystem } from './shared/microphone.js';
import { AvatarEngine, AvatarStates } from './shared/avatar.js';
import { AISystem } from './shared/ai.js';
import { TTSSystem } from './shared/tts.js';
import { ChatSystem } from './shared/chat.js';
import { ModerationSystem } from './shared/moderation.js';
import { DeviceManager } from './shared/devices.js';
import { EmergencySystem } from './shared/emergency.js';

class AppController {
  constructor() {
    // 1. Initialize State & Shared modules
    this.stateManager = new StateManager();
    this.deviceManager = new DeviceManager(this.stateManager);
    this.moderationSystem = new ModerationSystem(this.stateManager);
    this.aiSystem = new AISystem(this.stateManager);
    
    // We instantiate AvatarEngine, CameraSystem, MicrophoneSystem, TTS, and Chat
    // but they will bind to specific DOM nodes during mount() depending on the view.
    this.avatarEngine = new AvatarEngine('desktop-avatar-wrapper');
    this.cameraSystem = new CameraSystem('desktop-video-el');
    this.microphoneSystem = new MicrophoneSystem();
    this.ttsSystem = new TTSSystem(this.stateManager, this.avatarEngine);
    this.chatSystem = new ChatSystem(
      this.stateManager,
      this.moderationSystem,
      this.aiSystem,
      this.ttsSystem,
      this.avatarEngine
    );
    
    this.emergencySystem = new EmergencySystem(
      this.stateManager,
      this.ttsSystem,
      this.chatSystem,
      this.avatarEngine,
      this.cameraSystem
    );
    
    // active view flags
    this.activeWorkspace = null; // 'computer' or 'phone'
    this.faceMesh = null;
    this.trackingLoopActive = false;
    
    // Bind global state notifiers
    this.stateManager.on('deviceTypeChanged', (type) => this.handleWorkspaceRoute(type));
    this.stateManager.on('modeChanged', (mode) => this.handleModeTransition(mode));
    this.stateManager.on('connectionChanged', (connected) => this.updateConnectionStatus(connected));
    this.stateManager.on('settingsChanged', (settings) => this.applySettingsUpdates(settings));
    this.stateManager.on('devicesUpdated', (devices) => this.renderHardwareList(devices));
    
    this.initFaceMesh();
  }

  async init() {
    console.log("Streamer Support system initialisation...");
    
    // 1. Detect if FastAPI backend is online
    await this.probeBackend();
    
    // 2. Bind selection screen buttons
    document.getElementById('btn-device-computer').addEventListener('click', () => {
      this.stateManager.setDeviceType('computer');
    });
    
    document.getElementById('btn-device-phone').addEventListener('click', () => {
      this.stateManager.setDeviceType('phone');
    });

    // 3. Scan hardware initial state
    await this.deviceManager.scanDevices();
  }

  async probeBackend() {
    try {
      const response = await fetch('http://localhost:8080/api/devices', { method: 'GET' });
      if (response.ok) {
        console.log("FastAPI backend detected online.");
        this.stateManager.setBackendConnection(true);
        return;
      }
    } catch (e) {
      console.log("FastAPI backend is offline. Running in standalone simulator mode.");
    }
    this.stateManager.setBackendConnection(false);
  }

  handleWorkspaceRoute(workspace) {
    this.activeWorkspace = workspace;
    document.body.className = `view-${workspace}`;
    
    // Hide selection view
    document.getElementById('device-selection-screen').style.display = 'none';

    if (workspace === 'computer') {
      document.getElementById('computer-interface').style.display = 'flex';
      document.getElementById('phone-interface').style.display = 'none';
      
      // Mount Computer specific DOM nodes
      this.avatarEngine.wrapperId = 'desktop-avatar-wrapper';
      this.cameraSystem.videoElementId = 'desktop-video-el';
      
      this.avatarEngine.mount();
      this.chatSystem.mount('desktop-chat-log');
      
      this.bindDesktopEvents();
    } else {
      document.getElementById('computer-interface').style.display = 'none';
      document.getElementById('phone-interface').style.display = 'flex';
      
      // Mount Phone specific DOM nodes
      this.avatarEngine.wrapperId = 'mobile-avatar-wrapper';
      this.cameraSystem.videoElementId = 'mobile-video-el';
      
      this.avatarEngine.mount();
      this.chatSystem.mount('mobile-chat-log');
      
      this.bindMobileEvents();
    }

    // Load configurations and set initial mode
    this.applySettingsUpdates(this.stateManager.settings);
    this.stateManager.setMode(AppStates.LIVE); // Default to LIVE mode
    
    // Start Chat feed loop
    this.chatSystem.connectChat();
  }

  // --- DESKTOP INTERFACE BINDINGS ---
  bindDesktopEvents() {
    // Mode Buttons
    document.getElementById('desktop-mode-live').addEventListener('click', () => this.stateManager.setMode(AppStates.LIVE));
    document.getElementById('desktop-mode-away').addEventListener('click', () => this.stateManager.setMode(AppStates.AWAY));

    // Control toggles
    document.getElementById('desktop-cam-switch').addEventListener('click', (e) => this.toggleCamera(e.target));
    document.getElementById('desktop-control-cam').addEventListener('click', () => this.toggleCamera(document.getElementById('desktop-cam-switch')));
    document.getElementById('desktop-cam-toggle-btn')?.addEventListener('click', () => this.toggleCamera());
    document.getElementById('desktop-tracking-toggle-btn')?.addEventListener('click', (e) => {
      const active = this.avatarEngine.mode === 'tracking';
      if (active) {
        this.avatarEngine.setMode('manual');
        e.currentTarget.textContent = 'Tracking: OFF';
        e.currentTarget.classList.remove('active');
        document.getElementById('desktop-mode-manual')?.classList.add('active');
        document.getElementById('desktop-mode-tracking')?.classList.remove('active');
      } else {
        this.avatarEngine.setMode('tracking');
        e.currentTarget.textContent = 'Tracking: ON';
        e.currentTarget.classList.add('active');
        document.getElementById('desktop-mode-tracking')?.classList.add('active');
        document.getElementById('desktop-mode-manual')?.classList.remove('active');
        if (this.cameraSystem.cameraEnabled) {
          this.runFaceMeshLoop();
        } else {
          this.connectCameraStream();
        }
      }
    });
    
    document.getElementById('desktop-mic-switch').addEventListener('click', (e) => this.toggleMicrophone(e.target));
    document.getElementById('desktop-control-mic').addEventListener('click', () => this.toggleMicrophone(document.getElementById('desktop-mic-switch')));
    
    document.getElementById('desktop-control-avatar').addEventListener('click', (e) => {
      const active = e.currentTarget.classList.toggle('active');
      const wrapper = document.getElementById('desktop-avatar-wrapper');
      if (wrapper) {
        wrapper.style.opacity = active ? '1' : '0';
        wrapper.style.pointerEvents = active ? 'auto' : 'none';
      }
    });

    document.getElementById('desktop-control-ai').addEventListener('click', (e) => {
      const enabled = e.currentTarget.classList.toggle('active');
      this.stateManager.updateSettings({ autoReplies: enabled });
    });

    // Mute is mapped via Gain slider to 0 or mic toggle
    document.getElementById('desktop-mic-gain').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.microphoneSystem.setMicrophoneGain(val);
      document.getElementById('desktop-gain-value').textContent = `${val.toFixed(1)}x`;
    });

    // Emergency Stop
    document.querySelectorAll('.desktop-emergency-stop').forEach(btn => {
      btn.addEventListener('click', () => this.emergencySystem.emergencyStop());
    });

    // Settings Modal interactions
    const dialog = document.getElementById('settings-dialog');
    document.getElementById('desktop-settings-trigger').addEventListener('click', () => {
      this.syncSettingsToForm();
      dialog.show();
    });
    
    document.getElementById('settings-close').addEventListener('click', () => dialog.close());
    document.getElementById('settings-save').addEventListener('click', () => {
      this.saveSettingsFromForm();
      dialog.close();
    });
    
    document.getElementById('settings-reset').addEventListener('click', () => {
      this.stateManager.resetSettings();
      this.syncSettingsToForm();
    });

    // Settings Tabs switching
    const tabButtons = dialog.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        dialog.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const targetTab = btn.getAttribute('data-tab');
        dialog.querySelector(`#${targetTab}`).classList.add('active');
      });
    });

    // Settings sliders real-time badge updates
    document.getElementById('setting-avatar-scale').addEventListener('input', (e) => {
      document.getElementById('val-scale').textContent = `${e.target.value}%`;
    });
    document.getElementById('setting-avatar-y').addEventListener('input', (e) => {
      document.getElementById('val-y').textContent = `${e.target.value}px`;
    });
    document.getElementById('setting-beh-frequency').addEventListener('input', (e) => {
      document.getElementById('val-frequency').textContent = `${e.target.value}%`;
    });
    document.getElementById('setting-beh-delay').addEventListener('input', (e) => {
      document.getElementById('val-delay').textContent = `${parseFloat(e.target.value).toFixed(1)}s`;
    });

    this.bindAvatarControls('desktop');

    // Back to Selection
    document.getElementById('desktop-back-btn').addEventListener('click', () => this.exitWorkspace());
  }

  // --- MOBILE COMPANION BINDINGS ---
  bindMobileEvents() {
    // Mode Switchers
    document.getElementById('mobile-mode-live').addEventListener('click', () => this.stateManager.setMode(AppStates.LIVE));
    document.getElementById('mobile-mode-away').addEventListener('click', () => this.stateManager.setMode(AppStates.AWAY));

    // Bottom Navigation Toggles
    const navItems = document.querySelectorAll('.mobile-nav-bar .nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        navItems.forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.mobile-tab-panel').forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        const targetTab = btn.getAttribute('data-tab');
        document.getElementById(targetTab).classList.add('active');
      });
    });

    // Quick control buttons
    document.getElementById('mobile-quick-cam').addEventListener('click', (e) => this.toggleCamera(e.target));
    document.getElementById('mobile-quick-mic').addEventListener('click', (e) => this.toggleMicrophone(e.target));
    
    document.getElementById('mobile-quick-avatar').addEventListener('click', (e) => {
      const active = e.currentTarget.classList.toggle('active');
      const wrapper = document.getElementById('mobile-avatar-wrapper');
      if (wrapper) {
        wrapper.style.opacity = active ? '1' : '0';
        wrapper.style.pointerEvents = active ? 'auto' : 'none';
      }
    });

    document.getElementById('mobile-quick-ai').addEventListener('click', (e) => {
      const enabled = e.currentTarget.classList.toggle('active');
      this.stateManager.updateSettings({ autoReplies: enabled });
    });

    // Mobile inputs
    document.getElementById('mobile-mic-gain').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.microphoneSystem.setMicrophoneGain(val);
      document.getElementById('mobile-gain-value').textContent = `${val.toFixed(1)}x`;
    });

    this.bindAvatarControls('mobile');

    // Back to Selection
    document.getElementById('mobile-back-btn').addEventListener('click', () => this.exitWorkspace());
  }

  // --- SHARED CONTROL LOGICS ---
  async toggleCamera(buttonElement) {
    if (this.stateManager.currentMode === AppStates.AWAY) return; // Camera locked off in away mode

    if (this.cameraSystem.cameraEnabled) {
      await this.disconnectCameraStream();
    } else {
      await this.connectCameraStream();
    }
  }

  async connectCameraStream() {
    try {
      const allowed = await this.cameraSystem.requestCamera();
      if (allowed) {
        const connected = await this.cameraSystem.connectCamera();
        if (connected) {
          const prefix = this.activeWorkspace;
          const videoEl = document.getElementById(`${prefix}-video-el`);
          if (videoEl && this.cameraSystem.stream) {
            videoEl.srcObject = this.cameraSystem.stream;
            try {
              await videoEl.play();
            } catch (playErr) {
              console.warn("Video play failed:", playErr);
            }
          }
          
          const placeholder = document.getElementById(`${prefix}-video-placeholder`);
          if (placeholder) placeholder.classList.add('hidden');
          
          const indicator = document.getElementById(`${prefix}-cam-indicator`);
          if (indicator) {
            indicator.textContent = '● ON';
            indicator.classList.add('active');
          }
          
          document.getElementById(`${prefix}-cam-switch`)?.classList.add('active');
          document.getElementById('desktop-control-cam')?.classList.add('active');
          document.getElementById('mobile-quick-cam')?.classList.add('active');
          
          const cardCamToggle = document.getElementById(`${prefix}-cam-toggle-btn`);
          if (cardCamToggle) cardCamToggle.classList.add('active');
          
          if (this.avatarEngine.mode === 'tracking') {
            this.runFaceMeshLoop();
          }

          await this.deviceManager.scanDevices();
        }
      }
    } catch (e) {
      console.error("connectCameraStream error:", e);
    }
  }

  async disconnectCameraStream() {
    try {
      await this.cameraSystem.disconnectCamera();
      
      const prefix = this.activeWorkspace;
      const videoEl = document.getElementById(`${prefix}-video-el`);
      if (videoEl) {
        videoEl.srcObject = null;
      }
      
      const placeholder = document.getElementById(`${prefix}-video-placeholder`);
      if (placeholder) placeholder.classList.remove('hidden');
      
      const indicator = document.getElementById(`${prefix}-cam-indicator`);
      if (indicator) {
        indicator.textContent = '● OFF';
        indicator.classList.remove('active');
      }
      
      document.getElementById(`${prefix}-cam-switch`)?.classList.remove('active');
      document.getElementById('desktop-control-cam')?.classList.remove('active');
      document.getElementById('mobile-quick-cam')?.classList.remove('active');

      const cardCamToggle = document.getElementById(`${prefix}-cam-toggle-btn`);
      if (cardCamToggle) cardCamToggle.classList.remove('active');

      if (this.avatarEngine) {
        this.avatarEngine.targetYaw = 0;
        this.avatarEngine.targetPitch = 0;
        this.avatarEngine.targetRoll = 0;
        this.avatarEngine.targetX = 0;
        this.avatarEngine.targetY = 0;
        this.avatarEngine.isBlinking = false;
        this.avatarEngine.isSpeaking = false;
      }

      await this.deviceManager.scanDevices();
    } catch (e) {
      console.error("disconnectCameraStream error:", e);
    }
  }

  async toggleMicrophone(buttonElement) {
    if (this.stateManager.currentMode === AppStates.AWAY) return; // Mic locked off in away mode

    if (this.microphoneSystem.microphoneEnabled) {
      await this.microphoneSystem.disconnectMicrophone();
      buttonElement.classList.remove('active');
      document.getElementById('desktop-control-mic')?.classList.remove('active');
    } else {
      const allowed = await this.microphoneSystem.requestMicrophone();
      if (allowed) {
        const levelUpdateHandler = (vol) => {
          const meter = document.getElementById(`${this.activeWorkspace}-mic-meter`);
          if (meter) meter.style.width = `${vol}%`;
          
          if (this.avatarEngine && this.avatarEngine.mode === 'tracking') {
            this.avatarEngine.isSpeaking = vol > 12; // 12% speaking threshold
          }
        };
        const connected = await this.microphoneSystem.connectMicrophone(null, levelUpdateHandler);
        if (connected) {
          buttonElement.classList.add('active');
          document.getElementById('desktop-control-mic')?.classList.add('active');
        }
      }
    }
    
    // Sync device list
    await this.deviceManager.scanDevices();
  }

  // --- STATE HANDLERS ---
  handleModeTransition(mode) {
    console.log(`Ecosystem transitioning to ${mode} mode.`);
    
    const dBadge = document.getElementById('desktop-mode-badge');
    const mBadge = document.getElementById('mobile-away-banner');
    
    if (dBadge) {
      dBadge.className = `mode-badge badge-${mode.toLowerCase()}`;
      dBadge.textContent = mode;
    }

    // Toggle active classes on mode selector buttons
    document.querySelectorAll('#desktop-mode-live, #mobile-mode-live').forEach(btn => {
      btn.classList.toggle('active', mode === AppStates.LIVE);
    });
    document.querySelectorAll('#desktop-mode-away, #mobile-mode-away').forEach(btn => {
      btn.classList.toggle('active', mode === AppStates.AWAY);
    });

    const dBanner = document.getElementById('desktop-away-banner');
    const dPresence = document.getElementById('desktop-presence-badge');

    if (mode === AppStates.LIVE) {
      // 1. Restore visual badges
      if (dBanner) dBanner.classList.remove('visible');
      if (mBadge) mBadge.style.opacity = '0';
      if (dPresence) {
        dPresence.textContent = "CREATOR PRESENT";
        dPresence.className = "presence-overlay";
      }

      // 2. Reactivate Camera and Mic if toggled previously
      // (Otherwise keep offline)
    } else if (mode === AppStates.AWAY) {
      // 1. Cut real camera & microphone inputs immediately
      this.disconnectCameraStream();
      this.microphoneSystem.disconnectMicrophone();
      
      // Update UI button states
      document.querySelectorAll('#desktop-cam-switch, #mobile-quick-cam, #desktop-mic-switch, #mobile-quick-mic').forEach(el => {
        el.classList.remove('active');
      });
      document.getElementById('desktop-control-cam')?.classList.remove('active');
      document.getElementById('desktop-control-mic')?.classList.remove('active');

      // 2. Turn on Away broadcast layers
      if (dBanner) dBanner.classList.add('visible');
      if (mBadge) mBadge.style.opacity = '1';
      if (dPresence) {
        dPresence.textContent = "AWAY";
        dPresence.className = "presence-overlay badge-away";
      }
      
      this.avatarEngine.setAvatarState(AvatarStates.IDLE);
    } else if (mode === AppStates.STOPPED) {
      // Emergency Stop engaged
      this.cameraSystem.disconnectCamera();
      this.microphoneSystem.disconnectMicrophone();
      
      document.querySelectorAll('#desktop-cam-switch, #mobile-quick-cam, #desktop-mic-switch, #mobile-quick-mic').forEach(el => {
        el.classList.remove('active');
      });

      if (dBanner) dBanner.classList.remove('visible');
      if (mBadge) mBadge.style.opacity = '0';
      if (dPresence) {
        dPresence.textContent = "STOPPED";
        dPresence.className = "presence-overlay badge-stopped";
      }
    }
  }

  updateConnectionStatus(connected) {
    const desktopStatus = document.getElementById('desktop-connection');
    const mobileStatusDot = document.getElementById('mobile-connection-dot');
    
    if (desktopStatus) {
      desktopStatus.className = `status-indicator ${connected ? 'online' : ''}`;
      desktopStatus.querySelector('.status-text').textContent = connected ? 'Server: Connected' : 'Server: Offline';
    }
    
    if (mobileStatusDot) {
      mobileStatusDot.className = `status-dot ${connected ? 'green' : 'red'}`;
    }
  }

  applySettingsUpdates(settings) {
    this.avatarEngine.applyConfig({
      archetype: settings.archetype,
      scale: settings.scale,
      yOffset: settings.yOffset,
      defaultExpression: settings.defaultExpression,
      showHeadset: settings.showHeadset
    });
    
    // Update monitor feeds
    const monitorBadge = document.getElementById('desktop-chat-badge');
    if (monitorBadge) {
      monitorBadge.textContent = settings.chatReading ? 'MONITOR ACTIVE' : 'MONITOR OFF';
      monitorBadge.className = settings.chatReading ? 'chat-mode-badge sub' : 'chat-mode-badge';
    }
  }

  // --- RENDER HARDWARE PANEL (INTEGRATION LIST) ---
  renderHardwareList(devices) {
    const container = document.getElementById('desktop-hardware-list');
    const mobileSelect = document.getElementById('mobile-cam-select');
    const mobileMicSelect = document.getElementById('mobile-mic-select');
    
    if (container) {
      container.innerHTML = '';
      devices.forEach(dev => {
        const item = document.createElement('div');
        item.className = 'hw-device-item';
        
        let batteryInfo = '';
        if (dev.connected && dev.battery !== null) {
          batteryInfo = `<span class="battery-badge">${dev.battery}%</span>`;
        }

        item.innerHTML = `
          <div class="hw-device-info">
            <h5>${dev.name}</h5>
            <p>${dev.type} • ${dev.spec}</p>
          </div>
          <div class="hw-device-status">
            ${batteryInfo}
            <span class="hw-status-dot ${dev.connected ? 'active' : 'inactive'}"></span>
          </div>
        `;
        container.appendChild(item);
      });
    }

    // Populate mobile selector options
    if (mobileSelect) {
      mobileSelect.innerHTML = '';
      devices.filter(d => d.type === 'Camera' || d.type === 'Phone Camera').forEach(cam => {
        const opt = document.createElement('option');
        opt.value = cam.id;
        opt.textContent = `${cam.name} (${cam.connected ? 'Connected' : 'Disconnected'})`;
        mobileSelect.appendChild(opt);
      });
    }
    
    if (mobileMicSelect) {
      mobileMicSelect.innerHTML = '';
      devices.filter(d => d.type === 'Microphone' || d.type === 'Small Microphone').forEach(mic => {
        const opt = document.createElement('option');
        opt.value = mic.id;
        opt.textContent = `${mic.name} (${mic.connected ? 'Connected' : 'Disconnected'})`;
        mobileMicSelect.appendChild(opt);
      });
    }
  }

  // --- SETTINGS MIGRATIONS (DOM MAPS) ---
  syncSettingsToForm() {
    const s = this.stateManager.settings;
    
    // Sliders & selects
    document.getElementById('setting-avatar-style').value = s.archetype;
    document.getElementById('setting-avatar-scale').value = Math.round(s.scale * 100);
    document.getElementById('val-scale').textContent = `${Math.round(s.scale * 100)}%`;
    
    document.getElementById('setting-avatar-y').value = s.yOffset;
    document.getElementById('val-y').textContent = `${s.yOffset}px`;
    
    document.getElementById('setting-avatar-expression').value = s.defaultExpression;
    document.getElementById('setting-avatar-headset').checked = s.showHeadset;

    // AI
    document.getElementById('setting-ai-name').value = s.aiName;
    document.getElementById('setting-ai-personality').value = s.personality;
    document.getElementById('setting-ai-tone').value = s.tone;
    document.getElementById('setting-ai-length').value = s.responseLength;
    document.getElementById('setting-ai-language').value = s.language;
    document.getElementById('setting-ai-instructions').value = s.customInstructions;

    // Knowledge
    document.getElementById('setting-kn-creator').value = s.knCreator || "Antigravity is a speedrunner playing retro RPGs.";
    document.getElementById('setting-kn-schedule').value = s.knSchedule || "Tuesday & Thursday at 8 PM";
    document.getElementById('setting-kn-faqs').value = s.knFaq || "Brown mechanical switches";
    document.getElementById('setting-kn-allowed').value = s.allowedTopics;
    document.getElementById('setting-kn-forbidden').value = s.forbiddenTopics;

    // Behavior
    document.getElementById('setting-beh-frequency').value = s.frequency;
    document.getElementById('val-frequency').textContent = `${s.frequency}%`;
    
    document.getElementById('setting-beh-delay').value = s.delay;
    document.getElementById('val-delay').textContent = `${s.delay.toFixed(1)}s`;
    
    document.getElementById('setting-beh-auto').checked = s.autoReplies;
    document.getElementById('setting-beh-read').checked = s.chatReading;
  }

  saveSettingsFromForm() {
    const newSettings = {
      archetype: document.getElementById('setting-avatar-style').value,
      scale: parseFloat(document.getElementById('setting-avatar-scale').value) / 100,
      yOffset: parseInt(document.getElementById('setting-avatar-y').value),
      defaultExpression: document.getElementById('setting-avatar-expression').value,
      showHeadset: document.getElementById('setting-avatar-headset').checked,
      
      aiName: document.getElementById('setting-ai-name').value,
      personality: document.getElementById('setting-ai-personality').value,
      tone: document.getElementById('setting-ai-tone').value,
      responseLength: document.getElementById('setting-ai-length').value,
      language: document.getElementById('setting-ai-language').value,
      customInstructions: document.getElementById('setting-ai-instructions').value,
      
      knCreator: document.getElementById('setting-kn-creator').value,
      knSchedule: document.getElementById('setting-kn-schedule').value,
      knFaq: document.getElementById('setting-kn-faqs').value,
      allowedTopics: document.getElementById('setting-kn-allowed').value,
      forbiddenTopics: document.getElementById('setting-kn-forbidden').value,

      frequency: parseInt(document.getElementById('setting-beh-frequency').value),
      delay: parseFloat(document.getElementById('setting-beh-delay').value),
      autoReplies: document.getElementById('setting-beh-auto').checked,
      chatReading: document.getElementById('setting-beh-read').checked
    };

    this.stateManager.updateSettings(newSettings);
  }

  exitWorkspace() {
    // Stop feeds and streams
    this.chatSystem.disconnectChat();
    this.disconnectCameraStream();
    this.microphoneSystem.disconnectMicrophone();
    
    // Clear and reset UI view states
    this.activeWorkspace = null;
    document.body.className = 'view-selection';
    document.getElementById('device-selection-screen').style.display = 'flex';
    document.getElementById('computer-interface').style.display = 'none';
    document.getElementById('phone-interface').style.display = 'none';
  }

  initFaceMesh() {
    try {
      if (typeof FaceMesh !== 'undefined') {
        this.faceMesh = new FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        
        this.faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        
        this.faceMesh.onResults((results) => {
          if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            
            // Map raw landmarks array to structural properties expected by AvatarEngine.updateFaceMesh
            const faceObj = {
              nose: landmarks[4],
              cheekL: landmarks[234],
              cheekR: landmarks[454],
              forehead: landmarks[10],
              chin: landmarks[152],
              eyeL_inner: landmarks[133],
              eyeL_outer: landmarks[33],
              eyeR_inner: landmarks[362],
              eyeR_outer: landmarks[263],
              eyelidL_top: landmarks[159],
              eyelidL_bottom: landmarks[145],
              eyelidR_top: landmarks[386],
              eyelidR_bottom: landmarks[374]
            };
            
            if (this.avatarEngine) {
              this.avatarEngine.updateFaceMesh(faceObj);
            }
          }
        });
        
        console.log("MediaPipe FaceMesh initialised locally.");
      } else {
        console.warn("MediaPipe FaceMesh library not loaded. Face tracking fallback to Manual Mode.");
      }
    } catch (e) {
      console.warn("MediaPipe FaceMesh initialization failed: ", e);
    }
  }

  runFaceMeshLoop() {
    if (!this.cameraSystem.cameraEnabled || this.avatarEngine.mode !== 'tracking') {
      this.trackingLoopActive = false;
      return;
    }
    
    this.trackingLoopActive = true;
    const prefix = this.activeWorkspace;
    const videoEl = document.getElementById(`${prefix}-video-el`);
    
    if (videoEl && videoEl.readyState >= 2 && this.faceMesh) {
      this.faceMesh.send({ image: videoEl }).catch(err => {
        console.warn("FaceMesh send error: ", err);
      });
    }
    
    requestAnimationFrame(() => this.runFaceMeshLoop());
  }

  bindAvatarControls(prefix) {
    const btnManual = document.getElementById(`${prefix}-mode-manual`);
    const btnTracking = document.getElementById(`${prefix}-mode-tracking`);
    
    if (btnManual && btnTracking) {
      btnManual.addEventListener('click', () => {
        this.avatarEngine.setMode('manual');
        
        // Sync desktop card tracking button label if in desktop prefix
        const cardTrackBtn = document.getElementById('desktop-tracking-toggle-btn');
        if (cardTrackBtn) {
          cardTrackBtn.textContent = 'Tracking: OFF';
          cardTrackBtn.classList.remove('active');
        }

        // Sync other workspace view mode
        const other = prefix === 'desktop' ? 'mobile' : 'desktop';
        const otherBtnManual = document.getElementById(`${other}-mode-manual`);
        if (otherBtnManual) {
          otherBtnManual.classList.add('active');
          document.getElementById(`${other}-mode-tracking`)?.classList.remove('active');
        }
      });
      
      btnTracking.addEventListener('click', () => {
        this.avatarEngine.setMode('tracking');
        if (!this.cameraSystem.cameraEnabled) {
          this.connectCameraStream();
        } else {
          this.runFaceMeshLoop();
        }
        
        // Sync desktop card tracking button label if in desktop prefix
        const cardTrackBtn = document.getElementById('desktop-tracking-toggle-btn');
        if (cardTrackBtn) {
          cardTrackBtn.textContent = 'Tracking: ON';
          cardTrackBtn.classList.add('active');
        }

        // Sync other workspace view mode
        const other = prefix === 'desktop' ? 'mobile' : 'desktop';
        const otherBtnTracking = document.getElementById(`${other}-mode-tracking`);
        if (otherBtnTracking) {
          otherBtnTracking.classList.add('active');
          document.getElementById(`${other}-mode-manual`)?.classList.remove('active');
        }
      });
    }
    
    const exprButtons = document.querySelectorAll(`#${prefix}-expression-panel .expr-btn`);
    exprButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const expr = e.currentTarget.getAttribute('data-expr');
        this.avatarEngine.setOverrideExpression(expr);
        
        // Sync the other prefix panel buttons
        const other = prefix === 'desktop' ? 'mobile' : 'desktop';
        const otherButtons = document.querySelectorAll(`#${other}-expression-panel .expr-btn`);
        otherButtons.forEach(otherBtn => {
          if (otherBtn.getAttribute('data-expr') === expr) {
            otherBtn.classList.add('active');
          } else {
            otherBtn.classList.remove('active');
          }
        });
      });
    });
  }
}

// Instantiate and start app on load
window.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  window.appInstance = app; // globally export for debugging console
  app.init();
});

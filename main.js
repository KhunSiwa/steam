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
    this.avatarEngine = new AvatarEngine('desktop-avatar-svg', 'desktop-avatar-wrapper');
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
    
    // Bind global state notifiers
    this.stateManager.on('deviceTypeChanged', (type) => this.handleWorkspaceRoute(type));
    this.stateManager.on('modeChanged', (mode) => this.handleModeTransition(mode));
    this.stateManager.on('connectionChanged', (connected) => this.updateConnectionStatus(connected));
    this.stateManager.on('settingsChanged', (settings) => this.applySettingsUpdates(settings));
    this.stateManager.on('devicesUpdated', (devices) => this.renderHardwareList(devices));
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
      this.avatarEngine.svgId = 'desktop-avatar-svg';
      this.avatarEngine.wrapperId = 'desktop-avatar-wrapper';
      this.cameraSystem.videoElementId = 'desktop-video-el';
      
      this.avatarEngine.mount();
      this.chatSystem.mount('desktop-chat-log');
      
      this.bindDesktopEvents();
    } else {
      document.getElementById('computer-interface').style.display = 'none';
      document.getElementById('phone-interface').style.display = 'flex';
      
      // Mount Phone specific DOM nodes
      this.avatarEngine.svgId = 'mobile-avatar-svg';
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

    document.getElementById('mobile-avatar-style').addEventListener('change', (e) => {
      this.stateManager.updateSettings({ archetype: e.target.value });
    });

    document.getElementById('mobile-avatar-scale').addEventListener('input', (e) => {
      this.stateManager.updateSettings({ scale: parseFloat(e.target.value) / 100 });
    });

    document.getElementById('mobile-save-settings').addEventListener('click', () => {
      const newSettings = {
        aiName: document.getElementById('mobile-setting-name').value,
        tone: document.getElementById('mobile-setting-tone').value,
        language: document.getElementById('mobile-setting-lang').value
      };
      this.stateManager.updateSettings(newSettings);
      alert("Mobile settings applied.");
    });

    // Back to Selection
    document.getElementById('mobile-back-btn').addEventListener('click', () => this.exitWorkspace());
  }

  // --- SHARED CONTROL LOGICS ---
  async toggleCamera(buttonElement) {
    if (this.stateManager.currentMode === AppStates.AWAY) return; // Camera locked off in away mode

    if (this.cameraSystem.cameraEnabled) {
      await this.cameraSystem.disconnectCamera();
      buttonElement.classList.remove('active');
      
      const placeholder = document.getElementById(`${this.activeWorkspace}-video-placeholder`);
      if (placeholder) placeholder.classList.remove('hidden');
      
      document.getElementById('desktop-control-cam')?.classList.remove('active');
    } else {
      const allowed = await this.cameraSystem.requestCamera();
      if (allowed) {
        const connected = await this.cameraSystem.connectCamera();
        if (connected) {
          buttonElement.classList.add('active');
          
          const placeholder = document.getElementById(`${this.activeWorkspace}-video-placeholder`);
          if (placeholder) placeholder.classList.add('hidden');
          
          document.getElementById('desktop-control-cam')?.classList.add('active');
        }
      }
    }
    
    // Sync device list
    await this.deviceManager.scanDevices();
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
      this.cameraSystem.disconnectCamera();
      this.microphoneSystem.disconnectMicrophone();
      
      // Update UI button states
      document.querySelectorAll('#desktop-cam-switch, #mobile-quick-cam, #desktop-mic-switch, #mobile-quick-mic').forEach(el => {
        el.classList.remove('active');
      });
      document.getElementById('desktop-control-cam')?.classList.remove('active');
      document.getElementById('desktop-control-mic')?.classList.remove('active');

      // Show placeholders
      const dPlaceholder = document.getElementById('desktop-video-placeholder');
      const mPlaceholder = document.getElementById('mobile-video-placeholder');
      if (dPlaceholder) dPlaceholder.classList.remove('hidden');
      if (mPlaceholder) mPlaceholder.classList.remove('hidden');

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
    this.cameraSystem.disconnectCamera();
    this.microphoneSystem.disconnectMicrophone();
    
    // Clear and reset UI view states
    this.activeWorkspace = null;
    document.body.className = 'view-selection';
    document.getElementById('device-selection-screen').style.display = 'flex';
    document.getElementById('computer-interface').style.display = 'none';
    document.getElementById('phone-interface').style.display = 'none';
  }
}

// Instantiate and start app on load
window.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  window.appInstance = app; // globally export for debugging console
  app.init();
});

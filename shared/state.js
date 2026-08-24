/**
 * Streamer Support - Shared State & Settings Manager
 */

export const AppStates = {
  OFFLINE: 'OFFLINE',
  CONNECTING: 'CONNECTING',
  LIVE: 'LIVE',
  AWAY: 'AWAY',
  STOPPED: 'STOPPED'
};

export class StateManager {
  constructor() {
    this.currentMode = AppStates.OFFLINE;
    this.selectedDeviceType = null; // 'computer' or 'phone'
    this.backendConnected = false;
    
    // Core Creator configurations
    this.settings = {
      // Avatar Settings
      archetype: 'cyberpunk',
      scale: 1.0,
      yOffset: 0,
      defaultExpression: 'neutral',
      showHeadset: true,
      
      // AI Persona
      aiName: 'Aura',
      personality: 'Friendly, energetic, witty, concise.',
      tone: 'casual', // friendly, casual, energetic, professional
      language: 'en-US', // en-US, th-TH
      responseLength: 'short', // short, medium, long
      customInstructions: 'Never claim to be the real streamer. Never reveal private information.',
      allowedTopics: 'gaming, coffee, speedruns, mechanics, schedule',
      forbiddenTopics: 'politics, financial advice, medical claims',
      
      // Behavior Settings
      frequency: 70, // percent chance of replying
      delay: 2.0, // seconds delay
      autoReplies: true,
      chatReading: true
    };
    
    this.listeners = {};
    this.loadFromStorage();
  }

  setDeviceType(type) {
    this.selectedDeviceType = type;
    this.notify('deviceTypeChanged', type);
  }

  setMode(mode) {
    if (!AppStates[mode]) return;
    this.currentMode = mode;
    this.notify('modeChanged', mode);
  }

  setBackendConnection(connected) {
    this.backendConnected = connected;
    this.notify('connectionChanged', connected);
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveToStorage();
    this.notify('settingsChanged', this.settings);
  }

  saveToStorage() {
    localStorage.setItem('streamer_support_state_settings', JSON.stringify(this.settings));
  }

  loadFromStorage() {
    const raw = localStorage.getItem('streamer_support_state_settings');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.settings = { ...this.settings, ...parsed };
      } catch (e) {
        console.warn("Could not load local storage state settings: ", e);
      }
    }
  }

  resetSettings() {
    localStorage.removeItem('streamer_support_state_settings');
    this.settings = {
      archetype: 'cyberpunk',
      scale: 1.0,
      yOffset: 0,
      defaultExpression: 'neutral',
      showHeadset: true,
      aiName: 'Aura',
      personality: 'Friendly, energetic, witty, concise.',
      tone: 'casual',
      language: 'en-US',
      responseLength: 'short',
      customInstructions: 'Never claim to be the real streamer. Never reveal private information.',
      allowedTopics: 'gaming, coffee, speedruns, mechanics, schedule',
      forbiddenTopics: 'politics, financial advice, medical claims',
      frequency: 70,
      delay: 2.0,
      autoReplies: true,
      chatReading: true
    };
    this.saveToStorage();
    this.notify('settingsChanged', this.settings);
  }

  // Event listener system
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  notify(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}

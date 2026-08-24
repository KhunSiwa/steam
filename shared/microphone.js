/**
 * Streamer Support - Shared Microphone System
 */

export class MicrophoneSystem {
  constructor() {
    this.stream = null;
    this.activeDeviceId = null;
    this.microphoneEnabled = false;
    this.isMuted = false;
    
    // Web Audio Nodes
    this.audioContext = null;
    this.analyser = null;
    this.gainNode = null;
    this.dataArray = null;
    
    this.status = 'Disconnected'; // 'Disconnected', 'Connecting', 'Connected', 'Error'
    this.gain = 1.0; // multiplier (0.0 to 2.0)
    this.volumePercent = 0;
    this.errorMsg = '';
    this.animationFrameId = null;
  }

  async requestMicrophone() {
    try {
      this.status = 'Connecting';
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(track => track.stop());
      this.status = 'Disconnected';
      return true;
    } catch (err) {
      this.status = 'Error';
      this.errorMsg = err.message || 'Permission Denied';
      console.warn("Microphone request permission failed: ", err);
      return false;
    }
  }

  async getMicrophoneDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (err) {
      console.warn("Could not enumerate microphone devices: ", err);
      return [];
    }
  }

  async connectMicrophone(deviceId = null, onLevelUpdate = null) {
    await this.disconnectMicrophone();
    
    this.status = 'Connecting';
    const constraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true
    };
    
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.activeDeviceId = deviceId || this.stream.getAudioTracks()[0].getSettings().deviceId;
      this.microphoneEnabled = true;
      this.status = 'Connected';
      
      // Setup Web Audio graph
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass();
      
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.gain;
      
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      // Node Graph: Source -> Gain -> Analyser -> (Optional: destination, but mute local monitors to prevent feedback loop!)
      source.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      const calculateVolume = () => {
        if (!this.microphoneEnabled || this.isMuted || !this.analyser) {
          this.volumePercent = 0;
          if (onLevelUpdate) onLevelUpdate(0);
          return;
        }
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += this.dataArray[i];
        }
        
        const average = sum / bufferLength;
        // Normalize 0-255 average to percent (max average around 120 is full volume)
        let level = (average / 120) * 100;
        level = Math.min(Math.max(level, 0), 100);
        
        this.volumePercent = Math.round(level);
        if (onLevelUpdate) onLevelUpdate(this.volumePercent);
        
        this.animationFrameId = requestAnimationFrame(calculateVolume);
      };
      
      calculateVolume();
      return true;
    } catch (err) {
      this.status = 'Error';
      this.errorMsg = err.message || 'Connection Failed';
      console.warn("Microphone connection failed: ", err);
      this.microphoneEnabled = false;
      return false;
    }
  }

  async disconnectMicrophone() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
    this.gainNode = null;
    this.microphoneEnabled = false;
    this.activeDeviceId = null;
    this.volumePercent = 0;
    this.status = 'Disconnected';
  }

  setMicrophoneGain(value) {
    this.gain = Math.min(Math.max(value, 0.0), 2.0);
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(this.gain, this.audioContext.currentTime);
    }
  }

  muteMicrophone(isMuted) {
    this.isMuted = isMuted;
    if (this.stream) {
      this.stream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }

  getMicrophoneStatus() {
    return {
      status: this.status,
      activeDeviceId: this.activeDeviceId,
      microphoneEnabled: this.microphoneEnabled,
      gain: this.gain,
      isMuted: this.isMuted,
      volumePercent: this.volumePercent,
      errorMsg: this.errorMsg
    };
  }
}

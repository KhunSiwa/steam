/**
 * Streamer Support - Shared Camera System
 */

export class CameraSystem {
  constructor(videoElementId) {
    this.videoElementId = videoElementId;
    this.stream = null;
    this.activeDeviceId = null;
    this.cameraEnabled = false;
    
    // Properties
    this.resolution = { width: 0, height: 0 };
    this.fps = 0;
    this.status = 'Disconnected'; // 'Disconnected', 'Connecting', 'Connected', 'Error'
    this.errorMsg = '';
  }

  async requestCamera() {
    try {
      this.status = 'Connecting';
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Stop it immediately after testing permission
      tempStream.getTracks().forEach(track => track.stop());
      this.status = 'Disconnected';
      return true;
    } catch (err) {
      this.status = 'Error';
      this.errorMsg = err.message || 'Permission Denied';
      console.warn("Camera request permission failed: ", err);
      return false;
    }
  }

  async getCameraDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (err) {
      console.warn("Could not enumerate camera devices: ", err);
      return [];
    }
  }

  async connectCamera(deviceId = null) {
    await this.disconnectCamera();
    
    this.status = 'Connecting';
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true
    };
    
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.activeDeviceId = deviceId || this.stream.getVideoTracks()[0].getSettings().deviceId;
      this.cameraEnabled = true;
      
      const videoEl = document.getElementById(this.videoElementId);
      if (videoEl) {
        videoEl.srcObject = this.stream;
        videoEl.play();
      }

      // Query capabilities / track settings
      const videoTrack = this.stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      this.resolution.width = settings.width || 0;
      this.resolution.height = settings.height || 0;
      this.fps = Math.round(settings.frameRate) || 30;
      this.status = 'Connected';
      
      return true;
    } catch (err) {
      this.status = 'Error';
      this.errorMsg = err.message || 'Connection Failed';
      console.warn("Camera connection failed: ", err);
      this.cameraEnabled = false;
      return false;
    }
  }

  async disconnectCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    const videoEl = document.getElementById(this.videoElementId);
    if (videoEl) {
      videoEl.srcObject = null;
    }
    
    this.cameraEnabled = false;
    this.activeDeviceId = null;
    this.resolution = { width: 0, height: 0 };
    this.fps = 0;
    this.status = 'Disconnected';
  }

  async switchCamera(deviceId) {
    if (!deviceId) return false;
    this.activeDeviceId = deviceId;
    return await this.connectCamera(deviceId);
  }

  getCameraStatus() {
    return {
      status: this.status,
      activeDeviceId: this.activeDeviceId,
      cameraEnabled: this.cameraEnabled,
      resolution: `${this.resolution.width}x${this.resolution.height}`,
      fps: this.fps,
      errorMsg: this.errorMsg
    };
  }
}

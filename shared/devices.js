/**
 * Streamer Support - Shared Device Manager (Hardware Integration Simulator)
 */

export class DeviceManager {
  constructor(stateManager) {
    this.state = stateManager;
    
    // Hardcoded initial prototype device status
    this.devices = [
      {
        id: 'dev_desktop_mic',
        name: 'Stream Mic (Desktop)',
        type: 'Microphone',
        connected: true,
        spec: 'USB Connected',
        battery: null // USB powered
      },
      {
        id: 'dev_portable_mic',
        name: 'Mini Wireless Clip',
        type: 'Small Microphone',
        connected: true,
        spec: 'Bluetooth',
        battery: 82
      },
      {
        id: 'dev_mini_cam',
        name: 'Mini Modular Camera',
        type: 'Camera',
        connected: true,
        spec: '1080p • 60 FPS',
        battery: 94
      },
      {
        id: 'dev_phone_cam',
        name: 'Phone Built-in Camera',
        type: 'Phone Camera',
        connected: false,
        spec: '4K • Rear Lens',
        battery: 100 // Driven by phone charging status
      }
    ];
  }

  async scanDevices() {
    // If backend is connected, we could query backend details
    if (this.state.backendConnected) {
      try {
        const response = await fetch('http://localhost:8080/api/devices');
        if (response.ok) {
          this.devices = await response.json();
          this.state.notify('devicesUpdated', this.devices);
          return this.devices;
        }
      } catch (err) {
        console.warn("FastAPI backend devices query failed. Using local simulator: ", err);
      }
    }
    
    // Local simulator: randomize battery slightly on scan to show active connection
    this.devices = this.devices.map(dev => {
      if (dev.connected && dev.battery !== null) {
        dev.battery = Math.max(1, dev.battery - Math.floor(Math.random() * 2));
      }
      return dev;
    });

    this.state.notify('devicesUpdated', this.devices);
    return this.devices;
  }

  connectDevice(id) {
    const dev = this.devices.find(d => d.id === id);
    if (dev) {
      dev.connected = true;
      this.state.notify('devicesUpdated', this.devices);
      return true;
    }
    return false;
  }

  disconnectDevice(id) {
    const dev = this.devices.find(d => d.id === id);
    if (dev) {
      dev.connected = false;
      this.state.notify('devicesUpdated', this.devices);
      return true;
    }
    return false;
  }

  getDeviceStatus() {
    return this.devices;
  }
}

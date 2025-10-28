export interface CameraConstraints {
  width: number;
  height: number;
  frameRate: number;
  facingMode: 'user' | 'environment';
}

export interface CameraCapabilities {
  deviceId: string;
  label: string;
  facingMode?: string;
}

export interface CameraQualityPreset {
  name: string;
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
}

export class CameraService {
  private currentStream: MediaStream | null = null;
  private currentConstraints: CameraConstraints | null = null;
  private availableDevices: CameraCapabilities[] = [];
  private persistentDeviceId: string | null = null;

  // Event callbacks
  public onStreamChange?: (stream: MediaStream | null) => void;
  public onError?: (error: Error) => void;
  public onPermissionChange?: (granted: boolean) => void;

  // Quality presets for different use cases
  public static readonly QUALITY_PRESETS: CameraQualityPreset[] = [
    { name: 'Low', width: 640, height: 480, frameRate: 15, bitrate: 200000 },
    { name: 'Medium', width: 1280, height: 720, frameRate: 24, bitrate: 500000 },
    { name: 'High', width: 1920, height: 1080, frameRate: 30, bitrate: 1000000 },
    { name: 'Ultra', width: 3840, height: 2160, frameRate: 30, bitrate: 2000000 }
  ];

  constructor() {
    this.checkPermissions();
    this.persistentDeviceId = CameraService.getOrCreateDeviceId();
  }

  static getOrCreateDeviceId(): string {
    try {
      const key = 'mcr_device_id';
      const existing = localStorage.getItem(key);
      if (existing && existing.length > 0) return existing;
      const newId = `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      localStorage.setItem(key, newId);
      return newId;
    } catch {
      // Fallback if localStorage blocked
      return `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    }
  }

  async initialize(): Promise<void> {
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Check if we're on HTTP (which blocks camera access on mobile)
        if (location.protocol === 'http:' && CameraService.isMobileDevice()) {
          throw new Error('Camera access requires HTTPS on mobile devices. Please use https://192.168.100.19:3000 and accept the security certificate.');
        }
        throw new Error('Camera access not supported in this browser');
      }

      // Get available camera devices
      await this.updateAvailableDevices();
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  async startCamera(constraints?: Partial<CameraConstraints>): Promise<MediaStream> {
    try {
      // Stop current stream if active
      await this.stopCamera();

      // Set default constraints
      const defaultConstraints: CameraConstraints = {
        width: 1280,
        height: 720,
        frameRate: 30,
        facingMode: 'environment' // Back camera by default on mobile
      };

      this.currentConstraints = { ...defaultConstraints, ...constraints };

      // Create media constraints - iOS Safari specific handling
      const mediaConstraints: MediaStreamConstraints = {
        video: {
          width: { ideal: this.currentConstraints.width },
          height: { ideal: this.currentConstraints.height },
          frameRate: { ideal: this.currentConstraints.frameRate },
          facingMode: { ideal: this.currentConstraints.facingMode }
        },
        audio: CameraService.isIOSDevice() ? {
          // iOS Safari specific audio constraints
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
          channelCount: 1
        } : {
          // Standard audio constraints for other browsers
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2
        }
      };

      // For iOS Safari, try video-only first, then add audio
      if (CameraService.isIOSDevice()) {
        try {
          // First try with video only
          const videoConstraints: MediaStreamConstraints = {
            video: mediaConstraints.video
          };
          
          this.currentStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
          
          // Then try to add audio track
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: mediaConstraints.audio
            });
            
            // Add audio track to video stream
            const audioTrack = audioStream.getAudioTracks()[0];
            if (audioTrack) {
              this.currentStream.addTrack(audioTrack);
            }
          } catch (audioError) {
            console.warn('Audio access failed, continuing with video only:', audioError);
            // Continue with video-only stream
          }
        } catch (videoError) {
          // If video-only fails, try with both video and audio
          this.currentStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        }
      } else {
        // Standard approach for non-iOS browsers
        this.currentStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      }
      
      this.onStreamChange?.(this.currentStream);
      this.onPermissionChange?.(true);

      return this.currentStream;
    } catch (error) {
      this.onError?.(error as Error);
      this.onPermissionChange?.(false);
      throw error;
    }
  }

  async stopCamera(): Promise<void> {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => {
        track.stop();
      });
      this.currentStream = null;
      this.onStreamChange?.(null);
    }
  }

  async switchCamera(): Promise<MediaStream> {
    if (!this.currentConstraints) {
      throw new Error('No active camera to switch');
    }

    const newFacingMode = this.currentConstraints.facingMode === 'user' ? 'environment' : 'user';
    
    return this.startCamera({
      ...this.currentConstraints,
      facingMode: newFacingMode
    });
  }

  async changeQuality(preset: CameraQualityPreset): Promise<MediaStream> {
    if (!this.currentConstraints) {
      throw new Error('No active camera to change quality');
    }

    return this.startCamera({
      ...this.currentConstraints,
      width: preset.width,
      height: preset.height,
      frameRate: preset.frameRate
    });
  }

  async updateAvailableDevices(): Promise<CameraCapabilities[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableDevices = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
          facingMode: this.guessFacingMode(device.label)
        }));

      return this.availableDevices;
    } catch (error) {
      this.onError?.(error as Error);
      return [];
    }
  }

  private guessFacingMode(label: string): string | undefined {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes('front') || lowerLabel.includes('user')) {
      return 'user';
    }
    if (lowerLabel.includes('back') || lowerLabel.includes('rear') || lowerLabel.includes('environment')) {
      return 'environment';
    }
    return undefined;
  }

  private async checkPermissions(): Promise<void> {
    try {
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        this.onPermissionChange?.(permission.state === 'granted');
        
        permission.addEventListener('change', () => {
          this.onPermissionChange?.(permission.state === 'granted');
        });
      }
    } catch (error) {
      // Permissions API not supported, will check when requesting camera
      console.log('Permissions API not supported');
    }
  }

  // Utility methods
  async capturePhoto(): Promise<Blob> {
    if (!this.currentStream) {
      throw new Error('No active camera stream');
    }

    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    return new Promise((resolve, reject) => {
      video.srcObject = this.currentStream;
      video.onloadedmetadata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to capture photo'));
          }
        }, 'image/jpeg', 0.8);
      };
      video.play();
    });
  }

  getStreamSettings(): MediaTrackSettings | null {
    if (!this.currentStream) return null;

    const videoTrack = this.currentStream.getVideoTracks()[0];
    return videoTrack ? videoTrack.getSettings() : null;
  }

  getStreamConstraints(): MediaTrackConstraints | null {
    if (!this.currentStream) return null;

    const videoTrack = this.currentStream.getVideoTracks()[0];
    return videoTrack ? videoTrack.getConstraints() : null;
  }

  // Getters
  get stream(): MediaStream | null {
    return this.currentStream;
  }

  get constraints(): CameraConstraints | null {
    return this.currentConstraints;
  }

  get devices(): CameraCapabilities[] {
    return this.availableDevices;
  }

  get isActive(): boolean {
    return this.currentStream !== null && this.currentStream.active;
  }

  get hasMultipleCameras(): boolean {
    return this.availableDevices.length > 1;
  }

  // iOS Safari specific method to request audio permissions
  async requestAudioPermission(): Promise<boolean> {
    if (!CameraService.isIOSDevice()) {
      return true; // Not iOS, assume audio works
    }

    try {
      // Try to get audio-only stream to trigger permission
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
          channelCount: 1
        }
      });
      
      // Stop the test stream immediately
      audioStream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.warn('Audio permission denied:', error);
      return false;
    }
  }

  // Static utility methods
  static isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  static isIOSDevice(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  static supportsGetUserMedia(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  static getOptimalConstraints(): Partial<CameraConstraints> {
    const isMobile = CameraService.isMobileDevice();
    
    if (isMobile) {
      return {
        width: 1280,
        height: 720,
        frameRate: 30,
        facingMode: 'environment'
      };
    } else {
      return {
        width: 1920,
        height: 1080,
        frameRate: 30,
        facingMode: 'user'
      };
    }
  }

  // Getter methods
  getCurrentStream(): MediaStream | null {
    return this.currentStream;
  }

  getCurrentConstraints(): CameraConstraints | null {
    return this.currentConstraints;
  }

  getAvailableDevices(): CameraCapabilities[] {
    return this.availableDevices;
  }

  getDeviceId(): string {
    return this.persistentDeviceId || CameraService.getOrCreateDeviceId();
  }

  // Camera switching method
  async toggleCamera(): Promise<void> {
    if (!this.currentConstraints) {
      throw new Error('No current camera constraints');
    }

    const newFacingMode = this.currentConstraints.facingMode === 'user' ? 'environment' : 'user';
    
    // Check if we have a camera with the new facing mode
    const availableDevice = this.availableDevices.find(device => 
      device.facingMode === newFacingMode
    );

    if (!availableDevice) {
      throw new Error(`No ${newFacingMode} camera available`);
    }

    // Stop current stream
    await this.stopCamera();

    // Start new stream with different camera
    const newConstraints: CameraConstraints = {
      ...this.currentConstraints,
      facingMode: newFacingMode
    };

    await this.startCamera(newConstraints);
  }

  // Method to change quality preset
  async changeQualityPreset(preset: CameraQualityPreset): Promise<void> {
    if (!this.currentStream) {
      throw new Error('No active stream to change quality');
    }

    // Stop current stream
    await this.stopCamera();

    // Start new stream with new quality
    const newConstraints: CameraConstraints = {
      width: preset.width,
      height: preset.height,
      frameRate: preset.frameRate,
      facingMode: this.currentConstraints?.facingMode || 'environment'
    };

    await this.startCamera(newConstraints);
  }
}

export default CameraService;

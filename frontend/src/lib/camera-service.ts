export type LensType = 'ultra-wide' | 'wide' | 'telephoto' | 'front' | 'unknown';

export interface LensInfo {
  deviceId: string;
  label: string;
  groupId: string;
  facingMode: 'user' | 'environment' | undefined;
  zoomMin: number | null;
  zoomMax: number | null;
  zoomStep: number | null;
  lensType: LensType;
}

/** User-friendly display name in Spanish, grouped by lens type. */
export function getLensDisplayName(lens: LensInfo): string {
  if (lens.facingMode === 'user') return 'Frontal';
  switch (lens.lensType) {
    case 'ultra-wide': return 'Gran angular';
    case 'wide': return 'Principal';
    case 'telephoto': return 'Telescópica';
    default: return lens.label || 'Cámara';
  }
}

/** Filter lenses to show only meaningful options. Deduplicates by lensType. */
export function getFilteredLenses(lenses: LensInfo[]): LensInfo[] {
  if (lenses.length === 0) return [];
  // Group by lensType, pick first of each
  const seen = new Set<string>();
  const result: LensInfo[] = [];
  for (const lens of lenses) {
    let key = lens.lensType;
    if (key === 'unknown') continue; // skip unrecognized lenses
    if (lens.facingMode === 'user') key = 'front'; // group all front as one
    if (seen.has(key)) continue;
    seen.add(key);
    // Map to user-friendly labels
    const display = getLensDisplayName(lens);
    result.push({ ...lens, label: display });
  }
  return result.length > 0 ? result : lenses;
}

/** Info about active camera state, used in stream-started signaling payload. */
export interface CameraInfo {
  lenses: LensInfo[];
  activeLens: string | null;
  zoom: number | null;
}

/** Heuristic: map a camera label + facingMode to a lens type. */
export function determineLensType(label: string, facingMode: string | undefined): LensType {
  const lower = label.toLowerCase();
  if (/front|user/.test(lower)) return 'front';
  if (/ultra|0\.5x|0\.6x/.test(lower)) return 'ultra-wide';
  if (/tele|2x|3x|\bzoom\b/.test(lower)) return 'telephoto';
  if (facingMode === 'user') return 'front';
  return 'wide';
}

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
  private _permissionGranted = false;
  private _lenses: LensInfo[] = [];

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
      (window as any).debugLogger?.addLog('info', '📷 Camera Service: Starting initialization...');
      (window as any).debugLogger?.addLog('info', '📱 Mobile device detected', CameraService.isMobileDevice());
      (window as any).debugLogger?.addLog('info', '🍎 iOS device detected', CameraService.isIOSDevice());
      (window as any).debugLogger?.addLog('info', '🔒 Protocol', location.protocol);
      (window as any).debugLogger?.addLog('info', '🌐 Host', location.host);
      
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        (window as any).debugLogger?.addLog('error', '❌ getUserMedia not supported');
        // Check if we're on HTTP (which blocks camera access on mobile)
        if (location.protocol === 'http:' && CameraService.isMobileDevice()) {
          throw new Error('Camera access requires HTTPS on mobile devices. Please use https://192.168.0.138:3000 and accept the security certificate.');
        }
        throw new Error('Camera access not supported in this browser');
      }
      
      (window as any).debugLogger?.addLog('success', '✅ getUserMedia is supported');

      // Get available camera devices
      (window as any).debugLogger?.addLog('info', '📷 Enumerating camera devices...');
      await this.updateAvailableDevices();
      (window as any).debugLogger?.addLog('success', '✅ Camera Service initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      (window as any).debugLogger?.addLog('error', '❌ Camera Service initialization failed', errorMessage);
      this.onError?.(error as Error);
      throw error;
    }
  }

  /** Enumerate all available camera lenses, triggering permission if needed (iOS two-phase init). */
  async enumerateLenses(): Promise<LensInfo[]> {
    if (!this._permissionGranted) {
      try {
        const permStream = await navigator.mediaDevices.getUserMedia({ video: true });
        permStream.getTracks().forEach(t => t.stop());
      } catch (err) {
        this.onError?.(err as Error);
        this.onPermissionChange?.(false);
        throw err;
      }
      this._permissionGranted = true;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');

    // Fallback: if all labels are empty (iOS privacy), use availableDevices from init
    const hasLabels = videoInputs.some(d => d.label && d.label.length > 0);
    const source: { deviceId: string; label: string; groupId?: string }[] = hasLabels
      ? videoInputs
      : this.availableDevices.length > 0 ? this.availableDevices : videoInputs;

    this._lenses = source.map(d => {
      const label = d.label || `Camera ${d.deviceId.slice(0, 8)}`;
      const facingMode = this.guessFacingMode(label) as 'user' | 'environment' | undefined;
      return {
        deviceId: d.deviceId,
        label,
        groupId: 'groupId' in d ? (d as any).groupId : d.deviceId,
        facingMode,
        zoomMin: null,
        zoomMax: null,
        zoomStep: null,
        lensType: determineLensType(label, facingMode),
      };
    });

    // Populate zoom from active stream if available
    const videoTrack = this.currentStream?.getVideoTracks()?.[0];
    if (videoTrack) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const caps: any = videoTrack.getCapabilities?.();
        const zoomCaps = caps?.zoom as { min: number; max: number; step: number } | undefined;
        if (zoomCaps) {
          const settings = videoTrack.getSettings();
          const activeLens = this._lenses.find(l => settings?.deviceId === l.deviceId);
          if (activeLens) {
            activeLens.zoomMin = zoomCaps.min;
            activeLens.zoomMax = zoomCaps.max;
            activeLens.zoomStep = zoomCaps.step;
          }
        }
      } catch {
        // getCapabilities not supported — leave zoom as null
      }
    }

    return this._lenses;
  }

  /** Return last-enumerated lenses. */
  get lenses(): LensInfo[] {
    return this._lenses;
  }

  private _pendingSwitch: Promise<MediaStream> | null = null;

  /**
   * Switch to a specific lens by deviceId.
   * Same groupId + zoom support → applyConstraints (no restart).
   * Different groupId or no zoom → full stream restart.
   */
  async switchToLens(deviceId: string): Promise<MediaStream> {
    const target = this._lenses.find(l => l.deviceId === deviceId);
    if (!target) throw new Error('Lens not found');

    const currentTrack = this.currentStream?.getVideoTracks()?.[0];
    const currentSettings = currentTrack?.getSettings();
    const currentLens = currentSettings?.deviceId
      ? this._lenses.find(l => l.deviceId === currentSettings.deviceId)
      : null;

    // Same group + zoom available → apply zoom constraint, no restart
    if (currentLens && currentTrack && target.groupId === currentLens.groupId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caps: any = currentTrack.getCapabilities?.();
      const zoomCaps = caps?.zoom as { min: number; max: number; step: number } | undefined;
      if (zoomCaps) {
        const zoomMap: Record<string, number | undefined> = {
          'ultra-wide': 0.5,
          'wide': 1.0,
          'telephoto': 2.0,
        };
        const zoomValue = zoomMap[target.lensType];
        if (zoomValue !== undefined && zoomValue >= zoomCaps.min && zoomValue <= zoomCaps.max) {
          await (currentTrack.applyConstraints as any)({ advanced: [{ zoom: zoomValue }] });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newCaps: any = currentTrack.getCapabilities?.();
          const newZoom = newCaps?.zoom as { min: number; max: number; step: number } | undefined;
          if (newZoom) {
            const activeLens = this._lenses.find(l => l.deviceId === currentSettings!.deviceId);
            if (activeLens) {
              activeLens.zoomMin = newZoom.min;
              activeLens.zoomMax = newZoom.max;
              activeLens.zoomStep = newZoom.step;
            }
          }
          return this.currentStream!;
        }
      }
    }

    // Abort pending switch if rapid switching
    const pending = this._pendingSwitch;
    let cancelled = false;
    const abort = () => { cancelled = true; };

    this._pendingSwitch = (async (): Promise<MediaStream> => {
      if (pending) {
        // Abort previous pending: discard its stream
        try {
          const prevStream = await pending;
          prevStream?.getTracks().forEach(t => t.stop());
        } catch { /* previous failed, ignore */ }
      }
      if (cancelled) throw new Error('Switch cancelled');

      // Save old stream — stop only AFTER new getUserMedia succeeds
      const oldStream = this.currentStream;
      this.currentStream = null;
      if (cancelled) {
        // Restore old stream if cancellation happened before getUserMedia
        if (oldStream) {
          this.currentStream = oldStream;
          this.onStreamChange?.(this.currentStream);
        }
        throw new Error('Switch cancelled');
      }

      // Merge deviceId with current quality constraints
      const videoConstraints: MediaTrackConstraints = {
        deviceId: { exact: deviceId },
      };
      if (this.currentConstraints) {
        videoConstraints.width = { ideal: this.currentConstraints.width };
        videoConstraints.height = { ideal: this.currentConstraints.height };
        videoConstraints.frameRate = { ideal: this.currentConstraints.frameRate };
      }
      if (target.facingMode) {
        videoConstraints.facingMode = { ideal: target.facingMode };
      }

      let newStream: MediaStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
      } catch (err) {
        // getUserMedia failed — restore old stream
        if (oldStream) {
          this.currentStream = oldStream;
          this.onStreamChange?.(this.currentStream);
        }
        throw err;
      }

      // Old stream successfully replaced — stop it now
      oldStream?.getTracks().forEach(t => t.stop());

      if (cancelled) {
        newStream.getTracks().forEach(t => t.stop());
        // Restore old stream
        if (oldStream) {
          this.currentStream = oldStream;
          this.onStreamChange?.(this.currentStream);
        }
        throw new Error('Switch cancelled');
      }

      this.currentStream = newStream;
      this.onStreamChange?.(this.currentStream);
      return this.currentStream;
    })();

    return this._pendingSwitch;
  }

  /**
   * Set zoom level on the active video track.
   * No-op if zoom is unsupported or no active stream.
   */
  async setZoom(level: number): Promise<void> {
    const track = this.currentStream?.getVideoTracks()?.[0];
    if (!track) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caps: any = track.getCapabilities?.();
    const zoomCaps = caps?.zoom as { min: number; max: number; step: number } | undefined;
    if (!zoomCaps) return;

    try {
      await (track.applyConstraints as any)({ advanced: [{ zoom: level }] });
    } catch {
      // zoom out of range or not supported — gracefully ignored
    }
  }

  async startCamera(constraints?: Partial<CameraConstraints>): Promise<MediaStream> {
    try {
      (window as any).debugLogger?.addLog('info', '📷 Starting camera...');
      
      // Stop current stream if active
      if (this.currentStream) {
        (window as any).debugLogger?.addLog('info', '📷 Stopping current stream...');
        await this.stopCamera();
      }

      // Set default constraints
      const defaultConstraints: CameraConstraints = {
        width: 1280,
        height: 720,
        frameRate: 30,
        facingMode: 'environment' // Back camera by default on mobile
      };

      this.currentConstraints = { ...defaultConstraints, ...constraints };

      // Create media constraints - iOS Safari specific handling
      // NOTE: Try exact resolution first (1080p for High preset), fall back to ideal.
      // iOS WebKit often caps at 1280x720 for WebRTC even when camera supports 1080p.
      // Using { exact } forces the browser to either deliver that resolution or reject.
      const targetWidth = this.currentConstraints.width;
      const targetHeight = this.currentConstraints.height;
      const useExact = CameraService.isIOSDevice() && targetWidth >= 1920;
      const mediaConstraints: MediaStreamConstraints = {
        video: {
          width: useExact ? { exact: targetWidth } : { ideal: targetWidth },
          height: useExact ? { exact: targetHeight } : { ideal: targetHeight },
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
          // If exact resolution failed, fall back to ideal
          if (useExact) {
            console.warn('Exact 1080p not supported on this iOS device, falling back to ideal');
            const fallbackConstraints: MediaStreamConstraints = {
              video: {
                width: { ideal: targetWidth },
                height: { ideal: targetHeight },
                frameRate: { ideal: this.currentConstraints.frameRate },
                facingMode: { ideal: this.currentConstraints.facingMode }
              },
              audio: mediaConstraints.audio
            };
            this.currentStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          } else {
            // If video-only fails, try with both video and audio
            this.currentStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
          }
        }
      } else {
        // Standard approach for non-iOS browsers
        this.currentStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      }
      
      this._permissionGranted = true;  // getUserMedia succeeded, skip permission phase in enumerateLenses
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

  /** Build CameraInfo payload for signaling (stream-started event). */
  getCameraInfo(): CameraInfo {
    const track = this.currentStream?.getVideoTracks()?.[0];
    const activeLens = track?.getSettings()?.deviceId ?? null;
    return {
      lenses: this._lenses,
      activeLens,
      zoom: null, // ponytail: querying actual zoom requires state tracking — add if needed
    };
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

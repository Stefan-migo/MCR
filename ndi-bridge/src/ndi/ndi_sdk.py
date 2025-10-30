"""
NDI SDK ctypes wrapper for direct DLL access
Provides Python bindings for the NDI SDK using ctypes
"""

import ctypes
import ctypes.wintypes
import os
import logging
from typing import Optional, Tuple
import numpy as np

logger = logging.getLogger(__name__)

# NDI SDK DLL path
NDI_SDK_DLL_PATH = r"C:\Program Files\NDI\NDI 6 Runtime\v6\Processing.NDI.Lib.x64.dll"

# NDI SDK constants
NDIlib_FourCC_type_UYVY = ctypes.c_uint32(0x59555955)  # UYVY
NDIlib_FourCC_type_BGRA = ctypes.c_uint32(0x41524742)  # BGRA
NDIlib_FourCC_type_BGRX = ctypes.c_uint32(0x58524742)  # BGRX
NDIlib_FourCC_type_RGBA = ctypes.c_uint32(0x41424752)  # RGBA
NDIlib_FourCC_type_RGBX = ctypes.c_uint32(0x58424752)  # RGBX

# NDI SDK structures
class NDIlib_send_create_t(ctypes.Structure):
    """NDI sender creation settings"""
    _fields_ = [
        ("p_ndi_name", ctypes.c_char_p),
        ("p_groups", ctypes.c_char_p),
        ("clock_video", ctypes.c_bool),
        ("clock_audio", ctypes.c_bool),
    ]

class NDIlib_video_frame_v2_t(ctypes.Structure):
    """NDI video frame structure"""
    _fields_ = [
        ("xres", ctypes.c_int),
        ("yres", ctypes.c_int),
        ("FourCC", ctypes.c_uint32),
        ("frame_rate_N", ctypes.c_int),
        ("frame_rate_D", ctypes.c_int),
        ("picture_aspect_ratio", ctypes.c_float),
        ("frame_format_type", ctypes.c_int),
        ("timecode", ctypes.c_int64),
        ("p_data", ctypes.POINTER(ctypes.c_uint8)),
        ("line_stride_in_bytes", ctypes.c_int),
        ("p_metadata", ctypes.c_char_p),
        ("timestamp", ctypes.c_int64),
    ]

class NDIlib_audio_frame_v2_t(ctypes.Structure):
    """NDI audio frame structure"""
    _fields_ = [
        ("sample_rate", ctypes.c_int),
        ("no_channels", ctypes.c_int),
        ("no_samples", ctypes.c_int),
        ("timecode", ctypes.c_int64),
        ("p_data", ctypes.POINTER(ctypes.c_float)),
        ("channel_stride_in_bytes", ctypes.c_int),
        ("p_metadata", ctypes.c_char_p),
        ("timestamp", ctypes.c_int64),
    ]

class NDIlib_metadata_frame_t(ctypes.Structure):
    """NDI metadata frame structure"""
    _fields_ = [
        ("length", ctypes.c_int),
        ("timecode", ctypes.c_int64),
        ("p_data", ctypes.c_char_p),
    ]

class NDIlib_tally_t(ctypes.Structure):
    """NDI tally structure"""
    _fields_ = [
        ("on_program", ctypes.c_bool),
        ("on_preview", ctypes.c_bool),
    ]

class NDISDK:
    """NDI SDK wrapper using ctypes"""
    
    def __init__(self):
        self.lib = None
        self.initialized = False
        
    def load_library(self) -> bool:
        """Load the NDI SDK DLL"""
        try:
            if not os.path.exists(NDI_SDK_DLL_PATH):
                logger.error(f"NDI SDK DLL not found at: {NDI_SDK_DLL_PATH}")
                return False
                
            self.lib = ctypes.CDLL(NDI_SDK_DLL_PATH)
            logger.info(f"Successfully loaded NDI SDK from: {NDI_SDK_DLL_PATH}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load NDI SDK DLL: {e}")
            return False
    
    def setup_function_signatures(self) -> bool:
        """Setup function signatures for NDI SDK functions"""
        try:
            if not self.lib:
                return False
                
            # NDIlib_initialize
            self.lib.NDIlib_initialize.argtypes = []
            self.lib.NDIlib_initialize.restype = ctypes.c_bool
            
            # NDIlib_destroy
            self.lib.NDIlib_destroy.argtypes = []
            self.lib.NDIlib_destroy.restype = None
            
            # NDIlib_send_create
            self.lib.NDIlib_send_create.argtypes = [ctypes.POINTER(NDIlib_send_create_t)]
            self.lib.NDIlib_send_create.restype = ctypes.c_void_p
            
            # NDIlib_send_destroy
            self.lib.NDIlib_send_destroy.argtypes = [ctypes.c_void_p]
            self.lib.NDIlib_send_destroy.restype = None
            
            # NDIlib_send_send_video_v2
            self.lib.NDIlib_send_send_video_v2.argtypes = [
                ctypes.c_void_p,  # NDIlib_send_instance_t
                ctypes.POINTER(NDIlib_video_frame_v2_t)
            ]
            self.lib.NDIlib_send_send_video_v2.restype = None
            
            # NDIlib_send_send_audio_v2
            self.lib.NDIlib_send_send_audio_v2.argtypes = [
                ctypes.c_void_p,  # NDIlib_send_instance_t
                ctypes.POINTER(NDIlib_audio_frame_v2_t)
            ]
            self.lib.NDIlib_send_send_audio_v2.restype = None
            
            # NDIlib_send_send_metadata
            self.lib.NDIlib_send_send_metadata.argtypes = [
                ctypes.c_void_p,  # NDIlib_send_instance_t
                ctypes.POINTER(NDIlib_metadata_frame_t)
            ]
            self.lib.NDIlib_send_send_metadata.restype = None
            
            # NDIlib_send_get_tally
            self.lib.NDIlib_send_get_tally.argtypes = [
                ctypes.c_void_p,  # NDIlib_send_instance_t
                ctypes.POINTER(NDIlib_tally_t),
                ctypes.c_uint32   # timeout_in_ms
            ]
            self.lib.NDIlib_send_get_tally.restype = ctypes.c_bool
            
            logger.info("NDI SDK function signatures configured successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to setup NDI SDK function signatures: {e}")
            return False
    
    def initialize(self) -> bool:
        """Initialize the NDI SDK"""
        try:
            if not self.lib:
                logger.error("NDI SDK library not loaded")
                return False
                
            if self.initialized:
                logger.warning("NDI SDK already initialized")
                return True
                
            if self.lib.NDIlib_initialize():
                self.initialized = True
                logger.info("NDI SDK initialized successfully")
                return True
            else:
                logger.error("Failed to initialize NDI SDK")
                return False
                
        except Exception as e:
            logger.error(f"Error initializing NDI SDK: {e}")
            return False
    
    def destroy(self) -> None:
        """Destroy the NDI SDK"""
        try:
            if self.lib and self.initialized:
                self.lib.NDIlib_destroy()
                self.initialized = False
                logger.info("NDI SDK destroyed")
        except Exception as e:
            logger.error(f"Error destroying NDI SDK: {e}")
    
    def create_sender(self, source_name: str, groups: str = None, clock_video: bool = True, clock_audio: bool = False) -> Optional[ctypes.c_void_p]:
        """Create an NDI sender instance"""
        try:
            if not self.lib or not self.initialized:
                logger.error("NDI SDK not initialized")
                return None
                
            # Create sender settings
            settings = NDIlib_send_create_t()
            settings.p_ndi_name = source_name.encode('utf-8')
            settings.p_groups = groups.encode('utf-8') if groups else None
            settings.clock_video = clock_video
            settings.clock_audio = clock_audio
            
            # Create sender
            sender = self.lib.NDIlib_send_create(ctypes.byref(settings))
            if sender:
                logger.info(f"Created NDI sender: {source_name}")
                return sender
            else:
                logger.error(f"Failed to create NDI sender: {source_name}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating NDI sender: {e}")
            return None
    
    def destroy_sender(self, sender: ctypes.c_void_p) -> None:
        """Destroy an NDI sender instance"""
        try:
            if self.lib and sender:
                self.lib.NDIlib_send_destroy(sender)
                logger.info("NDI sender destroyed")
        except Exception as e:
            logger.error(f"Error destroying NDI sender: {e}")
    
    def send_video_frame(self, sender: ctypes.c_void_p, frame: np.ndarray, 
                        fourcc: int = NDIlib_FourCC_type_BGRA, 
                        fps: Tuple[int, int] = (30, 1)) -> bool:
        """Send a video frame to NDI"""
        try:
            if not self.lib or not sender:
                logger.error("NDI SDK or sender not available")
                return False
                
            height, width = frame.shape[:2]
            
            # Create video frame structure
            video_frame = NDIlib_video_frame_v2_t()
            video_frame.xres = width
            video_frame.yres = height
            video_frame.FourCC = fourcc
            video_frame.frame_rate_N = fps[0]
            video_frame.frame_rate_D = fps[1]
            video_frame.picture_aspect_ratio = width / height
            video_frame.frame_format_type = 0  # Progressive
            video_frame.timecode = 0
            video_frame.p_metadata = None
            video_frame.timestamp = 0
            
            # Calculate line stride
            if fourcc == NDIlib_FourCC_type_BGRA or fourcc == NDIlib_FourCC_type_BGRX:
                video_frame.line_stride_in_bytes = width * 4
            elif fourcc == NDIlib_FourCC_type_UYVY:
                video_frame.line_stride_in_bytes = width * 2
            else:
                video_frame.line_stride_in_bytes = width * 4
            
            # Ensure frame is contiguous and has correct data type
            if not frame.flags['C_CONTIGUOUS']:
                frame = np.ascontiguousarray(frame)
            
            # Convert to appropriate format
            if fourcc == NDIlib_FourCC_type_BGRA and frame.shape[2] == 3:
                # Convert BGR to BGRA
                bgra_frame = np.zeros((height, width, 4), dtype=np.uint8)
                bgra_frame[:, :, :3] = frame
                bgra_frame[:, :, 3] = 255  # Alpha channel
                frame = bgra_frame
            elif fourcc == NDIlib_FourCC_type_UYVY:
                # Convert BGR to UYVY (simplified - would need proper color space conversion)
                # For now, just use BGRA format
                fourcc = NDIlib_FourCC_type_BGRA
                bgra_frame = np.zeros((height, width, 4), dtype=np.uint8)
                bgra_frame[:, :, :3] = frame
                bgra_frame[:, :, 3] = 255
                frame = bgra_frame
                video_frame.FourCC = fourcc
                video_frame.line_stride_in_bytes = width * 4
            
            # Set frame data pointer
            video_frame.p_data = frame.ctypes.data_as(ctypes.POINTER(ctypes.c_uint8))
            
            # Send frame
            self.lib.NDIlib_send_send_video_v2(sender, ctypes.byref(video_frame))
            return True
            
        except Exception as e:
            logger.error(f"Error sending video frame: {e}")
            return False
    
    def get_tally(self, sender: ctypes.c_void_p, timeout_ms: int = 0) -> Optional[NDIlib_tally_t]:
        """Get tally information for a sender"""
        try:
            if not self.lib or not sender:
                return None
                
            tally = NDIlib_tally_t()
            if self.lib.NDIlib_send_get_tally(sender, ctypes.byref(tally), timeout_ms):
                return tally
            return None
            
        except Exception as e:
            logger.error(f"Error getting tally: {e}")
            return None

# Global NDI SDK instance
_ndi_sdk = None

def get_ndi_sdk() -> Optional[NDISDK]:
    """Get the global NDI SDK instance"""
    global _ndi_sdk
    if _ndi_sdk is None:
        _ndi_sdk = NDISDK()
        if not _ndi_sdk.load_library():
            return None
        if not _ndi_sdk.setup_function_signatures():
            return None
    return _ndi_sdk

def initialize_ndi_sdk() -> bool:
    """Initialize the global NDI SDK instance"""
    sdk = get_ndi_sdk()
    if sdk:
        return sdk.initialize()
    return False

def destroy_ndi_sdk() -> None:
    """Destroy the global NDI SDK instance"""
    global _ndi_sdk
    if _ndi_sdk:
        _ndi_sdk.destroy()
        _ndi_sdk = None

"""
NDI Manager with intelligent fallback
Tries ndi-python first, falls back to FFmpeg if unavailable
"""

import logging
import asyncio
from typing import Optional
from enum import Enum

logger = logging.getLogger(__name__)

class NDIMethod(Enum):
    NDI_PYTHON = "ndi-python"
    NDI_CTYPES = "ndi-ctypes"
    FFMPEG = "ffmpeg"
    NONE = "none"

class NDIManager:
    """
    Manages NDI output with automatic method selection
    """
    
    def __init__(self, source_name: str, width: int = 1280, height: int = 720, fps: int = 30):
        self.source_name = source_name
        self.width = width
        self.height = height
        self.fps = fps
        
        self.method: NDIMethod = NDIMethod.NONE
        self.sender = None
        
    async def initialize(self) -> bool:
        """
        Initialize NDI sender using best available method
        """
        # Try ndi-python first (best performance)
        if await self._try_ndi_python():
            self.method = NDIMethod.NDI_PYTHON
            logger.info(f"✅ Using ndi-python for {self.source_name}")
            return True
        
        # Try ctypes NDI SDK (recommended fallback)
        if await self._try_ndi_ctypes():
            self.method = NDIMethod.NDI_CTYPES
            logger.info(f"✅ Using ndi-ctypes for {self.source_name}")
            return True
        
        # Fall back to FFmpeg (last resort)
        if await self._try_ffmpeg():
            self.method = NDIMethod.FFMPEG
            logger.info(f"⚠️ Using FFmpeg fallback for {self.source_name}")
            return True
        
        logger.error(f"❌ No NDI method available for {self.source_name}")
        return False
    
    async def _try_ndi_python(self) -> bool:
        """Try to initialize ndi-python"""
        try:
            from ndi.sender import NDISender
            
            self.sender = NDISender(
                source_name=self.source_name,
                width=self.width,
                height=self.height,
                fps=self.fps
            )
            
            if await self.sender.initialize():
                logger.info("ndi-python initialized successfully")
                return True
            else:
                logger.warning("ndi-python initialization failed")
                return False
                
        except ImportError as e:
            logger.warning(f"ndi-python not available: {e}")
            return False
        except Exception as e:
            logger.error(f"ndi-python error: {e}")
            return False
    
    async def _try_ndi_ctypes(self) -> bool:
        """Try to initialize ndi-ctypes"""
        try:
            from ndi.ndi_ctypes_sender import NDICtypesSender
            
            self.sender = NDICtypesSender(
                source_name=self.source_name,
                width=self.width,
                height=self.height,
                fps=self.fps
            )
            
            if await self.sender.initialize():
                logger.info("ndi-ctypes initialized successfully")
                return True
            else:
                logger.warning("ndi-ctypes initialization failed")
                return False
                
        except ImportError as e:
            logger.warning(f"ndi-ctypes not available: {e}")
            return False
        except Exception as e:
            logger.error(f"ndi-ctypes error: {e}")
            return False
    
    async def _try_ffmpeg(self) -> bool:
        """Try to initialize FFmpeg NDI output"""
        try:
            from ndi.ffmpeg_sender import FFmpegNDISender
            
            self.sender = FFmpegNDISender(
                source_name=self.source_name,
                width=self.width,
                height=self.height,
                fps=self.fps
            )
            
            if await self.sender.initialize():
                logger.info("FFmpeg NDI initialized successfully")
                return True
            else:
                logger.warning("FFmpeg initialization failed")
                return False
                
        except Exception as e:
            logger.error(f"FFmpeg error: {e}")
            return False
    
    async def send_frame(self, frame) -> bool:
        """Send frame using active method"""
        if not self.sender:
            logger.error("No NDI sender available")
            return False
        
        try:
            return await self.sender.send_frame(frame)
        except Exception as e:
            logger.error(f"Error sending frame via {self.method.value}: {e}")
            return False
    
    def get_stats(self) -> dict:
        """Get sender statistics"""
        if self.sender:
            stats = self.sender.get_stats()
            stats['method'] = self.method.value
            return stats
        return {'method': 'none', 'error': 'No sender available'}
    
    async def stop(self):
        """Stop NDI sender"""
        if self.sender:
            if hasattr(self.sender, 'stop'):
                await self.sender.stop()
            elif hasattr(self.sender, 'close'):
                self.sender.close()
    
    async def close(self):
        """Close NDI sender"""
        if self.sender:
            if hasattr(self.sender, 'close'):
                await self.sender.close()
            elif hasattr(self.sender, 'destroy'):
                self.sender.destroy()
            self.sender = None

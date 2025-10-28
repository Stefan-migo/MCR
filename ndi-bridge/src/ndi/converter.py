"""
NDI Converter - Color space and format conversion utilities
"""

import numpy as np
import cv2
import logging
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

class NDIConverter:
    """
    Handles video format conversion for NDI output
    """
    
    @staticmethod
    def convert_to_bgra(frame: np.ndarray, target_width: Optional[int] = None, target_height: Optional[int] = None) -> np.ndarray:
        """
        Convert frame to BGRA format for NDI
        
        Args:
            frame: Input frame (BGR, RGB, or BGRA)
            target_width: Target width (optional, for resizing)
            target_height: Target height (optional, for resizing)
            
        Returns:
            np.ndarray: BGRA frame
        """
        try:
            # Handle different input formats
            if len(frame.shape) == 2:  # Grayscale
                bgra_frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGRA)
            elif frame.shape[2] == 3:  # BGR or RGB
                # Assume BGR (OpenCV default)
                bgra_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2BGRA)
            elif frame.shape[2] == 4:  # Already BGRA
                bgra_frame = frame.copy()
            else:
                logger.error(f"Unsupported frame format: {frame.shape}")
                return None
            
            # Resize if target dimensions specified
            if target_width and target_height:
                if bgra_frame.shape[:2] != (target_height, target_width):
                    bgra_frame = cv2.resize(bgra_frame, (target_width, target_height), interpolation=cv2.INTER_LINEAR)
            
            return bgra_frame
            
        except Exception as e:
            logger.error(f"Error converting frame to BGRA: {e}")
            return None
    
    @staticmethod
    def convert_yuv_to_bgra(yuv_frame: np.ndarray, target_width: Optional[int] = None, target_height: Optional[int] = None) -> np.ndarray:
        """
        Convert YUV frame to BGRA format
        
        Args:
            yuv_frame: YUV frame
            target_width: Target width (optional)
            target_height: Target height (optional)
            
        Returns:
            np.ndarray: BGRA frame
        """
        try:
            # Convert YUV to BGR first
            if len(yuv_frame.shape) == 3 and yuv_frame.shape[2] == 3:
                bgr_frame = cv2.cvtColor(yuv_frame, cv2.COLOR_YUV2BGR)
            else:
                logger.error(f"Invalid YUV frame format: {yuv_frame.shape}")
                return None
            
            # Convert BGR to BGRA
            return NDIConverter.convert_to_bgra(bgr_frame, target_width, target_height)
            
        except Exception as e:
            logger.error(f"Error converting YUV to BGRA: {e}")
            return None
    
    @staticmethod
    def optimize_for_ndi(frame: np.ndarray, target_width: int, target_height: int, quality: str = "high") -> np.ndarray:
        """
        Optimize frame for NDI transmission
        
        Args:
            frame: Input frame
            target_width: Target width
            target_height: Target height
            quality: Quality setting ("low", "medium", "high")
            
        Returns:
            np.ndarray: Optimized BGRA frame
        """
        try:
            # Convert to BGRA
            bgra_frame = NDIConverter.convert_to_bgra(frame, target_width, target_height)
            if bgra_frame is None:
                return None
            
            # Apply quality optimizations
            if quality == "low":
                # Reduce quality for lower bandwidth
                bgra_frame = cv2.GaussianBlur(bgra_frame, (3, 3), 0)
            elif quality == "high":
                # Apply sharpening for better quality
                kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
                bgra_frame = cv2.filter2D(bgra_frame, -1, kernel)
                bgra_frame = np.clip(bgra_frame, 0, 255).astype(np.uint8)
            
            return bgra_frame
            
        except Exception as e:
            logger.error(f"Error optimizing frame for NDI: {e}")
            return None
    
    @staticmethod
    def create_test_pattern(width: int, height: int, pattern_type: str = "color_bars") -> np.ndarray:
        """
        Create test pattern for NDI testing
        
        Args:
            width: Pattern width
            height: Pattern height
            pattern_type: Type of pattern ("color_bars", "checkerboard", "gradient")
            
        Returns:
            np.ndarray: Test pattern as BGRA frame
        """
        try:
            if pattern_type == "color_bars":
                # Create color bars pattern
                frame = np.zeros((height, width, 3), dtype=np.uint8)
                bar_width = width // 8
                
                colors = [
                    (255, 255, 255),  # White
                    (255, 255, 0),    # Yellow
                    (0, 255, 255),    # Cyan
                    (0, 255, 0),      # Green
                    (255, 0, 255),    # Magenta
                    (255, 0, 0),      # Red
                    (0, 0, 255),      # Blue
                    (0, 0, 0)         # Black
                ]
                
                for i, color in enumerate(colors):
                    start_x = i * bar_width
                    end_x = min((i + 1) * bar_width, width)
                    frame[:, start_x:end_x] = color
                
            elif pattern_type == "checkerboard":
                # Create checkerboard pattern
                frame = np.zeros((height, width, 3), dtype=np.uint8)
                square_size = 32
                
                for y in range(0, height, square_size):
                    for x in range(0, width, square_size):
                        if (x // square_size + y // square_size) % 2 == 0:
                            frame[y:y+square_size, x:x+square_size] = (255, 255, 255)
                        else:
                            frame[y:y+square_size, x:x+square_size] = (0, 0, 0)
                
            elif pattern_type == "gradient":
                # Create gradient pattern
                frame = np.zeros((height, width, 3), dtype=np.uint8)
                
                # Horizontal gradient
                for x in range(width):
                    intensity = int(255 * x / width)
                    frame[:, x] = (intensity, intensity, intensity)
                
            else:
                logger.error(f"Unknown pattern type: {pattern_type}")
                return None
            
            # Convert to BGRA
            return NDIConverter.convert_to_bgra(frame)
            
        except Exception as e:
            logger.error(f"Error creating test pattern: {e}")
            return None
    
    @staticmethod
    def validate_frame(frame: np.ndarray, expected_width: int, expected_height: int) -> bool:
        """
        Validate frame format and dimensions
        
        Args:
            frame: Frame to validate
            expected_width: Expected width
            expected_height: Expected height
            
        Returns:
            bool: True if frame is valid
        """
        try:
            if frame is None:
                return False
            
            if len(frame.shape) != 3:
                logger.error(f"Invalid frame dimensions: {frame.shape}")
                return False
            
            if frame.shape[2] not in [3, 4]:
                logger.error(f"Invalid frame channels: {frame.shape[2]}")
                return False
            
            if frame.shape[:2] != (expected_height, expected_width):
                logger.warning(f"Frame size mismatch: expected {(expected_height, expected_width)}, got {frame.shape[:2]}")
                return False
            
            if frame.dtype != np.uint8:
                logger.error(f"Invalid frame data type: {frame.dtype}")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error validating frame: {e}")
            return False

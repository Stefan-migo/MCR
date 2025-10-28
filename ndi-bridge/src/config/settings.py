"""
Configuration Settings - Pydantic settings for NDI Bridge
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    """
    NDI Bridge configuration settings
    """
    
    # Backend Configuration
    backend_url: str = Field(
        default="http://localhost:3001",
        description="Backend HTTP URL"
    )
    backend_ws_url: str = Field(
        default="ws://localhost:3001",
        description="Backend WebSocket URL"
    )
    
    # NDI Configuration
    ndi_source_prefix: str = Field(
        default="MobileCam",
        description="Prefix for NDI source names"
    )
    ndi_bridge_port: int = Field(
        default=8000,
        description="NDI Bridge API port"
    )
    ndi_bridge_host: str = Field(
        default="0.0.0.0",
        description="NDI Bridge API host"
    )
    
    # Stream Configuration
    max_streams: int = Field(
        default=10,
        description="Maximum number of simultaneous streams"
    )
    frame_buffer_size: int = Field(
        default=10,
        description="Frame buffer size for each stream"
    )
    auto_consume: bool = Field(
        default=True,
        description="Automatically consume new streams"
    )
    
    # Video Configuration
    default_width: int = Field(
        default=1280,
        description="Default video width"
    )
    default_height: int = Field(
        default=720,
        description="Default video height"
    )
    default_fps: int = Field(
        default=30,
        description="Default video FPS"
    )
    
    # Performance Configuration
    processing_quality: str = Field(
        default="high",
        description="Processing quality (low, medium, high)"
    )
    enable_hardware_acceleration: bool = Field(
        default=True,
        description="Enable hardware acceleration when available"
    )
    
    # Logging Configuration
    log_level: str = Field(
        default="INFO",
        description="Logging level"
    )
    log_format: str = Field(
        default="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        description="Log format string"
    )
    
    # WebRTC Configuration
    ice_servers: list = Field(
        default=[
            {"urls": "stun:stun.l.google.com:19302"},
            {"urls": "stun:stun1.l.google.com:19302"}
        ],
        description="ICE servers for WebRTC"
    )
    connection_timeout: int = Field(
        default=30,
        description="WebRTC connection timeout in seconds"
    )
    
    # NDI SDK Configuration
    ndi_sdk_path: Optional[str] = Field(
        default=None,
        description="Path to NDI SDK installation"
    )
    ndi_library_path: Optional[str] = Field(
        default=None,
        description="Path to NDI library files"
    )
    
    # Health Check Configuration
    health_check_interval: int = Field(
        default=30,
        description="Health check interval in seconds"
    )
    stats_update_interval: int = Field(
        default=5,
        description="Statistics update interval in seconds"
    )
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        
        # Environment variable mappings
        fields = {
            "backend_url": {"env": "BACKEND_URL"},
            "backend_ws_url": {"env": "BACKEND_WS_URL"},
            "ndi_source_prefix": {"env": "NDI_SOURCE_PREFIX"},
            "ndi_bridge_port": {"env": "NDI_BRIDGE_PORT"},
            "ndi_bridge_host": {"env": "NDI_BRIDGE_HOST"},
            "max_streams": {"env": "MAX_STREAMS"},
            "frame_buffer_size": {"env": "FRAME_BUFFER_SIZE"},
            "auto_consume": {"env": "AUTO_CONSUME"},
            "default_width": {"env": "DEFAULT_WIDTH"},
            "default_height": {"env": "DEFAULT_HEIGHT"},
            "default_fps": {"env": "DEFAULT_FPS"},
            "processing_quality": {"env": "PROCESSING_QUALITY"},
            "enable_hardware_acceleration": {"env": "ENABLE_HARDWARE_ACCELERATION"},
            "log_level": {"env": "LOG_LEVEL"},
            "log_format": {"env": "LOG_FORMAT"},
            "connection_timeout": {"env": "CONNECTION_TIMEOUT"},
            "ndi_sdk_path": {"env": "NDI_SDK_PATH"},
            "ndi_library_path": {"env": "NDI_LIBRARY_PATH"},
            "health_check_interval": {"env": "HEALTH_CHECK_INTERVAL"},
            "stats_update_interval": {"env": "STATS_UPDATE_INTERVAL"}
        }
    
    def get_backend_ws_url(self) -> str:
        """
        Get WebSocket URL with proper protocol
        
        Returns:
            str: WebSocket URL
        """
        if self.backend_ws_url.startswith(("ws://", "wss://")):
            return self.backend_ws_url
        
        # Auto-detect protocol based on backend URL
        if self.backend_url.startswith("https://"):
            return self.backend_ws_url.replace("ws://", "wss://")
        
        return self.backend_ws_url
    
    def get_ndi_source_name(self, device_name: str) -> str:
        """
        Generate NDI source name for device
        
        Args:
            device_name: Device name
            
        Returns:
            str: NDI source name
        """
        # Clean device name (remove special characters)
        clean_name = "".join(c for c in device_name if c.isalnum() or c in "_-")
        return f"{self.ndi_source_prefix}_{clean_name}"
    
    def is_valid_quality(self, quality: str) -> bool:
        """
        Check if quality setting is valid
        
        Args:
            quality: Quality setting
            
        Returns:
            bool: True if valid
        """
        return quality.lower() in ["low", "medium", "high"]
    
    def get_ice_servers_list(self) -> list:
        """
        Get ICE servers as list of dictionaries
        
        Returns:
            list: ICE servers list
        """
        return self.ice_servers
    
    def get_environment_info(self) -> dict:
        """
        Get environment information
        
        Returns:
            dict: Environment info
        """
        return {
            "python_version": os.sys.version,
            "environment_variables": {
                "BACKEND_URL": os.getenv("BACKEND_URL"),
                "BACKEND_WS_URL": os.getenv("BACKEND_WS_URL"),
                "NDI_SOURCE_PREFIX": os.getenv("NDI_SOURCE_PREFIX"),
                "LOG_LEVEL": os.getenv("LOG_LEVEL"),
            },
            "ndi_sdk_available": self._check_ndi_sdk_availability()
        }
    
    def _check_ndi_sdk_availability(self) -> bool:
        """
        Check if NDI SDK is available
        
        Returns:
            bool: True if NDI SDK is available
        """
        try:
            import ctypes
            import os
            # Try to load the NDI library directly
            ndi_lib_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'NDI SDK for Linux', 'lib', 'x86_64-linux-gnu', 'libndi.so.5.6.1')
            if os.path.exists(ndi_lib_path):
                lib = ctypes.CDLL(ndi_lib_path)
                return True
            return False
        except Exception:
            return False
    
    def validate_configuration(self) -> list:
        """
        Validate configuration settings
        
        Returns:
            list: List of validation errors
        """
        errors = []
        
        # Validate URLs
        if not self.backend_url.startswith(("http://", "https://")):
            errors.append("backend_url must start with http:// or https://")
        
        if not self.backend_ws_url.startswith(("ws://", "wss://")):
            errors.append("backend_ws_url must start with ws:// or wss://")
        
        # Validate numeric values
        if self.max_streams <= 0:
            errors.append("max_streams must be greater than 0")
        
        if self.frame_buffer_size <= 0:
            errors.append("frame_buffer_size must be greater than 0")
        
        if self.default_width <= 0 or self.default_height <= 0:
            errors.append("default_width and default_height must be greater than 0")
        
        if self.default_fps <= 0:
            errors.append("default_fps must be greater than 0")
        
        # Validate quality setting
        if not self.is_valid_quality(self.processing_quality):
            errors.append("processing_quality must be 'low', 'medium', or 'high'")
        
        # Validate log level
        valid_log_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if self.log_level.upper() not in valid_log_levels:
            errors.append(f"log_level must be one of: {', '.join(valid_log_levels)}")
        
        return errors


# Global settings instance
settings = Settings()

def get_settings() -> Settings:
    """
    Get global settings instance
    
    Returns:
        Settings: Global settings instance
    """
    return settings

def reload_settings():
    """
    Reload settings from environment
    """
    global settings
    settings = Settings()

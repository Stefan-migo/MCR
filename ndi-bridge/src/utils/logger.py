"""
Production-grade structured logging
"""

import logging
import json
import sys
from datetime import datetime
from typing import Any, Dict

class StructuredLogger(logging.Handler):
    """
    JSON structured logging for production monitoring
    """
    
    def emit(self, record: logging.LogRecord):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }
        
        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.format(record)
        
        # Add extra fields
        if hasattr(record, 'extra'):
            log_entry.update(record.extra)
        
        print(json.dumps(log_entry), file=sys.stderr)

def setup_production_logging(log_level: str = "INFO"):
    """
    Configure production logging
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))
    
    # Console handler with structured output
    structured_handler = StructuredLogger()
    structured_handler.setLevel(logging.INFO)
    root_logger.addHandler(structured_handler)
    
    # File handler for debugging
    try:
        import os
        os.makedirs('/var/log/ndi-bridge', exist_ok=True)
        file_handler = logging.FileHandler('/var/log/ndi-bridge/debug.log')
        file_handler.setLevel(logging.DEBUG)
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        file_handler.setFormatter(file_formatter)
        root_logger.addHandler(file_handler)
    except Exception as e:
        # Fallback if we can't create log directory
        print(f"Warning: Could not create log file: {e}", file=sys.stderr)

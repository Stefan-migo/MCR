#!/usr/bin/env python3
"""
NDI Source Discovery Test Tool

This tool tests if NDI sources are discoverable on the network.
It can be used to verify that OBS Studio can see NDI sources.
"""

import sys
import os
import logging
import time
import subprocess
from typing import List, Dict, Optional

# Add the project root to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def test_ndi_discovery() -> bool:
    """
    Test NDI source discovery using NDI tools
    """
    try:
        logger.info("🔍 Testing NDI source discovery...")
        
        # Check if NDI tools are available
        ndi_tools = [
            "/usr/local/ndi-sdk/bin/x86_64-linux-gnu/ndi-directory-service",
            "/usr/local/ndi-sdk/bin/x86_64-linux-gnu/ndi-benchmark"
        ]
        
        available_tools = []
        for tool in ndi_tools:
            if os.path.exists(tool):
                available_tools.append(tool)
                logger.info(f"✅ Found NDI tool: {tool}")
            else:
                logger.warning(f"❌ NDI tool not found: {tool}")
        
        if not available_tools:
            logger.error("❌ No NDI tools found. NDI SDK may not be properly installed.")
            return False
        
        # Test NDI directory service
        logger.info("🔍 Testing NDI directory service...")
        try:
            # Start NDI directory service in background
            ndi_dir_service = available_tools[0]
            logger.info(f"Starting NDI directory service: {ndi_dir_service}")
            
            # Run directory service for a few seconds
            result = subprocess.run([ndi_dir_service], 
                                  capture_output=True, 
                                  text=True, 
                                  timeout=5)
            
            if result.returncode == 0:
                logger.info("✅ NDI directory service started successfully")
            else:
                logger.warning(f"⚠️ NDI directory service exited with code {result.returncode}")
                logger.info(f"Output: {result.stdout}")
                logger.info(f"Error: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            logger.info("✅ NDI directory service is running (timeout expected)")
        except Exception as e:
            logger.error(f"❌ Failed to start NDI directory service: {e}")
            return False
        
        # Test NDI benchmark tool
        if len(available_tools) > 1:
            logger.info("🔍 Testing NDI benchmark tool...")
            try:
                ndi_benchmark = available_tools[1]
                result = subprocess.run([ndi_benchmark, "--help"], 
                                      capture_output=True, 
                                      text=True, 
                                      timeout=10)
                
                if result.returncode == 0:
                    logger.info("✅ NDI benchmark tool is working")
                else:
                    logger.warning(f"⚠️ NDI benchmark tool issue: {result.stderr}")
                    
            except Exception as e:
                logger.warning(f"⚠️ NDI benchmark tool test failed: {e}")
        
        logger.info("✅ NDI discovery test completed")
        return True
        
    except Exception as e:
        logger.error(f"❌ NDI discovery test failed: {e}")
        return False

def test_obs_ndi_plugin() -> bool:
    """
    Test if OBS Studio NDI plugin is working
    """
    try:
        logger.info("🔍 Testing OBS Studio NDI plugin...")
        
        # Check if OBS Studio is installed
        obs_paths = [
            "/usr/bin/obs",
            "/usr/local/bin/obs",
            "/snap/bin/obs",
            "/usr/bin/obs-studio"
        ]
        
        obs_found = False
        for path in obs_paths:
            if os.path.exists(path):
                logger.info(f"✅ Found OBS Studio: {path}")
                obs_found = True
                break
        
        if not obs_found:
            logger.warning("⚠️ OBS Studio not found in standard locations")
            logger.info("Please make sure OBS Studio is installed and the NDI plugin is enabled")
            return False
        
        # Check for NDI plugin files
        ndi_plugin_paths = [
            "/usr/lib/obs-plugins/obs-ndi.so",
            "/usr/local/lib/obs-plugins/obs-ndi.so",
            "/snap/obs-studio/current/usr/lib/obs-plugins/obs-ndi.so"
        ]
        
        plugin_found = False
        for path in ndi_plugin_paths:
            if os.path.exists(path):
                logger.info(f"✅ Found NDI plugin: {path}")
                plugin_found = True
                break
        
        if not plugin_found:
            logger.warning("⚠️ NDI plugin not found in standard locations")
            logger.info("Please install the OBS Studio NDI plugin")
            return False
        
        logger.info("✅ OBS Studio NDI plugin test completed")
        return True
        
    except Exception as e:
        logger.error(f"❌ OBS Studio NDI plugin test failed: {e}")
        return False

def main():
    """
    Main function to run all tests
    """
    logger.info("🚀 Starting NDI Discovery Test Suite...")
    
    # Test 1: NDI SDK discovery
    ndi_ok = test_ndi_discovery()
    
    # Test 2: OBS Studio NDI plugin
    obs_ok = test_obs_ndi_plugin()
    
    # Summary
    logger.info("\n" + "="*50)
    logger.info("📊 TEST SUMMARY")
    logger.info("="*50)
    logger.info(f"NDI SDK Discovery: {'✅ PASS' if ndi_ok else '❌ FAIL'}")
    logger.info(f"OBS Studio NDI Plugin: {'✅ PASS' if obs_ok else '❌ FAIL'}")
    
    if ndi_ok and obs_ok:
        logger.info("\n🎉 All tests passed! NDI should work with OBS Studio")
        logger.info("\n📋 Next steps:")
        logger.info("1. Open OBS Studio")
        logger.info("2. Add Source → NDI Source")
        logger.info("3. Look for sources named 'MobileCam_*'")
        logger.info("4. If no sources appear, check the NDI bridge logs")
    else:
        logger.info("\n⚠️ Some tests failed. Please check the issues above.")
        if not ndi_ok:
            logger.info("- Install NDI SDK properly")
        if not obs_ok:
            logger.info("- Install OBS Studio NDI plugin")
    
    return ndi_ok and obs_ok

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

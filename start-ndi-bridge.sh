#!/bin/bash
cd ndi-bridge
source venv/bin/activate
export PYTHONPATH=$PWD/src:$PYTHONPATH
python src/main.py

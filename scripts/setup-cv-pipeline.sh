#!/bin/sh
set -eu

venv="${CV_PIPELINE_VENV:-.data/cv-pipeline-venv}"
python="${PYTHON:-python3}"
"$python" -m venv "$venv"
"$venv/bin/python" -m pip install --upgrade pip
"$venv/bin/python" -m pip install -r server/pipeline/requirements.txt

echo "cv-pipeline ready: $venv/bin/python"

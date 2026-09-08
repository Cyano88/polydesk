#!/bin/sh
set -eu
umask 077
python3 -m venv .sibyl-runtime
.sibyl-runtime/bin/python -m pip install --disable-pip-version-check --no-deps --only-binary=:all: --require-hashes -r scripts/sibyl-runtime-requirements.txt
.sibyl-runtime/bin/python -I -B -m unittest discover -s scripts -p test_sibyl_receipt_memory.py -v

#!/usr/bin/env bash
set -euo pipefail
cd /home/levi/src/hive
node .botanical/research/environment-round2-20260908/water/experiment.mjs corrected-shape corrected
node .botanical/research/environment-round2-20260908/water/experiment.mjs radial-theta1 corrected
node .botanical/research/environment-round2-20260908/water/experiment.mjs cost-li bounded
node .botanical/research/environment-round2-20260908/water/experiment.mjs cost-swe bounded
node .botanical/research/environment-round2-20260908/water/experiment.mjs extended-observation diagnostic

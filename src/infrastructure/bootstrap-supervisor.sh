#!/bin/bash
# Starfleet Bootstrap: Ignites the Station Supervisor
# This script runs on the Station Host (GCE VM)

set -e

IMAGE="ghcr.io/mattkorwel/gemini-cli-orbit:latest"
CONTAINER_NAME="station-supervisor"
DATA_DISK="/mnt/disks/data"

echo "🚀 Starfleet Bootstrap sequence starting..."

# 1. Ensure the data disk layout is correct
echo "📂 Preparing ground truth filesystem..."
sudo mkdir -p ${DATA_DISK}/workspaces
sudo mkdir -p ${DATA_DISK}/mirror
sudo mkdir -p ${DATA_DISK}/project-configs
sudo mkdir -p ${DATA_DISK}/bin
sudo mkdir -p ${DATA_DISK}/dev

# Fix permissions for the node user (UID 1000)
sudo chown -R 1000:1000 ${DATA_DISK}
sudo chmod -R 775 ${DATA_DISK}

# 2. Pull the latest Starfleet image
echo "📥 Pulling latest Starfleet image: ${IMAGE}"
docker pull ${IMAGE}

# 3. Stop and remove existing supervisor if any
if [ "$(docker ps -aq -f name=${CONTAINER_NAME})" ]; then
    echo "🛑 Stopping existing supervisor..."
    docker stop ${CONTAINER_NAME} || true
    docker rm ${CONTAINER_NAME} || true
fi

# 4. Launch the Supervisor
echo "🧠 Launching Station Supervisor..."
docker run -d \
  --name ${CONTAINER_NAME} \
  --restart always \
  --group-add $(stat -c '%g' /var/run/docker.sock) \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ${DATA_DISK}:${DATA_DISK} \
  -v /dev/shm:/dev/shm \
  -e ORBIT_SERVER_PORT=8080 \
  ${IMAGE}

echo "✅ Starfleet Station is ONLINE."

#!/bin/sh

DOCKER_VAR_LIB=/dockerlib
mkdir -p $DOCKER_VAR_LIB

sudo apt-get install \
    ca-certificates \
    curl \
    gnupg \
    lsb-release
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin

usermod -a -G docker ec2-user

echo "Changing Docker data root location to ${DOCKER_VAR_LIB}..."
cp /etc/sysconfig/docker /etc/sysconfig/docker.$( date +%s ).backup
sed -i "s@OPTIONS=\"--default-ulimit@OPTIONS=\"--data-root $DOCKER_VAR_LIB --default-ulimit@g" /etc/sysconfig/docker

echo "Docker installed, but not started. To start docker use following command:
  -> sudo systemctl start docker"
systemctl start docker
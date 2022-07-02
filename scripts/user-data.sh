#!/bin/sh

# Sometimes there is another installer run by other cloud-init scripts
# Let's wait until they finish first


# export AWS_DEFAULT_REGION=$( curl -s http://169.254.169.254/latest/meta-data/placement/region )
export AWS_DEFAULT_REGION="ap-southeast-1"
EFS_ID=$( aws ssm get-parameter --name dev_efs --output text --query 'Parameter.Value' )
ACCESS_POINT_DATA=$( aws ssm get-parameter --name dev_main_ap --output text --query 'Parameter.Value' )
ACCESS_POINT_DOCKER=$( aws ssm get-parameter --name dev_docker_ap --output text --query 'Parameter.Value' )
EFS_MOUNT_AZ=$( aws ssm get-parameter --name az --output text --query 'Parameter.Value' )
# IP_ALLOC_ID=$( aws ssm get-parameter --name dev_ip_allocation_id --output text --query 'Parameter.Value' )
SSH_PUBLIC_KEY=$( aws ssm get-parameter --name dev_ssh_key --output text --query 'Parameter.Value' )
# INSTANCE_ID=$( curl -s http://169.254.169.254/latest/meta-data/instance-id )
HOME_DIR=/home/ec2-user

echo "Installing Amazon EFS file system utilities..."
sudo apt-get update
sudo apt-get -y install git binutils
sudo mkdir -p /efs
cd /efs
git clone https://github.com/aws/efs-utilities
cd /efs/efs-utils
./build-deb.sh
sudo apt-get -y install ./build/amazon-efs-utils*deb

sudo apt-get update
sudo apt-get -y install wget
if echo $(python3 -V 2>&1) | grep -e "Python 3.6"; then
    sudo wget https://bootstrap.pypa.io/pip/3.6/get-pip.py -O /tmp/get-pip.py
elif echo $(python3 -V 2>&1) | grep -e "Python 3.5"; then
    sudo wget https://bootstrap.pypa.io/pip/3.5/get-pip.py -O /tmp/get-pip.py
elif echo $(python3 -V 2>&1) | grep -e "Python 3.4"; then
    sudo wget https://bootstrap.pypa.io/pip/3.4/get-pip.py -O /tmp/get-pip.py
else
    sudo apt-get -y install python3-distutils
    sudo wget https://bootstrap.pypa.io/get-pip.py -O /tmp/get-pip.py
fi
sudo python3 /tmp/get-pip.py
sudo pip3 install botocore

echo "Mount EFS file system into home directory"
sudo mount -t efs -o tls,accesspoint=$ACCESS_POINT_DATA $EFS_ID:/ $HOME_DIR
sudo mkdir -p /dockerlib
sudo mount -t efs -o tls,accesspoint=$ACCESS_POINT_DOCKER $EFS_ID:/ /dockerlib

echo "Preparing Bash profile..."
[ ! -f $HOME_DIR/.bashrc ] && {
  sudo -u ec2-user cp -r /etc/skel/. $HOME_DIR/
}

echo "Inserting public SSH key into EFS home directory..."
sudo -u ec2-user mkdir $HOME_DIR/.ssh
sudo -u ec2-user chmod 0700 $HOME_DIR/.ssh
sudo -u ec2-user touch $HOME_DIR/.ssh/authorized_keys
grep -q -F "${SSH_PUBLIC_KEY}" $HOME_DIR/.ssh/authorized_keys || {
  echo "${SSH_PUBLIC_KEY}" | sudo -u ec2-user tee -a "${SSH_PUBLIC_KEY}" $HOME_DIR/.ssh/authorized_keys
}

GIT_REPO=farizap/dev-machine
RAW_GIT_URL=https://raw.githubusercontent.com/${GIT_REPO}/master/scripts
AUTO_INSTALL_SCRIPTS="01-install-docker.auto-install.sh"

for script in $AUTO_INSTALL_SCRIPTS
do
  echo "Downloading ${RAW_GIT_URL}/$script..."
  curl -L -s ${RAW_GIT_URL}/$script | bash
  echo "$script done at $( date )" >> /tmp/dev-machine-installer.log
done

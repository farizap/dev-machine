#!/bin/sh

# Sometimes there is another installer run by other cloud-init scripts
# Let's wait until they finish first
[ -z "$YUM_PID_FILE" ] && YUM_PID_FILE=/var/run/yum.pid

MAX_RETRIES=10
RETRY=0
while [ -f "$YUM_PID_FILE" ];
do
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "Other yum process taking too long to finish, I give up..." >&2
    exit 1
  fi

  SECONDS=$(( 2 ** $RETRY ))
  echo "Waiting yum ${YUM_PID_FILE} to finish... (${SECONDS} secs)"
  sleep $SECONDS
  RETRY=$(( $RETRY + 1 ))
done

echo "No other yum process is running at the moment..."

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
yum install -y amazon-efs-utils
pip3 -q install botocore

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

echo "Install git"
sudo yum -y install git

echo "Install oh my zsh"
sudo yum -y update && sudo yum -y install zsh
sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
yum install wget git
wget https://github.com/robbyrussell/oh-my-zsh/raw/master/tools/install.sh -O - | zsh


echo "Install docker"
DOCKER_VAR_LIB=/dockerlib
mkdir -p $DOCKER_VAR_LIB

amazon-linux-extras install -q -y docker && \

echo "Changing Docker data root location to ${DOCKER_VAR_LIB}..."
cp /etc/sysconfig/docker /etc/sysconfig/docker.$( date +%s ).backup
sed -i "s@OPTIONS=\"--default-ulimit@OPTIONS=\"--data-root $DOCKER_VAR_LIB --default-ulimit@g" /etc/sysconfig/docker

echo "Docker installed, but not started. To start docker use following command:
  -> sudo systemctl start docker"
  
# Install docker
sudo pip3 install docker-compose
sudo systemctl start docker

usermod -a -G docker ec2-user
sudo chmod 666 /var/run/docker.sock

# Install nodejs
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
nvm install 16


# Install Golang
wget https://dl.google.com/go/go1.19.4.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.19.4.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin


# GIT_REPO=farizap/dev-machine
# RAW_GIT_URL=https://raw.githubusercontent.com/${GIT_REPO}/master/scripts
# AUTO_INSTALL_SCRIPTS="01-install-docker.auto-install.sh"

# for script in $AUTO_INSTALL_SCRIPTS
# do
#   echo "Downloading ${RAW_GIT_URL}/$script..."
#   curl -L -s ${RAW_GIT_URL}/$script | bash
#   echo "$script done at $( date )" >> /tmp/dev-machine-installer.log
# done



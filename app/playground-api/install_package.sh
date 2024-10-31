#!/bin/bash

# Configuration variables
PACKAGE_NAME="$1"
PACKAGE_VERSION="$2"
PACKAGE_URL="$3"
CHECKSUM="$4"
INSTALL_PATH="/pkgs_manager/packages/$PACKAGE_NAME/$PACKAGE_VERSION"
PKG_FILE="$INSTALL_PATH/pkg.tar.gz"
ENV_FILE="$INSTALL_PATH/.env"
STATE_FILE="$INSTALL_PATH/.installation-state"

# Create the installation path
if [ -d "$INSTALL_PATH" ]; then
  echo "The package has residual files. Removing them."
  rm -rf "$INSTALL_PATH"
fi
mkdir -p "$INSTALL_PATH"

# Download the package
echo "Downloading package from $PACKAGE_URL to $PKG_FILE"
curl -H -L "$PACKAGE_URL" -o "$PKG_FILE"
ls -la
if [ $? -ne 0 ]; then
  echo "Failed to download the package"
  exit 1
fi
ls -la $INSTALL_PATH

# Validate checksum
echo "Validating checksum..."
DOWNLOADED_CHECKSUM=$(sha256sum "$PKG_FILE" | awk '{print $1}')
if [ "$DOWNLOADED_CHECKSUM" != "$CHECKSUM" ]; then
  echo "Checksum mismatch. Expected $CHECKSUM, but got $DOWNLOADED_CHECKSUM"
  exit 1
fi

# Extract the package
echo "Extracting package files..."
tar -xzf "$PKG_FILE" -C "$INSTALL_PATH"
if [ $? -ne 0 ]; then
  echo "Failed to extract the package"
  exit 1
fi

# Set up the environment
echo "Setting up environment..."
cd "$INSTALL_PATH" || exit 1
touch environment
ENV_OUTPUT=$(bash -c "source environment && env")

# Filter environment variables and save to file
echo "$ENV_OUTPUT" | grep -vE '^(PWD|OLDPWD|_|SHLVL)=' > "$ENV_FILE"

# Change ownership of the installation directory
echo "Changing ownership of installation directory"
chown -R $(id -u):$(id -g) "$INSTALL_PATH"

# Write installation status file
echo "Writing installation status to disk" > "$STATE_FILE"
date +%s > "$STATE_FILE"

echo "Installation of $PACKAGE_NAME-$PACKAGE_VERSION completed"
exit 0
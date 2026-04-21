#!/bin/bash

PACKAGE_NAME="$1"
PACKAGE_VERSION="$2"
PKG_SOURCE="$3"
INSTALL_PATH="/pkgs_manager/packages/$PACKAGE_NAME/$PACKAGE_VERSION"
ENV_FILE="$INSTALL_PATH/.env"
STATE_FILE="$INSTALL_PATH/.installation-state"

if [ -d "$INSTALL_PATH" ]; then
  echo "The package has residual files. Removing them."
  rm -rf "$INSTALL_PATH"
fi
mkdir -p "$INSTALL_PATH"

echo "Extracting local package $PKG_SOURCE..."
tar -xzf "$PKG_SOURCE" -C "$INSTALL_PATH"
if [ $? -ne 0 ]; then
  echo "Failed to extract the package"
  exit 1
fi

echo "Setting up environment..."
cd "$INSTALL_PATH" || exit 1
touch environment
ENV_OUTPUT=$(bash -c "source environment && env")
echo "$ENV_OUTPUT" | grep -vE '^(PWD|OLDPWD|_|SHLVL)=' > "$ENV_FILE"

echo "Changing ownership of installation directory"
chown -R $(id -u):$(id -g) "$INSTALL_PATH"

echo "Writing installation status to disk" > "$STATE_FILE"
date +%s > "$STATE_FILE"

echo "Installation of $PACKAGE_NAME-$PACKAGE_VERSION completed (local)"
exit 0

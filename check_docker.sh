#!/bin/bash

echo "--- Docker Setup Check ---"
echo "This script checks if Docker is correctly configured in this Codespace."
echo "IMPORTANT: Proper setup relies on '.devcontainer/devcontainer.json' and 'Dockerfile',"
echo "           and requires a SUCCESSFUL Codespace rebuild to apply changes."
echo "--------------------------"
echo ""

# --- Step 1: Check for Docker CLI ---
echo "Step 1: Checking for Docker CLI..."
if ! command -v docker &> /dev/null
then
    echo "[INFO] 'docker' command not found. Attempting to install 'docker-cli'..."
    echo "       (Note: This might fail without root privileges or if the environment prevents it."
    echo "        The recommended method is rebuilding the Codespace with correct config.)"

    # Attempt to install docker-cli (requires sudo/root)
    if sudo apk update && sudo apk add --no-cache docker-cli; then
        echo "[INFO] Attempted to install 'docker-cli'. Re-checking..."
        if ! command -v docker &> /dev/null
        then
            echo "[FAIL] 'docker' command still not found after installation attempt."
            echo "       => Please ensure 'docker-cli' is in the 'Dockerfile' AND rebuild the Codespace."
            echo "       => Check rebuild logs for errors."
            exit 1
        fi
    else
        echo "[FAIL] Failed to install 'docker-cli' using apk."
        echo "       => Check permissions or network issues."
        echo "       => The recommended method is rebuilding the Codespace."
        exit 1
    fi
fi
echo "[OK]   Docker CLI is installed."
echo ""

# --- Step 2: Check Docker Daemon Connection ---
echo "Step 2: Checking connection to Docker Daemon..."
# Use timeout to prevent hanging if daemon is unresponsive
if timeout 5s docker info > /dev/null 2>&1; then
    echo "[OK]   Successfully connected to the Docker daemon."
    echo ""
    echo "--- Docker Setup Verified ---"
    echo "You should now be able to run Docker commands (e.g., 'docker run hello-world')."
    exit 0
else
    echo "[FAIL] Could not connect to the Docker daemon via socket."
    echo "       Attempting to show detailed error from 'docker info':"
    timeout 5s docker info # Display the actual error message
    echo ""
    echo "       Troubleshooting:"
    echo "       1. Ensure the Codespace was REBUILT successfully after the latest changes."
    echo "          (Command Palette: 'Codespaces: Rebuild Container')"
    echo "       2. Verify '.devcontainer/devcontainer.json' includes the 'docker-outside-of-docker' feature."
    echo "       3. Verify 'Dockerfile' includes 'apk add --no-cache docker-cli'."
    echo "       4. Check the Codespace rebuild logs for any errors related to Docker features or packages."
    exit 1
fi

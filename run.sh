#!/bin/bash
set -e  # Exit on error

# Check Python version
if ! command -v python3 &> /dev/null; then
    if command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        echo "Error: Python not found. Please install Python 3.8 or later."
        exit 1
    fi
else
    PYTHON_CMD="python3"
fi

# Verify Python version meets requirements
$PYTHON_CMD -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" || {
    echo "Error: Python 3.8 or higher is required."
    echo "Current Python version: $($PYTHON_CMD --version)"
    exit 1
}

# Install requirements if needed
if [[ "$1" == "--install" ]]; then
    echo "Installing requirements..."
    
    # Determine which pip to use
    if command -v $PYTHON_CMD -m pip &> /dev/null; then
        PIP_CMD="$PYTHON_CMD -m pip"
    elif command -v pip3 &> /dev/null; then
        PIP_CMD="pip3"
    elif command -v pip &> /dev/null; then
        PIP_CMD="pip"
    else
        echo "Error: pip not found. Please install pip."
        exit 1
    fi
    
    # Check if we're in a virtual environment
    IN_VENV=0
    if [[ -n "$VIRTUAL_ENV" ]] || $PYTHON_CMD -c "import sys; sys.exit(0 if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix) else 1)" 2>/dev/null; then
        IN_VENV=1
        echo "Virtual environment detected."
    fi
    
    # Try to use uv for installation, fall back to pip
    if command -v uv &> /dev/null; then
        echo "Using uv for installation..."
        if [ $IN_VENV -eq 1 ]; then
            # In a venv, we don't need --system
            uv pip install -r requirements.txt || {
                echo "uv installation failed, falling back to pip..."
                $PIP_CMD install -r requirements.txt
            }
        else
            # Not in a venv, use --system
            uv pip install --system -r requirements.txt || {
                echo "uv installation failed, falling back to pip..."
                $PIP_CMD install -r requirements.txt
            }
        fi
    else
        echo "uv not found. You can install it with '$PIP_CMD install uv' for faster installations."
        echo "Using pip..."
        $PIP_CMD install -r requirements.txt
    fi
    
    echo "Installation completed."
fi

# Run the application
echo "Starting Attention Visualization app for GPT-2..."
echo "The app will be available at http://localhost:5000"
$PYTHON_CMD app.py
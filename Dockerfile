FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    build-essential \
    gcc \
    g++ \
    make \
    libffi-dev \
    libssl-dev \
    libglib2.0-0 \
    libxext6 \
    libsm6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Miniforge (conda-forge–based; no Anaconda ToS) and configure channels
RUN wget -q https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh && \
    bash Miniforge3-Linux-x86_64.sh -b -p /opt/conda && \
    rm Miniforge3-Linux-x86_64.sh

ENV PATH="/opt/conda/bin:${PATH}"

# Add bioconda; conda-forge is default for Miniforge. No Anaconda ToS needed.
RUN conda config --add channels bioconda && \
    conda config --set channel_priority flexible

# Install mamba for faster package installation
RUN conda install -n base -c conda-forge mamba -y

# Install AMBER tools, PyMOL, AutoDock Vina 1.1.2, Open Babel, RDKit, and gemmi (for Meeko)
RUN mamba install -y python=3.11 \
    conda-forge::ambertools conda-forge::pymol-open-source \
    bioconda::autodock-vina conda-forge::openbabel conda-forge::rdkit conda-forge::gemmi

# Clean up conda/mamba cache to reduce image size
RUN conda clean -afy

# Install Python packages via pip (only packages not provided by conda or that need pip)
# Note: numpy, pandas, matplotlib are already installed by conda; don't override to avoid conflicts
RUN pip install --no-cache-dir \
    flask==2.3.3 \
    flask-cors==4.0.0 \
    biopython \
    seaborn \
    mdanalysis \
    gunicorn==21.2.0 \
    requests \
    meeko>=0.7.0 \
    prody \
    "numpy<2.0"

# Set working directory
WORKDIR /AmberMDFlow

# Copy the entire project
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p /AmberMDFlow/obsolete /AmberMDFlow/pdb /AmberMDFlow/temp /AmberMDFlow/output && \
    chmod -R 777 /AmberMDFlow

# Make sure the ambermdflow package is on the Python path
ENV PYTHONPATH="${PYTHONPATH}:/AmberMDFlow"

# Expose the port
EXPOSE 7860

# Run the application
CMD ["python", "start_web_server.py"]


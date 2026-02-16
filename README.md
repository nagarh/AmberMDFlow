<p align="center">
  <img src="AmberMDFlow.png" alt="AmberMDFlow Logo" width="400">
</p>

# AmberMDFlow

**AmberMDFlow** is a web-based pipeline for preparing structures, setting up molecular dynamics (MD) simulations with the AMBER force field. It integrates structure completion (ESMFold), preparation, force field parameterization, simulation file generation, and PLUMED-based biased MD in a single interface. This is the beta version.

---

## Note
- If you plan to dock ligands and have filled missing residues in the protein chain using ESMFold, you should also energy-minimize the structure.
- The **Fill Missing Residues** option works only for PDB files retrieved from the RCSB database, as it relies on the REMARK 465 records to identify missing residues.
- The public ESMFold API is used to predict protein structures from input sequences, and it supports sequences of up to 400 amino acids.

---

## Features

| Section | Description |
|--------|-------------|
| **Protein Loading** | Upload PDB files or fetch from RCSB PDB; 3D visualization with NGL |
| **Fill Missing Residues** | Detect missing residues (RCSB annotations), complete with ESMFold, optional trimming and energy minimization of predicted structure|
| **Structure Preparation** | Remove water/ions/H; add ACE/NME capping; chain and ligand selection; GAFF/GAFF2 parameterization |
| **Ligand Docking** | AutoDock Vina + Meeko; configurable search box; pose selection and use selected ligand pose to setup MD simulations |
| **Simulation Parameters** | Force fields (ff14SB, ff19SB), water models (TIP3P, SPCE), box size, temperature, pressure |
| **Simulation Steps** | Restrained minimization, minimization, NVT, NPT, production — each with configurable parameters |
| **Generate Files** | AMBER `.in` files, `prmtop`/`inpcrd`, PBS submission scripts |
| **PLUMED** | Collective variables (PLUMED v2.9), `plumed.dat` editor, and simulation file generation with PLUMED |

---

## Requirements for Custom PDB Files

For **custom PDB files** (uploaded or fetched), ensure:

| Requirement | Description |
|-------------|-------------|
| **Chain IDs** | Chain IDs (A,B,C..) must be clearly marked in the PDB file. |
| **Ligands as HETATM** | All ligands must be in **HETATM** records with name and IDs marked (LIG and A). |
| **Standard amino acids** | AmberMDFlow supports **standard amino acids** only. Non-standard residues and residues with PTMs are currently not supported in the pipeline. |

For RCSB structures, the pipeline parses the header and HETATM as provided; for your own PDBs, apply the above conventions.

---

## Quick Start

Try AmberMDFlow instantly on Hugging Face Spaces (no installation required):

**[https://huggingface.co/spaces/hemantn/AmberMDFlow](https://huggingface.co/spaces/hemantn/AmberMDFlow)**

---

## Installation

### Prerequisites

AmberMDFlow requires scientific packages that are only available via **conda** (not PyPI). You must install these first:

| Package | Purpose |
|---------|---------|
| `ambertools` | AMBER MD tools (tleap, antechamber, sander) |
| `pymol-open-source` | Structure visualization and editing |
| `autodock-vina` | AutoDock Vina 1.1.2 molecular docking (from bioconda) |
| `openbabel` | Molecule format conversion |
| `rdkit` | Cheminformatics toolkit |
| `gemmi` | Structure file parsing (required by Meeko) |

---

### Option 1: pip install (recommended)

```bash
# Step 1: Create conda environment with required tools
conda create -n ambermdflow python=3.11 -y
conda activate ambermdflow

# Step 2: Install conda-only dependencies
conda install -c conda-forge -c bioconda ambertools pymol-open-source autodock-vina openbabel rdkit gemmi -y

# Step 3: Install AmberMDFlow from Test PyPI
pip install --extra-index-url https://test.pypi.org/simple/ ambermdflow

# Step 4: Run the web app
ambermdflow
```

Open your browser at **http://localhost:7860**

---

### Option 2: Docker (no conda/pip needed)
**build from source:**
```bash
git clone https://github.com/nagarh/AmberMDFlow.git
cd AmberMDFlow
docker build -t ambermdflow .
docker run -p 7860:7860 ambermdflow
```

Open your browser at **http://localhost:7860**

---

### Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: No module named 'gemmi'` | Run: `conda install -c conda-forge gemmi` |
| `vina: command not found` | Run: `conda install -c conda-forge vina` |
| Port 7860 already in use | Kill the process or edit `start_web_server.py` to use a different port |


---

## Usage

### 1. Protein Loading

- **Upload**: Drag-and-drop or choose a `.pdb` file.
- **Fetch**: Enter a 4-character PDB ID (e.g. `1HPV`) to download from RCSB.

After loading, the **Protein Preview** shows: structure ID, atom count, chains, residues, water, ions, ligands, and HETATM count. Use the 3D viewer to inspect the structure.

---

### 2. Fill Missing Residues

- Click **Analyze Missing Residues** to detect gaps from RCSB metadata.
- **Select chains** to complete with ESMFold.
- **Trim residues** (optional): remove residues from N- or C-terminal edges; internal loops are always filled by ESMFold.
- **Energy minimization** (optional): if you enable ESMFold completion, you can minimize selected chains to resolve clashes before docking. Recommended if receptor preparation (Meeko) fails later.
- **Build Completed Structure** to run ESMFold and (if requested) minimization. Use **Preview Completed Structure** and **View Superimposed Structures** to compare original and completed chains.

> If you use ESMFold in this workflow, please cite [ESM Atlas](https://esmatlas.com/about).

---

### 3. Structure Preparation

- **Remove**: Water, ions, and hydrogens (options are pre-configured).
- **Add capping**: ACE (N-terminal) and NME (C-terminal).
- **Chains**: Select which protein chains to keep for force field generation.
- **Ligands**:
  - **Preserve ligands** to keep them in the structure.
  - **Select ligands to preserve** (e.g. `GOL-A-1`, `LIZ-A`). Unselected ligands are dropped.
  - **Create separate ligand file** to export selected ligand(s) to a PDB.
  - **Protonate** ligand using Open Babel.

Click **Prepare Structure**. The status panel reports original vs prepared atom counts, removed components, added capping, and preserved ligands. Use **View Prepared Structure** and **Download Prepared PDB** as needed.

**Ligand Docking** (nested in this tab):

- Select ligands to dock.
- Set the **search space** (center and size in X, Y, Z) with live 3D visualization.
- **Run Docking** (AutoDock Vina + Meeko). Progress and logs are shown in the docking panel.
- **Select poses** per ligand and **Use selected pose** to write the chosen pose into the structure for AMBER. You can switch modes (e.g. 1–9) and jump by clicking the mode labels.

---

### 4. Simulation Parameters

- **Force field**: ff14SB or ff19SB.
- **Water model**: TIP3P or SPCE.
- **Box size** (Å): padding for solvation.
- **Add ions**: to neutralize (and optionally reach a salt concentration).
- **Temperature** and **Pressure** (e.g. 300 K, 1 bar).
- **Time step** and **Cutoff** for non-bonded interactions.

If ligands were preserved, **Ligand force field** (GAFF/GAFF2) is configured here; net charge is computed before `antechamber` runs.

---

### 5. Simulation Steps

Enable/disable and set parameters for:

- **Restrained minimization** (steps, force constant)
- **Minimization** (steps, cutoff)
- **NVT heating** (steps, temperature)
- **NPT equilibration** (steps, temperature, pressure)
- **Production** (steps, temperature, pressure)

---

### 6. Generate Files

- **Generate All Files** to create AMBER inputs (`min_restrained.in`, `min.in`, `HeatNPT.in`, `mdin_equi.in`, `mdin_prod.in`), `tleap` scripts, `submit_job.pbs`, and (after `tleap`) `prmtop`/`inpcrd`.
- **Preview Files** to open and **edit** each file (e.g. `min.in`, `submit_job.pbs`) and **Save**; changes are written to the output directory.
- **Preview Solvated Protein** / **Download Solvated Protein** to inspect and download the solvated system.

For **PLUMED-based runs**, go to the **PLUMED** tab to configure CVs and `plumed.dat`, then use **Generate simulation files** there to produce inputs that include PLUMED.

---

### 7. PLUMED

- **Collective Variables**: search and select CVs from the PLUMED v2.9 set; view docs and add/edit lines in `plumed.dat`.
- **Custom PLUMED**: edit `plumed.dat` directly.
- **Generate simulation files**: create AMBER + PLUMED input files. Generated files can be **previewed, edited, and saved** as in the main **Generate Files** tab.

> PLUMED citation: [plumed.org/cite](https://www.plumed.org/cite).

---

## Pipeline Overview

```
Protein Loading (upload/fetch)
        ↓
Fill Missing Residues (detect → ESMFold → optional trim & minimize)
        ↓
Structure Preparation (clean, cap, chains, ligands) → optional Docking (Vina, select pose)
        ↓
Simulation Parameters (FF, water, box, T, P, etc.)
        ↓
Simulation Steps (min, NVT, NPT, prod)
        ↓
Generate Files (AMBER .in, tleap, prmtop/inpcrd, PBS)
        ↓
[Optional] PLUMED (CVs, plumed.dat, generate PLUMED-enabled files)
```

---

## Output Layout

Generated files are written under `output/` (or the path set in the app), for example:

- `0_original_input.pdb` — raw input
- `1_protein_no_hydrogens.pdb` — cleaned, capped, chain/ligand selection applied
- `2_protein_with_caps.pdb`, `tleap_ready.pdb` — intermediates
- `4_ligands_corrected_*.pdb` — prepared ligands
- `protein.prmtop`, `protein.inpcrd` — after `tleap`
- `min_restrained.in`, `min.in`, `HeatNPT.in`, `mdin_equi.in`, `mdin_prod.in`, `submit_job.pbs`
- `output/docking/` — receptor, ligands, Vina configs, poses, logs
- `plumed.dat` — when using PLUMED

---

## Multi-user deployment (e.g. Hugging Face Spaces)

When multiple users use the app at the same time (e.g. on Hugging Face Spaces), each user gets an **isolated output folder** so one user’s files are not overwritten by another’s. The app assigns a session ID when the page loads; all API requests send this ID and generated files are stored under `output/<session_id>/`. No configuration is required—this works automatically in multi-user and single-user setups.

---

## Dependencies

| Category | Tools / libraries |
|----------|-------------------|
| **Python** | Flask, Flask-CORS, BioPython, NumPy, Pandas, Matplotlib, Seaborn, MDAnalysis, Requests, RDKit, SciPy |
| **AMBER** | AMBER Tools (tleap, antechamber, sander, ambpdb, etc.) |
| **Docking** | Meeko (`mk_prepare_ligand`, `mk_prepare_receptor`), AutoDock Vina, Open Babel |
| **Visualization** | PyMOL (scripted for H removal, structure editing), NGL (in-browser 3D) |
| **Structure completion** | ESMFold (via API or local, depending on deployment) |

---

## Project Structure

```
AmberMDFlow/
├── start_web_server.py      # Entry point
├── html/
│   ├── index.html           # Main UI
│   └── plumed.html          # PLUMED-focused view (if used)
├── css/
│   ├── styles.css
│   └── plumed.css
├── js/
│   ├── script.js            # Main frontend logic
│   ├── plumed.js            # PLUMED + docking UI
│   └── plumed_cv_docs.js    # CV documentation
├── python/
│   ├── app.py               # Flask backend, API, file generation
│   ├── structure_preparation.py
│   ├── add_caps.py          # ACE/NME capping
│   ├── Fill_missing_residues.py  # ESMFold, trimming, minimization
│   ├── docking.py           # Docking helpers
│   └── docking_utils.py
├── output/                  # Generated files (gitignored in dev)
├── Dockerfile
└── README.md
```

---

## Citation

If you use AmberMDFlow in your work, please cite:

```bibtex
@software{AmberMDFlow,
  title = {AmberMDFlow: Molecular Dynamics and Docking Pipeline},
  author = {Nagar, Hemant},
  year = {2025},
  url = {https://github.com/nagarh/AmberMDFlow}
```

**Related software to cite when used:**

- **AMBER**: [ambermd.org](https://ambermd.org)
- **PLUMED**: [plumed.org/cite](https://www.plumed.org/cite)
- **ESMFold / ESM Atlas**: [esmatlas.com/about](https://esmatlas.com/about)
- **AutoDock Vina**: [autodock-vina/cite](https://autodock-vina.readthedocs.io/en/latest/citations.html)
- **Meeko**: [github.com/forlilab/Meeko](https://github.com/forlilab/Meeko)
- **MDAnalysis**: [mdanalysis/cite](https://www.mdanalysis.org/pages/citations/)
- **NGL Viewer**: [nglviewer/cite](https://doi.org/10.1093/bioinformatics/bty419)
- **PyMOL**: [pymol/cite](https://www.pymol.org/support.html) 

---

## Acknowledgments

- **Mohd Ibrahim** (Technical University of Munich) for the protein capping logic (`add_caps.py`).

---

## License

MIT License. See `LICENSE` for details.

---

## Contact

- **Author**: Hemant Nagar  
- **Email**: hn533621@ohio.edu

#!/usr/bin/env python3
"""
Docking Utilities for AmberMDFlow

This module contains all the Python functions needed for the docking workflow:
1. Compute ligand center
2. Prepare receptor (tleap + pdb4amber + meeko)
3. Prepare ligand (obabel + meeko)
4. Run Vina docking
5. Split docked poses (vina_split)
6. Convert poses to PDB (obabel)
7. Sanitize docked poses for use in MD workflow

Usage:
    from docking_utils import (
        compute_ligand_center,
        prepare_receptor,
        prepare_ligand,
        run_vina_docking,
        split_docked_poses,
        convert_pdbqt_to_pdb,
        sanitize_docked_pose
    )
"""

import subprocess
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


def compute_ligand_center(pdb_path: str) -> tuple:
    """
    Compute the geometric center of all atoms in a ligand PDB file.
    
    Args:
        pdb_path: Path to the ligand PDB file
        
    Returns:
        Tuple of (x, y, z) center coordinates
    """
    try:
        import MDAnalysis as mda
        import numpy as np
    except ImportError as e:
        raise RuntimeError(
            "MDAnalysis and NumPy are required. Install with: "
            "conda install -c conda-forge mdanalysis numpy"
        ) from e
    
    pdb_path = Path(pdb_path)
    if not pdb_path.exists():
        raise FileNotFoundError(f"Ligand file not found: {pdb_path}")
    
    u = mda.Universe(str(pdb_path))
    if u.atoms.n_atoms == 0:
        raise ValueError(f"No atoms found in ligand file {pdb_path}")
    
    coords = u.atoms.positions.astype(float)
    center = coords.mean(axis=0)
    
    logger.info(f"Ligand center for {pdb_path.name}: ({center[0]:.3f}, {center[1]:.3f}, {center[2]:.3f})")
    return float(center[0]), float(center[1]), float(center[2])


def prepare_receptor(protein_pdb: str, output_dir: str) -> tuple:
    """
    Prepare receptor for docking:
    1. Run tleap to add hydrogens
    2. Run pdb4amber to fix element names
    3. Run mk_prepare_receptor.py to create PDBQT
    
    Args:
        protein_pdb: Path to protein PDB file (typically 1_protein_no_hydrogens.pdb)
        output_dir: Directory to store output files
        
    Returns:
        Tuple of (receptor_fixed_pdb_path, receptor_pdbqt_path)
    """
    protein_pdb = Path(protein_pdb).resolve()
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    if not protein_pdb.exists():
        raise FileNotFoundError(f"Protein PDB not found: {protein_pdb}")
    
    # Step 1: tleap - add hydrogens
    tleap_in = output_dir / "prepare_receptor.in"
    receptor_pdb = output_dir / "receptor.pdb"
    
    if not receptor_pdb.exists():
        logger.info("Step 1: Running tleap to add hydrogens to protein...")
        with open(tleap_in, "w") as f:
            f.write("source leaprc.protein.ff14SB\n")
            f.write(f"protein = loadpdb {protein_pdb}\n")
            f.write("savepdb protein receptor.pdb\n")
            f.write("quit\n")
        
        result = subprocess.run(
            ["tleap", "-f", tleap_in.name],
            cwd=output_dir,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not receptor_pdb.exists():
            raise RuntimeError(
                f"tleap failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
            )
        logger.info(f"  Created: {receptor_pdb}")
    
    # Step 2: pdb4amber - fix element names
    receptor_fixed = output_dir / "receptor_fixed.pdb"
    
    if not receptor_fixed.exists():
        logger.info("Step 2: Running pdb4amber to add element names...")
        result = subprocess.run(
            ["pdb4amber", "-i", str(receptor_pdb), "-o", str(receptor_fixed)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not receptor_fixed.exists():
            raise RuntimeError(
                f"pdb4amber failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
            )
        logger.info(f"  Created: {receptor_fixed}")
    
    # Step 3: Meeko receptor preparation
    receptor_pdbqt = output_dir / "receptor.pdbqt"
    
    if not receptor_pdbqt.exists():
        logger.info("Step 3: Running mk_prepare_receptor.py to create PDBQT...")
        result = subprocess.run(
            ["mk_prepare_receptor.py", "-i", str(receptor_fixed), "-o", "receptor", "-p"],
            cwd=output_dir,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not receptor_pdbqt.exists():
            raise RuntimeError(
                f"mk_prepare_receptor.py failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
            )
        logger.info(f"  Created: {receptor_pdbqt}")
    
    return str(receptor_fixed), str(receptor_pdbqt)


def prepare_ligand(ligand_pdb: str, output_dir: str, ligand_index: int = 1) -> str:
    """
    Prepare ligand for docking:
    1. Convert PDB to SDF using obabel
    2. Convert SDF to PDBQT using mk_prepare_ligand.py
    
    Args:
        ligand_pdb: Path to ligand PDB file
        output_dir: Directory to store output files
        ligand_index: Index number for naming output files
        
    Returns:
        Path to ligand PDBQT file
    """
    ligand_pdb = Path(ligand_pdb)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    if not ligand_pdb.exists():
        raise FileNotFoundError(f"Ligand PDB not found: {ligand_pdb}")
    
    # Step 1: obabel PDB -> SDF
    sdf_path = output_dir / f"ligand_{ligand_index}.sdf"
    
    logger.info(f"Step 1: Converting ligand {ligand_index} PDB to SDF...")
    result = subprocess.run(
        ["obabel", "-i", "pdb", str(ligand_pdb), "-o", "sdf", "-O", str(sdf_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not sdf_path.exists():
        raise RuntimeError(
            f"obabel failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    logger.info(f"  Created: {sdf_path}")
    
    # Step 2: Meeko ligand preparation -> PDBQT
    pdbqt_path = output_dir / f"ligand_{ligand_index}.pdbqt"
    
    logger.info(f"Step 2: Converting ligand {ligand_index} SDF to PDBQT...")
    result = subprocess.run(
        ["mk_prepare_ligand.py", "-i", str(sdf_path), "-o", str(pdbqt_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not pdbqt_path.exists():
        raise RuntimeError(
            f"mk_prepare_ligand.py failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    logger.info(f"  Created: {pdbqt_path}")
    
    return str(pdbqt_path)


def run_vina_docking(
    receptor_pdbqt: str,
    ligand_pdbqt: str,
    center_x: float,
    center_y: float,
    center_z: float,
    size_x: float = 18.0,
    size_y: float = 18.0,
    size_z: float = 18.0,
    output_dir: str = None,
    ligand_index: int = 1,
    exhaustiveness: int = 8,
    num_modes: int = 9,
) -> tuple:
    """
    Run AutoDock Vina docking.
    
    Args:
        receptor_pdbqt: Path to receptor PDBQT file
        ligand_pdbqt: Path to ligand PDBQT file
        center_x, center_y, center_z: Box center coordinates (Angstroms)
        size_x, size_y, size_z: Box dimensions (Angstroms)
        output_dir: Directory for output files (default: same as ligand)
        ligand_index: Index for naming output files
        exhaustiveness: Search exhaustiveness (default: 8)
        num_modes: Maximum number of binding modes (default: 9)
        
    Returns:
        Tuple of (docked_pdbqt_path, log_file_path)
    """
    ligand_pdbqt = Path(ligand_pdbqt)
    output_dir = Path(output_dir) if output_dir else ligand_pdbqt.parent
    
    docked_pdbqt = output_dir / f"ligand_{ligand_index}_docked.pdbqt"
    log_file = output_dir / f"ligand_{ligand_index}_docked.log"
    
    logger.info(f"Running Vina docking for ligand {ligand_index}...")
    logger.info(f"  Center: ({center_x:.3f}, {center_y:.3f}, {center_z:.3f})")
    logger.info(f"  Size: ({size_x:.1f}, {size_y:.1f}, {size_z:.1f})")
    
    cmd = [
        "vina",
        "--receptor", str(receptor_pdbqt),
        "--ligand", str(ligand_pdbqt),
        "--center_x", str(center_x),
        "--center_y", str(center_y),
        "--center_z", str(center_z),
        "--size_x", str(size_x),
        "--size_y", str(size_y),
        "--size_z", str(size_z),
        "--out", str(docked_pdbqt),
        "--log", str(log_file),
        "--exhaustiveness", str(exhaustiveness),
        "--num_modes", str(num_modes),
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0 or not docked_pdbqt.exists():
        raise RuntimeError(
            f"Vina docking failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    
    logger.info(f"  Created: {docked_pdbqt}")
    logger.info(f"  Log: {log_file}")
    
    return str(docked_pdbqt), str(log_file)


def parse_vina_log(log_path: str) -> list:
    """
    Parse Vina log file to extract binding energies for each mode.
    
    Args:
        log_path: Path to Vina log file
        
    Returns:
        List of dicts with 'mode', 'affinity', 'rmsd_lb', 'rmsd_ub' for each pose
    """
    log_path = Path(log_path)
    if not log_path.exists():
        return []
    
    energies = []
    in_results = False
    
    with open(log_path, "r") as f:
        for line in f:
            line = line.strip()
            if "-----+------------+----------+----------" in line:
                in_results = True
                continue
            if in_results and line and line[0].isdigit():
                parts = line.split()
                if len(parts) >= 4:
                    try:
                        energies.append({
                            'mode': int(parts[0]),
                            'affinity': float(parts[1]),
                            'rmsd_lb': float(parts[2]),
                            'rmsd_ub': float(parts[3]),
                        })
                    except (ValueError, IndexError):
                        continue
            elif in_results and not line:
                break
    
    return energies


def split_docked_poses(docked_pdbqt: str, output_prefix: str = None) -> list:
    """
    Split docked PDBQT into individual pose files using vina_split.
    
    Args:
        docked_pdbqt: Path to docked PDBQT file with multiple poses
        output_prefix: Prefix for output files (default: derived from input)
        
    Returns:
        List of paths to individual pose PDBQT files
    """
    docked_pdbqt = Path(docked_pdbqt)
    if not docked_pdbqt.exists():
        raise FileNotFoundError(f"Docked PDBQT not found: {docked_pdbqt}")
    
    output_dir = docked_pdbqt.parent
    if output_prefix is None:
        output_prefix = docked_pdbqt.stem.replace("_docked", "_mode")
    
    logger.info(f"Splitting docked poses from {docked_pdbqt.name}...")
    
    result = subprocess.run(
        ["vina_split", "--input", str(docked_pdbqt), "--ligand", output_prefix],
        cwd=output_dir,
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        raise RuntimeError(
            f"vina_split failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    
    # Find all generated mode files
    pose_files = sorted(output_dir.glob(f"{output_prefix}*.pdbqt"))
    logger.info(f"  Split into {len(pose_files)} pose files")
    
    return [str(f) for f in pose_files]


def convert_pdbqt_to_pdb(pdbqt_path: str, ph: float = 7.4) -> str:
    """
    Convert PDBQT file to PDB using obabel.
    
    Args:
        pdbqt_path: Path to PDBQT file
        ph: pH for protonation (default: 7.4)
        
    Returns:
        Path to output PDB file
    """
    pdbqt_path = Path(pdbqt_path)
    if not pdbqt_path.exists():
        raise FileNotFoundError(f"PDBQT file not found: {pdbqt_path}")
    
    pdb_path = pdbqt_path.with_suffix(".pdb")
    
    logger.info(f"Converting {pdbqt_path.name} to PDB...")
    
    result = subprocess.run(
        ["obabel", str(pdbqt_path), "-O", str(pdb_path), "-p", str(ph)],
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0 or not pdb_path.exists():
        raise RuntimeError(
            f"obabel conversion failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    
    logger.info(f"  Created: {pdb_path}")
    return str(pdb_path)


def sanitize_docked_pose(original_ligand: str, pose_pdb: str) -> str:
    """
    Sanitize a docked pose PDB to match the original ligand format:
    - Restore residue name, chain ID, and residue number from original
    - Convert ATOM to HETATM
    - Rename atoms to match original format (C1, N1, etc.)
    - Remove CONECT/MASTER records
    
    Args:
        original_ligand: Path to original ligand PDB file
        pose_pdb: Path to docked pose PDB file
        
    Returns:
        Path to sanitized pose PDB (same as pose_pdb, modified in place)
    """
    original_ligand = Path(original_ligand)
    pose_pdb = Path(pose_pdb)
    
    if not original_ligand.exists():
        raise FileNotFoundError(f"Original ligand not found: {original_ligand}")
    if not pose_pdb.exists():
        raise FileNotFoundError(f"Pose PDB not found: {pose_pdb}")
    
    # Extract residue info from original ligand
    resname = "LIG"
    chain = "X"
    resnum = 1
    
    with open(original_ligand, "r") as f:
        for line in f:
            if line.startswith(("ATOM", "HETATM")):
                resname = line[17:20].strip() or "LIG"
                chain = line[21] if len(line) > 21 and line[21].strip() else "X"
                try:
                    resnum = int(line[22:26].strip())
                except ValueError:
                    resnum = 1
                break
    
    logger.info(f"Sanitizing pose with resname={resname}, chain={chain}, resnum={resnum}")
    
    # Process pose PDB
    new_lines = []
    atom_counter = 0
    element_counts = {}
    
    with open(pose_pdb, "r") as f:
        for line in f:
            if line.startswith(("CONECT", "MASTER")):
                continue
            if line.startswith(("ATOM", "HETATM")):
                atom_counter += 1
                
                # Extract element from line or atom name
                element = line[76:78].strip() if len(line) > 77 else ""
                if not element:
                    # Try to get from atom name
                    atom_name = line[12:16].strip()
                    element = ''.join(c for c in atom_name if c.isalpha())[:2]
                    if len(element) > 1:
                        element = element[0].upper() + element[1].lower()
                
                if not element:
                    element = "C"  # Default fallback
                
                # Generate new atom name (C1, C2, N1, etc.)
                element_counts[element] = element_counts.get(element, 0) + 1
                new_atom_name = f"{element}{element_counts[element]}"
                new_atom_name = f"{new_atom_name:<4}"  # Left-justified, 4 chars
                
                # Build new line as HETATM
                new_line = (
                    f"HETATM{atom_counter:5d} {new_atom_name}"
                    f"{resname:>3s} {chain}{resnum:4d}    "
                    f"{line[30:54]}"  # Coordinates
                    f"{line[54:66] if len(line) > 54 else '  1.00  0.00'}"  # Occupancy, B-factor
                    f"          {element:>2s}\n"
                )
                new_lines.append(new_line)
            elif line.startswith("END"):
                new_lines.append("END\n")
    
    # Write sanitized file
    with open(pose_pdb, "w") as f:
        f.writelines(new_lines)
    
    logger.info(f"  Sanitized: {pose_pdb}")
    return str(pose_pdb)


def run_full_docking_workflow(
    protein_pdb: str,
    ligand_pdbs: list,
    output_dir: str,
    box_configs: dict = None,
) -> dict:
    """
    Run the complete docking workflow for multiple ligands.
    
    Args:
        protein_pdb: Path to protein PDB file (1_protein_no_hydrogens.pdb)
        ligand_pdbs: List of paths to ligand PDB files
        output_dir: Base output directory for docking results
        box_configs: Optional dict of {ligand_index: {'center': (x,y,z), 'size': (sx,sy,sz)}}
        
    Returns:
        Dict with results for each ligand including poses and energies
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    box_configs = box_configs or {}
    
    results = {
        'success': True,
        'ligands': [],
        'warnings': [],
        'errors': [],
    }
    
    # Step 1: Prepare receptor (only once for all ligands)
    logger.info("=" * 60)
    logger.info("STEP 1: Preparing receptor for docking")
    logger.info("=" * 60)
    
    try:
        receptor_fixed, receptor_pdbqt = prepare_receptor(protein_pdb, str(output_dir))
    except Exception as e:
        results['success'] = False
        results['errors'].append(f"Receptor preparation failed: {str(e)}")
        return results
    
    # Step 2: Process each ligand
    for idx, ligand_pdb in enumerate(ligand_pdbs, start=1):
        ligand_pdb = Path(ligand_pdb)
        logger.info("")
        logger.info("=" * 60)
        logger.info(f"STEP 2.{idx}: Processing ligand {idx}: {ligand_pdb.name}")
        logger.info("=" * 60)
        
        lig_dir = output_dir / f"ligand_{idx}"
        lig_dir.mkdir(parents=True, exist_ok=True)
        
        ligand_result = {
            'index': idx,
            'original_file': str(ligand_pdb),
            'poses': [],
            'energies': [],
            'success': True,
        }
        
        try:
            # Copy original ligand for reference
            original_copy = lig_dir / "original_ligand.pdb"
            if not original_copy.exists():
                original_copy.write_text(ligand_pdb.read_text())
            
            # Prepare ligand PDBQT
            ligand_pdbqt = prepare_ligand(str(ligand_pdb), str(lig_dir), idx)
            
            # Get box configuration
            cfg = box_configs.get(idx, {})
            center = cfg.get('center')
            size = cfg.get('size', (18.0, 18.0, 18.0))
            
            if center is None:
                # Compute center from ligand
                cx, cy, cz = compute_ligand_center(str(ligand_pdb))
            else:
                cx, cy, cz = center
            
            sx, sy, sz = size
            
            # Run Vina docking
            docked_pdbqt, log_file = run_vina_docking(
                receptor_pdbqt, ligand_pdbqt,
                cx, cy, cz, sx, sy, sz,
                str(lig_dir), idx
            )
            
            # Parse binding energies
            energies = parse_vina_log(log_file)
            ligand_result['energies'] = energies
            
            # Split poses
            pose_pdbqts = split_docked_poses(docked_pdbqt)
            
            # Convert each pose to PDB and sanitize
            for pose_pdbqt in pose_pdbqts:
                pose_pdb = convert_pdbqt_to_pdb(pose_pdbqt)
                sanitize_docked_pose(str(original_copy), pose_pdb)
                ligand_result['poses'].append(pose_pdb)
            
        except Exception as e:
            ligand_result['success'] = False
            ligand_result['error'] = str(e)
            results['errors'].append(f"Ligand {idx}: {str(e)}")
            logger.error(f"Error processing ligand {idx}: {e}")
        
        results['ligands'].append(ligand_result)
    
    # Check overall success
    results['success'] = all(lig['success'] for lig in results['ligands'])
    
    logger.info("")
    logger.info("=" * 60)
    logger.info("DOCKING WORKFLOW COMPLETE")
    logger.info("=" * 60)
    
    return results


# Example usage / CLI interface
if __name__ == "__main__":
    import argparse
    
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    
    parser = argparse.ArgumentParser(description="Run AutoDock Vina docking workflow")
    parser.add_argument("--protein", required=True, help="Path to protein PDB file")
    parser.add_argument("--ligands", nargs="+", required=True, help="Paths to ligand PDB files")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--center", nargs=3, type=float, help="Box center (x y z)")
    parser.add_argument("--size", nargs=3, type=float, default=[18, 18, 18], help="Box size (x y z)")
    
    args = parser.parse_args()
    
    box_configs = {}
    if args.center:
        for i in range(1, len(args.ligands) + 1):
            box_configs[i] = {
                'center': tuple(args.center),
                'size': tuple(args.size),
            }
    
    results = run_full_docking_workflow(
        args.protein,
        args.ligands,
        args.output,
        box_configs
    )
    
    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    print(f"Overall success: {results['success']}")
    for lig in results['ligands']:
        print(f"\nLigand {lig['index']}:")
        print(f"  Success: {lig['success']}")
        if lig['success']:
            print(f"  Poses generated: {len(lig['poses'])}")
            if lig['energies']:
                print(f"  Best binding energy: {lig['energies'][0]['affinity']} kcal/mol")
        else:
            print(f"  Error: {lig.get('error', 'Unknown')}")

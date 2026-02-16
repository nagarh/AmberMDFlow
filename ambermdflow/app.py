#!/usr/bin/env python3
"""
MD Simulation Pipeline - Flask Backend
Provides API endpoints for protein processing and file generation
"""

from flask import Flask, request, jsonify, send_file, render_template, send_from_directory, Response, stream_with_context, g
from flask_cors import CORS
import os
import sys
import json
import tempfile
import zipfile
import re
import uuid
from pathlib import Path
import requests
import subprocess
import time
from Bio.PDB import PDBParser, PDBList
import logging
import html
from collections import defaultdict
from .structure_preparation import (
    prepare_structure,
    parse_structure_info,
    extract_original_residue_info,
    restore_residue_info_in_pdb,
    sanity_check_ligand_pdb,
    merge_protein_and_ligand,
)
from .Fill_missing_residues import (
    get_pdb_id_from_pdb_file,
    detect_missing_residues,
    get_chain_sequences,
    run_esmfold,
    rebuild_pdb_with_esmfold,
    write_fasta_for_missing_chains,
    trim_residues_from_edges,
    trim_chains_sequences
)

_BASE = Path(__file__).parent
app = Flask(__name__,
            template_folder=str(_BASE / "html"),
            static_folder=str(_BASE),
            static_url_path="")
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Base output directory; each session gets a subdir to avoid multi-user overwrites (e.g. on Hugging Face)
OUTPUT_BASE = Path.cwd() / "output"

# Session ID allowed chars (UUID-style and 'default' for backward compatibility)
_SESSION_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def get_output_dir():
    """Return the output directory for the current request's session (per-user on multi-user deployments)."""
    session_id = g.get("session_id", "default")
    out = OUTPUT_BASE / session_id
    out.mkdir(parents=True, exist_ok=True)
    return out


@app.before_request
def _set_session_id():
    """Set session ID from header or query so each user has an isolated output folder."""
    sid = request.headers.get("X-Session-Id") or request.args.get("session_id")
    if sid and _SESSION_ID_RE.match(sid):
        g.session_id = sid
    else:
        g.session_id = "default"


def clean_and_create_output_folder():
    """Clean and create only the current session's output folder (not other users')."""
    try:
        out_dir = get_output_dir()
        if out_dir.exists():
            import shutil
            shutil.rmtree(out_dir)
            logger.info(f"Removed session output folder: {out_dir}")
        out_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Created session output folder: {out_dir}")
        return True
    except Exception as e:
        logger.error(f"Error cleaning output folder: {str(e)}")
        return False


def _ensure_docking_folder():
    """Ensure the docking output folder exists and return its Path."""
    docking_dir = get_output_dir() / "docking"
    docking_dir.mkdir(parents=True, exist_ok=True)
    return docking_dir


def _minimize_esmfold_chains_streaming(pdb_id, chains_to_minimize, original_for_align=None):
    """
    Minimize ESMFold-generated chains using AMBER with streaming logs.
    Yields log messages in real-time.
    After removing hydrogens, the minimized chain is superimposed to the
    original (true crystal) structure so it stays in the same coordinate
    frame as the ligand and the rest of the system.

    Args:
        pdb_id: PDB ID (e.g., '1KE5')
        chains_to_minimize: List of chain IDs to minimize (e.g., ['A', 'B'])
        original_for_align: Path to the true original PDB for superimposition.
            Use 0_original_input_backup.pdb when it exists (true crystal),
            else 0_original_input.pdb. If None, this is computed automatically.

    Yields:
        Log messages as formatted SSE strings
    """
    get_output_dir().mkdir(parents=True, exist_ok=True)
    if original_for_align is None:
        backup = get_output_dir() / "0_original_input_backup.pdb"
        original_for_align = backup if backup.exists() else (get_output_dir() / "0_original_input.pdb")
    
    for chain in chains_to_minimize:
        try:
            yield _format_log(f"  Preparing minimization for chain {chain}...")
            
            # Step 1: Prepare tleap input file (all minimization files in output/, not docking/)
            esmfold_pdb = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold.pdb"
            if not esmfold_pdb.exists():
                yield _format_log(f"  ❌ ESMFold PDB not found for chain {chain}: {esmfold_pdb}", 'error')
                continue
            
            tleap_in = get_output_dir() / f"tleap_{chain}.in"
            with open(tleap_in, 'w') as f:
                f.write("source leaprc.protein.ff14SB\n")
                f.write(f"protein = loadpdb {esmfold_pdb.resolve()}\n")
                f.write(f"saveamberparm protein {pdb_id}_chain_{chain}_esmfold.prmtop {pdb_id}_chain_{chain}_esmfold.inpcrd\n")
                f.write("quit\n")
            
            # Step 2: Run tleap
            yield _format_log(f"  Running tleap for chain {chain}...")
            prmtop = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold.prmtop"
            inpcrd = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold.inpcrd"
            
            if not prmtop.exists() or not inpcrd.exists():
                cmd = ["tleap", "-f", str(tleap_in)]
                process = subprocess.Popen(
                    cmd,
                    cwd=str(get_output_dir()),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1
                )
                
                for line in iter(process.stdout.readline, ''):
                    if line.strip():
                        yield _format_log(f"    {line.strip()}")
                
                process.wait()
                if process.returncode != 0 or not prmtop.exists():
                    yield _format_log(f"  ❌ tleap failed for chain {chain}", 'error')
                    continue
            
            yield _format_log(f"  ✅ tleap completed for chain {chain}")
            
            # Step 3: Prepare min.in file
            min_in = get_output_dir() / f"min_{chain}.in"
            with open(min_in, 'w') as f:
                f.write("#Two-stage minimization: sidechains first\n")
                f.write(" &cntrl\n")
                f.write("  imin=1, maxcyc=300, ncyc=150,\n")
                f.write("  ntb=0, cut=10.0, igb=1\n")
                f.write(" /\n")
            
            # Step 4: Run sander minimization and stream min_*.out in real-time
            yield _format_log(f"  Running energy minimization (sander) for chain {chain}...")
            min_out = get_output_dir() / f"min_{chain}.out"
            min_rst = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold_minimized.rst"
            
            cmd = [
                "sander",
                "-O",
                "-i", str(min_in),
                "-o", str(min_out),
                "-p", str(prmtop),
                "-c", str(inpcrd),
                "-r", str(min_rst)
            ]
            
            # sander writes to -o file, not stdout: tail min_*.out in real-time
            process = subprocess.Popen(
                cmd,
                cwd=str(get_output_dir()),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
            )
            
            # Wait for min_*.out to be created
            for _ in range(100):
                if min_out.exists():
                    break
                time.sleep(0.1)
            
            last_pos = 0
            buffer = ""
            while True:
                if min_out.exists():
                    try:
                        with open(min_out, "r") as f:
                            f.seek(last_pos)
                            new = f.read()
                            last_pos = f.tell()
                        buffer += new
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            if line.strip():
                                yield _format_log(f"    {line.strip()}")
                    except (IOError, OSError):
                        pass
                
                ret = process.poll()
                if ret is not None:
                    # Read any remaining output
                    if min_out.exists():
                        try:
                            with open(min_out, "r") as f:
                                f.seek(last_pos)
                                new = f.read()
                            buffer += new
                            while "\n" in buffer:
                                line, buffer = buffer.split("\n", 1)
                                if line.strip():
                                    yield _format_log(f"    {line.strip()}")
                            if buffer.strip():
                                yield _format_log(f"    {buffer.strip()}")
                        except (IOError, OSError):
                            pass
                    break
                time.sleep(0.2)
            
            process.wait()
            if process.returncode != 0 and process.stderr:
                err = process.stderr.read()
                if err.strip():
                    yield _format_log(f"    stderr: {err.strip()}", "error")
            
            if process.returncode != 0 or not min_rst.exists():
                yield _format_log(f"  ❌ sander minimization failed for chain {chain}", 'error')
                continue
            
            yield _format_log(f"  ✅ Minimization completed for chain {chain}")
            
            # Step 5: Convert back to PDB using ambpdb
            yield _format_log(f"  Converting minimized structure to PDB (ambpdb) for chain {chain}...")
            min_pdb = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold_minimized.pdb"
            with open(min_pdb, 'w') as f:
                cmd = [
                    "ambpdb",
                    "-p", str(prmtop),
                    "-c", str(min_rst)
                ]
                result = subprocess.run(
                    cmd,
                    stdout=f,
                    stderr=subprocess.PIPE,
                    text=True,
                )
            
            if result.returncode != 0 or not min_pdb.exists():
                yield _format_log(f"  ❌ ambpdb failed for chain {chain}: {result.stderr}", 'error')
                continue
            
            yield _format_log(f"  ✅ PDB conversion completed for chain {chain}")
            
            # Step 6: Remove hydrogens using PyMOL, then superimpose to original (true crystal) frame
            yield _format_log(f"  Removing hydrogens using PyMOL for chain {chain}...")
            min_pdb_noH = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold_minimized_noH.pdb"
            do_superimpose = original_for_align.exists()
            if do_superimpose:
                yield _format_log(f"  Superimposing minimized chain to original (true crystal) frame...")
            try:
                import tempfile
                # Build superimposition block: align minimized CA to original's chain CA so ligand stays in frame
                superimpose_block = ""
                if do_superimpose:
                    superimpose_block = f"""
cmd.load("{original_for_align.resolve()}", "orig_ref")
cmd.align("min_chain_{chain} and name CA", "orig_ref and chain {chain} and name CA")
cmd.delete("orig_ref")
"""
                pymol_script = tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False)
                pymol_script.write(f"""
from pymol import cmd
cmd.load("{min_pdb.resolve()}", "min_chain_{chain}")
cmd.remove("hydrogens")
{superimpose_block}
cmd.save("{min_pdb_noH.resolve()}", "min_chain_{chain}")
cmd.quit()
""")
                pymol_script.close()
                
                result = subprocess.run(
                    ["pymol", "-c", "-Q", pymol_script.name],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                
                if result.returncode != 0 or not min_pdb_noH.exists():
                    raise Exception(f"PyMOL failed: {result.stderr}")
                
                os.unlink(pymol_script.name)
                yield _format_log(f"  ✅ Hydrogens removed for chain {chain}")
                if do_superimpose:
                    yield _format_log(f"  ✅ Minimized chain {chain} superimposed to original frame")
            except Exception as e:
                yield _format_log(f"  ⚠️ PyMOL hydrogen removal failed, using original: {e}", 'warning')
                min_pdb_noH = min_pdb
            
            # Minimized chain noH is written to output/; it will be merged into 1_protein_no_hydrogens.pdb
            # when the user runs Prepare Structure (1_protein_no_hydrogens is created there).
            yield _format_log(f"  ✅ Chain {chain} minimization saved to {min_pdb_noH.name}. It will be merged into 1_protein_no_hydrogens.pdb when you run Prepare Structure.")
            
        except Exception as e:
            yield _format_log(f"  ❌ Error minimizing chain {chain}: {str(e)}", 'error')
            import traceback
            logger.error(traceback.format_exc())
            continue


def _minimize_esmfold_chains(pdb_id, chains_to_minimize):
    """
    Minimize ESMFold-generated chains using AMBER.
    
    Args:
        pdb_id: PDB ID (e.g., '1KE5')
        chains_to_minimize: List of chain IDs to minimize (e.g., ['A', 'B'])
    
    Returns:
        List of successfully minimized chain IDs
    """
    minimized_chains = []
    get_output_dir().mkdir(parents=True, exist_ok=True)
    
    for chain in chains_to_minimize:
        try:
            # Step 1: Prepare tleap input file (all minimization files in output/, not docking/)
            esmfold_pdb = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold.pdb"
            if not esmfold_pdb.exists():
                logger.warning(f"ESMFold PDB not found for chain {chain}: {esmfold_pdb}")
                continue
            
            tleap_in = get_output_dir() / f"tleap_{chain}.in"
            with open(tleap_in, 'w') as f:
                f.write("source leaprc.protein.ff14SB\n")
                f.write(f"protein = loadpdb {esmfold_pdb.resolve()}\n")
                f.write(f"saveamberparm protein {pdb_id}_chain_{chain}_esmfold.prmtop {pdb_id}_chain_{chain}_esmfold.inpcrd\n")
                f.write("quit\n")
            
            # Step 2: Run tleap
            prmtop = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold.prmtop"
            inpcrd = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold.inpcrd"
            
            if not prmtop.exists() or not inpcrd.exists():
                cmd = ["tleap", "-f", str(tleap_in)]
                result = subprocess.run(
                    cmd,
                    cwd=str(get_output_dir()),
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0 or not prmtop.exists():
                    logger.error(f"tleap failed for chain {chain}: {result.stderr}")
                    continue
            
            # Step 3: Prepare min.in file
            min_in = get_output_dir() / f"min_{chain}.in"
            with open(min_in, 'w') as f:
                f.write("#Two-stage minimization: sidechains first\n")
                f.write(" &cntrl\n")
                f.write("  imin=1, maxcyc=300, ncyc=150,\n")
                f.write("  ntb=0, cut=10.0, igb=1\n")
                f.write(" /\n")
            
            # Step 4: Run sander minimization
            min_out = get_output_dir() / f"min_{chain}.out"
            min_rst = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold_minimized.rst"
            
            cmd = [
                "sander",
                "-O",
                "-i", str(min_in),
                "-o", str(min_out),
                "-p", str(prmtop),
                "-c", str(inpcrd),
                "-r", str(min_rst)
            ]
            
            result = subprocess.run(
                cmd,
                cwd=str(get_output_dir()),
                capture_output=True,
                text=True,
            )
            
            if result.returncode != 0 or not min_rst.exists():
                logger.error(f"sander minimization failed for chain {chain}: {result.stderr}")
                continue
            
            # Step 5: Convert back to PDB using ambpdb
            min_pdb = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold_minimized.pdb"
            with open(min_pdb, 'w') as f:
                cmd = [
                    "ambpdb",
                    "-p", str(prmtop),
                    "-c", str(min_rst)
                ]
                result = subprocess.run(
                    cmd,
                    stdout=f,
                    stderr=subprocess.PIPE,
                    text=True,
                )
            
            if result.returncode != 0 or not min_pdb.exists():
                logger.error(f"ambpdb failed for chain {chain}: {result.stderr}")
                continue
            
            # Step 6: Remove hydrogens using PyMOL (run in subprocess to avoid conflicts)
            min_pdb_noH = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold_minimized_noH.pdb"
            try:
                import tempfile
                pymol_script = tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False)
                pymol_script.write(f"""
from pymol import cmd
cmd.load("{min_pdb.resolve()}", "min_chain_{chain}")
cmd.remove("hydrogens")
cmd.save("{min_pdb_noH.resolve()}", "min_chain_{chain}")
cmd.quit()
""")
                pymol_script.close()
                
                result = subprocess.run(
                    ["pymol", "-c", "-Q", pymol_script.name],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                
                if result.returncode != 0 or not min_pdb_noH.exists():
                    raise Exception(f"PyMOL failed: {result.stderr}")
                
                os.unlink(pymol_script.name)
            except Exception as e:
                logger.warning(f"PyMOL hydrogen removal failed for chain {chain}, using original: {e}")
                # Fallback: use the minimized PDB as-is
                min_pdb_noH = min_pdb
            
            # Minimized noH is in output/; it will be merged into 1_protein_no_hydrogens.pdb when user runs Prepare Structure
            logger.info(f"Minimized chain {chain} saved to {min_pdb_noH.name}. It will be merged into 1_protein_no_hydrogens.pdb when you run Prepare Structure.")
            minimized_chains.append(chain)
            
        except Exception as e:
            logger.error(f"Error minimizing chain {chain}: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            continue
    
    return minimized_chains


def _replace_chain_in_pdb(target_pdb, chain_id, source_pdb):
    """
    Replace a specific chain in target_pdb with the chain from source_pdb.
    
    Args:
        target_pdb: Path to target PDB file (will be modified)
        chain_id: Chain ID to replace
        source_pdb: Path to source PDB file containing the new chain
    """
    # Read target PDB
    with open(target_pdb, 'r') as f:
        target_lines = f.readlines()
    
    # Read source PDB
    with open(source_pdb, 'r') as f:
        source_lines = f.readlines()
    
    # Filter target: keep all lines except those with the specified chain
    filtered_target = []
    for line in target_lines:
        if line.startswith(('ATOM', 'HETATM')):
            if len(line) >= 21:
                chain = line[21]
                if chain != chain_id:
                    filtered_target.append(line)
        else:
            # Keep non-ATOM lines
            filtered_target.append(line)
    
    # Extract chain from source
    source_chain_lines = []
    for line in source_lines:
        if line.startswith(('ATOM', 'HETATM')):
            if len(line) >= 21:
                chain = line[21]
                if chain == 'A' or chain == chain_id:  # ESMFold outputs as chain A
                    # Update chain ID to match
                    new_line = line[:21] + chain_id + line[22:]
                    source_chain_lines.append(new_line)
    
    # Combine: target (without old chain) + new chain
    combined = []
    for line in filtered_target:
        if line.startswith('END'):
            # Insert new chain before END
            combined.extend(source_chain_lines)
        combined.append(line)
    
    # Write back
    with open(target_pdb, 'w') as f:
        f.writelines(combined)


def _prepare_receptor_for_docking():
    """
    Prepare receptor files for docking using the procedure in python/docking.py:
      1. Run tleap on 1_protein_no_hydrogens.pdb to add hydrogens -> protein.pdb
      2. Run pdb4amber on receptor.pdb -> receptor_fixed.pdb
      3. Prepare receptor PDBQT with Meeko (mk_prepare_receptor.py)
    
    If ESMFold-completed structure is being used, the receptor will include:
    - Completed chains from ESMFold (for chains that were selected for completion)
    - Original chains (for chains that were not selected for completion)
    
    Returns paths (as Path objects) to receptor PDB and PDBQT.
    """
    docking_dir = _ensure_docking_folder()

    protein_no_h = get_output_dir() / "1_protein_no_hydrogens.pdb"
    if not protein_no_h.exists():
        raise FileNotFoundError(
            f"1_protein_no_hydrogens.pdb not found in {get_output_dir()}. "
            "Please run structure preparation first."
        )

    # Check if completed structure is being used
    flag_file = get_output_dir() / ".use_completed_structure"
    complete_structure_path = get_output_dir() / "0_complete_structure.pdb"
    use_completed = flag_file.exists() and complete_structure_path.exists()
    
    if use_completed:
        logger.info("ESMFold-completed structure is being used for docking receptor preparation")
        logger.info(f"Completed structure includes: ESMFold-completed chains + original chains not selected for completion")

    # Step 1: tleap -> protein.pdb (receptor.pdb)
    tleap_in = docking_dir / "prepare_receptor.in"
    receptor_pdb = docking_dir / "receptor.pdb"
    
    # Check if receptor needs to be regenerated (if completed structure is newer or receptor doesn't exist)
    regenerate_receptor = False
    if not receptor_pdb.exists():
        regenerate_receptor = True
    elif use_completed and complete_structure_path.exists():
        # If using completed structure, check if it's newer than the receptor
        receptor_mtime = receptor_pdb.stat().st_mtime
        completed_mtime = complete_structure_path.stat().st_mtime
        protein_mtime = protein_no_h.stat().st_mtime
        # Regenerate if completed structure or protein file is newer
        if completed_mtime > receptor_mtime or protein_mtime > receptor_mtime:
            logger.info("Regenerating receptor: completed structure or protein file is newer")
            regenerate_receptor = True

    if regenerate_receptor:
        # Delete old receptor files to force regeneration
        if receptor_pdb.exists():
            receptor_pdb.unlink()
        receptor_fixed_path = docking_dir / "receptor_fixed.pdb"
        if receptor_fixed_path.exists():
            receptor_fixed_path.unlink()
        receptor_pdbqt_path = docking_dir / "receptor.pdbqt"
        if receptor_pdbqt_path.exists():
            receptor_pdbqt_path.unlink()
        
        # Use absolute path to protein file since tleap runs from docking dir
        protein_no_h_abs = str(protein_no_h.resolve())
        with open(tleap_in, "w") as f:
            f.write("source leaprc.protein.ff14SB\n")
            f.write(f"protein = loadpdb {protein_no_h_abs}\n")
            f.write("savepdb protein receptor.pdb\n")
            f.write("quit\n")

        # Run tleap in docking directory
        cmd = ["tleap", "-f", tleap_in.name]
        result = subprocess.run(
            cmd,
            cwd=docking_dir,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not receptor_pdb.exists():
            raise RuntimeError(
                "Failed to prepare receptor with tleap.\n"
                f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
            )

    # Step 2: pdb4amber -> receptor_fixed.pdb
    receptor_fixed = docking_dir / "receptor_fixed.pdb"
    if regenerate_receptor or not receptor_fixed.exists():
        cmd = [
            "pdb4amber",
            "-i",
            str(receptor_pdb),
            "-o",
            str(receptor_fixed),
        ]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not receptor_fixed.exists():
            raise RuntimeError(
                "Failed to run pdb4amber on receptor.\n"
                f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
            )

    # Step 3: Meeko receptor preparation -> receptor.pdbqt
    receptor_pdbqt = docking_dir / "receptor.pdbqt"
    if regenerate_receptor or not receptor_pdbqt.exists():
        cmd = [
            "mk_prepare_receptor.py",
            "-i",
            str(receptor_fixed),
            "-o",
            "receptor",  # Meeko will append .pdbqt
            "-p",
        ]
        result = subprocess.run(
            cmd,
            cwd=docking_dir,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not receptor_pdbqt.exists():
            # Check if error is due to clashes/disulfide bonds
            error_text = result.stderr + result.stdout
            needs_minimization = (
                "excess inter-residue bond" in error_text or
                ("Expected" in error_text and "paddings" in error_text)
            )
            
            if needs_minimization:
                # Check if chains were minimized
                min_status_file = get_output_dir() / ".chains_minimized"
                minimized_chains = []
                if min_status_file.exists():
                    with open(min_status_file, 'r') as f:
                        content = f.read().strip()
                        minimized_chains = content.split(',') if content else []
                
                error_msg = (
                    "Failed to prepare receptor PDBQT with Meeko due to clashes/disulfide bonds.\n\n"
                )
                
                if not minimized_chains:
                    error_msg += (
                        "⚠️ ESMFold-generated chains need energy minimization.\n"
                        "Please go back to the 'Fill Missing Residues' step and:\n"
                        "1. Check the 'Energy minimize ESMFold-generated chains' option\n"
                        "2. Select the chains you want to minimize\n"
                        "3. Rebuild the completed structure\n"
                        "4. Then try docking again.\n\n"
                    )
                else:
                    error_msg += (
                        f"Some chains were minimized ({', '.join(minimized_chains)}), but the error persists.\n"
                        "You may need to minimize additional chains or check the structure.\n\n"
                    )
                
                error_msg += f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
                raise RuntimeError(error_msg)
            else:
                raise RuntimeError(
                    "Failed to prepare receptor PDBQT with Meeko.\n"
                    f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
                )

    return receptor_fixed, receptor_pdbqt


def _compute_ligand_center(pdb_path: Path):
    """Compute geometric center of all atoms in a ligand PDB using MDAnalysis."""
    try:
        import MDAnalysis as mda
        import numpy as np
    except Exception as e:
        raise RuntimeError(
            "MDAnalysis and NumPy are required for docking but could not be imported."
        ) from e

    u = mda.Universe(str(pdb_path))
    if u.atoms.n_atoms == 0:
        raise ValueError(f"No atoms found in ligand file {pdb_path}")
    coords = u.atoms.positions.astype(float)
    center = coords.mean(axis=0)
    return float(center[0]), float(center[1]), float(center[2])


def _prepare_docked_pose_as_ligand(original_ligand: Path, pose_pdb: Path):
    """
    Take a docked pose PDB and sanitize it so it can replace the original ligand:
      - Restore original residue name, chain ID, and residue index
      - Run ligand sanity checks (CONECT/MASTER removal, ATOM->HETATM, distinct atom names)
    This updates the pose_pdb in place.
    """
    if not original_ligand.exists():
        raise FileNotFoundError(f"Original ligand file not found: {original_ligand}")
    if not pose_pdb.exists():
        raise FileNotFoundError(f"Docked pose file not found: {pose_pdb}")

    residue_info = extract_original_residue_info(str(original_ligand))
    if residue_info:
        restore_residue_info_in_pdb(
            str(pose_pdb),
            residue_info.get("resname", "LIG"),
            residue_info.get("chain_id", ""),
            residue_info.get("resnum", "1"),
        )
    # Run the existing ligand sanity checks
    if not sanity_check_ligand_pdb(str(pose_pdb)):
        raise RuntimeError(f"Sanity check failed for docked pose {pose_pdb}")


def _sanitize_docked_pose_for_antechamber(pose_pdb: Path, original_residue_info: dict):
    """
    Sanitize a docked pose PDB to make it compatible with antechamber:
      1. Remove CONECT/MASTER/REMARK records
      2. Convert all ATOM records to HETATM
      3. Restore original residue name, chain ID, and residue number
      4. Make atom names distinct (C1, C2, N1, N2, O1, O2, H1, H2, etc.)
    
    PDB Column format (1-indexed):
      1-6:   RECORD (HETATM)
      7-11:  ATOM # (atom serial number, right-justified)
      12:    Blank
      13-16: ATOM NAME (right-justified for 1-2 char elements)
      17:    RES ALT (alternate location indicator, usually blank)
      18-20: RES NAME (right-justified)
      21:    Blank
      22:    CHN ID (chain identifier)
      23-26: RES# (residue sequence number, right-justified)
      27:    Insertion code (usually blank)
      28-30: Blank (3 spaces)
      31-38: X coordinate (8 chars, %8.3f)
      39-46: Y coordinate (8 chars, %8.3f)
      47-54: Z coordinate (8 chars, %8.3f)
      55-60: OCC (occupancy, 6 chars)
      61-66: TEMP (temperature factor, 6 chars)
      67-76: Blank (10 spaces)
      77-78: ELEMENT (right-justified)
      79-80: Charge (e.g., 1+, 1-, 2+)
    
    Args:
        pose_pdb: Path to the docked pose PDB file (modified in place)
        original_residue_info: Dict with 'resname', 'chain_id', 'resnum' from original ligand
    """
    if not pose_pdb.exists():
        raise FileNotFoundError(f"Docked pose file not found: {pose_pdb}")
    
    # Get residue info (use provided or defaults)
    resname = original_residue_info.get("resname", "LIG") if original_residue_info else "LIG"
    chain_id = original_residue_info.get("chain_id", "A") if original_residue_info else "A"
    resnum = original_residue_info.get("resnum", "1") if original_residue_info else "1"
    
    # Ensure resname is exactly 3 chars, chain_id is 1 char
    resname = resname[:3].upper()
    chain_id = chain_id[0] if chain_id else "A"
    
    # Read the file
    with open(pose_pdb, 'r') as f:
        lines = f.readlines()
    
    # Track element counts for distinct atom naming
    from collections import defaultdict
    element_counts = defaultdict(int)
    
    processed_lines = []
    atom_serial = 0
    
    for line in lines:
        # Skip CONECT, MASTER, REMARK, COMPND, AUTHOR, TER, HEADER, TITLE, CRYST1 lines
        if line.startswith(('CONECT', 'MASTER', 'REMARK', 'COMPND', 'AUTHOR', 'TER', 'HEADER', 'TITLE', 'CRYST1')):
            continue
        
        if line.startswith(('ATOM', 'HETATM')):
            atom_serial += 1
            
            # Pad line to ensure it's long enough
            padded_line = line.ljust(80)
            
            # Extract X, Y, Z coordinates (columns 31-54, 0-indexed: 30-54)
            try:
                x = float(padded_line[30:38].strip())
                y = float(padded_line[38:46].strip())
                z = float(padded_line[46:54].strip())
            except ValueError:
                continue  # Skip lines with invalid coordinates
            
            # Extract element from column 77-78 and charge from column 79-80
            element = padded_line[76:78].strip()
            charge = padded_line[78:80].strip()
            
            # Handle cases where element+charge are combined (e.g., "N1+")
            if element and len(element) > 2:
                import re
                match = re.match(r'^([A-Za-z]{1,2})(\d*[+-])$', element)
                if match:
                    element = match.group(1).upper()
                    charge = match.group(2)
            
            # If no element found, extract from atom name
            if not element:
                atom_name = padded_line[12:16].strip()
                if len(atom_name) >= 1:
                    # Check for two-letter elements
                    if len(atom_name) >= 2 and atom_name[:2].upper() in ['CL', 'BR', 'MG', 'ZN', 'FE', 'CU', 'MN']:
                        element = atom_name[:2].upper()
                    else:
                        # Get first alphabetic character
                        for c in atom_name:
                            if c.isalpha():
                                element = c.upper()
                                break
                        if not element:
                            element = 'X'
            
            # Normalize element to uppercase
            element = element.upper()
            
            # Create distinct atom name (e.g., C1, C2, N1, H1, H2, etc.)
            element_counts[element] += 1
            count = element_counts[element]
            
            # Format atom name: right-justify within 4 chars
            atom_name_str = f"{element}{count}"
            if len(atom_name_str) > 4:
                atom_name_str = atom_name_str[:4]
            
            # Build properly formatted PDB line following standard format
            # HETATM    1   N1 MKW A 203    7.216   9.776  -4.013  1.00  0.00           N
            new_line = (
                f"HETATM"                      # 1-6: Record type (6 chars)
                f"{atom_serial:5d}"            # 7-11: Atom serial (5 chars, right-justified)
                f" "                           # 12: Blank (1 char)
                f"{atom_name_str:>4}"          # 13-16: Atom name (4 chars, right-justified)
                f" "                           # 17: Alt loc indicator (1 char, blank)
                f"{resname:>3}"                # 18-20: Residue name (3 chars, right-justified)
                f" "                           # 21: Blank (1 char)
                f"{chain_id}"                  # 22: Chain ID (1 char)
                f"{resnum:>4}"                 # 23-26: Residue number (4 chars, right-justified)
                f"    "                        # 27-30: Insertion code + blank (4 chars)
                f"{x:8.3f}"                    # 31-38: X coordinate (8 chars)
                f"{y:8.3f}"                    # 39-46: Y coordinate (8 chars)
                f"{z:8.3f}"                    # 47-54: Z coordinate (8 chars)
                f"  1.00"                      # 55-60: Occupancy (6 chars)
                f"  0.00"                      # 61-66: Temp factor (6 chars)
                f"          "                  # 67-76: Blank (10 chars)
                f"{element:>2}"                # 77-78: Element symbol (2 chars, right-justified)
                f"{charge:<2}"                 # 79-80: Charge (2 chars, left-justified)
                f"\n"
            )
            processed_lines.append(new_line)
        elif line.startswith('END'):
            continue  # We'll add END at the end
    
    # Add END record
    processed_lines.append('END\n')
    
    # Write back
    with open(pose_pdb, 'w') as f:
        f.writelines(processed_lines)
    
    logger.info(f"Sanitized docked pose {pose_pdb}: resname={resname}, chain={chain_id}, resnum={resnum}, atoms={atom_serial}")
    logger.info(f"Element counts: {dict(element_counts)}")


def _parse_vina_config(config_path: Path):
    """
    Parse Vina config file and return a dict with parameters.
    Returns None if file doesn't exist or can't be parsed.
    """
    if not config_path.exists():
        return None
    
    config = {}
    try:
        for line in config_path.read_text().split('\n'):
            line = line.strip()
            # Skip comments and empty lines
            if not line or line.startswith('#'):
                continue
            
            # Parse key = value format
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                
                # Try to convert to appropriate type
                try:
                    if '.' in value:
                        config[key] = float(value)
                    else:
                        config[key] = int(value)
                except ValueError:
                    config[key] = value
        
        return config
    except Exception as e:
        logger.warning(f"Error parsing config file {config_path}: {e}")
        return None


def _parse_vina_log(log_path: Path):
    """
    Parse AutoDock Vina log file and extract binding energies per mode.
    Returns dict: {mode_index: energy_kcal_mol}
    """
    energies = {}
    if not log_path.exists():
        return energies

    try:
        import re

        with log_path.open("r") as f:
            for line in f:
                # Typical Vina line:
                #    1       -7.3      0.000      0.000
                m = re.match(r"^\s*(\d+)\s+(-?\d+\.\d+)", line)
                if m:
                    mode = int(m.group(1))
                    energy = float(m.group(2))
                    energies[mode] = energy
    except Exception as e:
        logger.warning(f"Could not parse Vina log {log_path}: {e}")

    return energies

class MDSimulationGenerator:
    """Handles MD simulation file generation and protein processing"""
    
    def __init__(self):
        self.pdb_parser = PDBParser(QUIET=True)
        self.pdb_list = PDBList()
    
    def fetch_pdb_structure(self, pdb_id):
        """Fetch PDB structure from RCSB"""
        try:
            # Download PDB file
            pdb_file = self.pdb_list.retrieve_pdb_file(pdb_id, pdir=get_output_dir(), file_format='pdb')
            return str(pdb_file)
        except Exception as e:
            logger.error(f"Error fetching PDB {pdb_id}: {str(e)}")
            raise
    
    def parse_pdb_structure(self, pdb_file):
        """Parse PDB file and extract structure information"""
        try:
            structure = self.pdb_parser.get_structure('protein', pdb_file)
            
            # Extract basic information
            atom_count = 0
            chains = set()
            residues = set()
            
            for model in structure:
                for chain in model:
                    chains.add(chain.id)
                    for residue in chain:
                        if residue.id[0] == ' ':  # Standard residues
                            residues.add(f"{residue.resname}{residue.id[1]}")
                        for atom in residue:
                            atom_count += 1
            
            return {
                'atom_count': atom_count,
                'chains': list(chains),
                'residue_count': len(residues),
                'structure_id': Path(pdb_file).stem.upper()
            }
        except Exception as e:
            logger.error(f"Error parsing PDB file: {str(e)}")
            raise
    
    def generate_mdp_file(self, params, step_type='production'):
        """Generate GROMACS MDP file for different simulation steps"""
        
        if step_type == 'restrained_min':
            return f"""; Restrained Minimization Parameters
integrator = steep
nsteps = {params['steps']['restrainedMin']['steps']}
emstep = 0.01
emtol = 1000

; Position restraints
define = -DPOSRES
refcoord_scaling = com

; Output control
nstxout = 100
nstenergy = 100
nstlog = 100

; Bond parameters
constraint_algorithm = lincs
constraints = h-bonds

; Neighbor searching
cutoff-scheme = Verlet
ns_type = grid
nstlist = 10
rlist = {params['cutoff']}

; Electrostatics
coulombtype = PME
rcoulomb = {params['cutoff']}
pme_order = {params['pmeOrder']}

; Van der Waals
vdwtype = Cut-off
rvdw = {params['cutoff']}
"""
        
        elif step_type == 'minimization':
            return f"""; Minimization Parameters
integrator = {params['steps']['minimization']['algorithm']}
nsteps = {params['steps']['minimization']['steps']}
emstep = 0.01
emtol = 1000

; Output control
nstxout = 100
nstenergy = 100
nstlog = 100

; Bond parameters
constraint_algorithm = lincs
constraints = h-bonds

; Neighbor searching
cutoff-scheme = Verlet
ns_type = grid
nstlist = 10
rlist = {params['cutoff']}

; Electrostatics
coulombtype = PME
rcoulomb = {params['cutoff']}
pme_order = {params['pmeOrder']}

; Van der Waals
vdwtype = Cut-off
rvdw = {params['cutoff']}
"""
        
        elif step_type == 'nvt':
            return f"""; NVT Equilibration Parameters
integrator = md
dt = {params['timestep']}
nsteps = {params['steps']['nvt']['steps']}

; Output control
nstxout = 5000
nstvout = 5000
nstenergy = 1000
nstlog = 1000

; Bond parameters
constraint_algorithm = lincs
constraints = h-bonds
lincs_iter = 1
lincs_order = 4

; Neighbor searching
cutoff-scheme = Verlet
ns_type = grid
nstlist = 40
rlist = {params['cutoff']}

; Electrostatics
coulombtype = PME
rcoulomb = {params['cutoff']}
pme_order = {params['pmeOrder']}

; Van der Waals
vdwtype = Cut-off
rvdw = {params['cutoff']}

; Temperature coupling
tcoupl = {params['couplingType']}
tc-grps = Protein Non-Protein
tau_t = 0.1 0.1
ref_t = {params['steps']['nvt']['temperature']} {params['steps']['nvt']['temperature']}

; Pressure coupling (disabled for NVT)
pcoupl = no

; Velocity generation
gen_vel = yes
gen_temp = {params['steps']['nvt']['temperature']}
gen_seed = -1
"""
        
        elif step_type == 'npt':
            return f"""; NPT Equilibration Parameters
integrator = md
dt = {params['timestep']}
nsteps = {params['steps']['npt']['steps']}

; Output control
nstxout = 5000
nstvout = 5000
nstenergy = 1000
nstlog = 1000

; Bond parameters
constraint_algorithm = lincs
constraints = h-bonds
lincs_iter = 1
lincs_order = 4

; Neighbor searching
cutoff-scheme = Verlet
ns_type = grid
nstlist = 40
rlist = {params['cutoff']}

; Electrostatics
coulombtype = PME
rcoulomb = {params['cutoff']}
pme_order = {params['pmeOrder']}

; Van der Waals
vdwtype = Cut-off
rvdw = {params['cutoff']}

; Temperature coupling
tcoupl = {params['couplingType']}
tc-grps = Protein Non-Protein
tau_t = 0.1 0.1
ref_t = {params['steps']['npt']['temperature']} {params['steps']['npt']['temperature']}

; Pressure coupling
pcoupl = {params['couplingType']}
pcoupltype = isotropic
tau_p = 2.0
ref_p = {params['steps']['npt']['pressure']}
compressibility = 4.5e-5

; Velocity generation
gen_vel = no
"""
        
        else:  # production
            return f"""; MD Simulation Parameters
; Generated by MD Simulation Pipeline

; Run parameters
integrator = md
dt = {params['timestep']}
nsteps = {params['steps']['production']['steps']}

; Output control
nstxout = 5000
nstvout = 5000
nstenergy = 1000
nstlog = 1000

; Bond parameters
constraint_algorithm = lincs
constraints = h-bonds
lincs_iter = 1
lincs_order = 4

; Neighbor searching
cutoff-scheme = Verlet
ns_type = grid
nstlist = 40
rlist = {params['cutoff']}

; Electrostatics
coulombtype = PME
rcoulomb = {params['cutoff']}
pme_order = {params['pmeOrder']}
fourierspacing = 0.16

; Van der Waals
vdwtype = Cut-off
rvdw = {params['cutoff']}

; Temperature coupling
tcoupl = {params['couplingType']}
tc-grps = Protein Non-Protein
tau_t = 0.1 0.1
ref_t = {params['temperature']} {params['temperature']}

; Pressure coupling
pcoupl = {params['couplingType']}
pcoupltype = isotropic
tau_p = 2.0
ref_p = {params['pressure']}
compressibility = 4.5e-5

; Dispersion correction
DispCorr = EnerPres

; Velocity generation
gen_vel = yes
gen_temp = {params['temperature']}
gen_seed = -1
"""
    
    def generate_pbs_script(self, protein_name, params):
        """Generate PBS script for HPC submission"""
        total_steps = params['steps']['production']['steps']
        time_in_ns = (total_steps * params['timestep']) / 1000
        
        return f"""#!/bin/bash
#PBS -N {protein_name}_md
#PBS -l nodes=1:ppn=16
#PBS -l walltime=24:00:00
#PBS -q normal
#PBS -j oe

# Change to the directory where the job was submitted
cd $PBS_O_WORKDIR

# Load required modules
module load gromacs/2023.2
module load intel/2021.4.0

# Set up environment
export OMP_NUM_THREADS=16
export GMX_MAXBACKUP=-1

# Simulation parameters
PROTEIN={protein_name}
STEPS={total_steps}
TIME_NS={time_in_ns:.2f}

echo "Starting MD simulation for $PROTEIN"
echo "Total simulation time: $TIME_NS ns"
echo "Job started at: $(date)"

# Run the simulation
./run_simulation.sh $PROTEIN

echo "Simulation completed at: $(date)"
echo "Results saved in output directory"
"""
    
    def generate_setup_script(self, protein_name, params):
        """Generate setup script for MD simulation"""
        return f"""#!/bin/bash
# Setup script for {protein_name} MD simulation
# Generated by MD Simulation Pipeline

set -e

PROTEIN={protein_name}
FORCE_FIELD={params['forceField']}
WATER_MODEL={params['waterModel']}

echo "Setting up MD simulation for $PROTEIN"

# Create output directory
mkdir -p output

# 1. Prepare protein structure
echo "Preparing protein structure..."
gmx pdb2gmx -f $PROTEIN.pdb -o $PROTEIN_processed.gro -p $PROTEIN.top -ff $FORCE_FIELD -water $WATER_MODEL

# 2. Define simulation box
echo "Defining simulation box..."
gmx editconf -f $PROTEIN_processed.gro -o $PROTEIN_box.gro -c -d {params['boxMargin']} -bt {params['boxType']}

# 3. Add solvent
echo "Adding solvent..."
gmx solvate -cp $PROTEIN_box.gro -cs spc216.gro -o $PROTEIN_solv.gro -p $PROTEIN.top

# 4. Add ions
echo "Adding ions..."
gmx grompp -f $PROTEIN_restrained.mdp -c $PROTEIN_solv.gro -p $PROTEIN.top -o $PROTEIN_ions.tpr
echo "SOL" | gmx genion -s $PROTEIN_ions.tpr -o $PROTEIN_final.gro -p $PROTEIN.top -pname NA -nname CL -neutral

echo "Setup completed successfully!"
echo "Ready to run simulation with: ./run_simulation.sh $PROTEIN"
"""
    
    def generate_analysis_script(self, protein_name):
        """Generate analysis script for MD simulation results"""
        return f"""#!/bin/bash
# Analysis script for {protein_name} MD simulation
# Generated by MD Simulation Pipeline

PROTEIN={protein_name}

echo "Analyzing MD simulation results for $PROTEIN"

# Create analysis directory
mkdir -p analysis

# 1. RMSD analysis
echo "Calculating RMSD..."
echo "Protein" | gmx rms -s $PROTEIN_final.tpr -f $PROTEIN_prod.xtc -o analysis/$PROTEIN_rmsd.xvg -tu ns

# 2. RMSF analysis
echo "Calculating RMSF..."
echo "Protein" | gmx rmsf -s $PROTEIN_final.tpr -f $PROTEIN_prod.xtc -o analysis/$PROTEIN_rmsf.xvg -res

# 3. Radius of gyration
echo "Calculating radius of gyration..."
echo "Protein" | gmx gyrate -s $PROTEIN_final.tpr -f $PROTEIN_prod.xtc -o analysis/$PROTEIN_gyrate.xvg

# 4. Hydrogen bonds
echo "Analyzing hydrogen bonds..."
echo "Protein" | gmx hbond -s $PROTEIN_final.tpr -f $PROTEIN_prod.xtc -num analysis/$PROTEIN_hbonds.xvg

# 5. Energy analysis
echo "Analyzing energies..."
gmx energy -f $PROTEIN_prod.edr -o analysis/$PROTEIN_energy.xvg

# 6. Generate plots
echo "Generating analysis plots..."
python3 plot_analysis.py $PROTEIN

echo "Analysis completed! Results saved in analysis/ directory"
"""

# Initialize the MD simulation generator
md_generator = MDSimulationGenerator()

@app.route('/api/fetch-pdb', methods=['POST'])
def fetch_pdb():
    """Fetch PDB structure from RCSB"""
    try:
        print("DEBUG: fetch-pdb endpoint called")
        data = request.get_json()
        pdb_id = data.get('pdb_id', '').upper()
        print(f"DEBUG: pdb_id = {pdb_id}")
        
        if not pdb_id or len(pdb_id) != 4:
            return jsonify({'error': 'Invalid PDB ID'}), 400
        
        # Clean and create new output folder for fresh start
        print("DEBUG: Calling clean_and_create_output_folder()")
        if not clean_and_create_output_folder():
            return jsonify({'error': 'Failed to clean output folder'}), 500
        print("DEBUG: Output folder cleanup completed successfully")
        
        # Fetch PDB structure
        pdb_file = md_generator.fetch_pdb_structure(pdb_id)
        
        # Parse structure information
        structure_info = md_generator.parse_pdb_structure(pdb_file)
        
        return jsonify({
            'success': True,
            'structure_info': structure_info,
            'pdb_file': pdb_file
        })
    
    except Exception as e:
        logger.error(f"Error fetching PDB: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/proxy-pdb/<pdb_id>', methods=['GET'])
def proxy_pdb(pdb_id):
    """Proxy endpoint to fetch PDB from RCSB or mirrors (avoids CORS issues)"""
    try:
        pdb_id = pdb_id.upper().strip()
        if not pdb_id or len(pdb_id) != 4:
            return jsonify({'error': 'Invalid PDB ID'}), 400
        
        # Try multiple sources in order of preference
        urls = [
            f"https://files.rcsb.org/download/{pdb_id}.pdb",  # Primary RCSB
            f"https://www.ebi.ac.uk/pdbe/entry-files/download/pdb{pdb_id.lower()}.ent",  # PDBe (European mirror)
        ]
        
        for url in urls:
            try:
                print(f"DEBUG: Trying to fetch PDB from {url}")
                response = requests.get(url, timeout=30)
                if response.status_code == 200:
                    content = response.text
                    # Validate it looks like a PDB file
                    if 'ATOM' in content or 'HETATM' in content:
                        print(f"DEBUG: Successfully fetched PDB from {url}")
                        return Response(content, mimetype='text/plain')
            except requests.exceptions.RequestException as e:
                print(f"DEBUG: Failed to fetch from {url}: {e}")
                continue
        
        return jsonify({'error': f'PDB ID {pdb_id} not found or servers unavailable'}), 404
    except Exception as e:
        logger.error(f"Error proxying PDB {pdb_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/get-pdb-content', methods=['GET'])
def get_pdb_content():
    """Return the content of a PDB file"""
    try:
        file_path = request.args.get('file', '')
        if not file_path:
            return jsonify({'success': False, 'error': 'No file path provided'}), 400
        
        # Security check: ensure the file is within the output directory
        file_path = Path(file_path)
        if not str(file_path.resolve()).startswith(str(get_output_dir().resolve())):
            return jsonify({'success': False, 'error': 'Invalid file path'}), 400
        
        if not file_path.exists():
            return jsonify({'success': False, 'error': 'File not found'}), 404
        
        content = file_path.read_text()
        return jsonify({'success': True, 'content': content})
    except Exception as e:
        logger.error(f"Error reading PDB content: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/parse-pdb', methods=['POST'])
def parse_pdb():
    """Parse uploaded PDB file"""
    try:
        print("DEBUG: parse-pdb endpoint called")
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        print(f"DEBUG: Processing uploaded file: {file.filename}")
        
        # Clean and create new output folder for fresh start
        print("DEBUG: Calling clean_and_create_output_folder()")
        if not clean_and_create_output_folder():
            return jsonify({'error': 'Failed to clean output folder'}), 500
        print("DEBUG: Output folder cleanup completed successfully")
        
        # Save uploaded file temporarily
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.pdb')
        file.save(temp_file.name)
        
        # Parse structure information
        structure_info = md_generator.parse_pdb_structure(temp_file.name)
        
        # Clean up temporary file
        os.unlink(temp_file.name)
        
        return jsonify({
            'success': True,
            'structure_info': structure_info
        })
    
    except Exception as e:
        logger.error(f"Error parsing PDB: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate-files', methods=['POST'])
def generate_files():
    """Generate MD simulation files"""
    try:
        data = request.get_json()
        protein_name = data.get('protein_name', 'protein')
        simulation_params = data.get('simulation_params', {})
        
        # Generate all files
        files = {}
        
        # MDP files
        files[f'{protein_name}.mdp'] = md_generator.generate_mdp_file(simulation_params, 'production')
        files[f'{protein_name}_restrained.mdp'] = md_generator.generate_mdp_file(simulation_params, 'restrained_min')
        files[f'{protein_name}_min.mdp'] = md_generator.generate_mdp_file(simulation_params, 'minimization')
        files[f'{protein_name}_nvt.mdp'] = md_generator.generate_mdp_file(simulation_params, 'nvt')
        files[f'{protein_name}_npt.mdp'] = md_generator.generate_mdp_file(simulation_params, 'npt')
        files[f'{protein_name}_prod.mdp'] = md_generator.generate_mdp_file(simulation_params, 'production')
        
        # Scripts
        files[f'{protein_name}_simulation.pbs'] = md_generator.generate_pbs_script(protein_name, simulation_params)
        files[f'setup_{protein_name}.sh'] = md_generator.generate_setup_script(protein_name, simulation_params)
        files[f'analyze_{protein_name}.sh'] = md_generator.generate_analysis_script(protein_name)
        
        return jsonify({
            'success': True,
            'files': files
        })
    
    except Exception as e:
        logger.error(f"Error generating files: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/download-zip', methods=['POST'])
def download_zip():
    """Download all generated files as a ZIP archive"""
    try:
        data = request.get_json()
        files = data.get('files', {})
        
        # Create temporary ZIP file
        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        
        with zipfile.ZipFile(temp_zip.name, 'w') as zip_file:
            for filename, content in files.items():
                zip_file.writestr(filename, content)
        
        return send_file(
            temp_zip.name,
            as_attachment=True,
            download_name='md_simulation_files.zip',
            mimetype='application/zip'
        )
    
    except Exception as e:
        logger.error(f"Error creating ZIP file: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/get-solvated-protein', methods=['GET'])
def get_solvated_protein():
    """Get the solvated protein PDB file content"""
    try:
        solvated_file = os.path.join(get_output_dir(), 'protein_solvated.pdb')
        
        if not os.path.exists(solvated_file):
            return jsonify({'success': False, 'error': 'Solvated protein file not found. Please generate files first.'})
        
        with open(solvated_file, 'r') as f:
            content = f.read()
        
        return jsonify({'success': True, 'content': content})
    except Exception as e:
        logger.error(f"Error reading solvated protein file: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/get-viewer-pdb', methods=['GET'])
def get_viewer_pdb():
    """Return a single PDB for viewer: start from protein_solvated.pdb and mark ligand residues as HETATM.
    Ligand residues are detected from 4_ligands_corrected*.pdb files by (resname, chain, resi) tuples; if chains/resi not present, fallback to resname matching.
    """
    try:
        solvated_path = get_output_dir() / 'protein_solvated.pdb'
        # Find all corrected ligand files (support multiple ligands)
        # Exclude OpenBabel output files (4_ligands_corrected_obabel_*.pdb)
        lig_paths = sorted([f for f in get_output_dir().glob('4_ligands_corrected_*.pdb') if "_obabel_" not in f.name])
        # Fallback to single file for backward compatibility
        if not lig_paths:
            single_lig_path = get_output_dir() / '4_ligands_corrected.pdb'
            if single_lig_path.exists():
                lig_paths = [single_lig_path]
        viewer_out = get_output_dir() / 'viewer_protein_with_ligand.pdb'

        if not solvated_path.exists():
            return jsonify({'success': False, 'error': 'protein_solvated.pdb not found'}), 400

        # Build ligand index from all corrected ligand PDB files if present
        ligand_keys = set()
        ligand_resnames = set()
        for lig_path in lig_paths:
            if lig_path.exists():
                with open(lig_path, 'r') as lf:
                    for line in lf:
                        if line.startswith(('ATOM', 'HETATM')):
                            resn = line[17:20].strip()
                            chain = line[21:22].strip()
                            resi = line[22:26].strip()
                            ligand_resnames.add(resn)
                            if chain and resi:
                                ligand_keys.add((resn, chain, resi))

        # Rewrite solvated file marking matching ligand residues and ions (NA/CL) as HETATM
        out_lines = []
        with open(solvated_path, 'r') as sf:
            for line in sf:
                if line.startswith(('ATOM', 'HETATM')):
                    resn = line[17:20].strip()
                    chain = line[21:22].strip()
                    resi = line[22:26].strip()
                    is_match = False
                    is_ion = resn in { 'NA', 'CL' }
                    if (resn, chain, resi) in ligand_keys:
                        is_match = True
                    elif resn in ligand_resnames:
                        # Fallback by residue name only
                        is_match = True
                    if is_match or is_ion:
                        # Force to HETATM
                        out_lines.append('HETATM' + line[6:])
                    else:
                        out_lines.append(line)
                else:
                    out_lines.append(line)

        # Save combined viewer file (optional but useful for debugging)
        try:
            with open(viewer_out, 'w') as vf:
                vf.writelines(out_lines)
        except Exception:
            pass

        return jsonify({'success': True, 'content': ''.join(out_lines)})
    except Exception as e:
        logger.error(f"Error generating viewer PDB: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/view-pdb')
def view_pdb_html():
    """Serve PDB file as HTML page for instant viewing"""
    try:
        viewer_out = get_output_dir() / 'viewer_protein_with_ligand.pdb'
        solvated_path = get_output_dir() / 'protein_solvated.pdb'
        # Find all corrected ligand files (support multiple ligands)
        # Exclude OpenBabel output files (4_ligands_corrected_obabel_*.pdb)
        lig_paths = sorted([f for f in get_output_dir().glob('4_ligands_corrected_*.pdb') if "_obabel_" not in f.name])
        # Fallback to single file for backward compatibility
        if not lig_paths:
            single_lig_path = get_output_dir() / '4_ligands_corrected.pdb'
            if single_lig_path.exists():
                lig_paths = [single_lig_path]
        
        # If viewer file doesn't exist, generate it first
        if not viewer_out.exists():
            if not solvated_path.exists():
                return f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Error - PDB Not Found</title>
                    <style>
                        body {{ font-family: Arial, sans-serif; padding: 40px; text-align: center; }}
                        .error {{ color: #dc3545; font-size: 18px; }}
                    </style>
                </head>
                <body>
                    <div class="error">
                        <h1>PDB File Not Found</h1>
                        <p>Please complete the structure preparation steps first.</p>
                    </div>
                </body>
                </html>
                """, 404
            
            # Generate the file directly (same logic as get_viewer_pdb but without JSON response)
            try:
                # Build ligand index from all corrected ligand PDB files if present
                ligand_keys = set()
                ligand_resnames = set()
                for lig_path in lig_paths:
                    if lig_path.exists():
                        with open(lig_path, 'r') as lf:
                            for line in lf:
                                if line.startswith(('ATOM', 'HETATM')):
                                    resn = line[17:20].strip()
                                    chain = line[21:22].strip()
                                    resi = line[22:26].strip()
                                    ligand_resnames.add(resn)
                                    if chain and resi:
                                        ligand_keys.add((resn, chain, resi))

                # Rewrite solvated file marking matching ligand residues and ions (NA/CL) as HETATM
                out_lines = []
                with open(solvated_path, 'r') as sf:
                    for line in sf:
                        if line.startswith(('ATOM', 'HETATM')):
                            resn = line[17:20].strip()
                            chain = line[21:22].strip()
                            resi = line[22:26].strip()
                            is_match = False
                            is_ion = resn in { 'NA', 'CL' }
                            if (resn, chain, resi) in ligand_keys:
                                is_match = True
                            elif resn in ligand_resnames:
                                # Fallback by residue name only
                                is_match = True
                            if is_match or is_ion:
                                # Force to HETATM
                                out_lines.append('HETATM' + line[6:])
                            else:
                                out_lines.append(line)
                        else:
                            out_lines.append(line)

                # Save combined viewer file
                with open(viewer_out, 'w') as vf:
                    vf.writelines(out_lines)
            except Exception as e:
                logger.error(f"Error generating viewer PDB: {str(e)}")
                return f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Error</title>
                    <style>
                        body {{ font-family: Arial, sans-serif; padding: 40px; text-align: center; }}
                        .error {{ color: #dc3545; font-size: 18px; }}
                    </style>
                </head>
                <body>
                    <div class="error">
                        <h1>Error Generating PDB</h1>
                        <p>Could not generate viewer PDB file: {html.escape(str(e))}</p>
                    </div>
                </body>
                </html>
                """, 500
        
        # Read PDB content
        with open(viewer_out, 'r') as f:
            pdb_content = f.read()
        
        # Escape HTML special characters
        escaped_content = html.escape(pdb_content)
        
        # Create HTML page
        html_page = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Viewer PDB File</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            background: #f8f9fa;
            padding: 20px;
        }}
        .header {{
            background: white;
            padding: 15px 20px;
            margin-bottom: 15px;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .header h1 {{
            font-size: 18px;
            color: #333;
        }}
        .pdb-content {{
            background: white;
            padding: 20px;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow-x: auto;
            white-space: pre;
            word-wrap: normal;
        }}
        .info {{
            color: #666;
            font-size: 11px;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>📄 Viewer PDB File</h1>
        <div class="info">File: viewer_protein_with_ligand.pdb</div>
    </div>
    <div class="pdb-content">{escaped_content}</div>
</body>
</html>"""
        
        return html_page, 200, {'Content-Type': 'text/html; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error serving PDB as HTML: {str(e)}")
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Error</title>
            <style>
                body {{ font-family: Arial, sans-serif; padding: 40px; text-align: center; }}
                .error {{ color: #dc3545; font-size: 18px; }}
            </style>
        </head>
        <body>
            <div class="error">
                <h1>Error Loading PDB</h1>
                <p>{html.escape(str(e))}</p>
            </div>
        </body>
        </html>
        """, 500

@app.route('/api/get-corrected-ligands', methods=['GET'])
def get_corrected_ligands():
    """Get the corrected ligand PDB file content if present (combines all ligands)"""
    try:
        # Find all corrected ligand files (support multiple ligands)
        # Exclude OpenBabel output files (4_ligands_corrected_obabel_*.pdb)
        ligand_files = sorted([f for f in get_output_dir().glob('4_ligands_corrected_*.pdb') if "_obabel_" not in f.name])
        # Fallback to single file for backward compatibility
        if not ligand_files:
            single_lig_file = get_output_dir() / '4_ligands_corrected.pdb'
            if single_lig_file.exists():
                ligand_files = [single_lig_file]
        
        if not ligand_files:
            # Return success with exists flag false so frontend can decide gracefully
            return jsonify({'success': True, 'exists': False, 'content': ''})
        
        # Read and normalize records to HETATM for viewer compatibility, combine all ligands
        normalized_lines = []
        for ligand_file in ligand_files:
            with open(ligand_file, 'r') as f:
                for line in f:
                    if line.startswith('ATOM'):
                        # Replace record name to HETATM, preserve fixed-width columns
                        normalized_lines.append('HETATM' + line[6:])
                    elif line.startswith('HETATM'):
                        normalized_lines.append(line)
                    elif line.strip() == 'END' and ligand_file != ligand_files[-1]:
                        # Skip END for intermediate ligands, keep only for last
                        continue
                    elif line.strip() and not line.startswith(('CRYST', 'REMARK', 'HEADER')):
                        normalized_lines.append(line)
        
        # Ensure we have an END at the end
        if normalized_lines and not normalized_lines[-1].strip() == 'END':
            normalized_lines.append('END\n')
        
        content = ''.join(normalized_lines)
        return jsonify({'success': True, 'exists': True, 'content': content})
    except Exception as e:
        logger.error(f"Error reading corrected ligand file: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/get-aligned-ligands', methods=['GET'])
def get_aligned_ligands():
    """Return ligand coordinates aligned to protein_solvated.pdb frame using PyMOL transforms."""
    try:
        solvated_file = get_output_dir() / 'protein_solvated.pdb'
        tleap_ready = get_output_dir() / 'tleap_ready.pdb'
        # Find all corrected ligand files (support multiple ligands)
        # Exclude OpenBabel output files (4_ligands_corrected_obabel_*.pdb)
        ligand_files = sorted([f for f in get_output_dir().glob('4_ligands_corrected_*.pdb') if "_obabel_" not in f.name])
        # Fallback to single file for backward compatibility
        if not ligand_files:
            single_lig_file = get_output_dir() / '4_ligands_corrected.pdb'
            if single_lig_file.exists():
                ligand_files = [single_lig_file]

        if not solvated_file.exists():
            return jsonify({'success': False, 'error': 'protein_solvated.pdb not found'}), 400
        if not tleap_ready.exists():
            return jsonify({'success': False, 'error': 'tleap_ready.pdb not found'}), 400
        if not ligand_files:
            return jsonify({'success': True, 'exists': False, 'content': ''})
        
        # Use first ligand file for PyMOL alignment (or combine them if needed)
        ligand_file = ligand_files[0]

        # Create temp output path
        aligned_lig = get_output_dir() / 'ligand_aligned_for_preview.pdb'
        try:
            if aligned_lig.exists():
                aligned_lig.unlink()
        except Exception:
            pass

        # PyMOL script: load solvated, load tlready (protein+lig), align tlready protein to solvated protein, then save transformed ligand
        pymol_script = f"""
import pymol
pymol.finish_launching(['pymol','-qc'])
from pymol import cmd
cmd.load('{solvated_file.as_posix()}', 'solv')
cmd.load('{tleap_ready.as_posix()}', 'prep')
cmd.load('{ligand_file.as_posix()}', 'lig')
# Align prepared protein to solvated protein; use CA atoms to be robust
cmd.align('prep and polymer.protein and name CA', 'solv and polymer.protein and name CA')
# Apply same transform implicitly affects 'prep' object; we saved ligand as separate object, so match matrices
mat = cmd.get_object_matrix('prep')
cmd.set_object_matrix('lig', mat)
# Save ligand in aligned frame, as HETATM
cmd.alter('lig', 'type="HETATM"')
cmd.save('{aligned_lig.as_posix()}', 'lig')
cmd.quit()
"""

        # Run PyMOL inline
        result = subprocess.run(['python3', '-c', pymol_script], capture_output=True, text=True, cwd=str(get_output_dir()))
        if result.returncode != 0:
            return jsonify({'success': False, 'error': f'PyMOL alignment failed: {result.stderr}'}), 500

        if not aligned_lig.exists():
            return jsonify({'success': False, 'error': 'Aligned ligand file was not produced'}), 500

        # Read and return content
        normalized_lines = []
        with open(aligned_lig, 'r') as f:
            for line in f:
                if line.startswith('ATOM'):
                    normalized_lines.append('HETATM' + line[6:])
                else:
                    normalized_lines.append(line)
        content = ''.join(normalized_lines)
        return jsonify({'success': True, 'exists': True, 'content': content})
    except Exception as e:
        logger.error(f"Error aligning ligands: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/viewer/<filename>')
def viewer(filename):
    """Serve NGL viewer page (uses session_id from query or X-Session-Id so each user sees their file)."""
    out_dir = get_output_dir()
    session_id = g.get("session_id", "default")
    file_path = out_dir / filename
    if not file_path.exists():
        if filename == 'viewer_protein_with_ligand.pdb':
            try:
                result = get_viewer_pdb()
                if result[1] == 200:
                    pass
            except Exception:
                pass
    # Use session in URL so NGL loadFile requests hit the right output folder
    output_url_prefix = f"/output/{session_id}"
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>NGL Viewer - {filename}</title>
        <script src="https://cdn.jsdelivr.net/npm/ngl@2.0.0-dev.37/dist/ngl.js"></script>
        <style>
            body {{ margin: 0; padding: 0; font-family: Arial, sans-serif; }}
            #viewport {{ width: 100%; height: 100vh; }}
            .header {{ background: #f8f9fa; padding: 10px; border-bottom: 1px solid #ddd; }}
            .controls {{ padding: 10px; background: #f8f9fa; }}
            .btn {{ padding: 8px 16px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; }}
            .btn-primary {{ background: #007bff; color: white; }}
            .btn-secondary {{ background: #6c757d; color: white; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h3>🧬 3D Structure Viewer - {filename}</h3>
        </div>
        <div id="viewport"></div>
        <div class="controls">
            <button class="btn btn-primary" onclick="resetView()">Reset View</button>
            <button class="btn btn-secondary" onclick="toggleRepresentation()">Toggle Style</button>
            <button class="btn btn-secondary" onclick="toggleSpin()">Toggle Spin</button>
        </div>
        <script>
            let stage;
            let currentRepresentation = 'cartoon';
            let isSpinning = false;

            async function initViewer() {{
                try {{
                    const outputUrl = "{output_url_prefix}/{filename}";
                    const response = await fetch(outputUrl);
                    if (!response.ok) {{
                        throw new Error(`File not found: ${{response.status}} ${{response.statusText}}`);
                    }}
                    
                    stage = new NGL.Stage("viewport", {{ backgroundColor: "white" }});
                    
                    const component = await stage.loadFile(outputUrl);
                    
                    // Add cartoon representation for protein
                    component.addRepresentation("cartoon", {{
                        sele: "protein",
                        colorScheme: "chainname",
                        opacity: 0.9
                    }});

                    // Add ball and stick for water molecules
                    component.addRepresentation("ball+stick", {{
                        sele: "water",
                        color: "cyan",
                        colorScheme: "uniform",
                        radius: 0.1
                    }});

                    // Add ball and stick for ligands
                    component.addRepresentation("ball+stick", {{
                        sele: "hetero",
                        color: "element",
                        radius: 0.15
                    }});

                    stage.autoView();
                }} catch (error) {{
                    console.error('Error loading structure:', error);
                    document.getElementById('viewport').innerHTML = 
                        '<div style="padding: 50px; text-align: center; color: #dc3545;">' +
                        '<h3>Error loading structure</h3><p>' + error.message + '</p>' +
                        '<p>Make sure the file exists in the output directory.</p></div>';
                }}
            }}

            function resetView() {{
                if (stage) stage.autoView();
            }}

            function toggleRepresentation() {{
                if (!stage) return;
                const components = stage.compList;
                if (components.length === 0) return;

                const component = components[0];
                component.removeAllRepresentations();

                if (currentRepresentation === 'cartoon') {{
                    component.addRepresentation("ball+stick", {{
                        color: "element",
                        radius: 0.15
                    }});
                    currentRepresentation = 'ball+stick';
                }} else {{
                    component.addRepresentation("cartoon", {{
                        sele: "protein",
                        colorScheme: "chainname",
                        opacity: 0.9
                    }});
                    component.addRepresentation("ball+stick", {{
                        sele: "water",
                        color: "cyan",
                        colorScheme: "uniform",
                        radius: 0.1
                    }});
                    component.addRepresentation("ball+stick", {{
                        sele: "hetero",
                        color: "element",
                        radius: 0.15
                    }});
                    currentRepresentation = 'cartoon';
                }}
            }}

            function toggleSpin() {{
                if (!stage) return;
                isSpinning = !isSpinning;
                stage.setSpin(isSpinning);
            }}

            // Initialize when page loads
            document.addEventListener('DOMContentLoaded', initViewer);
        </script>
    </body>
    </html>
    """

@app.route('/output/<path:filepath>')
def serve_output(filepath):
    """Serve output files. URL can be session_id/filename (multi-user) or just filename (legacy)."""
    parts = filepath.split("/", 1)
    if len(parts) == 2 and _SESSION_ID_RE.match(parts[0]):
        session_id, filename = parts[0], parts[1]
        out_dir = OUTPUT_BASE / session_id
    else:
        out_dir = get_output_dir()
        filename = filepath
    if not out_dir.exists() or not (out_dir / filename).exists():
        abort(404)
    return send_from_directory(out_dir, filename)

@app.route('/')
def index():
    """Serve the main HTML page"""
    return render_template('index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files (CSS, JS, etc.)"""
    return send_from_directory(str(_BASE), filename)

@app.route('/api/prepare-structure', methods=['POST'])
def prepare_structure_endpoint():
    """Prepare protein structure for AMBER"""
    try:
        data = request.get_json()
        pdb_content = data.get('pdb_content', '')
        options = data.get('options', {})
        
        # Check if user wants to use completed structure (ESMFold)
        flag_file = get_output_dir() / ".use_completed_structure"
        complete_structure_path = get_output_dir() / "0_complete_structure.pdb"
        
        if flag_file.exists() and complete_structure_path.exists():
            logger.info("Using superimposed completed structure (0_complete_structure.pdb) for preparation so ligands stay in the same coordinate frame")
            with open(complete_structure_path, 'r') as f:
                pdb_content = f.read()
        elif not pdb_content:
            return jsonify({'error': 'No PDB content provided and no completed structure found'}), 400
        
        # Prepare structure (use get_output_dir() so paths match app's output folder)
        result = prepare_structure(pdb_content, options, output_dir=str(get_output_dir()))
        
        # Check if prepare_structure returned an error
        if result.get('error'):
            logger.error(f"Structure preparation failed: {result['error']}")
            return jsonify({'error': result['error']}), 400
        
        # Validate and sanitize ligand names early (after structure preparation)
        # This ensures numeric ligand names are converted to 3-letter codes
        ligand_name_changes = validate_and_sanitize_all_ligand_files()
        
        # Build response
        response_data = {
            'success': True,
            'prepared_structure': result['prepared_structure'],
            'original_atoms': result['original_atoms'],
            'prepared_atoms': result['prepared_atoms'],
            'removed_components': result['removed_components'],
            'added_capping': result['added_capping'],
            'preserved_ligands': result['preserved_ligands'],
            'ligand_present': result.get('ligand_present', False),
            'separate_ligands': result.get('separate_ligands', False),
            'ligand_content': result.get('ligand_content', ''),
            'ligand_name_changes': ligand_name_changes  # List of (old_name, new_name, filename) tuples
        }
        
        return jsonify(response_data)
    
    except Exception as e:
        logger.error(f"Error preparing structure: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/parse-structure', methods=['POST'])
def parse_structure_endpoint():
    """Parse structure information"""
    try:
        data = request.get_json()
        pdb_content = data.get('pdb_content', '')
        
        if not pdb_content:
            return jsonify({'error': 'No PDB content provided'}), 400
        
        # Parse structure
        structure_info = parse_structure_info(pdb_content)
        
        return jsonify({
            'success': True,
            'structure_info': structure_info
        })
    
    except Exception as e:
        logger.error(f"Error parsing structure: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/docking/run', methods=['POST'])
@stream_with_context
def run_docking():
    """
    Run ligand docking for preserved ligands using Vina and Meeko with streaming logs.
    All outputs are stored under get_output_dir()/docking.
    Returns a summary of ligands and available poses (file-based, no contents).
    """
    def generate():
        try:
            docking_dir = _ensure_docking_folder()
            yield _format_log(f"Working directory: {os.getcwd()}")
            yield _format_log(f"Output directory: {get_output_dir()}")
            yield _format_log(f"Docking directory: {docking_dir}")
            
            # Check if using ESMFold-completed structure
            flag_file = get_output_dir() / ".use_completed_structure"
            complete_structure_path = get_output_dir() / "0_complete_structure.pdb"
            if flag_file.exists() and complete_structure_path.exists():
                yield _format_log("ℹ️ Using ESMFold-completed structure for receptor")
                yield _format_log("   (Completed chains from ESMFold + original chains not selected for completion)")
            
            yield _format_log("Preparing receptor for docking...")
            receptor_fixed, receptor_pdbqt = _prepare_receptor_for_docking()
            yield _format_log(f"✅ Receptor prepared: {receptor_pdbqt.name}")

            # Optional per-ligand configuration from frontend
            data = request.get_json(silent=True) or {}
            cfg_list = data.get("ligands", [])
            ligand_configs = {}
            for cfg in cfg_list:
                try:
                    idx = int(cfg.get("index", 0))
                    if idx > 0:
                        ligand_configs[idx] = cfg
                except Exception:
                    continue

            # Find all individual ligand files (use obabel versions for better PDB->SDF conversion)
            ligand_files = sorted(get_output_dir().glob("4_ligands_corrected_obabel_*.pdb"))
            if not ligand_files:
                # Fallback to non-obabel files if obabel files don't exist
                ligand_files = sorted(
                    [f for f in get_output_dir().glob("4_ligands_corrected_*.pdb") if "_obabel_" not in f.name]
                )
            if not ligand_files:
                error_msg = 'No corrected ligand PDB files found. Please run structure preparation with preserved ligands.'
                yield _format_log(error_msg, 'error')
                yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': error_msg})}\n\n"
                return

            yield _format_log(f"Found {len(ligand_files)} ligand file(s) to process")
            yield _format_log(f"Selected {len(ligand_configs)} ligand(s) for docking")

            ligands_summary = []
            warnings = []
            errors = []

            for idx, lig_pdb in enumerate(ligand_files, start=1):
                # Only dock ligands that are explicitly enabled in the config
                # If no config exists for this ligand, skip it (user didn't select it)
                cfg = ligand_configs.get(idx)
                if cfg is None:
                    # No config sent = ligand was not selected for docking
                    continue
                if cfg.get("enabled") is False:
                    # Explicitly disabled
                    continue

                yield _format_log(f"\n{'='*60}")
                yield _format_log(f"Processing ligand {idx} ({lig_pdb.name})")
                yield _format_log(f"{'='*60}")

                lig_dir = docking_dir / f"ligand_{idx}"
                lig_dir.mkdir(parents=True, exist_ok=True)

                # Copy original corrected ligand for reference
                original_copy = lig_dir / "original_ligand.pdb"
                if not original_copy.exists():
                    original_copy.write_text(lig_pdb.read_text())

                try:
                    # Step 1: obabel to SDF
                    yield _format_log(f"Step 1: Converting ligand {idx} from PDB to SDF using OpenBabel...")
                    sdf_path = lig_dir / f"ligand_{idx}.sdf"
                    cmd = [
                        "obabel",
                        "-i",
                        "pdb",
                        str(lig_pdb),
                        "-o",
                        "sdf",
                        "-O",
                        str(sdf_path),
                    ]
                    yield _format_log(f"Running command: {' '.join(cmd)}")
                    
                    # Stream obabel output
                    process = subprocess.Popen(
                        cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        bufsize=1,
                        universal_newlines=True
                    )
                    
                    for line in iter(process.stdout.readline, ''):
                        if line:
                            yield _format_log(line.strip())
                    
                    process.wait()
                    if process.returncode != 0 or not sdf_path.exists():
                        raise RuntimeError(
                            f"OpenBabel failed for ligand {idx} ({lig_pdb.name}). Return code: {process.returncode}"
                        )
                    yield _format_log(f"✅ OpenBabel conversion successful: {sdf_path.name}")

                    # Step 2: Meeko ligand preparation -> PDBQT
                    yield _format_log(f"Step 2: Preparing ligand {idx} with Meeko...")
                    lig_pdbqt = lig_dir / f"ligand_{idx}.pdbqt"
                    cmd = [
                        "mk_prepare_ligand.py",
                        "-i",
                        str(sdf_path),
                        "-o",
                        str(lig_pdbqt),
                    ]
                    yield _format_log(f"Running command: {' '.join(cmd)}")
                    
                    result = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                    )
                    
                    if result.stdout:
                        yield _format_log(result.stdout.strip())
                    if result.stderr:
                        yield _format_log(result.stderr.strip(), 'warning')
                    
                    if result.returncode != 0 or not lig_pdbqt.exists():
                        raise RuntimeError(
                            f"Meeko failed for ligand {idx}.\n"
                            f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
                        )
                    yield _format_log(f"✅ Meeko preparation successful: {lig_pdbqt.name}")

                    # Step 3: Read docking parameters from config file or use provided values
                    yield _format_log(f"Step 3: Reading docking parameters for ligand {idx}...")
                    
                    config_file = lig_dir / "vina_config.txt"
                    config = _parse_vina_config(config_file) if config_file.exists() else None
                    
                    # Initialize defaults
                    exhaustiveness = 8
                    num_modes = 9
                    energy_range = 3
                    cpu = 0
                    seed = 0
                    
                    # Priority: config file > user-provided > computed
                    if config:
                        yield _format_log(f"Reading parameters from config file: {config_file.name}")
                        cx = config.get("center_x", None)
                        cy = config.get("center_y", None)
                        cz = config.get("center_z", None)
                        sx = config.get("size_x", 18.0)
                        sy = config.get("size_y", 18.0)
                        sz = config.get("size_z", 18.0)
                        exhaustiveness = config.get("exhaustiveness", 8)
                        num_modes = config.get("num_modes", 9)
                        energy_range = config.get("energy_range", 3)
                        cpu = config.get("cpu", 0)
                        seed = config.get("seed", 0)
                    else:
                        # Fallback to user-provided or computed
                        user_center = (cfg or {}).get("center", {}) if cfg else {}
                        if (
                            isinstance(user_center, dict)
                            and all(k in user_center for k in ("x", "y", "z"))
                        ):
                            try:
                                cx = float(user_center.get("x"))
                                cy = float(user_center.get("y"))
                                cz = float(user_center.get("z"))
                                yield _format_log(f"Using user-provided center: ({cx:.2f}, {cy:.2f}, {cz:.2f})")
                            except Exception:
                                cx, cy, cz = _compute_ligand_center(lig_pdb)
                                yield _format_log(f"Computed center: ({cx:.2f}, {cy:.2f}, {cz:.2f})")
                        else:
                            cx, cy, cz = _compute_ligand_center(lig_pdb)
                            yield _format_log(f"Computed center: ({cx:.2f}, {cy:.2f}, {cz:.2f})")
                        
                        user_size = (cfg or {}).get("size", {}) if cfg else {}
                        try:
                            sx = float(user_size.get("x", 18.0))
                            sy = float(user_size.get("y", 18.0))
                            sz = float(user_size.get("z", 18.0))
                        except Exception:
                            sx = sy = sz = 18.0
                    
                    # If center not in config, compute it
                    if cx is None or cy is None or cz is None:
                        cx, cy, cz = _compute_ligand_center(lig_pdb)
                        yield _format_log(f"Computed center: ({cx:.2f}, {cy:.2f}, {cz:.2f})")
                    
                    yield _format_log(f"Box center: ({cx:.2f}, {cy:.2f}, {cz:.2f}) Å")
                    yield _format_log(f"Box size: ({sx:.2f}, {sy:.2f}, {sz:.2f}) Å")
                    yield _format_log(f"Exhaustiveness: {exhaustiveness}, Num modes: {num_modes}, Energy range: {energy_range} kcal/mol")

                    # Step 4: Run Vina docking
                    yield _format_log(f"Step 4: Running AutoDock Vina docking for ligand {idx}...")
                    docked_pdbqt = lig_dir / f"ligand_{idx}_docked.pdbqt"
                    log_file = lig_dir / f"ligand_{idx}_docked.log"
                    cmd = [
                        "vina",
                        "--receptor",
                        str(receptor_pdbqt),
                        "--ligand",
                        str(lig_pdbqt),
                        "--center_x",
                        str(cx),
                        "--center_y",
                        str(cy),
                        "--center_z",
                        str(cz),
                        "--size_x",
                        str(sx),
                        "--size_y",
                        str(sy),
                        "--size_z",
                        str(sz),
                        "--exhaustiveness",
                        str(exhaustiveness),
                        "--num_modes",
                        str(num_modes),
                        "--energy_range",
                        str(energy_range),
                        "--out",
                        str(docked_pdbqt),
                        "--log",
                        str(log_file),
                    ]
                    if cpu > 0:
                        cmd.extend(["--cpu", str(cpu)])
                    if seed > 0:
                        cmd.extend(["--seed", str(seed)])
                    yield _format_log(f"Running command: {' '.join(cmd)}")
                    
                    # Stream Vina output
                    process = subprocess.Popen(
                        cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        bufsize=1,
                        universal_newlines=True
                    )
                    
                    for line in iter(process.stdout.readline, ''):
                        if line:
                            yield _format_log(line.strip())
                    
                    process.wait()
                    if process.returncode != 0 or not docked_pdbqt.exists():
                        raise RuntimeError(
                            f"Vina failed for ligand {idx}. Return code: {process.returncode}"
                        )
                    yield _format_log(f"✅ Vina docking completed: {docked_pdbqt.name}")

                    # Step 6: Split poses
                    yield _format_log(f"Step 5: Splitting docking poses for ligand {idx}...")
                    cmd = [
                        "vina_split",
                        "--input",
                        str(docked_pdbqt),
                        "--ligand",
                        f"ligand_{idx}_mode",
                    ]
                    yield _format_log(f"Running command: {' '.join(cmd)}")
                    
                    result = subprocess.run(
                        cmd,
                        cwd=lig_dir,
                        capture_output=True,
                        text=True,
                    )
                    
                    if result.stdout:
                        yield _format_log(result.stdout.strip())
                    if result.stderr:
                        yield _format_log(result.stderr.strip(), 'warning')
                    
                    if result.returncode != 0:
                        warnings.append(
                            f"vina_split reported issues for ligand {idx}: {result.stderr.strip()}"
                        )
                        yield _format_log(f"⚠️ Warning: vina_split issues for ligand {idx}", 'warning')
                    else:
                        yield _format_log(f"✅ Poses split successfully")

                    # Parse binding energies from Vina log (per mode)
                    mode_energies = _parse_vina_log(log_file)
                    yield _format_log(f"Found {len(mode_energies)} binding mode(s)")

                    # Step 7: Convert each mode back to PDB with OpenBabel
                    yield _format_log(f"Step 6: Converting poses to PDB format...")
                    pose_entries = []
                    mode_pdbqt_files = sorted(lig_dir.glob(f"ligand_{idx}_mode*.pdbqt"))
                    yield _format_log(f"Processing {len(mode_pdbqt_files)} pose(s)...")
                    
                    for mode_pdbqt in mode_pdbqt_files:
                        mode_name = mode_pdbqt.stem  # e.g., ligand_1_mode1
                        mode_index_str = mode_name.replace(f"ligand_{idx}_mode", "")
                        try:
                            mode_index = int(mode_index_str)
                        except ValueError:
                            mode_index = None

                        yield _format_log(f"Processing pose {mode_index} ({mode_name})...")

                        mode_pdb_noH = lig_dir / f"{mode_name}_noH.pdb"
                        mode_pdb_h = lig_dir / f"{mode_name}_h.pdb"
                        sanitized_pdb = lig_dir / f"{mode_name}_sanitized.pdb"
                        
                        # Step 7a: Convert PDBQT to PDB without hydrogens
                        if not mode_pdb_noH.exists():
                            yield _format_log(f"  Converting {mode_pdbqt.name} to PDB (removing hydrogens)...")
                            cmd = [
                                "obabel",
                                "-i", "pdbqt",
                                str(mode_pdbqt),
                                "-o", "pdb",
                                "-O",
                                str(mode_pdb_noH),
                                "-d",  # Delete existing hydrogens
                            ]
                            result = subprocess.run(
                                cmd,
                                capture_output=True,
                                text=True,
                            )
                            if result.returncode != 0 or not mode_pdb_noH.exists():
                                warnings.append(
                                    f"Failed to convert {mode_pdbqt.name} to PDB for ligand {idx}: "
                                    f"{result.stderr.strip()}"
                                )
                                yield _format_log(f"  ⚠️ Failed to convert {mode_pdbqt.name}", 'warning')
                                continue
                            yield _format_log(f"  ✅ Converted to {mode_pdb_noH.name}")
                        
                        # Step 7b: Add hydrogens at pH 7.4 using OpenBabel
                        if not mode_pdb_h.exists():
                            yield _format_log(f"  Adding hydrogens at pH 7.4...")
                            cmd = [
                                "obabel",
                                "-i", "pdb",
                                str(mode_pdb_noH),
                                "-o", "pdb",
                                "-O",
                                str(mode_pdb_h),
                                "-p", "7.4",
                            ]
                            result = subprocess.run(
                                cmd,
                                capture_output=True,
                                text=True,
                            )
                            if result.returncode != 0 or not mode_pdb_h.exists():
                                logger.warning(f"OpenBabel h_add failed for {mode_pdb_noH.name}: {result.stderr}")
                                yield _format_log(f"  ⚠️ Failed to add hydrogens, using noH file", 'warning')
                                # Fallback: use noH file
                                mode_pdb_h.write_text(mode_pdb_noH.read_text())
                            else:
                                yield _format_log(f"  ✅ Hydrogens added: {mode_pdb_h.name}")
                        
                        # Step 7c: Create sanitized PDB with proper formatting for antechamber
                        if not sanitized_pdb.exists():
                            yield _format_log(f"  Sanitizing PDB for Antechamber compatibility...")
                            try:
                                # Get original residue info (BES, chain A, resnum 1611, etc.)
                                original_residue_info = extract_original_residue_info(str(lig_pdb))
                                
                                # Copy the h_add output
                                sanitized_pdb.write_text(mode_pdb_h.read_text())
                                
                                # Sanitize: fix atom names (C1, N1, H1...), residue name, chain, etc.
                                _sanitize_docked_pose_for_antechamber(sanitized_pdb, original_residue_info)
                                yield _format_log(f"  ✅ Sanitized: {sanitized_pdb.name}")
                                
                            except Exception as e:
                                logger.warning(f"Error sanitizing {mode_pdb_h.name}: {e}")
                                yield _format_log(f"  ⚠️ Sanitization error: {e}, using fallback", 'warning')
                                # Fallback: just copy the h_add output
                                if not sanitized_pdb.exists():
                                    sanitized_pdb.write_text(mode_pdb_h.read_text())
                        
                        energy = mode_energies.get(mode_index)
                        if energy:
                            yield _format_log(f"  Binding energy: {energy:.2f} kcal/mol")

                        pose_entries.append(
                            {
                                "mode_index": mode_index,
                                "file": str(mode_pdb_h.relative_to(get_output_dir())),
                                "sanitized_file": str(sanitized_pdb.relative_to(get_output_dir())),
                                "energy": energy,
                            }
                        )

                    yield _format_log(f"✅ Successfully processed ligand {idx} with {len(pose_entries)} pose(s)", 'success')
                    # Extract ligand name (resname) from PDB file
                    resname, chain = _get_ligand_info_from_pdb(lig_pdb)
                    ligands_summary.append(
                        {
                            "index": idx,
                            "name": resname,
                            "chain": chain,
                            "original_file": str(original_copy.relative_to(get_output_dir())),
                            "corrected_file": str(lig_pdb.relative_to(get_output_dir())),
                            "poses": pose_entries,
                        }
                    )
                except Exception as e:
                    error_msg = f"Ligand {idx} ({lig_pdb.name}): {str(e)}"
                    errors.append(error_msg)
                    yield _format_log(f"❌ Error: {error_msg}", 'error')

            # Assign displayLabel to match structure preparation and get-ligand-boxes (GOL-A-1, LIZ-A).
            resname_chain_count = defaultdict(int)
            for lig in ligands_summary:
                resname_chain_count[(lig["name"], lig["chain"])] += 1
            resname_chain_instance = defaultdict(int)
            for lig in ligands_summary:
                key = (lig["name"], lig["chain"])
                resname_chain_instance[key] += 1
                instance = resname_chain_instance[key]
                count = resname_chain_count[key]
                lig["displayLabel"] = f"{lig['name']}-{lig['chain']}-{instance}" if count > 1 else f"{lig['name']}-{lig['chain']}"

            # Validate and sanitize ligand names before returning results
            # This ensures any numeric names are converted early
            validate_and_sanitize_all_ligand_files()
            
            # Send final result
            result_data = {
                'type': 'complete',
                'success': len(errors) == 0,
                'ligands': ligands_summary,
                'warnings': warnings,
                'errors': errors,
            }
            yield f"data: {json.dumps(result_data)}\n\n"
            
        except Exception as e:
            logger.error(f"Error running docking: {str(e)}")
            yield _format_log(f'Internal server error: {str(e)}', 'error')
            yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': f'Internal server error: {str(e)}'})}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')


@app.route('/api/docking/get-structure', methods=['GET'])
def get_docking_structure():
    """
    Return PDB content for a docking structure (original or a specific pose).
    Query parameters:
      - ligand_index: 1-based index of ligand
      - type: 'original' or 'pose'
      - mode_index: integer (required when type='pose')
    """
    try:
        ligand_index = int(request.args.get("ligand_index", "0"))
        if ligand_index <= 0:
            return jsonify({"success": False, "error": "Invalid ligand_index"}), 400

        docking_dir = get_output_dir() / "docking" / f"ligand_{ligand_index}"
        if not docking_dir.exists():
            return jsonify({"success": False, "error": "Docking results not found for this ligand"}), 404

        struct_type = request.args.get("type", "original")
        if struct_type == "original":
            pdb_path = docking_dir / "original_ligand.pdb"
        else:
            mode_index = int(request.args.get("mode_index", "0"))
            if mode_index <= 0:
                return jsonify({"success": False, "error": "mode_index must be positive for pose"}), 400
            pdb_path = docking_dir / f"ligand_{ligand_index}_mode{mode_index}_h.pdb"

        if not pdb_path.exists():
            return jsonify({"success": False, "error": f"PDB file not found: {pdb_path.name}"}), 404

        content = pdb_path.read_text()
        return jsonify({"success": True, "content": content})
    except Exception as e:
        logger.error(f"Error getting docking structure: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/docking/get-config', methods=['GET'])
def get_docking_config():
    """
    Get Vina config file for a ligand.
    Query parameters:
      - ligand_index: 1-based index of ligand
    """
    try:
        ligand_index = int(request.args.get("ligand_index", "0"))
        if ligand_index <= 0:
            return jsonify({"success": False, "error": "Invalid ligand_index"}), 400

        docking_dir = get_output_dir() / "docking"
        docking_dir.mkdir(parents=True, exist_ok=True)
        lig_dir = docking_dir / f"ligand_{ligand_index}"
        lig_dir.mkdir(parents=True, exist_ok=True)
        
        config_file = lig_dir / "vina_config.txt"
        
        # If config doesn't exist, generate default
        if not config_file.exists():
            # Get ligand PDB to compute center
            ligand_files = sorted(get_output_dir().glob("4_ligands_corrected_obabel_*.pdb"))
            if not ligand_files:
                ligand_files = sorted(
                    [f for f in get_output_dir().glob("4_ligands_corrected_*.pdb") if "_obabel_" not in f.name]
                )
            
            if ligand_index <= len(ligand_files):
                lig_pdb = ligand_files[ligand_index - 1]
                cx, cy, cz = _compute_ligand_center(lig_pdb)
            else:
                cx, cy, cz = 0.0, 0.0, 0.0
            
            # Generate default config
            default_config = f"""# AutoDock Vina Configuration File
# Ligand {ligand_index}

# Search space center (Angstroms)
center_x = {cx:.2f}
center_y = {cy:.2f}
center_z = {cz:.2f}

# Search space size (Angstroms)
size_x = 18.0
size_y = 18.0
size_z = 18.0

# Exhaustiveness of the global search (default: 8)
# Higher values give better results but take longer
exhaustiveness = 8

# Number of binding modes to generate (default: 9)
num_modes = 9

# Maximum energy difference between the best binding mode and the worst one displayed (kcal/mol, default: 3)
energy_range = 3

# Optional: CPU usage (default: 0 = use all available CPUs)
cpu = 0

# Optional: Seed for random number generator (default: 0 = random)
seed = 0
"""
            config_file.write_text(default_config)
        
        content = config_file.read_text()
        return jsonify({"success": True, "content": content})
    except Exception as e:
        logger.error(f"Error getting docking config: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/docking/save-config', methods=['POST'])
def save_docking_config():
    """
    Save Vina config file for a ligand.
    Body: { "ligand_index": int, "content": str }
    """
    try:
        data = request.get_json()
        ligand_index = int(data.get("ligand_index", 0))
        content = data.get("content", "")
        
        if ligand_index <= 0:
            return jsonify({"success": False, "error": "Invalid ligand_index"}), 400
        
        if not content:
            return jsonify({"success": False, "error": "Config content is required"}), 400
        
        docking_dir = get_output_dir() / "docking"
        docking_dir.mkdir(parents=True, exist_ok=True)
        lig_dir = docking_dir / f"ligand_{ligand_index}"
        lig_dir.mkdir(parents=True, exist_ok=True)
        
        config_file = lig_dir / "vina_config.txt"
        config_file.write_text(content)
        
        return jsonify({"success": True, "message": f"Config saved for ligand {ligand_index}"})
    except Exception as e:
        logger.error(f"Error saving docking config: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/docking/get-protein', methods=['GET'])
def get_docking_protein():
    """
    Return the prepared protein structure (tleap_ready.pdb) for the poses viewer.
    """
    try:
        tleap_ready = get_output_dir() / "tleap_ready.pdb"
        if not tleap_ready.exists():
            return jsonify({"success": False, "error": "Prepared structure not found"}), 404
        
        content = tleap_ready.read_text()
        return jsonify({"success": True, "content": content})
    except Exception as e:
        logger.error(f"Error getting protein structure: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


def _validate_and_sanitize_ligand_name(resname: str) -> tuple[str, bool]:
    """
    Validate ligand residue name. If it's pure numeric, convert to a 3-letter code.
    PDB format requires 3-letter residue names (exactly 3 characters).
    Returns: (sanitized_name, was_changed)
    """
    if not resname:
        return "LIG", True
    
    # Check if resname is pure numeric
    if resname.isdigit():
        # Convert numeric name to a 3-letter code
        # Strategy: Use "L" + last 2 digits (e.g., 478 -> "L78", 5 -> "L05")
        num = int(resname)
        # Use modulo 100 to get last 2 digits, then format as 2-digit string
        last_two = num % 100
        sanitized = f"L{last_two:02d}"  # L00, L01, ..., L05, ..., L78, ..., L99
        
        return sanitized, True
    
    # Ensure it's exactly 3 characters (pad or truncate if needed)
    resname_stripped = resname.strip()
    if len(resname_stripped) != 3:
        if len(resname_stripped) < 3:
            # Pad with spaces on the right (PDB format is right-justified)
            sanitized = f"{resname_stripped:>3}"
        else:
            # Truncate to 3 characters
            sanitized = resname_stripped[:3]
        
        if sanitized != resname_stripped:
            return sanitized, True
    
    return resname_stripped, False


def _update_pdb_residue_name(pdb_path: Path, old_resname: str, new_resname: str):
    """
    Update all residue names in a PDB file from old_resname to new_resname.
    Only updates ATOM and HETATM records.
    """
    try:
        content = pdb_path.read_text()
        lines = content.split('\n')
        updated_lines = []
        updated = False
        
        for line in lines:
            if line.startswith(('ATOM', 'HETATM')):
                # Extract current residue name (columns 18-20, 0-indexed: 17-20)
                current_resname = line[17:20].strip()
                if current_resname == old_resname:
                    # Replace the residue name (columns 17-20, right-justified)
                    new_line = line[:17] + f"{new_resname:>3}" + line[20:]
                    updated_lines.append(new_line)
                    updated = True
                else:
                    updated_lines.append(line)
            else:
                updated_lines.append(line)
        
        if updated:
            pdb_path.write_text('\n'.join(updated_lines))
        return updated
    except Exception as e:
        logger.warning(f"Failed to update residue name in {pdb_path}: {e}")
        return False


def validate_and_sanitize_all_ligand_files():
    """
    Validate and sanitize all ligand PDB files in the output directory.
    This should be called early in the workflow to ensure consistency.
    Returns list of warnings about name changes in format: [(old_name, new_name, filename), ...]
    """
    warnings = []
    try:
        # Find all corrected ligand files
        ligand_files = sorted([f for f in get_output_dir().glob('4_ligands_corrected_*.pdb') if "_obabel_" not in f.name])
        
        if not ligand_files:
            # Check for single ligand file
            single_lig_file = get_output_dir() / '4_ligands_corrected.pdb'
            if single_lig_file.exists():
                ligand_files = [single_lig_file]
        
        for lig_file in ligand_files:
            # Read the file first to get original name
            original_resname = None
            with open(lig_file, 'r') as f:
                for line in f:
                    if line.startswith(('ATOM', 'HETATM')):
                        original_resname = line[17:20].strip()
                        break
            
            if original_resname:
                # Check if it's numeric
                if original_resname.isdigit():
                    # Get sanitized name
                    sanitized_name, was_changed = _validate_and_sanitize_ligand_name(original_resname)
                    if was_changed:
                        # Update the file
                        _update_pdb_residue_name(lig_file, original_resname, sanitized_name)
                        warnings.append((original_resname, sanitized_name, lig_file.name))
                else:
                    # Still validate to ensure 3-letter format
                    sanitized_name, was_changed = _validate_and_sanitize_ligand_name(original_resname)
                    if was_changed and sanitized_name != original_resname:
                        _update_pdb_residue_name(lig_file, original_resname, sanitized_name)
                        warnings.append((original_resname, sanitized_name, lig_file.name))
        
        # Also validate tleap_ready.pdb if it exists
        tleap_ready = get_output_dir() / "tleap_ready.pdb"
        if tleap_ready.exists():
            # Collect original names from tleap_ready.pdb
            original_names = {}
            with open(tleap_ready, 'r') as f:
                for line in f:
                    if line.startswith('HETATM'):
                        resname = line[17:20].strip()
                        if resname and resname not in ['HOH', 'WAT', 'TIP', 'SPC', 'NA', 'CL']:
                            if resname not in original_names:
                                original_names[resname] = True
            
            # Validate each unique name
            for original_resname in original_names.keys():
                if original_resname.isdigit():
                    sanitized_name, was_changed = _validate_and_sanitize_ligand_name(original_resname)
                    if was_changed:
                        _update_pdb_residue_name(tleap_ready, original_resname, sanitized_name)
                        warnings.append((original_resname, sanitized_name, tleap_ready.name))
        
    except Exception as e:
        logger.warning(f"Error validating ligand files: {e}")
    
    return warnings


def _get_ligand_info_from_pdb(pdb_path: Path, sanitize: bool = True):
    """
    Extract residue name and chain ID from a ligand PDB file.
    If sanitize=True, validates and updates numeric residue names in the file.
    """
    resname = "UNK"
    chain = "A"
    with open(pdb_path, 'r') as f:
        for line in f:
            if line.startswith(('ATOM', 'HETATM')):
                # PDB format: residue name is columns 18-20, chain is column 22
                resname = line[17:20].strip()
                chain = line[21:22].strip() or "A"
                break
    
        # Validate and sanitize if needed
        if sanitize:
            sanitized_name, was_changed = _validate_and_sanitize_ligand_name(resname)
            if was_changed:
                original_name = resname
                logger.warning(
                    f"Ligand residue name '{original_name}' in {pdb_path.name} is pure numeric. "
                    f"Changed to '{sanitized_name}' (3-letter code) to avoid errors. "
                    f"The PDB file has been updated."
                )
                _update_pdb_residue_name(pdb_path, resname, sanitized_name)
                resname = sanitized_name
    
    return resname, chain


@app.route('/api/docking/get-ligand-boxes', methods=['GET'])
def get_ligand_boxes():
    """
    Return default ligand box suggestions (center and size) for each corrected ligand.
    Also returns ligand name (residue name) and chain ID for display.
    Center is computed from 4_ligands_corrected_obabel_*.pdb using MDAnalysis, size defaults to 10 Å cube.
    """
    try:
        # Use obabel versions for better atom naming compatibility
        ligand_files = sorted(get_output_dir().glob("4_ligands_corrected_obabel_*.pdb"))
        if not ligand_files:
            # Fallback to non-obabel files
            ligand_files = sorted(
                [f for f in get_output_dir().glob("4_ligands_corrected_*.pdb") if "_obabel_" not in f.name]
            )
        
        # Also get chain information from prepared structure
        chains = []
        tleap_ready = get_output_dir() / "tleap_ready.pdb"
        if tleap_ready.exists():
            seen_chains = set()
            with open(tleap_ready, 'r') as f:
                for line in f:
                    if line.startswith(('ATOM', 'HETATM')):
                        chain = line[21:22].strip() or "A"
                        if chain not in seen_chains:
                            seen_chains.add(chain)
                            chains.append(chain)
        
        ligands = []
        for idx, lig_pdb in enumerate(ligand_files, start=1):
            try:
                cx, cy, cz = _compute_ligand_center(lig_pdb)
                resname, chain = _get_ligand_info_from_pdb(lig_pdb)
                ligands.append(
                    {
                        "index": idx,
                        "name": resname,
                        "chain": chain,
                        "center": {"x": cx, "y": cy, "z": cz},
                        "size": {"x": 10.0, "y": 10.0, "z": 10.0},
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to compute center for {lig_pdb}: {e}")
                continue

        # Assign displayLabel to match structure preparation: GOL-A-1, GOL-A-2 when
        # the same (resname, chain) appears more than once; otherwise resname-chain (e.g. LIZ-A).
        resname_chain_count = defaultdict(int)
        for lig in ligands:
            resname_chain_count[(lig["name"], lig["chain"])] += 1
        resname_chain_instance = defaultdict(int)
        for lig in ligands:
            key = (lig["name"], lig["chain"])
            resname_chain_instance[key] += 1
            instance = resname_chain_instance[key]
            count = resname_chain_count[key]
            lig["displayLabel"] = f"{lig['name']}-{lig['chain']}-{instance}" if count > 1 else f"{lig['name']}-{lig['chain']}"

        return jsonify({"success": True, "ligands": ligands, "chains": sorted(chains)})
    except Exception as e:
        logger.error(f"Error computing ligand boxes: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/docking/apply', methods=['POST'])
def apply_docking_poses():
    """
    Apply user-selected docked poses by replacing the corresponding
    4_ligands_corrected_*.pdb files and rebuilding tleap_ready.pdb.
    Request JSON:
      {
        "selections": [
          {"ligand_index": 1, "choice": "original"},
          {"ligand_index": 2, "choice": "mode", "mode_index": 1},
          ...
        ]
      }
    """
    try:
        data = request.get_json() or {}
        selections = data.get("selections", [])
        if not isinstance(selections, list) or not selections:
            return jsonify({"success": False, "error": "No selections provided"}), 400

        protein_capped = get_output_dir() / "2_protein_with_caps.pdb"
        if not protein_capped.exists():
            return jsonify(
                {
                    "success": False,
                    "error": "2_protein_with_caps.pdb not found. Run structure preparation first.",
                }
            ), 400

        # Update ligand files according to selections
        updated_indices = []
        for sel in selections:
            try:
                lig_index = int(sel.get("ligand_index", 0))
                choice = sel.get("choice", "original")
                if lig_index <= 0:
                    continue

                corrected_path = get_output_dir() / f"4_ligands_corrected_{lig_index}.pdb"
                if not corrected_path.exists():
                    continue

                if choice == "original":
                    # Nothing to change for this ligand
                    continue

                if choice == "mode":
                    mode_index = int(sel.get("mode_index", 0))
                    if mode_index <= 0:
                        continue
                    
                    # Use the sanitized pose file (already processed with h_add and sanitized)
                    sanitized_pose = (
                        get_output_dir()
                        / "docking"
                        / f"ligand_{lig_index}"
                        / f"ligand_{lig_index}_mode{mode_index}_sanitized.pdb"
                    )
                    
                    # Fallback to pose with hydrogens if sanitized doesn't exist
                    if not sanitized_pose.exists():
                        sanitized_pose = (
                            get_output_dir()
                            / "docking"
                            / f"ligand_{lig_index}"
                            / f"ligand_{lig_index}_mode{mode_index}_h.pdb"
                        )
                    
                    if not sanitized_pose.exists():
                        logger.warning(f"Docking pose not found: {sanitized_pose}")
                        continue

                    # Copy sanitized pose over corrected ligand
                    corrected_path.write_text(sanitized_pose.read_text())
                    updated_indices.append(lig_index)
            except Exception as e:
                logger.warning(f"Error applying selection {sel}: {str(e)}")

        # Rebuild tleap_ready.pdb using updated ligand files (if any)
        tleap_ready = get_output_dir() / "tleap_ready.pdb"
        ligand_groups = []
        ligand_files = sorted(
            [f for f in get_output_dir().glob("4_ligands_corrected_*.pdb") if "_obabel_" not in f.name]
        )
        for lig_pdb in ligand_files:
            lines = [
                line
                for line in lig_pdb.read_text().splitlines(keepends=True)
                if line.startswith(("ATOM", "HETATM"))
            ]
            if lines:
                ligand_groups.append(lines)

        if ligand_groups:
            ok = merge_protein_and_ligand(
                str(protein_capped), None, str(tleap_ready), ligand_groups=ligand_groups
            )
            if not ok:
                return jsonify(
                    {
                        "success": False,
                        "error": "Failed to merge protein and updated ligands into tleap_ready.pdb",
                    }
                ), 500

        return jsonify(
            {
                "success": True,
                "updated_ligands": updated_indices,
                "tleap_ready": str(tleap_ready.relative_to(get_output_dir())) if tleap_ready.exists() else None,
            }
        )
    except Exception as e:
        logger.error(f"Error applying docking poses: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

def _format_log(message, log_type='info'):
    """Helper function to format log message for SSE"""
    data = json.dumps({'type': log_type, 'message': message})
    return f"data: {data}\n\n"

@app.route('/api/generate-ligand-ff', methods=['POST'])
@stream_with_context
def generate_ligand_ff():
    """Generate force field parameters for multiple ligands with streaming logs"""
    def generate():
        try:
            data = request.get_json()
            force_field = data.get('force_field', 'gaff2')
            
            # Determine the s parameter based on force field
            s_param = 2 if force_field == 'gaff2' else 1
            
            yield _format_log(f"Working directory: {os.getcwd()}")
            yield _format_log(f"Output directory: {get_output_dir()}")
            
            # Find all individual ligand files (4_ligands_corrected_1.pdb, 4_ligands_corrected_2.pdb, etc.)
            # Exclude OpenBabel output files (4_ligands_corrected_obabel_*.pdb)
            ligand_files = sorted([f for f in get_output_dir().glob("4_ligands_corrected_*.pdb") if "_obabel_" not in f.name])
            
            if not ligand_files:
                # Fallback: check for single ligand file (backward compatibility)
                single_ligand_pdb = get_output_dir() / "4_ligands_corrected.pdb"
                if single_ligand_pdb.exists():
                    ligand_files = [single_ligand_pdb]
                else:
                    yield _format_log('Ligand PDB file(s) not found. Please prepare structure with ligands first.', 'error')
                    yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': 'Ligand PDB file(s) not found. Please prepare structure with ligands first.'})}\n\n"
                    return
            
            yield _format_log(f"Found {len(ligand_files)} ligand file(s) to process")
            
            # Validate and sanitize all ligand files first (early validation)
            # This ensures numeric ligand names are converted to LIG{number} format
            validate_and_sanitize_all_ligand_files()
            yield _format_log("Validated ligand residue names (numeric names converted to LIG{number} format if needed)")
            
            import re
            processed_ligands = []
            errors = []
            
            # Step 1: Extract residue names and group ligands by residue name
            ligand_by_resname = {}  # Maps residue name to list of (ligand_pdb, ligand_num) tuples
            resname_to_ligand_num = {}  # Maps residue name to the ligand_num we'll use for processing
            
            for i, ligand_pdb in enumerate(ligand_files, 1):
                ligand_num = i
                # Extract number from filename if available (e.g., 4_ligands_corrected_1.pdb -> 1)
                match = re.search(r'_(\d+)\.pdb$', ligand_pdb.name)
                if match:
                    ligand_num = int(match.group(1))
                
                # Extract residue name from this ligand file (already sanitized by validate function)
                resname = get_residue_name_from_pdb(ligand_pdb, sanitize=True)
                if not resname:
                    yield _format_log(f"Warning: Could not extract residue name from {ligand_pdb.name}, using LIG{ligand_num}", 'warning')
                    resname = f"LIG{ligand_num}"
                
                # Group by residue name
                if resname not in ligand_by_resname:
                    ligand_by_resname[resname] = []
                    resname_to_ligand_num[resname] = ligand_num  # Use first occurrence's number
                ligand_by_resname[resname].append((ligand_pdb, ligand_num))
            
            yield _format_log(f"Found {len(ligand_by_resname)} unique ligand residue name(s): {', '.join(sorted(ligand_by_resname.keys()))}")
            
            # Step 2: Process each unique residue name only once
            for resname, ligand_list in ligand_by_resname.items():
                # Use the first ligand file for this residue name
                ligand_pdb, ligand_num = ligand_list[0]
                
                # If there are multiple occurrences, log it
                if len(ligand_list) > 1:
                    other_nums = [num for _, num in ligand_list[1:]]
                    yield _format_log(f"Residue {resname} appears {len(ligand_list)} times (ligand files: {ligand_num}, {', '.join(map(str, other_nums))})", 'info')
                    yield _format_log(f"Processing {resname} once using ligand file {ligand_num}, skipping duplicates", 'info')
                
                # Use residue name for output files to avoid conflicts
                ligand_mol2 = get_output_dir() / f"{resname}.mol2"
                ligand_frcmod = get_output_dir() / f"{resname}.frcmod"
                
                yield _format_log(f"\n{'='*60}")
                yield _format_log(f"Processing ligand {resname} (from file {ligand_pdb.name})")
                yield _format_log(f"{'='*60}")
                
                # Step 1: Calculate net charge using awk
                yield _format_log(f"Step 1: Calculating net charge for ligand {resname}...")
                awk_cmd = "awk '/^HETATM/ {if($NF ~ /[A-Z][0-9]-$/) charge--; if($NF ~ /[A-Z][0-9]\\+$/) charge++} END {print \"Net charge:\", charge+0}'"
                cmd1 = f"{awk_cmd} {ligand_pdb}"
                
                try:
                    result = subprocess.run(cmd1, shell=True, capture_output=True, text=True)
                    output = result.stdout.strip()
                    yield _format_log(f"Awk output: '{output}'")
                    
                    net_charge_match = re.search(r'Net charge:\s*(-?\d+)', output)
                    if net_charge_match:
                        net_charge = int(net_charge_match.group(1))
                        yield _format_log(f"Calculated net charge: {net_charge}")
                    else:
                        yield _format_log("Could not extract net charge from awk output, using 0", 'warning')
                        net_charge = 0
                except Exception as e:
                    yield _format_log(f"Error running awk command: {e}, using net charge 0", 'error')
                    net_charge = 0
                
                # Step 2: Run antechamber with streaming output
                yield _format_log(f"Step 2: Running antechamber for ligand {resname} with net charge {net_charge}...")
                cmd2 = f"antechamber -i {ligand_pdb.name} -fi pdb -o {ligand_mol2.name} -fo mol2 -c bcc -at {force_field} -nc {net_charge}"
                yield _format_log(f"Running command: {cmd2}")
                
                # Stream antechamber output in real-time
                process = subprocess.Popen(cmd2, shell=True, cwd=str(get_output_dir()), 
                                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, 
                                         text=True, bufsize=1, universal_newlines=True)
                
                for line in iter(process.stdout.readline, ''):
                    if line:
                        yield _format_log(line.strip())
                
                process.wait()
                return_code = process.returncode
                
                yield _format_log(f"antechamber return code: {return_code}")
                
                if return_code != 0:
                    error_msg = f'antechamber failed for ligand {resname} with net charge {net_charge}'
                    yield _format_log(f"ERROR: {error_msg}", 'error')
                    errors.append(error_msg)
                    continue
                
                # Step 3: Run parmchk2 with streaming output
                yield _format_log(f"Step 3: Running parmchk2 for ligand {resname}...")
                cmd3 = f"parmchk2 -i {ligand_mol2.name} -f mol2 -o {ligand_frcmod.name} -a Y -s {s_param}"
                yield _format_log(f"Running command: {cmd3}")
                
                # Stream parmchk2 output in real-time
                process = subprocess.Popen(cmd3, shell=True, cwd=str(get_output_dir()), 
                                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, 
                                         text=True, bufsize=1, universal_newlines=True)
                
                for line in iter(process.stdout.readline, ''):
                    if line:
                        yield _format_log(line.strip())
                
                process.wait()
                return_code = process.returncode
                
                yield _format_log(f"parmchk2 return code: {return_code}")
                
                if return_code != 0:
                    error_msg = f'parmchk2 failed for ligand {resname}'
                    yield _format_log(f"ERROR: {error_msg}", 'error')
                    errors.append(error_msg)
                    continue
                
                # Check if files were generated successfully
                if ligand_mol2.exists() and ligand_frcmod.exists():
                    processed_ligands.append({
                        'resname': resname,
                        'ligand_num': ligand_num,
                        'net_charge': net_charge,
                        'files': {
                            'pdb': str(ligand_pdb),
                            'mol2': str(ligand_mol2),
                            'frcmod': str(ligand_frcmod)
                        },
                        'duplicate_files': [str(pdb) for pdb, num in ligand_list[1:]] if len(ligand_list) > 1 else []
                    })
                    yield _format_log(f"✅ Successfully processed ligand {resname}", 'success')
                else:
                    error_msg = f'Force field generation failed for ligand {resname} - output files not created'
                    yield _format_log(f"ERROR: {error_msg}", 'error')
                    errors.append(error_msg)
            
            if not processed_ligands:
                error_msg = f'Failed to process any ligands. Errors: {"; ".join(errors)}'
                yield _format_log(error_msg, 'error')
                yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': error_msg})}\n\n"
                return
            
            # Send final result
            result_data = {
                'type': 'complete',
                'success': True,
                'message': f'Successfully processed {len(processed_ligands)} ligand(s) with force field {force_field}',
                'ligands': processed_ligands,
                'errors': errors if errors else None
            }
            yield f"data: {json.dumps(result_data)}\n\n"
            
        except Exception as e:
            logger.error(f"Error generating ligand force field: {str(e)}")
            yield _format_log(f'Internal server error: {str(e)}', 'error')
            yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': f'Internal server error: {str(e)}'})}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/calculate-net-charge', methods=['POST'])
def calculate_net_charge():
    """Calculate net charge of the system using tleap"""
    try:
        # Check if structure is prepared
        tleap_ready_file = get_output_dir() / "tleap_ready.pdb"
        if not tleap_ready_file.exists():
            return jsonify({'error': 'Structure not prepared. Please prepare structure first.'}), 400
        
        # Check if ligands are present - look for residue-named files first, then fallback to numbered files
        ligand_mol2_files = []
        ligand_frcmod_files = []
        ligand_resname_map = {}  # Maps residue name to (mol2_file, frcmod_file)
        
        # First, try to find residue-named files (e.g., O9C.mol2, O9C.frcmod)
        unique_resnames = get_all_ligand_residue_names()
        for resname in unique_resnames:
            mol2_file = get_output_dir() / f"{resname}.mol2"
            frcmod_file = get_output_dir() / f"{resname}.frcmod"
            if mol2_file.exists() and frcmod_file.exists():
                ligand_resname_map[resname] = (mol2_file, frcmod_file)
                ligand_mol2_files.append(mol2_file)
                ligand_frcmod_files.append(frcmod_file)
        
        # Fallback: check for numbered files (backward compatibility)
        if not ligand_mol2_files:
            numbered_mol2 = sorted(get_output_dir().glob("4_ligands_corrected_*.mol2"))
            numbered_frcmod = sorted(get_output_dir().glob("4_ligands_corrected_*.frcmod"))
            if numbered_mol2 and numbered_frcmod:
                ligand_mol2_files = numbered_mol2
                ligand_frcmod_files = numbered_frcmod
                # Try to map to residue names
                resnames = get_all_ligand_residue_names()
                for i, (mol2_file, frcmod_file) in enumerate(zip(ligand_mol2_files, ligand_frcmod_files)):
                    # Extract residue name from mol2 file if possible
                    resname = get_residue_name_from_mol2(mol2_file) if mol2_file.exists() else None
                    if not resname:
                        # Try to get from tleap_ready.pdb
                        if resnames and i < len(resnames):
                            resname = resnames[i]
                        else:
                            resname = f"LIG{len(ligand_resname_map) + 1}"
                    # Only add if not already in map (avoid duplicates)
                    if resname not in ligand_resname_map:
                        ligand_resname_map[resname] = (mol2_file, frcmod_file)
        
        # Final fallback: single ligand file (backward compatibility)
        if not ligand_mol2_files:
            single_mol2 = get_output_dir() / "4_ligands_corrected.mol2"
            single_frcmod = get_output_dir() / "4_ligands_corrected.frcmod"
            if single_mol2.exists() and single_frcmod.exists():
                ligand_mol2_files = [single_mol2]
                ligand_frcmod_files = [single_frcmod]
                resname = get_all_ligand_residue_names()
                if resname:
                    ligand_resname_map[resname[0]] = (single_mol2, single_frcmod)
                else:
                    ligand_resname_map["LIG"] = (single_mol2, single_frcmod)
        
        ligand_present = len(ligand_mol2_files) > 0 and len(ligand_frcmod_files) > 0
        
        # Create dynamic tleap input file
        tleap_input = get_output_dir() / "calc_charge_on_system.in"
        
        # Get the selected force field from the request
        data = request.get_json() if request.get_json() else {}
        selected_force_field = data.get('force_field', 'ff14SB')
        
        with open(tleap_input, 'w') as f:
            f.write(f"source leaprc.protein.{selected_force_field}\n")
            f.write("source leaprc.gaff2\n\n")
            
            if ligand_present:
                # Load each unique ligand parameter and structure only once
                # Use sorted to ensure consistent ordering
                for resname in sorted(ligand_resname_map.keys()):
                    mol2_file, frcmod_file = ligand_resname_map[resname]
                    f.write(f"loadamberparams {frcmod_file.name}\n")
                    f.write(f"{resname} = loadmol2 {mol2_file.name}\n")
                f.write("\n")
            
            f.write("x = loadpdb tleap_ready.pdb\n\n")
            f.write("charge x\n\n")
            f.write("quit\n")
        
        # Run tleap command
        print("Running tleap to calculate system charge...")
        # Find tleap executable dynamically
        try:
            # First try to find tleap in PATH
            which_result = subprocess.run(['which', 'tleap'], capture_output=True, text=True)
            if which_result.returncode == 0:
                tleap_path = which_result.stdout.strip()
            else:
                # Fallback: try common conda environment paths
                conda_env = os.environ.get('CONDA_DEFAULT_ENV', 'MD_pipeline')
                conda_prefix = os.environ.get('CONDA_PREFIX', '')
                if conda_prefix:
                    tleap_path = os.path.join(conda_prefix, 'bin', 'tleap')
                else:
                    # Last resort: assume it's in PATH
                    tleap_path = 'tleap'
            
            cmd = f"{tleap_path} -f calc_charge_on_system.in"
            result = subprocess.run(cmd, shell=True, cwd=str(get_output_dir()), capture_output=True, text=True)
        except Exception as e:
            # Fallback to simple tleap command
            cmd = f"tleap -f calc_charge_on_system.in"
            result = subprocess.run(cmd, shell=True, cwd=str(get_output_dir()), capture_output=True, text=True)
        
        print(f"tleap return code: {result.returncode}")
        print(f"tleap stdout: {result.stdout}")
        print(f"tleap stderr: {result.stderr}")
        
        # Check if we got the charge information even if tleap had a non-zero exit code
        # (tleap often returns non-zero when run non-interactively but still calculates charge)
        if 'Total unperturbed charge' not in result.stdout and 'Total charge' not in result.stdout:
            return jsonify({'error': f'tleap failed to calculate charge. Error: {result.stderr}'}), 500
        
        # Parse the output to find the net charge
        output_lines = result.stdout.split('\n')
        net_charge = None
        
        for line in output_lines:
            if 'Total unperturbed charge' in line or 'Total charge' in line:
                # Look for patterns like "Total charge: -3.0000" or "Total unperturbed charge: -3.0000"
                import re
                charge_match = re.search(r'charge[:\s]+(-?\d+\.?\d*)', line)
                if charge_match:
                    net_charge = float(charge_match.group(1))
                    break
        
        if net_charge is None:
            return jsonify({'error': 'Could not extract net charge from tleap output'}), 500
        
        # Suggest ion addition (plain-language message)
        if net_charge > 0:
            suggestion = "The system is positively charged. Add Cl- to neutralize."
            ion_type = "Cl-"
            ion_count = int(round(net_charge))
        elif net_charge < 0:
            suggestion = "The system is negatively charged. Add Na+ to neutralize."
            ion_type = "Na+"
            ion_count = int(round(abs(net_charge)))
        else:
            suggestion = "The system is neutral. No ions needed."
            ion_type = "None"
            ion_count = 0
        
        return jsonify({
            'success': True,
            'net_charge': net_charge,
            'suggestion': suggestion,
            'ion_type': ion_type,
            'ion_count': ion_count,
            'ligand_present': ligand_present
        })
        
    except Exception as e:
        logger.error(f"Error calculating net charge: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/generate-all-files', methods=['POST'])
def generate_all_files():
    """Generate all simulation input files based on UI parameters"""
    try:
        data = request.get_json()
        
        # Get simulation parameters from UI
        cutoff_distance = data.get('cutoff_distance', 10.0)
        temperature = data.get('temperature', 310.0)
        pressure = data.get('pressure', 1.0)
        
        # Get step parameters
        restrained_steps = data.get('restrained_steps', 10000)
        restrained_force = data.get('restrained_force', 10.0)
        min_steps = data.get('min_steps', 20000)
        npt_heating_steps = data.get('npt_heating_steps', 50000)
        npt_equilibration_steps = data.get('npt_equilibration_steps', 100000)
        production_steps = data.get('production_steps', 1000000)
        # Integration time step (ps)
        dt = data.get('timestep', 0.002)
        
        # Get force field parameters
        force_field = data.get('force_field', 'ff14SB')
        water_model = data.get('water_model', 'TIP3P')
        add_ions = data.get('add_ions', 'None')
        distance = data.get('distance', 10.0)
        
        # Validation warnings
        warnings = []
        if restrained_steps < 5000:
            warnings.append("Restrained minimization steps should be at least 5000")
        if min_steps < 10000:
            warnings.append("Minimization steps should be at least 10000")
        
        # Count total residues in tleap_ready.pdb
        tleap_ready_file = get_output_dir() / "tleap_ready.pdb"
        if not tleap_ready_file.exists():
            return jsonify({'error': 'tleap_ready.pdb not found. Please prepare structure first.'}), 400
        
        total_residues = count_residues_in_pdb(str(tleap_ready_file))
        
        # Generate min_restrained.in
        generate_min_restrained_file(restrained_steps, restrained_force, total_residues, cutoff_distance)
        
        # Generate min.in
        generate_min_file(min_steps, cutoff_distance)
        
        # Generate HeatNPT.in
        generate_heat_npt_file(npt_heating_steps, temperature, pressure, cutoff_distance, dt)
        
        # Generate mdin_equi.in (NPT Equilibration)
        generate_npt_equilibration_file(npt_equilibration_steps, temperature, pressure, cutoff_distance, dt)
        
        # Check if plumed.dat exists in output folder
        plumed_file = get_output_dir() / 'plumed.dat'
        use_plumed = plumed_file.exists()
        
        # Generate mdin_prod.in (Production)
        generate_production_file(production_steps, temperature, pressure, cutoff_distance, dt, use_plumed=use_plumed)
        
        # Generate force field parameters
        ff_files_generated = []
        try:
            generate_ff_parameters_file(force_field, water_model, add_ions, distance)
            
            # Find tleap executable
            tleap_path = None
            try:
                result = subprocess.run(['which', 'tleap'], capture_output=True, text=True)
                if result.returncode == 0:
                    tleap_path = result.stdout.strip()
            except:
                pass
            
            if not tleap_path:
                conda_prefix = os.environ.get('CONDA_PREFIX')
                if conda_prefix:
                    tleap_path = os.path.join(conda_prefix, 'bin', 'tleap')
                else:
                    tleap_path = '/home/hn533621/.conda/envs/MD_pipeline/bin/tleap'
            
            # Run tleap to generate force field parameters
            cmd = f"{tleap_path} -f generate_ff_parameters.in"
            result = subprocess.run(cmd, shell=True, cwd=str(get_output_dir()), 
                                  capture_output=True, text=True, timeout=300)
            
            if result.returncode != 0:
                warnings.append(f"Force field generation failed: {result.stderr}")
            else:
                # Check if key output files were created
                ff_output_files = ['protein.prmtop', 'protein.inpcrd', 'protein_solvated.pdb']
                for ff_file in ff_output_files:
                    if (get_output_dir() / ff_file).exists():
                        ff_files_generated.append(ff_file)
                
                if len(ff_files_generated) == 0:
                    warnings.append("Force field parameter files were not generated")
                
        except Exception as ff_error:
            warnings.append(f"Force field generation error: {str(ff_error)}")
        
        # Generate PBS submit script into output
        pbs_generated = generate_submit_pbs_file(use_plumed=use_plumed)

        all_files = [
            'min_restrained.in',
            'min.in', 
            'HeatNPT.in',
            'mdin_equi.in',
            'mdin_prod.in'
        ] + ff_files_generated

        if pbs_generated:
            all_files.append('submit_job.pbs')
        
        return jsonify({
            'success': True,
            'message': f'All simulation files generated successfully ({len(all_files)} files)',
            'warnings': warnings,
            'files_generated': all_files
        })
        
    except Exception as e:
        logger.error(f"Error generating simulation files: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

def count_residues_in_pdb(pdb_file):
    """Count total number of residues in PDB file"""
    try:
        with open(pdb_file, 'r') as f:
            lines = f.readlines()
        
        residues = set()
        for line in lines:
            if line.startswith(('ATOM', 'HETATM')):
                # Extract residue number (columns 23-26)
                residue_num = line[22:26].strip()
                if residue_num:
                    residues.add(residue_num)
        
        return len(residues)
    except Exception as e:
        logger.error(f"Error counting residues: {str(e)}")
        return 607  # Default fallback

def generate_min_restrained_file(steps, force_constant, total_residues, cutoff):
    """Generate min_restrained.in file"""
    content = f"""initial minimization solvent + ions
 &cntrl
  imin   = 1,
  maxcyc = {steps},
  ncyc   = {steps // 2},
  ntb    = 1,
  ntr    = 1,
  ntxo   = 1,	
  cut    = {cutoff}
/
Restrain 
{force_constant}
RES 1 {total_residues}
END
END

"""
    
    with open(get_output_dir() / "min_restrained.in", 'w') as f:
        f.write(content)

def generate_min_file(steps, cutoff):
    """Generate min.in file"""
    content = f"""Minimization
&cntrl
imin=1,
maxcyc={steps},
ncyc={steps // 4},
ntb=1,
cut={cutoff},
igb=0,
ntr=0,
/

"""
    
    with open(get_output_dir() / "min.in", 'w') as f:
        f.write(content)

def generate_heat_npt_file(steps, temperature, pressure, cutoff, dt=0.002):
    """Generate HeatNPT.in file with temperature ramping"""
    # Calculate step divisions: 20%, 20%, 20%, 40%
    step1 = int(steps * 0.2)
    step2 = int(steps * 0.2)
    step3 = int(steps * 0.2)
    step4 = int(steps * 0.4)
    
    # Calculate temperature values: 3%, 66%, 100%
    temp1 = temperature * 0.03
    temp2 = temperature * 0.66
    temp3 = temperature
    temp4 = temperature
    
    content = f"""Heat
 &cntrl
  imin = 0, irest = 0, ntx = 1,
  ntb = 2, pres0 = {pressure}, ntp = 1,
  taup = 2.0,
  cut = {cutoff}, ntr = 0,
  ntc = 2, ntf = 2,
  tempi = 0, temp0 = {temperature},
  ntt = 3, gamma_ln = 1.0,
  nstlim = {steps}, dt = {dt},
  ntpr = 2000, ntwx = 2000, ntwr = 2000
 /
&wt type='TEMP0', istep1=0, istep2={step1}, value1=0.0, value2={temp1} /
&wt type='TEMP0', istep1={step1+1}, istep2={step1+step2}, value1={temp1}, value2={temp2} /
&wt type='TEMP0', istep1={step1+step2+1}, istep2={step1+step2+step3}, value1={temp2}, value2={temp3} /
&wt type='TEMP0', istep1={step1+step2+step3+1}, istep2={steps}, value1={temp3}, value2={temp4} /
&wt type='END' /

"""
    
    with open(get_output_dir() / "HeatNPT.in", 'w') as f:
        f.write(content)

def generate_npt_equilibration_file(steps, temperature, pressure, cutoff, dt=0.002):
    """Generate mdin_equi.in file for NPT equilibration"""
    content = f"""NPT Equilibration
&cntrl
  imin=0,
  ntx=1,
  irest=0,
  pres0={pressure},
  taup=1.0,
  temp0={temperature},
  tempi={temperature},
  nstlim={steps},
  dt={dt},
  ntf=2,
  ntc=2,
  ntpr=500,
  ntwx=500,
  ntwr=500,
  cut={cutoff},
  ntb=2,
  ntp=1,
  ntt=3,
  gamma_ln=3.0,
  ig=-1,
  iwrap=1,
  ntr=0,
/

"""
    
    with open(get_output_dir() / "mdin_equi.in", 'w') as f:
        f.write(content)

def generate_production_file(steps, temperature, pressure, cutoff, dt=0.002, use_plumed=False):
    """Generate mdin_prod.in file for production run"""
    content = f"""Production Run
&cntrl
  imin=0,
  ntx=1,
  irest=0,
  pres0={pressure},
  taup=1.0,
  temp0={temperature},
  tempi={temperature},
  nstlim={steps},
  dt={dt},
  ntf=2,
  ntc=2,
  ntpr=1000,
  ntwx=1000,
  ntwr=1000,
  cut={cutoff},
  ntb=2,
  ntp=1,
  ntt=3,
  gamma_ln=3.0,
  ig=-1,
  iwrap=1,
  ntr=0,
"""
    
    # Add PLUMED lines if plumed.dat exists
    if use_plumed:
        content += "  plumed=1,\n"
        content += "  plumedfile='plumed.dat'\n"
    
    content += "/\n\n"
    
    with open(get_output_dir() / "mdin_prod.in", 'w') as f:
        f.write(content)

def generate_submit_pbs_file(use_plumed=False):
    """Generate submit_job.pbs file for SLURM job submission"""
    try:
        # Get absolute path to output directory
        output_dir_abs = get_output_dir().resolve()
        
        # Build PBS script content
        content = """#!/bin/bash
#SBATCH -D {working_dir}  # Critical: Sets working dir
#SBATCH --job-name=job_name
#SBATCH --partition=defq
#SBATCH --get-user-env
#SBATCH --nodes=1
#SBATCH --tasks-per-node=1
#SBATCH --cpus-per-task=1
#SBATCH --gres=gpu:1
#SBATCH --time=168:00:00


module load amber/24
""".format(working_dir=str(output_dir_abs))
        
        # Add PLUMED module if plumed.dat exists
        if use_plumed:
            content += "module load plumed/2.9.1\n"
        
        content += """
pmemd.cuda -O -i min_restrained.in -o min_restrained.out -p protein.prmtop -c protein.inpcrd -r min_res.ncrst -x min_res.nc -ref protein.inpcrd -inf min_res.mdinfo
pmemd.cuda -O -i min.in -o min.out -p protein.prmtop -c min_res.ncrst -r min.ncrst -x min.nc -inf min.mdinfo
pmemd.cuda -O -i HeatNPT.in -o HeatNPT.out -p protein.prmtop -c min.ncrst -r HeatNPT.ncrst -x HeatNPT.nc -inf HeatNPT.mdinfo
pmemd.cuda -O -i mdin_equi.in -o mdin_equi.out -p protein.prmtop -c HeatNPT.ncrst -r mdin_equi.ncrst -x mdin_equi.nc -inf mdin_equi.mdinfo -ref protein.inpcrd
pmemd.cuda -O -i mdin_prod.in -o mdin_prod.out -p protein.prmtop -c mdin_equi.ncrst -r mdin_prod.ncrst -x mdin_prod.nc -inf mdin_prod.mdinfo -ref protein.inpcrd
"""
        
        # Write submit_job.pbs file
        with open(get_output_dir() / "submit_job.pbs", 'w') as f:
            f.write(content)
        
        logger.info(f"Generated submit_job.pbs in {get_output_dir()}")
        return True
    except Exception as e:
        logger.error(f"Error generating submit_job.pbs: {e}")
        return False

@app.route('/api/session', methods=['GET'])
def get_session():
    """Return a new session ID so the frontend can isolate this user's output (multi-user / Hugging Face)."""
    return jsonify({'session_id': str(uuid.uuid4())})


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'message': 'MD Simulation Pipeline API is running'})

@app.route('/api/clean-output', methods=['POST'])
def clean_output():
    """Clean output folder endpoint"""
    try:
        print("DEBUG: clean-output endpoint called")
        if clean_and_create_output_folder():
            return jsonify({'success': True, 'message': 'Output folder cleaned successfully'})
        else:
            return jsonify({'success': False, 'error': 'Failed to clean output folder'}), 500
    except Exception as e:
        print(f"DEBUG: Error in clean-output: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/discard-session', methods=['GET', 'POST'])
def discard_session():
    """Delete this session's output folder (e.g. when user closes the tab). Called via sendBeacon from frontend."""
    try:
        session_id = request.args.get("session_id") or request.headers.get("X-Session-Id")
        if not session_id or not _SESSION_ID_RE.match(session_id):
            return jsonify({"error": "Invalid or missing session_id"}), 400
        out_dir = OUTPUT_BASE / session_id
        if out_dir.exists():
            import shutil
            shutil.rmtree(out_dir)
            logger.info(f"Discarded session output folder: {out_dir}")
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"Error discarding session folder: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/save-pdb-file', methods=['POST'])
def save_pdb_file():
    """Save PDB file to output directory"""
    try:
        data = request.get_json()
        pdb_content = data.get('pdb_content', '')
        filename = data.get('filename', 'input.pdb')
        
        if not pdb_content:
            return jsonify({'success': False, 'error': 'No PDB content provided'}), 400
        
        # Save to output directory as 0_original_input.pdb
        output_file = get_output_dir() / "0_original_input.pdb"
        with open(output_file, 'w') as f:
            f.write(pdb_content)
        
        logger.info(f"Saved PDB file to {output_file}")
        return jsonify({
            'success': True,
            'message': f'PDB file saved successfully',
            'file_path': str(output_file)
        })
    except Exception as e:
        logger.error(f"Error saving PDB file: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/save-plumed-file', methods=['POST'])
def save_plumed_file():
    """Save PLUMED file to output directory"""
    try:
        data = request.get_json()
        plumed_content = data.get('plumed_content', '')
        filename = data.get('filename', 'plumed.dat')
        
        if not plumed_content:
            return jsonify({'success': False, 'error': 'No PLUMED content provided'}), 400
        
        # Ensure filename has .dat extension if not provided
        if not filename.endswith('.dat'):
            filename = filename if '.' in filename else f"{filename}.dat"
        
        # Save to output directory
        output_file = get_output_dir() / filename
        with open(output_file, 'w') as f:
            f.write(plumed_content)
        
        logger.info(f"Saved PLUMED file to {output_file}")
        return jsonify({
            'success': True,
            'message': f'PLUMED file saved successfully to output/{filename}',
            'file_path': str(output_file),
            'filename': filename
        })
    except Exception as e:
        logger.error(f"Error saving PLUMED file: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/download-output-zip', methods=['GET'])
def download_output_zip():
    """Create a ZIP of the output folder and return it for download"""
    try:
        if not get_output_dir().exists():
            return jsonify({'error': 'Output directory not found'}), 404

        import tempfile
        import shutil

        # Create a temporary zip file
        tmp_dir = tempfile.mkdtemp()
        zip_base = os.path.join(tmp_dir, 'output')
        zip_path = shutil.make_archive(zip_base, 'zip', root_dir=str(get_output_dir()))

        # Send file for download
        return send_file(zip_path, as_attachment=True, download_name='output.zip')
    except Exception as e:
        logger.error(f"Error creating output ZIP: {str(e)}")
        return jsonify({'error': f'Failed to create ZIP: {str(e)}'}), 500

@app.route('/api/get-generated-files', methods=['GET'])
def get_generated_files():
    """Return contents of known generated input files for preview"""
    try:
        files_to_read = [
            'min_restrained.in',
            'min.in',
            'HeatNPT.in',
            'mdin_equi.in',
            'mdin_prod.in',
            'submit_job.pbs'
        ]
        # Files to exclude from preview (intermediate/utility files)
        excluded_files = [
            'calc_charge_on_system.in',
            'generate_ff_parameters.in',
            'sqm.in'
        ]
        # Exclude ESMFold minimization intermediates: tleap_A.in, min_A.in, etc. (per-chain;
        # keep min.in and min_restrained.in which are in files_to_read)
        def _is_esmfold_minimization_file(name):
            if name.startswith('tleap_') and name.endswith('.in'):
                return True
            # min_{chain}.in e.g. min_A.in, min_B.in (len 8: min_ + X + .in)
            if name.startswith('min_') and name.endswith('.in') and len(name) == 8:
                return True
            return False
        # Note: Force field parameter files (protein.prmtop, protein.inpcrd, protein_solvated.pdb)
        # are excluded from preview as they are binary/large files

        # Also include any user-created .in files in the output directory
        user_created_files = []
        try:
            for file_path in get_output_dir().glob("*.in"):
                filename = file_path.name
                # Exclude standard files, utility files, and ESMFold minimization intermediates
                if (filename not in files_to_read and filename not in excluded_files
                        and not _is_esmfold_minimization_file(filename)):
                    user_created_files.append(filename)
        except Exception as e:
            logger.warning(f"Error scanning for user-created files: {e}")
        
        # Combine standard files and user-created files
        all_files = files_to_read + sorted(user_created_files)
        
        result = {}
        for name in all_files:
            path = get_output_dir() / name
            if path.exists():
                try:
                    with open(path, 'r') as f:
                        result[name] = f.read()
                except Exception as fe:
                    result[name] = f"<error reading file: {fe}>"
            else:
                result[name] = "<file not found>"
        return jsonify({'success': True, 'files': result})
    except Exception as e:
        logger.error(f"Error reading generated files: {str(e)}")
        return jsonify({'error': f'Failed to read files: {str(e)}'}), 500

@app.route('/api/save-file', methods=['POST'])
def save_file():
    """Save edited file content back to the output directory"""
    try:
        data = request.get_json()
        filename = data.get('filename')
        content = data.get('content')
        
        if not filename:
            return jsonify({'success': False, 'error': 'Filename is required'}), 400
        
        if content is None:
            return jsonify({'success': False, 'error': 'Content is required'}), 400
        
        # Security: Only allow saving files that are in the allowed list
        allowed_files = [
            'min_restrained.in',
            'min.in',
            'HeatNPT.in',
            'mdin_equi.in',
            'mdin_prod.in',
            'submit_job.pbs',
            'plumed.dat'
        ]
        
        if filename not in allowed_files:
            return jsonify({'success': False, 'error': f'File "{filename}" is not allowed to be edited'}), 403
        
        # Prevent directory traversal attacks
        if '/' in filename or '\\' in filename or '..' in filename:
            return jsonify({'success': False, 'error': 'Invalid filename'}), 400
        
        # Write file
        file_path = get_output_dir() / filename
        try:
            with open(file_path, 'w') as f:
                f.write(content)
            
            logger.info(f"File {filename} saved successfully")
            return jsonify({'success': True, 'message': f'File {filename} saved successfully'})
        except Exception as e:
            logger.error(f"Error writing file {filename}: {str(e)}")
            return jsonify({'success': False, 'error': f'Failed to write file: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Error saving file: {str(e)}")
        return jsonify({'success': False, 'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/save-new-file', methods=['POST'])
def save_new_file():
    """Save a new simulation file created by the user"""
    try:
        data = request.get_json()
        filename = data.get('filename')
        content = data.get('content')
        
        if not filename:
            return jsonify({'success': False, 'error': 'Filename is required'}), 400
        
        if content is None:
            return jsonify({'success': False, 'error': 'Content is required'}), 400
        
        # Validate filename - must end with .in
        if not filename.endswith('.in'):
            return jsonify({'success': False, 'error': 'File name must end with .in extension'}), 400
        
        # Prevent directory traversal attacks
        if '/' in filename or '\\' in filename or '..' in filename:
            return jsonify({'success': False, 'error': 'Invalid filename'}), 400
        
        # Write file
        file_path = get_output_dir() / filename
        try:
            with open(file_path, 'w') as f:
                f.write(content)
            
            logger.info(f"New file {filename} saved successfully")
            return jsonify({'success': True, 'message': f'File {filename} saved successfully'})
        except Exception as e:
            logger.error(f"Error writing new file {filename}: {str(e)}")
            return jsonify({'success': False, 'error': f'Failed to write file: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Error saving new file: {str(e)}")
        return jsonify({'success': False, 'error': f'Internal server error: {str(e)}'}), 500

def get_ligand_residue_name():
    """Extract first ligand residue name from tleap_ready.pdb (for backward compatibility)"""
    ligand_names = get_all_ligand_residue_names()
    return ligand_names[0] if ligand_names else "LIG"

def generate_ff_parameters_file(force_field, water_model, add_ions, distance):
    """Generate the final force field parameters file with dynamic values"""
    # Debug logging
    print(f"DEBUG: force_field={force_field}, water_model={water_model}, add_ions={add_ions}, distance={distance}")
    
    # Check if ligands are present - look for residue-named files first, then fallback to numbered files
    ligand_mol2_files = []
    ligand_frcmod_files = []
    ligand_resname_map = {}  # Maps residue name to (mol2_file, frcmod_file)
    
    # First, try to find residue-named files (e.g., O9C.mol2, O9C.frcmod)
    unique_resnames = get_all_ligand_residue_names()
    for resname in unique_resnames:
        mol2_file = get_output_dir() / f"{resname}.mol2"
        frcmod_file = get_output_dir() / f"{resname}.frcmod"
        if mol2_file.exists() and frcmod_file.exists():
            ligand_resname_map[resname] = (mol2_file, frcmod_file)
            ligand_mol2_files.append(mol2_file)
            ligand_frcmod_files.append(frcmod_file)
    
    # Fallback: check for numbered files (backward compatibility)
    if not ligand_mol2_files:
        numbered_mol2 = sorted(get_output_dir().glob("4_ligands_corrected_*.mol2"))
        numbered_frcmod = sorted(get_output_dir().glob("4_ligands_corrected_*.frcmod"))
        if numbered_mol2 and numbered_frcmod:
            ligand_mol2_files = numbered_mol2
            ligand_frcmod_files = numbered_frcmod
            # Try to map to residue names
            resnames = get_all_ligand_residue_names()
            for i, (mol2_file, frcmod_file) in enumerate(zip(ligand_mol2_files, ligand_frcmod_files)):
                # Extract residue name from mol2 file if possible
                resname = get_residue_name_from_mol2(mol2_file) if mol2_file.exists() else None
                if not resname:
                    # Try to get from tleap_ready.pdb
                    if resnames and i < len(resnames):
                        resname = resnames[i]
                    else:
                        resname = f"LIG{len(ligand_resname_map) + 1}"
                # Only add if not already in map (avoid duplicates)
                if resname not in ligand_resname_map:
                    ligand_resname_map[resname] = (mol2_file, frcmod_file)
    
    # Final fallback: single ligand file (backward compatibility)
    if not ligand_mol2_files:
        single_mol2 = get_output_dir() / "4_ligands_corrected.mol2"
        single_frcmod = get_output_dir() / "4_ligands_corrected.frcmod"
        if single_mol2.exists() and single_frcmod.exists():
            ligand_mol2_files = [single_mol2]
            ligand_frcmod_files = [single_frcmod]
            resnames = get_all_ligand_residue_names()
            if resnames:
                ligand_resname_map[resnames[0]] = (single_mol2, single_frcmod)
            else:
                ligand_resname_map["LIG"] = (single_mol2, single_frcmod)
    
    ligand_present = len(ligand_mol2_files) > 0 and len(ligand_frcmod_files) > 0
    
    # Build the content dynamically
    content = f"source leaprc.protein.{force_field}\n"
    
    # Add water model source
    print(f"DEBUG: water_model={water_model}")
    if water_model.lower() == "tip3p":
        content += "source leaprc.water.tip3p\n"
    elif water_model == "spce":
        content += "source leaprc.water.spce\n"
    
    # Add ligand-related commands only if ligands are present
    if ligand_present:
        content += "source leaprc.gaff2\n\n"
        
        # Load each unique ligand parameter and structure only once
        # Use sorted to ensure consistent ordering
        for resname in sorted(ligand_resname_map.keys()):
            mol2_file, frcmod_file = ligand_resname_map[resname]
            content += f"loadamberparams {frcmod_file.name}\n"
            content += f"{resname} = loadmol2 {mol2_file.name}\n"
        content += "\n"
    else:
        content += "\n"
    
    content += "x = loadpdb tleap_ready.pdb\n\n"
    content += "charge x\n\n"
    
    # Add ions based on selection
    if add_ions == "Na+":
        content += "addions x Na+ 0.0\n\n"
    elif add_ions == "Cl-":
        content += "addions x Cl- 0.0\n\n"
    # If "None", skip adding ions
    
    # Add solvation with selected water model and distance
    if water_model.lower() == "tip3p":
        content += f"solvateBox x TIP3PBOX {distance}\n\n"
    elif water_model.lower() == "spce":
        content += f"solvateBox x SPCBOX {distance}\n\n"
    
    content += "saveamberparm x protein.prmtop protein.inpcrd\n\n"
    content += "savepdb x protein_solvated.pdb\n\n"
    content += "quit\n"
    
    # Debug: print the generated content
    print("DEBUG: Generated content:")
    print(content)
    
    # Write the file
    with open(get_output_dir() / "generate_ff_parameters.in", 'w') as f:
        f.write(content)

def get_residue_name_from_pdb(pdb_file, sanitize: bool = True):
    """
    Extract residue name from a ligand PDB file.
    If sanitize=True, validates and updates numeric residue names in the file.
    """
    try:
        residue_name = None
        with open(pdb_file, 'r') as f:
            for line in f:
                if line.startswith(('ATOM', 'HETATM')):
                    # Extract residue name (columns 18-20)
                    residue_name = line[17:20].strip()
                    if residue_name and residue_name not in ['HOH', 'WAT', 'TIP', 'SPC', 'NA', 'CL']:
                        break
        
        if not residue_name:
            return None
        
        # Validate and sanitize if needed
        if sanitize:
            sanitized_name, was_changed = _validate_and_sanitize_ligand_name(residue_name)
            if was_changed:
                original_name = residue_name
                logger.warning(
                    f"Ligand residue name '{original_name}' in {Path(pdb_file).name} is pure numeric. "
                    f"Changed to '{sanitized_name}' (3-letter code) to avoid errors. "
                    f"The PDB file has been updated."
                )
                _update_pdb_residue_name(Path(pdb_file), residue_name, sanitized_name)
                residue_name = sanitized_name
        
        return residue_name
    except Exception as e:
        logger.warning(f"Could not extract residue name from {pdb_file}: {e}")
        return None

def get_residue_name_from_mol2(mol2_file):
    """Extract residue name from a mol2 file (from @<TRIPOS>MOLECULE section)"""
    try:
        with open(mol2_file, 'r') as f:
            lines = f.readlines()
            # Find @<TRIPOS>MOLECULE section
            in_molecule = False
            for i, line in enumerate(lines):
                if '@<TRIPOS>MOLECULE' in line:
                    in_molecule = True
                    # The next line is the molecule name/residue name
                    if i + 1 < len(lines):
                        resname = lines[i + 1].strip()
                        # Remove any extra whitespace or comments
                        resname = resname.split()[0] if resname.split() else resname
                        return resname
        return None
    except Exception as e:
        logger.warning(f"Could not extract residue name from {mol2_file}: {e}")
        return None

def get_all_ligand_residue_names(sanitize: bool = True):
    """
    Extract all unique ligand residue names from tleap_ready.pdb.
    If sanitize=True, validates and updates numeric residue names in the file.
    """
    ligand_names = []
    try:
        tleap_ready_path = get_output_dir() / "tleap_ready.pdb"
        if not tleap_ready_path.exists():
            return []
        
        seen_residues = set()
        residues_to_update = {}  # Track old_name -> new_name mappings
        
        # First pass: collect all residue names and validate them
        with open(tleap_ready_path, 'r') as f:
            for line in f:
                if line.startswith('HETATM'):
                    # Extract residue name (columns 18-20)
                    residue_name = line[17:20].strip()
                    if residue_name and residue_name not in ['HOH', 'WAT', 'TIP', 'SPC', 'NA', 'CL']:
                        if residue_name not in seen_residues:
                            # Validate and sanitize if needed
                            if sanitize:
                                sanitized_name, was_changed = _validate_and_sanitize_ligand_name(residue_name)
                                if was_changed:
                                    residues_to_update[residue_name] = sanitized_name
                                    residue_name = sanitized_name
                            
                            ligand_names.append(residue_name)
                            seen_residues.add(residue_name)
        
        # Update tleap_ready.pdb if any residue names were changed
        if sanitize and residues_to_update:
            for old_name, new_name in residues_to_update.items():
                logger.warning(
                    f"Ligand residue name '{old_name}' in tleap_ready.pdb is pure numeric. "
                    f"Changed to '{new_name}' (3-letter code) to avoid errors. "
                    f"The PDB file has been updated."
                )
                _update_pdb_residue_name(tleap_ready_path, old_name, new_name)
        
        return ligand_names
    except Exception as e:
        logger.warning(f"Could not extract ligand residue names: {e}")
        return []

@app.route('/api/generate-ff-parameters', methods=['POST'])
def generate_ff_parameters():
    """Generate final force field parameters using tleap"""
    try:
        data = request.get_json()
        force_field = data.get('force_field', 'ff14SB')
        water_model = data.get('water_model', 'TIP3P')
        add_ions = data.get('add_ions', 'None')
        distance = data.get('distance', 10.0)
        
        # Generate the dynamic input file
        generate_ff_parameters_file(force_field, water_model, add_ions, distance)
        
        # Find tleap executable
        tleap_path = None
        try:
            result = subprocess.run(['which', 'tleap'], capture_output=True, text=True)
            if result.returncode == 0:
                tleap_path = result.stdout.strip()
        except:
            pass
        
        if not tleap_path:
            conda_prefix = os.environ.get('CONDA_PREFIX')
            if conda_prefix:
                tleap_path = os.path.join(conda_prefix, 'bin', 'tleap')
            else:
                tleap_path = '/home/hn533621/.conda/envs/MD_pipeline/bin/tleap'
        
        # Run tleap
        cmd = f"{tleap_path} -f generate_ff_parameters.in"
        result = subprocess.run(cmd, shell=True, cwd=str(get_output_dir()), 
                              capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            logger.error(f"tleap failed: {result.stderr}")
            return jsonify({
                'success': False, 
                'error': f'tleap failed: {result.stderr}'
            }), 500
        
        # Check if key output files were created
        output_files = ['protein.prmtop', 'protein.inpcrd', 'protein_solvated.pdb']
        missing_files = [f for f in output_files if not (get_output_dir() / f).exists()]
        
        if missing_files:
            return jsonify({
                'success': False,
                'error': f'Missing output files: {", ".join(missing_files)}'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Force field parameters generated successfully',
            'files_generated': output_files
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'tleap command timed out after 5 minutes'
        }), 500
    except Exception as e:
        logger.error(f"Error generating FF parameters: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to generate force field parameters: {str(e)}'
        }), 500

@app.route('/api/detect-missing-residues', methods=['POST'])
def detect_missing_residues_endpoint():
    """Detect missing residues in the loaded PDB structure"""
    try:
        # Check if original input file exists
        original_pdb_path = get_output_dir() / "0_original_input.pdb"
        if not original_pdb_path.exists():
            return jsonify({
                'success': False,
                'error': 'No PDB file loaded. Please load a PDB file first.'
            }), 400
        
        # Get PDB ID from the file
        try:
            pdb_id = get_pdb_id_from_pdb_file(str(original_pdb_path))
        except ValueError as e:
            return jsonify({
                'success': False,
                'error': f'Could not determine PDB ID: {str(e)}'
            }), 400
        
        # Detect missing residues
        missing = detect_missing_residues(pdb_id)
        
        # Get chain sequences
        chain_sequences = get_chain_sequences(pdb_id)
        
        # Find chains with missing residues that have sequences available
        chains_with_missing = {
            chain: chain_sequences[chain]
            for chain in missing
            if chain in chain_sequences
        }
        
        # Format missing residues info for display
        missing_info = {}
        for chain, missing_list in missing.items():
            missing_info[chain] = {
                'count': len(missing_list),
                'residues': missing_list
            }
        
        # Get first residue number for each chain from the PDB file
        # Also calculate the starting residue number for the sequence viewer
        # (accounting for missing residues before the first PDB residue)
        chain_first_residue = {}
        chain_sequence_start = {}
        try:
            original_pdb_path = get_output_dir() / "0_original_input.pdb"
            if original_pdb_path.exists():
                with open(original_pdb_path, 'r') as f:
                    pdb_lines = f.readlines()
                    
                # First pass: find first residue number for each chain
                for line in pdb_lines:
                    if line.startswith('ATOM') or line.startswith('HETATM'):
                        chain_id = line[21:22].strip()
                        if chain_id and chain_id not in chain_first_residue:
                            # Extract residue number (columns 22-26, but we need to handle insertion codes)
                            residue_str = line[22:26].strip()
                            try:
                                # Try to extract just the number part (handle negative numbers)
                                import re
                                match = re.match(r'(-?\d+)', residue_str)
                                if match:
                                    residue_num = int(match.group(1))
                                    chain_first_residue[chain_id] = residue_num
                            except:
                                pass
                
                # Second pass: calculate sequence start for each chain
                # We want to find the first residue number that should be displayed
                # This is the first PDB residue minus the count of missing residues before it
                # Example: If PDB starts at 189 and residues 173-188 are missing (16 residues),
                # then sequence_start = 189 - 16 = 173
                for chain_id, first_pdb_residue in chain_first_residue.items():
                    # Find the minimum missing residue number before first_pdb_residue
                    # This tells us where the sequence should start displaying
                    min_missing_before = None
                    if chain_id in missing_info:
                        for resname, resnum in missing_info[chain_id]['residues']:
                            if resnum < first_pdb_residue:
                                if min_missing_before is None or resnum < min_missing_before:
                                    min_missing_before = resnum
                    
                    if min_missing_before is not None:
                        # Sequence should start from the first missing residue before PDB start
                        # This accounts for all missing residues before the first PDB residue
                        sequence_start = min_missing_before
                    else:
                        # No missing residues before first PDB residue, start from first PDB residue
                        sequence_start = first_pdb_residue
                    
                    chain_sequence_start[chain_id] = sequence_start
        except Exception as e:
            logger.warning(f"Could not determine first residue numbers: {str(e)}")
        
        return jsonify({
            'success': True,
            'pdb_id': pdb_id,
            'missing_residues': missing_info,
            'chains_with_missing': list(chains_with_missing.keys()),
            'chain_sequences': chain_sequences,
            'chain_first_residue': chain_first_residue,
            'chain_sequence_start': chain_sequence_start
        })
        
    except Exception as e:
        logger.error(f"Error detecting missing residues: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to detect missing residues: {str(e)}'
        }), 500

@app.route('/api/trim-residues', methods=['POST'])
def trim_residues_endpoint():
    """Trim residues from edges of chain sequences"""
    try:
        data = request.get_json()
        chain_sequences = data.get('chain_sequences', {})
        trim_specs = data.get('trim_specs', {})
        pdb_id = data.get('pdb_id')
        
        if not chain_sequences:
            return jsonify({
                'success': False,
                'error': 'No chain sequences provided'
            }), 400
        
        if not trim_specs:
            return jsonify({
                'success': False,
                'error': 'No trim specifications provided'
            }), 400
        
        # Apply trimming
        try:
            trimmed_sequences = trim_chains_sequences(chain_sequences, trim_specs)
        except ValueError as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 400
        
        # Optionally write trimmed FASTA file if pdb_id is provided
        if pdb_id:
            try:
                write_fasta_for_missing_chains(
                    pdb_id, 
                    trimmed_sequences, 
                    output_dir=str(get_output_dir())
                )
                logger.info(f"Wrote trimmed FASTA file for PDB {pdb_id}")
            except Exception as e:
                logger.warning(f"Could not write trimmed FASTA file: {str(e)}")
        
        # Calculate trim info for response
        trim_info = {}
        for chain, spec in trim_specs.items():
            original_len = len(chain_sequences.get(chain, ''))
            trimmed_len = len(trimmed_sequences.get(chain, ''))
            trim_info[chain] = {
                'original_length': original_len,
                'trimmed_length': trimmed_len,
                'n_terminal_trimmed': spec.get('n_terminal', 0),
                'c_terminal_trimmed': spec.get('c_terminal', 0)
            }
        
        return jsonify({
            'success': True,
            'trimmed_sequences': trimmed_sequences,
            'trim_info': trim_info,
            'message': f'Successfully trimmed residues from {len(trim_specs)} chain(s)'
        })
        
    except Exception as e:
        logger.error(f"Error trimming residues: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to trim residues: {str(e)}'
        }), 500

@app.route('/api/build-completed-structure', methods=['POST'])
@stream_with_context
def build_completed_structure_endpoint():
    """Build completed structure using ESMFold for selected chains with streaming logs"""
    def generate():
        try:
            data = request.get_json()
            selected_chains = data.get('selected_chains', [])
            
            if not selected_chains:
                yield _format_log('❌ No chains selected for completion', 'error')
                yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': 'No chains selected for completion'})}\n\n"
                return
            
            yield _format_log(f"Starting ESMFold structure completion for chains: {', '.join(selected_chains)}")
            
            # Check if original input file exists
            original_pdb_path = get_output_dir() / "0_original_input.pdb"
            if not original_pdb_path.exists():
                yield _format_log('❌ No PDB file loaded. Please load a PDB file first.', 'error')
                yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': 'No PDB file loaded. Please load a PDB file first.'})}\n\n"
                return
            # Use true crystal for alignment and rebuild: 0_original_input_backup if it exists (before set-use-completed overwrote 0_original_input), else 0_original_input
            original_for_align = get_output_dir() / "0_original_input_backup.pdb"
            original_for_align = original_for_align if original_for_align.exists() else original_pdb_path

            # Get PDB ID
            try:
                pdb_id = get_pdb_id_from_pdb_file(str(original_pdb_path))
                yield _format_log(f"Detected PDB ID: {pdb_id}")
            except ValueError as e:
                yield _format_log(f'❌ Could not determine PDB ID: {str(e)}', 'error')
                yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': f'Could not determine PDB ID: {str(e)}'})}\n\n"
                return
            
            # Get chain sequences (use provided sequences if available, otherwise fetch)
            provided_sequences = data.get('chain_sequences', None)
            if provided_sequences:
                chain_sequences = provided_sequences
                yield _format_log("Using provided chain sequences (may be trimmed)")
            else:
                yield _format_log("Fetching chain sequences from PDB database...")
                chain_sequences = get_chain_sequences(pdb_id)
            
            # Verify selected chains have sequences
            chains_to_process = []
            for chain in selected_chains:
                if chain in chain_sequences:
                    chains_to_process.append(chain)
                else:
                    yield _format_log(f"⚠️ Chain {chain} not found in chain sequences", 'warning')
            
            if not chains_to_process:
                yield _format_log('❌ None of the selected chains have sequences available', 'error')
                yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': 'None of the selected chains have sequences available'})}\n\n"
                return
            
            # Create dictionary of chains with their sequences for FASTA writing
            chains_with_missing = {
                chain: chain_sequences[chain]
                for chain in chains_to_process
            }
            
            # Write FASTA file for the selected chains
            try:
                write_fasta_for_missing_chains(pdb_id, chains_with_missing, output_dir=str(get_output_dir()))
                yield _format_log(f"Wrote FASTA file for chains: {chains_to_process}")
            except Exception as e:
                yield _format_log(f"⚠️ Could not write FASTA file: {str(e)}", 'warning')
                # Don't fail the entire operation if FASTA writing fails
            
            # Run ESMFold for each selected chain
            esmfold_results = {}
            for chain in chains_to_process:
                yield _format_log(f"Running ESMFold for chain {chain}...")
                seq = chain_sequences[chain]
                try:
                    pdb_text = run_esmfold(seq)
                    esmfold_results[chain] = pdb_text
                    
                    # Save each chain's ESMFold result
                    esm_pdb_filename = get_output_dir() / f"{pdb_id}_chain_{chain}_esmfold.pdb"
                    with open(esm_pdb_filename, 'w') as f:
                        f.write(pdb_text)
                    yield _format_log(f"✅ ESMFold completed for chain {chain}: {esm_pdb_filename.name}")
                except Exception as e:
                    yield _format_log(f'❌ ESMFold failed for chain {chain}: {str(e)}', 'error')
                    yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': f'ESMFold failed for chain {chain}: {str(e)}'})}\n\n"
                    return
            
            # Minimization (before rebuild): minimized PDBs will be superimposed in rebuild
            minimize_chains = data.get('minimize_chains', False)
            chains_to_minimize = data.get('chains_to_minimize', [])
            minimized_chains = []
            if minimize_chains and chains_to_minimize:
                yield _format_log(f"\n{'='*60}")
                yield _format_log(f"Starting energy minimization for chains: {', '.join(chains_to_minimize)}")
                yield _format_log(f"{'='*60}")
                try:
                    for chain in chains_to_minimize:
                        yield _format_log(f"\nMinimizing chain {chain}...")
                        for log_line in _minimize_esmfold_chains_streaming(pdb_id, [chain], original_for_align=original_for_align):
                            yield log_line
                        minimized_chains.append(chain)
                        yield _format_log(f"✅ Chain {chain} minimization completed")
                    min_status_file = get_output_dir() / ".chains_minimized"
                    with open(min_status_file, 'w') as f:
                        f.write(','.join(minimized_chains))
                    yield _format_log(f"\n✅ All chains minimized successfully: {', '.join(minimized_chains)}")
                except Exception as e:
                    yield _format_log(f'❌ Error during minimization: {str(e)}', 'error')
            
            # Rebuild PDB using PyMOL (aligns ESMFold or minimized chains to original, then merges)
            output_pdb = get_output_dir() / "0_complete_structure.pdb"
            yield _format_log("Rebuilding structure with PyMOL (superimposing to original)...")
            try:
                import tempfile
                import os
                chains_use_min_arg = repr(minimized_chains) if minimized_chains else "None"
                script_content = f"""#!/usr/bin/env python3
import sys
import os

# Add ambermdflow package to path (Fill_missing_residues is in ambermdflow/)
sys.path.insert(0, r'{str(Path(__file__).parent)}')

# Change to output directory
os.chdir(r'{str(get_output_dir())}')

# Import and run rebuild
from Fill_missing_residues import rebuild_pdb_with_esmfold

try:
    rebuild_pdb_with_esmfold(
        r'{pdb_id}',
        {repr(chains_to_process)},
        output_pdb=r'{output_pdb.name}',
        original_pdb_path=r'{Path(original_for_align).name}',
        chains_use_minimized={chains_use_min_arg}
    )
    print("SUCCESS: Rebuild completed")
except Exception as e:
    print(f"ERROR: {{e}}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
"""
                
                # Write script to temporary file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as script_file:
                    script_file.write(script_content)
                    script_path = script_file.name
                
                try:
                    # Make script executable
                    os.chmod(script_path, 0o755)
                    
                    # Run script in subprocess
                    result = subprocess.run(
                        [sys.executable, script_path],
                        capture_output=True,
                        text=True,
                        timeout=300,
                        cwd=str(get_output_dir())
                    )
                    
                    if result.returncode != 0:
                        error_msg = result.stderr or result.stdout
                        yield _format_log(f"❌ PyMOL rebuild failed: {error_msg}", 'error')
                        # Check if it's a PyMOL initialization issue
                        if "pymol" in error_msg.lower() or "import" in error_msg.lower():
                            error_msg = f"PyMOL initialization failed. Make sure PyMOL is installed and accessible. Error: {error_msg}"
                        else:
                            error_msg = f"Rebuild failed: {error_msg}"
                        yield _format_log(f"❌ {error_msg}", 'error')
                        yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': error_msg})}\n\n"
                        return
                    
                    if "ERROR:" in result.stdout:
                        error_line = [line for line in result.stdout.split('\\n') if 'ERROR:' in line]
                        if error_line:
                            error_msg = error_line[0].replace('ERROR:', '').strip()
                            yield _format_log(f"❌ {error_msg}", 'error')
                            yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': error_msg})}\n\n"
                            return
                    
                    if not output_pdb.exists():
                        error_msg = "Output file was not created"
                        yield _format_log(f"❌ {error_msg}", 'error')
                        yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': error_msg})}\n\n"
                        return
                    
                    yield _format_log(f"✅ Completed structure saved to {output_pdb.name}")
                
                except subprocess.TimeoutExpired:
                    yield _format_log("❌ PyMOL rebuild timed out after 5 minutes", 'error')
                    yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': 'PyMOL rebuild timed out. The structure might be too large. Please try again.'})}\n\n"
                    return
                except Exception as e:
                    yield _format_log(f"❌ Error rebuilding PDB: {str(e)}", 'error')
                    import traceback
                    logger.error(traceback.format_exc())
                    yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': f'Failed to rebuild structure: {str(e)}'})}\n\n"
                    return
                finally:
                    # Clean up temporary script
                    try:
                        os.unlink(script_path)
                    except:
                        pass
            except Exception as e:
                yield _format_log(f"❌ Error in PyMOL rebuild: {str(e)}", 'error')
                yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': f'PyMOL rebuild failed: {str(e)}'})}\n\n"
                return
            
            # Read the completed structure (includes superimposed minimized chains when minimization was used)
            with open(output_pdb, 'r') as f:
                completed_content = f.read()
            
            chains_str = ', '.join(chains_to_process)
            yield _format_log(f"\n✅ Structure completion finished for chains: {chains_str}")
            
            result_message = f'Successfully completed structure for chains: {chains_str}'
            result_data = {
                'type': 'complete',
                'success': True,
                'message': result_message,
                'completed_chains': chains_to_process,
                'completed_structure': completed_content,
                'minimized_chains': minimized_chains
            }
            yield f"data: {json.dumps(result_data)}\n\n"
            
        except Exception as e:
            logger.error(f"Error building completed structure: {str(e)}")
            yield _format_log(f'❌ Error: {str(e)}', 'error')
            yield f"data: {json.dumps({'type': 'complete', 'success': False, 'error': f'Failed to build completed structure: {str(e)}'})}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/set-use-completed-structure', methods=['POST'])
def set_use_completed_structure():
    """Set user preference to use completed structure (ESMFold) instead of original"""
    try:
        data = request.get_json()
        use_completed = data.get('use_completed', False)
        
        # Create a flag file to indicate user wants to use completed structure
        flag_file = get_output_dir() / ".use_completed_structure"
        
        if use_completed:
            # User wants to use completed structure - create flag file
            flag_file.touch()
            logger.info("User chose to use ESMFold-completed structure")
            
            # Also replace the original input with completed structure for consistency
            completed_pdb_path = get_output_dir() / "0_complete_structure.pdb"
            original_pdb_path = get_output_dir() / "0_original_input.pdb"
            
            if completed_pdb_path.exists():
                import shutil
                # Backup original if it doesn't exist as backup
                backup_path = get_output_dir() / "0_original_input_backup.pdb"
                if original_pdb_path.exists() and not backup_path.exists():
                    shutil.copy2(original_pdb_path, backup_path)
                
                # Replace original with completed structure
                shutil.copy2(completed_pdb_path, original_pdb_path)
                logger.info(f"Replaced {original_pdb_path} with completed structure")
        else:
            # User doesn't want to use completed structure - remove flag
            if flag_file.exists():
                flag_file.unlink()
            
            # Restore original structure from backup if it exists
            backup_path = get_output_dir() / "0_original_input_backup.pdb"
            original_pdb_path = get_output_dir() / "0_original_input.pdb"
            
            if backup_path.exists() and original_pdb_path.exists():
                import shutil
                # Check if current original is the completed structure (by comparing with completed)
                completed_pdb_path = get_output_dir() / "0_complete_structure.pdb"
                if completed_pdb_path.exists():
                    # Restore original from backup
                    shutil.copy2(backup_path, original_pdb_path)
                    logger.info(f"Restored original structure from backup")
            
            logger.info("User chose to use original structure")
        
        return jsonify({
            'success': True,
            'use_completed': use_completed
        })
        
    except Exception as e:
        logger.error(f"Error setting use completed structure preference: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/get-use-completed-structure', methods=['GET'])
def get_use_completed_structure():
    """Get user preference for using completed structure"""
    try:
        flag_file = get_output_dir() / ".use_completed_structure"
        use_completed = flag_file.exists()
        
        return jsonify({
            'success': True,
            'use_completed': use_completed
        })
    except Exception as e:
        logger.error(f"Error getting use completed structure preference: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/get-completed-structure', methods=['GET'])
def get_completed_structure():
    """Get the completed structure PDB file if it exists"""
    try:
        completed_pdb_path = get_output_dir() / "0_complete_structure.pdb"
        if not completed_pdb_path.exists():
            return jsonify({
                'success': False,
                'exists': False,
                'error': 'Completed structure not found'
            }), 404
        
        with open(completed_pdb_path, 'r') as f:
            content = f.read()
        
        return jsonify({
            'success': True,
            'exists': True,
            'content': content
        })
    except Exception as e:
        logger.error(f"Error reading completed structure: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/get-file', methods=['GET'])
def get_file():
    """Get a file from the output directory"""
    try:
        filename = request.args.get('filename')
        if not filename:
            return jsonify({
                'success': False,
                'error': 'Filename parameter required'
            }), 400
        
        # Security: only allow files from output directory
        file_path = get_output_dir() / filename
        
        # Prevent directory traversal
        if not str(file_path).startswith(str(get_output_dir())):
            return jsonify({
                'success': False,
                'error': 'Invalid file path'
            }), 400
        
        if not file_path.exists():
            return jsonify({
                'success': False,
                'error': f'File {filename} not found'
            }), 404
        
        # Read file content
        with open(file_path, 'r') as f:
            content = f.read()
        
        return content, 200, {'Content-Type': 'text/plain'}
    except Exception as e:
        logger.error(f"Error reading file {filename}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print("🧬 MD Simulation Pipeline")
    print("=========================")
    print("🌐 Starting Flask server...")
    print("📡 Backend API: http://localhost:5000")
    print("🔗 Web Interface: http://localhost:5000")
    print("")
    print("Press Ctrl+C to stop the server")
    print("")
    
    # Clean and create fresh output folder on startup
    print("🧹 Cleaning output folder...")
    clean_and_create_output_folder()
    print("✅ Output folder ready!")
    print("")
    
    app.run(debug=False, host='0.0.0.0', port=5000)

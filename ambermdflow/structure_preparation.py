#!/usr/bin/env python3
"""
AMBER Structure Preparation Script using MDAnalysis
Complete pipeline: extract protein, add caps, handle ligands
"""

import glob
import os
import re
import subprocess
import sys
import shutil
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def run_command(cmd, description=""):
    """Run a command and return success status"""
    try:
        print(f"Running: {description}")
        print(f"Command: {cmd}")
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
        print(f"Return code: {result.returncode}")
        if result.stdout:
            print(f"STDOUT: {result.stdout}")
        if result.stderr:
            print(f"STDERR: {result.stderr}")
        if result.returncode != 0:
            print(f"Error: {result.stderr}")
            return False
        return True
    except subprocess.TimeoutExpired:
        print(f"Timeout: {description}")
        return False
    except Exception as e:
        print(f"Error running {description}: {str(e)}")
        return False

def extract_protein_only(pdb_content, output_file, selected_chains=None):
    """Extract protein without hydrogens using MDAnalysis. Optionally restrict to selected chains."""
    # Write input content to output file first
    with open(output_file, 'w') as f:
        f.write(pdb_content)
    
    try:
        # Run MDAnalysis command with the output file as input
        chain_sel = ''
        if selected_chains:
            chain_filters = ' or '.join([f'chain {c}' for c in selected_chains])
            chain_sel = f' and ({chain_filters})'
        selection = f"protein{chain_sel} and not name H* 1H* 2H* 3H*"
        abspath = os.path.abspath(output_file)
        cmd = f'python -c "import MDAnalysis as mda; u=mda.Universe(\'{abspath}\'); u.select_atoms(\'{selection}\').write(\'{abspath}\')"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            raise Exception(f"MDAnalysis error: {result.stderr}")
        
        return True
    except Exception as e:
        print(f"Error in extract_protein_only: {e}")
        return False

def add_capping_groups(input_file, output_file):
    """Add ACE and NME capping groups using add_caps.py"""
    add_caps_script = (Path(__file__).resolve().parent / "add_caps.py")
    # First add caps
    temp_capped = output_file.replace('.pdb', '_temp.pdb')
    cmd = f"python {add_caps_script} -i {input_file} -o {temp_capped}"
    if not run_command(cmd, f"Adding capping groups to {input_file}"):
        return False
    
    # Then add TER cards using awk
    cmd = f"awk '/NME/{{nme=NR}} /ACE/ && nme && NR > nme {{print \"TER\"; nme=0}} {{print}}' {temp_capped} > {output_file}"
    if not run_command(cmd, f"Adding TER cards to {temp_capped}"):
        return False
    
    # Clean up temp file
    if os.path.exists(temp_capped):
        os.remove(temp_capped)
    
    return True


def replace_chain_in_pdb(target_pdb, chain_id, source_pdb):
    """
    Replace a specific chain in target_pdb with the chain from source_pdb.
    Only performs replacement if the target actually contains the chain_id.
    Used to merge ESMFold-minimized chains into 1_protein_no_hydrogens.pdb.
    If the source has no ATOM lines (or none matching the chain), we do NOT
    modify the target, to avoid wiping the protein when the minimized file is
    empty or has an unexpected format.
    """
    with open(target_pdb, 'r') as f:
        target_lines = f.readlines()
    if not any(
        ln.startswith(('ATOM', 'HETATM')) and len(ln) >= 22 and ln[21] == chain_id
        for ln in target_lines
    ):
        return
    with open(source_pdb, 'r') as f:
        source_lines = f.readlines()
    source_chain_lines = []
    for ln in source_lines:
        if ln.startswith(('ATOM', 'HETATM')) and len(ln) >= 22:
            ch = ln[21]
            if ch == 'A' or ch == chain_id:
                source_chain_lines.append(ln[:21] + chain_id + ln[22:])
    if not source_chain_lines:
        # Fallback: minimized PDB may use chain ' ' or other; take all ATOM/HETATM.
        for ln in source_lines:
            if ln.startswith(('ATOM', 'HETATM')) and len(ln) >= 22:
                source_chain_lines.append(ln[:21] + chain_id + ln[22:])
    if not source_chain_lines:
        return  # Do not modify target: we have nothing to add; avoid wiping the protein.
    filtered_target = [
        ln for ln in target_lines
        if not (ln.startswith(('ATOM', 'HETATM')) and len(ln) >= 22 and ln[21] == chain_id)
    ]
    combined = []
    for ln in filtered_target:
        if ln.startswith('END'):
            combined.extend(source_chain_lines)
            combined.append("TER\n")
        combined.append(ln)
    with open(target_pdb, 'w') as f:
        f.writelines(combined)


def extract_selected_chains(pdb_content, output_file, selected_chains):
    """Extract selected chains using PyMOL commands"""
    try:
        # Write input content to temp file
        temp_input = output_file.replace('.pdb', '_temp_input.pdb')
        with open(temp_input, 'w') as f:
            f.write(pdb_content)
        
        # Build chain selection string
        chain_filters = ' or '.join([f'chain {c}' for c in selected_chains])
        selection = f"({chain_filters}) and polymer.protein"
        
        # Use PyMOL to extract chains
        cmd = f'''python -c "
import pymol
pymol.finish_launching(['pymol', '-c'])
pymol.cmd.load('{temp_input}')
pymol.cmd.save('{output_file}', '{selection}')
pymol.cmd.quit()
"'''
        
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        
        # Clean up temp file
        if os.path.exists(temp_input):
            os.remove(temp_input)
        
        if result.returncode != 0:
            print(f"PyMOL chain extraction error: {result.stderr}")
            return False
        
        return True
    except Exception as e:
        print(f"Error extracting selected chains: {e}")
        return False

def extract_selected_ligands(pdb_content, output_file, selected_ligands):
    """Extract selected ligands using PyMOL commands.
    selected_ligands: list of dicts with resn, chain, and optionally resi.
    When resi is provided, use (resn X and chain Y and resi Z) to uniquely pick
    one instance when the same ligand (resn) appears multiple times in the same chain.
    """
    try:
        # Write input content to temp file
        temp_input = output_file.replace('.pdb', '_temp_input.pdb')
        with open(temp_input, 'w') as f:
            f.write(pdb_content)
        
        # Build ligand selection string (include resi when present to disambiguate duplicates)
        parts = []
        for lig in selected_ligands:
            resn = lig.get('resn', '').strip()
            chain = lig.get('chain', '').strip()
            resi = lig.get('resi') if lig.get('resi') is not None else ''
            resi = str(resi).strip() if resi else ''
            if resn and chain:
                if resi:
                    parts.append(f"(resn {resn} and chain {chain} and resi {resi})")
                else:
                    parts.append(f"(resn {resn} and chain {chain})")
            elif resn:
                parts.append(f"resn {resn}")
        
        if not parts:
            # No ligands to extract
            with open(output_file, 'w') as f:
                f.write('\n')
            return True
        
        selection = ' or '.join(parts)
        
        # Use PyMOL to extract ligands
        cmd = f'''python -c "
import pymol
pymol.finish_launching(['pymol', '-c'])
pymol.cmd.load('{temp_input}')
pymol.cmd.save('{output_file}', '{selection}')
pymol.cmd.quit()
"'''
        
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        
        # Clean up temp file
        if os.path.exists(temp_input):
            os.remove(temp_input)
        
        if result.returncode != 0:
            print(f"PyMOL ligand extraction error: {result.stderr}")
            return False
        
        return True
    except Exception as e:
        print(f"Error extracting selected ligands: {e}")
        return False

def extract_ligands(pdb_content, output_file, ligand_residue_name=None, selected_ligands=None):
    """Extract ligands using MDAnalysis. Optionally restrict to selected ligands (list of dicts with resn, chain, resi)."""
    # Write input content to output file first
    with open(output_file, 'w') as f:
        f.write(pdb_content)
    
    try:
        # Run MDAnalysis command with the output file as input
        if selected_ligands:
            # Build selection from provided ligand list; include resid when present to disambiguate
            # when the same ligand (resn) appears multiple times in the same chain (GOL-A-1, GOL-A-2)
            parts = []
            for lig in selected_ligands:
                resn = lig.get('resn', '').strip()
                chain = lig.get('chain', '').strip()
                resi = lig.get('resi') if lig.get('resi') is not None else ''
                resi = str(resi).strip() if resi else ''
                if resn and chain:
                    if resi:
                        # Extract leading digits for resid in case of insertion codes (e.g. 100A -> 100)
                        m = re.search(r'^(-?\d+)', resi)
                        resid_val = m.group(1) if m else resi
                        parts.append(f"(resname {resn} and segid {chain} and resid {resid_val})")
                    else:
                        parts.append(f"(resname {resn} and segid {chain})")
                elif resn:
                    parts.append(f"resname {resn}")
            if parts:
                selection = ' or '.join(parts)
                cmd = f'''python -c "
import MDAnalysis as mda
u = mda.Universe('{output_file}')
u.select_atoms('{selection}').write('{output_file}')
"'''
            else:
                cmd = f"python -c \"open('{output_file}','w').write('\\n')\""
        elif ligand_residue_name:
            # Use specified ligand residue name - extract from both ATOM and HETATM records
            cmd = f'''python -c "
import MDAnalysis as mda
u = mda.Universe('{output_file}')
# Extract specific ligand residue from both ATOM and HETATM records
u.select_atoms('resname {ligand_residue_name}').write('{output_file}')
"'''
        else:
            # Auto-detect ligand residues
            cmd = f'''python -c "
import MDAnalysis as mda
u = mda.Universe('{output_file}')
# Get all unique residue names from HETATM records
hetatm_residues = set()
for atom in u.atoms:
    if atom.record_type == 'HETATM':
        hetatm_residues.add(atom.resname)
# Remove water and ions
ligand_residues = hetatm_residues - {{'HOH', 'WAT', 'TIP3', 'TIP4', 'SPC', 'SPCE', 'NA', 'CL', 'K', 'MG', 'CA', 'ZN', 'FE', 'MN', 'CU', 'NI', 'CO', 'CD', 'HG', 'PB', 'SR', 'BA', 'RB', 'CS', 'LI', 'F', 'BR', 'I', 'PO4', 'PO3', 'H2PO4', 'HPO4', 'H3PO4', 'SO4'}}
if ligand_residues:
    resname_sel = ' or '.join([f'resname {{res}}' for res in ligand_residues])
    u.select_atoms(resname_sel).write('{output_file}')
else:
    # No ligands found, create empty file
    with open('{output_file}', 'w') as f:
        f.write('\\n')
"'''
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            raise Exception(f"MDAnalysis error: {result.stderr}")
        
        # If specific ligand residue name was provided, convert ATOM to HETATM
        if ligand_residue_name:
            convert_atom_to_hetatm(output_file)
        
        return True
    except Exception as e:
        print(f"Error in extract_ligands: {e}")
        return False

def convert_atom_to_hetatm(pdb_file):
    """Convert ATOM records to HETATM in PDB file"""
    try:
        with open(pdb_file, 'r') as f:
            lines = f.readlines()
        
        # Convert ATOM to HETATM
        converted_lines = []
        for line in lines:
            if line.startswith('ATOM'):
                # Replace ATOM with HETATM
                converted_line = 'HETATM' + line[6:]
                converted_lines.append(converted_line)
            else:
                converted_lines.append(line)
        
        # Write back to file
        with open(pdb_file, 'w') as f:
            f.writelines(converted_lines)
        
        print(f"Converted ATOM records to HETATM in {pdb_file}")
        return True
    except Exception as e:
        print(f"Error converting ATOM to HETATM: {e}")
        return False

def extract_original_residue_info(ligand_file):
    """Extract original residue name, chain ID, and residue number from ligand PDB file"""
    residue_info = {}
    try:
        with open(ligand_file, 'r') as f:
            for line in f:
                if line.startswith(('ATOM', 'HETATM')):
                    resname = line[17:20].strip()
                    chain_id = line[21:22].strip()
                    resnum = line[22:26].strip()
                    # Store the first residue info we find (assuming single residue per file)
                    if resname and resname not in residue_info:
                        residue_info = {
                            'resname': resname,
                            'chain_id': chain_id,
                            'resnum': resnum
                        }
                        break  # We only need the first residue info
        return residue_info
    except Exception as e:
        print(f"Error extracting residue info: {e}")
        return {}

def restore_residue_info_in_pdb(pdb_file, original_resname, original_chain_id, original_resnum):
    """Restore original residue name, chain ID, and residue number in PDB file"""
    try:
        with open(pdb_file, 'r') as f:
            lines = f.readlines()
        
        restored_lines = []
        for line in lines:
            if line.startswith(('ATOM', 'HETATM')):
                # Restore residue name (columns 17-20)
                restored_line = line[:17] + f"{original_resname:>3}" + line[20:]
                # Restore chain ID (column 21)
                if original_chain_id:
                    restored_line = restored_line[:21] + original_chain_id + restored_line[22:]
                # Restore residue number (columns 22-26)
                if original_resnum:
                    restored_line = restored_line[:22] + f"{original_resnum:>4}" + restored_line[26:]
                restored_lines.append(restored_line)
            elif line.startswith('MASTER'):
                # Skip MASTER records
                continue
            else:
                restored_lines.append(line)
        
        with open(pdb_file, 'w') as f:
            f.writelines(restored_lines)
        
        print(f"Restored residue info: {original_resname} {original_chain_id} {original_resnum} in {pdb_file}")
        return True
    except Exception as e:
        print(f"Error restoring residue info: {e}")
        return False

def correct_ligand_with_openbabel(ligand_file, corrected_file):
    """Correct ligand using OpenBabel (add hydrogens at pH 7.4) and preserve original residue info"""
    ligand_path = os.path.abspath(ligand_file)
    corrected_path = os.path.abspath(corrected_file)
    if not os.path.isfile(ligand_path) or os.path.getsize(ligand_path) == 0:
        print("Ligand file missing or empty:", ligand_path)
        return False

    # Extract original residue info before OpenBabel processing
    residue_info = extract_original_residue_info(ligand_path)
    original_resname = residue_info.get('resname', 'UNL')
    original_chain_id = residue_info.get('chain_id', '')
    original_resnum = residue_info.get('resnum', '1')
    
    print(f"Original residue info: {original_resname} {original_chain_id} {original_resnum}")

    # Use OpenBabel to add hydrogens at pH 7.4
    cmd = f'obabel -i pdb {ligand_path} -o pdb -O {corrected_path} -p 7.4'
    success = run_command(cmd, f"Correcting ligand with OpenBabel")
    
    if not success:
        return False
    
    # Restore original residue name, chain ID, and residue number
    if residue_info:
        restore_residue_info_in_pdb(corrected_path, original_resname, original_chain_id, original_resnum)
    
    return True

def split_ligands_by_residue(ligand_file, output_dir):
    """Split multi-ligand PDB file into individual ligand files using MDAnalysis (one file per residue)
    This is more robust than splitting by TER records as it properly handles residue-based splitting.
    """
    ligand_files = []
    try:
        ligand_path = os.path.abspath(ligand_file)
        output_dir_abs = os.path.abspath(output_dir)
        
        # Use MDAnalysis to split ligands by residue - this is the robust method
        # Command: python -c "import MDAnalysis as mda; u=mda.Universe('3_ligands_extracted.pdb'); [res.atoms.write(f'3_ligand_extracted_{i}.pdb') for i,res in enumerate(u.residues,1)]"
        cmd = f'''python -c "import MDAnalysis as mda; import os; u=mda.Universe('{ligand_path}'); os.chdir('{output_dir_abs}'); [res.atoms.write(f'3_ligand_extracted_{{i}}.pdb') for i,res in enumerate(u.residues,1)]"'''
        
        print(f"Running MDAnalysis command to split ligands by residue...")
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=output_dir_abs)
        
        if result.returncode != 0:
            print(f"Error running MDAnalysis command: {result.stderr}")
            print(f"Command output: {result.stdout}")
            return []
        
        # Collect all generated ligand files
        ligand_files = []
        for f in os.listdir(output_dir):
            if f.startswith('3_ligand_extracted_') and f.endswith('.pdb'):
                ligand_files.append(os.path.join(output_dir, f))
        
        # Sort by number in filename (e.g., 3_ligand_extracted_1.pdb, 3_ligand_extracted_2.pdb, ...)
        ligand_files.sort(key=lambda x: int(os.path.basename(x).split('_')[-1].split('.')[0]))
        
        print(f"Split {len(ligand_files)} ligand(s) from {ligand_file}")
        return ligand_files
    except Exception as e:
        print(f"Error splitting ligands: {e}")
        import traceback
        traceback.print_exc()
        return []

def remove_connect_records(pdb_file):
    """Remove CONNECT and MASTER records from PDB file"""
    try:
        with open(pdb_file, 'r') as f:
            lines = f.readlines()
        
        # Filter out CONNECT and MASTER records
        filtered_lines = [line for line in lines if not line.startswith(('CONECT', 'MASTER'))]
        
        with open(pdb_file, 'w') as f:
            f.writelines(filtered_lines)
        
        print(f"Removed CONNECT and MASTER records from {pdb_file}")
        return True
    except Exception as e:
        print(f"Error removing CONNECT/MASTER records: {e}")
        return False

def convert_atom_to_hetatm_in_ligand(pdb_file):
    """Convert ATOM records to HETATM in ligand PDB file for consistency"""
    try:
        with open(pdb_file, 'r') as f:
            lines = f.readlines()
        
        converted_lines = []
        converted_count = 0
        for line in lines:
            if line.startswith('ATOM'):
                # Replace ATOM with HETATM, preserving the rest of the line
                converted_line = 'HETATM' + line[6:]
                converted_lines.append(converted_line)
                converted_count += 1
            else:
                converted_lines.append(line)
        
        with open(pdb_file, 'w') as f:
            f.writelines(converted_lines)
        
        if converted_count > 0:
            print(f"Converted {converted_count} ATOM record(s) to HETATM in {pdb_file}")
        
        return True
    except Exception as e:
        print(f"Error converting ATOM to HETATM: {e}")
        return False

def make_atom_names_distinct(pdb_file):
    """Make all atom names distinct (C1, C2, O1, O2, H1, H2, etc.) for antechamber compatibility
    Antechamber requires each atom to have a unique name.
    """
    try:
        from collections import defaultdict
        
        with open(pdb_file, 'r') as f:
            lines = f.readlines()
        
        # Track counts for each element type
        element_counts = defaultdict(int)
        modified_lines = []
        modified_count = 0
        
        for line in lines:
            if line.startswith(('ATOM', 'HETATM')):
                # Extract element from the last field (column 76-78) or from atom name (columns 12-16)
                # Try to get element from the last field first (more reliable)
                element = line[76:78].strip()
                
                # If element not found in last field, try to extract from atom name
                if not element:
                    atom_name = line[12:16].strip()
                    # Extract element symbol (first letter, or first two letters for two-letter elements)
                    if len(atom_name) >= 1:
                        # Check for two-letter elements (common ones: Cl, Br, etc.)
                        if len(atom_name) >= 2 and atom_name[:2].upper() in ['CL', 'BR', 'MG', 'CA', 'ZN', 'FE', 'MN', 'CU', 'NI', 'CO', 'CD', 'HG', 'PB', 'SR', 'BA', 'RB', 'CS', 'LI']:
                            element = atom_name[:2].upper()
                        else:
                            element = atom_name[0].upper()
                
                # Increment count for this element
                element_counts[element] += 1
                count = element_counts[element]
                
                # Create distinct atom name: Element + number (e.g., C1, C2, O1, O2, H1, H2)
                # Atom name is in columns 12-16 (4 characters, right-aligned)
                distinct_name = f"{element}{count}"
                
                # Ensure the name fits in 4 characters (right-aligned)
                if len(distinct_name) > 4:
                    # For long element names, use abbreviation or truncate
                    if element == 'CL':
                        distinct_name = f"Cl{count}"[:4]
                    elif element == 'BR':
                        distinct_name = f"Br{count}"[:4]
                    else:
                        distinct_name = distinct_name[:4]
                
                # Replace atom name (columns 12-16, right-aligned)
                modified_line = line[:12] + f"{distinct_name:>4}" + line[16:]
                modified_lines.append(modified_line)
                modified_count += 1
            else:
                modified_lines.append(line)
        
        with open(pdb_file, 'w') as f:
            f.writelines(modified_lines)
        
        if modified_count > 0:
            print(f"Made {modified_count} atom name(s) distinct in {pdb_file}")
            print(f"Element counts: {dict(element_counts)}")
        
        return True
    except Exception as e:
        print(f"Error making atom names distinct: {e}")
        import traceback
        traceback.print_exc()
        return False

def sanity_check_ligand_pdb(pdb_file):
    """Perform sanity checks on ligand PDB file after OpenBabel processing:
    1. Remove CONECT and MASTER records
    2. Convert ATOM records to HETATM for consistency
    3. Make all atom names distinct (C1, C2, O1, O2, H1, H2, etc.) for antechamber compatibility
    """
    try:
        # Step 1: Remove CONECT and MASTER records
        if not remove_connect_records(pdb_file):
            return False
        
        # Step 2: Convert ATOM to HETATM for consistency
        if not convert_atom_to_hetatm_in_ligand(pdb_file):
            return False
        
        # Step 3: Make atom names distinct (required by antechamber)
        if not make_atom_names_distinct(pdb_file):
            return False
        
        print(f"Sanity check completed for {pdb_file}")
        return True
    except Exception as e:
        print(f"Error in sanity check: {e}")
        return False

def merge_protein_and_ligand(protein_file, ligand_file, output_file, ligand_lines_list=None, ligand_groups=None):
    """Merge capped protein and corrected ligand(s) with proper PDB formatting
    
    Args:
        protein_file: Path to protein PDB file
        ligand_file: Path to ligand PDB file (optional, if ligand_lines_list or ligand_groups is provided)
        output_file: Path to output merged PDB file
        ligand_lines_list: List of ligand lines (optional, for backward compatibility - single ligand)
        ligand_groups: List of ligand line groups, where each group is a list of lines for one ligand (for multiple ligands with TER separation)
    """
    try:
        # Read protein file
        with open(protein_file, 'r') as f:
            protein_lines = f.readlines()
        
        # Get ligand lines - prioritize ligand_groups for multiple ligands
        if ligand_groups is not None:
            # Multiple ligands: each group will be separated by TER
            ligand_groups_processed = ligand_groups
        elif ligand_lines_list is not None:
            # Single ligand: wrap in a list for consistent processing
            ligand_groups_processed = [ligand_lines_list] if ligand_lines_list else []
        elif ligand_file:
            # Read ligand file
            with open(ligand_file, 'r') as f:
                ligand_lines = f.readlines()
            # Process ligand file: remove header info (CRYST, REMARK, etc.) and keep only ATOM/HETATM
            ligand_processed = []
            for line in ligand_lines:
                if line.startswith(('ATOM', 'HETATM')):
                    ligand_processed.append(line)
            ligand_groups_processed = [ligand_processed] if ligand_processed else []
        else:
            ligand_groups_processed = []
        
        # Process protein file: remove 'END' and add properly formatted 'TER'
        protein_processed = []
        last_atom_line = None
        for line in protein_lines:
            if line.strip() == 'END':
                # Create properly formatted TER card using the last atom's info
                if last_atom_line and last_atom_line.startswith('ATOM'):
                    # Extract atom number and residue info from last atom
                    atom_num = last_atom_line[6:11].strip()
                    res_name = last_atom_line[17:20].strip()
                    chain_id = last_atom_line[21:22].strip()
                    res_num = last_atom_line[22:26].strip()
                    ter_line = f"TER    {atom_num:>5}      {res_name} {chain_id}{res_num}\n"
                    protein_processed.append(ter_line)
                else:
                    protein_processed.append('TER\n')
            else:
                protein_processed.append(line)
                if line.startswith('ATOM'):
                    last_atom_line = line
        
        # Combine ligands with TER records between each ligand
        ligand_content = []
        for i, ligand_group in enumerate(ligand_groups_processed):
            if ligand_group:  # Only process non-empty groups
                # Add ligand atoms
                ligand_content.extend(ligand_group)
                # Add TER record after each ligand (except the last one, which will be followed by END)
                if i < len(ligand_groups_processed) - 1:
                    # Get last atom info from current ligand group to create TER
                    if ligand_group:
                        last_ligand_atom = ligand_group[-1]
                        if last_ligand_atom.startswith(('ATOM', 'HETATM')):
                            atom_num = last_ligand_atom[6:11].strip()
                            res_name = last_ligand_atom[17:20].strip()
                            chain_id = last_ligand_atom[21:22].strip()
                            res_num = last_ligand_atom[22:26].strip()
                            ter_line = f"TER    {atom_num:>5}      {res_name} {chain_id}{res_num}\n"
                            ligand_content.append(ter_line)
                        else:
                            ligand_content.append('TER\n')
        
        # Combine: protein + TER + ligand(s) with TER between ligands + END
        merged_content = ''.join(protein_processed) + ''.join(ligand_content) + 'END\n'
        
        with open(output_file, 'w') as f:
            f.write(merged_content)
        
        return True
    except Exception as e:
        print(f"Error merging files: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def prepare_structure(pdb_content, options, output_dir="output"):
    """Main function to prepare structure for AMBER simulation"""
    try:
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Define all file paths in output directory
        # Prefer the superimposed completed structure (0_complete_structure.pdb) when it
        # exists: it has ESMFold/minimized chains aligned to the original frame so that
        # ligands stay in the same coordinate frame throughout the pipeline.
        complete_structure_file = os.path.join(output_dir, "0_complete_structure.pdb")
        original_input_file = os.path.join(output_dir, "0_original_input.pdb")
        
        if os.path.exists(complete_structure_file):
            input_file = complete_structure_file
            logger.info("Using superimposed completed structure (0_complete_structure.pdb) as input for coordinate-frame consistency with ligands")
        else:
            input_file = original_input_file
            logger.info("Using original input (0_original_input.pdb) as input")
        
        user_chain_file = os.path.join(output_dir, "0_user_chain_selected.pdb")
        protein_file = os.path.join(output_dir, "1_protein_no_hydrogens.pdb")
        protein_capped_file = os.path.join(output_dir, "2_protein_with_caps.pdb")
        ligand_file = os.path.join(output_dir, "3_ligands_extracted.pdb")
        ligand_corrected_file = os.path.join(output_dir, "4_ligands_corrected.pdb")
        tleap_ready_file = os.path.join(output_dir, "tleap_ready.pdb")
        
        # Step 0: Save original input for reference (only if using original input)
        # If using completed structure, we don't overwrite it
        if input_file == original_input_file:
            print("Step 0: Saving original input...")
            with open(input_file, 'w') as f:
                f.write(pdb_content)
        else:
            # If using completed structure, read it instead of using pdb_content
            print("Step 0: Using completed structure as input...")
            with open(input_file, 'r') as f:
                pdb_content = f.read()
            # Also save a reference to original input if it doesn't exist
            if not os.path.exists(original_input_file):
                print("Step 0: Saving reference to original input...")
                with open(original_input_file, 'w') as f:
                    f.write(pdb_content)
        
        # Step 0.5: Extract user-selected chains and ligands
        selected_chains = options.get('selected_chains', [])
        selected_ligands = options.get('selected_ligands', [])
        
        if selected_chains:
            print(f"Step 0.5a: Extracting selected chains: {', '.join(selected_chains)}")
            if not extract_selected_chains(pdb_content, user_chain_file, selected_chains):
                raise Exception("Failed to extract selected chains")
        else:
            # No chains selected - raise an error instead of using all chains
            raise Exception("No chains selected. Please select at least one chain for structure preparation.")
        
        if selected_ligands:
            ligand_names = []
            for l in selected_ligands:
                s = f"{l.get('resn', '')}-{l.get('chain', '')}"
                if l.get('resi'):
                    s += f" (resi {l.get('resi')})"
                ligand_names.append(s)
            print(f"Step 0.5b: Extracting selected ligands: {ligand_names}")
            if not extract_selected_ligands(pdb_content, ligand_file, selected_ligands):
                raise Exception("Failed to extract selected ligands")
        else:
            print("Step 0.5b: No ligands selected, creating empty ligand file")
            with open(ligand_file, 'w') as f:
                f.write('\n')
        
        # Step 1: Extract protein only (remove hydrogens) from user-selected chains
        print("Step 1: Extracting protein without hydrogens from selected chains...")
        # Read the user-selected chain file
        with open(user_chain_file, 'r') as f:
            chain_content = f.read()
        
        if not extract_protein_only(chain_content, protein_file):
            raise Exception("Failed to extract protein")
        
        # Step 1b: Merge minimized chains into 1_protein_no_hydrogens.pdb only when the
        # input is NOT 0_complete_structure. When we use 0_complete_structure, it was
        # built by rebuild_pdb_with_esmfold, which already incorporates and superimposes
        # the minimized chains; the raw *_esmfold_minimized_noH.pdb files are in the
        # minimization frame, so merging them here would break the coordinate frame.
        if input_file != complete_structure_file:
            for path in glob.glob(os.path.join(output_dir, "*_chain_*_esmfold_minimized_noH.pdb")):
                name = os.path.basename(path).replace(".pdb", "")
                parts = name.split("_chain_")
                if len(parts) == 2:
                    chain_id = parts[1].split("_")[0]
                    replace_chain_in_pdb(protein_file, chain_id, path)
                    logger.info("Merged minimized chain %s into 1_protein_no_hydrogens.pdb", chain_id)
        
        # Step 2: Add capping groups (only if add_ace or add_nme is True)
        add_ace = options.get('add_ace', True)
        add_nme = options.get('add_nme', True)
        
        if add_ace or add_nme:
            print("Step 2: Adding ACE and NME capping groups...")
            if not add_capping_groups(protein_file, protein_capped_file):
                raise Exception("Failed to add capping groups")
        else:
            print("Step 2: Skipping capping groups (add_ace=False, add_nme=False)")
            print("Using protein without capping - copying to capped file")
            # Copy protein file to capped file (no capping)
            shutil.copy2(protein_file, protein_capped_file)
        
        # Step 3: Handle ligands (use pre-extracted ligand file)
        preserve_ligands = options.get('preserve_ligands', True)
        ligand_present = False
        ligand_count = 0
        selected_ligand_count = 0  # Store count from selected_ligands separately
        
        # Count selected ligands if provided (before processing)
        if selected_ligands:
            # Count unique ligand entities (by residue name, chain, and residue number)
            unique_ligands = set()
            for lig in selected_ligands:
                resn = str(lig.get('resn') or '')
                chain = str(lig.get('chain') or '')
                resi = str(lig.get('resi') or '')
                # Create unique identifier (resi disambiguates when same resn+chain appears multiple times)
                unique_id = f"{resn}_{chain}_{resi}"
                unique_ligands.add(unique_id)
            selected_ligand_count = len(unique_ligands)
            ligand_count = selected_ligand_count  # Initialize with selected count
            print(f"Found {selected_ligand_count} unique selected ligand(s)")
        
        if preserve_ligands:
            print("Step 3: Processing pre-extracted ligands...")
            
            # Check if ligand file has content (not just empty or newline)
            with open(ligand_file, 'r') as f:
                ligand_content = f.read().strip()
            
            if ligand_content and len(ligand_content) > 1:
                ligand_present = True
                print("Found pre-extracted ligands")
                
                # Split ligands into individual files using MDAnalysis (by residue)
                individual_ligand_files = split_ligands_by_residue(ligand_file, output_dir)
                # Update ligand_count based on actual split results if not already set from selected_ligands
                if not selected_ligands or len(individual_ligand_files) != ligand_count:
                    ligand_count = len(individual_ligand_files)
                    print(f"Split into {ligand_count} individual ligand file(s)")
                
                if ligand_count == 0:
                    print("Warning: No ligands could be extracted from file")
                    shutil.copy2(protein_capped_file, tleap_ready_file)
                else:
                    print(f"Processing {ligand_count} ligand(s) individually...")
                    
                    # Process each ligand: OpenBabel -> sanity check -> final corrected file
                    corrected_ligand_files = []
                    for i, individual_file in enumerate(individual_ligand_files, 1):
                        # OpenBabel output file (intermediate, kept for reference)
                        obabel_file = os.path.join(output_dir, f"4_ligands_corrected_obabel_{i}.pdb")
                        # Final corrected file (after sanity checks)
                        corrected_file = os.path.join(output_dir, f"4_ligands_corrected_{i}.pdb")
                        
                        # Use OpenBabel to add hydrogens (write to obabel_file)
                        if not correct_ligand_with_openbabel(individual_file, obabel_file):
                            print(f"Error: Failed to process ligand {i} with OpenBabel")
                            continue
                        
                        # Copy obabel file to corrected file before sanity check
                        shutil.copy2(obabel_file, corrected_file)
                        
                        # Perform sanity check on corrected_file: remove CONECT/MASTER, convert ATOM to HETATM, make names distinct
                        if not sanity_check_ligand_pdb(corrected_file):
                            print(f"Warning: Sanity check failed for ligand {i}, but continuing...")
                        
                        corrected_ligand_files.append(corrected_file)
                    
                    if not corrected_ligand_files:
                        print("Error: Failed to process any ligands")
                        return {
                            'error': 'Failed to process ligands with OpenBabel',
                            'prepared_structure': '',
                            'original_atoms': 0,
                            'prepared_atoms': 0,
                            'removed_components': {},
                            'added_capping': {},
                            'preserved_ligands': 0,
                            'ligand_present': False
                        }
                    
                    # Merge all corrected ligands into a single file for tleap_ready
                    # Read all corrected ligand files and group them by ligand (for TER separation)
                    all_ligand_groups = []
                    for corrected_lig_file in corrected_ligand_files:
                        with open(corrected_lig_file, 'r') as f:
                            lig_lines = [line for line in f if line.startswith(('ATOM', 'HETATM'))]
                            if lig_lines:  # Only add non-empty ligand groups
                                all_ligand_groups.append(lig_lines)
                    
                    # Create combined ligand file (4_ligands_corrected.pdb) for separate download
                    with open(ligand_corrected_file, 'w') as f:
                        for i, lig_group in enumerate(all_ligand_groups):
                            for line in lig_group:
                                f.write(line if line.endswith('\n') else line + '\n')
                            if i < len(all_ligand_groups) - 1:
                                f.write('TER\n')
                        f.write('END\n')
                    print(f"Created combined ligand file: {ligand_corrected_file}")
                    
                    # Merge protein and all ligands (with TER records between ligands)
                    if not merge_protein_and_ligand(protein_capped_file, None, tleap_ready_file, ligand_groups=all_ligand_groups):
                        raise Exception("Failed to merge protein and ligands")
            elif selected_ligands and ligand_count > 0:
                # If ligands were selected but file is empty, still mark as present if we have a count
                ligand_present = True
                print(f"Ligands were selected ({ligand_count} unique), but ligand file appears empty")
                # Use protein only since no ligand content found
                shutil.copy2(protein_capped_file, tleap_ready_file)
            else:
                print("No ligands found in pre-extracted file, using protein only")
                # Copy protein file to tleap_ready
                shutil.copy2(protein_capped_file, tleap_ready_file)
        else:
            print("Step 3: Skipping ligand processing (preserve_ligands=False)")
            print("Using protein only - copying capped protein to tleap_ready")
            # Copy protein file to tleap_ready (protein only, no ligands)
            shutil.copy2(protein_capped_file, tleap_ready_file)
        
        # Ensure tleap_ready.pdb exists before proceeding
        if not os.path.exists(tleap_ready_file):
            print(f"Error: tleap_ready.pdb was not created. Checking what went wrong...")
            # Try to create it from protein_capped_file as fallback
            if os.path.exists(protein_capped_file):
                print("Creating tleap_ready.pdb from protein_capped_file as fallback...")
                shutil.copy2(protein_capped_file, tleap_ready_file)
            else:
                raise Exception(f"tleap_ready.pdb was not created and protein_capped_file also doesn't exist")
        
        # Remove CONNECT records from tleap_ready.pdb (PyMOL adds them)
        print("Removing CONNECT records from tleap_ready.pdb...")
        if not remove_connect_records(tleap_ready_file):
            print("Warning: Failed to remove CONNECT records, but continuing...")
        
        # Read the final prepared structure
        if not os.path.exists(tleap_ready_file):
            raise Exception("tleap_ready.pdb does not exist after processing")
        
        with open(tleap_ready_file, 'r') as f:
            prepared_content = f.read()
            
            # Calculate statistics
            original_atoms = len([line for line in pdb_content.split('\n') if line.startswith('ATOM')])
            prepared_atoms = len([line for line in prepared_content.split('\n') if line.startswith('ATOM')])
            
            # Calculate removed components
            water_count = len([line for line in pdb_content.split('\n') if line.startswith('HETATM') and line[17:20].strip() in ['HOH', 'WAT', 'TIP3', 'TIP4', 'TIP5', 'SPC', 'SPCE']])
            ion_count = len([line for line in pdb_content.split('\n') if line.startswith('HETATM') and line[17:20].strip() in ['NA', 'CL', 'K', 'MG', 'CA', 'ZN', 'FE', 'MN', 'CU', 'NI', 'CO', 'CD', 'HG', 'PB', 'SR', 'BA', 'RB', 'CS', 'LI', 'F', 'BR', 'I', 'PO4', 'PO3', 'H2PO4', 'HPO4', 'H3PO4']])
            hydrogen_count = len([line for line in pdb_content.split('\n') if line.startswith('ATOM') and line[76:78].strip() == 'H'])
            
            # If not preserving ligands, count them as removed
            ligand_count = 0
            if not preserve_ligands and ligand_present:
                # Count ligands from the pre-extracted file
                with open(ligand_file, 'r') as f:
                    ligand_lines = [line for line in f if line.startswith('HETATM')]
                ligand_count = len(set(line[17:20].strip() for line in ligand_lines))
            
            removed_components = {
                'water': water_count,
                'ions': ion_count,
                'hydrogens': hydrogen_count,
                'ligands': ligand_count
            }
            
            # Calculate added capping groups (only if capping was performed)
            if add_ace or add_nme:
                # Count unique ACE and NME residues, not individual atoms
                ace_residues = set()
                nme_residues = set()
                
                for line in prepared_content.split('\n'):
                    if line.startswith('ATOM') and 'ACE' in line:
                        # Extract residue number to count unique ACE groups
                        res_num = line[22:26].strip()
                        ace_residues.add(res_num)
                    elif line.startswith('ATOM') and 'NME' in line:
                        # Extract residue number to count unique NME groups
                        res_num = line[22:26].strip()
                        nme_residues.add(res_num)
                
                added_capping = {
                    'ace_groups': len(ace_residues),
                    'nme_groups': len(nme_residues)
                }
            else:
                added_capping = {
                    'ace_groups': 0,
                    'nme_groups': 0
                }
            
            # Count preserved ligands
            # Priority: 1) selected_ligands count, 2) processed ligand_count, 3) 0
            if preserve_ligands:
                if selected_ligand_count > 0:
                    # Use count from selected_ligands (most reliable)
                    preserved_ligands = selected_ligand_count
                    print(f"Using selected ligand count: {preserved_ligands}")
                elif ligand_present and ligand_count > 0:
                    # Use count from processing
                    preserved_ligands = ligand_count
                    print(f"Using processed ligand count: {preserved_ligands}")
                elif ligand_present:
                    # Ligands were present but count is 0, try to count from tleap_ready
                    # Count unique ligand residue names in tleap_ready.pdb
                    ligand_resnames = set()
                    for line in prepared_content.split('\n'):
                        if line.startswith('HETATM'):
                            resname = line[17:20].strip()
                            if resname and resname not in ['HOH', 'WAT', 'TIP', 'SPC', 'NA', 'CL', 'ACE', 'NME']:
                                ligand_resnames.add(resname)
                    preserved_ligands = len(ligand_resnames)
                    print(f"Counted {preserved_ligands} unique ligand residue name(s) from tleap_ready.pdb")
                else:
                    preserved_ligands = 0
            else:
                preserved_ligands = 0
            
            result = {
                'prepared_structure': prepared_content,
                'original_atoms': original_atoms,
                'prepared_atoms': prepared_atoms,
                'removed_components': removed_components,
                'added_capping': added_capping,
                'preserved_ligands': preserved_ligands,
                'ligand_present': ligand_present,
                'separate_ligands': options.get('separate_ligands', False)
            }
            
            # If separate ligands is enabled and ligands are present, include ligand content
            if ligand_present and options.get('separate_ligands', False):
                with open(ligand_corrected_file, 'r') as f:
                    result['ligand_content'] = f.read()
            
            return result
        
    except Exception as e:
        return {
            'error': str(e),
            'prepared_structure': '',
            'original_atoms': 0,
            'prepared_atoms': 0,
            'removed_components': {},
            'added_capping': {},
            'preserved_ligands': 0,
            'ligand_present': False
        }

def parse_structure_info(pdb_content):
    """Parse structure information for display"""
    lines = pdb_content.split('\n')
    atom_count = 0
    chains = set()
    residues = set()
    water_molecules = 0
    ions = 0
    ligands = set()
    hetatoms = 0
    
    # Common water molecule names
    water_names = {'HOH', 'WAT', 'TIP3', 'TIP4', 'SPC', 'SPCE'}
    
    # Common ion names
    ion_names = {'NA', 'CL', 'K', 'MG', 'CA', 'ZN', 'FE', 'MN', 'CU', 'NI', 'CO', 'CD', 'HG', 'PB', 'SR', 'BA', 'RB', 'CS', 'LI', 'F', 'BR', 'I', 'PO4', 'PO3', 'H2PO4', 'HPO4', 'H3PO4','SO4'}
    
    # Common ligand indicators
    ligand_indicators = {'ATP', 'ADP', 'AMP', 'GDP', 'GTP', 'NAD', 'FAD', 'HEM', 'HEME', 'COA', 'SAM', 'PLP', 'THF', 'FMN', 'FAD', 'NADP', 'UDP', 'CDP', 'TDP', 'GDP', 'ADP', 'ATP'}

    for line in lines:
        if line.startswith('ATOM'):
            atom_count += 1
            chain_id = line[21:22].strip()
            if chain_id:
                chains.add(chain_id)
            
            res_name = line[17:20].strip()
            res_num = line[22:26].strip()
            residues.add(f"{res_name}{res_num}")
        elif line.startswith('HETATM'):
            hetatoms += 1
            res_name = line[17:20].strip()
            
            if res_name in water_names:
                water_molecules += 1
            elif res_name in ion_names:
                ions += 1
            elif res_name in ligand_indicators:
                ligands.add(res_name)

    # Count unique water molecules
    unique_water_residues = set()
    for line in lines:
        if line.startswith('HETATM'):
            res_name = line[17:20].strip()
            res_num = line[22:26].strip()
            if res_name in water_names:
                unique_water_residues.add(f"{res_name}{res_num}")

    return {
        'atom_count': atom_count,
        'chains': list(chains),
        'residue_count': len(residues),
        'water_molecules': len(unique_water_residues),
        'ions': ions,
        'ligands': list(ligands),
        'hetatoms': hetatoms
    }

def test_structure_preparation():
    """Test function to verify structure preparation works correctly"""
    # Create a simple test PDB content
    test_pdb = """HEADER    TEST PROTEIN
ATOM      1  N   MET A   1      16.347  37.019  21.335  1.00 50.73           N  
ATOM      2  CA  MET A   1      15.737  37.120  20.027  1.00 45.30           C  
ATOM      3  C   MET A   1      15.955  35.698  19.546  1.00 41.78           C  
ATOM      4  O   MET A   1      16.847  35.123  20.123  1.00 40.15           O  
ATOM      5  CB  MET A   1      14.234  37.456  19.789  1.00 44.12           C  
ATOM      6  CG  MET A   1      13.456  36.123  19.234  1.00 43.45           C  
ATOM      7  SD  MET A   1      12.123  35.456  18.123  1.00 42.78           S  
ATOM      8  CE  MET A   1      11.456  34.123  17.456  1.00 42.11           C  
ATOM      9  N   ALA A   2      15.123  35.456  18.789  1.00 40.44           N  
ATOM     10  CA  ALA A   2      14.456  34.123  18.123  1.00 39.77           C  
ATOM     11  C   ALA A   2      13.123  33.456  17.456  1.00 39.10           C  
ATOM     12  O   ALA A   2      12.456  32.123  16.789  1.00 38.43           O  
ATOM     13  CB  ALA A   2      13.789  33.123  17.123  1.00 38.76           C  
ATOM     14  N   ALA A   3      12.789  32.456  16.123  1.00 38.09           N  
ATOM     15  CA  ALA A   3      11.456  31.789  15.456  1.00 37.42           C  
ATOM     16  C   ALA A   3      10.123  30.456  14.789  1.00 36.75           C  
ATOM     17  O   ALA A   3       9.456  29.123  14.123  1.00 36.08           O  
ATOM     18  CB  ALA A   3       9.789  29.456  13.456  1.00 35.41           C  
ATOM     19  OXT ALA A   3       8.123  28.789  13.456  1.00 35.74           O  
HETATM   20  O   HOH A   4      20.000  20.000  20.000  1.00 20.00           O  
HETATM   21  H1  HOH A   4      20.500  20.500  20.500  1.00 20.00           H  
HETATM   22  H2  HOH A   4      19.500  19.500  19.500  1.00 20.00           H  
HETATM   23  NA  NA  A   5      25.000  25.000  25.000  1.00 25.00          NA  
HETATM   24  CL  CL  A   6      30.000  30.000  30.000  1.00 30.00          CL  
HETATM    1  PG  GTP A 180      29.710  30.132  -5.989  1.00 52.48      A    P  
HETATM    2  O1G GTP A 180      29.197  28.937  -5.265  1.00 43.51      A    O  
HETATM    3  O2G GTP A 180      30.881  29.816  -6.827  1.00 63.11      A    O  
HETATM    4  O3G GTP A 180      30.013  31.278  -5.117  1.00 29.97      A    O  
HETATM    5  O3B GTP A 180      28.517  30.631  -6.995  1.00 23.23      A    O  
HETATM    6  PB  GTP A 180      27.017  31.171  -6.766  1.00 29.58      A    P  
HETATM    7  O1B GTP A 180      26.072  30.050  -6.958  1.00 17.62      A    O  
HETATM    8  O2B GTP A 180      26.960  31.913  -5.483  1.00 38.76      A    O  
HETATM    9  O3A GTP A 180      26.807  32.212  -7.961  1.00 13.12      A    O  
HETATM   10  PA  GTP A 180      26.277  33.726  -8.045  1.00 25.06      A    P  
HETATM   11  O1A GTP A 180      25.089  33.867  -7.187  1.00 44.06      A    O  
HETATM   12  O2A GTP A 180      27.427  34.635  -7.843  1.00 23.47      A    O  
HETATM   13  O5' GTP A 180      25.804  33.834  -9.555  1.00 42.05      A    O  
HETATM   14  C5' GTP A 180      26.615  33.475 -10.679  1.00 19.97      A    C  
HETATM   15  C4' GTP A 180      26.219  34.288 -11.894  1.00 14.90      A    C  
HETATM   16  O4' GTP A 180      24.826  34.017 -12.143  1.00 19.00      A    O  
HETATM   17  C3' GTP A 180      26.372  35.802 -11.724  1.00  4.96      A    C  
HETATM   18  O3' GTP A 180      26.880  36.347 -12.936  1.00 44.49      A    O  
HETATM   19  C2' GTP A 180      24.932  36.243 -11.481  1.00 17.12      A    C  
HETATM   20  O2' GTP A 180      24.719  37.581 -11.901  1.00 32.45      A    O  
HETATM   21  C1' GTP A 180      24.069  35.240 -12.240  1.00 16.17      A    C  
HETATM   22  N9  GTP A 180      22.724  35.005 -11.630  1.00 28.10      A    N  
HETATM   23  C8  GTP A 180      22.443  34.655 -10.325  1.00 27.05      A    C  
HETATM   24  N7  GTP A 180      21.168  34.483 -10.079  1.00 33.25      A    N  
HETATM   25  C5  GTP A 180      20.554  34.737 -11.307  1.00 26.23      A    C  
HETATM   26  C6  GTP A 180      19.183  34.712 -11.659  1.00 29.31      A    C  
HETATM   27  O6  GTP A 180      18.205  34.448 -10.957  1.00 40.80      A    O  
HETATM   28  N1  GTP A 180      19.000  35.036 -13.013  1.00 26.85      A    N  
HETATM   29  C2  GTP A 180      20.022  35.339 -13.903  1.00 28.70      A    C  
HETATM   30  N2  GTP A 180      19.627  35.619 -15.147  1.00 44.24      A    N  
HETATM   31  N3  GTP A 180      21.301  35.367 -13.569  1.00 21.67      A    N  
HETATM   32  C4  GTP A 180      21.489  35.054 -12.257  1.00 41.91      A    C  
END
"""
    
    options = {
        'remove_water': True,
        'remove_ions': True,
        'remove_hydrogens': True,
        'add_ace': True,
        'add_nme': True,
        'preserve_ligands': True,
        'separate_ligands': False,
        'fix_missing_atoms': False,
        'standardize_residues': False
    }
    
    print("Testing structure preparation...")
    result = prepare_structure(test_pdb, options, "output")
    
    print("\n=== STATISTICS ===")
    print(f"Original atoms: {result['original_atoms']}")
    print(f"Prepared atoms: {result['prepared_atoms']}")
    print(f"Removed: {result['removed_components']}")
    print(f"Added: {result['added_capping']}")
    print(f"Ligands: {result['preserved_ligands']}")
    print(f"Ligand present: {result['ligand_present']}")
    
    print(f"\nTest completed! Check 'output' folder for results:")
    print("- 1_protein_no_hydrogens.pdb (protein without hydrogens)")
    print("- 2_protein_with_caps.pdb (protein with ACE/NME caps)")
    print("- 3_ligands_extracted.pdb (extracted ligands, if any)")
    print("- 4_ligands_corrected.pdb (corrected ligands, if any)")
    print("- tleap_ready.pdb (final structure ready for tleap)")

if __name__ == "__main__":
    test_structure_preparation()
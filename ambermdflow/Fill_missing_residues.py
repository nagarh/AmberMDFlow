import requests
from collections import defaultdict
from textwrap import wrap
import re


def get_pdb_id_from_pdb_file(pdb_path):
    """
    Extract the 4-character PDB ID from a PDB file.

    By convention, PDB files have a line starting with 'HEADER' where
    columns 63–66 contain the PDB ID code.

    If that cannot be found, this function will raise a ValueError so
    that the pipeline fails loudly instead of silently doing the wrong thing.
    """
    with open(pdb_path, "r") as fh:
        for line in fh:
            if line.startswith("HEADER") and len(line) >= 66:
                pdb_id = line[62:66].strip()
                if pdb_id:
                    return pdb_id.upper()

    raise ValueError(
        f"Could not determine PDB ID from file: {pdb_path}. "
        "Expected a 'HEADER' record with ID in columns 63–66."
    )

GRAPHQL_URL = "https://data.rcsb.org/graphql"

def detect_missing_residues(pdb_id):
    url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
    response = requests.get(url)
    response.raise_for_status()

    missing_by_chain = defaultdict(list)

    for line in response.text.splitlines():
        if line.startswith("REMARK 465"):
            parts = line.split()
            if len(parts) >= 5 and parts[2].isalpha():
                resname = parts[2]
                chain = parts[3]

                # Extract residue number (strip insertion code, handle negative numbers)
                match = re.match(r"(-?\d+)", parts[4])
                if match:
                    resnum = int(match.group(1))
                    missing_by_chain[chain].append((resname, resnum))

    return dict(missing_by_chain)

def get_chain_sequences(pdb_id):
    query = """
    query ChainSequences($pdb_id: String!) {
      entry(entry_id: $pdb_id) {
        polymer_entities {
          entity_poly {
            pdbx_seq_one_letter_code_can
          }
          polymer_entity_instances {
            rcsb_polymer_entity_instance_container_identifiers {
              auth_asym_id
            }
          }
        }
      }
    }
    """

    r = requests.post(
        GRAPHQL_URL,
        json={"query": query, "variables": {"pdb_id": pdb_id}}
    )
    r.raise_for_status()

    chain_seqs = {}

    for entity in r.json()["data"]["entry"]["polymer_entities"]:
        seq = entity["entity_poly"]["pdbx_seq_one_letter_code_can"]
        for inst in entity["polymer_entity_instances"]:
            chain = inst[
                "rcsb_polymer_entity_instance_container_identifiers"
            ]["auth_asym_id"]
            chain_seqs[chain] = seq

    return chain_seqs

def trim_residues_from_edges(sequence, n_terminal_trim=0, c_terminal_trim=0):
    """
    Trim residues from the edges (N-terminal and C-terminal) of a sequence.
    Only trims from the edges, not from loops in between.
    
    Args:
        sequence: str
            The amino acid sequence to trim
        n_terminal_trim: int
            Number of residues to remove from the N-terminal (start)
        c_terminal_trim: int
            Number of residues to remove from the C-terminal (end)
    
    Returns:
        str: The trimmed sequence
    
    Raises:
        ValueError: If trim counts exceed sequence length or are negative
    """
    if n_terminal_trim < 0 or c_terminal_trim < 0:
        raise ValueError("Trim counts must be non-negative")
    
    if n_terminal_trim + c_terminal_trim >= len(sequence):
        raise ValueError(
            f"Total trim count ({n_terminal_trim + c_terminal_trim}) exceeds sequence length ({len(sequence)})"
        )
    
    # Trim from N-terminal (start) and C-terminal (end)
    trimmed = sequence[n_terminal_trim:len(sequence) - c_terminal_trim]
    
    return trimmed


def trim_chains_sequences(chains_with_sequences, trim_specs):
    """
    Apply trimming to multiple chain sequences based on specifications.
    
    Args:
        chains_with_sequences: dict
            Dictionary mapping chain IDs to sequences
            Example: {'A': 'MKTAYIAKQR...', 'B': 'MKTAYIAKQR...'}
        trim_specs: dict
            Dictionary mapping chain IDs to trim specifications
            Each specification is a dict with 'n_terminal' and/or 'c_terminal' keys
            Example: {'A': {'n_terminal': 5, 'c_terminal': 3}, 'B': {'n_terminal': 2}}
    
    Returns:
        dict: Dictionary mapping chain IDs to trimmed sequences
    """
    trimmed_chains = {}
    
    for chain, sequence in chains_with_sequences.items():
        if chain in trim_specs:
            spec = trim_specs[chain]
            n_term = spec.get('n_terminal', 0)
            c_term = spec.get('c_terminal', 0)
            
            try:
                trimmed_seq = trim_residues_from_edges(sequence, n_term, c_term)
                trimmed_chains[chain] = trimmed_seq
            except ValueError as e:
                raise ValueError(f"Error trimming chain {chain}: {str(e)}")
        else:
            # No trimming specified for this chain, keep original
            trimmed_chains[chain] = sequence
    
    return trimmed_chains


def write_fasta_for_missing_chains(pdb_id, chains_with_missing, output_dir=None):
    """
    Write FASTA file for chains with missing residues.
    
    Args:
        pdb_id: PDB identifier
        chains_with_missing: Dictionary mapping chain IDs to sequences
        output_dir: Optional output directory. If None, writes to current directory.
    """
    filename = f"{pdb_id}_chains_with_missing.fasta"
    
    if output_dir:
        from pathlib import Path
        output_path = Path(output_dir) / filename
    else:
        output_path = filename

    with open(output_path, "w") as f:
        for chain, seq in chains_with_missing.items():
            f.write(f">{pdb_id.upper()}_{chain}\n")
            for line in wrap(seq, 60):
                f.write(line + "\n")

    print(f"Wrote FASTA: {output_path}")

def run_esmfold(sequence):
    response = requests.post(
        "https://api.esmatlas.com/foldSequence/v1/pdb/",
        data=sequence,
        timeout=300
    )
    response.raise_for_status()
    return response.text


def merge_non_protein_atoms(original_pdb_path, protein_pdb_path, output_pdb_path, chains_to_replace):
    """
    Add non-protein atoms (water, ions, ligands) from original file to the completed protein structure.
    
    Parameters:
    -----------
    original_pdb_path : str
        Path to the original PDB file
    protein_pdb_path : str
        Path to the temporary protein-only PDB file
    output_pdb_path : str
        Path where the final merged PDB will be written
    chains_to_replace : list[str]
        List of chain IDs that were replaced by ESMFold (not used, kept for compatibility)
    """
    import os
    
    # Extract non-protein atoms (HETATM records) from original PDB
    non_protein_atoms = []
    
    if not os.path.exists(original_pdb_path):
        print(f"Warning: Original PDB file not found: {original_pdb_path}")
        # Just copy the protein file if original doesn't exist
        if os.path.exists(protein_pdb_path):
            import shutil
            shutil.copy2(protein_pdb_path, output_pdb_path)
        return
    
    # Read HETATM records from original PDB
    with open(original_pdb_path, 'r') as f:
        for line in f:
            if line.startswith('HETATM'):
                # Include all HETATM records (water, ions, ligands)
                non_protein_atoms.append(line)
    
    # Read the completed protein structure
    if not os.path.exists(protein_pdb_path):
        print(f"Error: Protein PDB file not found: {protein_pdb_path}")
        return
    
    # Write merged PDB file: protein structure + non-protein atoms
    with open(output_pdb_path, 'w') as f:
        # Write the completed protein structure (all lines except END)
        with open(protein_pdb_path, 'r') as protein_file:
            for line in protein_file:
                if not line.startswith('END'):
                    f.write(line)
        
        # Add non-protein atoms (water, ions, ligands) from original
        for line in non_protein_atoms:
            f.write(line)
        
        # Write END record at the very end
        f.write("END                                                                             \n")
    
    print(f"✅ Added {len(non_protein_atoms)} non-protein atoms to completed structure")


def rebuild_pdb_with_esmfold(
    pdb_id,
    chains_to_replace,
    output_pdb=None,
    original_pdb_path=None,
    chains_use_minimized=None,
):
    """
    pdb_id: str
        Original crystal structure object name (e.g. '3hhr')

    chains_to_replace: list[str]
        Chains that were missing residues and replaced by ESMFold
        Example: ['A', 'B', 'C']

    output_pdb: str, optional
        Output PDB filename.

    original_pdb_path: str, optional
        Path to the original PDB file that should be loaded into PyMOL
        as the reference object named `pdb_id`. If None, defaults to
        '../../output/0_original_input.pdb'.

    chains_use_minimized: list[str], optional
        For these chains, load the superimposed minimized PDB
        ({pdb_id}_chain_{c}_esmfold_minimized_noH.pdb) instead of the
        ESMFold PDB. The minimized structure is aligned to the original
        the same way as ESMFold (CA-based superimposition).
    """

    from pymol import cmd

    # -----------------------------
    # 0. Clean up any existing objects with the same names
    # -----------------------------
    try:
        # Delete existing objects if they exist
        existing_objects = cmd.get_object_list()
        if pdb_id in existing_objects:
            cmd.delete(pdb_id)
        
        # Delete any existing ESMFold objects for the chains we're processing
        for chain in chains_to_replace:
            esm_obj = f"{pdb_id}_chain_{chain}_esmfold"
            if esm_obj in existing_objects:
                cmd.delete(esm_obj)
        
        # Delete final_model if it exists
        if "final_model" in existing_objects:
            cmd.delete("final_model")
    except Exception as e:
        print(f"Warning: Could not clean up existing objects: {e}")

    # -----------------------------
    # 1. Load original PDB into PyMOL
    # -----------------------------
    if original_pdb_path is None:
        # Default to the pipeline output location
        original_pdb_path = "../../output/0_original_input.pdb"

    print(f"Loading original PDB from {original_pdb_path} as object '{pdb_id}'")
    cmd.load(original_pdb_path, pdb_id)

    if output_pdb is None:
        output_pdb = f"{pdb_id}_rebuilt.pdb"

    # -----------------------------
    # 2. Align each ESMFold (or minimized) chain and fix chain IDs
    # -----------------------------
    for chain in chains_to_replace:
        esm_obj = f"{pdb_id}_chain_{chain}_esmfold"

        # For minimized chains, use the superimposed minimized noH PDB
        # (minimization writes in a different frame; we align it to original here).
        if chains_use_minimized and chain in chains_use_minimized:
            esm_pdb_filename = f"{pdb_id}_chain_{chain}_esmfold_minimized_noH.pdb"
            print(f"Loading minimized PDB {esm_pdb_filename} as object '{esm_obj}' (will superimpose to original)")
        else:
            esm_pdb_filename = f"{pdb_id}_chain_{chain}_esmfold.pdb"
            print(f"Loading ESMFold PDB {esm_pdb_filename} as object '{esm_obj}'")
        cmd.load(esm_pdb_filename, esm_obj)

        # ESMFold outputs everything as chain A by default.
        # Rename the chain in the loaded object to match the target chain ID.
        print(f"Renaming chain A -> {chain} in {esm_obj}")
        cmd.alter(esm_obj, f"chain='{chain}'")
        cmd.sort(esm_obj)  # Rebuild internal indices after alter

        align_cmd = (
            f"{esm_obj} and name CA",
            f"{pdb_id} and chain {chain} and name CA"
        )

        print(f"Aligning {esm_obj} to {pdb_id} chain {chain}")
        cmd.align(*align_cmd)

    # -----------------------------
    # 3. Build selection strings
    # -----------------------------
    chains_str = "+".join(chains_to_replace)

    esm_objs_str = " or ".join(
        f"{pdb_id}_chain_{chain}_esmfold"
        for chain in chains_to_replace
    )

    selection = (
        f"({pdb_id} and not chain {chains_str}) or "
        f"({esm_objs_str})"
    )

    # -----------------------------
    # 4. Create final model
    # -----------------------------
    cmd.select("final_model", selection)

    # -----------------------------
    # 5. Save rebuilt structure (protein only)
    # -----------------------------
    import os
    temp_protein_pdb = output_pdb.replace('.pdb', '_protein_temp.pdb')
    cmd.save(temp_protein_pdb, "final_model")
    
    # -----------------------------
    # 6. Add non-protein atoms from original PDB
    # -----------------------------
    print(f"Adding non-protein atoms from original file...")
    # Convert paths to absolute paths if they're relative
    abs_original = os.path.abspath(original_pdb_path) if original_pdb_path else None
    abs_temp = os.path.abspath(temp_protein_pdb)
    abs_output = os.path.abspath(output_pdb)
    merge_non_protein_atoms(abs_original, abs_temp, abs_output, chains_to_replace)
    
    # Clean up temporary protein file
    try:
        if os.path.exists(temp_protein_pdb):
            os.remove(temp_protein_pdb)
    except Exception as e:
        print(f"Warning: Could not remove temporary file {temp_protein_pdb}: {e}")
    
    # -----------------------------
    # 7. Clean up temporary objects (keep final_model for potential reuse)
    # -----------------------------
    try:
        # Delete the original and ESMFold objects, but keep final_model
        cmd.delete(pdb_id)
        for chain in chains_to_replace:
            esm_obj = f"{pdb_id}_chain_{chain}_esmfold"
            cmd.delete(esm_obj)
    except Exception as e:
        print(f"Warning: Could not clean up temporary objects: {e}")

    print(f"✅ Final rebuilt structure saved as: {output_pdb}")


if __name__ == "__main__":
    # Path to the original input PDB used by the pipeline
    original_pdb_path = "../../output/0_original_input.pdb"

    # Automatically infer the PDB ID from the original PDB file,
    # instead of hard-coding it (e.g., '3hhr').
    pdb_id = get_pdb_id_from_pdb_file(original_pdb_path)
    print(f"Detected PDB ID from original file: {pdb_id}")

    # 1) Find missing residues for this structure
    missing = detect_missing_residues(pdb_id)
    chain_sequences = get_chain_sequences(pdb_id)

    chains_with_missing = {
        chain: chain_sequences[chain]
        for chain in missing
        if chain in chain_sequences
    }

    # 2) Write FASTA for chains with missing residues
    write_fasta_for_missing_chains(pdb_id, chains_with_missing)

    # 3) Run ESMFold for each chain and save results
    esmfold_results = {}
    chains_to_replace = []

    for chain, seq in chains_with_missing.items():
        print(f"Running ESMFold for chain {chain}")
        pdb_text = run_esmfold(seq)
        esmfold_results[chain] = pdb_text
        chains_to_replace.append(chain)
        # Save each chain
        with open(f"{pdb_id}_chain_{chain}_esmfold.pdb", "w") as f:
            f.write(pdb_text)

    # 4) Rebuild PDB in PyMOL using original structure and ESMFold chains
    rebuild_pdb_with_esmfold(
        pdb_id,
        chains_to_replace,
        original_pdb_path=original_pdb_path,
    )

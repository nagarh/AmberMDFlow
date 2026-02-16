# Step 1 obabel -i pdb ../4_ligands_corrected_1.pdb -o sdf -O ligand.sdf

# Step 2 Run tleap on 1_protein_no_hydrogens.pdb to protonate and add hydrogen to the pdb file 
# leap file content:
# source leaprc.protein.ff14SB
# protein = loadpdb 1_protein_no_hydrogens.pdb
# savepdb protein protein.pdb
# quit

# Step 3 pdb4amber -i receptor.pdb -o receptor_fixed.pdb  run this command on protein to add element names 

# Step 4 mk_prepare_ligand.py -i ligand.sdf -o ligand.pdbqt run this command on ligand to get pdbqt file for selected ligand

# Step 4 mk_prepare_receptor.py -i receptor.pdb -o receptor -p   run this command on protein to get pdbqt file for selected protein chain

# Now we are ready to run the docking 

# find the center of the ligand
# run this script 
#from MDAnalysis import Universe
#import numpy as np
#
#u = Universe("../output/4_ligands_corrected_1.pdb")
#
## replace 'LIG' with your ligand residue name
#ligand = u.select_atoms("all")
#coords = ligand.positions
#
## compute center of ligand
#center = coords.mean(axis=0)
#print("Center of ligand:", center)

#then run this vina script 
#vina \
#  --receptor receptor_ready.pdbqt \
#  --ligand ligand_1.pdbqt \
#  --center_x 34.3124 \
#  --center_y 4.95463 \
#  --center_z 1.774217 \
#  --size_x 18 \
#  --size_y 18 \
#  --size_z 18 \
#  --out ligand_1_docked.pdbqt \
#  --log ligand_1_docked.log

#vina_split --input ligand_1_docked.pdbqt --ligand ligand_1_mode

#Now we need to turn back pdbqt file to pdb file for ligand 
#run this command to do that obabel ligand_1_mode1.pdbqt -O ligand_1_mode1.pdb -p 7.4 
#now we need to add remaining hydrogens in it using pymol. pymol command is h_add ligand_1_mode1.pdb

#Now we need to make sure the residue name is correct like the name in the original ligand and then 
#we need to rename the atoms names to give this ligand to antechamber like C1, N1, .. like the way '4_ligands_corrected_1.pdb' formated 
#Now this ligand is ready to be used by antechambe to generate force field parameters

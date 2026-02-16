/**
 * Comprehensive PLUMED Collective Variables Documentation
 * This file contains full documentation for each CV as it appears on the PLUMED website
 */

const PLUMED_CV_DOCUMENTATION = {
    'DISTANCE': {
        name: 'DISTANCE',
        category: 'Geometric',
        description: `Calculate the distance between a pair of atoms.

This is the most basic collective variable and is the distance between two atoms calculated by adding the square root of the sum of squares of the three components of the distance vector.

The distance is calculated as:
d = sqrt((x1-x2)² + (y1-y2)² + (z1-z2)²)

where (x1,y1,z1) and (x2,y2,z2) are the positions of the two atoms.

When periodic boundary conditions are used, the minimum image convention is applied. This means that the distance is calculated as the minimum distance between the two atoms considering all periodic images.`,
        syntax: 'DISTANCE ATOMS=<atom1>,<atom2> [COMPONENTS] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'The pair of atoms that you are calculating the distance between. The atoms can be specified using a comma-separated list of atom numbers (e.g., 1,2) or using groups defined with GROUP or GROUPA/GROUPB keywords.'
            },
            {
                keyword: 'COMPONENTS',
                required: false,
                description: 'Calculate the x, y, and z components of the distance separately and store them as label.x, label.y, and label.z. This is useful when you need to use the components separately in other collective variables.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'SCALED_COMPONENTS',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the a, b and c scaled components of the distance separately and store them as label.a, label.b and label.c. These are the projections onto the lattice vectors and are periodic with domain (-0.5,+0.5).'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [
            {
                name: 'x',
                condition: 'COMPONENTS',
                description: 'the x-component of the vector connecting the two atoms'
            },
            {
                name: 'y',
                condition: 'COMPONENTS',
                description: 'the y-component of the vector connecting the two atoms'
            },
            {
                name: 'z',
                condition: 'COMPONENTS',
                description: 'the z-component of the vector connecting the two atoms'
            },
            {
                name: 'a',
                condition: 'SCALED_COMPONENTS',
                description: 'the normalized projection on the first lattice vector of the vector connecting the two atoms'
            },
            {
                name: 'b',
                condition: 'SCALED_COMPONENTS',
                description: 'the normalized projection on the second lattice vector of the vector connecting the two atoms'
            },
            {
                name: 'c',
                condition: 'SCALED_COMPONENTS',
                description: 'the normalized projection on the third lattice vector of the vector connecting the two atoms'
            }
        ],
        examples: [
            {
                title: 'Basic distance calculation',
                code: `# Calculate distance between atoms 1 and 2
d1: DISTANCE ATOMS=1,2

# Print the distance to a file
PRINT ARG=d1 FILE=colvar STRIDE=10`
            },
            {
                title: 'Distance with components',
                code: `# Calculate distance with x, y, z components
d2: DISTANCE ATOMS=10,20 COMPONENTS

# Use components separately
PRINT ARG=d2.x,d2.y,d2.z FILE=components STRIDE=10`
            },
            {
                title: 'Distance without periodic boundary conditions',
                code: `# Calculate distance ignoring PBC
d3: DISTANCE ATOMS=5,15 NOPBC

# Useful for non-periodic systems or when you want the actual distance`
            },
            {
                title: 'Distance in metadynamics',
                code: `# Use distance as a CV in metadynamics
d: DISTANCE ATOMS=100,200
METAD ARG=d SIGMA=0.1 HEIGHT=1.2 PACE=500 FILE=HILLS`
            }
        ],
        notes: [
            'The distance is always positive and has units of length (typically Angstroms).',
            'When using periodic boundary conditions, the minimum image convention ensures that the distance is always less than half the box length.',
            'The COMPONENTS keyword is useful when you need to bias or analyze the distance along specific directions.',
            'For large systems, using NOPBC can be computationally expensive as it requires calculating distances to all periodic images.'
        ],
        related: ['COORDINATION', 'DISTANCE_PAIRWISE', 'DISTANCE_FROM_CONTOUR']
    },
    
    'COORDINATION': {
        name: 'COORDINATION',
        category: 'Geometric',
        description: `Calculate coordination numbers.

This collective variable can be used to calculate the number of atoms in a first coordination sphere around a central atom or group of atoms. The coordination number is calculated using a switching function that goes smoothly from 1 to 0 as the distance between the central atom and the coordinating atom increases.

The coordination number is defined as:
CN = Σᵢ s(rᵢ)

where s(r) is a switching function that goes from 1 (when r << R₀) to 0 (when r >> R₀), and the sum is over all atoms in the coordination sphere.

The switching function can be of different types:
- RATIONAL: s(r) = (1 - (r/R₀)ⁿ)ᵐ / (1 - (r/R₀)ᵐ)ᵐ
- EXPONENTIAL: s(r) = exp(-(r-R₀)² / (2σ²))
- GAUSSIAN: s(r) = exp(-(r-R₀)² / (2σ²))

The default switching function is RATIONAL with n=6 and m=12.`,
        syntax: 'COORDINATION GROUPA=<group1> GROUPB=<group2> R_0=<value> D_0=<value> [NN=<value>] [MM=<value>] [SWITCH=<type>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'First list of atoms. For more information on how to specify lists of atoms see Groups and Virtual Atoms.'
            },
            {
                keyword: 'GROUPB',
                required: false,
                description: 'Second list of atoms (if empty, N*(N-1)/2 pairs in GROUPA are counted). For more information on how to specify lists of atoms see Groups and Virtual Atoms.'
            },
            {
                keyword: 'R_0',
                required: true,
                description: 'The r_0 parameter of the switching function.'
            },
            {
                keyword: 'D_0',
                required: false,
                default: '0.0',
                description: '( default=0.0 ) The d_0 parameter of the switching function.'
            },
            {
                keyword: 'NN',
                required: false,
                default: '6',
                description: '( default=6 ) The n parameter of the switching function.'
            },
            {
                keyword: 'MM',
                required: false,
                default: '0',
                description: '( default=0 ) The m parameter of the switching function; 0 implies 2*NN.'
            },
            {
                keyword: 'SWITCH',
                required: false,
                description: 'The type of switching function to use. Options are RATIONAL, EXPONENTIAL, or GAUSSIAN. Default is RATIONAL.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic coordination number',
                code: `# Calculate coordination number between group 1 and group 2
coord: COORDINATION GROUPA=1-10 GROUPB=11-20 R_0=1.5 D_0=0.2

# Print coordination number
PRINT ARG=coord FILE=colvar STRIDE=10`
            },
            {
                title: 'Coordination with custom switching function',
                code: `# Coordination with custom exponents
coord2: COORDINATION GROUPA=1 GROUPB=2-100 R_0=2.0 D_0=0.3 NN=6 MM=12

# Sharper cutoff
coord_sharp: COORDINATION GROUPA=1-5 GROUPB=6-50 R_0=2.5 D_0=0.1`
            },
            {
                title: 'Coordination in metadynamics',
                code: `# Use coordination as CV in metadynamics
coord: COORDINATION GROUPA=@protein GROUPB=@water R_0=3.5 D_0=0.5
METAD ARG=coord SIGMA=0.5 HEIGHT=1.2 PACE=500 FILE=HILLS`
            },
            {
                title: 'Multiple coordination numbers',
                code: `# Calculate coordination for different groups
coord_protein: COORDINATION GROUPA=1-100 GROUPB=101-200 R_0=4.0 D_0=0.4
coord_water: COORDINATION GROUPA=1-100 GROUPB=201-500 R_0=3.5 D_0=0.3

PRINT ARG=coord_protein,coord_water FILE=coordinations STRIDE=10`
            }
        ],
        notes: [
            'The coordination number is a continuous variable, not an integer, due to the smooth switching function.',
            'The choice of R_0 and D_0 parameters is crucial for obtaining meaningful coordination numbers.',
            'For systems with periodic boundary conditions, the minimum image convention is used.',
            'The coordination number can be used to study solvation, binding, and structural changes.'
        ],
        related: ['DISTANCE', 'COORDINATIONNUMBER', 'COORDINATION_ENTROPY']
    },
    
    'ANGLE': {
        name: 'ANGLE',
        category: 'Geometric',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate an angle.

This command can be used to compute the angle between three atoms. Alternatively if four atoms appear in the atom specification it calculates the angle between two vectors identified by two pairs of atoms.

If three atoms are given, the angle is defined as:

θ = arccos(r₂₁ · r₂₃ / |r₂₁||r₂₃|)

Here rᵢⱼ is the distance vector among the ith and the jth listed atom.

If four atoms are given, the angle is defined as:

θ = arccos(r₂₁ · r₃₄ / |r₂₁||r₃₄|)

Notice that angles defined in this way are non-periodic variables and their value is limited by definition between 0 and π.

The vectors rᵢⱼ are by default evaluated taking periodic boundary conditions into account. This behavior can be changed with the NOPBC flag.`,
        syntax: 'ANGLE ATOMS=<atom1>,<atom2>,<atom3> [or ATOMS=<atom1>,<atom2>,<atom3>,<atom4>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the list of atoms involved in this collective variable (either 3 or 4 atoms). For more information on how to specify lists of atoms see Groups and Virtual Atoms'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Angle between three atoms',
                code: `# This command tells plumed to calculate the angle between the vector connecting atom 1 to atom 2 
# and the vector connecting atom 2 to atom 3 and to print it on file COLVAR1. 
# At the same time, the angle between vector connecting atom 1 to atom 2 and the vector connecting atom 3 to atom 4 
# is printed on file COLVAR2.

a: ANGLE ATOMS=1,2,3 
# equivalently one could state:
# a: ANGLE ATOMS=1,2,2,3
b: ANGLE ATOMS=1,2,3,4 
PRINT ARG=a FILE=COLVAR1 
PRINT ARG=b FILE=COLVAR2`
            }
        ],
        notes: [
            'Angles defined in this way are non-periodic variables and their value is limited by definition between 0 and π.',
            'The vectors rᵢⱼ are by default evaluated taking periodic boundary conditions into account.',
            'This behavior can be changed with the NOPBC flag.',
            'For three atoms, the angle is calculated at the middle atom (atom 2).',
            'For four atoms, the angle is between two vectors: r₂₁ and r₃₄.'
        ],
        related: ['TORSION', 'DISTANCE', 'BOND']
    },
    
    'TORSION': {
        name: 'TORSION',
        category: 'Geometric',
        description: `Calculate a torsional (dihedral) angle.

This collective variable calculates the torsional angle between two planes defined by four atoms. The angle is measured as the angle between the normal vectors of the two planes.

The four atoms define two planes:
- Plane 1: defined by atoms 1, 2, and 3
- Plane 2: defined by atoms 2, 3, and 4

The torsional angle φ is the angle between these two planes, measured around the bond connecting atoms 2 and 3.

The angle is measured in radians and ranges from -π to π (-180° to 180°).

This CV is commonly used to:
- Monitor protein backbone dihedral angles (φ, ψ, ω)
- Study side chain dihedral angles (χ angles)
- Analyze conformational changes
- Track rotatable bonds`,
        syntax: 'TORSION ATOMS=<atom1>,<atom2>,<atom3>,<atom4> [PERIODIC=<min>,<max>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the four atoms involved in the torsional angle'
            },
            {
                keyword: 'COSINE',
                required: false,
                default: 'off',
                description: '( default=off ) calculate cosine instead of dihedral'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic dihedral angle',
                code: `# Calculate dihedral angle (phi angle in protein)
phi: TORSION ATOMS=5,7,9,15

# Print angle (in radians)
PRINT ARG=phi FILE=colvar STRIDE=10`
            },
            {
                title: 'Protein backbone dihedrals',
                code: `# Calculate phi, psi, and omega angles
phi: TORSION ATOMS=@phi-3
psi: TORSION ATOMS=@psi-3
omega: TORSION ATOMS=@omega-3

# Requires MOLINFO to define @phi-3, @psi-3, @omega-3
MOLINFO STRUCTURE=protein.pdb MOLTYPE=protein`
            },
            {
                title: 'Side chain dihedral angles',
                code: `# Calculate chi1 angle
chi1: TORSION ATOMS=5,8,10,13

# Multiple chi angles
chi1: TORSION ATOMS=5,8,10,13
chi2: TORSION ATOMS=8,10,13,16
chi3: TORSION ATOMS=10,13,16,19`
            },
            {
                title: 'Torsion in metadynamics',
                code: `# Use torsion as CV in metadynamics
torsion: TORSION ATOMS=100,101,102,103
METAD ARG=torsion SIGMA=0.1 HEIGHT=1.2 PACE=500 FILE=HILLS`
            },
            {
                title: 'Ramachandran plot',
                code: `# Create Ramachandran plot (phi vs psi)
phi: TORSION ATOMS=@phi-3
psi: TORSION ATOMS=@psi-3

# Print for plotting
PRINT ARG=phi,psi FILE=ramachandran STRIDE=10`
            }
        ],
        notes: [
            'The torsional angle is in radians and ranges from -π to π (-180° to 180°).',
            'The angle is periodic: -π and π represent the same conformation.',
            'For protein backbone, φ (phi) and ψ (psi) angles are the most important for describing secondary structure.',
            'The sign of the angle depends on the handedness of the rotation (right-hand rule).',
            'MOLINFO can be used to automatically define common dihedral angles in proteins.'
        ],
        related: ['ANGLE', 'DISTANCE', 'MOLINFO']
    },
    
    'RMSD': {
        name: 'RMSD',
        category: 'Structural',
        description: `Calculate the RMSD (Root Mean Square Deviation) with respect to a reference structure.

RMSD measures the structural similarity between the current configuration and a reference structure. It is calculated after optimal alignment (superposition) of the two structures.

The RMSD is defined as:
RMSD = sqrt((1/N) Σᵢ (rᵢ - rᵢᵣᵉᶠ)²)

where N is the number of atoms, rᵢ is the position of atom i in the current structure, and rᵢᵣᵉᶠ is the position of atom i in the reference structure after optimal alignment.

The optimal alignment is performed using the Kabsch algorithm, which finds the rotation and translation that minimizes the RMSD.

RMSD is commonly used to:
- Monitor structural changes during simulations
- Measure convergence to a reference structure
- Identify structural transitions
- Analyze protein folding/unfolding`,
        syntax: 'RMSD REFERENCE=<file> TYPE=<type> [ATOMS=<group>] [NOPBC] [SQUARED] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'a file in pdb format containing the reference structure and the atoms involved in the CV.'
            },
            {
                keyword: 'TYPE',
                required: false,
                default: 'SIMPLE',
                description: '( default=SIMPLE ) the manner in which RMSD alignment is performed. Should be OPTIMAL or SIMPLE.'
            },
            {
                keyword: 'ATOMS',
                required: false,
                description: 'The atoms to include in the RMSD calculation. If not specified, all atoms are used. Can be a range (e.g., 1-100) or a group (e.g., @backbone).'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'SQUARED',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the squared RMSD instead of the RMSD. This avoids the square root operation and can be more efficient.'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic RMSD calculation',
                code: `# Calculate RMSD with respect to reference structure
rmsd: RMSD REFERENCE=reference.pdb TYPE=OPTIMAL

# Print RMSD
PRINT ARG=rmsd FILE=colvar STRIDE=10`
            },
            {
                title: 'Backbone RMSD',
                code: `# RMSD for specific atoms (backbone)
rmsd_backbone: RMSD REFERENCE=ref.pdb TYPE=OPTIMAL ATOMS=@backbone

# Or using atom ranges
rmsd_bb: RMSD REFERENCE=ref.pdb TYPE=OPTIMAL ATOMS=1-100`
            },
            {
                title: 'RMSD in metadynamics',
                code: `# Use RMSD as CV in metadynamics
rmsd: RMSD REFERENCE=folded.pdb TYPE=OPTIMAL ATOMS=@backbone
METAD ARG=rmsd SIGMA=0.5 HEIGHT=1.2 PACE=500 FILE=HILLS`
            },
            {
                title: 'Multiple RMSD calculations',
                code: `# Calculate RMSD to different reference structures
rmsd_native: RMSD REFERENCE=native.pdb TYPE=OPTIMAL
rmsd_intermediate: RMSD REFERENCE=intermediate.pdb TYPE=OPTIMAL

PRINT ARG=rmsd_native,rmsd_intermediate FILE=rmsds STRIDE=10`
            },
            {
                title: 'RMSD without alignment',
                code: `# Calculate RMSD without alignment (useful for fixed structures)
rmsd_noalign: RMSD REFERENCE=ref.pdb TYPE=NOALIGN ATOMS=1-50`
            }
        ],
        notes: [
            'RMSD is always positive and has units of length (typically Angstroms).',
            'The optimal alignment (TYPE=OPTIMAL) is computationally more expensive but gives the most meaningful RMSD values.',
            'For large systems, calculating RMSD for a subset of atoms (e.g., backbone) is often sufficient and more efficient.',
            'RMSD is sensitive to the choice of reference structure. Make sure the reference is representative of the state you want to measure.',
            'RMSD values below 1-2 Å typically indicate very similar structures, while values above 5-10 Å indicate significant structural differences.'
        ],
        related: ['DRMSD', 'GYRATION', 'PCA']
    },
    
    'SORT': {
        name: 'SORT',
        category: 'Utility',
        module: 'colvar',
        description: `This is part of the colvar module

This function can be used to sort colvars according to their magnitudes.

SORT takes a set of collective variables and returns them sorted by their values. This is useful for identifying the largest or smallest CV values, or for creating ordered lists of CVs.

SORT is useful for:
- Sorting CV values
- Identifying extreme values
- Creating ordered lists
- Statistical analysis`,
        syntax: 'SORT ARG=<cv1>,<cv2>,...',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the list of collective variables to sort'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Sort CVs',
                code: `# Sort distances
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
d3: DISTANCE ATOMS=5,6
sorted: SORT ARG=d1,d2,d3

# Print sorted values
PRINT ARG=sorted FILE=colvar STRIDE=10`
            }
        ],
        notes: [
            'SORT returns CVs sorted by their values.',
            'Useful for identifying extreme values.',
            'The output maintains the same number of components as input.',
            'Sorting is done in ascending order.'
        ],
        related: ['STATS', 'LOCALENSEMBLE']
    },
    
    'STATS': {
        name: 'STATS',
        category: 'Analysis',
        module: 'colvar',
        description: `This is part of the colvar module

Calculates statistical properties of a set of collective variables with respect to a set of reference values.

STATS computes various statistical measures such as mean, variance, standard deviation, and other properties of CVs compared to reference values. This is useful for analyzing deviations from reference structures or target values.

STATS is useful for:
- Statistical analysis of CVs
- Comparing to reference values
- Computing mean and variance
- Analyzing deviations`,
        syntax: 'STATS ARG=<cv1>,<cv2>,... REFERENCE=<file>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the list of collective variables to analyze'
            },
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference file containing target values for comparison'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Statistical properties',
                code: `# Statistical analysis
d: DISTANCE ATOMS=1,2
stats: STATS ARG=d REFERENCE=ref.pdb

# Multiple CVs
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
stats2: STATS ARG=d1,d2 REFERENCE=reference.pdb`
            }
        ],
        notes: [
            'STATS computes statistical properties of CVs.',
            'Compares current values to reference values.',
            'Useful for analyzing deviations from targets.',
            'The reference file should contain target CV values.'
        ],
        related: ['ENSEMBLE', 'LOCALENSEMBLE', 'SORT']
    },
    
    'TARGET': {
        name: 'TARGET',
        category: 'Structural',
        module: 'colvar',
        description: `This is part of the colvar module

This function measures the Pythagorean distance from a particular structure measured in the space defined by some set of collective variables.

TARGET calculates the distance in CV space rather than Cartesian space. The distance is computed as the Euclidean distance between the current CV values and target CV values in the multi-dimensional CV space.

The distance is calculated as:
d = sqrt(Σᵢ wᵢ × (CVᵢ - CVᵢᵗᵃʳᵍᵉᵗ)²)

where:
- CVᵢ are the current values of the collective variables
- CVᵢᵗᵃʳᵍᵉᵗ are the target values
- wᵢ are optional weights for each CV

This CV is useful for:
- Measuring distance to a target state in CV space
- Defining reaction coordinates in multi-dimensional CV space
- Biasing simulations toward specific CV values
- Analyzing paths in CV space`,
        syntax: 'TARGET REFERENCE=<file> CVS=<cvs> [WEIGHTS=<weights>]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference structure file or file containing target CV values'
            },
            {
                keyword: 'CVS',
                required: true,
                description: 'the collective variables to use for calculating the distance. Multiple CVs should be specified as comma-separated labels, e.g., CVS=distance,angle,torsion'
            },
            {
                keyword: 'WEIGHTS',
                required: false,
                description: 'optional weights for each CV. If not specified, all CVs are weighted equally. Should be specified as comma-separated values matching the order of CVS, e.g., WEIGHTS=1.0,2.0,1.5'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Target distance in CV space',
                code: `# Define CVs
d: DISTANCE ATOMS=1,2
angle: ANGLE ATOMS=3,4,5
torsion: TORSION ATOMS=6,7,8,9

# Calculate distance to target in CV space
target: TARGET REFERENCE=target.pdb CVS=d,angle,torsion

# Print target distance
PRINT ARG=target FILE=colvar STRIDE=10`
            },
            {
                title: 'Target with weights',
                code: `# Target distance with weighted CVs
d1: DISTANCE ATOMS=1,2
a1: ANGLE ATOMS=3,4,5
t1: TORSION ATOMS=6,7,8,9

target_weighted: TARGET REFERENCE=ref.pdb CVS=d1,a1,t1 WEIGHTS=1.0,2.0,1.5`
            }
        ],
        notes: [
            'TARGET measures distance in CV space, not Cartesian space.',
            'The distance is the Euclidean distance in the multi-dimensional CV space.',
            'All CVs in CVS must be defined before TARGET.',
            'Weights allow you to emphasize certain CVs over others.',
            'Useful for biasing simulations toward specific CV values.',
            'The reference should contain the target CV values or a structure from which they can be calculated.'
        ],
        related: ['RMSD', 'DRMSD', 'DISTANCE', 'COMBINE']
    },
    
    'GYRATION': {
        name: 'GYRATION',
        category: 'Structural',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate a property of the radius of gyration.

The different properties can be calculated and selected by the TYPE keyword: the Radius of Gyration (RADIUS); the Trace of the Gyration Tensor (TRACE); the Largest Principal Moment of the Gyration Tensor (GTPC_1); the middle Principal Moment of the Gyration Tensor (GTPC_2); the Smallest Principal Moment of the Gyration Tensor (GTPC_3); the Asphericity (ASPHERICITY); the Acylindricity (ACYLINDRICITY); the Relative Shape Anisotropy (KAPPA2); the Smallest Principal Radius Of Gyration (GYRATION_3); the Middle Principal Radius of Gyration (GYRATION_2); the Largest Principal Radius of Gyration (GYRATION_1).

The radius of gyration (Rg) is a measure of the size and compactness of a molecule. It is defined as the average distance of atoms from the center of mass, weighted by their masses.`,
        syntax: 'GYRATION ATOMS=<group> [TYPE=<type>] [MASS_WEIGHTED] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the group of atoms that you are calculating the Gyration Tensor for. For more information on how to specify lists of atoms see Groups and Virtual Atoms.'
            },
            {
                keyword: 'TYPE',
                required: false,
                default: 'RADIUS',
                description: '( default=RADIUS ) The type of calculation relative to the Gyration Tensor you want to perform. Options: RADIUS, TRACE, GTPC_1, GTPC_2, GTPC_3, ASPHERICITY, ACYLINDRICITY, KAPPA2, GYRATION_3, GYRATION_2, GYRATION_1.'
            },
            {
                keyword: 'MASS_WEIGHTED',
                required: false,
                default: 'off',
                description: '( default=off ) set the masses of all the atoms equal to one'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic radius of gyration',
                code: `# Calculate radius of gyration for all atoms
rg: GYRATION ATOMS=1-100

# Print radius of gyration
PRINT ARG=rg FILE=colvar STRIDE=10`
            },
            {
                title: 'Backbone radius of gyration',
                code: `# Gyration for specific group (backbone)
rg_backbone: GYRATION ATOMS=@backbone

# Or using atom ranges
rg_bb: GYRATION ATOMS=1-50`
            },
            {
                title: 'Weighted radius of gyration',
                code: `# Gyration with weights (e.g., by mass)
rg_weighted: GYRATION ATOMS=1-100 WEIGHTS=1,2,1,2,1,2

# Weights can also be read from a file
rg_file: GYRATION ATOMS=1-100 WEIGHTS=weights.dat`
            },
            {
                title: 'Radius of gyration in metadynamics',
                code: `# Use radius of gyration as CV in metadynamics
rg: GYRATION ATOMS=@protein
METAD ARG=rg SIGMA=0.5 HEIGHT=1.2 PACE=500 FILE=HILLS`
            },
            {
                title: 'Multiple radius of gyration calculations',
                code: `# Calculate radius of gyration for different groups
rg_protein: GYRATION ATOMS=@protein
rg_chainA: GYRATION ATOMS=@chainA
rg_chainB: GYRATION ATOMS=@chainB

PRINT ARG=rg_protein,rg_chainA,rg_chainB FILE=rgs STRIDE=10`
            }
        ],
        notes: [
            'The radius of gyration has units of length (typically Angstroms).',
            'Larger Rg values indicate more extended structures, while smaller values indicate more compact structures.',
            'For proteins, Rg typically ranges from ~5-10 Å for compact folded states to ~20-30 Å for unfolded states.',
            'The radius of gyration is sensitive to the choice of atoms included in the calculation.',
            'Weighted calculations (by mass) give more physically meaningful results for heterogeneous systems.'
        ],
        related: ['RMSD', 'DISTANCE', 'PCA']
    },
    
    'ENERGY': {
        name: 'ENERGY',
        category: 'Energy',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the total energy of the system.

This collective variable calculates the total energy of the system. The energy is obtained from the MD code and can be used to bias simulations or analyze energy landscapes.

The energy typically includes:
- Kinetic energy
- Potential energy (bonded and non-bonded interactions)
- Long-range electrostatic interactions
- Van der Waals interactions

This CV is useful for:
- Energy-based biasing in metadynamics
- Analyzing energy landscapes
- Monitoring energy conservation
- Studying energy fluctuations`,
        syntax: 'ENERGY',
        options: [],
        components: [],
        examples: [
            {
                title: 'Basic energy calculation',
                code: `# Calculate total energy
energy: ENERGY

# Print energy to file
PRINT ARG=energy FILE=colvar STRIDE=10`
            },
            {
                title: 'Energy in metadynamics',
                code: `# Use energy as CV in metadynamics
energy: ENERGY
METAD ARG=energy SIGMA=1.0 HEIGHT=1.2 PACE=100 FILE=HILLS`
            }
        ],
        notes: [
            'The energy units depend on the MD code being used (typically kcal/mol or kJ/mol).',
            'The energy includes all contributions from the force field.',
            'This CV requires the MD code to provide energy information to PLUMED.',
            'Energy values can be large and may require appropriate scaling in biasing methods.'
        ],
        related: ['DISTANCE', 'COORDINATION']
    },
    
    'ENSEMBLE': {
        name: 'ENSEMBLE',
        category: 'Analysis',
        module: 'colvar',
        description: `This is part of the colvar module

Calculates the replica averaging of a collective variable over multiple replicas.

ENSEMBLE computes the average value of a collective variable across multiple replicas in a replica exchange or multi-replica simulation. This is useful for analyzing ensemble properties and ensuring consistency across replicas.

ENSEMBLE is useful for:
- Replica exchange simulations
- Multi-replica analysis
- Ensemble averaging
- Replica consistency checks`,
        syntax: 'ENSEMBLE ARG=<cv> [REPLICAS=<n>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the collective variable to average across replicas'
            },
            {
                keyword: 'REPLICAS',
                required: false,
                description: 'the number of replicas (if not specified, detected automatically)'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Ensemble average',
                code: `# Ensemble average of a distance
d: DISTANCE ATOMS=1,2
ensemble: ENSEMBLE ARG=d REPLICAS=8

# Print ensemble average
PRINT ARG=ensemble FILE=colvar STRIDE=10`
            }
        ],
        notes: [
            'ENSEMBLE averages CV values across multiple replicas.',
            'Useful for replica exchange simulations.',
            'The number of replicas can be specified or auto-detected.',
            'All replicas must compute the same CV for averaging to work.'
        ],
        related: ['LOCALENSEMBLE', 'STATS']
    },
    
    'ALPHABETA': {
        name: 'ALPHABETA',
        category: 'Secondary Structure',
        module: 'colvar',
        description: `This is part of the colvar module

Measures a distance including pbc between the instantaneous values of a set of torsional angles and set of reference values.

This collective variable calculates the following quantity:

s = (1/2) Σᵢ [1+cos(θᵢ - θᵢʳᵉᶠ)]

where the θᵢ values are the instantaneous values for the torsion angles of interest and the θᵢʳᵉᶠ values are the reference values for the torsional angles. This is a measure of how similar the instantaneous and reference conformations are in terms of the dihedral angles. The sum over i runs over all the torsion angles you specify.

This CV is useful for:
- Measuring similarity to reference dihedral conformations
- Studying protein secondary structure formation
- Biasing simulations toward specific backbone conformations`,
        syntax: 'ALPHABETA ATOMS1=<atoms> REFERENCE1=<value> ATOMS2=<atoms> REFERENCE2=<value> ... [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms involved in each of the alpha-beta variables you wish to calculate. Keywords like ATOMS1, ATOMS2, ATOMS3,... should be listed and one alpha-beta value will be calculated for each ATOM keyword you specify (all ATOM keywords should specify the indices of four atoms).'
            },
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference values for each of the torsional angles. If you use a single REFERENCE value the same reference value is used for all torsional angles. You can use multiple instances of this keyword i.e. REFERENCE1, REFERENCE2, REFERENCE3...'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic ALPHABETA calculation',
                code: `# Calculate ALPHABETA for three torsion angles
ab: ALPHABETA ATOMS1=168,170,172,188 REFERENCE1=-1.0 \\
             ATOMS2=170,172,188,190 REFERENCE2=-1.0 \\
             ATOMS3=188,190,192,230 REFERENCE3=-1.0

PRINT ARG=ab FILE=colvar STRIDE=10`
            },
            {
                title: 'ALPHABETA with MOLINFO',
                code: `# Using MOLINFO shortcuts
MOLINFO MOLTYPE=protein STRUCTURE=protein.pdb
ab: ALPHABETA ATOMS1=@phi-3 REFERENCE=-1.22 \\
             ATOMS2=@psi-3 \\
             ATOMS3=@phi-4

PRINT ARG=ab FILE=colvar STRIDE=10`
            }
        ],
        notes: [
            'ALPHABETA measures how close the instantaneous torsion angles are to reference values.',
            'The value of the CV is (1/2) Σᵢ [1+cos(θᵢ - θᵢʳᵉᶠ)].',
            'A value of 1 indicates all angles are exactly at their reference values.',
            'Each ATOMSn keyword should specify exactly 4 atoms defining a torsion angle.',
            'Reference values are in radians.'
        ],
        related: ['TORSION', 'ANGLE', 'MOLINFO', 'ALPHARMSD', 'ANTIBETARMSD']
    },
    
    'MULTICOLVAR': {
        name: 'MULTICOLVAR',
        category: 'Composite',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate multiple collective variables simultaneously.

This action allows you to compute multiple collective variables that share common components. It is more efficient than computing each CV separately when they share atoms or calculations.

MULTICOLVAR can be used to:
- Calculate multiple distances, angles, or torsions
- Compute CVs that share common atom groups
- Reduce computational overhead by reusing calculations
- Organize related CVs together`,
        syntax: 'MULTICOLVAR ATOMS=<group> [COEFFICIENTS=<coeffs>]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the list of atoms involved in the collective variables. For more information on how to specify lists of atoms see Groups and Virtual Atoms'
            },
            {
                keyword: 'COEFFICIENTS',
                required: false,
                description: 'optional coefficients for combining the CVs. If not specified, all CVs are computed independently.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Multiple distances',
                code: `# Calculate multiple distances efficiently
multi: MULTICOLVAR ATOMS=1,2,3,4,5,6
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
d3: DISTANCE ATOMS=5,6

# All distances computed together
PRINT ARG=d1,d2,d3 FILE=distances STRIDE=10`
            }
        ],
        notes: [
            'MULTICOLVAR is more efficient when computing multiple CVs that share atoms.',
            'The CVs computed within MULTICOLVAR can be used as arguments to other actions.',
            'This action is particularly useful for complex systems with many related CVs.',
            'The order of CVs in the output matches the order of definition.'
        ],
        related: ['DISTANCE', 'ANGLE', 'TORSION', 'COMBINE']
    },
    
    'MULTI_RMSD': {
        name: 'MULTI_RMSD',
        category: 'Structural',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the RMSD distance moved by a number of separated domains from their positions in a reference structure.

MULTI_RMSD is designed for multi-domain proteins where different domains can move independently. Unlike standard RMSD, which treats the entire structure as a single rigid body, MULTI_RMSD calculates RMSD for each domain separately and then combines them.

This CV is useful for:
- Analyzing multi-domain proteins
- Studying domain motions
- Characterizing relative domain movements
- Analyzing flexible multi-domain systems`,
        syntax: 'MULTI_RMSD REFERENCE=<file> TYPE=<type> GROUPS=<groups> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference structure file (PDB format) containing the reference positions for all domains'
            },
            {
                keyword: 'TYPE',
                required: true,
                description: 'the type of RMSD calculation: OPTIMAL (optimal alignment), SIMPLE (no alignment), or ALIGNED (pre-aligned structures)'
            },
            {
                keyword: 'GROUPS',
                required: true,
                description: 'the atom groups defining each domain. Multiple groups should be specified as comma-separated lists, e.g., GROUPS=1-50,51-100,101-150'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Multi-domain RMSD',
                code: `# Calculate RMSD for three domains
                multi_rmsd: MULTI_RMSD REFERENCE=ref.pdb TYPE=OPTIMAL GROUPS=1-50,51-100,101-150

# Print multi-domain RMSD
PRINT ARG=multi_rmsd FILE=colvar STRIDE=10`
            },
            {
                title: 'Multi-RMSD with atom groups',
                code: `# Multi-RMSD using atom groups
MOLINFO STRUCTURE=protein.pdb MOLTYPE=protein
multi_rmsd: MULTI_RMSD REFERENCE=ref.pdb TYPE=OPTIMAL GROUPS=@domain1,@domain2,@domain3`
            }
        ],
        notes: [
            'MULTI_RMSD calculates RMSD for each domain separately.',
            'Each domain is optimally aligned to the reference independently.',
            'Useful for proteins with multiple domains that move relative to each other.',
            'The GROUPS keyword defines which atoms belong to each domain.',
            'The final RMSD value combines contributions from all domains.'
        ],
        related: ['RMSD', 'DRMSD', 'ERMSD']
    },
    
    'PCA': {
        name: 'PCA',
        category: 'Analysis',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate principal component analysis (PCA).

PCA is used to analyze conformational changes by identifying the principal modes of motion. It is based on a set of reference structures (typically from a trajectory) and computes eigenvectors that describe the main directions of structural variation.

The PCA is calculated as:
1. Build a covariance matrix from reference structures
2. Diagonalize the covariance matrix to get eigenvalues and eigenvectors
3. Project the current structure onto the principal components

The principal components are ordered by their eigenvalues (variance), with PC1 having the largest variance.`,
        syntax: 'PCA REFERENCE=<file> VECTORS=<file> [NCOMPONENTS=<n>] [ATOMS=<group>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference structure file (typically a PDB file) or trajectory file containing reference structures for PCA calculation'
            },
            {
                keyword: 'VECTORS',
                required: true,
                description: 'the file containing the eigenvectors (principal components) calculated from the reference structures'
            },
            {
                keyword: 'NCOMPONENTS',
                required: false,
                description: 'the number of principal components to use. If not specified, all components are used.'
            },
            {
                keyword: 'ATOMS',
                required: false,
                description: 'the atoms to include in the PCA calculation. If not specified, all atoms are used.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'PCA analysis',
                code: `# PCA analysis with reference trajectory
pca: PCA REFERENCE=trajectory.pdb VECTORS=eigenvectors.dat NCOMPONENTS=10

# Use first principal component as CV
pc1: PCA REFERENCE=ref.pdb VECTORS=vecs.dat NCOMPONENTS=1

# Print PCA components
PRINT ARG=pc1 FILE=pca.dat STRIDE=10`
            }
        ],
        notes: [
            'PCA requires a reference set of structures to calculate eigenvectors.',
            'The eigenvectors are typically calculated offline using tools like g_covar (GROMACS) or similar.',
            'Principal components are ordered by variance (PC1 has the largest variance).',
            'PCA is useful for identifying the main modes of conformational change.',
            'The number of components should be chosen based on the cumulative variance explained.'
        ],
        related: ['RMSD', 'DRMSD', 'GYRATION']
    },
    
    'PCARMSD': {
        name: 'PCARMSD',
        category: 'Structural',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the PCA components for a number of provided eigenvectors and an average structure.

PCARMSD projects the current structure onto PCA eigenvectors and calculates RMSD-like measures in the PCA space. Unlike standard RMSD, which measures distance in Cartesian space, PCARMSD measures distance in the space defined by principal components.

The PCARMSD is calculated as:
1. Align the current structure to the average structure
2. Project the aligned structure onto the PCA eigenvectors
3. Calculate the RMSD in PCA space

This CV is useful for:
- Analyzing conformational changes in PCA space
- Measuring structural similarity using principal components
- Characterizing large-scale motions
- Reducing dimensionality in structural analysis`,
        syntax: 'PCARMSD REFERENCE=<file> VECTORS=<file> [NCOMPONENTS=<n>] [TYPE=<type>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference structure file (typically the average structure used for PCA calculation)'
            },
            {
                keyword: 'VECTORS',
                required: true,
                description: 'the file containing the PCA eigenvectors (typically calculated from a trajectory)'
            },
            {
                keyword: 'NCOMPONENTS',
                required: false,
                description: 'the number of principal components to use in the calculation (uses all if not specified)'
            },
            {
                keyword: 'TYPE',
                required: false,
                default: 'OPTIMAL',
                description: '( default=OPTIMAL ) the type of alignment to perform before projection'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'PCA RMSD',
                code: `# Calculate PCA RMSD
pcarmsd: PCARMSD REFERENCE=avg.pdb VECTORS=eigenvecs.dat NCOMPONENTS=10

# Print PCA RMSD
PRINT ARG=pcarmsd FILE=colvar STRIDE=10`
            },
            {
                title: 'PCA RMSD with specific components',
                code: `# Use only first 5 principal components
pca_rmsd: PCARMSD REFERENCE=reference.pdb VECTORS=vectors.dat NCOMPONENTS=5`
            }
        ],
        notes: [
            'PCARMSD measures distance in PCA space, not Cartesian space.',
            'Requires pre-calculated eigenvectors from a reference trajectory.',
            'The average structure (REFERENCE) should match the one used for eigenvector calculation.',
            'Useful for analyzing large-scale conformational changes.',
            'Reduces dimensionality compared to full RMSD calculations.'
        ],
        related: ['PCA', 'PCAVARS', 'RMSD', 'DRMSD']
    },
    
    'RDF': {
        name: 'RDF',
        category: 'Analysis',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate radial distribution function (RDF).

The radial distribution function g(r) measures the probability of finding a particle at a distance r from a reference particle, relative to the probability expected for a uniform distribution.

The RDF is calculated as:
g(r) = (1 / (4πr²ρ)) × (dN(r) / dr)

where:
- ρ is the number density
- dN(r) is the number of particles in a shell of thickness dr at distance r
- 4πr² is the surface area of a sphere of radius r

The RDF is normalized such that g(r) → 1 as r → ∞ for a uniform distribution.`,
        syntax: 'RDF GROUPA=<group1> GROUPB=<group2> MAX=<max> NBINS=<nbins> [MIN=<min>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'the reference group of atoms. The RDF is calculated around these atoms.'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'the group of atoms to calculate the RDF with respect to GROUPA.'
            },
            {
                keyword: 'MAX',
                required: true,
                description: 'the maximum distance for RDF calculation (in Angstroms).'
            },
            {
                keyword: 'NBINS',
                required: true,
                description: 'the number of bins for the RDF histogram.'
            },
            {
                keyword: 'MIN',
                required: false,
                default: '0.0',
                description: '( default=0.0 ) the minimum distance for RDF calculation (in Angstroms).'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic RDF calculation',
                code: `# Calculate RDF between two groups
rdf: RDF GROUPA=1-50 GROUPB=51-100 MAX=10.0 NBINS=100

# Print RDF to file
PRINT ARG=rdf FILE=rdf.dat STRIDE=10`
            },
            {
                title: 'RDF for specific atoms',
                code: `# RDF for water around protein
rdf_water: RDF GROUPA=@protein GROUPB=@water MAX=15.0 NBINS=200

# RDF with minimum distance
rdf_min: RDF GROUPA=1-10 GROUPB=11-20 MIN=2.0 MAX=10.0 NBINS=100`
            }
        ],
        notes: [
            'The RDF is normalized to approach 1 at large distances for uniform distributions.',
            'Peaks in the RDF indicate preferred distances between particles.',
            'The RDF is useful for analyzing solvation, coordination, and structure.',
            'The number of bins should be chosen to balance resolution and statistical accuracy.',
            'For periodic systems, the maximum distance should be less than half the box length.'
        ],
        related: ['COORDINATION', 'DISTANCE', 'HBOND']
    },
    
    'DRMSD': {
        name: 'DRMSD',
        category: 'Structural',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the distance RMSD (dRMSD).

The distance RMSD measures the difference in pairwise distances between the current structure and a reference structure. Unlike regular RMSD, dRMSD does not require structural alignment.

The dRMSD is calculated as:
dRMSD = sqrt((1/N) Σᵢⱼ (dᵢⱼ - dᵢⱼᵣᵉᶠ)²)

where:
- N is the number of distance pairs
- dᵢⱼ is the distance between atoms i and j in the current structure
- dᵢⱼᵣᵉᶠ is the distance between atoms i and j in the reference structure
- The sum is over all pairs within the specified distance range

dRMSD is useful when:
- Structures cannot be easily aligned
- You want to measure structural similarity without alignment
- You need a rotationally invariant measure`,
        syntax: 'DRMSD REFERENCE=<file> LOWER_CUTOFF=<lower> UPPER_CUTOFF=<upper> [ATOMS=<group>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference structure file (typically a PDB file)'
            },
            {
                keyword: 'LOWER_CUTOFF',
                required: true,
                description: 'the lower cutoff distance for including pairs in the dRMSD calculation (in Angstroms)'
            },
            {
                keyword: 'UPPER_CUTOFF',
                required: true,
                description: 'the upper cutoff distance for including pairs in the dRMSD calculation (in Angstroms)'
            },
            {
                keyword: 'ATOMS',
                required: false,
                description: 'the atoms to include in the dRMSD calculation. If not specified, all atoms are used.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic dRMSD calculation',
                code: `# Calculate dRMSD
drmsd: DRMSD REFERENCE=ref.pdb LOWER_CUTOFF=0.0 UPPER_CUTOFF=10.0

# Print dRMSD
PRINT ARG=drmsd FILE=colvar STRIDE=10`
            },
            {
                title: 'dRMSD for specific atoms',
                code: `# dRMSD for backbone atoms
drmsd_backbone: DRMSD REFERENCE=ref.pdb ATOMS=@backbone LOWER_CUTOFF=0.0 UPPER_CUTOFF=15.0

# dRMSD without periodic boundary conditions
drmsd_nopbc: DRMSD REFERENCE=ref.pdb LOWER_CUTOFF=0.0 UPPER_CUTOFF=10.0 NOPBC`
            }
        ],
        notes: [
            'dRMSD does not require structural alignment, making it rotationally invariant.',
            'The cutoff distances determine which atom pairs are included in the calculation.',
            'dRMSD is typically larger than regular RMSD for the same structural difference.',
            'The choice of cutoff distances affects the sensitivity to different types of structural changes.',
            'For large systems, calculating dRMSD for a subset of atoms is more efficient.'
        ],
        related: ['RMSD', 'GYRATION', 'DISTANCE']
    },
    
    'HBOND': {
        name: 'HBOND',
        category: 'Analysis',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the number of hydrogen bonds.

This collective variable counts the number of hydrogen bonds between two groups of atoms. A hydrogen bond is typically defined by:
- Distance between donor and acceptor (typically < 3.5 Å)
- Angle between donor-H-acceptor (typically > 120°)

The hydrogen bond count is calculated as:
N_HB = Σᵢⱼ s(rᵢⱼ) × f(θᵢⱼ)

where:
- s(r) is a switching function for the distance
- f(θ) is a function of the angle
- The sum is over all donor-acceptor pairs

This CV is useful for:
- Studying protein folding
- Analyzing solvation
- Monitoring hydrogen bond networks
- Characterizing protein-ligand interactions`,
        syntax: 'HBOND GROUPA=<group1> GROUPB=<group2> R_0=<value> [DONORS=<donors>] [ACCEPTORS=<acceptors>] [ANGLE_CUTOFF=<angle>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'the first group of atoms (typically donors or acceptors)'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'the second group of atoms (typically acceptors or donors)'
            },
            {
                keyword: 'R_0',
                required: true,
                description: 'the cutoff distance for hydrogen bonds (in Angstroms, typically 3.0-3.5 Å)'
            },
            {
                keyword: 'DONORS',
                required: false,
                description: 'the atoms that can act as hydrogen bond donors (e.g., N, O with H)'
            },
            {
                keyword: 'ACCEPTORS',
                required: false,
                description: 'the atoms that can act as hydrogen bond acceptors (e.g., O, N)'
            },
            {
                keyword: 'ANGLE_CUTOFF',
                required: false,
                default: '120.0',
                description: '( default=120.0 ) the minimum angle (in degrees) for a hydrogen bond'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic hydrogen bond calculation',
                code: `# Calculate hydrogen bonds
hbonds: HBOND GROUPA=1-50 GROUPB=51-100 R_0=3.5

# Print hydrogen bond count
PRINT ARG=hbonds FILE=colvar STRIDE=10`
            },
            {
                title: 'HBonds with specific donors/acceptors',
                code: `# HBonds with specific donors/acceptors
hbonds_specific: HBOND GROUPA=@protein GROUPB=@water R_0=3.2 DONORS=@N,NE,NH ACCEPTORS=@O

# HBonds with angle cutoff
hbonds_angle: HBOND GROUPA=1-100 GROUPB=101-200 R_0=3.5 ANGLE_CUTOFF=130.0`
            }
        ],
        notes: [
            'Hydrogen bonds are typically defined by distance (< 3.5 Å) and angle (> 120°).',
            'The default angle cutoff is 120°, but this can be adjusted.',
            'The R_0 parameter determines the distance cutoff for hydrogen bonds.',
            'This CV counts the total number of hydrogen bonds, not individual bonds.',
            'For proteins, typical donors include N (backbone and side chain) and O (side chain).',
            'Typical acceptors include O (backbone and side chain) and N (side chain).'
        ],
        related: ['COORDINATION', 'DISTANCE', 'RDF']
    },
    
    'MOLINFO': {
        name: 'MOLINFO',
        category: 'Utility',
        module: 'colvar',
        description: `This is part of the colvar module

Extract molecular information from a PDB file.

MOLINFO is used to load molecular information from a PDB file, which allows you to use predefined atom groups based on residue names, chain IDs, and other properties. This is particularly useful for proteins, where you can reference common dihedral angles (phi, psi, omega) and other structural elements.

After loading molecular information with MOLINFO, you can use special atom group syntax like:
- @phi-3 : phi angle for residue 3
- @psi-5 : psi angle for residue 5
- @omega-2 : omega angle for residue 2
- @chi1-4 : chi1 angle for residue 4
- @backbone : all backbone atoms
- @sidechain : all sidechain atoms

This makes it much easier to define CVs for proteins without manually specifying atom numbers.`,
        syntax: 'MOLINFO STRUCTURE=<file> [MOLTYPE=<type>]',
        options: [
            {
                keyword: 'STRUCTURE',
                required: true,
                description: 'a file in pdb format containing a reference structure. This is used to defines the atoms in the various residues, chains, etc. For more details on the PDB file format visit http://www.wwpdb.org/docs.html'
            },
            {
                keyword: 'MOLTYPE',
                required: false,
                default: 'protein',
                description: '( default=protein ) what kind of molecule is contained in the pdb file - usually not needed since protein/RNA/DNA are compatible'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Load molecular information',
                code: `# Load molecular information for a protein
mol: MOLINFO STRUCTURE=protein.pdb MOLTYPE=protein

# Use predefined dihedral angles
phi: TORSION ATOMS=@phi-3
psi: TORSION ATOMS=@psi-3
omega: TORSION ATOMS=@omega-3

# Use backbone atoms
backbone_rmsd: RMSD REFERENCE=ref.pdb ATOMS=@backbone`
            }
        ],
        notes: [
            'MOLINFO must be called before using the special atom group syntax (@phi-3, etc.).',
            'The PDB file should contain proper residue numbering and chain information.',
            'MOLTYPE=protein enables protein-specific groups (phi, psi, omega, chi angles, backbone, sidechain).',
            'For RNA/DNA, different groups are available.',
            'This action does not compute any CV itself, but enables easier CV definition.',
            'The special syntax (@phi-3, etc.) can be used in any CV that takes ATOMS as input.'
        ],
        related: ['TORSION', 'ANGLE', 'RMSD']
    },
    
    'COMBINE': {
        name: 'COMBINE',
        category: 'Composite',
        module: 'colvar',
        description: `This is part of the colvar module

Combine multiple collective variables using mathematical operations.

COMBINE allows you to create new collective variables by combining existing ones using linear combinations or other mathematical operations. This is useful for:
- Creating weighted combinations of CVs
- Defining reaction coordinates
- Combining related CVs into a single CV
- Creating custom CVs from simpler ones

The combination is calculated as:
CV_combined = Σᵢ cᵢ × CVᵢ

where cᵢ are the coefficients and CVᵢ are the input collective variables.

COMBINE can also handle periodic CVs by specifying the periodicity.`,
        syntax: 'COMBINE ARG=<cv1>,<cv2>,... PERIODIC=<NO or min,max> [COEFFICIENTS=<c1>,<c2>,...] [PARAMETERS=<p1>,<p2>,...] [POWERS=<pow1>,<pow2>,...]',
        options: [
            {
                keyword: 'ARG',
                required: false,
                description: 'the input for this action is the scalar output from one or more other actions. The particular scalars that you will use are referenced using the label of the action.'
            },
            {
                keyword: 'PERIODIC',
                required: true,
                description: 'if the output of your function is periodic then you should specify the periodicity of the function. If the output is not periodic you must state this using PERIODIC=NO.'
            },
            {
                keyword: 'COEFFICIENTS',
                required: false,
                default: '1.0',
                description: '( default=1.0 ) the coefficients of the arguments in your function.'
            },
            {
                keyword: 'PARAMETERS',
                required: false,
                default: '0.0',
                description: '( default=0.0 ) the parameters of the arguments in your function.'
            },
            {
                keyword: 'POWERS',
                required: false,
                default: '1.0',
                description: '( default=1.0 ) the powers to which you are raising each of the arguments in your function.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Combine two distances',
                code: `# Combine two distances
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
combined: COMBINE ARG=d1,d2 COEFFICIENTS=1.0,-1.0

# Print combined CV
PRINT ARG=combined FILE=colvar STRIDE=10`
            },
            {
                title: 'Weighted combination',
                code: `# Weighted combination of multiple CVs
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
angle: ANGLE ATOMS=5,6,7
weighted: COMBINE ARG=d1,d2,angle COEFFICIENTS=0.7,0.2,0.1`
            },
            {
                title: 'Periodic combination',
                code: `# Combine periodic CVs (e.g., torsions)
phi: TORSION ATOMS=1,2,3,4
psi: TORSION ATOMS=5,6,7,8
combined: COMBINE ARG=phi,psi COEFFICIENTS=1.0,1.0 PERIODIC=-3.14159,3.14159`
            }
        ],
        notes: [
            'The number of coefficients must match the number of CVs in ARG.',
            'COMBINE creates a linear combination of the input CVs.',
            'For periodic CVs (like torsions), specify the PERIODIC keyword.',
            'The combined CV can be used as input to other actions (metadynamics, etc.).',
            'Negative coefficients can be used to create differences or other combinations.',
            'The units of the combined CV depend on the units of the input CVs and coefficients.'
        ],
        related: ['DISTANCE', 'ANGLE', 'TORSION', 'MULTICOLVAR']
    },
    
    'CUSTOM': {
        name: 'CUSTOM',
        category: 'Composite',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate a combination of variables using a custom expression.

CUSTOM allows you to define arbitrary mathematical expressions involving other collective variables. You can use standard mathematical functions, operators, and variables in your expression.

The expression can include:
- Basic arithmetic: +, -, *, /, ^ (power)
- Mathematical functions: sin, cos, tan, exp, log, sqrt, etc.
- Variables: x, y, z for the first, second, third argument, etc.

CUSTOM is useful for:
- Creating complex CVs from simpler ones
- Defining custom reaction coordinates
- Applying mathematical transformations
- Combining multiple CVs with non-linear functions`,
        syntax: 'CUSTOM ARG=<cv1>,<cv2>,... FUNC=<expression> PERIODIC=<NO or min,max> [VAR=<var1>,<var2>,...]',
        options: [
            {
                keyword: 'ARG',
                required: false,
                description: 'the input for this action is the scalar output from one or more other actions. The particular scalars that you will use are referenced using the label of the action.'
            },
            {
                keyword: 'FUNC',
                required: true,
                description: 'the function you wish to evaluate'
            },
            {
                keyword: 'PERIODIC',
                required: true,
                description: 'if the output of your function is periodic then you should specify the periodicity of the function. If the output is not periodic you must state this using PERIODIC=NO'
            },
            {
                keyword: 'VAR',
                required: false,
                description: 'the names to give each of the arguments in the function. If you have up to three arguments in your function you can use x, y and z to refer to them. Otherwise you must use this flag to give your variables names.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Custom expression with one CV',
                code: `# Custom function of a distance
d: DISTANCE ATOMS=1,2
custom: CUSTOM ARG=d FUNC="x^2+exp(-x)" PERIODIC=NO`
            },
            {
                title: 'Custom expression with multiple CVs',
                code: `# Combine multiple CVs with custom expression
d: DISTANCE ATOMS=1,2
angle: ANGLE ATOMS=3,4,5
custom: CUSTOM ARG=d,angle FUNC="x*y+sin(x)" PERIODIC=NO`
            },
            {
                title: 'Complex custom expression',
                code: `# Complex mathematical expression
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
complex: CUSTOM ARG=d1,d2 FUNC="sqrt(x^2+y^2)+log(x+y)" PERIODIC=NO`
            }
        ],
        notes: [
            'CUSTOM allows arbitrary mathematical expressions.',
            'Variables in FUNC are x, y, z, ... corresponding to the order of ARG.',
            'Standard mathematical functions are available: sin, cos, tan, exp, log, sqrt, etc.',
            'Use PERIODIC to specify periodicity for periodic CVs.',
            'MATHEVAL is an alias for CUSTOM with the same functionality.'
        ],
        related: ['MATHEVAL', 'COMBINE', 'PIECEWISE']
    },
    
    'METAD': {
        name: 'METAD',
        category: 'Bias',
        module: 'bias',
        description: `This is part of the bias module

Used to perform metadynamics on one or more collective variables.

Metadynamics is an enhanced sampling method that adds a history-dependent bias potential to the system. The bias is constructed by periodically depositing Gaussian-shaped hills in the CV space. Over time, these hills fill the free energy minima, allowing the system to escape local minima and explore the free energy landscape.

The metadynamics bias is calculated as:
V(s,t) = Σᵢ wᵢ × exp(-Σⱼ ((sⱼ - sⱼᵢ)² / (2σⱼ²)))

where:
- s is the current CV value
- t is time
- wᵢ is the height of hill i
- sⱼᵢ is the position of hill i in CV space
- σⱼ is the width (sigma) of the Gaussian in CV j

Metadynamics is useful for:
- Exploring free energy landscapes
- Calculating free energy surfaces
- Accelerating rare events
- Sampling conformational space`,
        syntax: 'METAD ARG=<cv1>,<cv2>,... SIGMA=<sigma1>,<sigma2>,... HEIGHT=<height> PACE=<pace> FILE=<file> [TEMP=<temp>] [BIASFACTOR=<factor>] [RESTART=<restart>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the list of collective variables on which to perform metadynamics. For more information on how to specify lists of atoms see Groups and Virtual Atoms'
            },
            {
                keyword: 'SIGMA',
                required: true,
                description: 'the width (sigma) of the Gaussian hills for each CV. The number of values must match the number of CVs in ARG. Units should match the CV units.'
            },
            {
                keyword: 'HEIGHT',
                required: true,
                description: 'the height of the Gaussian hills. This determines how strong the bias is. Typical values are 0.5-2.0 kcal/mol.'
            },
            {
                keyword: 'PACE',
                required: true,
                description: 'the frequency (in MD steps) at which to deposit Gaussian hills. Typical values are 100-1000 steps.'
            },
            {
                keyword: 'FILE',
                required: true,
                description: 'the file where to write the bias potential (HILLS file). This file can be used to restart the simulation.'
            },
            {
                keyword: 'TEMP',
                required: false,
                description: 'the temperature of the system (for well-tempered metadynamics). If not specified, standard metadynamics is performed.'
            },
            {
                keyword: 'BIASFACTOR',
                required: false,
                description: 'the bias factor for well-tempered metadynamics. This controls how the hill height decreases over time. Typical values are 10-100.'
            },
            {
                keyword: 'RESTART',
                required: false,
                default: 'off',
                description: '( default=off ) whether to restart from a previous HILLS file. If RESTART, the existing HILLS file is read and new hills are appended.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic metadynamics',
                code: `# Metadynamics on a distance
d: DISTANCE ATOMS=1,2
METAD ARG=d SIGMA=0.1 HEIGHT=1.2 PACE=500 FILE=HILLS

# Print the CV and bias
PRINT ARG=d FILE=COLVAR STRIDE=10`
            },
            {
                title: 'Well-tempered metadynamics',
                code: `# Well-tempered metadynamics
d: DISTANCE ATOMS=1,2
METAD ARG=d SIGMA=0.1 HEIGHT=1.2 PACE=500 FILE=HILLS TEMP=300.0 BIASFACTOR=10.0`
            },
            {
                title: 'Multi-dimensional metadynamics',
                code: `# Metadynamics on two CVs
d: DISTANCE ATOMS=1,2
angle: ANGLE ATOMS=3,4,5
METAD ARG=d,angle SIGMA=0.1,0.1 HEIGHT=1.2 PACE=500 FILE=HILLS`
            },
            {
                title: 'Restart metadynamics',
                code: `# Restart from previous HILLS file
d: DISTANCE ATOMS=1,2
METAD ARG=d SIGMA=0.1 HEIGHT=1.2 PACE=500 FILE=HILLS RESTART`
            }
        ],
        notes: [
            'Metadynamics is a history-dependent method - the bias accumulates over time.',
            'The SIGMA parameter should be chosen based on the expected fluctuations of the CV.',
            'Smaller SIGMA values give higher resolution but require more hills to fill the landscape.',
            'Well-tempered metadynamics (with BIASFACTOR) is generally preferred as it converges better.',
            'The HILLS file can be used to reconstruct the free energy surface after the simulation.',
            'For periodic CVs (like torsions), make sure to specify the periodicity in the CV definition.'
        ],
        related: ['PBMETAD', 'RESTRAINT', 'LOWER_WALLS', 'UPPER_WALLS']
    },
    
    'PBMETAD': {
        name: 'PBMETAD',
        category: 'Bias',
        module: 'bias',
        description: `This is part of the bias module

Used to perform Parallel Bias metadynamics.

Parallel Bias metadynamics (PBMetad) is an extension of metadynamics that allows multiple walkers (replicas) to share bias information. Each walker deposits hills that are immediately available to all other walkers, leading to faster convergence and better sampling.

The key advantage of PBMetad over standard metadynamics is that multiple walkers can explore different regions of CV space simultaneously, and the bias from all walkers contributes to filling the free energy landscape.

PBMetad is particularly useful for:
- Large free energy landscapes
- Systems with multiple minima
- When using multiple replicas
- Accelerating convergence`,
        syntax: 'PBMETAD ARG=<cv1>,<cv2>,... SIGMA=<sigma1>,<sigma2>,... HEIGHT=<height> PACE=<pace> FILE=<file> [TEMP=<temp>] [BIASFACTOR=<factor>] [RESTART=<restart>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the list of collective variables on which to perform parallel bias metadynamics'
            },
            {
                keyword: 'SIGMA',
                required: true,
                description: 'the width (sigma) of the Gaussian hills for each CV'
            },
            {
                keyword: 'HEIGHT',
                required: true,
                description: 'the height of the Gaussian hills'
            },
            {
                keyword: 'PACE',
                required: true,
                description: 'the frequency (in MD steps) at which to deposit Gaussian hills'
            },
            {
                keyword: 'FILE',
                required: true,
                description: 'the file where to write the bias potential (HILLS file). All walkers write to the same file.'
            },
            {
                keyword: 'TEMP',
                required: false,
                description: 'the temperature of the system (for well-tempered PBMetad)'
            },
            {
                keyword: 'BIASFACTOR',
                required: false,
                description: 'the bias factor for well-tempered parallel bias metadynamics'
            },
            {
                keyword: 'RESTART',
                required: false,
                default: 'off',
                description: '( default=off ) whether to restart from a previous HILLS file'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic parallel bias metadynamics',
                code: `# Parallel bias metadynamics
d: DISTANCE ATOMS=1,2
PBMETAD ARG=d SIGMA=0.1 HEIGHT=1.2 PACE=500 FILE=HILLS

# All walkers share the same HILLS file
PRINT ARG=d FILE=COLVAR STRIDE=10`
            },
            {
                title: 'Well-tempered PBMetad',
                code: `# Well-tempered parallel bias metadynamics
d: DISTANCE ATOMS=1,2
PBMETAD ARG=d SIGMA=0.1 HEIGHT=1.2 PACE=500 FILE=HILLS TEMP=300.0 BIASFACTOR=10.0`
            }
        ],
        notes: [
            'PBMetad requires multiple walkers (replicas) to be effective.',
            'All walkers must use the same HILLS file for sharing bias information.',
            'PBMetad typically converges faster than standard metadynamics.',
            'The bias from all walkers accumulates in the same HILLS file.',
            'Make sure all walkers can access the same file system for the HILLS file.'
        ],
        related: ['METAD', 'RESTRAINT']
    },
    
    'PIECEWISE': {
        name: 'PIECEWISE',
        category: 'Composite',
        module: 'colvar',
        description: `This is part of the colvar module

Compute a piece wise straight line through its arguments that passes through a set of ordered control points.

PIECEWISE creates a piecewise linear function that interpolates between control points. The function is defined by a series of points, and the value is computed by linear interpolation between the nearest points.

PIECEWISE is useful for:
- Creating piecewise linear functions
- Defining step-like potentials
- Interpolating between control points
- Creating custom switching functions`,
        syntax: 'PIECEWISE ARG=<cv> POINTS=<points>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the collective variable to use as input for the piecewise function'
            },
            {
                keyword: 'POINTS',
                required: true,
                description: 'the control points defining the piecewise function. Should be specified as a comma-separated list of values, e.g., POINTS=0.0,1.0,2.0,3.0'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Piecewise function',
                code: `# Piecewise linear function
d: DISTANCE ATOMS=1,2
piecewise: PIECEWISE ARG=d POINTS=0.0,1.0,2.0,3.0

# Piecewise with more points
piecewise2: PIECEWISE ARG=d POINTS=0.0,0.5,1.0,1.5,2.0,2.5,3.0`
            }
        ],
        notes: [
            'PIECEWISE creates a piecewise linear interpolation.',
            'The function interpolates linearly between control points.',
            'Points should be ordered (increasing or decreasing).',
            'Useful for creating custom switching functions.'
        ],
        related: ['CUSTOM', 'MATHEVAL', 'COMBINE']
    },
    
    'RESTRAINT': {
        name: 'RESTRAINT',
        category: 'Bias',
        module: 'bias',
        description: `This is part of the bias module

Adds harmonic and/or linear restraints on one or more variables.

A harmonic restraint adds a quadratic potential that keeps the CV near a target value:
V(s) = (1/2) × κ × (s - s₀)²

where:
- κ (KAPPA) is the force constant
- s₀ (AT) is the target value
- s is the current CV value

A linear restraint adds a linear potential:
V(s) = α × (s - s₀)

where α (SLOPE) is the slope of the linear potential.

RESTRAINT is useful for:
- Keeping the system in a specific region of CV space
- Applying constant forces
- Steering simulations
- Constraining CVs to target values`,
        syntax: 'RESTRAINT ARG=<cv> AT=<value> [KAPPA=<kappa>] [SLOPE=<slope>]',
        options: [
            {
                keyword: 'ARG',
                required: false,
                description: 'the input for this action is the scalar output from one or more other actions. The particular scalars that you will use are referenced using the label of the action.'
            },
            {
                keyword: 'SLOPE',
                required: false,
                default: '0.0',
                description: '( default=0.0 ) specifies that the restraint is linear and what the values of the force constants on each of the variables are.'
            },
            {
                keyword: 'KAPPA',
                required: false,
                default: '0.0',
                description: '( default=0.0 ) specifies that the restraint is harmonic and what the values of the force constants on each of the variables are.'
            },
            {
                keyword: 'AT',
                required: true,
                description: 'the position of the restraint.'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic harmonic restraint',
                code: `# Harmonic restraint on distance
d: DISTANCE ATOMS=1,2
RESTRAINT ARG=d AT=5.0 KAPPA=10.0

# Print CV and bias
PRINT ARG=d FILE=COLVAR STRIDE=10`
            },
            {
                title: 'Restraint with linear component',
                code: `# Restraint with both harmonic and linear components
d: DISTANCE ATOMS=1,2
RESTRAINT ARG=d AT=5.0 KAPPA=10.0 SLOPE=0.5`
            },
            {
                title: 'Multiple restraints',
                code: `# Restrain multiple CVs
d: DISTANCE ATOMS=1,2
angle: ANGLE ATOMS=3,4,5
RESTRAINT ARG=d AT=5.0 KAPPA=10.0
RESTRAINT ARG=angle AT=1.57 KAPPA=50.0`
            }
        ],
        notes: [
            'The harmonic restraint is always applied (if KAPPA > 0).',
            'The linear restraint is optional and is added if SLOPE is specified.',
            'Larger KAPPA values give stronger restraints but may slow down dynamics.',
            'The restraint energy is added to the total potential energy.',
            'For periodic CVs, make sure the AT value is within the periodic range.'
        ],
        related: ['LOWER_WALLS', 'UPPER_WALLS', 'MOVINGRESTRAINT']
    },
    
    'LOWER_WALLS': {
        name: 'LOWER_WALLS',
        category: 'Bias',
        module: 'bias',
        description: `This is part of the bias module

Defines a lower wall for the value of one or more collective variables.

A lower wall prevents the CV from going below a certain value. The wall potential is:
V(s) = (1/2) × κ × (s - s_wall)² × Θ(s_wall - s)

where:
- κ (KAPPA) is the force constant
- s_wall (AT) is the wall position
- s is the current CV value
- Θ is the Heaviside step function (1 if s < s_wall, 0 otherwise)

The wall potential is only active when the CV is below the wall position. This limits the region of phase space accessible during the simulation.

LOWER_WALLS is useful for:
- Preventing unphysical configurations
- Keeping CVs above a minimum value
- Defining boundaries in CV space
- Avoiding numerical instabilities`,
        syntax: 'LOWER_WALLS ARG=<cv> AT=<value> KAPPA=<kappa> [EXP=<exp>] [OFFSET=<offset>]',
        options: [
            {
                keyword: 'ARG',
                required: false,
                description: 'the input for this action is the scalar output from one or more other actions. The particular scalars that you will use are referenced using the label of the action.'
            },
            {
                keyword: 'AT',
                required: true,
                description: 'the positions of the wall. The a_i in the expression for a wall.'
            },
            {
                keyword: 'KAPPA',
                required: true,
                description: 'the force constant for the wall. Larger values give stiffer walls. Units: energy / CV_unit²'
            },
            {
                keyword: 'EXP',
                required: false,
                default: '2',
                description: '( default=2 ) the exponent in the wall potential. EXP=2 gives a harmonic wall, EXP>2 gives steeper walls.'
            },
            {
                keyword: 'EPS',
                required: false,
                default: '1.0',
                description: '( default=1.0 ) a small parameter to avoid numerical issues near the wall'
            },
            {
                keyword: 'OFFSET',
                required: false,
                default: '0.0',
                description: '( default=0.0 ) an offset to shift the wall position'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic lower wall',
                code: `# Lower wall on distance
d: DISTANCE ATOMS=1,2
LOWER_WALLS ARG=d AT=2.0 KAPPA=100.0

# Prevents distance from going below 2.0 Å
PRINT ARG=d FILE=COLVAR STRIDE=10`
            },
            {
                title: 'Steep lower wall',
                code: `# Lower wall with high exponent (steeper)
d: DISTANCE ATOMS=1,2
LOWER_WALLS ARG=d AT=2.0 KAPPA=100.0 EXP=4`
            },
            {
                title: 'Multiple lower walls',
                code: `# Lower walls on multiple CVs
d: DISTANCE ATOMS=1,2
angle: ANGLE ATOMS=3,4,5
LOWER_WALLS ARG=d AT=2.0 KAPPA=100.0
LOWER_WALLS ARG=angle AT=0.5 KAPPA=50.0`
            }
        ],
        notes: [
            'The wall is only active when the CV is below the AT value.',
            'Larger KAPPA values give stiffer walls but may slow down dynamics.',
            'EXP=2 gives a harmonic wall, higher EXP gives steeper walls.',
            'The wall potential goes to zero smoothly above the wall position.',
            'For periodic CVs, be careful with wall placement relative to periodic boundaries.'
        ],
        related: ['UPPER_WALLS', 'RESTRAINT']
    },
    
    'UPPER_WALLS': {
        name: 'UPPER_WALLS',
        category: 'Bias',
        module: 'bias',
        description: `This is part of the bias module

Defines an upper wall for the value of one or more collective variables.

An upper wall prevents the CV from going above a certain value. The wall potential is:
V(s) = (1/2) × κ × (s - s_wall)² × Θ(s - s_wall)

where:
- κ (KAPPA) is the force constant
- s_wall (AT) is the wall position
- s is the current CV value
- Θ is the Heaviside step function (1 if s > s_wall, 0 otherwise)

The wall potential is only active when the CV is above the wall position. This limits the region of phase space accessible during the simulation.

UPPER_WALLS is useful for:
- Preventing unphysical configurations
- Keeping CVs below a maximum value
- Defining boundaries in CV space
- Avoiding numerical instabilities`,
        syntax: 'UPPER_WALLS ARG=<cv> AT=<value> KAPPA=<kappa> [EXP=<exp>] [EPS=<eps>] [OFFSET=<offset>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the collective variable on which to apply the upper wall'
            },
            {
                keyword: 'AT',
                required: true,
                description: 'the position of the upper wall. The CV cannot go above this value.'
            },
            {
                keyword: 'KAPPA',
                required: true,
                description: 'the force constant for the wall. Larger values give stiffer walls. Units: energy / CV_unit²'
            },
            {
                keyword: 'EXP',
                required: false,
                default: '2',
                description: '( default=2 ) the exponent in the wall potential. EXP=2 gives a harmonic wall, EXP>2 gives steeper walls.'
            },
            {
                keyword: 'EPS',
                required: false,
                default: '1.0',
                description: '( default=1.0 ) a small parameter to avoid numerical issues near the wall'
            },
            {
                keyword: 'OFFSET',
                required: false,
                default: '0.0',
                description: '( default=0.0 ) an offset to shift the wall position'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic upper wall',
                code: `# Upper wall on distance
d: DISTANCE ATOMS=1,2
UPPER_WALLS ARG=d AT=10.0 KAPPA=100.0

# Prevents distance from going above 10.0 Å
PRINT ARG=d FILE=COLVAR STRIDE=10`
            },
            {
                title: 'Steep upper wall',
                code: `# Upper wall with high exponent (steeper)
d: DISTANCE ATOMS=1,2
UPPER_WALLS ARG=d AT=10.0 KAPPA=100.0 EXP=4`
            },
            {
                title: 'Combined walls',
                code: `# Both lower and upper walls
d: DISTANCE ATOMS=1,2
LOWER_WALLS ARG=d AT=2.0 KAPPA=100.0
UPPER_WALLS ARG=d AT=10.0 KAPPA=100.0`
            }
        ],
        notes: [
            'The wall is only active when the CV is above the AT value.',
            'Larger KAPPA values give stiffer walls but may slow down dynamics.',
            'EXP=2 gives a harmonic wall, higher EXP gives steeper walls.',
            'The wall potential goes to zero smoothly below the wall position.',
            'For periodic CVs, be careful with wall placement relative to periodic boundaries.',
            'Combining LOWER_WALLS and UPPER_WALLS creates a "box" in CV space.'
        ],
        related: ['LOWER_WALLS', 'RESTRAINT']
    },
    
    'ABMD': {
        name: 'ABMD',
        category: 'Bias',
        module: 'bias',
        description: `This is part of the bias module

Adds a ratchet-and-pawl like restraint on one or more variables.

This action can be used to evolve a system towards a target value in CV space using an harmonic potential moving with the thermal fluctuations of the CV. The biasing potential in this method is as follows:

V(ρ(t)) = { (K/2)(ρ(t)-ρ_m(t))², if ρ(t) > ρ_m(t)
          { 0, if ρ(t) ≤ ρ_m(t)

where

ρ(t) = (CV(t) - TO)²

and

ρ_m(t) = min_{0≤τ≤t} ρ(τ) + η(t)

The method is based on the introduction of a biasing potential which is zero when the system is moving towards the desired arrival point and which damps the fluctuations when the system attempts to move in the opposite direction. As in the case of the ratchet and pawl system, propelled by thermal motion of the solvent molecules, the biasing potential does not exert work on the system. η(t) is an additional white noise acting on the minimum position of the bias.

ABMD is useful for:
- Driving reactions towards target values
- Steered molecular dynamics
- Pulling simulations
- Forcing transitions using thermal fluctuations`,
        syntax: 'ABMD ARG=<cv1>,<cv2>,... TO=<value1>,<value2>,... KAPPA=<kappa1>,<kappa2>,... [MIN=<min1>,<min2>,...] [NOISE=<noise1>,<noise2>,...] [SEED=<seed1>,<seed2>,...] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the input for this action is the scalar output from one or more other actions. The particular scalars that you will use are referenced using the label of the action. If the label appears on its own then it is assumed that the Action calculates a single scalar value. The value of this scalar is thus used as the input to this new action. You can use multiple instances of this keyword i.e. ARG1, ARG2, ARG3...'
            },
            {
                keyword: 'TO',
                required: true,
                description: 'The array of target values. ABMD will drive each CV towards its corresponding target value.'
            },
            {
                keyword: 'KAPPA',
                required: true,
                description: 'The array of force constants. Larger values give stronger driving forces. Must have the same number of elements as ARG and TO.'
            },
            {
                keyword: 'MIN',
                required: false,
                description: 'Array of starting values for the bias (set ρ_m(t), otherwise it is set using the current value of ARG)'
            },
            {
                keyword: 'NOISE',
                required: false,
                description: 'Array of white noise intensities (add a temperature to the ABMD). This corresponds to η(t) in the formula.'
            },
            {
                keyword: 'SEED',
                required: false,
                description: 'Array of seeds for the white noise (add a temperature to the ABMD)'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [
            {
                name: 'bias',
                description: 'the instantaneous value of the bias potential'
            },
            {
                name: 'force2',
                description: 'the instantaneous value of the squared force due to this bias potential'
            },
            {
                name: '_min',
                description: 'one or multiple instances of this quantity can be referenced elsewhere in the input file. These quantities will be named with the arguments of the bias followed by the character string _min. These quantities tell the user the minimum value assumed by ρ_m(t). For example, if ARG=d1,d2, then abmd.d1_min and abmd.d2_min will be available.'
            }
        ],
        examples: [
            {
                title: 'Basic ABMD with single CV',
                code: `# ABMD on a single distance
d1: DISTANCE ATOMS=3,5
abmd: ABMD ARG=d1 TO=1.0 KAPPA=5.0

# Print the bias and minimum
PRINT ARG=abmd.bias,abmd.d1_min FILE=COLVAR STRIDE=10`
            },
            {
                title: 'ABMD with multiple CVs',
                code: `# ABMD on two distances
d1: DISTANCE ATOMS=3,5
d2: DISTANCE ATOMS=2,4
abmd: ABMD ARG=d1,d2 TO=1.0,1.5 KAPPA=5.0,5.0

# Print bias and minimums for both CVs
PRINT ARG=abmd.bias,abmd.d1_min,abmd.d2_min FILE=COLVAR STRIDE=10`
            },
            {
                title: 'ABMD with noise',
                code: `# ABMD with white noise
d: DISTANCE ATOMS=1,2
abmd: ABMD ARG=d TO=10.0 KAPPA=10.0 NOISE=0.1 SEED=12345

# The noise adds temperature to the ABMD minimum position`
            }
        ],
        notes: [
            'ABMD creates a ratchet effect - it prevents the CV from going backwards when ρ(t) > ρ_m(t).',
            'The bias is zero when the system moves towards the target (ρ(t) ≤ ρ_m(t)).',
            'TO and KAPPA must be arrays with the same number of elements as ARG.',
            'The method uses thermal fluctuations to drive the system, so it does not exert work on the system.',
            'NOISE adds white noise to the minimum position, which can help escape local minima.',
            'Each CV in ARG will have a corresponding _min quantity (e.g., abmd.d1_min, abmd.d2_min).',
            'ABMD is useful for pulling/steering simulations where you want to drive towards a target value.'
        ],
        related: ['MOVINGRESTRAINT', 'RESTRAINT', 'METAD']
    },
    
    'MOVINGRESTRAINT': {
        name: 'MOVINGRESTRAINT',
        category: 'Bias',
        module: 'bias',
        description: `This is part of the bias module

Add a time-dependent, harmonic restraint on one or more variables.

MOVINGRESTRAINT applies a harmonic restraint whose center (AT) and/or force constant (KAPPA) change over time according to a predefined schedule. This allows you to gradually move the restraint or change its strength.

The restraint potential is:
V(s,t) = (1/2) × κ(t) × (s - s₀(t))²

where both κ(t) and s₀(t) can vary linearly between specified points.

MOVINGRESTRAINT is useful for:
- Steered molecular dynamics
- Pulling simulations
- Gradually changing restraints
- Time-dependent biasing`,
        syntax: 'MOVINGRESTRAINT ARG=<cv> STEP0=<step0> AT0=<at0> KAPPA0=<kappa0> STEP1=<step1> AT1=<at1> KAPPA1=<kappa1> [STEP2=<step2> AT2=<at2> KAPPA2=<kappa2> ...]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the collective variable to restrain'
            },
            {
                keyword: 'STEP0',
                required: true,
                description: 'the MD step at which the first restraint point starts'
            },
            {
                keyword: 'AT0',
                required: true,
                description: 'the target CV value at STEP0'
            },
            {
                keyword: 'KAPPA0',
                required: true,
                description: 'the force constant at STEP0'
            },
            {
                keyword: 'STEP1',
                required: true,
                description: 'the MD step at which the first restraint point ends and the second begins'
            },
            {
                keyword: 'AT1',
                required: true,
                description: 'the target CV value at STEP1'
            },
            {
                keyword: 'KAPPA1',
                required: true,
                description: 'the force constant at STEP1'
            },
            {
                keyword: 'STEP2, AT2, KAPPA2, ...',
                required: false,
                description: 'additional points in the schedule. The restraint interpolates linearly between points.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic moving restraint',
                code: `# Moving restraint from 5.0 to 10.0 Å
d: DISTANCE ATOMS=1,2
MOVINGRESTRAINT ARG=d STEP0=0 AT0=5.0 KAPPA0=10.0 STEP1=10000 AT1=10.0 KAPPA1=10.0

# Restraint moves linearly from 5.0 to 10.0 over 10000 steps
PRINT ARG=d FILE=COLVAR STRIDE=10`
            },
            {
                title: 'Moving restraint with changing KAPPA',
                code: `# Restraint that moves and changes strength
d: DISTANCE ATOMS=1,2
MOVINGRESTRAINT ARG=d STEP0=0 AT0=5.0 KAPPA0=10.0 STEP1=10000 AT1=10.0 KAPPA1=50.0`
            },
            {
                title: 'Multi-stage moving restraint',
                code: `# Restraint with multiple stages
d: DISTANCE ATOMS=1,2
MOVINGRESTRAINT ARG=d STEP0=0 AT0=5.0 KAPPA0=10.0 STEP1=5000 AT1=7.5 KAPPA1=20.0 STEP2=10000 AT2=10.0 KAPPA2=10.0`
            }
        ],
        notes: [
            'The restraint interpolates linearly between specified points.',
            'Both AT and KAPPA can change over time.',
            'You can specify multiple points to create complex schedules.',
            'MOVINGRESTRAINT is useful for pulling/steering simulations.',
            'Make sure the schedule covers the entire simulation time.'
        ],
        related: ['RESTRAINT', 'ABMD']
    },
    
    'EXTERNAL': {
        name: 'EXTERNAL',
        category: 'Bias',
        module: 'bias',
        description: `This is part of the bias module

Calculate a restraint that is defined on a grid that is read during start up.

EXTERNAL allows you to apply a bias potential that is pre-computed and stored in a file. The bias is defined on a grid, and PLUMED interpolates the grid to get the bias value at the current CV position.

The bias file can be generated from:
- Previous metadynamics simulations (HILLS file)
- Free energy calculations
- Other enhanced sampling methods
- Manually constructed potentials

EXTERNAL is useful for:
- Applying pre-computed biases
- Restarting simulations with existing bias
- Combining biases from different sources
- Testing bias potentials`,
        syntax: 'EXTERNAL ARG=<cv> FILE=<file> [FMT=<fmt>] [PERIODIC=<periodic>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the collective variable on which the external bias is defined'
            },
            {
                keyword: 'FILE',
                required: true,
                description: 'the file containing the bias potential. The file format depends on FMT.'
            },
            {
                keyword: 'FMT',
                required: false,
                default: 'auto',
                description: '( default=auto ) the format of the bias file. Options: auto, hills, grid, etc.'
            },
            {
                keyword: 'PERIODIC',
                required: false,
                description: 'the periodicity of the CV. Format: PERIODIC=min,max. Required for periodic CVs.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'External bias from HILLS file',
                code: `# Apply bias from previous metadynamics
d: DISTANCE ATOMS=1,2
EXTERNAL ARG=d FILE=HILLS FMT=hills

# The bias from HILLS file is applied
PRINT ARG=d FILE=COLVAR STRIDE=10`
            },
            {
                title: 'External bias from grid file',
                code: `# Apply bias from grid file
d: DISTANCE ATOMS=1,2
EXTERNAL ARG=d FILE=bias.dat FMT=grid`
            },
            {
                title: 'External bias for periodic CV',
                code: `# External bias for torsion (periodic)
phi: TORSION ATOMS=1,2,3,4
EXTERNAL ARG=phi FILE=bias.dat PERIODIC=-3.14159,3.14159`
            }
        ],
        notes: [
            'The bias file must be readable and in the correct format.',
            'For HILLS files, PLUMED reconstructs the bias from the Gaussian hills.',
            'For grid files, PLUMED interpolates the grid values.',
            'Make sure the grid covers the relevant CV space.',
            'For periodic CVs, specify PERIODIC to ensure correct interpolation.'
        ],
        related: ['METAD', 'PBMETAD']
    },
    
    'BIASVALUE': {
        name: 'BIASVALUE',
        category: 'Bias',
        module: 'bias',
        description: `This is part of the bias module

Takes the value of one variable and use it as a bias.

BIASVALUE allows you to use the value of a collective variable (or any action) directly as a bias potential. This is useful when you want to apply a bias that was computed by another action.

The bias is simply:
V = CV_value

where CV_value is the output of the specified action.

BIASVALUE is useful for:
- Using CV values as biases
- Chaining actions
- Creating custom bias functions
- Testing bias implementations`,
        syntax: 'BIASVALUE ARG=<action>',
        options: [
            {
                keyword: 'ARG',
                required: false,
                description: 'the input for this action is the scalar output from one or more other actions. The particular scalars that you will use are referenced using the label of the action.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Use CV value as bias',
                code: `# Use distance as bias
d: DISTANCE ATOMS=1,2
BIASVALUE ARG=d

# The distance value is used as the bias
PRINT ARG=d FILE=COLVAR STRIDE=10`
            },
            {
                title: 'Chain actions',
                code: `# Use combined CV as bias
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
combined: COMBINE ARG=d1,d2 COEFFICIENTS=1.0,-1.0
BIASVALUE ARG=combined`
            }
        ],
        notes: [
            'BIASVALUE simply uses the output of another action as the bias.',
            'The action in ARG must output a scalar value.',
            'This is useful for creating custom bias functions.',
            'The bias units are the same as the CV units.'
        ],
        related: ['COMBINE', 'EXTERNAL']
    },
    
    'EXTENDED_LAGRANGIAN': {
        name: 'EXTENDED_LAGRANGIAN',
        category: 'Bias',
        module: 'bias',
        description: `This is part of the bias module

Add extended Lagrangian.

EXTENDED_LAGRANGIAN adds an extended variable that is coupled to a collective variable through a harmonic potential. This is used in methods like extended-system adaptive biasing force (eABF) and other extended-system methods.

The extended variable evolves according to:
m × d²s/dt² = -κ × (s - ξ) - γ × ds/dt + noise

where:
- s is the extended variable
- ξ is the CV value
- κ is the coupling constant
- m is the mass of the extended variable
- γ is the friction

EXTENDED_LAGRANGIAN is useful for:
- Extended-system methods
- eABF simulations
- Methods requiring extended variables
- Coupling CVs to extended degrees of freedom`,
        syntax: 'EXTENDED_LAGRANGIAN ARG=<cv> KAPPA=<kappa> [MASS=<mass>] [FRICTION=<friction>] [TEMP=<temp>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the collective variable to couple to the extended variable'
            },
            {
                keyword: 'KAPPA',
                required: true,
                description: 'the coupling constant between the CV and the extended variable. Larger values give stronger coupling.'
            },
            {
                keyword: 'MASS',
                required: false,
                default: '1.0',
                description: '( default=1.0 ) the mass of the extended variable'
            },
            {
                keyword: 'FRICTION',
                required: false,
                default: '0.0',
                description: '( default=0.0 ) the friction coefficient for the extended variable'
            },
            {
                keyword: 'TEMP',
                required: false,
                description: 'the temperature for the extended variable thermostat'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic extended Lagrangian',
                code: `# Extended Lagrangian
d: DISTANCE ATOMS=1,2
EXTENDED_LAGRANGIAN ARG=d KAPPA=10.0 MASS=1.0

# Extended variable is coupled to distance
PRINT ARG=d FILE=COLVAR STRIDE=10`
            },
            {
                title: 'Extended Lagrangian with friction',
                code: `# Extended Lagrangian with friction and temperature
d: DISTANCE ATOMS=1,2
EXTENDED_LAGRANGIAN ARG=d KAPPA=10.0 MASS=1.0 FRICTION=1.0 TEMP=300.0`
            }
        ],
        notes: [
            'EXTENDED_LAGRANGIAN adds an extended degree of freedom.',
            'The extended variable is coupled to the CV through a harmonic potential.',
            'MASS controls the inertia of the extended variable.',
            'FRICTION provides damping for the extended variable.',
            'This is typically used with eABF or other extended-system methods.'
        ],
        related: ['RESTRAINT']
    },
    
    'LOCALENSEMBLE': {
        name: 'LOCALENSEMBLE',
        category: 'Analysis',
        module: 'colvar',
        description: `This is part of the colvar module

Calculates the average over multiple arguments.

LOCALENSEMBLE computes a local ensemble average of the specified collective variables. Unlike ENSEMBLE which averages across replicas, LOCALENSEMBLE averages across multiple CVs within a single replica.

LOCALENSEMBLE is useful for:
- Averaging multiple related CVs
- Computing local ensemble properties
- Combining CV values
- Statistical analysis`,
        syntax: 'LOCALENSEMBLE ARG=<cv1>,<cv2>,...',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the list of collective variables to average'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Local ensemble average',
                code: `# Average multiple distances
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
d3: DISTANCE ATOMS=5,6
local: LOCALENSEMBLE ARG=d1,d2,d3

# Print local ensemble
PRINT ARG=local FILE=colvar STRIDE=10`
            }
        ],
        notes: [
            'LOCALENSEMBLE averages CVs within a single replica.',
            'Different from ENSEMBLE which averages across replicas.',
            'Useful for combining related CV values.',
            'All CVs in ARG must be defined before LOCALENSEMBLE.'
        ],
        related: ['ENSEMBLE', 'STATS', 'COMBINE']
    },
    
    'MAXENT': {
        name: 'MAXENT',
        category: 'Bias',
        module: 'bias',
        description: `This is part of the bias module

Add a linear biasing potential on one or more variables that satisfies a maximum entropy principle.

MAXENT applies a linear bias that maximizes the entropy of the CV distribution while satisfying constraints. The bias is:
V(s) = λ × s

where λ is a Lagrange multiplier that is updated to satisfy the maximum entropy condition.

MAXENT is useful for:
- Maximum entropy methods
- Enhancing sampling
- Satisfying constraints
- Optimizing CV distributions`,
        syntax: 'MAXENT ARG=<cv1>,<cv2>,... TEMP=<temp> [PACE=<pace>] [TAU=<tau>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the list of collective variables to bias'
            },
            {
                keyword: 'TEMP',
                required: true,
                description: 'the temperature of the system. This is used in the maximum entropy calculation.'
            },
            {
                keyword: 'PACE',
                required: false,
                default: '1',
                description: '( default=1 ) the frequency (in MD steps) at which to update the bias'
            },
            {
                keyword: 'TAU',
                required: false,
                description: 'a time constant for the bias update. Larger values give slower updates.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic maximum entropy bias',
                code: `# Maximum entropy bias
d: DISTANCE ATOMS=1,2
MAXENT ARG=d TEMP=300.0 PACE=100

# Linear bias that maximizes entropy
PRINT ARG=d FILE=COLVAR STRIDE=10`
            },
            {
                title: 'MAXENT with multiple CVs',
                code: `# Maximum entropy on multiple CVs
d: DISTANCE ATOMS=1,2
angle: ANGLE ATOMS=3,4,5
MAXENT ARG=d,angle TEMP=300.0 PACE=100`
            }
        ],
        notes: [
            'MAXENT applies a linear bias that maximizes entropy.',
            'The bias is updated periodically based on the CV distribution.',
            'TEMP is required for the maximum entropy calculation.',
            'PACE controls how often the bias is updated.',
            'This method is useful for enhancing sampling while maximizing entropy.'
        ],
        related: ['METAD', 'RESTRAINT']
    },
    
    'MATHEVAL': {
        name: 'MATHEVAL',
        category: 'Composite',
        module: 'colvar',
        description: `This is part of the colvar module

An alias to the CUSTOM function that can also be used to calculate combinations of variables using a custom expression.

MATHEVAL provides the same functionality as CUSTOM but with a more intuitive name for mathematical evaluations. It allows you to define arbitrary mathematical expressions involving other collective variables.

MATHEVAL is useful for:
- Creating complex CVs from simpler ones
- Defining custom reaction coordinates
- Applying mathematical transformations
- Combining multiple CVs with non-linear functions`,
        syntax: 'MATHEVAL ARG=<cv1>,<cv2>,... FUNC=<expression> [PERIODIC=<periodic>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the list of collective variables to use in the expression. These are referred to as x, y, z, ... in the FUNC expression.'
            },
            {
                keyword: 'FUNC',
                required: true,
                description: 'the mathematical expression to evaluate. Use x, y, z, ... to refer to the arguments in order. Example: "x*y+sin(x)" or "sqrt(x^2+y^2)"'
            },
            {
                keyword: 'PERIODIC',
                required: false,
                description: 'the periodicity of the resulting CV. Use NO for non-periodic, or specify the period (e.g., PERIODIC=-pi,pi for angles)'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Mathematical evaluation',
                code: `# Mathematical expression
d: DISTANCE ATOMS=1,2
math: MATHEVAL ARG=d FUNC="x^2+exp(-x)" PERIODIC=NO

# Multiple arguments
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
math2: MATHEVAL ARG=d1,d2 FUNC="sqrt(x^2+y^2)" PERIODIC=NO`
            }
        ],
        notes: [
            'MATHEVAL is an alias for CUSTOM with identical functionality.',
            'Variables in FUNC are x, y, z, ... corresponding to ARG order.',
            'Standard mathematical functions are available.',
            'Use PERIODIC to specify periodicity for periodic CVs.'
        ],
        related: ['CUSTOM', 'COMBINE', 'PIECEWISE']
    },
    
    'WHAM_HISTOGRAM': {
        name: 'WHAM_HISTOGRAM',
        category: 'Analysis',
        module: 'analysis',
        description: `This is part of the analysis module

This can be used to output a histogram using the weighted histogram technique.

This shortcut action allows you to calculate a histogram using the weighted histogram analysis technique. For more detail on how the weights for configurations are computed see REWEIGHT_WHAM.

WHAM (Weighted Histogram Analysis Method) is a technique used to combine data from multiple simulations (e.g., umbrella sampling) to reconstruct the free energy surface. The method assigns weights to each configuration based on the bias potential applied in each simulation.

WHAM_HISTOGRAM is useful for:
- Analyzing umbrella sampling simulations
- Reconstructing free energy surfaces
- Combining data from multiple biased simulations
- Calculating probability distributions from biased data`,
        syntax: 'WHAM_HISTOGRAM ARG=<cv> BIAS=<bias> TEMP=<temp> GRID_MIN=<min> GRID_MAX=<max> GRID_BIN=<bins> [STRIDE=<stride>] [BANDWIDTH=<bandwidth>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the arguments that you would like to make the histogram for'
            },
            {
                keyword: 'BIAS',
                required: true,
                description: 'the value of the biases to use when performing WHAM'
            },
            {
                keyword: 'TEMP',
                required: true,
                description: 'the temperature at which the simulation was run'
            },
            {
                keyword: 'GRID_MIN',
                required: true,
                description: 'the minimum to use for the grid'
            },
            {
                keyword: 'GRID_MAX',
                required: true,
                description: 'the maximum to use for the grid'
            },
            {
                keyword: 'GRID_BIN',
                required: true,
                description: 'the number of bins to use for the grid'
            },
            {
                keyword: 'STRIDE',
                required: false,
                default: '1',
                description: '( default=1 ) the frequency with which the data should be stored to perform WHAM'
            },
            {
                keyword: 'BANDWIDTH',
                required: false,
                description: 'the bandwidth for kernel density estimation'
            }
        ],
        components: [],
        examples: [
            {
                title: 'WHAM histogram from umbrella sampling',
                code: `# Analyze umbrella sampling simulations
phi: TORSION ATOMS=5,7,9,15
rp: RESTRAINT ARG=phi KAPPA=50.0 AT=@replicas
hh: WHAM_HISTOGRAM ARG=phi BIAS=rp.bias TEMP=300 GRID_MIN=-pi GRID_MAX=pi GRID_BIN=50
fes: CONVERT_TO_FES GRID=hh TEMP=300
DUMPGRID GRID=fes FILE=fes.dat`
            }
        ],
        notes: [
            'WHAM_HISTOGRAM requires data from multiple replicas or simulations with different bias potentials.',
            'The trajectory from each simulation should be concatenated into a single trajectory before analysis.',
            'The method automatically calculates weights for each configuration based on the bias potentials.',
            'The resulting histogram can be converted to a free energy surface using CONVERT_TO_FES.',
            'For periodic CVs (like torsions), use GRID_MIN=-pi and GRID_MAX=pi.'
        ],
        related: ['REWEIGHT_WHAM', 'HISTOGRAM', 'CONVERT_TO_FES']
    },
    
    'ADAPTIVE_PATH': {
        name: 'ADAPTIVE_PATH',
        category: 'Path',
        module: 'colvar',
        description: `This is part of the colvar module

Compute path collective variables that adapt to the lowest free energy path connecting states A and B.

This CV defines a path that adapts to the lowest free energy path between two states. Unlike fixed paths, the adaptive path evolves during the simulation to follow the minimum free energy pathway.

ADAPTIVE_PATH is useful for:
- Finding minimum free energy paths
- Adaptive path sampling
- Transition state identification
- Reaction pathway discovery`,
        syntax: 'ADAPTIVE_PATH REFERENCE=<file> LAMBDA=<lambda> [TYPE=<type>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference path file defining states A and B'
            },
            {
                keyword: 'LAMBDA',
                required: true,
                description: 'the progress variable along the path (0 to 1)'
            },
            {
                keyword: 'TYPE',
                required: false,
                default: 'OPTIMAL',
                description: '( default=OPTIMAL ) the type of path calculation'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [
            {
                name: 's',
                description: 'Progress along the adaptive path'
            },
            {
                name: 'z',
                description: 'Distance from the adaptive path'
            }
        ],
        examples: [
            {
                title: 'Adaptive path CV',
                code: `# Adaptive path
path: ADAPTIVE_PATH REFERENCE=path.pdb LAMBDA=0.5`
            }
        ],
        notes: [
            'ADAPTIVE_PATH adapts to the minimum free energy path.',
            'The path evolves during the simulation.',
            'Useful for finding optimal reaction pathways.',
            'Different from fixed path methods.'
        ],
        related: ['PATH', 'PATHMSD', 'RMSD']
    },
    
    'ALPHARMSD': {
        name: 'ALPHARMSD',
        category: 'Secondary Structure',
        module: 'colvar',
        description: `This is part of the colvar module

Probe the alpha helical content of a protein structure.

This CV measures how well the structure matches an ideal alpha helix. It calculates the RMSD between the current structure and an ideal alpha helix conformation.

ALPHARMSD is useful for:
- Measuring alpha helix content
- Analyzing helical structure
- Protein structure analysis
- Secondary structure characterization`,
        syntax: 'ALPHARMSD ATOMS=<group> [TYPE=<type>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms involved in the alpha helix'
            },
            {
                keyword: 'TYPE',
                required: false,
                default: 'DRMSD',
                description: '( default=DRMSD ) the manner in which RMSD alignment is performed. Should be OPTIMAL, SIMPLE or DRMSD.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Alpha helix RMSD',
                code: `# Alpha helix RMSD
alpha: ALPHARMSD ATOMS=1-50`
            }
        ],
        notes: [
            'ALPHARMSD measures alpha helix content.',
            'Compares structure to ideal alpha helix.',
            'Useful for protein structure analysis.',
            'Can be used to monitor helix formation.'
        ],
        related: ['ANTIBETARMSD', 'PARABETARMSD', 'RMSD']
    },
    
    'ANTIBETARMSD': {
        name: 'ANTIBETARMSD',
        category: 'Secondary Structure',
        module: 'colvar',
        description: `This is part of the colvar module

Probe the antiparallel beta sheet content of your protein structure.

This CV measures how well the structure matches an ideal antiparallel beta sheet. It calculates the RMSD between the current structure and an ideal antiparallel beta sheet conformation.

ANTIBETARMSD is useful for:
- Measuring antiparallel beta sheet content
- Analyzing beta sheet structure
- Protein structure analysis
- Secondary structure characterization`,
        syntax: 'ANTIBETARMSD ATOMS=<group> [TYPE=<type>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms involved in the beta sheet'
            },
            {
                keyword: 'TYPE',
                required: false,
                default: 'DRMSD',
                description: '( default=DRMSD ) the manner in which RMSD alignment is performed. Should be OPTIMAL, SIMPLE or DRMSD.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Antiparallel beta sheet RMSD',
                code: `# Antiparallel beta sheet RMSD
beta: ANTIBETARMSD ATOMS=1-100`
            }
        ],
        notes: [
            'ANTIBETARMSD measures antiparallel beta sheet content.',
            'Different from PARABETARMSD (parallel).',
            'Useful for protein structure analysis.',
            'Can be used to monitor beta sheet formation.'
        ],
        related: ['PARABETARMSD', 'ALPHARMSD', 'RMSD']
    },
    
    'CELL': {
        name: 'CELL',
        category: 'System',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the components of the simulation cell.

This CV provides access to the simulation box vectors and cell parameters. It can output the components of the cell matrix (ax, ay, az, bx, by, bz, cx, cy, cz).

CELL is useful for:
- Accessing box dimensions
- Monitoring cell parameters
- Volume calculations
- System size analysis`,
        syntax: 'CELL [COMPONENTS]',
        options: [
            {
                keyword: 'COMPONENTS',
                required: false,
                description: 'output the individual components of the cell matrix'
            }
        ],
        components: [
            {
                name: 'ax',
                description: 'The x-component of the first box vector (only available when COMPONENTS is used)'
            },
            {
                name: 'ay',
                description: 'The y-component of the first box vector'
            },
            {
                name: 'az',
                description: 'The z-component of the first box vector'
            },
            {
                name: 'bx',
                description: 'The x-component of the second box vector'
            },
            {
                name: 'by',
                description: 'The y-component of the second box vector'
            },
            {
                name: 'bz',
                description: 'The z-component of the second box vector'
            },
            {
                name: 'cx',
                description: 'The x-component of the third box vector'
            },
            {
                name: 'cy',
                description: 'The y-component of the third box vector'
            },
            {
                name: 'cz',
                description: 'The z-component of the third box vector'
            }
        ],
        examples: [
            {
                title: 'Cell components',
                code: `# Cell components
cell: CELL COMPONENTS`
            }
        ],
        notes: [
            'CELL provides access to simulation box parameters.',
            'Components are available when COMPONENTS is specified.',
            'Useful for monitoring box dimensions.',
            'Can be used with VOLUME for volume calculations.'
        ],
        related: ['VOLUME', 'POSITION']
    },
    
    'CONSTANT': {
        name: 'CONSTANT',
        category: 'Utility',
        module: 'colvar',
        description: `This is part of the colvar module

Return one or more constant quantities with or without derivatives.

This CV returns constant values that can be used in PLUMED input files. It is useful for creating constant parameters or placeholders in CV definitions.

CONSTANT is useful for:
- Defining constant values
- Creating placeholders
- Parameter definitions
- Testing and debugging`,
        syntax: 'CONSTANT VALUE=<value>',
        options: [
            {
                keyword: 'VALUE',
                required: true,
                description: 'the constant value to return'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Constant value',
                code: `# Constant value
const: CONSTANT VALUE=1.0`
            }
        ],
        notes: [
            'CONSTANT returns a fixed value.',
            'Useful for defining parameters.',
            'Can be used in mathematical expressions.',
            'Helpful for testing and debugging.'
        ],
        related: ['COMBINE', 'EXTRACV']
    },
    
    'CONTACTMAP': {
        name: 'CONTACTMAP',
        category: 'Structural',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the distances between a number of pairs of atoms and transform each distance by a switching function.

This CV creates a contact map representation of the structure. It calculates distances between pairs of atoms and applies a switching function to create a smooth contact map.

CONTACTMAP is useful for:
- Creating contact maps
- Structural analysis
- Protein folding studies
- Conformational analysis`,
        syntax: 'CONTACTMAP ATOMS1=<pair1> ATOMS2=<pair2> ... SWITCH=<switching_function> [REFERENCE=<ref>] [WEIGHT=<weight>]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms involved in each of the contacts you wish to calculate. Keywords like ATOMS1, ATOMS2, ATOMS3,... should be listed and one contact will be calculated for each ATOM keyword you specify. You can use multiple instances of this keyword i.e. ATOMS1, ATOMS2, ATOMS3...'
            },
            {
                keyword: 'SWITCH',
                required: true,
                description: 'The switching functions to use for each of the contacts in your map. You can either specify a global switching function using SWITCH or one switching function for each contact. Details of the various switching functions you can use are provided on switchingfunction. You can use multiple instances of this keyword i.e. SWITCH1, SWITCH2, SWITCH3...'
            },
            {
                keyword: 'REFERENCE',
                required: false,
                default: '0.0',
                description: 'A reference value for a given contact, by default is 0.0. You can either specify a global reference value using REFERENCE or one reference value for each contact. You can use multiple instances of this keyword i.e. REFERENCE1, REFERENCE2, REFERENCE3...'
            },
            {
                keyword: 'WEIGHT',
                required: false,
                default: '1.0',
                description: 'A weight value for a given contact, by default is 1.0. You can use multiple instances of this keyword i.e. WEIGHT1, WEIGHT2, WEIGHT3...'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Contact map',
                code: `# Contact map
cmap: CONTACTMAP ATOMS=1-100 SWITCH={RATIONAL R_0=5.0 D_0=1.0}`
            }
        ],
        notes: [
            'CONTACTMAP creates a smooth contact map.',
            'Uses a switching function for smoothness.',
            'Useful for structural analysis.',
            'Can be used in enhanced sampling.'
        ],
        related: ['COORDINATION', 'DISTANCE']
    },
    
    'DHENERGY': {
        name: 'DHENERGY',
        category: 'Energy',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate Debye-Huckel interaction energy among GROUPA and GROUPB.

This collective variable computes the electrostatic interaction energy using the Debye-Huckel model, which is a simplified model for electrostatic interactions in solution. The Debye-Huckel model accounts for screening effects in ionic solutions.

The Debye-Huckel energy is calculated as:
E_DH = (q₁ × q₂ × e²) / (4π × ε × r) × exp(-κ × r)

where:
- q₁, q₂ are the charges
- e is the elementary charge
- ε is the dielectric constant
- r is the distance
- κ is the Debye screening parameter

DHENERGY is useful for:
- Modeling electrostatic interactions in ionic solutions
- Studying charge-charge interactions
- Accounting for screening effects
- Simplified electrostatic energy calculations`,
        syntax: 'DHENERGY GROUPA=<group1> GROUPB=<group2> [EPSILON=<eps>] [KAPPA=<kappa>] [SCALE=<scale>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'the first group of atoms'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'the second group of atoms'
            },
            {
                keyword: 'EPSILON',
                required: false,
                default: '80.0',
                description: '( default=80.0 ) the dielectric constant'
            },
            {
                keyword: 'KAPPA',
                required: false,
                default: '0.0',
                description: '( default=0.0 ) the Debye screening parameter'
            },
            {
                keyword: 'SCALE',
                required: false,
                default: '1.0',
                description: '( default=1.0 ) scaling factor for the energy'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic Debye-Huckel energy',
                code: `# Debye-Huckel energy between two groups
dh: DHENERGY GROUPA=1-50 GROUPB=51-100 EPSILON=80.0 KAPPA=0.1`
            }
        ],
        notes: [
            'The Debye-Huckel model is a simplified model for electrostatic interactions.',
            'It accounts for screening effects in ionic solutions.',
            'The screening parameter κ depends on the ionic strength.',
            'For pure water, κ is typically very small or zero.'
        ],
        related: ['ENERGY', 'DIMER']
    },
    
    'DIHCOR': {
        name: 'DIHCOR',
        category: 'Analysis',
        module: 'colvar',
        description: `This is part of the colvar module

Measures the degree of similarity between dihedral angles.

This collective variable calculates the correlation between sets of dihedral angles. It measures how similar the dihedral angle patterns are between the current structure and a reference structure.

DIHCOR is useful for:
- Comparing dihedral angle distributions
- Measuring structural similarity
- Analyzing conformational changes
- Identifying similar conformations`,
        syntax: 'DIHCOR ATOMS1=<8atoms> ATOMS2=<8atoms> ... [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms involved in each of the dihedral correlation values you wish to calculate. Keywords like ATOMS1, ATOMS2, ATOMS3,... should be listed and one dihedral correlation will be calculated for each ATOM keyword you specify (all ATOM keywords should specify the indices of 8 atoms). You can use multiple instances of this keyword i.e. ATOMS1, ATOMS2, ATOMS3...'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Dihedral correlation',
                code: `# Dihedral correlation between two sets of 8 atoms
dihcor: DIHCOR ATOMS1=1,2,3,4,5,6,7,8 ATOMS2=9,10,11,12,13,14,15,16`
            }
        ],
        notes: [
            'DIHCOR measures the similarity of dihedral angle patterns.',
            'The correlation value ranges from -1 to 1.',
            'Higher values indicate greater similarity.',
            'Useful for comparing protein conformations.'
        ],
        related: ['TORSION', 'RMSD']
    },
    
    'DIMER': {
        name: 'DIMER',
        category: 'Energy',
        module: 'colvar',
        description: `This is part of the colvar module

This CV computes the dimer interaction energy for a collection of dimers.

The dimer interaction energy is the energy of interaction between pairs of molecules (dimers). This CV calculates the total interaction energy for all dimers in the system.

DIMER is useful for:
- Studying molecular interactions
- Calculating binding energies
- Analyzing dimer stability
- Modeling molecular complexes`,
        syntax: 'DIMER ATOMS=<group> [SWITCH=<switch>] [CUTOFF=<cutoff>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms involved in the dimers'
            },
            {
                keyword: 'SWITCH',
                required: false,
                description: 'a switching function to smoothly turn off interactions at long distances'
            },
            {
                keyword: 'CUTOFF',
                required: false,
                description: 'the cutoff distance for interactions'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Dimer interaction energy',
                code: `# Dimer interaction energy
dimer: DIMER ATOMS=1-200`
            }
        ],
        notes: [
            'DIMER calculates the interaction energy between molecular pairs.',
            'The energy includes all relevant interaction terms.',
            'Useful for studying molecular binding.',
            'Can be used in biased simulations.'
        ],
        related: ['ENERGY', 'DHENERGY']
    },
    
    'DIPOLE': {
        name: 'DIPOLE',
        category: 'Electric',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the dipole moment for a group of atoms.

The dipole moment is a measure of the separation of positive and negative charges in a molecule. It is calculated as:
μ = Σᵢ qᵢ × rᵢ

where qᵢ is the charge of atom i and rᵢ is its position vector.

DIPOLE is useful for:
- Characterizing molecular polarity
- Studying electric field effects
- Analyzing charge distributions
- Modeling polar molecules`,
        syntax: 'DIPOLE GROUP=<group> [COMPONENTS] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUP',
                required: true,
                description: 'the group of atoms we are calculating the dipole moment for. For more information on how to specify lists of atoms see Groups and Virtual Atoms.'
            },
            {
                keyword: 'COMPONENTS',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the x, y and z components of the dipole separately and store them as label.x, label.y and label.z.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [
            {
                name: 'x',
                description: 'The x-component of the dipole moment vector (only available when COMPONENTS is used)'
            },
            {
                name: 'y',
                description: 'The y-component of the dipole moment vector (only available when COMPONENTS is used)'
            },
            {
                name: 'z',
                description: 'The z-component of the dipole moment vector (only available when COMPONENTS is used)'
            },
            {
                name: 'norm',
                description: 'The magnitude of the dipole moment vector'
            }
        ],
        examples: [
            {
                title: 'Basic dipole moment',
                code: `# Dipole moment
dipole: DIPOLE GROUP=1-100`
            },
            {
                title: 'Dipole components',
                code: `# Dipole with components
dipole: DIPOLE GROUP=1-100 COMPONENTS`
            }
        ],
        notes: [
            'The dipole moment is a vector quantity.',
            'The magnitude is always calculated.',
            'Components are available when COMPONENTS is specified.',
            'Useful for polar molecules and electric field studies.'
        ],
        related: ['POSITION', 'ENERGY']
    },
    
    'DISTANCE_FROM_CONTOUR': {
        name: 'DISTANCE_FROM_CONTOUR',
        category: 'Geometric',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the perpendicular distance from a Willard-Chandler dividing surface.

This collective variable calculates the distance from atoms to a molecular surface defined using the Willard-Chandler method. The Willard-Chandler surface is a smooth, continuous surface that divides space into regions inside and outside a molecule.

DISTANCE_FROM_CONTOUR is useful for:
- Measuring distances to molecular surfaces
- Studying solvation
- Analyzing surface accessibility
- Modeling interfaces`,
        syntax: 'DISTANCE_FROM_CONTOUR ATOMS=<group> CONTOUR=<value> [SIGMA=<sigma>]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to calculate the distance'
            },
            {
                keyword: 'CONTOUR',
                required: true,
                description: 'the contour value that defines the surface'
            },
            {
                keyword: 'SIGMA',
                required: false,
                default: '0.2',
                description: '( default=0.2 ) the width parameter for the surface definition'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Distance from contour',
                code: `# Distance from Willard-Chandler surface
dist_contour: DISTANCE_FROM_CONTOUR ATOMS=1-100 CONTOUR=0.5 SIGMA=0.2`
            }
        ],
        notes: [
            'The Willard-Chandler surface is a smooth molecular surface.',
            'The contour value defines the surface location.',
            'Useful for studying solvation and interfaces.',
            'The distance is measured perpendicular to the surface.'
        ],
        related: ['DISTANCE', 'COORDINATION']
    },
    
    'EEFSOLV': {
        name: 'EEFSOLV',
        category: 'Energy',
        module: 'colvar',
        description: `This is part of the colvar module

Calculates EEF1 solvation free energy for a group of atoms.

EEF1 (Effective Energy Function 1) is an implicit solvent model that calculates the solvation free energy based on atomic parameters. The solvation energy is calculated as a sum over atoms, where each atom contributes based on its type and environment.

EEFSOLV is useful for:
- Calculating solvation energies
- Implicit solvent modeling
- Free energy calculations
- Protein folding studies`,
        syntax: 'EEFSOLV ATOMS=<group> [PARAMETERS=<file>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to calculate the solvation energy'
            },
            {
                keyword: 'PARAMETERS',
                required: false,
                description: 'the parameter file for EEF1 (uses default if not specified)'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'EEF1 solvation energy',
                code: `# EEF1 solvation free energy
eef: EEFSOLV ATOMS=1-100`
            }
        ],
        notes: [
            'EEF1 is an implicit solvent model.',
            'The solvation energy is calculated atom-by-atom.',
            'Parameters depend on atom types.',
            'Useful for fast solvation energy estimates.'
        ],
        related: ['ENERGY', 'DHENERGY']
    },
    
    'ERMSD': {
        name: 'ERMSD',
        category: 'Structural',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate eRMSD with respect to a reference structure.

eRMSD (ensemble RMSD) is a measure of structural similarity that compares an ensemble of structures to a reference. Unlike standard RMSD, eRMSD accounts for the variability within an ensemble.

ERMSD is useful for:
- Comparing structural ensembles
- Measuring ensemble similarity
- Analyzing conformational variability
- Studying structural diversity`,
        syntax: 'ERMSD REFERENCE=<file> ATOMS=<@lcs-list> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'a file in pdb format containing the reference structure and the atoms involved in the CV.'
            },
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the list of atoms (use lcs). For more information on how to specify lists of atoms see Groups and Virtual Atoms.'
            },
            {
                keyword: 'ATOMS',
                required: false,
                description: 'specific atoms to use for the calculation (uses all atoms if not specified)'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Ensemble RMSD',
                code: `# Ensemble RMSD
ermsd: ERMSD REFERENCE=ensemble.pdb TYPE=OPTIMAL`
            }
        ],
        notes: [
            'eRMSD accounts for ensemble variability.',
            'Useful for comparing structural ensembles.',
            'Can be used with specific atom selections.',
            'Different from standard RMSD.'
        ],
        related: ['RMSD', 'DRMSD']
    },
    
    'EXTRACV': {
        name: 'EXTRACV',
        category: 'Utility',
        module: 'colvar',
        description: `This is part of the colvar module

Allow PLUMED to use collective variables computed in the MD engine.

This collective variable allows you to use CVs that are computed directly in the MD engine (e.g., GROMACS, AMBER, NAMD) within PLUMED. This is useful when the MD code has built-in CVs that you want to use in PLUMED actions.

EXTRACV is useful for:
- Using MD engine CVs in PLUMED
- Integrating external CVs
- Combining MD and PLUMED CVs
- Leveraging MD-specific features`,
        syntax: 'EXTRACV NAME=<name> [PERIODIC=<periodic>]',
        options: [
            {
                keyword: 'NAME',
                required: true,
                description: 'the name of the CV as it appears in the MD engine'
            },
            {
                keyword: 'PERIODIC',
                required: false,
                description: 'the periodicity of the CV (e.g., PERIODIC=-pi,pi for torsions)'
            }
        ],
        components: [],
        examples: [
            {
                title: 'External CV from MD engine',
                code: `# Use CV computed in MD engine
extcv: EXTRACV NAME=external_cv`
            }
        ],
        notes: [
            'EXTRACV allows using CVs from the MD engine.',
            'The CV must be computed and available in the MD code.',
            'Useful for integrating MD-specific features.',
            'Check MD engine documentation for available CVs.'
        ],
        related: ['CONSTANT']
    },
    
    'FUNCSUMHILLS': {
        name: 'FUNCSUMHILLS',
        category: 'Analysis',
        module: 'function',
        description: `This is part of the function module

This function is intended to be called by the command line tool sum_hills.

FUNCSUMHILLS integrates a HILLS file or an HILLS file interpreted as a histogram in a variety of ways. It is designed for post-processing metadynamics simulations, not for use during dynamics.

**WARNING**: It is not expected that you use this during your dynamics (it will crash!). This function is meant to be used with the sum_hills command-line tool for analyzing HILLS files after the simulation.

FUNCSUMHILLS is useful for:
- Post-processing metadynamics HILLS files
- Reconstructing free energy surfaces
- Analyzing bias potential
- Converting HILLS to free energy`,
        syntax: 'FUNCSUMHILLS FILE=<file> [GRID=<grid>] [TEMP=<temp>]',
        options: [
            {
                keyword: 'FILE',
                required: true,
                description: 'the HILLS file to process'
            },
            {
                keyword: 'GRID',
                required: false,
                description: 'the grid specification for the free energy surface'
            },
            {
                keyword: 'TEMP',
                required: false,
                description: 'the temperature for free energy reconstruction (required for well-tempered metadynamics)'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Sum hills (command line usage)',
                code: `# This is typically used with sum_hills command-line tool
# Example command: sum_hills --hills HILLS --outfile fes.dat

# Not for use in MD simulation input file!`
            }
        ],
        notes: [
            'FUNCSUMHILLS is for post-processing, not MD simulations.',
            'Use the sum_hills command-line tool to process HILLS files.',
            'Do not include FUNCSUMHILLS in your MD simulation input.',
            'This function is designed for analyzing completed simulations.'
        ],
        related: ['METAD', 'PBMETAD']
    },
    
    'FUNCPATHMSD': {
        name: 'FUNCPATHMSD',
        category: 'Path',
        module: 'function',
        description: `This is part of the function module

This function calculates path collective variables.

FUNCPATHMSD measures progress along a path defined by reference structures using MSD-based metrics. It calculates path collective variables (PCVs) that describe the position along the path and distance from the path.

FUNCPATHMSD is useful for:
- Path sampling simulations
- Reaction coordinate definition
- Transition path analysis
- Free energy calculations along paths`,
        syntax: 'FUNCPATHMSD ARG=<cv1>,<cv2>,... LAMBDA=<lambda>',
        options: [
            {
                keyword: 'ARG',
                required: false,
                description: 'the input for this action is the scalar output from one or more other actions. The particular scalars that you will use are referenced using the label of the action.'
            },
            {
                keyword: 'LAMBDA',
                required: true,
                description: 'the lambda parameter is needed for smoothing, is in the units of plumed'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [
            {
                name: 's',
                description: 'Progress along the path (0 to 1)'
            },
            {
                name: 'z',
                description: 'Distance from the path'
            }
        ],
        examples: [
            {
                title: 'Path MSD function',
                code: `# Path MSD using RMSD CVs
t1: RMSD REFERENCE=frame1.pdb TYPE=OPTIMAL
t2: RMSD REFERENCE=frame2.pdb TYPE=OPTIMAL
t3: RMSD REFERENCE=frame3.pdb TYPE=OPTIMAL
p1: FUNCPATHMSD ARG=t1,t2,t3 LAMBDA=50.0

# Print path CVs
PRINT ARG=p1.s,p1.z FILE=colvar STRIDE=10`
            }
        ],
        notes: [
            'FUNCPATHMSD calculates path collective variables using MSD.',
            'Returns two components: s (progress) and z (distance).',
            'Useful for path sampling simulations.',
            'The path is defined by reference structures.'
        ],
        related: ['FUNCPATHGENERAL', 'PATHMSD', 'PATH']
    },
    
    'FUNCPATHGENERAL': {
        name: 'FUNCPATHGENERAL',
        category: 'Path',
        module: 'function',
        description: `This is part of the function module

This function calculates path collective variables (PCVs) using an arbitrary combination of collective variables.

FUNCPATHGENERAL provides a flexible framework for defining paths in CV space. Unlike FUNCPATHMSD which uses MSD-based metrics, FUNCPATHGENERAL allows you to specify arbitrary CVs for measuring progress along the path.

FUNCPATHGENERAL is useful for:
- Flexible path CVs
- Custom CV combinations for paths
- Advanced path sampling
- Flexible reaction coordinate definitions`,
        syntax: 'FUNCPATHGENERAL REFERENCE=<file> LAMBDA=<lambda> CVS=<cvs> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference path file defining the path'
            },
            {
                keyword: 'LAMBDA',
                required: true,
                description: 'the progress variable along the path'
            },
            {
                keyword: 'CVS',
                required: true,
                description: 'the collective variables to use for the path. Multiple CVs should be specified as comma-separated labels, e.g., CVS=distance,angle'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'General path CV',
                code: `# General path CV with custom CVs
d: DISTANCE ATOMS=1,2
angle: ANGLE ATOMS=3,4,5
funcpath: FUNCPATHGENERAL REFERENCE=path.pdb LAMBDA=0.5 CVS=d,angle`
            }
        ],
        notes: [
            'FUNCPATHGENERAL allows arbitrary CV combinations for paths.',
            'More flexible than FUNCPATHMSD.',
            'Useful for advanced path sampling methods.',
            'The CVS keyword specifies which CVs to use for the path.'
        ],
        related: ['FUNCPATHMSD', 'PATH', 'ADAPTIVE_PATH']
    },
    
    'GHBFIX': {
        name: 'GHBFIX',
        category: 'Energy',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the GHBFIX interaction energy among GROUPA and GROUPB using a potential defined in Kührová et al.

This CV computes the GHBFIX interaction energy, which is a switching function-based potential used to improve RNA force field performance. The potential is -1 for small distances and 0 for large distances with smooth interpolation in between.

GHBFIX is useful for:
- Improving RNA force field accuracy
- Modeling hydrogen-bonding interactions
- RNA structure refinement
- Force field development`,
        syntax: 'GHBFIX GROUPA=<group1> GROUPB=<group2> [SCALE=<scale>] [UNITS=<units>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'the first group of atoms'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'the second group of atoms'
            },
            {
                keyword: 'SCALE',
                required: false,
                default: '1.0',
                description: '( default=1.0 ) scaling factor for the interaction'
            },
            {
                keyword: 'UNITS',
                required: false,
                default: 'kcal/mol',
                description: '( default=kcal/mol ) energy units'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'GHBFIX energy',
                code: `# GHBFIX interaction energy
ghb: GHBFIX GROUPA=1-50 GROUPB=51-100 SCALE=1.0`
            }
        ],
        notes: [
            'GHBFIX is designed for RNA force field improvements.',
            'The potential uses a switching function.',
            'Based on work by Kührová et al.',
            'Useful for RNA structure modeling.'
        ],
        related: ['HBOND', 'ENERGY']
    },
    
    'GPROPERTYMAP': {
        name: 'GPROPERTYMAP',
        category: 'Analysis',
        module: 'colvar',
        description: `This is part of the colvar module

Property maps but with a more flexible framework for the distance metric being used.

This CV creates property maps with customizable distance metrics. Unlike PROPERTYMAP, GPROPERTYMAP allows you to specify different distance metrics for comparing molecular properties.

GPROPERTYMAP is useful for:
- Creating flexible property maps
- Custom distance metrics
- Advanced property comparisons
- Flexible molecular similarity measures`,
        syntax: 'GPROPERTYMAP PROPERTY=<property> REFERENCE=<file> [METRIC=<metric>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'PROPERTY',
                required: true,
                description: 'the property to map'
            },
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference structure file'
            },
            {
                keyword: 'METRIC',
                required: false,
                default: 'EUCLIDEAN',
                description: '( default=EUCLIDEAN ) the distance metric to use'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Generalized property map',
                code: `# Generalized property map
gpmap: GPROPERTYMAP PROPERTY=1 REFERENCE=ref.pdb METRIC=EUCLIDEAN`
            }
        ],
        notes: [
            'GPROPERTYMAP offers more flexibility than PROPERTYMAP.',
            'Allows custom distance metrics.',
            'Useful for advanced property comparisons.',
            'Can use different metrics for different properties.'
        ],
        related: ['PROPERTYMAP', 'RMSD']
    },
    
    'PARABETARMSD': {
        name: 'PARABETARMSD',
        category: 'Secondary Structure',
        module: 'colvar',
        description: `This is part of the colvar module

Probe the parallel beta sheet content of your protein structure.

This CV measures how well the structure matches an ideal parallel beta sheet. It calculates the RMSD between the current structure and an ideal parallel beta sheet conformation.

PARABETARMSD is useful for:
- Measuring parallel beta sheet content
- Analyzing beta sheet structure
- Protein structure analysis
- Secondary structure characterization`,
        syntax: 'PARABETARMSD ATOMS=<group> [TYPE=<type>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms involved in the beta sheet'
            },
            {
                keyword: 'TYPE',
                required: false,
                default: 'DRMSD',
                description: '( default=DRMSD ) the manner in which RMSD alignment is performed. Should be OPTIMAL, SIMPLE or DRMSD.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Parallel beta sheet RMSD',
                code: `# Parallel beta sheet RMSD
parabeta: PARABETARMSD ATOMS=1-100`
            }
        ],
        notes: [
            'PARABETARMSD measures parallel beta sheet content.',
            'Different from ANTIBETARMSD (antiparallel).',
            'Useful for protein structure analysis.',
            'Can be used to monitor beta sheet formation.'
        ],
        related: ['ANTIBETARMSD', 'ALPHARMSD', 'RMSD']
    },
    
    'PATH': {
        name: 'PATH',
        category: 'Path',
        module: 'colvar',
        description: `This is part of the colvar module

Path collective variables with a more flexible framework for the distance metric being used.

This CV defines path collective variables with customizable distance metrics. Unlike PATHMSD, PATH allows you to specify different distance metrics for measuring progress along the path.

PATH is useful for:
- Flexible path CVs
- Custom distance metrics
- Advanced path sampling
- Flexible reaction coordinate definitions`,
        syntax: 'PATH REFERENCE=<file> LAMBDA=<lambda> [METRIC=<metric>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference path file'
            },
            {
                keyword: 'LAMBDA',
                required: true,
                description: 'the progress variable along the path (0 to 1)'
            },
            {
                keyword: 'METRIC',
                required: false,
                default: 'EUCLIDEAN',
                description: '( default=EUCLIDEAN ) the distance metric to use'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Path CV with custom metric',
                code: `# Path CV
path: PATH REFERENCE=path.pdb LAMBDA=0.5 METRIC=EUCLIDEAN`
            }
        ],
        notes: [
            'PATH offers more flexibility than PATHMSD.',
            'Allows custom distance metrics.',
            'Useful for advanced path sampling.',
            'Can use different metrics for different paths.'
        ],
        related: ['PATHMSD', 'ADAPTIVE_PATH', 'RMSD']
    },
    
    'PATHMSD': {
        name: 'PATHMSD',
        category: 'Path',
        module: 'colvar',
        description: `This is part of the colvar module

This Colvar calculates path collective variables.

PATHMSD measures progress along a path defined by reference structures. It calculates two CVs: s (progress along the path) and z (distance from the path).

PATHMSD is useful for:
- Path sampling simulations
- Reaction coordinate definition
- Transition path analysis
- Free energy calculations along paths`,
        syntax: 'PATHMSD REFERENCE=<file> LAMBDA=<lambda> [TYPE=<type>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference path file containing multiple structures'
            },
            {
                keyword: 'LAMBDA',
                required: true,
                description: 'the progress variable along the path'
            },
            {
                keyword: 'TYPE',
                required: false,
                default: 'OPTIMAL',
                description: '( default=OPTIMAL ) the type of alignment to perform'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [
            {
                name: 's',
                description: 'Progress along the path (0 to 1)'
            },
            {
                name: 'z',
                description: 'Distance from the path'
            }
        ],
        examples: [
            {
                title: 'Path MSD',
                code: `# Path MSD
pathmsd: PATHMSD REFERENCE=path.pdb LAMBDA=0.5`
            }
        ],
        notes: [
            'PATHMSD calculates two CVs: s (progress) and z (distance).',
            'Useful for path sampling simulations.',
            'The path is defined by reference structures.',
            'Can be used in metadynamics or other enhanced sampling methods.'
        ],
        related: ['PATH', 'ADAPTIVE_PATH', 'RMSD']
    },
    
    'PCAVARS': {
        name: 'PCAVARS',
        category: 'Analysis',
        module: 'colvar',
        description: `This is part of the colvar module

Projection on principal component eigenvectors or other high dimensional linear subspace.

This CV projects atomic coordinates onto principal component eigenvectors or other linear subspaces. Unlike PCA, PCAVARS focuses on the projection variables themselves.

PCAVARS is useful for:
- PCA-based analysis
- Dimensionality reduction
- Conformational analysis
- Large-scale motions`,
        syntax: 'PCAVARS REFERENCE=<file> VECTORS=<file> [NCOMPONENTS=<n>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference structure file'
            },
            {
                keyword: 'VECTORS',
                required: true,
                description: 'the file containing the eigenvectors'
            },
            {
                keyword: 'NCOMPONENTS',
                required: false,
                description: 'the number of components to use (uses all if not specified)'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'PCA variables',
                code: `# PCA variables
pcavars: PCAVARS REFERENCE=traj.pdb VECTORS=eigenvecs.dat NCOMPONENTS=10`
            }
        ],
        notes: [
            'PCAVARS projects coordinates onto PCA eigenvectors.',
            'Different from PCA action.',
            'Useful for analyzing large-scale motions.',
            'Can be used as CVs in enhanced sampling.'
        ],
        related: ['PCA', 'RMSD']
    },
    
    'POSITION': {
        name: 'POSITION',
        category: 'Geometric',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the components of the position of an atom.

This CV provides access to the x, y, z coordinates of atoms. It can be used to track atomic positions or use position components in other CVs.

POSITION is useful for:
- Tracking atomic positions
- Using position components in other CVs
- Spatial analysis
- Coordinate extraction`,
        syntax: 'POSITION ATOMS=<atom> [COMPONENTS] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atom for which to calculate the position'
            },
            {
                keyword: 'COMPONENTS',
                required: false,
                description: 'calculate the x, y, and z components separately'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [
            {
                name: 'x',
                description: 'The x-coordinate of the atom (only available when COMPONENTS is used)'
            },
            {
                name: 'y',
                description: 'The y-coordinate of the atom (only available when COMPONENTS is used)'
            },
            {
                name: 'z',
                description: 'The z-coordinate of the atom (only available when COMPONENTS is used)'
            }
        ],
        examples: [
            {
                title: 'Atom position',
                code: `# Atom position
pos: POSITION ATOMS=1`
            },
            {
                title: 'Position components',
                code: `# Position with components
pos: POSITION ATOMS=1 COMPONENTS`
            }
        ],
        notes: [
            'POSITION provides access to atomic coordinates.',
            'Components are available when COMPONENTS is specified.',
            'Useful for spatial analysis.',
            'Can be used in combination with other CVs.'
        ],
        related: ['DISTANCE', 'DIPOLE']
    },
    
    'PROJECTION_ON_AXIS': {
        name: 'PROJECTION_ON_AXIS',
        category: 'Geometric',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate a position based on the projection along and extension from a defined axis.

This CV projects atomic positions onto an axis defined by a vector. It calculates both the projection along the axis and the distance from the axis.

PROJECTION_ON_AXIS is useful for:
- Projecting positions onto axes
- Analyzing directional properties
- Measuring distances from axes
- Spatial analysis`,
        syntax: 'PROJECTION_ON_AXIS ATOMS=<group> AXIS=<axis> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms to project'
            },
            {
                keyword: 'AXIS',
                required: true,
                description: 'the axis vector (three components: x, y, z)'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [
            {
                name: 'projection',
                description: 'The projection along the axis'
            },
            {
                name: 'distance',
                description: 'The distance from the axis'
            }
        ],
        examples: [
            {
                title: 'Projection on axis',
                code: `# Projection on x-axis
proj: PROJECTION_ON_AXIS ATOMS=1-100 AXIS=1,0,0`
            }
        ],
        notes: [
            'PROJECTION_ON_AXIS projects positions onto an axis.',
            'Calculates both projection and distance.',
            'Useful for directional analysis.',
            'The axis vector should be normalized.'
        ],
        related: ['POSITION', 'DISTANCE']
    },
    
    'PROPERTYMAP': {
        name: 'PROPERTYMAP',
        category: 'Analysis',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate generic property maps.

This CV creates maps of molecular properties with respect to reference structures. It measures how similar the current structure is to reference structures based on various properties.

PROPERTYMAP is useful for:
- Creating property maps
- Comparing molecular properties
- Structural similarity measures
- Property-based analysis`,
        syntax: 'PROPERTYMAP PROPERTY=<property> REFERENCE=<file> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'PROPERTY',
                required: true,
                description: 'the property to map'
            },
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference structure file'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Property map',
                code: `# Property map
pmap: PROPERTYMAP PROPERTY=1 REFERENCE=ref.pdb`
            }
        ],
        notes: [
            'PROPERTYMAP creates maps of molecular properties.',
            'Useful for comparing structures.',
            'Can use different properties.',
            'Similar to GPROPERTYMAP but with fixed metric.'
        ],
        related: ['GPROPERTYMAP', 'RMSD']
    },
    
    'PUCKERING': {
        name: 'PUCKERING',
        category: 'Geometric',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate sugar pseudorotation coordinates.

This CV computes puckering parameters for sugar rings in nucleic acids. It calculates the pseudorotation phase and amplitude, which describe the conformation of five-membered sugar rings.

PUCKERING is useful for:
- Analyzing sugar ring conformations
- Nucleic acid structure analysis
- RNA/DNA structure studies
- Conformational analysis`,
        syntax: 'PUCKERING ATOMS=<group> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the five atoms that define the sugar ring'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [
            {
                name: 'phase',
                description: 'The pseudorotation phase angle'
            },
            {
                name: 'amplitude',
                description: 'The puckering amplitude'
            }
        ],
        examples: [
            {
                title: 'Sugar puckering',
                code: `# Sugar puckering
puck: PUCKERING ATOMS=1-5`
            }
        ],
        notes: [
            'PUCKERING is specific to five-membered sugar rings.',
            'Calculates pseudorotation phase and amplitude.',
            'Useful for RNA/DNA structure analysis.',
            'The five atoms should define a ring.'
        ],
        related: ['TORSION', 'ANGLE']
    },
    
    'VOLUME': {
        name: 'VOLUME',
        category: 'System',
        module: 'colvar',
        description: `This is part of the colvar module

Calculate the volume of the simulation box.

This CV provides access to the system volume. It calculates the volume from the simulation box dimensions.

VOLUME is useful for:
- Monitoring system volume
- Volume-based analysis
- Pressure calculations
- System size monitoring`,
        syntax: 'VOLUME',
        options: [],
        components: [],
        examples: [
            {
                title: 'System volume',
                code: `# System volume
vol: VOLUME`
            }
        ],
        notes: [
            'VOLUME calculates the simulation box volume.',
            'Useful for monitoring system size.',
            'Can be used in analysis or biasing.',
            'Depends on the box dimensions.'
        ],
        related: ['CELL', 'ENERGY']
    },
    
    // MultiColvar CVs - Batch 1 (1-10)
    'ANGLES': {
        name: 'ANGLES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate functions of the distribution of angles.

ANGLES is a multicolvar that computes angles between multiple sets of atoms. It allows you to calculate functions of the distribution of angles such as the minimum, maximum, mean, or the number of angles within a certain range.

ANGLES is useful for:
- Calculating multiple angles simultaneously
- Analyzing angle distributions
- Computing statistics on angles (min, max, mean)
- Filtering angles based on values`,
        syntax: 'ANGLES ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> [MEAN] [MIN] [MAX] [MORE_THAN] [LESS_THAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms for angle calculation'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms (vertex of the angle)'
            },
            {
                keyword: 'ATOMS3',
                required: true,
                description: 'the third set of atoms for angle calculation'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean of the angle distribution'
            },
            {
                keyword: 'MIN',
                required: false,
                description: 'calculate the minimum angle'
            },
            {
                keyword: 'MAX',
                required: false,
                description: 'calculate the maximum angle'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate mean angle',
                code: `# Mean angle
angles: ANGLES ATOMS1=1,2,3 ATOMS2=4,5,6 ATOMS3=7,8,9 MEAN`
            },
            {
                title: 'Minimum angle',
                code: `# Minimum angle
angles: ANGLES ATOMS1=1,2,3 ATOMS2=4,5,6 ATOMS3=7,8,9 MIN`
            }
        ],
        notes: [
            'ANGLES is a multicolvar that calculates multiple angles simultaneously.',
            'Useful for analyzing angle distributions in complex systems.',
            'Can calculate statistics like mean, min, max on the angle distribution.',
            'Multiple sets of atoms can be specified using ATOMS1, ATOMS2, etc.'
        ],
        related: ['ANGLE', 'TORSIONS', 'XANGLES', 'YANGLES', 'ZANGLES']
    },
    
    'BOND_DIRECTIONS': {
        name: 'BOND_DIRECTIONS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the vectors connecting atoms that are within cutoff defined using a switching function.

BOND_DIRECTIONS computes the direction vectors between pairs of atoms that are within a specified cutoff distance. The cutoff is defined using a switching function that smoothly goes from 1 to 0.

BOND_DIRECTIONS is useful for:
- Analyzing bond orientations
- Computing directional properties
- Studying molecular orientations
- Vector-based analysis`,
        syntax: 'BOND_DIRECTIONS GROUPA=<group1> GROUPB=<group2> SWITCH=<switch> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'the first group of atoms'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'the second group of atoms'
            },
            {
                keyword: 'SWITCH',
                required: true,
                description: 'the switching function that defines the cutoff (e.g., {RATIONAL R_0=2.0 D_0=0.2})'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Bond directions',
                code: `# Bond directions with switching function
bd: BOND_DIRECTIONS GROUPA=1-10 GROUPB=11-20 SWITCH={RATIONAL R_0=2.0 D_0=0.2}`
            }
        ],
        notes: [
            'BOND_DIRECTIONS calculates vectors between atoms within cutoff.',
            'The switching function smoothly defines the cutoff distance.',
            'Useful for analyzing directional properties of bonds.',
            'Can be used to study molecular orientations.'
        ],
        related: ['DISTANCES', 'MOLECULES', 'PLANES']
    },
    
    'BRIDGE': {
        name: 'BRIDGE',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the number of atoms that bridge two parts of a structure.

BRIDGE identifies atoms that connect or bridge two different parts of a molecular structure. This is useful for analyzing connectivity, identifying linker atoms, or studying structural bridges.

BRIDGE is useful for:
- Identifying bridging atoms
- Analyzing structural connectivity
- Studying linker regions
- Characterizing molecular bridges`,
        syntax: 'BRIDGE GROUPA=<group1> GROUPB=<group2> [SWITCH=<switch>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'the first group of atoms'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'the second group of atoms'
            },
            {
                keyword: 'SWITCH',
                required: false,
                description: 'optional switching function for distance cutoff'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Bridge atoms',
                code: `# Bridge between two groups
bridge: BRIDGE GROUPA=1-50 GROUPB=51-100`
            }
        ],
        notes: [
            'BRIDGE identifies atoms that connect two parts of a structure.',
            'Useful for analyzing structural connectivity.',
            'Can identify linker atoms or bridging regions.',
            'Helpful for studying molecular bridges.'
        ],
        related: ['COORDINATIONNUMBER', 'NLINKS']
    },
    
    'COORDINATIONNUMBER': {
        name: 'COORDINATIONNUMBER',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the coordination numbers of atoms so that you can then calculate functions of the distribution of coordination numbers such as the minimum, the number less than a certain quantity and so on.

COORDINATIONNUMBER is a multicolvar that calculates the coordination number for each atom in a group. The coordination number is the number of neighboring atoms within a specified cutoff, defined by a switching function.

COORDINATIONNUMBER is useful for:
- Calculating coordination numbers for multiple atoms
- Analyzing coordination distributions
- Computing statistics on coordination (min, max, mean)
- Filtering atoms based on coordination`,
        syntax: 'COORDINATIONNUMBER GROUPA=<group1> GROUPB=<group2> SWITCH=<switch> [MEAN] [MIN] [MAX] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'the central atoms for which coordination numbers are calculated'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'the atoms that can coordinate to the central atoms'
            },
            {
                keyword: 'SWITCH',
                required: true,
                description: 'the switching function that defines the coordination cutoff (e.g., {RATIONAL R_0=2.5 D_0=0.2})'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean coordination number'
            },
            {
                keyword: 'MIN',
                required: false,
                description: 'calculate the minimum coordination number'
            },
            {
                keyword: 'MAX',
                required: false,
                description: 'calculate the maximum coordination number'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Mean coordination number',
                code: `# Mean coordination number
coord: COORDINATIONNUMBER GROUPA=1-10 GROUPB=11-100 SWITCH={RATIONAL R_0=2.5 D_0=0.2} MEAN`
            },
            {
                title: 'Minimum coordination',
                code: `# Minimum coordination number
coord: COORDINATIONNUMBER GROUPA=1-10 GROUPB=11-100 SWITCH={RATIONAL R_0=2.5} MIN`
            }
        ],
        notes: [
            'COORDINATIONNUMBER is a multicolvar that calculates coordination for multiple atoms.',
            'The switching function smoothly defines the coordination cutoff.',
            'Can calculate statistics like mean, min, max on coordination numbers.',
            'Useful for analyzing coordination environments in complex systems.'
        ],
        related: ['COORDINATION', 'BRIDGE', 'NLINKS']
    },
    
    'DENSITY': {
        name: 'DENSITY',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate functions of the density of atoms as a function of the box. This allows one to calculate the number of atoms in half the box.

DENSITY is a multicolvar that calculates the density of atoms in different regions of the simulation box. It can be used to compute functions of the density distribution, such as the number of atoms in specific regions.

DENSITY is useful for:
- Calculating atomic density in different regions
- Analyzing density distributions
- Computing number of atoms in specific volumes
- Studying spatial density variations`,
        syntax: 'DENSITY ATOMS=<group> [MEAN] [MIN] [MAX] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to calculate density'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean density'
            },
            {
                keyword: 'MIN',
                required: false,
                description: 'calculate the minimum density'
            },
            {
                keyword: 'MAX',
                required: false,
                description: 'calculate the maximum density'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Mean density',
                code: `# Mean density
density: DENSITY ATOMS=1-100 MEAN`
            },
            {
                title: 'Density in half box',
                code: `# Number of atoms in half the box
density: DENSITY ATOMS=1-100`
            }
        ],
        notes: [
            'DENSITY calculates atomic density in different regions of the box.',
            'Useful for analyzing spatial density distributions.',
            'Can calculate statistics like mean, min, max on density.',
            'Helpful for studying density variations in the system.'
        ],
        related: ['VOLUME', 'COORDINATIONNUMBER']
    },
    
    'DISTANCES': {
        name: 'DISTANCES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the distances between one or many pairs of atoms. You can then calculate functions of the distribution of distances such as the minimum, the number less than a certain quantity and so on.

DISTANCES is a multicolvar that computes distances between multiple pairs of atoms simultaneously. It allows you to calculate functions of the distance distribution such as the minimum distance, maximum distance, mean distance, or the number of distances within a certain range.

DISTANCES is useful for:
- Calculating multiple distances simultaneously
- Analyzing distance distributions
- Computing statistics on distances (min, max, mean)
- Filtering distances based on values`,
        syntax: 'DISTANCES ATOMS1=<group1> ATOMS2=<group2> [ATOMS3=<group3>] [MEAN] [MIN] [MAX] [MORE_THAN] [LESS_THAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms for distance calculation'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms for distance calculation'
            },
            {
                keyword: 'ATOMS3',
                required: false,
                description: 'additional sets of atoms (can specify multiple pairs)'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean of the distance distribution'
            },
            {
                keyword: 'MIN',
                required: false,
                description: 'calculate the minimum distance'
            },
            {
                keyword: 'MAX',
                required: false,
                description: 'calculate the maximum distance'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Minimum distance',
                code: `# Minimum distance between multiple pairs
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4 ATOMS3=5,6 MIN`
            },
            {
                title: 'Mean distance',
                code: `# Mean distance
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4 ATOMS3=5,6 MEAN`
            }
        ],
        notes: [
            'DISTANCES is a multicolvar that calculates multiple distances simultaneously.',
            'Useful for analyzing distance distributions in complex systems.',
            'Can calculate statistics like mean, min, max on the distance distribution.',
            'Multiple pairs of atoms can be specified using ATOMS1, ATOMS2, etc.'
        ],
        related: ['DISTANCE', 'XDISTANCES', 'YDISTANCES', 'ZDISTANCES']
    },
    
    'ENVIRONMENTSIMILARITY': {
        name: 'ENVIRONMENTSIMILARITY',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Measure how similar the environment around atoms is to that found in some reference crystal structure.

ENVIRONMENTSIMILARITY compares the local environment around each atom in the current structure to the environment found in a reference crystal structure. It calculates similarity measures for each atom.

ENVIRONMENTSIMILARITY is useful for:
- Comparing local environments to reference structures
- Identifying crystal-like regions
- Analyzing structural similarity
- Characterizing local order`,
        syntax: 'ENVIRONMENTSIMILARITY ATOMS=<group> REFERENCE=<file> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to calculate environment similarity'
            },
            {
                keyword: 'REFERENCE',
                required: true,
                description: 'the reference structure file containing the reference crystal structure'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean similarity'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Environment similarity',
                code: `# Environment similarity to reference
env: ENVIRONMENTSIMILARITY ATOMS=1-100 REFERENCE=crystal.pdb MEAN`
            }
        ],
        notes: [
            'ENVIRONMENTSIMILARITY compares local environments to a reference structure.',
            'Useful for identifying crystal-like regions.',
            'Can calculate mean similarity across all atoms.',
            'Helpful for analyzing structural similarity.'
        ],
        related: ['FCCUBIC', 'SIMPLECUBIC', 'TETRAHEDRAL']
    },
    
    'FCCUBIC': {
        name: 'FCCUBIC',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Measure how similar the environment around atoms is to that found in a FCC structure.

FCCUBIC calculates how similar the local environment around each atom is to a face-centered cubic (FCC) crystal structure. It provides a measure of FCC-like order for each atom.

FCCUBIC is useful for:
- Identifying FCC-like regions
- Analyzing crystal structure
- Characterizing local order
- Studying phase transitions`,
        syntax: 'FCCUBIC ATOMS=<group> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to calculate FCC similarity'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean FCC similarity'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'FCC cubic structure',
                code: `# FCC similarity
fcc: FCCUBIC ATOMS=1-100 MEAN`
            }
        ],
        notes: [
            'FCCUBIC measures similarity to face-centered cubic structure.',
            'Useful for identifying FCC-like regions in the system.',
            'Can calculate mean similarity across all atoms.',
            'Helpful for analyzing crystal structure and phase transitions.'
        ],
        related: ['ENVIRONMENTSIMILARITY', 'SIMPLECUBIC', 'TETRAHEDRAL']
    },
    
    'HBPAMM_SH': {
        name: 'HBPAMM_SH',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Number of HBPAMM hydrogen bonds formed by each hydrogen atom in the system.

HBPAMM_SH calculates the number of hydrogen bonds formed by each hydrogen atom using the HBPAMM (Hydrogen Bond Probabilistic Analysis of Molecular Motifs) method. This is a multicolvar that computes hydrogen bond counts for multiple atoms.

HBPAMM_SH is useful for:
- Counting hydrogen bonds per hydrogen atom
- Analyzing hydrogen bonding patterns
- Computing statistics on hydrogen bonds
- Studying hydrogen bond distributions`,
        syntax: 'HBPAMM_SH ATOMS=<group> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the hydrogen atoms for which to calculate hydrogen bond counts'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean number of hydrogen bonds'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'HBPAMM hydrogen bonds',
                code: `# Hydrogen bonds per atom
hb: HBPAMM_SH ATOMS=1-100 MEAN`
            }
        ],
        notes: [
            'HBPAMM_SH uses the HBPAMM method for hydrogen bond analysis.',
            'Calculates hydrogen bond counts for each hydrogen atom.',
            'Can calculate mean number of hydrogen bonds.',
            'Useful for analyzing hydrogen bonding patterns.'
        ],
        related: ['HBOND', 'COORDINATIONNUMBER']
    },
    
    'INPLANEDISTANCES': {
        name: 'INPLANEDISTANCES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate distances in the plane perpendicular to an axis.

INPLANEDISTANCES calculates the distances between atoms projected onto a plane that is perpendicular to a specified axis. This is useful for analyzing 2D distances in a plane.

INPLANEDISTANCES is useful for:
- Calculating 2D distances in a plane
- Analyzing planar structures
- Studying distances perpendicular to an axis
- 2D spatial analysis`,
        syntax: 'INPLANEDISTANCES ATOMS1=<group1> ATOMS2=<group2> AXIS=<axis> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'AXIS',
                required: true,
                description: 'the axis vector perpendicular to the plane (three components: x, y, z)'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean in-plane distance'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'In-plane distances',
                code: `# In-plane distances perpendicular to z-axis
ipd: INPLANEDISTANCES ATOMS1=1,2 ATOMS2=3,4 AXIS=0,0,1 MEAN`
            }
        ],
        notes: [
            'INPLANEDISTANCES calculates 2D distances in a plane.',
            'The plane is perpendicular to the specified axis.',
            'Useful for analyzing planar structures.',
            'Can calculate mean distance in the plane.'
        ],
        related: ['DISTANCES', 'XYDISTANCES', 'XZDISTANCES', 'YZDISTANCES']
    },
    
    // MultiColvar CVs - Batch 2 (11-20)
    'MOLECULES': {
        name: 'MOLECULES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the vectors connecting a pair of atoms in order to represent the orientation of a molecule.

MOLECULES calculates vectors between pairs of atoms to represent molecular orientations. This is useful for analyzing the orientation of molecules in the system.

MOLECULES is useful for:
- Representing molecular orientations
- Analyzing molecular alignment
- Computing orientation vectors
- Studying molecular directions`,
        syntax: 'MOLECULES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first atom of each pair'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second atom of each pair'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean orientation vector'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Molecule orientations',
                code: `# Molecular orientation vectors
mol: MOLECULES ATOMS1=1,3,5 ATOMS2=2,4,6 MEAN`
            }
        ],
        notes: [
            'MOLECULES calculates vectors representing molecular orientations.',
            'Useful for analyzing molecular alignment.',
            'Can calculate mean orientation vector.',
            'Helpful for studying molecular directions.'
        ],
        related: ['PLANES', 'BOND_DIRECTIONS', 'INTERMOLECULARTORSIONS']
    },
    
    'PLANES': {
        name: 'PLANES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the plane perpendicular to two vectors in order to represent the orientation of a planar molecule.

PLANES calculates planes defined by two vectors to represent the orientation of planar molecules. This is useful for analyzing the orientation of planar molecular structures.

PLANES is useful for:
- Representing planar molecule orientations
- Analyzing planar molecular alignment
- Computing plane normal vectors
- Studying planar molecular structures`,
        syntax: 'PLANES ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms defining the first vector'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms defining the second vector'
            },
            {
                keyword: 'ATOMS3',
                required: true,
                description: 'the third set of atoms (optional, for additional planes)'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean plane orientation'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Plane orientations',
                code: `# Planar molecule orientations
planes: PLANES ATOMS1=1,2,3 ATOMS2=4,5,6 ATOMS3=7,8,9 MEAN`
            }
        ],
        notes: [
            'PLANES calculates planes representing planar molecule orientations.',
            'Useful for analyzing planar molecular alignment.',
            'Can calculate mean plane orientation.',
            'Helpful for studying planar molecular structures.'
        ],
        related: ['MOLECULES', 'BOND_DIRECTIONS', 'TORSIONS']
    },
    
    'Q3': {
        name: 'Q3',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate 3rd order Steinhardt parameters.

Q3 calculates the third-order Steinhardt parameters, which are measures of local order around atoms. These parameters are useful for characterizing crystal structures and local environments.

Q3 is useful for:
- Characterizing local order
- Identifying crystal structures
- Analyzing structural environments
- Computing order parameters`,
        syntax: 'Q3 ATOMS=<group> [MEAN]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to calculate Q3 parameters'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean Q3 parameter'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Q3 Steinhardt parameter',
                code: `# Q3 parameter
q3: Q3 ATOMS=1-100 MEAN`
            }
        ],
        notes: [
            'Q3 is the third-order Steinhardt parameter.',
            'Useful for characterizing local order around atoms.',
            'Can calculate mean Q3 across all atoms.',
            'Helpful for identifying crystal structures and analyzing environments.'
        ],
        related: ['Q4', 'Q6', 'LOCAL_Q3']
    },
    
    'Q4': {
        name: 'Q4',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate fourth order Steinhardt parameters.

Q4 calculates the fourth-order Steinhardt parameters, which are measures of local order around atoms. These parameters are particularly useful for characterizing crystal structures like body-centered cubic (BCC).

Q4 is useful for:
- Characterizing local order
- Identifying BCC crystal structures
- Analyzing structural environments
- Computing order parameters`,
        syntax: 'Q4 ATOMS=<group> [MEAN]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to calculate Q4 parameters'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean Q4 parameter'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Q4 Steinhardt parameter',
                code: `# Q4 parameter
q4: Q4 ATOMS=1-100 MEAN`
            }
        ],
        notes: [
            'Q4 is the fourth-order Steinhardt parameter.',
            'Particularly useful for identifying BCC crystal structures.',
            'Can calculate mean Q4 across all atoms.',
            'Helpful for characterizing local order and analyzing environments.'
        ],
        related: ['Q3', 'Q6', 'LOCAL_Q4']
    },
    
    'Q6': {
        name: 'Q6',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate sixth order Steinhardt parameters.

Q6 calculates the sixth-order Steinhardt parameters, which are measures of local order around atoms. These parameters are particularly useful for characterizing crystal structures like face-centered cubic (FCC) and hexagonal close-packed (HCP).

Q6 is useful for:
- Characterizing local order
- Identifying FCC and HCP crystal structures
- Analyzing structural environments
- Computing order parameters`,
        syntax: 'Q6 ATOMS=<group> [MEAN]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to calculate Q6 parameters'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean Q6 parameter'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Q6 Steinhardt parameter',
                code: `# Q6 parameter
q6: Q6 ATOMS=1-100 MEAN`
            }
        ],
        notes: [
            'Q6 is the sixth-order Steinhardt parameter.',
            'Particularly useful for identifying FCC and HCP crystal structures.',
            'Can calculate mean Q6 across all atoms.',
            'Helpful for characterizing local order and analyzing environments.'
        ],
        related: ['Q3', 'Q4', 'LOCAL_Q6']
    },
    
    'SIMPLECUBIC': {
        name: 'SIMPLECUBIC',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate whether or not the coordination spheres of atoms are arranged as they would be in a simple cubic structure.

SIMPLECUBIC determines how similar the local environment around each atom is to a simple cubic crystal structure. It provides a measure of simple cubic-like order.

SIMPLECUBIC is useful for:
- Identifying simple cubic-like regions
- Analyzing crystal structure
- Characterizing local order
- Studying phase transitions`,
        syntax: 'SIMPLECUBIC ATOMS=<group> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to calculate simple cubic similarity'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean simple cubic similarity'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Simple cubic structure',
                code: `# Simple cubic similarity
sc: SIMPLECUBIC ATOMS=1-100 MEAN`
            }
        ],
        notes: [
            'SIMPLECUBIC measures similarity to simple cubic structure.',
            'Useful for identifying simple cubic-like regions.',
            'Can calculate mean similarity across all atoms.',
            'Helpful for analyzing crystal structure and phase transitions.'
        ],
        related: ['FCCUBIC', 'ENVIRONMENTSIMILARITY', 'TETRAHEDRAL']
    },
    
    'TETRAHEDRAL': {
        name: 'TETRAHEDRAL',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the degree to which the environment about ions has a tetrahedral order.

TETRAHEDRAL measures how similar the local environment around each atom is to a tetrahedral arrangement. This is particularly useful for analyzing liquid water, silica, and other tetrahedrally coordinated systems.

TETRAHEDRAL is useful for:
- Identifying tetrahedral-like regions
- Analyzing liquid water structure
- Characterizing tetrahedral coordination
- Studying phase transitions`,
        syntax: 'TETRAHEDRAL ATOMS=<group> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to calculate tetrahedral order'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean tetrahedral order'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Tetrahedral order',
                code: `# Tetrahedral order
tet: TETRAHEDRAL ATOMS=1-100 MEAN`
            }
        ],
        notes: [
            'TETRAHEDRAL measures similarity to tetrahedral coordination.',
            'Particularly useful for liquid water and silica systems.',
            'Can calculate mean tetrahedral order across all atoms.',
            'Helpful for analyzing tetrahedral coordination and phase transitions.'
        ],
        related: ['FCCUBIC', 'SIMPLECUBIC', 'ENVIRONMENTSIMILARITY']
    },
    
    'TORSIONS': {
        name: 'TORSIONS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate whether or not a set of torsional angles are within a particular range.

TORSIONS is a multicolvar that computes torsional angles between multiple sets of four atoms simultaneously. It allows you to calculate functions of the torsion distribution such as the number of torsions within a certain range.

TORSIONS is useful for:
- Calculating multiple torsional angles simultaneously
- Analyzing torsion distributions
- Filtering torsions based on values
- Computing statistics on torsions`,
        syntax: 'TORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4> [MEAN] [MORE_THAN] [LESS_THAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms for torsion calculation'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'ATOMS3',
                required: true,
                description: 'the third set of atoms'
            },
            {
                keyword: 'ATOMS4',
                required: true,
                description: 'the fourth set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean torsion angle'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Mean torsions',
                code: `# Mean torsional angles
torsions: TORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8 MEAN`
            }
        ],
        notes: [
            'TORSIONS is a multicolvar that calculates multiple torsional angles.',
            'Useful for analyzing torsion distributions in complex systems.',
            'Can calculate statistics like mean on the torsion distribution.',
            'Multiple sets of four atoms can be specified.'
        ],
        related: ['TORSION', 'ANGLES', 'XYTORSIONS', 'XZTORSIONS', 'YXTORSIONS', 'YZTORSIONS', 'ZXTORSIONS', 'ZYTORSIONS']
    },
    
    'XANGLES': {
        name: 'XANGLES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the angles between the vector connecting two atoms and the x axis.

XANGLES calculates the angles between vectors connecting pairs of atoms and the x-axis. This is useful for analyzing orientations relative to the x-axis.

XANGLES is useful for:
- Analyzing orientations relative to x-axis
- Computing angle distributions
- Studying directional properties
- X-axis alignment analysis`,
        syntax: 'XANGLES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean angle with x-axis'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'X angles',
                code: `# Angles with x-axis
xang: XANGLES ATOMS1=1,2 ATOMS2=3,4 MEAN`
            }
        ],
        notes: [
            'XANGLES calculates angles between vectors and the x-axis.',
            'Useful for analyzing orientations relative to x-axis.',
            'Can calculate mean angle with x-axis.',
            'Helpful for studying directional properties.'
        ],
        related: ['YANGLES', 'ZANGLES', 'ANGLES', 'XDISTANCES']
    },
    
    'XDISTANCES': {
        name: 'XDISTANCES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the x components of the vectors connecting one or many pairs of atoms. You can then calculate functions of the distribution of values such as the minimum, the number less than a certain quantity and so on.

XDISTANCES calculates the x-components of distance vectors between multiple pairs of atoms. This is useful for analyzing distances along the x-axis.

XDISTANCES is useful for:
- Calculating x-components of distances
- Analyzing distances along x-axis
- Computing statistics on x-distances
- X-axis distance analysis`,
        syntax: 'XDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [MIN] [MAX] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean x-distance'
            },
            {
                keyword: 'MIN',
                required: false,
                description: 'calculate the minimum x-distance'
            },
            {
                keyword: 'MAX',
                required: false,
                description: 'calculate the maximum x-distance'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'X distances',
                code: `# X components of distances
xd: XDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`
            }
        ],
        notes: [
            'XDISTANCES calculates x-components of distance vectors.',
            'Useful for analyzing distances along the x-axis.',
            'Can calculate statistics like mean, min, max on x-distances.',
            'Helpful for x-axis distance analysis.'
        ],
        related: ['YDISTANCES', 'ZDISTANCES', 'DISTANCES', 'XYDISTANCES', 'XZDISTANCES']
    },
    
    // MultiColvar CVs - Batch 3 (21-30)
    'XYDISTANCES': {
        name: 'XYDISTANCES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate distance between a pair of atoms neglecting the z-component.

XYDISTANCES calculates 2D distances in the xy-plane by neglecting the z-component of the distance vector. This is useful for analyzing distances in a plane.

XYDISTANCES is useful for:
- Calculating 2D distances in xy-plane
- Analyzing planar distances
- Studying distances neglecting z-component
- 2D spatial analysis`,
        syntax: 'XYDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [MIN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean xy-distance'
            },
            {
                keyword: 'MIN',
                required: false,
                description: 'calculate the minimum xy-distance'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'XY distances',
                code: `# XY plane distances
xyd: XYDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`
            }
        ],
        notes: [
            'XYDISTANCES calculates 2D distances in the xy-plane.',
            'The z-component is neglected in the distance calculation.',
            'Useful for analyzing planar structures.',
            'Can calculate mean or minimum xy-distance.'
        ],
        related: ['XZDISTANCES', 'YZDISTANCES', 'DISTANCES', 'INPLANEDISTANCES']
    },
    
    'XYTORSIONS': {
        name: 'XYTORSIONS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the torsional angle around the x axis from the positive y direction.

XYTORSIONS calculates torsional angles around the x-axis measured from the positive y direction. This is useful for analyzing rotations around the x-axis.

XYTORSIONS is useful for:
- Analyzing rotations around x-axis
- Computing torsion distributions
- Studying x-axis rotational properties
- Torsional angle analysis`,
        syntax: 'XYTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms for torsion calculation'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'ATOMS3',
                required: true,
                description: 'the third set of atoms'
            },
            {
                keyword: 'ATOMS4',
                required: true,
                description: 'the fourth set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean xy-torsion'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'XY torsions',
                code: `# XY torsional angles
xyt: XYTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8 MEAN`
            }
        ],
        notes: [
            'XYTORSIONS calculates torsions around x-axis from y direction.',
            'Useful for analyzing rotations around the x-axis.',
            'Can calculate mean xy-torsion.',
            'Helpful for studying x-axis rotational properties.'
        ],
        related: ['XZTORSIONS', 'TORSIONS', 'YXTORSIONS', 'YZTORSIONS', 'ZXTORSIONS', 'ZYTORSIONS']
    },
    
    'XZDISTANCES': {
        name: 'XZDISTANCES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate distance between a pair of atoms neglecting the y-component.

XZDISTANCES calculates 2D distances in the xz-plane by neglecting the y-component of the distance vector. This is useful for analyzing distances in a plane.

XZDISTANCES is useful for:
- Calculating 2D distances in xz-plane
- Analyzing planar distances
- Studying distances neglecting y-component
- 2D spatial analysis`,
        syntax: 'XZDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [MIN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean xz-distance'
            },
            {
                keyword: 'MIN',
                required: false,
                description: 'calculate the minimum xz-distance'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'XZ distances',
                code: `# XZ plane distances
xzd: XZDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`
            }
        ],
        notes: [
            'XZDISTANCES calculates 2D distances in the xz-plane.',
            'The y-component is neglected in the distance calculation.',
            'Useful for analyzing planar structures.',
            'Can calculate mean or minimum xz-distance.'
        ],
        related: ['XYDISTANCES', 'YZDISTANCES', 'DISTANCES', 'INPLANEDISTANCES']
    },
    
    'XZTORSIONS': {
        name: 'XZTORSIONS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the torsional angle around the x axis from the positive z direction.

XZTORSIONS calculates torsional angles around the x-axis measured from the positive z direction. This is useful for analyzing rotations around the x-axis.

XZTORSIONS is useful for:
- Analyzing rotations around x-axis
- Computing torsion distributions
- Studying x-axis rotational properties
- Torsional angle analysis`,
        syntax: 'XZTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms for torsion calculation'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'ATOMS3',
                required: true,
                description: 'the third set of atoms'
            },
            {
                keyword: 'ATOMS4',
                required: true,
                description: 'the fourth set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean xz-torsion'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'XZ torsions',
                code: `# XZ torsional angles
xzt: XZTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8 MEAN`
            }
        ],
        notes: [
            'XZTORSIONS calculates torsions around x-axis from z direction.',
            'Useful for analyzing rotations around the x-axis.',
            'Can calculate mean xz-torsion.',
            'Helpful for studying x-axis rotational properties.'
        ],
        related: ['XYTORSIONS', 'TORSIONS', 'YXTORSIONS', 'YZTORSIONS', 'ZXTORSIONS', 'ZYTORSIONS']
    },
    
    'YANGLES': {
        name: 'YANGLES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the angles between the vector connecting two atoms and the y axis.

YANGLES calculates the angles between vectors connecting pairs of atoms and the y-axis. This is useful for analyzing orientations relative to the y-axis.

YANGLES is useful for:
- Analyzing orientations relative to y-axis
- Computing angle distributions
- Studying directional properties
- Y-axis alignment analysis`,
        syntax: 'YANGLES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean angle with y-axis'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Y angles',
                code: `# Angles with y-axis
yang: YANGLES ATOMS1=1,2 ATOMS2=3,4 MEAN`
            }
        ],
        notes: [
            'YANGLES calculates angles between vectors and the y-axis.',
            'Useful for analyzing orientations relative to y-axis.',
            'Can calculate mean angle with y-axis.',
            'Helpful for studying directional properties.'
        ],
        related: ['XANGLES', 'ZANGLES', 'ANGLES', 'YDISTANCES']
    },
    
    'YDISTANCES': {
        name: 'YDISTANCES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the y components of the vectors connecting one or many pairs of atoms. You can then calculate functions of the distribution of values such as the minimum, the number less than a certain quantity and so on.

YDISTANCES calculates the y-components of distance vectors between multiple pairs of atoms. This is useful for analyzing distances along the y-axis.

YDISTANCES is useful for:
- Calculating y-components of distances
- Analyzing distances along y-axis
- Computing statistics on y-distances
- Y-axis distance analysis`,
        syntax: 'YDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [MIN] [MAX] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean y-distance'
            },
            {
                keyword: 'MIN',
                required: false,
                description: 'calculate the minimum y-distance'
            },
            {
                keyword: 'MAX',
                required: false,
                description: 'calculate the maximum y-distance'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Y distances',
                code: `# Y components of distances
yd: YDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`
            }
        ],
        notes: [
            'YDISTANCES calculates y-components of distance vectors.',
            'Useful for analyzing distances along the y-axis.',
            'Can calculate statistics like mean, min, max on y-distances.',
            'Helpful for y-axis distance analysis.'
        ],
        related: ['XDISTANCES', 'ZDISTANCES', 'DISTANCES', 'XYDISTANCES', 'YZDISTANCES']
    },
    
    'YXTORSIONS': {
        name: 'YXTORSIONS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the torsional angle around the y axis from the positive x direction.

YXTORSIONS calculates torsional angles around the y-axis measured from the positive x direction. This is useful for analyzing rotations around the y-axis.

YXTORSIONS is useful for:
- Analyzing rotations around y-axis
- Computing torsion distributions
- Studying y-axis rotational properties
- Torsional angle analysis`,
        syntax: 'YXTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms for torsion calculation'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'ATOMS3',
                required: true,
                description: 'the third set of atoms'
            },
            {
                keyword: 'ATOMS4',
                required: true,
                description: 'the fourth set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean yx-torsion'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'YX torsions',
                code: `# YX torsional angles
yxt: YXTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8 MEAN`
            }
        ],
        notes: [
            'YXTORSIONS calculates torsions around y-axis from x direction.',
            'Useful for analyzing rotations around the y-axis.',
            'Can calculate mean yx-torsion.',
            'Helpful for studying y-axis rotational properties.'
        ],
        related: ['YZTORSIONS', 'TORSIONS', 'XYTORSIONS', 'XZTORSIONS', 'ZXTORSIONS', 'ZYTORSIONS']
    },
    
    'YZDISTANCES': {
        name: 'YZDISTANCES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate distance between a pair of atoms neglecting the x-component.

YZDISTANCES calculates 2D distances in the yz-plane by neglecting the x-component of the distance vector. This is useful for analyzing distances in a plane.

YZDISTANCES is useful for:
- Calculating 2D distances in yz-plane
- Analyzing planar distances
- Studying distances neglecting x-component
- 2D spatial analysis`,
        syntax: 'YZDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [MIN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean yz-distance'
            },
            {
                keyword: 'MIN',
                required: false,
                description: 'calculate the minimum yz-distance'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'YZ distances',
                code: `# YZ plane distances
yzd: YZDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`
            }
        ],
        notes: [
            'YZDISTANCES calculates 2D distances in the yz-plane.',
            'The x-component is neglected in the distance calculation.',
            'Useful for analyzing planar structures.',
            'Can calculate mean or minimum yz-distance.'
        ],
        related: ['XYDISTANCES', 'XZDISTANCES', 'DISTANCES', 'INPLANEDISTANCES']
    },
    
    'YZTORSIONS': {
        name: 'YZTORSIONS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the torsional angle around the y axis from the positive z direction.

YZTORSIONS calculates torsional angles around the y-axis measured from the positive z direction. This is useful for analyzing rotations around the y-axis.

YZTORSIONS is useful for:
- Analyzing rotations around y-axis
- Computing torsion distributions
- Studying y-axis rotational properties
- Torsional angle analysis`,
        syntax: 'YZTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms for torsion calculation'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'ATOMS3',
                required: true,
                description: 'the third set of atoms'
            },
            {
                keyword: 'ATOMS4',
                required: true,
                description: 'the fourth set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean yz-torsion'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'YZ torsions',
                code: `# YZ torsional angles
yzt: YZTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8 MEAN`
            }
        ],
        notes: [
            'YZTORSIONS calculates torsions around y-axis from z direction.',
            'Useful for analyzing rotations around the y-axis.',
            'Can calculate mean yz-torsion.',
            'Helpful for studying y-axis rotational properties.'
        ],
        related: ['YXTORSIONS', 'TORSIONS', 'XYTORSIONS', 'XZTORSIONS', 'ZXTORSIONS', 'ZYTORSIONS']
    },
    
    'ZANGLES': {
        name: 'ZANGLES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the angles between the vector connecting two atoms and the z axis.

ZANGLES calculates the angles between vectors connecting pairs of atoms and the z-axis. This is useful for analyzing orientations relative to the z-axis.

ZANGLES is useful for:
- Analyzing orientations relative to z-axis
- Computing angle distributions
- Studying directional properties
- Z-axis alignment analysis`,
        syntax: 'ZANGLES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean angle with z-axis'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Z angles',
                code: `# Angles with z-axis
zang: ZANGLES ATOMS1=1,2 ATOMS2=3,4 MEAN`
            }
        ],
        notes: [
            'ZANGLES calculates angles between vectors and the z-axis.',
            'Useful for analyzing orientations relative to z-axis.',
            'Can calculate mean angle with z-axis.',
            'Helpful for studying directional properties.'
        ],
        related: ['XANGLES', 'YANGLES', 'ANGLES', 'ZDISTANCES']
    },
    
    'ZDISTANCES': {
        name: 'ZDISTANCES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the z components of the vectors connecting one or many pairs of atoms. You can then calculate functions of the distribution of values such as the minimum, the number less than a certain quantity and so on.

ZDISTANCES calculates the z-components of distance vectors between multiple pairs of atoms. This is useful for analyzing distances along the z-axis.

ZDISTANCES is useful for:
- Calculating z-components of distances
- Analyzing distances along z-axis
- Computing statistics on z-distances
- Z-axis distance analysis`,
        syntax: 'ZDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [MIN] [MAX] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean z-distance'
            },
            {
                keyword: 'MIN',
                required: false,
                description: 'calculate the minimum z-distance'
            },
            {
                keyword: 'MAX',
                required: false,
                description: 'calculate the maximum z-distance'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Z distances',
                code: `# Z components of distances
zd: ZDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`
            }
        ],
        notes: [
            'ZDISTANCES calculates z-components of distance vectors.',
            'Useful for analyzing distances along the z-axis.',
            'Can calculate statistics like mean, min, max on z-distances.',
            'Helpful for z-axis distance analysis.'
        ],
        related: ['XDISTANCES', 'YDISTANCES', 'DISTANCES', 'XYDISTANCES', 'XZDISTANCES', 'YZDISTANCES']
    },
    
    // MultiColvar CVs - Batch 4 (32-41)
    'ZXTORSIONS': {
        name: 'ZXTORSIONS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the torsional angle around the z axis from the positive x direction.

ZXTORSIONS calculates torsional angles around the z-axis measured from the positive x direction. This is useful for analyzing rotations around the z-axis.

ZXTORSIONS is useful for:
- Analyzing rotations around z-axis
- Computing torsion distributions
- Studying z-axis rotational properties
- Torsional angle analysis`,
        syntax: 'ZXTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms for torsion calculation'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'ATOMS3',
                required: true,
                description: 'the third set of atoms'
            },
            {
                keyword: 'ATOMS4',
                required: true,
                description: 'the fourth set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean zx-torsion'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'ZX torsions',
                code: `# ZX torsional angles
zxt: ZXTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8 MEAN`
            }
        ],
        notes: [
            'ZXTORSIONS calculates torsions around z-axis from x direction.',
            'Useful for analyzing rotations around the z-axis.',
            'Can calculate mean zx-torsion.',
            'Helpful for studying z-axis rotational properties.'
        ],
        related: ['ZYTORSIONS', 'TORSIONS', 'XYTORSIONS', 'XZTORSIONS', 'YXTORSIONS', 'YZTORSIONS']
    },
    
    'ZYTORSIONS': {
        name: 'ZYTORSIONS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the torsional angle around the z axis from the positive y direction.

ZYTORSIONS calculates torsional angles around the z-axis measured from the positive y direction. This is useful for analyzing rotations around the z-axis.

ZYTORSIONS is useful for:
- Analyzing rotations around z-axis
- Computing torsion distributions
- Studying z-axis rotational properties
- Torsional angle analysis`,
        syntax: 'ZYTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS1',
                required: true,
                description: 'the first set of atoms for torsion calculation'
            },
            {
                keyword: 'ATOMS2',
                required: true,
                description: 'the second set of atoms'
            },
            {
                keyword: 'ATOMS3',
                required: true,
                description: 'the third set of atoms'
            },
            {
                keyword: 'ATOMS4',
                required: true,
                description: 'the fourth set of atoms'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean zy-torsion'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'ZY torsions',
                code: `# ZY torsional angles
zyt: ZYTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8 MEAN`
            }
        ],
        notes: [
            'ZYTORSIONS calculates torsions around z-axis from y direction.',
            'Useful for analyzing rotations around the z-axis.',
            'Can calculate mean zy-torsion.',
            'Helpful for studying z-axis rotational properties.'
        ],
        related: ['ZXTORSIONS', 'TORSIONS', 'XYTORSIONS', 'XZTORSIONS', 'YXTORSIONS', 'YZTORSIONS']
    },
    
    'DUMPMULTICOLVAR': {
        name: 'DUMPMULTICOLVAR',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Output a histogram using the weighted histogram analysis method (WHAM). Extract all the individual colvar values that you have calculated.

DUMPMULTICOLVAR allows you to extract and output all the individual collective variable values that have been calculated by a multicolvar. This is useful when you want to analyze all the individual values rather than just statistics.

DUMPMULTICOLVAR is useful for:
- Extracting all individual CV values
- Outputting complete multicolvar data
- Analyzing individual values
- Data extraction and analysis`,
        syntax: 'DUMPMULTICOLVAR ARG=<multicolvar> FILE=<file>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar from which to extract values'
            },
            {
                keyword: 'FILE',
                required: true,
                description: 'the output file where individual values will be written'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Dump multicolvar',
                code: `# Extract all distance values
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4 ATOMS3=5,6
dump: DUMPMULTICOLVAR ARG=distances FILE=distances.dat`
            }
        ],
        notes: [
            'DUMPMULTICOLVAR extracts all individual CV values from a multicolvar.',
            'Useful for detailed analysis of all calculated values.',
            'Outputs all values to a specified file.',
            'Helpful for data extraction and post-processing.'
        ],
        related: ['DISTANCES', 'ANGLES', 'COORDINATIONNUMBER']
    },
    
    'MFILTER_BETWEEN': {
        name: 'MFILTER_BETWEEN',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This action can be used to filter the colvar values calculated by a multicolvar so that one can compute the mean and so on for only those multicolvars within a certain range.

MFILTER_BETWEEN filters multicolvar values to keep only those within a specified range. This allows you to compute statistics (mean, min, max, etc.) on only the filtered subset of values.

MFILTER_BETWEEN is useful for:
- Filtering CV values by range
- Computing statistics on filtered values
- Analyzing subsets of multicolvar data
- Range-based filtering`,
        syntax: 'MFILTER_BETWEEN ARG=<multicolvar> LOWER=<lower> UPPER=<upper>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to filter'
            },
            {
                keyword: 'LOWER',
                required: true,
                description: 'the lower bound of the range'
            },
            {
                keyword: 'UPPER',
                required: true,
                description: 'the upper bound of the range'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Filter between values',
                code: `# Filter distances between 2.0 and 5.0
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
filter: MFILTER_BETWEEN ARG=distances LOWER=2.0 UPPER=5.0`
            }
        ],
        notes: [
            'MFILTER_BETWEEN filters multicolvar values within a range.',
            'Only values between LOWER and UPPER are kept.',
            'Useful for computing statistics on filtered subsets.',
            'Helpful for range-based analysis.'
        ],
        related: ['MFILTER_LESS', 'MFILTER_MORE', 'MTRANSFORM_BETWEEN']
    },
    
    'MFILTER_LESS': {
        name: 'MFILTER_LESS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This action can be used to filter the distribution of colvar values in a multicolvar so that one can compute the mean and so on for only those multicolvars less than a tolerance.

MFILTER_LESS filters multicolvar values to keep only those less than a specified tolerance. This allows you to compute statistics on only the filtered subset of values.

MFILTER_LESS is useful for:
- Filtering CV values less than threshold
- Computing statistics on filtered values
- Analyzing subsets of multicolvar data
- Threshold-based filtering`,
        syntax: 'MFILTER_LESS ARG=<multicolvar> TOLERANCE=<tol>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to filter'
            },
            {
                keyword: 'TOLERANCE',
                required: true,
                description: 'the threshold value (only values less than this are kept)'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Filter less than threshold',
                code: `# Filter distances less than 3.0
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
filter: MFILTER_LESS ARG=distances TOLERANCE=3.0`
            }
        ],
        notes: [
            'MFILTER_LESS filters multicolvar values less than TOLERANCE.',
            'Only values below the threshold are kept.',
            'Useful for computing statistics on filtered subsets.',
            'Helpful for threshold-based analysis.'
        ],
        related: ['MFILTER_BETWEEN', 'MFILTER_MORE', 'MTRANSFORM_LESS']
    },
    
    'MFILTER_MORE': {
        name: 'MFILTER_MORE',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This action can be used to filter the distribution of colvar values in a multicolvar so that one can compute the mean and so on for only those multicolvars more than a tolerance.

MFILTER_MORE filters multicolvar values to keep only those greater than a specified tolerance. This allows you to compute statistics on only the filtered subset of values.

MFILTER_MORE is useful for:
- Filtering CV values greater than threshold
- Computing statistics on filtered values
- Analyzing subsets of multicolvar data
- Threshold-based filtering`,
        syntax: 'MFILTER_MORE ARG=<multicolvar> TOLERANCE=<tol>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to filter'
            },
            {
                keyword: 'TOLERANCE',
                required: true,
                description: 'the threshold value (only values greater than this are kept)'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Filter more than threshold',
                code: `# Filter distances greater than 5.0
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
filter: MFILTER_MORE ARG=distances TOLERANCE=5.0`
            }
        ],
        notes: [
            'MFILTER_MORE filters multicolvar values greater than TOLERANCE.',
            'Only values above the threshold are kept.',
            'Useful for computing statistics on filtered subsets.',
            'Helpful for threshold-based analysis.'
        ],
        related: ['MFILTER_BETWEEN', 'MFILTER_LESS', 'MTRANSFORM_MORE']
    },
    
    'AROUND': {
        name: 'AROUND',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This quantity can be used to calculate functions of the distribution of collective variables for the atoms that lie in a particular, user-specified part of of the cell.

AROUND calculates functions of multicolvar values for atoms that are within a specified distance of reference atoms. This allows you to analyze multicolvar properties in a local region around specific atoms.

AROUND is useful for:
- Analyzing multicolvars in local regions
- Computing properties around specific atoms
- Local environment analysis
- Spatial filtering of multicolvars`,
        syntax: 'AROUND ARG=<multicolvar> ATOMS=<group> R_0=<r0> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to analyze'
            },
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the reference atoms around which to calculate properties'
            },
            {
                keyword: 'R_0',
                required: true,
                description: 'the cutoff distance for the "around" region'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Around specific atoms',
                code: `# Analyze distances around atoms 1-10
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
around: AROUND ARG=distances ATOMS=1-10 R_0=5.0`
            }
        ],
        notes: [
            'AROUND analyzes multicolvars in regions around reference atoms.',
            'Only atoms within R_0 distance are considered.',
            'Useful for local environment analysis.',
            'Helpful for spatial filtering of multicolvar properties.'
        ],
        related: ['INSPHERE', 'INCYLINDER', 'CAVITY']
    },
    
    'CAVITY': {
        name: 'CAVITY',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This quantity can be used to calculate functions of the distribution of collective variables for the atoms that lie in a box defined by the positions of four atoms.

CAVITY calculates functions of multicolvar values for atoms that lie within a box defined by four corner atoms. This allows you to analyze multicolvar properties in a specific cavity or box region.

CAVITY is useful for:
- Analyzing multicolvars in box regions
- Computing properties in cavities
- Box-defined spatial filtering
- Cavity analysis`,
        syntax: 'CAVITY ARG=<multicolvar> ATOMS=<group> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to analyze'
            },
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the four atoms that define the corners of the box (must be exactly 4 atoms)'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Cavity analysis',
                code: `# Analyze distances in cavity defined by 4 atoms
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
cavity: CAVITY ARG=distances ATOMS=10,11,12,13`
            }
        ],
        notes: [
            'CAVITY analyzes multicolvars in a box defined by four corner atoms.',
            'The four atoms define the corners of the box.',
            'Useful for analyzing properties in specific cavities.',
            'Helpful for box-defined spatial filtering.'
        ],
        related: ['AROUND', 'INSPHERE', 'TETRAHEDRALPORE']
    },
    
    'INCYLINDER': {
        name: 'INCYLINDER',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This quantity can be used to calculate functions of the distribution of collective variables for the atoms that lie in a particular, user-specified part of of the cell.

INCYLINDER calculates functions of multicolvar values for atoms that lie within a cylindrical region. The cylinder is defined by a central axis and a radius.

INCYLINDER is useful for:
- Analyzing multicolvars in cylindrical regions
- Computing properties in cylinders
- Cylindrical spatial filtering
- Tube-like region analysis`,
        syntax: 'INCYLINDER ARG=<multicolvar> ATOMS=<group> DIRECTION=<dir> RADIUS=<r> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to analyze'
            },
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms that define the cylinder axis or center'
            },
            {
                keyword: 'DIRECTION',
                required: true,
                description: 'the direction vector of the cylinder axis (three components: x, y, z)'
            },
            {
                keyword: 'RADIUS',
                required: true,
                description: 'the radius of the cylinder'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'In cylinder',
                code: `# Analyze distances in cylinder along z-axis
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
cyl: INCYLINDER ARG=distances ATOMS=1-10 DIRECTION=0,0,1 RADIUS=5.0`
            }
        ],
        notes: [
            'INCYLINDER analyzes multicolvars in a cylindrical region.',
            'The cylinder is defined by a direction vector and radius.',
            'Useful for analyzing properties in tube-like regions.',
            'Helpful for cylindrical spatial filtering.'
        ],
        related: ['AROUND', 'INSPHERE', 'INENVELOPE']
    },
    
    'INENVELOPE': {
        name: 'INENVELOPE',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This quantity can be used to calculate functions of the distribution of collective variables for the atoms that lie in a region where the density of a certain type of atom is high.

INENVELOPE calculates functions of multicolvar values for atoms that lie in regions of high density of a specific atom type. This allows you to analyze multicolvar properties in dense regions.

INENVELOPE is useful for:
- Analyzing multicolvars in dense regions
- Computing properties in high-density areas
- Density-based spatial filtering
- Envelope region analysis`,
        syntax: 'INENVELOPE ARG=<multicolvar> ATOMS=<group> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to analyze'
            },
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms that define the density envelope'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'In envelope',
                code: `# Analyze distances in high-density region
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
env: INENVELOPE ARG=distances ATOMS=1-100`
            }
        ],
        notes: [
            'INENVELOPE analyzes multicolvars in high-density regions.',
            'Regions are defined by atom density.',
            'Useful for analyzing properties in dense areas.',
            'Helpful for density-based spatial filtering.'
        ],
        related: ['AROUND', 'INSPHERE', 'INCYLINDER', 'DENSITY']
    },
    
    'INSPHERE': {
        name: 'INSPHERE',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This quantity can be used to calculate functions of the distribution of collective variables for the atoms that lie in a particular, user-specified part of of the cell.

INSPHERE calculates functions of multicolvar values for atoms that lie within a spherical region. The sphere is defined by a center and a radius.

INSPHERE is useful for:
- Analyzing multicolvars in spherical regions
- Computing properties in spheres
- Spherical spatial filtering
- Local region analysis`,
        syntax: 'INSPHERE ARG=<multicolvar> ATOMS=<group> RADIUS=<r> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to analyze'
            },
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms that define the center of the sphere'
            },
            {
                keyword: 'RADIUS',
                required: true,
                description: 'the radius of the sphere'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'In sphere',
                code: `# Analyze distances in sphere
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
sphere: INSPHERE ARG=distances ATOMS=1-10 RADIUS=5.0`
            }
        ],
        notes: [
            'INSPHERE analyzes multicolvars in a spherical region.',
            'The sphere is defined by center atoms and radius.',
            'Useful for analyzing properties in local spherical regions.',
            'Helpful for spherical spatial filtering.'
        ],
        related: ['AROUND', 'INCYLINDER', 'CAVITY']
    },
    
    // MultiColvar CVs - Batch 5 (43-52)
    'TETRAHEDRALPORE': {
        name: 'TETRAHEDRALPORE',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This quantity can be used to calculate functions of the distribution of collective variables for the atoms lie that lie in a box defined by the positions of four atoms at the corners of a tetrahedron.

TETRAHEDRALPORE calculates functions of multicolvar values for atoms that lie within a tetrahedral region defined by four corner atoms. This allows you to analyze multicolvar properties in a tetrahedral cavity.

TETRAHEDRALPORE is useful for:
- Analyzing multicolvars in tetrahedral regions
- Computing properties in tetrahedral pores
- Tetrahedral spatial filtering
- Pore analysis`,
        syntax: 'TETRAHEDRALPORE ARG=<multicolvar> ATOMS=<group> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to analyze'
            },
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the four atoms that define the corners of the tetrahedron (must be exactly 4 atoms)'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Tetrahedral pore',
                code: `# Analyze distances in tetrahedral pore
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
pore: TETRAHEDRALPORE ARG=distances ATOMS=10,11,12,13`
            }
        ],
        notes: [
            'TETRAHEDRALPORE analyzes multicolvars in a tetrahedral region.',
            'The four atoms define the corners of a tetrahedron.',
            'Useful for analyzing properties in tetrahedral pores.',
            'Helpful for tetrahedral spatial filtering.'
        ],
        related: ['CAVITY', 'AROUND', 'INSPHERE']
    },
    
    'GRADIENT': {
        name: 'GRADIENT',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the gradient of the average value of a multicolvar value.

GRADIENT calculates the spatial gradient of the average value of a multicolvar. This provides information about how the multicolvar value changes spatially.

GRADIENT is useful for:
- Calculating spatial gradients
- Analyzing spatial variations
- Computing gradient fields
- Spatial derivative analysis`,
        syntax: 'GRADIENT ARG=<multicolvar>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar for which to calculate the gradient'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Gradient',
                code: `# Gradient of distances
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
grad: GRADIENT ARG=distances`
            }
        ],
        notes: [
            'GRADIENT calculates the spatial gradient of multicolvar values.',
            'Provides information about spatial variations.',
            'Useful for analyzing gradient fields.',
            'Helpful for spatial derivative analysis.'
        ],
        related: ['LOCAL_AVERAGE', 'DISTANCES']
    },
    
    'INTERMOLECULARTORSIONS': {
        name: 'INTERMOLECULARTORSIONS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate torsion angles between vectors on adjacent molecules.

INTERMOLECULARTORSIONS calculates torsional angles between vectors defined on adjacent molecules. This is useful for analyzing the relative orientations of molecules.

INTERMOLECULARTORSIONS is useful for:
- Analyzing intermolecular orientations
- Computing torsion angles between molecules
- Studying molecular alignment
- Intermolecular structure analysis`,
        syntax: 'INTERMOLECULARTORSIONS ARG=<multicolvar>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar containing molecular vectors (e.g., from MOLECULES)'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Intermolecular torsions',
                code: `# Torsions between molecules
molecules: MOLECULES ATOMS1=1,3 ATOMS2=2,4
imt: INTERMOLECULARTORSIONS ARG=molecules`
            }
        ],
        notes: [
            'INTERMOLECULARTORSIONS calculates torsions between molecular vectors.',
            'Useful for analyzing intermolecular orientations.',
            'Requires molecular vectors from MOLECULES or similar.',
            'Helpful for studying molecular alignment.'
        ],
        related: ['MOLECULES', 'TORSIONS', 'PLANES']
    },
    
    'LOCAL_AVERAGE': {
        name: 'LOCAL_AVERAGE',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate averages over spherical regions centered on atoms.

LOCAL_AVERAGE calculates the local average of multicolvar values over spherical regions centered on each atom. This provides a smoothed, locally averaged version of the multicolvar.

LOCAL_AVERAGE is useful for:
- Calculating local averages
- Smoothing multicolvar values
- Computing spatially averaged properties
- Local environment averaging`,
        syntax: 'LOCAL_AVERAGE ARG=<multicolvar> ATOMS=<group> R_0=<r0>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to average'
            },
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms around which to calculate local averages'
            },
            {
                keyword: 'R_0',
                required: true,
                description: 'the radius of the spherical averaging region'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Local average',
                code: `# Local average of distances
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
la: LOCAL_AVERAGE ARG=distances ATOMS=1-10 R_0=5.0`
            }
        ],
        notes: [
            'LOCAL_AVERAGE calculates averages over spherical regions.',
            'Provides smoothed, locally averaged multicolvar values.',
            'Useful for spatial smoothing and local environment analysis.',
            'Helpful for computing spatially averaged properties.'
        ],
        related: ['GRADIENT', 'LOCAL_Q3', 'LOCAL_Q4', 'LOCAL_Q6']
    },
    
    'LOCAL_Q3': {
        name: 'LOCAL_Q3',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the local degree of order around an atoms by taking the average dot product between the q_3 vector on the central atom and the q_3 vector on the atoms in the first coordination sphere.

LOCAL_Q3 calculates the local order parameter by averaging the dot product of Q3 vectors between a central atom and its neighbors. This provides a measure of local structural order.

LOCAL_Q3 is useful for:
- Characterizing local order
- Analyzing local structural environments
- Computing local order parameters
- Local structure analysis`,
        syntax: 'LOCAL_Q3 ARG=<multicolvar> ATOMS=<group>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar containing Q3 values (from Q3 action)'
            },
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the central atoms for which to calculate local Q3'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Local Q3',
                code: `# Local Q3 order
q3: Q3 ATOMS=1-100
lq3: LOCAL_Q3 ARG=q3 ATOMS=1-10`
            }
        ],
        notes: [
            'LOCAL_Q3 calculates local order from Q3 vectors.',
            'Averages dot products between central atom and neighbors.',
            'Useful for characterizing local structural order.',
            'Requires Q3 multicolvar as input.'
        ],
        related: ['Q3', 'LOCAL_Q4', 'LOCAL_Q6', 'LOCAL_AVERAGE']
    },
    
    'LOCAL_Q4': {
        name: 'LOCAL_Q4',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the local degree of order around an atoms by taking the average dot product between the q_4 vector on the central atom and the q_4 vector on the atoms in the first coordination sphere.

LOCAL_Q4 calculates the local order parameter by averaging the dot product of Q4 vectors between a central atom and its neighbors. This provides a measure of local structural order, particularly for BCC structures.

LOCAL_Q4 is useful for:
- Characterizing local order
- Analyzing local structural environments
- Computing local order parameters
- Local structure analysis`,
        syntax: 'LOCAL_Q4 ARG=<multicolvar> ATOMS=<group>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar containing Q4 values (from Q4 action)'
            },
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the central atoms for which to calculate local Q4'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Local Q4',
                code: `# Local Q4 order
q4: Q4 ATOMS=1-100
lq4: LOCAL_Q4 ARG=q4 ATOMS=1-10`
            }
        ],
        notes: [
            'LOCAL_Q4 calculates local order from Q4 vectors.',
            'Averages dot products between central atom and neighbors.',
            'Particularly useful for BCC-like local order.',
            'Requires Q4 multicolvar as input.'
        ],
        related: ['Q4', 'LOCAL_Q3', 'LOCAL_Q6', 'LOCAL_AVERAGE']
    },
    
    'LOCAL_Q6': {
        name: 'LOCAL_Q6',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate the local degree of order around an atoms by taking the average dot product between the q_6 vector on the central atom and the q_6 vector on the atoms in the first coordination sphere.

LOCAL_Q6 calculates the local order parameter by averaging the dot product of Q6 vectors between a central atom and its neighbors. This provides a measure of local structural order, particularly for FCC and HCP structures.

LOCAL_Q6 is useful for:
- Characterizing local order
- Analyzing local structural environments
- Computing local order parameters
- Local structure analysis`,
        syntax: 'LOCAL_Q6 ARG=<multicolvar> ATOMS=<group>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar containing Q6 values (from Q6 action)'
            },
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the central atoms for which to calculate local Q6'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Local Q6',
                code: `# Local Q6 order
q6: Q6 ATOMS=1-100
lq6: LOCAL_Q6 ARG=q6 ATOMS=1-10`
            }
        ],
        notes: [
            'LOCAL_Q6 calculates local order from Q6 vectors.',
            'Averages dot products between central atom and neighbors.',
            'Particularly useful for FCC and HCP-like local order.',
            'Requires Q6 multicolvar as input.'
        ],
        related: ['Q6', 'LOCAL_Q3', 'LOCAL_Q4', 'LOCAL_AVERAGE']
    },
    
    'MCOLV_COMBINE': {
        name: 'MCOLV_COMBINE',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate linear combinations of multiple multicolvars.

MCOLV_COMBINE creates a new multicolvar by taking linear combinations of multiple multicolvars. This allows you to combine different multicolvar values with specified coefficients.

MCOLV_COMBINE is useful for:
- Combining multiple multicolvars
- Creating weighted combinations
- Computing linear combinations
- Multicolvar arithmetic`,
        syntax: 'MCOLV_COMBINE ARG=<cv1>,<cv2>,... COEFFICIENTS=<c1>,<c2>,...',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvars to combine'
            },
            {
                keyword: 'COEFFICIENTS',
                required: true,
                description: 'the coefficients for the linear combination (must match number of multicolvars)'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Combine multicolvars',
                code: `# Linear combination of multicolvars
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
angles: ANGLES ATOMS1=1,2,3 ATOMS2=4,5,6 ATOMS3=7,8,9
comb: MCOLV_COMBINE ARG=distances,angles COEFFICIENTS=1.0,2.0`
            }
        ],
        notes: [
            'MCOLV_COMBINE creates linear combinations of multicolvars.',
            'Coefficients must match the number of multicolvars.',
            'Useful for creating weighted combinations.',
            'Helpful for multicolvar arithmetic.'
        ],
        related: ['MCOLV_PRODUCT', 'COMBINE']
    },
    
    'MCOLV_PRODUCT': {
        name: 'MCOLV_PRODUCT',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate a product of multiple multicolvars.

MCOLV_PRODUCT creates a new multicolvar by taking the product of multiple multicolvars. This allows you to multiply different multicolvar values together.

MCOLV_PRODUCT is useful for:
- Multiplying multiple multicolvars
- Creating product combinations
- Computing products
- Multicolvar multiplication`,
        syntax: 'MCOLV_PRODUCT ARG=<cv1>,<cv2>,...',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvars to multiply'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Product of multicolvars',
                code: `# Product of multicolvars
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
angles: ANGLES ATOMS1=1,2,3 ATOMS2=4,5,6 ATOMS3=7,8,9
prod: MCOLV_PRODUCT ARG=distances,angles`
            }
        ],
        notes: [
            'MCOLV_PRODUCT creates products of multicolvars.',
            'Multiplies corresponding values from each multicolvar.',
            'Useful for creating product combinations.',
            'Helpful for multicolvar multiplication.'
        ],
        related: ['MCOLV_COMBINE', 'COMBINE']
    },
    
    'NLINKS': {
        name: 'NLINKS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate number of pairs of atoms/molecules that are linked.

NLINKS counts the number of pairs of atoms or molecules that are linked according to some criterion. This is useful for analyzing connectivity and linkages in the system.

NLINKS is useful for:
- Counting linked pairs
- Analyzing connectivity
- Computing number of links
- Linkage analysis`,
        syntax: 'NLINKS ARG=<multicolvar>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar that defines the links (e.g., distances below a threshold)'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Number of links',
                code: `# Count linked pairs
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
nlinks: NLINKS ARG=distances`
            }
        ],
        notes: [
            'NLINKS counts the number of linked pairs.',
            'Links are typically defined by distance or other criteria.',
            'Useful for analyzing connectivity in the system.',
            'Helpful for linkage analysis.'
        ],
        related: ['BRIDGE', 'COORDINATIONNUMBER', 'DISTANCES']
    },
    
    'PAMM': {
        name: 'PAMM',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Probabilistic analysis of molecular motifs.

PAMM (Probabilistic Analysis of Molecular Motifs) is a method for analyzing molecular structures by identifying and characterizing molecular motifs. It provides probabilistic measures of motif presence.

PAMM is useful for:
- Analyzing molecular motifs
- Characterizing molecular structures
- Probabilistic structure analysis
- Motif identification`,
        syntax: 'PAMM ATOMS=<group> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to perform PAMM analysis'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean PAMM value'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'PAMM analysis',
                code: `# PAMM molecular motifs
pamm: PAMM ATOMS=1-100 MEAN`
            }
        ],
        notes: [
            'PAMM performs probabilistic analysis of molecular motifs.',
            'Useful for identifying and characterizing molecular structures.',
            'Can calculate mean PAMM value across atoms.',
            'Helpful for motif identification and structure analysis.'
        ],
        related: ['ENVIRONMENTSIMILARITY', 'HBPAMM_SH']
    },
    
    // MultiColvar CVs - Batch 6 (54-60) - Final batch
    'POLYMER_ANGLES': {
        name: 'POLYMER_ANGLES',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate a function to investigate the relative orientations of polymer angles.

POLYMER_ANGLES calculates functions of the distribution of angles in polymer chains. This is useful for analyzing the relative orientations of polymer segments.

POLYMER_ANGLES is useful for:
- Analyzing polymer chain orientations
- Computing polymer angle distributions
- Studying polymer structure
- Polymer conformation analysis`,
        syntax: 'POLYMER_ANGLES ATOMS=<group> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms in the polymer chain'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean polymer angle'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Polymer angles',
                code: `# Polymer angle analysis
poly: POLYMER_ANGLES ATOMS=1-100 MEAN`
            }
        ],
        notes: [
            'POLYMER_ANGLES analyzes angles in polymer chains.',
            'Useful for studying polymer conformations.',
            'Can calculate mean polymer angle.',
            'Helpful for polymer structure analysis.'
        ],
        related: ['ANGLES', 'TORSIONS', 'MOLECULES']
    },
    
    'SMAC': {
        name: 'SMAC',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Calculate a variant on the SMAC collective variable.

SMAC (Shape Matching Algorithm for Collective variables) is a variant collective variable that measures structural similarity. It provides a measure of how similar the current structure is to a reference structure.

SMAC is useful for:
- Measuring structural similarity
- Comparing to reference structures
- Analyzing structural variations
- Structure comparison`,
        syntax: 'SMAC ATOMS=<group> [MEAN] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'the atoms for which to calculate SMAC'
            },
            {
                keyword: 'MEAN',
                required: false,
                description: 'calculate the mean SMAC value'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'SMAC collective variable',
                code: `# SMAC structural similarity
smac: SMAC ATOMS=1-100 MEAN`
            }
        ],
        notes: [
            'SMAC is a variant collective variable for structural similarity.',
            'Measures similarity to reference structures.',
            'Can calculate mean SMAC value.',
            'Helpful for structure comparison and analysis.'
        ],
        related: ['ENVIRONMENTSIMILARITY', 'RMSD', 'DRMSD']
    },
    
    'MTRANSFORM_BETWEEN': {
        name: 'MTRANSFORM_BETWEEN',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This action can be used to transform the colvar values calculated by a MultiColvar using a histogram bead.

MTRANSFORM_BETWEEN transforms multicolvar values using a histogram bead function. Values within a specified range are transformed, while values outside the range are set to zero.

MTRANSFORM_BETWEEN is useful for:
- Transforming multicolvar values
- Applying histogram-based transforms
- Range-based transformations
- Histogram bead filtering`,
        syntax: 'MTRANSFORM_BETWEEN ARG=<multicolvar> LOWER=<lower> UPPER=<upper>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to transform'
            },
            {
                keyword: 'LOWER',
                required: true,
                description: 'the lower bound of the transformation range'
            },
            {
                keyword: 'UPPER',
                required: true,
                description: 'the upper bound of the transformation range'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Transform between values',
                code: `# Transform distances between 2.0 and 5.0
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
trans: MTRANSFORM_BETWEEN ARG=distances LOWER=2.0 UPPER=5.0`
            }
        ],
        notes: [
            'MTRANSFORM_BETWEEN transforms multicolvar values using histogram beads.',
            'Values within the range are transformed, others set to zero.',
            'Useful for range-based transformations.',
            'Helpful for histogram-based filtering.'
        ],
        related: ['MTRANSFORM_LESS', 'MTRANSFORM_MORE', 'MFILTER_BETWEEN']
    },
    
    'MTRANSFORM_LESS': {
        name: 'MTRANSFORM_LESS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This action can be used to transform the colvar values calculated by a multicovar using a switching function.

MTRANSFORM_LESS transforms multicolvar values using a switching function. Values less than a tolerance are transformed, while values greater than the tolerance are set to zero.

MTRANSFORM_LESS is useful for:
- Transforming multicolvar values
- Applying switching function transforms
- Threshold-based transformations
- Switching function filtering`,
        syntax: 'MTRANSFORM_LESS ARG=<multicolvar> TOLERANCE=<tol>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to transform'
            },
            {
                keyword: 'TOLERANCE',
                required: true,
                description: 'the threshold value (values less than this are transformed)'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Transform less than threshold',
                code: `# Transform distances less than 3.0
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
trans: MTRANSFORM_LESS ARG=distances TOLERANCE=3.0`
            }
        ],
        notes: [
            'MTRANSFORM_LESS transforms multicolvar values using a switching function.',
            'Values below TOLERANCE are transformed, others set to zero.',
            'Useful for threshold-based transformations.',
            'Helpful for switching function-based filtering.'
        ],
        related: ['MTRANSFORM_BETWEEN', 'MTRANSFORM_MORE', 'MFILTER_LESS']
    },
    
    'MTRANSFORM_MORE': {
        name: 'MTRANSFORM_MORE',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

This action can be used to transform the colvar values calculated by a multicolvar using one minus a switching function.

MTRANSFORM_MORE transforms multicolvar values using one minus a switching function. Values greater than a tolerance are transformed, while values less than the tolerance are set to zero.

MTRANSFORM_MORE is useful for:
- Transforming multicolvar values
- Applying switching function transforms
- Threshold-based transformations
- Switching function filtering`,
        syntax: 'MTRANSFORM_MORE ARG=<multicolvar> TOLERANCE=<tol>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to transform'
            },
            {
                keyword: 'TOLERANCE',
                required: true,
                description: 'the threshold value (values greater than this are transformed)'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Transform more than threshold',
                code: `# Transform distances greater than 5.0
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
trans: MTRANSFORM_MORE ARG=distances TOLERANCE=5.0`
            }
        ],
        notes: [
            'MTRANSFORM_MORE transforms multicolvar values using one minus a switching function.',
            'Values above TOLERANCE are transformed, others set to zero.',
            'Useful for threshold-based transformations.',
            'Helpful for switching function-based filtering.'
        ],
        related: ['MTRANSFORM_BETWEEN', 'MTRANSFORM_LESS', 'MFILTER_MORE']
    },
    
    'LWALLS': {
        name: 'LWALLS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Add LOWER_WALLS restraints on all the multicolvar values.

LWALLS adds lower wall restraints to all values calculated by a multicolvar. This prevents the multicolvar values from going below a specified threshold.

LWALLS is useful for:
- Adding lower wall restraints
- Preventing values from going too low
- Restraining multicolvar distributions
- Lower boundary enforcement`,
        syntax: 'LWALLS ARG=<multicolvar> AT=<value> KAPPA=<kappa>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to which to apply lower walls'
            },
            {
                keyword: 'AT',
                required: true,
                description: 'the position of the lower wall'
            },
            {
                keyword: 'KAPPA',
                required: true,
                description: 'the force constant for the wall'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Lower walls',
                code: `# Lower walls on distances
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
lwalls: LWALLS ARG=distances AT=2.0 KAPPA=10.0`
            }
        ],
        notes: [
            'LWALLS adds lower wall restraints to all multicolvar values.',
            'Prevents values from going below the wall position.',
            'Useful for enforcing lower boundaries.',
            'Helpful for restraining multicolvar distributions.'
        ],
        related: ['UWALLS', 'LOWER_WALLS', 'RESTRAINT']
    },
    
    'UWALLS': {
        name: 'UWALLS',
        category: 'MultiColvar',
        module: 'multicolvar',
        description: `This is part of the multicolvar module

Add UPPER_WALL restraint on all the multicolvar values.

UWALLS adds upper wall restraints to all values calculated by a multicolvar. This prevents the multicolvar values from going above a specified threshold.

UWALLS is useful for:
- Adding upper wall restraints
- Preventing values from going too high
- Restraining multicolvar distributions
- Upper boundary enforcement`,
        syntax: 'UWALLS ARG=<multicolvar> AT=<value> KAPPA=<kappa>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'the multicolvar to which to apply upper walls'
            },
            {
                keyword: 'AT',
                required: true,
                description: 'the position of the upper wall'
            },
            {
                keyword: 'KAPPA',
                required: true,
                description: 'the force constant for the wall'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Upper walls',
                code: `# Upper walls on distances
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4
uwalls: UWALLS ARG=distances AT=10.0 KAPPA=10.0`
            }
        ],
        notes: [
            'UWALLS adds upper wall restraints to all multicolvar values.',
            'Prevents values from going above the wall position.',
            'Useful for enforcing upper boundaries.',
            'Helpful for restraining multicolvar distributions.'
        ],
        related: ['LWALLS', 'UPPER_WALLS', 'RESTRAINT']
    },
    // Contact Matrix CVs - Adjacency Matrices
    'ALIGNED_MATRIX': {
        module: 'Contact Matrix',
        description: [
            'Adjacency matrix in which two molecules are adjacent if they are within a certain cutoff and if they have the same orientation.',
            'This CV is useful for identifying aligned molecular pairs based on both distance and orientation criteria.',
            'The orientation matching ensures that molecules are not just close but also properly aligned.',
            'Useful for studying molecular alignment in systems like liquid crystals or aligned molecular assemblies.'
        ],
        syntax: 'ALIGNED_MATRIX GROUPA=<group1> GROUPB=<group2> SWITCH=<switch> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'First group of atoms/molecules to consider for adjacency.'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'Second group of atoms/molecules to consider for adjacency.'
            },
            {
                keyword: 'SWITCH',
                required: true,
                description: 'Switching function that determines the cutoff and smoothness of the adjacency criterion.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate aligned matrix between two groups',
                code: `# Aligned matrix
am: ALIGNED_MATRIX GROUPA=1-10 GROUPB=11-20 SWITCH={RATIONAL R_0=5.0 D_0=0.5}
PRINT ARG=am FILE=aligned_matrix.dat`
            }
        ],
        notes: [
            'The alignment criterion requires both distance and orientation matching.',
            'Useful for identifying aligned molecular pairs in complex systems.',
            'The switching function controls the smoothness of the adjacency transition.'
        ],
        related: ['CONTACT_MATRIX', 'SMAC_MATRIX', 'MOLECULES']
    },
    'CONTACT_MATRIX': {
        module: 'Contact Matrix',
        description: [
            'Adjacency matrix in which two atoms are adjacent if they are within a certain cutoff.',
            'This is the most basic contact matrix, defining adjacency purely based on distance.',
            'The contact matrix is an N×N matrix where element (i,j) indicates if atoms i and j are in contact.',
            'Useful for analyzing protein-protein contacts, protein-ligand interactions, and structural clustering.'
        ],
        syntax: 'CONTACT_MATRIX GROUPA=<group1> GROUPB=<group2> SWITCH=<switch> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'First group of atoms to consider for contact.'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'Second group of atoms to consider for contact.'
            },
            {
                keyword: 'SWITCH',
                required: true,
                description: 'Switching function that determines the contact cutoff distance and smoothness.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate contact matrix for a protein',
                code: `# Contact matrix
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0 D_0=0.5}
PRINT ARG=cm FILE=contact_matrix.dat`
            },
            {
                title: 'Use contact matrix for clustering',
                code: `# Contact matrix and clustering
cm: CONTACT_MATRIX GROUPA=1-200 GROUPB=1-200 SWITCH={RATIONAL R_0=5.0}
cl: DFSCLUSTERING MATRIX=cm
PRINT ARG=cl FILE=clusters.dat`
            }
        ],
        notes: [
            'The contact matrix is symmetric if GROUPA and GROUPB are the same.',
            'The switching function controls how smoothly contacts are defined.',
            'Contact matrices are fundamental for many clustering and analysis algorithms.'
        ],
        related: ['ALIGNED_MATRIX', 'HBOND_MATRIX', 'DFSCLUSTERING']
    },
    'HBOND_MATRIX': {
        module: 'Contact Matrix',
        description: [
            'Adjacency matrix in which two atoms are adjacent if there is a hydrogen bond between them.',
            'This CV identifies hydrogen bonds based on distance and angle criteria.',
            'Useful for analyzing hydrogen bond networks in proteins, DNA, and other biomolecules.',
            'The hydrogen bond matrix can reveal important structural features and interactions.'
        ],
        syntax: 'HBOND_MATRIX GROUPA=<group1> GROUPB=<group2> [SWITCH=<switch>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'First group of atoms (typically hydrogen bond donors).'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'Second group of atoms (typically hydrogen bond acceptors).'
            },
            {
                keyword: 'SWITCH',
                required: false,
                description: 'Optional switching function for hydrogen bond distance cutoff.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate hydrogen bond matrix',
                code: `# Hydrogen bond matrix
hbm: HBOND_MATRIX GROUPA=1-100 GROUPB=1-100
PRINT ARG=hbm FILE=hbond_matrix.dat`
            }
        ],
        notes: [
            'Hydrogen bonds are identified based on distance and angle criteria.',
            'Useful for analyzing protein secondary structure and stability.',
            'Can be combined with clustering to identify hydrogen bond networks.'
        ],
        related: ['HBPAMM_MATRIX', 'CONTACT_MATRIX', 'HBOND']
    },
    'HBPAMM_MATRIX': {
        module: 'Contact Matrix',
        description: [
            'Adjacency matrix in which two electronegative atoms are adjacent if they are hydrogen bonded.',
            'This CV focuses on electronegative atoms (like O, N) that participate in hydrogen bonds.',
            'Useful for analyzing hydrogen bond networks between specific atom types.',
            'Particularly relevant for studying protein structure and nucleic acid interactions.'
        ],
        syntax: 'HBPAMM_MATRIX GROUPA=<group1> GROUPB=<group2> [SWITCH=<switch>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'First group of electronegative atoms.'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'Second group of electronegative atoms.'
            },
            {
                keyword: 'SWITCH',
                required: false,
                description: 'Optional switching function for hydrogen bond cutoff.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate HBPAMM matrix for electronegative atoms',
                code: `# HBPAMM matrix
hpmm: HBPAMM_MATRIX GROUPA=1-50 GROUPB=51-100
PRINT ARG=hpmm FILE=hbamm_matrix.dat`
            }
        ],
        notes: [
            'Focuses specifically on electronegative atoms in hydrogen bonds.',
            'Useful for analyzing specific types of hydrogen bond interactions.',
            'Can reveal patterns in hydrogen bond networks.'
        ],
        related: ['HBOND_MATRIX', 'HBPAMM_SH', 'CONTACT_MATRIX']
    },
    'SMAC_MATRIX': {
        module: 'Contact Matrix',
        description: [
            'Adjacency matrix in which two molecules are adjacent if they are within a certain cutoff and if the angle between them is within certain ranges.',
            'This CV combines distance and angular criteria to define molecular adjacency.',
            'Useful for identifying molecules with specific relative orientations.',
            'Particularly relevant for studying molecular assemblies and liquid crystal systems.'
        ],
        syntax: 'SMAC_MATRIX GROUPA=<group1> GROUPB=<group2> SWITCH=<switch> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'First group of molecules.'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'Second group of molecules.'
            },
            {
                keyword: 'SWITCH',
                required: true,
                description: 'Switching function for distance cutoff and angular criteria.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate SMAC matrix',
                code: `# SMAC matrix
smacm: SMAC_MATRIX GROUPA=1-20 GROUPB=21-40 SWITCH={RATIONAL R_0=6.0 D_0=0.5}
PRINT ARG=smacm FILE=smac_matrix.dat`
            }
        ],
        notes: [
            'Combines distance and angular criteria for molecular adjacency.',
            'Useful for identifying aligned or oriented molecular pairs.',
            'Can reveal structural patterns in molecular assemblies.'
        ],
        related: ['ALIGNED_MATRIX', 'SMAC', 'MOLECULES']
    },
    'TOPOLOGY_MATRIX': {
        module: 'Contact Matrix',
        description: [
            'Adjacency matrix in which two atoms are adjacent if they are connected topologically.',
            'This CV defines adjacency based on covalent bonds or other topological connections.',
            'Useful for analyzing molecular topology and connectivity patterns.',
            'Particularly relevant for studying polymer systems and molecular networks.'
        ],
        syntax: 'TOPOLOGY_MATRIX GROUPA=<group1> GROUPB=<group2> [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'GROUPA',
                required: true,
                description: 'First group of atoms.'
            },
            {
                keyword: 'GROUPB',
                required: true,
                description: 'Second group of atoms.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate topology matrix',
                code: `# Topology matrix
tm: TOPOLOGY_MATRIX GROUPA=1-100 GROUPB=1-100
PRINT ARG=tm FILE=topology_matrix.dat`
            }
        ],
        notes: [
            'Defines adjacency based on topological connectivity, not spatial proximity.',
            'Useful for analyzing molecular structure and connectivity.',
            'Can be combined with spatial contact matrices for comprehensive analysis.'
        ],
        related: ['CONTACT_MATRIX', 'TOPOLOGY']
    },
    // Contact Matrix CVs - Operations
    'CLUSTER_WITHSURFACE': {
        module: 'Contact Matrix',
        description: [
            'Take a connected component that was found using a clustering algorithm and create a new cluster that contains those atoms that are in the cluster together with those atoms that are within a certain cutoff of the cluster.',
            'This CV expands clusters to include surface atoms within a specified distance.',
            'Useful for analyzing cluster surfaces and including nearby atoms in cluster analysis.',
            'Helps in understanding cluster boundaries and surface properties.'
        ],
        syntax: 'CLUSTER_WITHSURFACE CLUSTERS=<clusters> DATA=<data> CUTOFF=<cutoff>',
        options: [
            {
                keyword: 'CLUSTERS',
                required: true,
                default: 'none',
                description: 'The clustering object that contains the connected components.'
            },
            {
                keyword: 'DATA',
                required: true,
                default: 'none',
                description: 'The data (typically a contact matrix) used to determine surface atoms.'
            },
            {
                keyword: 'CUTOFF',
                required: true,
                default: 'none',
                description: 'Distance cutoff for including surface atoms in the expanded cluster.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Expand cluster with surface atoms',
                code: `# Cluster with surface
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0}
cl: DFSCLUSTERING MATRIX=cm
cws: CLUSTER_WITHSURFACE CLUSTERS=cl DATA=cm CUTOFF=3.0
PRINT ARG=cws FILE=cluster_surface.dat`
            }
        ],
        notes: [
            'Expands clusters to include nearby surface atoms.',
            'Useful for analyzing cluster boundaries and surface properties.',
            'The cutoff determines how far from the cluster surface atoms are included.'
        ],
        related: ['DFSCLUSTERING', 'CLUSTER_PROPERTIES', 'CONTACT_MATRIX']
    },
    'COLUMNSUMS': {
        module: 'Contact Matrix',
        description: [
            'Sum the columns of a contact matrix.',
            'This CV calculates the sum of each column in the contact matrix.',
            'Useful for analyzing the total number of contacts for each atom.',
            'Can reveal atoms with many or few contacts, indicating central or peripheral positions.'
        ],
        syntax: 'COLUMNSUMS MATRIX=<matrix>',
        options: [
            {
                keyword: 'MATRIX',
                required: true,
                default: 'none',
                description: 'The contact matrix to analyze.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate column sums of contact matrix',
                code: `# Column sums
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0}
cs: COLUMNSUMS MATRIX=cm
PRINT ARG=cs FILE=column_sums.dat`
            }
        ],
        notes: [
            'Column sums indicate the total number of contacts for each atom.',
            'Useful for identifying highly connected or isolated atoms.',
            'Can be used for analyzing network properties.'
        ],
        related: ['ROWSUMS', 'CONTACT_MATRIX', 'DFSCLUSTERING']
    },
    'DFSCLUSTERING': {
        module: 'Contact Matrix',
        description: [
            'Find the connected components of the matrix using the depth first search clustering algorithm.',
            'This CV identifies clusters of atoms that are connected through the contact matrix.',
            'Useful for identifying groups of interacting atoms or molecules.',
            'The DFS algorithm efficiently finds all connected components in the graph.'
        ],
        syntax: 'DFSCLUSTERING MATRIX=<matrix>',
        options: [
            {
                keyword: 'MATRIX',
                required: true,
                default: 'none',
                description: 'The contact matrix to analyze for connected components.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Find clusters using DFS',
                code: `# DFS clustering
cm: CONTACT_MATRIX GROUPA=1-200 GROUPB=1-200 SWITCH={RATIONAL R_0=5.0}
dfs: DFSCLUSTERING MATRIX=cm
PRINT ARG=dfs FILE=clusters.dat`
            },
            {
                title: 'Analyze cluster properties',
                code: `# Clustering and analysis
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0}
cl: DFSCLUSTERING MATRIX=cm
cp: CLUSTER_PROPERTIES CLUSTERS=cl DATA=cm
PRINT ARG=cp FILE=cluster_props.dat`
            }
        ],
        notes: [
            'DFS clustering efficiently finds all connected components.',
            'Useful for identifying groups of interacting atoms.',
            'Can be combined with other CVs to analyze cluster properties.'
        ],
        related: ['CONTACT_MATRIX', 'CLUSTER_PROPERTIES', 'CLUSTER_DISTRIBUTION']
    },
    'ROWSUMS': {
        module: 'Contact Matrix',
        description: [
            'Sum the rows of an adjacency matrix.',
            'This CV calculates the sum of each row in the contact matrix.',
            'Useful for analyzing the total number of contacts for each atom.',
            'For symmetric matrices, row sums equal column sums.'
        ],
        syntax: 'ROWSUMS MATRIX=<matrix>',
        options: [
            {
                keyword: 'MATRIX',
                required: true,
                default: 'none',
                description: 'The adjacency matrix to analyze.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate row sums of contact matrix',
                code: `# Row sums
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0}
rs: ROWSUMS MATRIX=cm
PRINT ARG=rs FILE=row_sums.dat`
            }
        ],
        notes: [
            'Row sums indicate the total number of contacts for each atom.',
            'For symmetric contact matrices, row sums equal column sums.',
            'Useful for analyzing network connectivity and atom centrality.'
        ],
        related: ['COLUMNSUMS', 'CONTACT_MATRIX', 'DFSCLUSTERING']
    },
    'SPRINT': {
        module: 'Contact Matrix',
        description: [
            'Calculate SPRINT topological variables from an adjacency matrix.',
            'SPRINT (Shortest Path-based Reaction coordinate for INTerfaces) is a method for analyzing interfaces and surfaces.',
            'This CV calculates topological variables based on shortest paths in the contact matrix graph.',
            'Useful for analyzing interface formation, surface properties, and structural transitions.'
        ],
        syntax: 'SPRINT MATRIX=<matrix>',
        options: [
            {
                keyword: 'MATRIX',
                required: true,
                default: 'none',
                description: 'The adjacency matrix to analyze using SPRINT algorithm.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate SPRINT variables',
                code: `# SPRINT
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0}
sprint: SPRINT MATRIX=cm
PRINT ARG=sprint FILE=sprint.dat`
            }
        ],
        notes: [
            'SPRINT calculates topological variables based on shortest paths.',
            'Useful for analyzing interfaces and surface properties.',
            'Can reveal structural transitions and interface formation.'
        ],
        related: ['CONTACT_MATRIX', 'DFSCLUSTERING', 'CLUSTER_PROPERTIES']
    },
    // Contact Matrix CVs - Connected Components
    'CLUSTER_DIAMETER': {
        module: 'Contact Matrix',
        description: [
            'Print out the diameter of one of the connected components.',
            'The diameter is the maximum distance between any two atoms in the cluster.',
            'Useful for characterizing cluster size and compactness.',
            'Larger diameters indicate more extended clusters.'
        ],
        syntax: 'CLUSTER_DIAMETER CLUSTERS=<clusters> CLUSTER=<cluster_id>',
        options: [
            {
                keyword: 'CLUSTERS',
                required: true,
                default: 'none',
                description: 'The clustering object that contains the connected components.'
            },
            {
                keyword: 'CLUSTER',
                required: true,
                default: 'none',
                description: 'The ID of the cluster to analyze (typically 1 for the largest cluster).'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate cluster diameter',
                code: `# Cluster diameter
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0}
cl: DFSCLUSTERING MATRIX=cm
cd: CLUSTER_DIAMETER CLUSTERS=cl CLUSTER=1
PRINT ARG=cd FILE=cluster_diameter.dat`
            }
        ],
        notes: [
            'The diameter is the maximum distance between any two atoms in the cluster.',
            'Useful for characterizing cluster size and shape.',
            'Can be used to monitor cluster growth or shrinkage during simulations.'
        ],
        related: ['DFSCLUSTERING', 'CLUSTER_NATOMS', 'CLUSTER_PROPERTIES']
    },
    'CLUSTER_DISTRIBUTION': {
        module: 'Contact Matrix',
        description: [
            'Calculate functions of the distribution of properties in your connected components.',
            'This CV analyzes how properties are distributed across clusters.',
            'Useful for studying nucleation, phase transitions, and cluster properties.',
            'Can calculate mean, variance, and other statistical properties of cluster distributions.'
        ],
        syntax: 'CLUSTER_DISTRIBUTION CLUSTERS=<clusters> DATA=<data>',
        options: [
            {
                keyword: 'CLUSTERS',
                required: true,
                default: 'none',
                description: 'The clustering object that contains the connected components.'
            },
            {
                keyword: 'DATA',
                required: true,
                default: 'none',
                description: 'The data (typically a contact matrix or other CV) to analyze within clusters.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate cluster distribution',
                code: `# Cluster distribution
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0}
cl: DFSCLUSTERING MATRIX=cm
cdist: CLUSTER_DISTRIBUTION CLUSTERS=cl DATA=cm
PRINT ARG=cdist FILE=cluster_distribution.dat`
            }
        ],
        notes: [
            'Analyzes property distributions across clusters.',
            'Useful for studying nucleation and phase transitions.',
            'Can reveal how properties vary between different clusters.'
        ],
        related: ['DFSCLUSTERING', 'CLUSTER_PROPERTIES', 'CLUSTER_NATOMS']
    },
    'CLUSTER_NATOMS': {
        module: 'Contact Matrix',
        description: [
            'Gives the number of atoms in the connected component.',
            'This CV counts how many atoms belong to a specific cluster.',
            'Useful for monitoring cluster size and growth.',
            'Can be used to identify the largest or smallest clusters in the system.'
        ],
        syntax: 'CLUSTER_NATOMS CLUSTERS=<clusters> CLUSTER=<cluster_id>',
        options: [
            {
                keyword: 'CLUSTERS',
                required: true,
                default: 'none',
                description: 'The clustering object that contains the connected components.'
            },
            {
                keyword: 'CLUSTER',
                required: true,
                default: 'none',
                description: 'The ID of the cluster to analyze (typically 1 for the largest cluster).'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Count atoms in cluster',
                code: `# Cluster number of atoms
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0}
cl: DFSCLUSTERING MATRIX=cm
cna: CLUSTER_NATOMS CLUSTERS=cl CLUSTER=1
PRINT ARG=cna FILE=cluster_natoms.dat`
            }
        ],
        notes: [
            'Counts the number of atoms in a specific cluster.',
            'Useful for monitoring cluster size and growth.',
            'Can be used to track cluster evolution during simulations.'
        ],
        related: ['DFSCLUSTERING', 'CLUSTER_DIAMETER', 'CLUSTER_PROPERTIES']
    },
    'CLUSTER_PROPERTIES': {
        module: 'Contact Matrix',
        description: [
            'Calculate properties of the distribution of some quantities that are part of a connected component.',
            'This CV computes various statistical properties of quantities within clusters.',
            'Useful for analyzing cluster characteristics like size, shape, and internal properties.',
            'Can calculate mean, variance, moments, and other statistical measures.'
        ],
        syntax: 'CLUSTER_PROPERTIES CLUSTERS=<clusters> DATA=<data>',
        options: [
            {
                keyword: 'CLUSTERS',
                required: true,
                default: 'none',
                description: 'The clustering object that contains the connected components.'
            },
            {
                keyword: 'DATA',
                required: true,
                default: 'none',
                description: 'The data (typically a contact matrix or other CV) to analyze within clusters.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Calculate cluster properties',
                code: `# Cluster properties
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0}
cl: DFSCLUSTERING MATRIX=cm
cp: CLUSTER_PROPERTIES CLUSTERS=cl DATA=cm
PRINT ARG=cp FILE=cluster_props.dat`
            },
            {
                title: 'Analyze multiple cluster properties',
                code: `# Multiple cluster analyses
cm: CONTACT_MATRIX GROUPA=1-200 GROUPB=1-200 SWITCH={RATIONAL R_0=5.0}
cl: DFSCLUSTERING MATRIX=cm
cp: CLUSTER_PROPERTIES CLUSTERS=cl DATA=cm
cna: CLUSTER_NATOMS CLUSTERS=cl CLUSTER=1
cd: CLUSTER_DIAMETER CLUSTERS=cl CLUSTER=1
PRINT ARG=cp,cna,cd FILE=cluster_analysis.dat`
            }
        ],
        notes: [
            'Calculates statistical properties of quantities within clusters.',
            'Useful for comprehensive cluster analysis.',
            'Can reveal cluster characteristics and internal structure.'
        ],
        related: ['DFSCLUSTERING', 'CLUSTER_DISTRIBUTION', 'CLUSTER_NATOMS']
    },
    'DUMPGRAPH': {
        module: 'Contact Matrix',
        description: [
            'Write out the connectivity of the nodes in the graph in dot format.',
            'This CV outputs the graph structure in Graphviz dot format for visualization.',
            'Useful for visualizing cluster connectivity and graph structure.',
            'The output can be processed with Graphviz tools to create visual representations.'
        ],
        syntax: 'DUMPGRAPH CLUSTERS=<clusters> FILE=<file>',
        options: [
            {
                keyword: 'CLUSTERS',
                required: true,
                default: 'none',
                description: 'The clustering object that contains the connected components.'
            },
            {
                keyword: 'FILE',
                required: true,
                default: 'none',
                description: 'The output file name for the graph in dot format.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Dump graph to file',
                code: `# Dump graph
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0}
cl: DFSCLUSTERING MATRIX=cm
dg: DUMPGRAPH CLUSTERS=cl FILE=graph.dot`
            }
        ],
        notes: [
            'Outputs graph structure in Graphviz dot format.',
            'Useful for visualizing cluster connectivity.',
            'Can be processed with Graphviz tools (dot, neato, etc.) to create visualizations.'
        ],
        related: ['DFSCLUSTERING', 'OUTPUT_CLUSTER', 'CONTACT_MATRIX']
    },
    'OUTPUT_CLUSTER': {
        module: 'Contact Matrix',
        description: [
            'Output the indices of the atoms in one of the clusters identified by a clustering object.',
            'This CV writes the atom indices belonging to a specific cluster to a file.',
            'Useful for extracting cluster information for further analysis or visualization.',
            'Can be used to output cluster coordinates or other cluster-specific data.'
        ],
        syntax: 'OUTPUT_CLUSTER CLUSTERS=<clusters> CLUSTER=<cluster_id> FILE=<file>',
        options: [
            {
                keyword: 'CLUSTERS',
                required: true,
                default: 'none',
                description: 'The clustering object that contains the connected components.'
            },
            {
                keyword: 'CLUSTER',
                required: true,
                default: 'none',
                description: 'The ID of the cluster to output (typically 1 for the largest cluster).'
            },
            {
                keyword: 'FILE',
                required: true,
                default: 'none',
                description: 'The output file name for the cluster atom indices.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Output cluster atom indices',
                code: `# Output cluster
cm: CONTACT_MATRIX GROUPA=1-100 GROUPB=1-100 SWITCH={RATIONAL R_0=4.0}
cl: DFSCLUSTERING MATRIX=cm
oc: OUTPUT_CLUSTER CLUSTERS=cl CLUSTER=1 FILE=cluster.pdb`
            },
            {
                title: 'Output multiple clusters',
                code: `# Output multiple clusters
cm: CONTACT_MATRIX GROUPA=1-200 GROUPB=1-200 SWITCH={RATIONAL R_0=5.0}
cl: DFSCLUSTERING MATRIX=cm
oc1: OUTPUT_CLUSTER CLUSTERS=cl CLUSTER=1 FILE=cluster1.pdb
oc2: OUTPUT_CLUSTER CLUSTERS=cl CLUSTER=2 FILE=cluster2.pdb`
            }
        ],
        notes: [
            'Outputs atom indices for a specific cluster to a file.',
            'Useful for extracting cluster information for analysis.',
            'Can be used to create PDB files or other formats for visualization.'
        ],
        related: ['DFSCLUSTERING', 'CLUSTER_PROPERTIES', 'DUMPGRAPH']
    },
    // Additional Modules CVs
    'ANN': {
        module: 'Additional Modules',
        description: [
            'Artificial Neural Network function. This CV uses a neural network to compute collective variables from atomic coordinates.',
            'The neural network is trained to map atomic positions to a lower-dimensional representation.',
            'Useful for complex systems where traditional CVs are insufficient.',
            'Requires a pre-trained neural network model file.'
        ],
        syntax: 'ANN ARG=<cv1>,<cv2>,... FILE=<network_file>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'Input collective variables that will be used as input to the neural network.'
            },
            {
                keyword: 'FILE',
                required: true,
                description: 'Path to the neural network model file (typically .pb format for TensorFlow).'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Use ANN with distance CVs',
                code: `# ANN collective variable
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
ann: ANN ARG=d1,d2 FILE=network.pb
PRINT ARG=ann FILE=ann.dat`
            }
        ],
        notes: [
            'Requires a pre-trained neural network model.',
            'The model file format depends on the backend (TensorFlow, PyTorch, etc.).',
            'Useful for complex free energy landscapes where traditional CVs fail.'
        ],
        related: ['PYTORCH', 'CUSTOM', 'COMBINE']
    },
    'DRR': {
        module: 'Additional Modules',
        description: [
            'Dynamic Reference Restraint. This is part of the Extended-System Adaptive Biasing Force (eABF) module.',
            'DRR is used for calculating Potential of Mean Force (PMF) along collective variables.',
            'It applies a dynamic restraint that adapts during the simulation.',
            'Useful for free energy calculations and enhanced sampling.'
        ],
        syntax: 'DRR ARG=<cv> [KAPPA=<kappa>] [TAU=<tau>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'The collective variable to apply the dynamic reference restraint to.'
            },
            {
                keyword: 'KAPPA',
                required: false,
                default: '100.0',
                description: 'Force constant for the dynamic restraint (in energy units).'
            },
            {
                keyword: 'TAU',
                required: false,
                default: '0.1',
                description: 'Time constant for the dynamic reference update.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Apply DRR to a distance CV',
                code: `# DRR
d: DISTANCE ATOMS=1,2
drr: DRR ARG=d KAPPA=100.0 TAU=0.1
PRINT ARG=drr FILE=drr.dat`
            }
        ],
        notes: [
            'Part of the Extended-System Adaptive Biasing Force module.',
            'Useful for PMF calculations along collective variables.',
            'The dynamic reference adapts during the simulation.'
        ],
        related: ['ABMD', 'METAD', 'RESTRAINT']
    },
    'FISST': {
        module: 'Additional Modules',
        description: [
            'Infinite Switch Simulated Tempering in Force. Enhanced sampling method that uses force-based tempering.',
            'FISST applies a temperature-like scaling to forces rather than velocities.',
            'Useful for systems where temperature-based methods are inefficient.',
            'Can accelerate sampling in complex energy landscapes.'
        ],
        syntax: 'FISST ARG=<cv> TEMP=<temp> [KAPPA=<kappa>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'The collective variable to apply FISST to.'
            },
            {
                keyword: 'TEMP',
                required: true,
                description: 'Target temperature for the force-based tempering (in Kelvin).'
            },
            {
                keyword: 'KAPPA',
                required: false,
                default: '10.0',
                description: 'Force constant for the FISST bias (in energy units).'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Apply FISST to a distance CV',
                code: `# FISST
d: DISTANCE ATOMS=1,2
fisst: FISST ARG=d TEMP=300.0 KAPPA=10.0
PRINT ARG=fisst FILE=fisst.dat`
            }
        ],
        notes: [
            'Uses force-based tempering instead of velocity scaling.',
            'Can be more efficient than temperature-based methods for some systems.',
            'Requires careful tuning of the temperature and force constant parameters.'
        ],
        related: ['METAD', 'PBMETAD', 'OPES']
    },
    'FUNNEL': {
        module: 'Additional Modules',
        description: [
            'Funnel-Metadynamics collective variable and bias action. Used for performing Funnel-Metadynamics on Molecular Dynamics simulations.',
            'Funnel-Metadynamics is designed for studying binding/unbinding processes.',
            'Uses a funnel-shaped restraint to guide the system along the binding pathway.',
            'Particularly useful for studying protein-ligand interactions and drug binding.'
        ],
        syntax: 'FUNNEL ARG=<cv> [ATOMS=<atoms>] [REFERENCE=<ref>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'The collective variable to apply funnel-metadynamics to.'
            },
            {
                keyword: 'ATOMS',
                required: false,
                description: 'Atoms to include in the funnel restraint.'
            },
            {
                keyword: 'REFERENCE',
                required: false,
                description: 'Reference structure file for defining the funnel geometry.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Funnel-Metadynamics for binding study',
                code: `# Funnel-Metadynamics
d: DISTANCE ATOMS=1,100
funnel: FUNNEL ARG=d ATOMS=1-50 REFERENCE=bound.pdb
PRINT ARG=funnel FILE=funnel.dat`
            }
        ],
        notes: [
            'Designed specifically for binding/unbinding processes.',
            'Uses a funnel-shaped restraint to guide the system.',
            'Particularly useful for protein-ligand and drug binding studies.'
        ],
        related: ['METAD', 'PBMETAD', 'RESTRAINT']
    },
    'MAZE': {
        module: 'Additional Modules',
        description: [
            'Enhanced sampling methods for ligand unbinding from protein tunnels. This module implements CVs and biases for studying ligand escape pathways.',
            'MAZE is designed to study how ligands escape from buried binding sites through tunnels.',
            'Uses specialized CVs to describe tunnel geometry and ligand position.',
            'Useful for understanding drug unbinding mechanisms and tunnel dynamics.'
        ],
        syntax: 'MAZE ARG=<cv> [ATOMS=<atoms>] [REFERENCE=<ref>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'The collective variable describing the ligand position or tunnel geometry.'
            },
            {
                keyword: 'ATOMS',
                required: false,
                description: 'Atoms to include in the MAZE analysis (typically ligand and tunnel atoms).'
            },
            {
                keyword: 'REFERENCE',
                required: false,
                description: 'Reference structure file for defining the tunnel geometry.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'MAZE for ligand unbinding',
                code: `# MAZE
d: DISTANCE ATOMS=1,100
maze: MAZE ARG=d ATOMS=1-50 REFERENCE=tunnel.pdb
PRINT ARG=maze FILE=maze.dat`
            }
        ],
        notes: [
            'Designed specifically for studying ligand escape from protein tunnels.',
            'Uses specialized CVs to describe tunnel geometry.',
            'Useful for understanding drug unbinding mechanisms.'
        ],
        related: ['FUNNEL', 'METAD', 'DISTANCE']
    },
    'OPES': {
        module: 'opes',
        description: [
            'On-the-fly Probability Enhanced Sampling (OPES_METAD). This action samples target distributions defined via their marginal over some collective variables (CVs).',
            'By default OPES_METAD targets the well-tempered distribution, p^WT(s) ∝ [P(s)]^(1/γ), where γ is known as BIASFACTOR.',
            'OPES_METAD optimizes the bias on-the-fly, with a given PACE. It does so by reweighting via kernel density estimation the unbiased distribution in the CV space.',
            'A compression algorithm is used to prevent the number of kernels from growing linearly with the simulation time.',
            'The parameter BARRIER should be set to be at least equal to the highest free energy barrier you wish to overcome.'
        ],
        syntax: 'OPES_METAD ARG=<cv1>,<cv2>,... PACE=<pace> BARRIER=<barrier> [BIASFACTOR=<factor>] [STATE_WFILE=<file>] [STATE_WSTRIDE=<stride>]',
        options: [
            {
                keyword: 'ARG',
                required: false,
                description: 'the input for this action is the scalar output from one or more other actions.'
            },
            {
                keyword: 'PACE',
                required: true,
                description: 'the frequency for kernel deposition.'
            },
            {
                keyword: 'BARRIER',
                required: true,
                description: 'the free energy barrier to be overcome. It is used to set BIASFACTOR, EPSILON, and KERNEL_CUTOFF to reasonable values.'
            },
            {
                keyword: 'BIASFACTOR',
                required: false,
                description: 'the γ bias factor used for well-tempered target distribution. Set to 0 for uniform flat target.'
            },
            {
                keyword: 'STATE_WFILE',
                required: false,
                description: 'write to this file the compressed kernels and all the info needed to RESTART the simulation.'
            },
            {
                keyword: 'STATE_WSTRIDE',
                required: false,
                description: 'number of MD steps between writing the STATE_WFILE.'
            },
            {
                keyword: 'STORE_STATES',
                required: false,
                default: 'off',
                description: '( default=off ) append to STATE_WFILE instead of overwriting it each time.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Basic OPES_METAD',
                code: `# OPES_METAD
cv: DISTANCE ATOMS=1,2
opes: OPES_METAD ARG=cv PACE=200 BARRIER=50
PRINT STRIDE=200 FILE=COLVAR ARG=*`
            },
            {
                title: 'OPES_METAD with checkpoint',
                code: `# OPES_METAD with checkpointing for restart
phi: TORSION ATOMS=@phi-3
psi: TORSION ATOMS=@psi-3
opes: OPES_METAD ARG=phi,psi PACE=500 BARRIER=50 STATE_WFILE=Restart.state STATE_WSTRIDE=50000 STORE_STATES
PRINT STRIDE=500 FILE=Colvar.data ARG=phi,psi,opes.*`
            }
        ],
        notes: [
            'BARRIER parameter should be at least equal to the highest free energy barrier you wish to overcome.',
            'More efficient than traditional metadynamics due to compression algorithm.',
            'Directly targets the probability distribution for better sampling.',
            'For exact restart use STATE_RFILE to read a checkpoint with all the needed info.'
        ],
        related: ['METAD', 'PBMETAD', 'VES']
    },
    'PIV': {
        module: 'Additional Modules',
        description: [
            'Permutation Invariant collective variable. This CV is invariant to permutations of equivalent atoms.',
            'Useful for studying systems with indistinguishable particles or symmetric molecules.',
            'The CV value remains the same regardless of how equivalent atoms are labeled.',
            'Particularly relevant for studying clusters, nanoparticles, and symmetric systems.'
        ],
        syntax: 'PIV ATOMS=<atoms> [SWITCH=<switch>] [NOPBC] [NUMERICAL_DERIVATIVES]',
        options: [
            {
                keyword: 'ATOMS',
                required: true,
                description: 'Atoms to include in the permutation invariant calculation.'
            },
            {
                keyword: 'SWITCH',
                required: false,
                description: 'Switching function for defining the interaction cutoff.'
            },
            {
                keyword: 'NOPBC',
                required: false,
                default: 'off',
                description: '( default=off ) ignore the periodic boundary conditions when calculating distances'
            },
            {
                keyword: 'NUMERICAL_DERIVATIVES',
                required: false,
                default: 'off',
                description: '( default=off ) calculate the derivatives for these quantities numerically'
            }
        ],
        components: [],
        examples: [
            {
                title: 'PIV for cluster analysis',
                code: `# PIV
piv: PIV ATOMS=1-100 SWITCH={RATIONAL R_0=5.0 D_0=0.5}
PRINT ARG=piv FILE=piv.dat`
            }
        ],
        notes: [
            'Invariant to permutations of equivalent atoms.',
            'Useful for systems with indistinguishable particles.',
            'Particularly relevant for clusters and symmetric systems.'
        ],
        related: ['COORDINATION', 'DISTANCE', 'Q3', 'Q4', 'Q6']
    },
    'PYTORCH': {
        module: 'Additional Modules',
        description: [
            'Machine Learning Collective Variables with PyTorch. This CV uses PyTorch models to compute collective variables from atomic coordinates.',
            'The PyTorch model is trained to map atomic positions to a lower-dimensional representation.',
            'Useful for complex systems where traditional CVs are insufficient.',
            'Requires a pre-trained PyTorch model file.'
        ],
        syntax: 'PYTORCH ARG=<cv1>,<cv2>,... FILE=<model_file>',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'Input collective variables that will be used as input to the PyTorch model.'
            },
            {
                keyword: 'FILE',
                required: true,
                description: 'Path to the PyTorch model file (typically .pt or .pth format).'
            }
        ],
        components: [],
        examples: [
            {
                title: 'Use PyTorch with distance CVs',
                code: `# PyTorch CV
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
pytorch: PYTORCH ARG=d1,d2 FILE=model.pt
PRINT ARG=pytorch FILE=pytorch.dat`
            }
        ],
        notes: [
            'Requires a pre-trained PyTorch model.',
            'The model file should be in PyTorch format (.pt or .pth).',
            'Useful for complex free energy landscapes where traditional CVs fail.'
        ],
        related: ['ANN', 'CUSTOM', 'COMBINE']
    },
    'VES': {
        module: 'Additional Modules',
        description: [
            'Variationally Enhanced Sampling. Enhanced sampling method based on Variationally Enhanced Sampling that optimizes a bias potential.',
            'VES uses variational principles to find the optimal bias potential.',
            'The bias is optimized to maximize the sampling efficiency.',
            'Useful for free energy calculations and exploring complex energy landscapes.'
        ],
        syntax: 'VES ARG=<cv1>,<cv2>,... SIGMA=<sigma1>,<sigma2>,... [PACE=<pace>]',
        options: [
            {
                keyword: 'ARG',
                required: true,
                description: 'Collective variables to apply VES to.'
            },
            {
                keyword: 'SIGMA',
                required: true,
                description: 'Width of the basis functions for each CV (one value per CV).'
            },
            {
                keyword: 'PACE',
                required: false,
                default: '500',
                description: 'Frequency (in steps) at which to update the bias potential.'
            }
        ],
        components: [],
        examples: [
            {
                title: 'VES on distance CV',
                code: `# VES
d: DISTANCE ATOMS=1,2
ves: VES ARG=d SIGMA=0.1 PACE=500
PRINT ARG=ves FILE=ves.dat`
            },
            {
                title: 'VES on multiple CVs',
                code: `# VES on multiple CVs
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
ves: VES ARG=d1,d2 SIGMA=0.1,0.15 PACE=500
PRINT ARG=ves FILE=ves.dat`
            }
        ],
        notes: [
            'Uses variational principles to optimize the bias potential.',
            'The bias is optimized to maximize sampling efficiency.',
            'Useful for free energy calculations and complex energy landscapes.'
        ],
        related: ['METAD', 'PBMETAD', 'OPES']
    }
};

// Export for use in plumed.js
if (typeof window !== 'undefined') {
    window.PLUMED_CV_DOCUMENTATION = PLUMED_CV_DOCUMENTATION;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PLUMED_CV_DOCUMENTATION;
}


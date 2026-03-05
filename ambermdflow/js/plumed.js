/**
 * PLUMED Collective Variables Manager
 * Handles CV selection, documentation display, and configuration editing
 */

async function plumedApiFetch(url, options = {}) {
    if (window.mdPipeline) return window.mdPipeline.apiFetch(url, options);
    return fetch(url, options);
}
async function plumedGetOutputUrl(path) {
    if (window.mdPipeline) {
        await window.mdPipeline.getSessionId();
        return window.mdPipeline.getOutputUrl(path);
    }
    return '/output/' + path;
}

class PlumedManager {
    constructor() {
        this.cvs = this.initializeCVs();
        this.selectedCV = null;
        this.savedConfigs = this.loadSavedConfigs();
        this.cvEditorContent = {}; // Store editor content per CV
        this.init();
    }

    init() {
        this.renderCVList();
        this.setupEventListeners();
        this.setupSearch();
        this.setupCustomPlumedEditor();
        this.setupCustomPlumedToggle();
        this.setupGenerateSimulationFilesToggle();
    }

    initializeCVs() {
        const cvs = [
            {
                name: 'DISTANCE',
                category: 'Geometric',
                description: 'Calculate the distance between a pair of atoms. This is the most basic collective variable and is the distance between two atoms calculated by adding the square root of the sum of squares of the three components of the distance vector.',
                syntax: 'DISTANCE ATOMS=<atom1>,<atom2> [COMPONENTS] [NOPBC]',
                example: `# Calculate distance between atoms 1 and 2
d1: DISTANCE ATOMS=1,2

# Calculate distance with components
d2: DISTANCE ATOMS=10,20 COMPONENTS

# Calculate distance without periodic boundary conditions
d3: DISTANCE ATOMS=5,15 NOPBC`,
                components: ['x', 'y', 'z', 'norm']
            },
            {
                name: 'COORDINATION',
                category: 'Geometric',
                description: 'Calculate coordination numbers. This can be used to calculate the number of atoms in a first coordination sphere around a central atom. The coordination number can be calculated using a switching function that goes smoothly from 1 to 0 as the distance between the central atom and the coordinating atom increases.',
                syntax: 'COORDINATION GROUPA=<group1> GROUPB=<group2> R_0=<value> D_0=<value> [NN=<value>] [MM=<value>]',
                example: `# Calculate coordination number between group 1 and group 2
coord: COORDINATION GROUPA=1-10 GROUPB=11-20 R_0=1.5 D_0=0.2

# Coordination with custom switching function
coord2: COORDINATION GROUPA=1 GROUPB=2-100 R_0=2.0 D_0=0.3 NN=6 MM=12`,
                components: []
            },
            {
                name: 'ANGLE',
                category: 'Geometric',
                description: 'Calculate the angle between three atoms. The angle is calculated as the angle between the vector connecting atom 1 to atom 2 and the vector connecting atom 2 to atom 3.',
                syntax: 'ANGLE ATOMS=<atom1>,<atom2>,<atom3>',
                example: `# Calculate angle between atoms 1, 2, and 3
a1: ANGLE ATOMS=1,2,3

# Calculate angle in a protein backbone
backbone_angle: ANGLE ATOMS=10,11,12`,
                components: []
            },
            {
                name: 'TORSION',
                category: 'Geometric',
                description: 'Calculate a torsional angle. This is the angle between two planes defined by four atoms. The angle is measured in radians and ranges from -π to π.',
                syntax: 'TORSION ATOMS=<atom1>,<atom2>,<atom3>,<atom4>',
                example: `# Calculate dihedral angle (phi angle)
phi: TORSION ATOMS=5,7,9,15

# Calculate psi angle
psi: TORSION ATOMS=7,9,15,17

# Calculate chi1 angle
chi1: TORSION ATOMS=5,8,10,13`,
                components: []
            },
            {
                name: 'SORT',
                category: 'Utility',
                description: 'This function can be used to sort colvars according to their magnitudes. It returns the sorted values of the input CVs.',
                syntax: 'SORT ARG=<cv1>,<cv2>,...',
                example: `# Sort CVs
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
sorted: SORT ARG=d1,d2`,
                components: []
            },
            {
                name: 'STATS',
                category: 'Analysis',
                description: 'Calculates statistical properties of a set of collective variables with respect to a set of reference values. This computes mean, variance, and other statistics.',
                syntax: 'STATS ARG=<cv1>,<cv2>,... REFERENCE=<file>',
                example: `# Statistical properties
d: DISTANCE ATOMS=1,2
stats: STATS ARG=d REFERENCE=ref.pdb`,
                components: []
            },
            {
                name: 'TARGET',
                category: 'Structural',
                description: 'This function measures the Pythagorean distance from a particular structure measured in the space defined by some set of collective variables. It calculates the distance in CV space rather than Cartesian space.',
                syntax: 'TARGET REFERENCE=<file> CVS=<cvs> [WEIGHTS=<weights>]',
                example: `# Target distance in CV space
target: TARGET REFERENCE=target.pdb CVS=distance,angle,torsion

# Target with weights
target_weighted: TARGET REFERENCE=ref.pdb CVS=d1,a1,t1 WEIGHTS=1.0,2.0,1.5`,
                components: []
            },
            {
                name: 'RMSD',
                category: 'Structural',
                description: 'Calculate the RMSD with respect to a reference structure. The RMSD is calculated after optimal alignment of the structure to the reference. The reference structure is typically the starting structure of the simulation.',
                syntax: 'RMSD REFERENCE=<file> TYPE=<type> [NOPBC]',
                example: `# Calculate RMSD with respect to reference structure
rmsd: RMSD REFERENCE=reference.pdb TYPE=OPTIMAL

# RMSD for specific atoms
rmsd_backbone: RMSD REFERENCE=ref.pdb TYPE=OPTIMAL ATOMS=@backbone

# RMSD without periodic boundary conditions
rmsd_nopbc: RMSD REFERENCE=ref.pdb TYPE=OPTIMAL NOPBC`,
                components: []
            },
            {
                name: 'GYRATION',
                category: 'Structural',
                description: 'Calculate the radius of gyration, or the average distance of atoms from the center of mass. This is useful for characterizing the size and compactness of a molecule.',
                syntax: 'GYRATION ATOMS=<group> [WEIGHTS=<weights>]',
                example: `# Calculate radius of gyration for all atoms
rg: GYRATION ATOMS=1-100

# Gyration for specific group
rg_backbone: GYRATION ATOMS=@backbone

# Gyration with weights
rg_weighted: GYRATION ATOMS=1-100 WEIGHTS=1,2,1,2`,
                components: []
            },
            {
                name: 'ENERGY',
                category: 'Energy',
                description: 'Calculate the total energy of the system. This collective variable can be used to bias simulations based on the total energy.',
                syntax: 'ENERGY',
                example: `# Calculate total energy
energy: ENERGY

# Use energy in metadynamics
metad: METAD ARG=energy SIGMA=1.0 HEIGHT=1.2 PACE=100`,
                components: []
            },
            {
                name: 'ALPHABETA',
                category: 'Secondary Structure',
                description: 'Calculate the alpha-beta content of a protein. This CV measures the fraction of residues in alpha-helix and beta-sheet conformations.',
                syntax: 'ALPHABETA ATOMS=<group> [TYPE=<type>]',
                example: `# Calculate alpha-beta content
ab: ALPHABETA ATOMS=1-100

# Alpha-beta for specific chain
ab_chainA: ALPHABETA ATOMS=@chainA`,
                components: ['alpha', 'beta']
            },
            {
                name: 'MULTICOLVAR',
                category: 'Composite',
                description: 'Calculate multiple collective variables simultaneously. This is useful when you need to compute several CVs that share common components.',
                syntax: 'MULTICOLVAR ATOMS=<group> [COEFFICIENTS=<coeffs>]',
                example: `# Calculate multiple distances
multi: MULTICOLVAR ATOMS=1,2,3,4,5,6
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
d3: DISTANCE ATOMS=5,6`,
                components: []
            },
            {
                name: 'MULTI_RMSD',
                category: 'Structural',
                description: 'Calculate the RMSD distance moved by a number of separated domains from their positions in a reference structure. This CV is useful for analyzing multi-domain proteins where different domains move independently.',
                syntax: 'MULTI_RMSD REFERENCE=<file> TYPE=<type> [GROUPS=<groups>]',
                example: `# Calculate multi-domain RMSD
multi_rmsd: MULTI_RMSD REFERENCE=ref.pdb TYPE=OPTIMAL GROUPS=1-50,51-100,101-150

# Multi-RMSD for specific domains
domains: MULTI_RMSD REFERENCE=structure.pdb TYPE=OPTIMAL GROUPS=@domain1,@domain2,@domain3`,
                components: []
            },
            {
                name: 'PCA',
                category: 'Analysis',
                description: 'Calculate principal component analysis (PCA) based on a set of reference structures. This is useful for analyzing conformational changes.',
                syntax: 'PCA REFERENCE=<file> VECTORS=<file> [NCOMPONENTS=<n>]',
                example: `# PCA analysis
pca: PCA REFERENCE=trajectory.pdb VECTORS=eigenvectors.dat NCOMPONENTS=10

# Use PCA component as CV
pc1: PCA REFERENCE=ref.pdb VECTORS=vecs.dat NCOMPONENTS=1`,
                components: []
            },
            {
                name: 'PCARMSD',
                category: 'Structural',
                description: 'Calculate the PCA components for a number of provided eigenvectors and an average structure. This CV projects the current structure onto PCA eigenvectors and calculates RMSD-like measures.',
                syntax: 'PCARMSD REFERENCE=<file> VECTORS=<file> [NCOMPONENTS=<n>]',
                example: `# PCA RMSD
pcarmsd: PCARMSD REFERENCE=avg.pdb VECTORS=eigenvecs.dat NCOMPONENTS=10

# PCA RMSD with specific components
pca_rmsd: PCARMSD REFERENCE=reference.pdb VECTORS=vectors.dat NCOMPONENTS=5`,
                components: []
            },
            {
                name: 'RDF',
                category: 'Analysis',
                description: 'Calculate radial distribution function (RDF). This measures the probability of finding a particle at a distance r from a reference particle.',
                syntax: 'RDF GROUPA=<group1> GROUPB=<group2> MAX=<max> NBINS=<nbins>',
                example: `# Calculate RDF between two groups
rdf: RDF GROUPA=1-50 GROUPB=51-100 MAX=10.0 NBINS=100

# RDF for specific atoms
rdf_water: RDF GROUPA=@water GROUPB=@protein MAX=15.0 NBINS=200`,
                components: []
            },
            {
                name: 'DRMSD',
                category: 'Structural',
                description: 'Calculate the distance RMSD (dRMSD). This measures the difference in pairwise distances between the current structure and a reference structure.',
                syntax: 'DRMSD REFERENCE=<file> LOWER_CUTOFF=<lower> UPPER_CUTOFF=<upper>',
                example: `# Calculate dRMSD
drmsd: DRMSD REFERENCE=ref.pdb LOWER_CUTOFF=0.0 UPPER_CUTOFF=10.0

# dRMSD for specific atoms
drmsd_backbone: DRMSD REFERENCE=ref.pdb ATOMS=@backbone LOWER_CUTOFF=0.0 UPPER_CUTOFF=15.0`,
                components: []
            },
            {
                name: 'HBOND',
                category: 'Analysis',
                description: 'Calculate the number of hydrogen bonds. This CV counts the number of hydrogen bonds between two groups of atoms.',
                syntax: 'HBOND GROUPA=<group1> GROUPB=<group2> R_0=<value> [DONORS=<donors>] [ACCEPTORS=<acceptors>]',
                example: `# Calculate hydrogen bonds
hbonds: HBOND GROUPA=1-50 GROUPB=51-100 R_0=3.5

# HBonds with specific donors/acceptors
hbonds_specific: HBOND GROUPA=@protein GROUPB=@water R_0=3.2 DONORS=@N,NE,NH ACCEPTORS=@O`,
                components: []
            },
            {
                name: 'MOLINFO',
                category: 'Utility',
                description: 'Extract molecular information from a PDB file. This is often used to define atom groups based on residue names or other properties.',
                syntax: 'MOLINFO STRUCTURE=<file> MOLTYPE=<type>',
                example: `# Load molecular information
mol: MOLINFO STRUCTURE=protein.pdb MOLTYPE=protein

# Use in other CVs
phi: TORSION ATOMS=@phi-3
psi: TORSION ATOMS=@psi-3`,
                components: []
            },
            {
                name: 'COMBINE',
                category: 'Composite',
                description: 'Combine multiple collective variables using mathematical operations. This allows you to create new CVs from existing ones.',
                syntax: 'COMBINE ARG=<cv1>,<cv2>,... COEFFICIENTS=<c1>,<c2>,... PERIODIC=<periodic>',
                example: `# Combine two distances
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
combined: COMBINE ARG=d1,d2 COEFFICIENTS=1.0,-1.0

# Weighted combination
weighted: COMBINE ARG=d1,d2 COEFFICIENTS=0.7,0.3`,
                components: []
            },
            {
                name: 'CUSTOM',
                category: 'Composite',
                description: 'Calculate a combination of variables using a custom expression. This allows you to define arbitrary mathematical expressions involving other CVs.',
                syntax: 'CUSTOM ARG=<cv1>,<cv2>,... FUNC=<expression> PERIODIC=<periodic>',
                example: `# Custom expression
d: DISTANCE ATOMS=1,2
angle: ANGLE ATOMS=3,4,5
custom: CUSTOM ARG=d,angle FUNC="x*y+sin(x)" PERIODIC=NO`,
                components: []
            },
            {
                name: 'ENSEMBLE',
                category: 'Analysis',
                description: 'Calculates the replica averaging of a collective variable over multiple replicas. This is useful for replica exchange or multi-replica simulations.',
                syntax: 'ENSEMBLE ARG=<cv> [REPLICAS=<n>]',
                example: `# Ensemble average
d: DISTANCE ATOMS=1,2
ensemble: ENSEMBLE ARG=d REPLICAS=8`,
                components: []
            },
            {
                name: 'FUNCSUMHILLS',
                category: 'Analysis',
                description: 'This function is intended to be called by the command line tool sum_hills. It integrates a HILLS file or an HILLS file interpreted as a histogram. It is not expected that you use this during your dynamics (it will crash!).',
                syntax: 'FUNCSUMHILLS FILE=<file> [GRID=<grid>]',
                example: `# Sum hills (command line tool usage)
# This is typically used with sum_hills command, not in MD simulation`,
                components: []
            },
            {
                name: 'FUNCPATHGENERAL',
                category: 'Path',
                description: 'This function calculates path collective variables (PCVs) using an arbitrary combination of collective variables. It provides a flexible framework for defining paths in CV space.',
                syntax: 'FUNCPATHGENERAL REFERENCE=<file> LAMBDA=<lambda> CVS=<cvs>',
                example: `# General path CV
funcpath: FUNCPATHGENERAL REFERENCE=path.pdb LAMBDA=0.5 CVS=distance,angle`,
                components: []
            },
            {
                name: 'FUNCPATHMSD',
                category: 'Path',
                description: 'This function calculates path collective variables. It measures progress along a path defined by reference structures using MSD-based metrics.',
                syntax: 'FUNCPATHMSD REFERENCE=<file> LAMBDA=<lambda>',
                example: `# Path MSD function
funcpathmsd: FUNCPATHMSD REFERENCE=path.pdb LAMBDA=0.5`,
                components: []
            },
            {
                name: 'LOCALENSEMBLE',
                category: 'Analysis',
                description: 'Calculates the average over multiple arguments. This computes a local ensemble average of the specified CVs.',
                syntax: 'LOCALENSEMBLE ARG=<cv1>,<cv2>,...',
                example: `# Local ensemble
d1: DISTANCE ATOMS=1,2
d2: DISTANCE ATOMS=3,4
local: LOCALENSEMBLE ARG=d1,d2`,
                components: []
            },
            {
                name: 'MATHEVAL',
                category: 'Composite',
                description: 'An alias to the CUSTOM function that can also be used to calculate combinations of variables using a custom expression. Provides the same functionality as CUSTOM with a more intuitive name.',
                syntax: 'MATHEVAL ARG=<cv1>,<cv2>,... FUNC=<expression> PERIODIC=<periodic>',
                example: `# Mathematical evaluation
d: DISTANCE ATOMS=1,2
math: MATHEVAL ARG=d FUNC="x^2+exp(-x)" PERIODIC=NO`,
                components: []
            },
            {
                name: 'METAD',
                category: 'Bias',
                description: 'Perform metadynamics on one or more collective variables. Metadynamics is an enhanced sampling method that adds a history-dependent bias to escape free energy minima.',
                syntax: 'METAD ARG=<cv1>,<cv2>,... SIGMA=<sigma1>,<sigma2>,... HEIGHT=<height> PACE=<pace> FILE=<file>',
                example: `# Metadynamics on a distance
d: DISTANCE ATOMS=1,2
METAD ARG=d SIGMA=0.1 HEIGHT=1.2 PACE=500 FILE=HILLS`,
                components: []
            },
            {
                name: 'PBMETAD',
                category: 'Bias',
                description: 'Perform Parallel Bias metadynamics. This is an extension of metadynamics that allows multiple walkers to share bias information.',
                syntax: 'PBMETAD ARG=<cv1>,<cv2>,... SIGMA=<sigma1>,<sigma2>,... HEIGHT=<height> PACE=<pace> FILE=<file>',
                example: `# Parallel Bias metadynamics
d: DISTANCE ATOMS=1,2
PBMETAD ARG=d SIGMA=0.1 HEIGHT=1.2 PACE=500 FILE=HILLS`,
                components: []
            },
            {
                name: 'PIECEWISE',
                category: 'Composite',
                description: 'Compute a piece wise straight line through its arguments that passes through a set of ordered control points. This creates a piecewise linear function.',
                syntax: 'PIECEWISE ARG=<cv> POINTS=<points>',
                example: `# Piecewise function
d: DISTANCE ATOMS=1,2
piecewise: PIECEWISE ARG=d POINTS=0.0,1.0,2.0,3.0`,
                components: []
            },
            {
                name: 'RESTRAINT',
                category: 'Bias',
                description: 'Add harmonic and/or linear restraints on one or more variables. This is useful for keeping the system in a specific region of CV space.',
                syntax: 'RESTRAINT ARG=<cv> AT=<value> KAPPA=<kappa> [SLOPE=<slope>]',
                example: `# Harmonic restraint
d: DISTANCE ATOMS=1,2
RESTRAINT ARG=d AT=5.0 KAPPA=10.0`,
                components: []
            },
            {
                name: 'LOWER_WALLS',
                category: 'Bias',
                description: 'Define a lower wall for the value of one or more collective variables, which limits the region of the phase space accessible during the simulation.',
                syntax: 'LOWER_WALLS ARG=<cv> AT=<value> KAPPA=<kappa> [EXP=<exp>] [EPS=<eps>]',
                example: `# Lower wall on distance
d: DISTANCE ATOMS=1,2
LOWER_WALLS ARG=d AT=2.0 KAPPA=100.0`,
                components: []
            },
            {
                name: 'UPPER_WALLS',
                category: 'Bias',
                description: 'Define an upper wall for the value of one or more collective variables, which limits the region of the phase space accessible during the simulation.',
                syntax: 'UPPER_WALLS ARG=<cv> AT=<value> KAPPA=<kappa> [EXP=<exp>] [EPS=<eps>]',
                example: `# Upper wall on distance
d: DISTANCE ATOMS=1,2
UPPER_WALLS ARG=d AT=10.0 KAPPA=100.0`,
                components: []
            },
            {
                name: 'ABMD',
                category: 'Bias',
                description: 'Adds a ratchet-and-pawl like restraint on one or more variables. Evolves a system towards a target value in CV space using an harmonic potential moving with the thermal fluctuations of the CV.',
                syntax: 'ABMD ARG=<cv1>,<cv2>,... TO=<value1>,<value2>,... KAPPA=<kappa1>,<kappa2>,...',
                example: `# ABMD with multiple CVs
d1: DISTANCE ATOMS=3,5
d2: DISTANCE ATOMS=2,4
abmd: ABMD ARG=d1,d2 TO=1.0,1.5 KAPPA=5.0,5.0`,
                components: []
            },
            {
                name: 'MOVINGRESTRAINT',
                category: 'Bias',
                description: 'Add a time-dependent, harmonic restraint on one or more variables. The restraint center moves according to a predefined schedule.',
                syntax: 'MOVINGRESTRAINT ARG=<cv> STEP0=<step0> AT0=<at0> KAPPA0=<kappa0> STEP1=<step1> AT1=<at1> KAPPA1=<kappa1>',
                example: `# Moving restraint
d: DISTANCE ATOMS=1,2
MOVINGRESTRAINT ARG=d STEP0=0 AT0=5.0 KAPPA0=10.0 STEP1=10000 AT1=10.0 KAPPA1=10.0`,
                components: []
            },
            {
                name: 'EXTERNAL',
                category: 'Bias',
                description: 'Calculate a restraint that is defined on a grid that is read during start up. This allows you to use pre-computed bias potentials.',
                syntax: 'EXTERNAL ARG=<cv> FILE=<file> [FMT=<fmt>]',
                example: `# External bias from file
d: DISTANCE ATOMS=1,2
EXTERNAL ARG=d FILE=bias.dat`,
                components: []
            },
            {
                name: 'BIASVALUE',
                category: 'Bias',
                description: 'Takes the value of one variable and use it as a bias. This is useful for applying a bias that was computed elsewhere.',
                syntax: 'BIASVALUE ARG=<cv>',
                example: `# Use CV value as bias
d: DISTANCE ATOMS=1,2
BIASVALUE ARG=d`,
                components: []
            },
            {
                name: 'EXTENDED_LAGRANGIAN',
                category: 'Bias',
                description: 'Add extended Lagrangian. This is used in conjunction with other bias methods to add an extended variable.',
                syntax: 'EXTENDED_LAGRANGIAN ARG=<cv> KAPPA=<kappa> [MASS=<mass>]',
                example: `# Extended Lagrangian
d: DISTANCE ATOMS=1,2
EXTENDED_LAGRANGIAN ARG=d KAPPA=10.0 MASS=1.0`,
                components: []
            },
            {
                name: 'MAXENT',
                category: 'Bias',
                description: 'Add a linear biasing potential on one or more variables that satisfies a maximum entropy principle.',
                syntax: 'MAXENT ARG=<cv1>,<cv2>,... TEMP=<temp> [PACE=<pace>]',
                example: `# Maximum entropy bias
d: DISTANCE ATOMS=1,2
MAXENT ARG=d TEMP=300.0 PACE=100`,
                components: []
            },
            {
                name: 'ADAPTIVE_PATH',
                category: 'Path',
                description: 'Compute path collective variables that adapt to the lowest free energy path connecting states A and B. This CV is useful for studying transitions between two states.',
                syntax: 'ADAPTIVE_PATH REFERENCE=<file> LAMBDA=<lambda> [TYPE=<type>]',
                example: `# Adaptive path CV
path: ADAPTIVE_PATH REFERENCE=path.pdb LAMBDA=0.5`,
                components: []
            },
            {
                name: 'ALPHARMSD',
                category: 'Secondary Structure',
                description: 'Probe the alpha helical content of a protein structure. This CV measures how well the structure matches an ideal alpha helix.',
                syntax: 'ALPHARMSD ATOMS=<group> [TYPE=<type>]',
                example: `# Alpha helix RMSD
alpha: ALPHARMSD ATOMS=1-50`,
                components: []
            },
            {
                name: 'ANTIBETARMSD',
                category: 'Secondary Structure',
                description: 'Probe the antiparallel beta sheet content of your protein structure. This CV measures how well the structure matches an ideal antiparallel beta sheet.',
                syntax: 'ANTIBETARMSD ATOMS=<group> [TYPE=<type>]',
                example: `# Antiparallel beta sheet RMSD
beta: ANTIBETARMSD ATOMS=1-100`,
                components: []
            },
            {
                name: 'CELL',
                category: 'System',
                description: 'Calculate the components of the simulation cell. This CV provides access to the box vectors and cell parameters.',
                syntax: 'CELL [COMPONENTS]',
                example: `# Calculate cell components
cell: CELL COMPONENTS`,
                components: ['ax', 'ay', 'az', 'bx', 'by', 'bz', 'cx', 'cy', 'cz']
            },
            {
                name: 'CONSTANT',
                category: 'Utility',
                description: 'Return one or more constant quantities with or without derivatives. This is useful for creating constant values in PLUMED input files.',
                syntax: 'CONSTANT VALUE=<value>',
                example: `# Constant value
const: CONSTANT VALUE=1.0`,
                components: []
            },
            {
                name: 'CONTACTMAP',
                category: 'Structural',
                description: 'Calculate the distances between a number of pairs of atoms and transform each distance by a switching function. This creates a contact map representation of the structure.',
                syntax: 'CONTACTMAP ATOMS=<group> SWITCH=<switching_function>',
                example: `# Contact map
cmap: CONTACTMAP ATOMS=1-100 SWITCH={RATIONAL R_0=5.0 D_0=1.0}`,
                components: []
            },
            {
                name: 'WHAM_HISTOGRAM',
                category: 'Analysis',
                description: 'Output a histogram using the weighted histogram analysis method (WHAM). This shortcut action allows you to calculate a histogram using the weighted histogram analysis technique.',
                syntax: 'WHAM_HISTOGRAM ARG=<cv> BIAS=<bias> TEMP=<temp> GRID_MIN=<min> GRID_MAX=<max> GRID_BIN=<bins>',
                example: `# WHAM histogram
phi: TORSION ATOMS=5,7,9,15
rp: RESTRAINT ARG=phi KAPPA=50.0 AT=0.0
hh: WHAM_HISTOGRAM ARG=phi BIAS=rp.bias TEMP=300 GRID_MIN=-pi GRID_MAX=pi GRID_BIN=50`,
                components: []
            },
            {
                name: 'DHENERGY',
                category: 'Energy',
                description: 'Calculate Debye-Huckel interaction energy among GROUPA and GROUPB. This CV computes the electrostatic interaction energy using the Debye-Huckel model.',
                syntax: 'DHENERGY GROUPA=<group1> GROUPB=<group2> [EPSILON=<eps>] [KAPPA=<kappa>]',
                example: `# Debye-Huckel energy
dh: DHENERGY GROUPA=1-50 GROUPB=51-100 EPSILON=80.0 KAPPA=0.1`,
                components: []
            },
            {
                name: 'DIHCOR',
                category: 'Analysis',
                description: 'Measures the degree of similarity between dihedral angles. This CV calculates the correlation between sets of dihedral angles.',
                syntax: 'DIHCOR ATOMS=<group> REFERENCE=<file>',
                example: `# Dihedral correlation
dihcor: DIHCOR ATOMS=1-100 REFERENCE=ref.pdb`,
                components: []
            },
            {
                name: 'DIMER',
                category: 'Energy',
                description: 'This CV computes the dimer interaction energy for a collection of dimers. It calculates the interaction energy between pairs of molecules.',
                syntax: 'DIMER ATOMS=<group> [SWITCH=<switch>]',
                example: `# Dimer interaction energy
dimer: DIMER ATOMS=1-200`,
                components: []
            },
            {
                name: 'DIPOLE',
                category: 'Electric',
                description: 'Calculate the dipole moment for a group of atoms. This CV computes the total dipole moment vector and its magnitude.',
                syntax: 'DIPOLE ATOMS=<group> [COMPONENTS]',
                example: `# Dipole moment
dipole: DIPOLE ATOMS=1-100 COMPONENTS`,
                components: ['x', 'y', 'z', 'norm']
            },
            {
                name: 'DISTANCE_FROM_CONTOUR',
                category: 'Geometric',
                description: 'Calculate the perpendicular distance from a Willard-Chandler dividing surface. This CV measures the distance from a molecular surface.',
                syntax: 'DISTANCE_FROM_CONTOUR ATOMS=<group> CONTOUR=<value>',
                example: `# Distance from contour
dist_contour: DISTANCE_FROM_CONTOUR ATOMS=1-100 CONTOUR=0.5`,
                components: []
            },
            {
                name: 'EEFSOLV',
                category: 'Energy',
                description: 'Calculates EEF1 solvation free energy for a group of atoms. This CV computes the solvation energy using the EEF1 implicit solvent model.',
                syntax: 'EEFSOLV ATOMS=<group>',
                example: `# EEF1 solvation energy
eef: EEFSOLV ATOMS=1-100`,
                components: []
            },
            {
                name: 'ERMSD',
                category: 'Structural',
                description: 'Calculate eRMSD with respect to a reference structure. This CV computes the ensemble RMSD, which is useful for comparing ensembles of structures.',
                syntax: 'ERMSD REFERENCE=<file> [TYPE=<type>]',
                example: `# Ensemble RMSD
ermsd: ERMSD REFERENCE=ensemble.pdb`,
                components: []
            },
            {
                name: 'EXTRACV',
                category: 'Utility',
                description: 'Allow PLUMED to use collective variables computed in the MD engine. This CV allows external CVs from the MD code to be used in PLUMED.',
                syntax: 'EXTRACV NAME=<name>',
                example: `# External CV from MD engine
extcv: EXTRACV NAME=external_cv`,
                components: []
            },
            {
                name: 'GHBFIX',
                category: 'Energy',
                description: 'Calculate the GHBFIX interaction energy among GROUPA and GROUPB using a potential defined in Kührová et al. This is used for RNA force field improvements.',
                syntax: 'GHBFIX GROUPA=<group1> GROUPB=<group2> [SCALE=<scale>]',
                example: `# GHBFIX energy
ghb: GHBFIX GROUPA=1-50 GROUPB=51-100`,
                components: []
            },
            {
                name: 'GPROPERTYMAP',
                category: 'Analysis',
                description: 'Property maps but with a more flexible framework for the distance metric being used. This CV creates property maps with customizable distance metrics.',
                syntax: 'GPROPERTYMAP PROPERTY=<property> REFERENCE=<file> [METRIC=<metric>]',
                example: `# Generalized property map
gpmap: GPROPERTYMAP PROPERTY=1 REFERENCE=ref.pdb`,
                components: []
            },
            {
                name: 'PARABETARMSD',
                category: 'Secondary Structure',
                description: 'Probe the parallel beta sheet content of your protein structure. This CV measures how well the structure matches an ideal parallel beta sheet.',
                syntax: 'PARABETARMSD ATOMS=<group> [TYPE=<type>]',
                example: `# Parallel beta sheet RMSD
parabeta: PARABETARMSD ATOMS=1-100`,
                components: []
            },
            {
                name: 'PATH',
                category: 'Path',
                description: 'Path collective variables with a more flexible framework for the distance metric being used. This CV defines path CVs with customizable metrics.',
                syntax: 'PATH REFERENCE=<file> LAMBDA=<lambda> [METRIC=<metric>]',
                example: `# Path CV
path: PATH REFERENCE=path.pdb LAMBDA=0.5`,
                components: []
            },
            {
                name: 'PATHMSD',
                category: 'Path',
                description: 'This Colvar calculates path collective variables. It measures progress along a path defined by reference structures.',
                syntax: 'PATHMSD REFERENCE=<file> LAMBDA=<lambda>',
                example: `# Path MSD
pathmsd: PATHMSD REFERENCE=path.pdb LAMBDA=0.5`,
                components: []
            },
            {
                name: 'PCAVARS',
                category: 'Analysis',
                description: 'Projection on principal component eigenvectors or other high dimensional linear subspace. This CV projects coordinates onto PCA eigenvectors.',
                syntax: 'PCAVARS REFERENCE=<file> VECTORS=<file> [NCOMPONENTS=<n>]',
                example: `# PCA variables
pcavars: PCAVARS REFERENCE=traj.pdb VECTORS=eigenvecs.dat NCOMPONENTS=10`,
                components: []
            },
            {
                name: 'POSITION',
                category: 'Geometric',
                description: 'Calculate the components of the position of an atom. This CV provides access to the x, y, z coordinates of atoms.',
                syntax: 'POSITION ATOMS=<atom> [COMPONENTS]',
                example: `# Atom position
pos: POSITION ATOMS=1 COMPONENTS`,
                components: ['x', 'y', 'z']
            },
            {
                name: 'PROJECTION_ON_AXIS',
                category: 'Geometric',
                description: 'Calculate a position based on the projection along and extension from a defined axis. This CV projects atomic positions onto an axis.',
                syntax: 'PROJECTION_ON_AXIS ATOMS=<group> AXIS=<axis>',
                example: `# Projection on axis
proj: PROJECTION_ON_AXIS ATOMS=1-100 AXIS=1,0,0`,
                components: []
            },
            {
                name: 'PROPERTYMAP',
                category: 'Analysis',
                description: 'Calculate generic property maps. This CV creates maps of molecular properties with respect to reference structures.',
                syntax: 'PROPERTYMAP PROPERTY=<property> REFERENCE=<file>',
                example: `# Property map
pmap: PROPERTYMAP PROPERTY=1 REFERENCE=ref.pdb`,
                components: []
            },
            {
                name: 'PUCKERING',
                category: 'Geometric',
                description: 'Calculate sugar pseudorotation coordinates. This CV computes puckering parameters for sugar rings in nucleic acids.',
                syntax: 'PUCKERING ATOMS=<group>',
                example: `# Sugar puckering
puck: PUCKERING ATOMS=1-5`,
                components: []
            },
            {
                name: 'VOLUME',
                category: 'System',
                description: 'Calculate the volume of the simulation box. This CV provides access to the system volume.',
                syntax: 'VOLUME',
                example: `# System volume
vol: VOLUME`,
                components: []
            },
            // MultiColvar CVs
            {
                name: 'ANGLES',
                category: 'MultiColvar',
                description: 'Calculate functions of the distribution of angles. This multicolvar computes angles between multiple sets of atoms.',
                syntax: 'ANGLES ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> [MEAN] [MIN] [MAX]',
                example: `# Calculate angles
angles: ANGLES ATOMS1=1,2,3 ATOMS2=4,5,6 ATOMS3=7,8,9 MEAN`,
                components: []
            },
            {
                name: 'BOND_DIRECTIONS',
                category: 'MultiColvar',
                description: 'Calculate the vectors connecting atoms that are within cutoff defined using a switching function.',
                syntax: 'BOND_DIRECTIONS GROUPA=<group1> GROUPB=<group2> SWITCH=<switch>',
                example: `# Bond directions
bd: BOND_DIRECTIONS GROUPA=1-10 GROUPB=11-20 SWITCH={RATIONAL R_0=2.0}`,
                components: []
            },
            {
                name: 'BRIDGE',
                category: 'MultiColvar',
                description: 'Calculate the number of atoms that bridge two parts of a structure.',
                syntax: 'BRIDGE GROUPA=<group1> GROUPB=<group2> [SWITCH=<switch>]',
                example: `# Bridge atoms
bridge: BRIDGE GROUPA=1-50 GROUPB=51-100`,
                components: []
            },
            {
                name: 'COORDINATIONNUMBER',
                category: 'MultiColvar',
                description: 'Calculate the coordination numbers of atoms so that you can then calculate functions of the distribution of coordination numbers such as the minimum, the number less than a certain quantity and so on.',
                syntax: 'COORDINATIONNUMBER GROUPA=<group1> GROUPB=<group2> SWITCH=<switch> [MEAN] [MIN]',
                example: `# Coordination number
coord: COORDINATIONNUMBER GROUPA=1-10 GROUPB=11-100 SWITCH={RATIONAL R_0=2.5} MEAN`,
                components: []
            },
            {
                name: 'DENSITY',
                category: 'MultiColvar',
                description: 'Calculate functions of the density of atoms as a function of the box. This allows one to calculate the number of atoms in half the box.',
                syntax: 'DENSITY ATOMS=<group> [MEAN] [MIN] [MAX]',
                example: `# Density
density: DENSITY ATOMS=1-100 MEAN`,
                components: []
            },
            {
                name: 'DISTANCES',
                category: 'MultiColvar',
                description: 'Calculate the distances between one or many pairs of atoms. You can then calculate functions of the distribution of distances such as the minimum, the number less than a certain quantity and so on.',
                syntax: 'DISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [MIN] [MAX]',
                example: `# Distances
distances: DISTANCES ATOMS1=1,2 ATOMS2=3,4 ATOMS3=5,6 MIN`,
                components: []
            },
            {
                name: 'ENVIRONMENTSIMILARITY',
                category: 'MultiColvar',
                description: 'Measure how similar the environment around atoms is to that found in some reference crystal structure.',
                syntax: 'ENVIRONMENTSIMILARITY ATOMS=<group> REFERENCE=<file>',
                example: `# Environment similarity
env: ENVIRONMENTSIMILARITY ATOMS=1-100 REFERENCE=ref.pdb`,
                components: []
            },
            {
                name: 'FCCUBIC',
                category: 'MultiColvar',
                description: 'Measure how similar the environment around atoms is to that found in a FCC structure.',
                syntax: 'FCCUBIC ATOMS=<group> [MEAN]',
                example: `# FCC cubic structure
fcc: FCCUBIC ATOMS=1-100 MEAN`,
                components: []
            },
            {
                name: 'HBPAMM_SH',
                category: 'MultiColvar',
                description: 'Number of HBPAMM hydrogen bonds formed by each hydrogen atom in the system.',
                syntax: 'HBPAMM_SH ATOMS=<group> [MEAN]',
                example: `# HBPAMM hydrogen bonds
hb: HBPAMM_SH ATOMS=1-100 MEAN`,
                components: []
            },
            {
                name: 'INPLANEDISTANCES',
                category: 'MultiColvar',
                description: 'Calculate distances in the plane perpendicular to an axis.',
                syntax: 'INPLANEDISTANCES ATOMS1=<group1> ATOMS2=<group2> AXIS=<axis>',
                example: `# In-plane distances
ipd: INPLANEDISTANCES ATOMS1=1,2 ATOMS2=3,4 AXIS=0,0,1`,
                components: []
            },
            {
                name: 'MOLECULES',
                category: 'MultiColvar',
                description: 'Calculate the vectors connecting a pair of atoms in order to represent the orientation of a molecule.',
                syntax: 'MOLECULES ATOMS1=<group1> ATOMS2=<group2>',
                example: `# Molecules
mol: MOLECULES ATOMS1=1,2 ATOMS2=3,4`,
                components: []
            },
            {
                name: 'PLANES',
                category: 'MultiColvar',
                description: 'Calculate the plane perpendicular to two vectors in order to represent the orientation of a planar molecule.',
                syntax: 'PLANES ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3>',
                example: `# Planes
planes: PLANES ATOMS1=1,2,3 ATOMS2=4,5,6 ATOMS3=7,8,9`,
                components: []
            },
            {
                name: 'Q3',
                category: 'MultiColvar',
                description: 'Calculate 3rd order Steinhardt parameters.',
                syntax: 'Q3 ATOMS=<group> [MEAN]',
                example: `# Q3 Steinhardt parameter
q3: Q3 ATOMS=1-100 MEAN`,
                components: []
            },
            {
                name: 'Q4',
                category: 'MultiColvar',
                description: 'Calculate fourth order Steinhardt parameters.',
                syntax: 'Q4 ATOMS=<group> [MEAN]',
                example: `# Q4 Steinhardt parameter
q4: Q4 ATOMS=1-100 MEAN`,
                components: []
            },
            {
                name: 'Q6',
                category: 'MultiColvar',
                description: 'Calculate sixth order Steinhardt parameters.',
                syntax: 'Q6 ATOMS=<group> [MEAN]',
                example: `# Q6 Steinhardt parameter
q6: Q6 ATOMS=1-100 MEAN`,
                components: []
            },
            {
                name: 'SIMPLECUBIC',
                category: 'MultiColvar',
                description: 'Calculate whether or not the coordination spheres of atoms are arranged as they would be in a simple cubic structure.',
                syntax: 'SIMPLECUBIC ATOMS=<group> [MEAN]',
                example: `# Simple cubic structure
sc: SIMPLECUBIC ATOMS=1-100 MEAN`,
                components: []
            },
            {
                name: 'TETRAHEDRAL',
                category: 'MultiColvar',
                description: 'Calculate the degree to which the environment about ions has a tetrahedral order.',
                syntax: 'TETRAHEDRAL ATOMS=<group> [MEAN]',
                example: `# Tetrahedral order
tet: TETRAHEDRAL ATOMS=1-100 MEAN`,
                components: []
            },
            {
                name: 'TORSIONS',
                category: 'MultiColvar',
                description: 'Calculate whether or not a set of torsional angles are within a particular range.',
                syntax: 'TORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4> [MEAN]',
                example: `# Torsions
torsions: TORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8 MEAN`,
                components: []
            },
            {
                name: 'XANGLES',
                category: 'MultiColvar',
                description: 'Calculate the angles between the vector connecting two atoms and the x axis.',
                syntax: 'XANGLES ATOMS1=<group1> ATOMS2=<group2> [MEAN]',
                example: `# X angles
xang: XANGLES ATOMS1=1,2 ATOMS2=3,4 MEAN`,
                components: []
            },
            {
                name: 'XDISTANCES',
                category: 'MultiColvar',
                description: 'Calculate the x components of the vectors connecting one or many pairs of atoms. You can then calculate functions of the distribution of values such as the minimum, the number less than a certain quantity and so on.',
                syntax: 'XDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [MIN]',
                example: `# X distances
xd: XDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`,
                components: []
            },
            {
                name: 'XYDISTANCES',
                category: 'MultiColvar',
                description: 'Calculate distance between a pair of atoms neglecting the z-component.',
                syntax: 'XYDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN]',
                example: `# XY distances
xyd: XYDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`,
                components: []
            },
            {
                name: 'XYTORSIONS',
                category: 'MultiColvar',
                description: 'Calculate the torsional angle around the x axis from the positive y direction.',
                syntax: 'XYTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4>',
                example: `# XY torsions
xyt: XYTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8`,
                components: []
            },
            {
                name: 'XZDISTANCES',
                category: 'MultiColvar',
                description: 'Calculate distance between a pair of atoms neglecting the y-component.',
                syntax: 'XZDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN]',
                example: `# XZ distances
xzd: XZDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`,
                components: []
            },
            {
                name: 'XZTORSIONS',
                category: 'MultiColvar',
                description: 'Calculate the torsional angle around the x axis from the positive z direction.',
                syntax: 'XZTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4>',
                example: `# XZ torsions
xzt: XZTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8`,
                components: []
            },
            {
                name: 'YANGLES',
                category: 'MultiColvar',
                description: 'Calculate the angles between the vector connecting two atoms and the y axis.',
                syntax: 'YANGLES ATOMS1=<group1> ATOMS2=<group2> [MEAN]',
                example: `# Y angles
yang: YANGLES ATOMS1=1,2 ATOMS2=3,4 MEAN`,
                components: []
            },
            {
                name: 'YDISTANCES',
                category: 'MultiColvar',
                description: 'Calculate the y components of the vectors connecting one or many pairs of atoms. You can then calculate functions of the distribution of values such as the minimum, the number less than a certain quantity and so on.',
                syntax: 'YDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [MIN]',
                example: `# Y distances
yd: YDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`,
                components: []
            },
            {
                name: 'YXTORSIONS',
                category: 'MultiColvar',
                description: 'Calculate the torsional angle around the y axis from the positive x direction.',
                syntax: 'YXTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4>',
                example: `# YX torsions
yxt: YXTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8`,
                components: []
            },
            {
                name: 'YZDISTANCES',
                category: 'MultiColvar',
                description: 'Calculate distance between a pair of atoms neglecting the x-component.',
                syntax: 'YZDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN]',
                example: `# YZ distances
yzd: YZDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`,
                components: []
            },
            {
                name: 'YZTORSIONS',
                category: 'MultiColvar',
                description: 'Calculate the torsional angle around the y axis from the positive z direction.',
                syntax: 'YZTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4>',
                example: `# YZ torsions
yzt: YZTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8`,
                components: []
            },
            {
                name: 'ZANGLES',
                category: 'MultiColvar',
                description: 'Calculate the angles between the vector connecting two atoms and the z axis.',
                syntax: 'ZANGLES ATOMS1=<group1> ATOMS2=<group2> [MEAN]',
                example: `# Z angles
zang: ZANGLES ATOMS1=1,2 ATOMS2=3,4 MEAN`,
                components: []
            },
            {
                name: 'ZDISTANCES',
                category: 'MultiColvar',
                description: 'Calculate the z components of the vectors connecting one or many pairs of atoms. You can then calculate functions of the distribution of values such as the minimum, the number less than a certain quantity and so on.',
                syntax: 'ZDISTANCES ATOMS1=<group1> ATOMS2=<group2> [MEAN] [MIN]',
                example: `# Z distances
zd: ZDISTANCES ATOMS1=1,2 ATOMS2=3,4 MEAN`,
                components: []
            },
            {
                name: 'ZXTORSIONS',
                category: 'MultiColvar',
                description: 'Calculate the torsional angle around the z axis from the positive x direction.',
                syntax: 'ZXTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4>',
                example: `# ZX torsions
zxt: ZXTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8`,
                components: []
            },
            {
                name: 'ZYTORSIONS',
                category: 'MultiColvar',
                description: 'Calculate the torsional angle around the z axis from the positive y direction.',
                syntax: 'ZYTORSIONS ATOMS1=<group1> ATOMS2=<group2> ATOMS3=<group3> ATOMS4=<group4>',
                example: `# ZY torsions
zyt: ZYTORSIONS ATOMS1=1,2,3,4 ATOMS2=5,6,7,8`,
                components: []
            },
            // MultiColvar helper/filter CVs
            {
                name: 'DUMPMULTICOLVAR',
                category: 'MultiColvar',
                description: 'Output a histogram using the weighted histogram analysis method (WHAM). Extract all the individual colvar values that you have calculated.',
                syntax: 'DUMPMULTICOLVAR ARG=<multicolvar> FILE=<file>',
                example: `# Dump multicolvar
dump: DUMPMULTICOLVAR ARG=distances FILE=output.dat`,
                components: []
            },
            {
                name: 'MFILTER_BETWEEN',
                category: 'MultiColvar',
                description: 'This action can be used to filter the colvar values calculated by a multicolvar so that one can compute the mean and so on for only those multicolvars within a certain range.',
                syntax: 'MFILTER_BETWEEN ARG=<multicolvar> LOWER=<lower> UPPER=<upper>',
                example: `# Filter between
filter: MFILTER_BETWEEN ARG=distances LOWER=2.0 UPPER=5.0`,
                components: []
            },
            {
                name: 'MFILTER_LESS',
                category: 'MultiColvar',
                description: 'This action can be used to filter the distribution of colvar values in a multicolvar so that one can compute the mean and so on for only those multicolvars less than a tolerance.',
                syntax: 'MFILTER_LESS ARG=<multicolvar> TOLERANCE=<tol>',
                example: `# Filter less
filter: MFILTER_LESS ARG=distances TOLERANCE=3.0`,
                components: []
            },
            {
                name: 'MFILTER_MORE',
                category: 'MultiColvar',
                description: 'This action can be used to filter the distribution of colvar values in a multicolvar so that one can compute the mean and so on for only those multicolvars more than a tolerance.',
                syntax: 'MFILTER_MORE ARG=<multicolvar> TOLERANCE=<tol>',
                example: `# Filter more
filter: MFILTER_MORE ARG=distances TOLERANCE=5.0`,
                components: []
            },
            {
                name: 'AROUND',
                category: 'MultiColvar',
                description: 'This quantity can be used to calculate functions of the distribution of collective variables for the atoms that lie in a particular, user-specified part of of the cell.',
                syntax: 'AROUND ARG=<multicolvar> ATOMS=<group> R_0=<r0>',
                example: `# Around
around: AROUND ARG=distances ATOMS=1-10 R_0=5.0`,
                components: []
            },
            {
                name: 'CAVITY',
                category: 'MultiColvar',
                description: 'This quantity can be used to calculate functions of the distribution of collective variables for the atoms that lie in a box defined by the positions of four atoms.',
                syntax: 'CAVITY ARG=<multicolvar> ATOMS=<group>',
                example: `# Cavity
cavity: CAVITY ARG=distances ATOMS=1,2,3,4`,
                components: []
            },
            {
                name: 'INCYLINDER',
                category: 'MultiColvar',
                description: 'This quantity can be used to calculate functions of the distribution of collective variables for the atoms that lie in a particular, user-specified part of of the cell.',
                syntax: 'INCYLINDER ARG=<multicolvar> ATOMS=<group> DIRECTION=<dir> RADIUS=<r>',
                example: `# In cylinder
cyl: INCYLINDER ARG=distances ATOMS=1-10 DIRECTION=0,0,1 RADIUS=5.0`,
                components: []
            },
            {
                name: 'INENVELOPE',
                category: 'MultiColvar',
                description: 'This quantity can be used to calculate functions of the distribution of collective variables for the atoms that lie in a region where the density of a certain type of atom is high.',
                syntax: 'INENVELOPE ARG=<multicolvar> ATOMS=<group>',
                example: `# In envelope
env: INENVELOPE ARG=distances ATOMS=1-100`,
                components: []
            },
            {
                name: 'INSPHERE',
                category: 'MultiColvar',
                description: 'This quantity can be used to calculate functions of the distribution of collective variables for the atoms that lie in a particular, user-specified part of of the cell.',
                syntax: 'INSPHERE ARG=<multicolvar> ATOMS=<group> RADIUS=<r>',
                example: `# In sphere
sphere: INSPHERE ARG=distances ATOMS=1-10 RADIUS=5.0`,
                components: []
            },
            {
                name: 'TETRAHEDRALPORE',
                category: 'MultiColvar',
                description: 'This quantity can be used to calculate functions of the distribution of collective variables for the atoms lie that lie in a box defined by the positions of four atoms at the corners of a tetrahedron.',
                syntax: 'TETRAHEDRALPORE ARG=<multicolvar> ATOMS=<group>',
                example: `# Tetrahedral pore
pore: TETRAHEDRALPORE ARG=distances ATOMS=1,2,3,4`,
                components: []
            },
            {
                name: 'GRADIENT',
                category: 'MultiColvar',
                description: 'Calculate the gradient of the average value of a multicolvar value.',
                syntax: 'GRADIENT ARG=<multicolvar>',
                example: `# Gradient
grad: GRADIENT ARG=distances`,
                components: []
            },
            {
                name: 'INTERMOLECULARTORSIONS',
                category: 'MultiColvar',
                description: 'Calculate torsion angles between vectors on adjacent molecules.',
                syntax: 'INTERMOLECULARTORSIONS ARG=<multicolvar>',
                example: `# Intermolecular torsions
imt: INTERMOLECULARTORSIONS ARG=molecules`,
                components: []
            },
            {
                name: 'LOCAL_AVERAGE',
                category: 'MultiColvar',
                description: 'Calculate averages over spherical regions centered on atoms.',
                syntax: 'LOCAL_AVERAGE ARG=<multicolvar> ATOMS=<group> R_0=<r0>',
                example: `# Local average
la: LOCAL_AVERAGE ARG=distances ATOMS=1-10 R_0=5.0`,
                components: []
            },
            {
                name: 'LOCAL_Q3',
                category: 'MultiColvar',
                description: 'Calculate the local degree of order around an atoms by taking the average dot product between the q_3 vector on the central atom and the q_3 vector on the atoms in the first coordination sphere.',
                syntax: 'LOCAL_Q3 ARG=<multicolvar> ATOMS=<group>',
                example: `# Local Q3
lq3: LOCAL_Q3 ARG=q3 ATOMS=1-10`,
                components: []
            },
            {
                name: 'LOCAL_Q4',
                category: 'MultiColvar',
                description: 'Calculate the local degree of order around an atoms by taking the average dot product between the q_4 vector on the central atom and the q_4 vector on the atoms in the first coordination sphere.',
                syntax: 'LOCAL_Q4 ARG=<multicolvar> ATOMS=<group>',
                example: `# Local Q4
lq4: LOCAL_Q4 ARG=q4 ATOMS=1-10`,
                components: []
            },
            {
                name: 'LOCAL_Q6',
                category: 'MultiColvar',
                description: 'Calculate the local degree of order around an atoms by taking the average dot product between the q_6 vector on the central atom and the q_6 vector on the atoms in the first coordination sphere.',
                syntax: 'LOCAL_Q6 ARG=<multicolvar> ATOMS=<group>',
                example: `# Local Q6
lq6: LOCAL_Q6 ARG=q6 ATOMS=1-10`,
                components: []
            },
            {
                name: 'MCOLV_COMBINE',
                category: 'MultiColvar',
                description: 'Calculate linear combinations of multiple multicolvars.',
                syntax: 'MCOLV_COMBINE ARG=<cv1>,<cv2>,... COEFFICIENTS=<c1>,<c2>,...',
                example: `# Combine multicolvars
comb: MCOLV_COMBINE ARG=distances,angles COEFFICIENTS=1.0,2.0`,
                components: []
            },
            {
                name: 'MCOLV_PRODUCT',
                category: 'MultiColvar',
                description: 'Calculate a product of multiple multicolvars.',
                syntax: 'MCOLV_PRODUCT ARG=<cv1>,<cv2>,...',
                example: `# Product of multicolvars
prod: MCOLV_PRODUCT ARG=distances,angles`,
                components: []
            },
            {
                name: 'NLINKS',
                category: 'MultiColvar',
                description: 'Calculate number of pairs of atoms/molecules that are linked.',
                syntax: 'NLINKS ARG=<multicolvar>',
                example: `# Number of links
nlinks: NLINKS ARG=distances`,
                components: []
            },
            {
                name: 'PAMM',
                category: 'MultiColvar',
                description: 'Probabilistic analysis of molecular motifs.',
                syntax: 'PAMM ATOMS=<group> [MEAN]',
                example: `# PAMM
pamm: PAMM ATOMS=1-100 MEAN`,
                components: []
            },
            {
                name: 'POLYMER_ANGLES',
                category: 'MultiColvar',
                description: 'Calculate a function to investigate the relative orientations of polymer angles.',
                syntax: 'POLYMER_ANGLES ATOMS=<group> [MEAN]',
                example: `# Polymer angles
poly: POLYMER_ANGLES ATOMS=1-100 MEAN`,
                components: []
            },
            {
                name: 'SMAC',
                category: 'MultiColvar',
                description: 'Calculate a variant on the SMAC collective variable.',
                syntax: 'SMAC ATOMS=<group> [MEAN]',
                example: `# SMAC
smac: SMAC ATOMS=1-100 MEAN`,
                components: []
            },
            {
                name: 'MTRANSFORM_BETWEEN',
                category: 'MultiColvar',
                description: 'This action can be used to transform the colvar values calculated by a MultiColvar using a histogram bead.',
                syntax: 'MTRANSFORM_BETWEEN ARG=<multicolvar> LOWER=<lower> UPPER=<upper>',
                example: `# Transform between
trans: MTRANSFORM_BETWEEN ARG=distances LOWER=2.0 UPPER=5.0`,
                components: []
            },
            {
                name: 'MTRANSFORM_LESS',
                category: 'MultiColvar',
                description: 'This action can be used to transform the colvar values calculated by a multicovar using a switching function.',
                syntax: 'MTRANSFORM_LESS ARG=<multicolvar> TOLERANCE=<tol>',
                example: `# Transform less
trans: MTRANSFORM_LESS ARG=distances TOLERANCE=3.0`,
                components: []
            },
            {
                name: 'MTRANSFORM_MORE',
                category: 'MultiColvar',
                description: 'This action can be used to transform the colvar values calculated by a multicolvar using one minus a switching function.',
                syntax: 'MTRANSFORM_MORE ARG=<multicolvar> TOLERANCE=<tol>',
                example: `# Transform more
trans: MTRANSFORM_MORE ARG=distances TOLERANCE=5.0`,
                components: []
            },
            {
                name: 'LWALLS',
                category: 'MultiColvar',
                description: 'Add LOWER_WALLS restraints on all the multicolvar values.',
                syntax: 'LWALLS ARG=<multicolvar> AT=<value> KAPPA=<kappa>',
                example: `# Lower walls
lwalls: LWALLS ARG=distances AT=2.0 KAPPA=10.0`,
                components: []
            },
            {
                name: 'UWALLS',
                category: 'MultiColvar',
                description: 'Add UPPER_WALL restraint on all the multicolvar values.',
                syntax: 'UWALLS ARG=<multicolvar> AT=<value> KAPPA=<kappa>',
                example: `# Upper walls
uwalls: UWALLS ARG=distances AT=10.0 KAPPA=10.0`,
                components: []
            },
            // Contact Matrix CVs - Adjacency Matrices
            {
                name: 'ALIGNED_MATRIX',
                category: 'Contact Matrix',
                description: 'Adjacency matrix in which two molecules are adjacent if they are within a certain cutoff and if they have the same orientation.',
                syntax: 'ALIGNED_MATRIX GROUPA=<group1> GROUPB=<group2> SWITCH=<switch>',
                example: `# Aligned matrix
am: ALIGNED_MATRIX GROUPA=1-10 GROUPB=11-20 SWITCH={RATIONAL R_0=5.0}`,
                components: []
            },
            {
                name: 'CONTACT_MATRIX',
                category: 'Contact Matrix',
                description: 'Adjacency matrix in which two atoms are adjacent if they are within a certain cutoff.',
                syntax: 'CONTACT_MATRIX GROUPA=<group1> GROUPB=<group2> SWITCH=<switch>',
                example: `# Contact matrix
cm: CONTACT_MATRIX GROUPA=1-50 GROUPB=1-50 SWITCH={RATIONAL R_0=4.0}`,
                components: []
            },
            {
                name: 'HBOND_MATRIX',
                category: 'Contact Matrix',
                description: 'Adjacency matrix in which two atoms are adjacent if there is a hydrogen bond between them.',
                syntax: 'HBOND_MATRIX GROUPA=<group1> GROUPB=<group2> [SWITCH=<switch>]',
                example: `# Hydrogen bond matrix
hbm: HBOND_MATRIX GROUPA=1-100 GROUPB=1-100`,
                components: []
            },
            {
                name: 'HBPAMM_MATRIX',
                category: 'Contact Matrix',
                description: 'Adjacency matrix in which two electronegative atoms are adjacent if they are hydrogen bonded.',
                syntax: 'HBPAMM_MATRIX GROUPA=<group1> GROUPB=<group2> [SWITCH=<switch>]',
                example: `# HBPAMM matrix
hpmm: HBPAMM_MATRIX GROUPA=1-50 GROUPB=51-100`,
                components: []
            },
            {
                name: 'SMAC_MATRIX',
                category: 'Contact Matrix',
                description: 'Adjacency matrix in which two molecules are adjacent if they are within a certain cutoff and if the angle between them is within certain ranges.',
                syntax: 'SMAC_MATRIX GROUPA=<group1> GROUPB=<group2> SWITCH=<switch>',
                example: `# SMAC matrix
smacm: SMAC_MATRIX GROUPA=1-20 GROUPB=21-40 SWITCH={RATIONAL R_0=6.0}`,
                components: []
            },
            {
                name: 'TOPOLOGY_MATRIX',
                category: 'Contact Matrix',
                description: 'Adjacency matrix in which two atoms are adjacent if they are connected topologically.',
                syntax: 'TOPOLOGY_MATRIX GROUPA=<group1> GROUPB=<group2>',
                example: `# Topology matrix
tm: TOPOLOGY_MATRIX GROUPA=1-100 GROUPB=1-100`,
                components: []
            },
            // Contact Matrix CVs - Operations
            {
                name: 'CLUSTER_WITHSURFACE',
                category: 'Contact Matrix',
                description: 'Take a connected component that was found using a clustering algorithm and create a new cluster that contains those atoms that are in the cluster together with those atoms that are within a certain cutoff of the cluster.',
                syntax: 'CLUSTER_WITHSURFACE CLUSTERS=<clusters> DATA=<data> CUTOFF=<cutoff>',
                example: `# Cluster with surface
cws: CLUSTER_WITHSURFACE CLUSTERS=clusters DATA=cm CUTOFF=3.0`,
                components: []
            },
            {
                name: 'COLUMNSUMS',
                category: 'Contact Matrix',
                description: 'Sum the columns of a contact matrix.',
                syntax: 'COLUMNSUMS MATRIX=<matrix>',
                example: `# Column sums
cs: COLUMNSUMS MATRIX=cm`,
                components: []
            },
            {
                name: 'DFSCLUSTERING',
                category: 'Contact Matrix',
                description: 'Find the connected components of the matrix using the depth first search clustering algorithm.',
                syntax: 'DFSCLUSTERING MATRIX=<matrix>',
                example: `# DFS clustering
dfs: DFSCLUSTERING MATRIX=cm`,
                components: []
            },
            {
                name: 'ROWSUMS',
                category: 'Contact Matrix',
                description: 'Sum the rows of an adjacency matrix.',
                syntax: 'ROWSUMS MATRIX=<matrix>',
                example: `# Row sums
rs: ROWSUMS MATRIX=cm`,
                components: []
            },
            {
                name: 'SPRINT',
                category: 'Contact Matrix',
                description: 'Calculate SPRINT topological variables from an adjacency matrix.',
                syntax: 'SPRINT MATRIX=<matrix>',
                example: `# SPRINT
sprint: SPRINT MATRIX=cm`,
                components: []
            },
            // Contact Matrix CVs - Connected Components
            {
                name: 'CLUSTER_DIAMETER',
                category: 'Contact Matrix',
                description: 'Print out the diameter of one of the connected components.',
                syntax: 'CLUSTER_DIAMETER CLUSTERS=<clusters> CLUSTER=<cluster_id>',
                example: `# Cluster diameter
cd: CLUSTER_DIAMETER CLUSTERS=clusters CLUSTER=1`,
                components: []
            },
            {
                name: 'CLUSTER_DISTRIBUTION',
                category: 'Contact Matrix',
                description: 'Calculate functions of the distribution of properties in your connected components.',
                syntax: 'CLUSTER_DISTRIBUTION CLUSTERS=<clusters> DATA=<data>',
                example: `# Cluster distribution
cdist: CLUSTER_DISTRIBUTION CLUSTERS=clusters DATA=cm`,
                components: []
            },
            {
                name: 'CLUSTER_NATOMS',
                category: 'Contact Matrix',
                description: 'Gives the number of atoms in the connected component.',
                syntax: 'CLUSTER_NATOMS CLUSTERS=<clusters> CLUSTER=<cluster_id>',
                example: `# Cluster number of atoms
cna: CLUSTER_NATOMS CLUSTERS=clusters CLUSTER=1`,
                components: []
            },
            {
                name: 'CLUSTER_PROPERTIES',
                category: 'Contact Matrix',
                description: 'Calculate properties of the distribution of some quantities that are part of a connected component.',
                syntax: 'CLUSTER_PROPERTIES CLUSTERS=<clusters> DATA=<data>',
                example: `# Cluster properties
cp: CLUSTER_PROPERTIES CLUSTERS=clusters DATA=cm`,
                components: []
            },
            {
                name: 'DUMPGRAPH',
                category: 'Contact Matrix',
                description: 'Write out the connectivity of the nodes in the graph in dot format.',
                syntax: 'DUMPGRAPH CLUSTERS=<clusters> FILE=<file>',
                example: `# Dump graph
dg: DUMPGRAPH CLUSTERS=clusters FILE=graph.dot`,
                components: []
            },
            {
                name: 'OUTPUT_CLUSTER',
                category: 'Contact Matrix',
                description: 'Output the indices of the atoms in one of the clusters identified by a clustering object.',
                syntax: 'OUTPUT_CLUSTER CLUSTERS=<clusters> CLUSTER=<cluster_id> FILE=<file>',
                example: `# Output cluster
oc: OUTPUT_CLUSTER CLUSTERS=clusters CLUSTER=1 FILE=cluster.pdb`,
                components: []
            },
            // Additional Modules CVs
            {
                name: 'ANN',
                category: 'Additional Modules',
                description: 'Artificial Neural Network function. This CV uses a neural network to compute collective variables from atomic coordinates.',
                syntax: 'ANN ARG=<cv1>,<cv2>,... FILE=<network_file>',
                example: `# ANN collective variable
ann: ANN ARG=d1,d2 FILE=network.pb`,
                components: []
            },
            {
                name: 'DRR',
                category: 'Additional Modules',
                description: 'Dynamic Reference Restraint. This is part of the Extended-System Adaptive Biasing Force module for calculating PMF along CVs.',
                syntax: 'DRR ARG=<cv> [KAPPA=<kappa>] [TAU=<tau>]',
                example: `# DRR
drr: DRR ARG=distance KAPPA=100.0 TAU=0.1`,
                components: []
            },
            {
                name: 'FISST',
                category: 'Additional Modules',
                description: 'Infinite Switch Simulated Tempering in Force. Enhanced sampling method that uses force-based tempering.',
                syntax: 'FISST ARG=<cv> TEMP=<temp> [KAPPA=<kappa>]',
                example: `# FISST
fisst: FISST ARG=distance TEMP=300.0 KAPPA=10.0`,
                components: []
            },
            {
                name: 'FUNNEL',
                category: 'Additional Modules',
                description: 'Funnel-Metadynamics collective variable and bias action. Used for performing Funnel-Metadynamics on Molecular Dynamics simulations.',
                syntax: 'FUNNEL ARG=<cv> [ATOMS=<atoms>] [REFERENCE=<ref>]',
                example: `# Funnel-Metadynamics
funnel: FUNNEL ARG=distance ATOMS=1-100 REFERENCE=ref.pdb`,
                components: []
            },
            {
                name: 'MAZE',
                category: 'Additional Modules',
                description: 'Enhanced sampling methods for ligand unbinding from protein tunnels. This module implements CVs and biases for studying ligand escape pathways.',
                syntax: 'MAZE ARG=<cv> [ATOMS=<atoms>] [REFERENCE=<ref>]',
                example: `# MAZE
maze: MAZE ARG=distance ATOMS=1-50 REFERENCE=ref.pdb`,
                components: []
            },
            {
                name: 'OPES',
                category: 'Additional Modules',
                description: 'On-the-fly Probability Enhanced Sampling. Enhanced sampling method that adaptively builds a bias potential based on the probability distribution.',
                syntax: 'OPES ARG=<cv1>,<cv2>,... SIGMA=<sigma1>,<sigma2>,... [PACE=<pace>]',
                example: `# OPES
opes: OPES ARG=distance SIGMA=0.1 PACE=500`,
                components: []
            },
            {
                name: 'PIV',
                category: 'Additional Modules',
                description: 'Permutation Invariant collective variable. This CV is invariant to permutations of equivalent atoms, useful for studying systems with indistinguishable particles.',
                syntax: 'PIV ATOMS=<atoms> [SWITCH=<switch>]',
                example: `# PIV
piv: PIV ATOMS=1-100 SWITCH={RATIONAL R_0=5.0}`,
                components: []
            },
            {
                name: 'PYTORCH',
                category: 'Additional Modules',
                description: 'Machine Learning Collective Variables with PyTorch. This CV uses PyTorch models to compute collective variables from atomic coordinates.',
                syntax: 'PYTORCH ARG=<cv1>,<cv2>,... FILE=<model_file>',
                example: `# PyTorch CV
pytorch: PYTORCH ARG=d1,d2 FILE=model.pt`,
                components: []
            },
            {
                name: 'VES',
                category: 'Additional Modules',
                description: 'Variationally Enhanced Sampling. Enhanced sampling method based on Variationally Enhanced Sampling that optimizes a bias potential.',
                syntax: 'VES ARG=<cv1>,<cv2>,... SIGMA=<sigma1>,<sigma2>,... [PACE=<pace>]',
                example: `# VES
ves: VES ARG=distance SIGMA=0.1 PACE=500`,
                components: []
            }
        ];
        
        // Sort CVs alphabetically by name
        cvs.sort((a, b) => a.name.localeCompare(b.name));
        
        return cvs;
    }

    getPlumedDocumentationUrl(cv) {
        // PLUMED documentation URLs follow the pattern: _c_v_n_a_m_e.html
        // where each letter is separated by underscores
        // Example: CONSTANT -> _c_o_n_s_t_a_n_t.html
        //          CELL -> _c_e_l_l.html
        //          PIECEWISE -> _p_i_e_c_e_w_i_s_e.html
        //          MULTI_RMSD -> _m_u_l_t_i__r_m_s_d.html (underscore in name becomes double underscore)
        // Special case: Q3, Q4, Q6 use _q3.html format (no underscores between characters)
        // Special case: LOCAL_Q3, LOCAL_Q4, LOCAL_Q6 use _l_o_c_a_l__q3.html format
        
        const baseUrl = 'https://www.plumed.org/doc-v2.9/user-doc/html/';
        
        // Convert CV name to lowercase
        const cvNameLower = cv.name.toLowerCase();
        
        // Special handling for short CV names with numbers (Q3, Q4, Q6)
        // These use format _q3.html instead of _q_3.html
        if (cvNameLower === 'q3' || cvNameLower === 'q4' || cvNameLower === 'q6') {
            return baseUrl + '_' + cvNameLower + '.html';
        }
        
        // Special handling for LOCAL_Q3, LOCAL_Q4, LOCAL_Q6
        // These use format _l_o_c_a_l__q3.html (q3/q4/q6 as single units)
        if (cvNameLower === 'local_q3' || cvNameLower === 'local_q4' || cvNameLower === 'local_q6') {
            const qPart = cvNameLower.substring(6); // Extract 'q3', 'q4', or 'q6'
            return baseUrl + '_l_o_c_a_l__' + qPart + '.html';
        }
        
        // Build formatted name: separate each character with underscores
        // Existing underscores in CV name become double underscores
        let formattedName = '_';
        for (let i = 0; i < cvNameLower.length; i++) {
            const char = cvNameLower[i];
            if (char === '_') {
                // Existing underscore becomes double underscore (no separator before/after)
                formattedName += '__';
            } else {
                formattedName += char;
                // Add separator underscore if not the last character and next char is not underscore
                if (i < cvNameLower.length - 1 && cvNameLower[i + 1] !== '_') {
                    formattedName += '_';
                }
            }
        }
        formattedName += '.html';
        
        return baseUrl + formattedName;
    }

    renderCVList() {
        const cvList = document.getElementById('cv-list');
        if (!cvList) return;

        cvList.innerHTML = '';
        
        // Sort CVs alphabetically by name
        const sortedCVs = [...this.cvs].sort((a, b) => {
            return a.name.localeCompare(b.name);
        });
        
        sortedCVs.forEach(cv => {
            const cvItem = document.createElement('div');
            cvItem.className = 'cv-item';
            cvItem.dataset.cvName = cv.name;
            
            cvItem.innerHTML = `
                <div>
                    <div class="cv-item-name">${cv.name}</div>
                    <div class="cv-item-category">${cv.category}</div>
                </div>
                <i class="fas fa-chevron-right cv-item-icon"></i>
            `;
            
            cvItem.addEventListener('click', () => this.selectCV(cv.name));
            cvList.appendChild(cvItem);
        });
    }
    
    addCV(cv) {
        /**
         * Add a new CV and maintain alphabetical order
         * @param {Object} cv - CV object with name, category, description, syntax, example, components
         */
        // Check if CV already exists
        const existingIndex = this.cvs.findIndex(c => c.name === cv.name);
        if (existingIndex !== -1) {
            // Update existing CV
            this.cvs[existingIndex] = cv;
        } else {
            // Add new CV
            this.cvs.push(cv);
        }
        
        // Sort CVs alphabetically
        this.cvs.sort((a, b) => a.name.localeCompare(b.name));
        
        // Re-render the list
        this.renderCVList();
    }

    selectCV(cvName) {
        // Save current editor content before switching
        if (this.selectedCV) {
            const currentEditor = document.getElementById('cv-editor');
            if (currentEditor) {
                this.cvEditorContent[this.selectedCV.name] = currentEditor.value;
            }
        }

        const cv = this.cvs.find(c => c.name === cvName);
        if (!cv) return;

        this.selectedCV = cv;

        // Update active state
        document.querySelectorAll('.cv-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-cv-name="${cvName}"]`)?.classList.add('active');

        // Show content
        this.displayCVContent(cv);
    }

    displayCVContent(cv) {
        // Hide welcome message
        document.getElementById('welcome-message').style.display = 'none';
        
        // Show content header
        const contentHeader = document.getElementById('content-header');
        contentHeader.style.display = 'flex';
        
        // Get PLUMED documentation URL for this CV
        const plumedUrl = this.getPlumedDocumentationUrl(cv);
        const cvTitleElement = document.getElementById('cv-title');
        cvTitleElement.innerHTML = `${cv.name} <a href="${plumedUrl}" target="_blank" rel="noopener noreferrer" class="plumed-doc-link" title="View ${cv.name} documentation on PLUMED website"><i class="fas fa-external-link-alt"></i></a>`;

        // Check if comprehensive documentation exists
        const fullDoc = window.PLUMED_CV_DOCUMENTATION && window.PLUMED_CV_DOCUMENTATION[cv.name];
        const docToUse = fullDoc || cv;
        
        // Debug: log if documentation is found
        if (!fullDoc && window.PLUMED_CV_DOCUMENTATION) {
            console.log(`Full documentation not found for ${cv.name}, using basic documentation`);
        } else if (!window.PLUMED_CV_DOCUMENTATION) {
            console.warn('PLUMED_CV_DOCUMENTATION not loaded. Make sure plumed_cv_docs.js is loaded before plumed.js');
        }

        // Show documentation
        const docSection = document.getElementById('cv-documentation');
        docSection.style.display = 'block';
        
        // Module
        const moduleSection = document.getElementById('cv-module-section');
        if (fullDoc && fullDoc.module) {
            moduleSection.style.display = 'block';
            document.getElementById('cv-module').textContent = `This is part of the ${fullDoc.module} module`;
        } else {
            moduleSection.style.display = 'none';
        }
        
        // Description
        const descElement = document.getElementById('cv-description');
        if (fullDoc && fullDoc.description) {
            // Handle both string and array descriptions
            let descText;
            if (Array.isArray(fullDoc.description)) {
                // Join array elements with double newlines for paragraph separation
                descText = fullDoc.description.join('\n\n');
            } else {
                descText = fullDoc.description;
            }
            
            // FIRST: Convert Unicode subscripts/superscripts to HTML
            descText = this.formatSubscriptsAndSuperscripts(descText);
            
            // THEN: Process mathematical expressions (sqrt, fractions, etc.)
            descText = this.formatMathExpressions(descText);
            
            // FINALLY: Format the description with better structure (paragraphs, bullets, etc.)
            let descHTML = this.formatDescription(descText);
            descElement.innerHTML = descHTML;
        } else if (cv.description) {
            // Fallback for CVs without full documentation
            let descText = cv.description;
            // Convert Unicode subscripts/superscripts first
            descText = this.formatSubscriptsAndSuperscripts(descText);
            // Then process math expressions
            descText = this.formatMathExpressions(descText);
            // Finally format structure
            let descHTML = this.formatDescription(descText);
            descElement.innerHTML = descHTML || `<p>${cv.description}</p>`;
        } else {
            descElement.textContent = '';
        }
        
        // Syntax
        document.getElementById('cv-syntax').textContent = docToUse.syntax || cv.syntax;
        
        // Glossary
        const glossarySection = document.getElementById('cv-glossary-section');
        if (fullDoc && fullDoc.options && fullDoc.options.length > 0) {
            glossarySection.style.display = 'block';
            let glossaryHTML = '<div class="glossary-content">';
            glossaryHTML += '<p><strong>The atoms involved can be specified using</strong></p>';
            fullDoc.options.forEach(opt => {
                glossaryHTML += `
                    <div class="glossary-item">
                        <strong><code>${opt.keyword}</code></strong>
                        <p>${opt.description}</p>
                    </div>
                `;
            });
            glossaryHTML += '</div>';
            document.getElementById('cv-glossary').innerHTML = glossaryHTML;
        } else {
            glossarySection.style.display = 'none';
        }
        
        // Options
        const optionsSection = document.getElementById('cv-options-section');
        if (fullDoc && fullDoc.options && fullDoc.options.length > 0) {
            optionsSection.style.display = 'block';
            
            // Update the heading to include color legend
            const optionsHeading = optionsSection.querySelector('h4');
            if (optionsHeading) {
                optionsHeading.classList.add('options-heading-with-legend');
                optionsHeading.innerHTML = `
                    <i class="fas fa-list-ul"></i> Options
                    <span class="color-legend">
                        <span class="legend-item">
                            <code class="keyword-required">Required</code>
                        </span>
                        <span class="legend-item">
                            <code class="keyword-optional">Optional</code>
                        </span>
                    </span>
                `;
            }
            
            let optionsHTML = '<div class="options-keywords">';
            fullDoc.options.forEach(opt => {
                const defaultText = opt.default ? ` (default=${opt.default})` : '';
                const keywordClass = opt.required ? 'keyword-required' : 'keyword-optional';
                optionsHTML += `<code class="${keywordClass}">${opt.keyword}${defaultText}</code>`;
            });
            optionsHTML += '</div>';
            document.getElementById('cv-options').innerHTML = optionsHTML;
        } else {
            optionsSection.style.display = 'none';
        }
        
        // Components
        const componentsSection = document.getElementById('cv-components-section');
        if (fullDoc && fullDoc.components && fullDoc.components.length > 0) {
            componentsSection.style.display = 'block';
            let componentsHTML = '<div class="components-list">';
            fullDoc.components.forEach(comp => {
                componentsHTML += `
                    <div class="component-item">
                        <strong><code>${comp.name}</code></strong>
                        <p>${comp.description}</p>
                    </div>
                `;
            });
            componentsHTML += '</div>';
            document.getElementById('cv-components').innerHTML = componentsHTML;
        } else if (cv.components && cv.components.length > 0) {
            componentsSection.style.display = 'block';
            document.getElementById('cv-components').innerHTML = 
                `<p>Available components: <code>${cv.components.join(', ')}</code></p>`;
        } else {
            componentsSection.style.display = 'none';
        }
        
        // Examples
        const exampleElement = document.getElementById('cv-example');
        if (fullDoc && fullDoc.examples && fullDoc.examples.length > 0) {
            let examplesHTML = '';
            fullDoc.examples.forEach((ex, idx) => {
                if (ex.title) {
                    examplesHTML += `# ${ex.title}\n${ex.code}\n\n`;
                } else {
                    examplesHTML += `${ex.code}\n\n`;
                }
            });
            exampleElement.textContent = examplesHTML.trim();
        } else {
            exampleElement.textContent = cv.example || '';
        }
        
        // Notes
        const notesSection = document.getElementById('cv-notes-section');
        if (fullDoc && fullDoc.notes && fullDoc.notes.length > 0) {
            notesSection.style.display = 'block';
            let notesHTML = '<ul class="notes-list">';
            fullDoc.notes.forEach(note => {
                notesHTML += `<li>${note}</li>`;
            });
            notesHTML += '</ul>';
            document.getElementById('cv-notes').innerHTML = notesHTML;
        } else {
            notesSection.style.display = 'none';
        }
        
        // Related CVs
        const relatedSection = document.getElementById('cv-related-section');
        if (fullDoc && fullDoc.related && fullDoc.related.length > 0) {
            relatedSection.style.display = 'block';
            let relatedHTML = '<div class="related-cvs">';
            fullDoc.related.forEach(rel => {
                relatedHTML += `<span class="related-cv-badge" data-cv="${rel}">${rel}</span>`;
            });
            relatedHTML += '</div>';
            document.getElementById('cv-related').innerHTML = relatedHTML;
            
            // Add click handlers for related CVs
            document.querySelectorAll('.related-cv-badge').forEach(badge => {
                badge.addEventListener('click', () => {
                    this.selectCV(badge.dataset.cv);
                });
            });
        } else {
            relatedSection.style.display = 'none';
        }

        // Show editor
        const editorSection = document.getElementById('cv-editor-section');
        editorSection.style.display = 'block';
        
        // Load editor content in priority order:
        // 1. Previously edited content (if user was editing this CV)
        // 2. Saved config (if user saved a named config)
        // 3. Example code (default)
        const editor = document.getElementById('cv-editor');
        if (this.cvEditorContent[cv.name] && this.cvEditorContent[cv.name].trim() !== '') {
            // Restore user's edited content
            editor.value = this.cvEditorContent[cv.name];
        } else {
            // Check for saved config
            const savedConfig = this.savedConfigs.find(c => c.cvName === cv.name);
            if (savedConfig && savedConfig.config) {
                editor.value = savedConfig.config;
            } else {
                // Use first example if available, otherwise use the example field
                if (fullDoc && fullDoc.examples && fullDoc.examples.length > 0) {
                    editor.value = fullDoc.examples[0].code;
                } else {
                    editor.value = cv.example || '';
                }
            }
        }
        
        this.updateEditorStats();
        this.displaySavedConfigs();
    }

    setupEventListeners() {
        // Reset button
        const resetBtn = document.getElementById('reset-cv');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (this.selectedCV) {
                    const editor = document.getElementById('cv-editor');
                    // Reset to example and clear saved content
                    const fullDoc = window.PLUMED_CV_DOCUMENTATION && window.PLUMED_CV_DOCUMENTATION[this.selectedCV.name];
                    if (fullDoc && fullDoc.examples && fullDoc.examples.length > 0) {
                        editor.value = fullDoc.examples[0].code;
                    } else {
                        editor.value = this.selectedCV.example || '';
                    }
                    // Clear saved editor content for this CV
                    this.cvEditorContent[this.selectedCV.name] = '';
                    this.updateEditorStats();
                }
            });
        }

        // Copy button
        const copyBtn = document.getElementById('copy-config');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const editor = document.getElementById('cv-editor');
                editor.select();
                document.execCommand('copy');
                
                // Visual feedback
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                }, 2000);
            });
        }

        // View PDB button
        const viewPdbBtn = document.getElementById('view-pdb');
        if (viewPdbBtn) {
            viewPdbBtn.addEventListener('click', () => {
                this.viewPDBFile();
            });
        }

        // Save button
        const saveBtn = document.getElementById('save-config');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveCurrentConfig();
            });
        }

        // Editor stats update
        const editor = document.getElementById('cv-editor');
        if (editor) {
            editor.addEventListener('input', () => this.updateEditorStats());
        }
    }

    setupSearch() {
        const searchInput = document.getElementById('cv-search');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            this.filterCVs(query);
        });
    }

    filterCVs(query) {
        const cvItems = document.querySelectorAll('.cv-item');
        
        cvItems.forEach(item => {
            const cvName = item.dataset.cvName.toLowerCase();
            const category = item.querySelector('.cv-item-category').textContent.toLowerCase();
            
            if (cvName.includes(query) || category.includes(query)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    updateEditorStats() {
        const editor = document.getElementById('cv-editor');
        if (!editor) return;

        const text = editor.value;
        const charCount = text.length;
        const lineCount = text.split('\n').length;

        document.getElementById('char-count').textContent = charCount;
        document.getElementById('line-count').textContent = lineCount;
    }

    async saveCurrentConfig() {
        if (!this.selectedCV) return;

        const editor = document.getElementById('cv-editor');
        const config = editor.value.trim();

        if (!config) {
            alert('Please enter a configuration before saving.');
            return;
        }

        // Prompt for filename with default "plumed.dat"
        const filename = prompt('Enter filename (default: plumed.dat):', 'plumed.dat');
        
        if (!filename) {
            // User cancelled
            return;
        }

        // Use default if user just pressed OK without entering anything
        const finalFilename = filename.trim() || 'plumed.dat';

        // Visual feedback - show loading
        const saveBtn = document.getElementById('save-config');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        try {
            // Send to backend API
            const response = await plumedApiFetch('/api/save-plumed-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    plumed_content: config,
                    filename: finalFilename
                })
            });

            const result = await response.json();

            if (result.success) {
                // Success feedback
                saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
                saveBtn.style.color = '#28a745';
                
                // Show success message
                setTimeout(() => {
                    saveBtn.innerHTML = originalText;
                    saveBtn.style.color = '';
                    saveBtn.disabled = false;
                }, 2000);
            } else {
                // Error feedback
                saveBtn.innerHTML = '<i class="fas fa-times"></i> Error';
                saveBtn.style.color = '#dc3545';
                alert(`Error saving file: ${result.error || 'Unknown error'}`);
                
                setTimeout(() => {
                    saveBtn.innerHTML = originalText;
                    saveBtn.style.color = '';
                    saveBtn.disabled = false;
                }, 3000);
            }
        } catch (error) {
            // Network or other error
            saveBtn.innerHTML = '<i class="fas fa-times"></i> Error';
            saveBtn.style.color = '#dc3545';
            alert(`Error saving file: ${error.message}`);
            
            setTimeout(() => {
                saveBtn.innerHTML = originalText;
                saveBtn.style.color = '';
                saveBtn.disabled = false;
            }, 3000);
        }
    }

    viewPDBFile() {
        // Open PDB file directly via backend route - instant opening!
        // Backend serves it as HTML page, no need to fetch content first
        window.open('/view-pdb', '_blank');
    }

    async viewPDBFileViaAPI() {
        // Fallback method: fetch via API if direct file access fails
        const viewPdbBtns = document.querySelectorAll('#view-pdb, #view-pdb-custom');
        const originalTexts = [];
        viewPdbBtns.forEach(btn => {
            originalTexts.push(btn.innerHTML);
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            btn.disabled = true;
        });

        try {
            // Fetch PDB content from backend
            const response = await plumedApiFetch('/api/get-viewer-pdb', {
                method: 'GET'
            });

            const result = await response.json();

            if (result.success && result.content) {
                // Create a blob with the PDB content
                const blob = new Blob([result.content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                
                // Open in new tab
                window.open(url, '_blank');
                
                // Clean up blob URL after a delay
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                }, 1000);
                
                // Reset buttons
                viewPdbBtns.forEach((btn, index) => {
                    btn.innerHTML = originalTexts[index];
                    btn.disabled = false;
                });
            } else {
                // Show error
                alert(`Error loading PDB file: ${result.error || 'Failed to load PDB file. Make sure you have completed the structure preparation steps.'}`);
                
                // Reset buttons
                viewPdbBtns.forEach((btn, index) => {
                    btn.innerHTML = originalTexts[index];
                    btn.disabled = false;
                });
            }
        } catch (error) {
            // Show error
            alert(`Error loading PDB file: ${error.message}`);
            
            // Reset buttons
            viewPdbBtns.forEach((btn, index) => {
                btn.innerHTML = originalTexts[index];
                btn.disabled = false;
            });
        }
    }

    displaySavedConfigs() {
        const savedConfigsSection = document.getElementById('saved-configs');
        const configsList = document.getElementById('configs-list');
        
        if (!savedConfigsSection || !configsList) return;

        const currentCVConfigs = this.savedConfigs.filter(
            c => c.cvName === this.selectedCV?.name
        );

        if (currentCVConfigs.length === 0) {
            savedConfigsSection.style.display = 'none';
            return;
        }

        savedConfigsSection.style.display = 'block';
        configsList.innerHTML = '';

        currentCVConfigs.forEach((config, index) => {
            const configItem = document.createElement('div');
            configItem.className = 'config-item';
            
            configItem.innerHTML = `
                <div>
                    <div class="config-item-name">${config.name}</div>
                    <div style="font-size: 0.85rem; color: #7f8c8d; margin-top: 0.25rem;">
                        ${new Date(config.timestamp).toLocaleString()}
                    </div>
                </div>
                <div class="config-item-actions">
                    <button class="btn btn-sm btn-info load-config" data-index="${index}">
                        <i class="fas fa-upload"></i> Load
                    </button>
                    <button class="btn btn-sm btn-danger delete-config" data-index="${index}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;

            // Load config
            configItem.querySelector('.load-config').addEventListener('click', () => {
                document.getElementById('cv-editor').value = config.config;
                this.updateEditorStats();
            });

            // Delete config
            configItem.querySelector('.delete-config').addEventListener('click', () => {
                if (confirm('Are you sure you want to delete this configuration?')) {
                    this.savedConfigs.splice(
                        this.savedConfigs.findIndex(c => 
                            c.cvName === config.cvName && 
                            c.name === config.name && 
                            c.timestamp === config.timestamp
                        ), 1
                    );
                    this.saveSavedConfigs();
                    this.displaySavedConfigs();
                }
            });

            configsList.appendChild(configItem);
        });
    }

    loadSavedConfigs() {
        try {
            const saved = localStorage.getItem('plumed_saved_configs');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Error loading saved configs:', e);
            return [];
        }
    }

    saveSavedConfigs() {
        try {
            localStorage.setItem('plumed_saved_configs', JSON.stringify(this.savedConfigs));
        } catch (e) {
            console.error('Error saving configs:', e);
        }
    }

    formatMathExpressions(text) {
        // Step 1: First handle sqrt() with nested parentheses - do this before fractions
        // Replace sqrt() by finding balanced parentheses
        let result = '';
        let i = 0;
        while (i < text.length) {
            if (text.substring(i, i + 5) === 'sqrt(') {
                // Found sqrt(, now find matching closing parenthesis
                let depth = 1;
                let start = i + 5;
                let j = start;
                
                while (j < text.length && depth > 0) {
                    if (text[j] === '(') depth++;
                    if (text[j] === ')') depth--;
                    j++;
                }
                
                if (depth === 0) {
                    // Found matching parenthesis
                    let content = text.substring(start, j - 1);
                    // Process content for fractions and other math
                    content = this.processMathContent(content);
                    result += `<span class="math-sqrt"><span class="math-sqrt-symbol">√</span><span class="math-radicand">${content}</span></span>`;
                    i = j;
                } else {
                    result += text[i];
                    i++;
                }
            } else {
                result += text[i];
                i++;
            }
        }
        text = result;
        
        // Step 2: Handle fractions like (1/N), (1/M) - convert to HTML fraction format
        // Only process fractions that are not already inside formatted elements
        text = text.replace(/\((\d+)\/([A-Za-z_]+)\)/g, (match, num, den, offset, string) => {
            // Check if we're inside a math-radicand or math-fraction (already processed)
            let before = string.substring(Math.max(0, offset - 50), offset);
            if (before.includes('math-radicand') || before.includes('math-fraction')) {
                return match; // Already processed, skip
            }
            return `<span class="math-fraction"><span class="math-numerator">${num}</span><span class="math-denominator">${den}</span></span>`;
        });
        
        // Step 3: Replace superscript notation (^2, ^3, etc.) with Unicode superscripts
        text = text.replace(/\^2/g, '²');
        text = text.replace(/\^3/g, '³');
        text = text.replace(/\^4/g, '⁴');
        text = text.replace(/\^5/g, '⁵');
        text = text.replace(/\^6/g, '⁶');
        text = text.replace(/\^7/g, '⁷');
        text = text.replace(/\^8/g, '⁸');
        text = text.replace(/\^9/g, '⁹');
        text = text.replace(/\^0/g, '⁰');
        text = text.replace(/\^\(([^)]+)\)/g, '<sup>$1</sup>');
        
        // Step 4: Replace subscript notation (_i, _j, etc.) but preserve Unicode subscripts
        text = text.replace(/_([0-9a-z])(?![₀₁₂₃₄₅₆₇₈₉ᵢⱼₖₗₘₙₒₚₛₜᵤᵥ])/g, '<sub>$1</sub>');
        
        // Step 5: Format summation symbols with subscripts
        // Note: Unicode subscripts should already be converted to HTML by formatSubscriptsAndSuperscripts
        // This handles cases where Σ is followed by HTML sub tags
        text = text.replace(/Σ<sub>([^<]+)<\/sub>/g, 'Σ<sub>$1</sub>');
        
        return text;
    }
    
    processMathContent(content) {
        // Process mathematical content inside sqrt or other expressions
        // Handle fractions
        content = content.replace(/\((\d+)\/([A-Za-z_]+)\)/g, '<span class="math-fraction"><span class="math-numerator">$1</span><span class="math-denominator">$2</span></span>');
        // Handle superscripts
        content = content.replace(/\^2/g, '²');
        content = content.replace(/\^3/g, '³');
        return content;
    }
    
    formatDescription(text) {
        // Note: Unicode subscripts/superscripts should already be converted to HTML
        // by formatSubscriptsAndSuperscripts before this function is called
        
        // Split into paragraphs (double newlines)
        let paragraphs = text.split(/\n\n+/);
        let descHTML = '';
        
        paragraphs.forEach(para => {
            if (para.trim()) {
                // Check if paragraph contains a mathematical formula
                const hasMathSymbols = /[θπφΣ√∑∫∂∇αβγδ]/u.test(para);
                const hasMathOperators = /[·×÷±≤≥≠≈]/u.test(para);
                const hasMathFunctions = /\b(arccos|arcsin|arctan|cos|sin|tan|exp|log|ln|sqrt|sum|integral)\b/i.test(para);
                const hasSubscripts = /[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ᵢⱼₖₗₘₙₒₚₛₜᵤᵥᵦᵧᵨᵩᵪ]|<sub>|<sup>/u.test(para);
                const hasSuperscripts = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛᵝᵞᵟᵠᵡ]|<sup>/u.test(para);
                const hasEquation = /=\s*[^=]+/.test(para) && (hasMathSymbols || hasMathOperators || hasMathFunctions || hasSubscripts || hasSuperscripts);
                const hasFraction = /\(\d+\/\w+\)|math-fraction/.test(para);
                
                if (hasEquation || hasFraction || (hasMathSymbols && hasMathOperators)) {
                    // This is a formula - wrap in math-formula div
                    descHTML += `<div class="math-formula">${para.trim()}</div>`;
                } else {
                    // Check if paragraph contains bullet points (lines starting with -)
                    const lines = para.split('\n');
                    const hasBullets = lines.some(line => /^\s*-\s+/.test(line));
                    
                    if (hasBullets) {
                        // Format as bullet list
                        let inList = false;
                        lines.forEach((line, index) => {
                            line = line.trim();
                            if (line) {
                                if (/^\s*-\s+/.test(line)) {
                                    // Convert dash to bullet point
                                    if (!inList) {
                                        descHTML += '<ul class="description-list">';
                                        inList = true;
                                    }
                                    line = line.replace(/^\s*-\s+/, '');
                                    descHTML += `<li>${line}</li>`;
                                } else {
                                    // Regular text line
                                    if (inList) {
                                        descHTML += '</ul>';
                                        inList = false;
                                    }
                                    descHTML += `<p class="description-paragraph">${line}</p>`;
                                }
                            }
                        });
                        if (inList) {
                            descHTML += '</ul>';
                        }
                    } else {
                        // Regular paragraph with proper spacing
                        let paraHTML = para
                            .replace(/\n/g, '<br>')
                            .trim();
                        descHTML += `<p class="description-paragraph">${paraHTML}</p>`;
                    }
                }
            }
        });
        
        return descHTML;
    }
    
    formatSubscriptsAndSuperscripts(text) {
        // Map Unicode subscripts to their ASCII equivalents for HTML sub tags
        const subscriptMap = {
            '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
            '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
            'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm',
            'ₙ': 'n', 'ₒ': 'o', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't',
            'ᵤ': 'u', 'ᵥ': 'v', '₊': '+', '₋': '-', '₌': '=',
            '₍': '(', '₎': ')'
        };
        
        // Map Unicode superscripts to their ASCII equivalents for HTML sup tags
        const superscriptMap = {
            '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
            '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
            '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')'
        };
        
        // Handle sequences like rᵢᵣᵉᶠ (letter followed by multiple subscripts)
        // First, find patterns like rᵢᵣᵉᶠ and convert them properly
        text = text.replace(/([a-zA-Z])([₀₁₂₃₄₅₆₇₈₉ᵢⱼₖₗₘₙₒₚₛₜᵤᵥ]+)/g, (match, letter, subscripts) => {
            let result = letter;
            for (let char of subscripts) {
                if (subscriptMap[char]) {
                    result += `<sub>${subscriptMap[char]}</sub>`;
                } else {
                    result += char;
                }
            }
            return result;
        });
        
        // Replace remaining Unicode subscripts (single characters)
        Object.keys(subscriptMap).forEach(unicode => {
            // Escape special regex characters
            const escaped = unicode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'g');
            text = text.replace(regex, `<sub>${subscriptMap[unicode]}</sub>`);
        });
        
        // Replace Unicode superscripts
        Object.keys(superscriptMap).forEach(unicode => {
            // Escape special regex characters
            const escaped = unicode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'g');
            text = text.replace(regex, `<sup>${superscriptMap[unicode]}</sup>`);
        });
        
        return text;
    }

    setupCustomPlumedEditor() {
        const customEditor = document.getElementById('custom-plumed-editor');
        const copyBtn = document.getElementById('copy-custom-plumed');
        const downloadBtn = document.getElementById('download-custom-plumed');
        const clearBtn = document.getElementById('clear-custom-plumed');
        const charCount = document.getElementById('custom-char-count');
        const lineCount = document.getElementById('custom-line-count');

        if (!customEditor) return;

        // Update character and line count
        const updateStats = () => {
            const content = customEditor.value;
            const chars = content.length;
            const lines = content.split('\n').length;
            
            if (charCount) charCount.textContent = chars;
            if (lineCount) lineCount.textContent = lines;
        };

        // Update stats on input
        customEditor.addEventListener('input', updateStats);
        updateStats();

        // Copy button
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                customEditor.select();
                document.execCommand('copy');
                
                // Visual feedback
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                copyBtn.classList.add('btn-success');
                copyBtn.classList.remove('btn-info');
                
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.classList.remove('btn-success');
                    copyBtn.classList.add('btn-info');
                }, 2000);
            });
        }

        // View PDB button
        const viewPdbCustomBtn = document.getElementById('view-pdb-custom');
        if (viewPdbCustomBtn) {
            viewPdbCustomBtn.addEventListener('click', () => {
                this.viewPDBFile();
            });
        }

        // Save button (changed from Download)
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async () => {
                const content = customEditor.value.trim();
                
                if (!content) {
                    alert('Please write some PLUMED configuration before saving.');
                    return;
                }

                // Prompt for filename with default "plumed.dat"
                const filename = prompt('Enter filename (default: plumed.dat):', 'plumed.dat');
                
                if (!filename) {
                    // User cancelled
                    return;
                }

                // Use default if user just pressed OK without entering anything
                const finalFilename = filename.trim() || 'plumed.dat';

                // Visual feedback - show loading
                const originalText = downloadBtn.innerHTML;
                downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                downloadBtn.disabled = true;

                try {
                    // Send to backend API
                    const response = await plumedApiFetch('/api/save-plumed-file', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            plumed_content: content,
                            filename: finalFilename
                        })
                    });

                    const result = await response.json();

                    if (result.success) {
                        // Success feedback
                        downloadBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
                        downloadBtn.style.color = '#28a745';
                        
                        // Show success message
                        setTimeout(() => {
                            downloadBtn.innerHTML = originalText;
                            downloadBtn.style.color = '';
                            downloadBtn.disabled = false;
                        }, 2000);
                    } else {
                        // Error feedback
                        downloadBtn.innerHTML = '<i class="fas fa-times"></i> Error';
                        downloadBtn.style.color = '#dc3545';
                        alert(`Error saving file: ${result.error || 'Unknown error'}`);
                        
                        setTimeout(() => {
                            downloadBtn.innerHTML = originalText;
                            downloadBtn.style.color = '';
                            downloadBtn.disabled = false;
                        }, 3000);
                    }
                } catch (error) {
                    // Network or other error
                    downloadBtn.innerHTML = '<i class="fas fa-times"></i> Error';
                    downloadBtn.style.color = '#dc3545';
                    alert(`Error saving file: ${error.message}`);
                    
                    setTimeout(() => {
                        downloadBtn.innerHTML = originalText;
                        downloadBtn.style.color = '';
                        downloadBtn.disabled = false;
                    }, 3000);
                }
            });
        }

        // Clear button
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear the entire custom PLUMED file?')) {
                    customEditor.value = '';
                    updateStats();
                }
            });
        }
    }

    setupCustomPlumedToggle() {
        const customToggleHeader = document.getElementById('custom-plumed-toggle-header');
        const customToggleIcon = document.getElementById('custom-plumed-toggle-icon');
        const customCard = document.getElementById('custom-plumed-card');

        if (customToggleHeader && customCard) {
            // Set as collapsed by default
            let customCollapsed = true;
            customCard.classList.add('collapsed');
            customToggleHeader.classList.add('collapsed');

            customToggleHeader.addEventListener('click', () => {
                customCollapsed = !customCollapsed;
                
                if (customCollapsed) {
                    customCard.classList.add('collapsed');
                    customToggleHeader.classList.add('collapsed');
                } else {
                    customCard.classList.remove('collapsed');
                    customToggleHeader.classList.remove('collapsed');
                }
            });
        }
    }

    setupGenerateSimulationFilesToggle() {
        const toggleHeader = document.getElementById('generate-simulation-files-toggle-header');
        const toggleIcon = document.getElementById('generate-simulation-files-toggle-icon');
        const card = document.getElementById('generate-simulation-files-card');

        if (toggleHeader && card) {
            // Set as collapsed by default
            let collapsed = true;
            card.classList.add('collapsed');
            toggleHeader.classList.add('collapsed');

            toggleHeader.addEventListener('click', () => {
                collapsed = !collapsed;
                
                if (collapsed) {
                    card.classList.add('collapsed');
                    toggleHeader.classList.add('collapsed');
                } else {
                    card.classList.remove('collapsed');
                    toggleHeader.classList.remove('collapsed');
                }
            });
        }

        // Generate Files button
        const generateBtn = document.getElementById('plumed-generate-files');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.generatePlumedFiles();
            });
        }

        // Preview Files button
        const previewBtn = document.getElementById('plumed-preview-files');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                this.previewPlumedFiles();
            });
        }

        // Download Files button
        const downloadBtn = document.getElementById('plumed-download-files');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                this.downloadPlumedFiles();
            });
        }
    }

    async generatePlumedFiles() {
        // Check if plumed.dat exists via API (use plumedApiFetch so same session as save is used)
        try {
            const checkResponse = await plumedApiFetch('/api/get-file?filename=plumed.dat', { cache: 'no-store' });
            if (!checkResponse.ok) {
                alert('Please save a PLUMED file (plumed.dat) first before generating simulation files.');
                return;
            }
        } catch (error) {
            alert('Please save a PLUMED file (plumed.dat) first before generating simulation files.');
            return;
        }

        // Get simulation parameters from the main form (if available)
        const generateBtn = document.getElementById('plumed-generate-files');
        const originalText = generateBtn.innerHTML;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        generateBtn.disabled = true;

        try {
            // Get parameters from the main generate files form if available
            // Otherwise use defaults
            const params = {
                cutoff_distance: 10.0,
                temperature: 310.0,
                pressure: 1.0,
                restrained_steps: 10000,
                restrained_force: 10.0,
                min_steps: 20000,
                npt_heating_steps: 50000,
                npt_equilibration_steps: 100000,
                production_steps: 1000000,
                timestep: 0.002,
                force_field: 'ff14SB',
                water_model: 'TIP3P',
                add_ions: 'None',
                distance: 10.0
            };

            // Try to get values from main form if it exists
            const cutoffInput = document.querySelector('input[name="cutoff_distance"], input[id*="cutoff"]');
            const tempInput = document.querySelector('input[name="temperature"], input[id*="temperature"]');
            const pressureInput = document.querySelector('input[name="pressure"], input[id*="pressure"]');
            
            if (cutoffInput) params.cutoff_distance = parseFloat(cutoffInput.value) || params.cutoff_distance;
            if (tempInput) params.temperature = parseFloat(tempInput.value) || params.temperature;
            if (pressureInput) params.pressure = parseFloat(pressureInput.value) || params.pressure;

            const response = await plumedApiFetch('/api/generate-all-files', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });

            const result = await response.json();

            if (result.success) {
                generateBtn.innerHTML = '<i class="fas fa-check"></i> Generated!';
                generateBtn.style.color = '#28a745';
                
                setTimeout(() => {
                    generateBtn.innerHTML = originalText;
                    generateBtn.style.color = '';
                    generateBtn.disabled = false;
                }, 2000);
            } else {
                alert(`Error generating files: ${result.error || 'Unknown error'}`);
                generateBtn.innerHTML = originalText;
                generateBtn.disabled = false;
            }
        } catch (error) {
            alert(`Error generating files: ${error.message}`);
            generateBtn.innerHTML = originalText;
            generateBtn.disabled = false;
        }
    }

    async previewPlumedFiles() {
        // Use the same preview functionality as section 6, but include plumed.dat (use session-aware API)
        try {
            const resp = await plumedApiFetch('/api/get-generated-files');
            const data = await resp.json();
            if (!data.success) {
                alert('❌ Error: ' + (data.error || 'Unable to load files'));
                return;
            }
            
            // Fetch plumed.dat separately if it exists
            let plumedContent = null;
            try {
                const plumedResp = await fetch(await plumedGetOutputUrl('plumed.dat'));
                if (plumedResp.ok) {
                    plumedContent = await plumedResp.text();
                }
            } catch (e) {
                // plumed.dat doesn't exist or can't be read, that's okay
            }
            
            // Find or create preview section
            let previewSection = document.getElementById('plumed-files-preview');
            if (!previewSection) {
                // Create preview section after the buttons
                const generateSection = document.getElementById('generate-simulation-files-section');
                previewSection = document.createElement('div');
                previewSection.id = 'plumed-files-preview';
                previewSection.className = 'files-preview';
                previewSection.style.display = 'none';
                previewSection.style.marginTop = '20px';
                previewSection.innerHTML = `
                    <h3><i class="fas fa-files"></i> Generated Files</h3>
                    <div class="files-list" id="plumed-files-list"></div>
                `;
                generateSection.appendChild(previewSection);
            }
            
            const filesList = document.getElementById('plumed-files-list');
            if (!filesList) return;
            filesList.innerHTML = '';
            
            // Store file contents for modal display
            this.plumedFileContents = data.files;
            
            // Add plumed.dat to the files if it exists
            if (plumedContent !== null) {
                this.plumedFileContents['plumed.dat'] = plumedContent;
            }
            
            Object.entries(this.plumedFileContents).forEach(([name, content]) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.style.cssText = 'padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 5px; cursor: pointer; background: #f9f9f9;';
                fileItem.innerHTML = `<strong>${name}</strong>`;
                fileItem.onclick = () => this.showPlumedFileContent(name, this.plumedFileContents?.[name] ?? content);
                filesList.appendChild(fileItem);
            });
            
            // Toggle preview section
            if (previewSection.style.display === 'none') {
                previewSection.style.display = 'block';
            } else {
                previewSection.style.display = 'none';
            }
        } catch (e) {
            console.error('Preview error:', e);
            alert('❌ Failed to preview files: ' + e.message);
        }
    }

    showPlumedFileContent(filename, content) {
        // Create modal if it doesn't exist (with Edit/Save/Cancel like main file-content-modal)
        let modal = document.getElementById('plumed-file-content-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'plumed-file-content-modal';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0,0,0,0.5); z-index: 1000; display: none; 
                align-items: center; justify-content: center;
            `;
            modal.innerHTML = `
                <div id="plumed-modal-content-container" style="background: white; border-radius: 10px; padding: 20px; max-width: 95%; min-width: 800px; max-height: 90%;
                           overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); display: flex; flex-direction: column; 
                           opacity: 0; transition: opacity 0.2s ease-in-out;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-shrink: 0;">
                        <h3 id="plumed-modal-filename" style="margin: 0; color: #333;"></h3>
                        <div style="display: flex; gap: 10px;">
                            <button id="plumed-edit-file-btn" style="background: #007bff; color: white; border: none; 
                                    border-radius: 5px; padding: 8px 15px; cursor: pointer;">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button id="plumed-save-file-btn" style="background: #28a745; color: white; border: none; 
                                    border-radius: 5px; padding: 8px 15px; cursor: pointer; display: none;">
                                <i class="fas fa-save"></i> Save
                            </button>
                            <button id="plumed-cancel-edit-btn" style="background: #6c757d; color: white; border: none; 
                                    border-radius: 5px; padding: 8px 15px; cursor: pointer; display: none;">
                                Cancel
                            </button>
                            <button id="plumed-close-modal" style="background: #dc3545; color: white; border: none; 
                                    border-radius: 5px; padding: 8px 15px; cursor: pointer;">
                                Close
                            </button>
                        </div>
                    </div>
                    <div style="flex: 1; overflow: auto; min-height: 0;">
                        <pre id="plumed-modal-content" style="background: #f8f9fa; padding: 15px; border-radius: 5px; 
                             overflow: auto; max-height: 70vh; white-space: pre-wrap; font-family: monospace; margin: 0;"></pre>
                        <textarea id="plumed-modal-content-edit" style="width: 100%; height: 70vh; padding: 15px; border-radius: 5px; 
                                border: 2px solid #007bff; font-family: monospace; font-size: 14px; resize: vertical; 
                                display: none; box-sizing: border-box;"></textarea>
                    </div>
                    <div id="plumed-save-status" style="margin-top: 10px; padding: 10px; border-radius: 5px; display: none; flex-shrink: 0;"></div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Close modal handlers
            document.getElementById('plumed-close-modal').onclick = () => {
                this.exitEditModePlumed(modal);
                modal.style.display = 'none';
            };
            modal.onclick = (e) => {
                if (e.target === modal) {
                    this.exitEditModePlumed(modal);
                    modal.style.display = 'none';
                }
            };
            
            // Edit button handler
            document.getElementById('plumed-edit-file-btn').onclick = () => {
                this.enterEditModePlumed(modal);
            };
            
            // Save button handler
            document.getElementById('plumed-save-file-btn').onclick = () => {
                this.savePlumedFileContent(modal);
            };
            
            // Cancel button handler
            document.getElementById('plumed-cancel-edit-btn').onclick = () => {
                this.exitEditModePlumed(modal, true); // Restore original content
            };
        }
        
        // Use cached content when available (e.g. after a save in this session)
        if (this.plumedFileContents && this.plumedFileContents[filename] !== undefined) {
            content = this.plumedFileContents[filename];
        }
        
        // Store current filename and original content
        modal.dataset.filename = filename;
        modal.dataset.originalContent = content;
        
        // Populate content BEFORE showing modal
        document.getElementById('plumed-modal-filename').textContent = filename;
        document.getElementById('plumed-modal-content').textContent = content;
        document.getElementById('plumed-modal-content-edit').value = content;
        
        // Reset to view mode
        this.exitEditModePlumed(modal);
        
        // Force a reflow
        const modalContainer = document.getElementById('plumed-modal-content-container');
        void modalContainer.offsetHeight;
        
        // Show modal with flexbox centering
        modal.style.display = 'flex';
        
        // Fade in the content container
        requestAnimationFrame(() => {
            modalContainer.style.opacity = '1';
        });
    }

    enterEditModePlumed(modal) {
        const pre = document.getElementById('plumed-modal-content');
        const textarea = document.getElementById('plumed-modal-content-edit');
        const editBtn = document.getElementById('plumed-edit-file-btn');
        const saveBtn = document.getElementById('plumed-save-file-btn');
        const cancelBtn = document.getElementById('plumed-cancel-edit-btn');
        
        pre.style.display = 'none';
        textarea.style.display = 'block';
        editBtn.style.display = 'none';
        saveBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'inline-block';
        
        textarea.focus();
    }

    exitEditModePlumed(modal, restoreOriginal = false) {
        const pre = document.getElementById('plumed-modal-content');
        const textarea = document.getElementById('plumed-modal-content-edit');
        const editBtn = document.getElementById('plumed-edit-file-btn');
        const saveBtn = document.getElementById('plumed-save-file-btn');
        const cancelBtn = document.getElementById('plumed-cancel-edit-btn');
        
        if (restoreOriginal && modal.dataset.originalContent) {
            textarea.value = modal.dataset.originalContent;
        }
        
        pre.style.display = 'block';
        textarea.style.display = 'none';
        editBtn.style.display = 'inline-block';
        saveBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        
        pre.textContent = textarea.value;
    }

    async savePlumedFileContent(modal) {
        const filename = modal.dataset.filename;
        const textarea = document.getElementById('plumed-modal-content-edit');
        const content = textarea.value;
        const statusDiv = document.getElementById('plumed-save-status');
        
        try {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#fff3cd';
            statusDiv.style.color = '#856404';
            statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            
            const response = await fetch('/api/save-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filename: filename,
                    content: content
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                modal.dataset.originalContent = content;
                document.getElementById('plumed-modal-content').textContent = content;
                
                if (this.plumedFileContents) {
                    this.plumedFileContents[filename] = content;
                }
                
                statusDiv.style.background = '#d4edda';
                statusDiv.style.color = '#155724';
                statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> File saved successfully!';
                
                this.exitEditModePlumed(modal);
                
                setTimeout(() => {
                    statusDiv.style.display = 'none';
                }, 3000);
            } else {
                throw new Error(result.error || 'Failed to save file');
            }
        } catch (error) {
            console.error('Error saving PLUMED file:', error);
            statusDiv.style.background = '#f8d7da';
            statusDiv.style.color = '#721c24';
            statusDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error: ${error.message}`;
        }
    }

    async downloadPlumedFiles() {
        // Download output folder as ZIP (with session so correct user's files are zipped)
        if (window.mdPipeline) {
            await window.mdPipeline.getSessionId();
            window.open('/api/download-output-zip?session_id=' + encodeURIComponent(window.mdPipeline.sessionId), '_blank');
        } else {
            window.open('/api/download-output-zip', '_blank');
        }
    }
}

// Initialize PLUMED manager when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.plumedManager = new PlumedManager();
    });
} else {
    window.plumedManager = new PlumedManager();
}


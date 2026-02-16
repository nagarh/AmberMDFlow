// MD Simulation Pipeline JavaScript
console.log('Script loading...'); // Debug log

class MDSimulationPipeline {
    constructor() {
        this.currentProtein = null;
        this.preparedProtein = null;
        this.completedProtein = null;
        this.missingResiduesInfo = null;
        this.missingResiduesPdbId = null;
        this.chainSequences = null;
        this.chainSequenceStart = {};
        this.chainFirstResidue = {};
        this.chainLastResidue = {};
        this.simulationParams = {};
        this.generatedFiles = {};
        this.nglStage = null;
        this.preparedNglStage = null;
        this.completedNglStage = null;
        this.originalNglStage = null;
        this.currentRepresentation = 'cartoon';
        this.preparedRepresentation = 'cartoon';
        this.completedRepresentation = 'cartoon';
        this.originalRepresentation = 'cartoon';
        this.isSpinning = false;
        this.preparedIsSpinning = false;
        this.completedIsSpinning = false;
        this.originalIsSpinning = false;
        this.currentTabIndex = 0;
        this.tabOrder = ['protein-loading', 'fill-missing', 'structure-prep', 'simulation-params', 'simulation-steps', 'file-generation', 'plumed'];
        // Consistent chain color palette - same colors for same chain IDs throughout
        this.chainColorPalette = [
            '#1f77b4', // blue
            '#ff7f0e', // orange
            '#2ca02c', // green
            '#d62728', // red
            '#9467bd', // purple
            '#8c564b', // brown
            '#e377c2', // pink
            '#7f7f7f', // gray
            '#bcbd22', // olive
            '#17becf', // cyan
            '#aec7e8', // light blue
            '#ffbb78', // light orange
            '#98df8a', // light green
            '#ff9896', // light red
            '#c5b0d5', // light purple
            '#c49c94', // light brown
            '#f7b6d3', // light pink
            '#c7c7c7', // light gray
            '#dbdb8d', // light olive
            '#9edae5'  // light cyan
        ];
        this.chainColorMap = {}; // Will store chain ID -> color mapping
        this.sessionId = null;   // Per-user session for multi-user (e.g. Hugging Face)
        this._sessionPromise = null;
        this.init();
        this.initializeTooltips();
    }

    /** Ensure we have a session ID (isolates this user's output from others). */
    async getSessionId() {
        if (this.sessionId) return this.sessionId;
        try {
            const stored = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ambermdflow_session_id');
            if (stored) { this.sessionId = stored; return this.sessionId; }
        } catch (e) { /* ignore */ }
        if (this._sessionPromise) return this._sessionPromise;
        this._sessionPromise = (async () => {
            try {
                const r = await fetch('/api/session');
                const d = await r.json();
                this.sessionId = d.session_id || 'default';
                if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ambermdflow_session_id', this.sessionId);
                return this.sessionId;
            } catch (e) {
                this.sessionId = 'default';
                return this.sessionId;
            }
        })();
        return this._sessionPromise;
    }

    /** Fetch with session header so backend uses this user's output folder. */
    async apiFetch(url, options = {}) {
        await this.getSessionId();
        const headers = { ...(options.headers || {}), 'X-Session-Id': this.sessionId };
        return fetch(url, { ...options, headers });
    }

    /** Base URL for output files (includes session so NGL/downloads hit the right folder). */
    getOutputUrl(path) {
        const sid = this.sessionId || 'default';
        return `/output/${sid}/${path}`.replace(/\/+/g, '/');
    }

    init() {
        // On every page load (including refresh), clean this session's output folder so old files
        // don't overlap with new work (session ID persists in sessionStorage, files do not).
        this.getSessionId().then(() => this.apiFetch('/api/clean-output', { method: 'POST' })).catch(() => {});

        this.setupEventListeners();
        this.initializeTabs();
        this.initializeStepToggles();
        this.loadDefaultParams();
        this.updateNavigationState();
    }

    initializeTooltips() {
        // Initialize Bootstrap tooltips using vanilla JavaScript
        // Note: This requires Bootstrap to be loaded
        if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
            const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-toggle="tooltip"]'));
            tooltipTriggerList.map(function (tooltipTriggerEl) {
                return new bootstrap.Tooltip(tooltipTriggerEl);
            });
        } else {
            console.log('Bootstrap not loaded, tooltips will not work');
        }
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // File upload
        const fileInput = document.getElementById('pdb-file');
        const fileUploadArea = document.getElementById('file-upload-area');
        const chooseFileBtn = document.getElementById('choose-file-btn');
        
        console.log('File input element:', fileInput);
        console.log('File upload area:', fileUploadArea);
        console.log('Choose file button:', chooseFileBtn);
        
        if (!fileInput) {
            console.error('File input element not found!');
            return;
        }
        
        fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Handle click on upload area (but not on the button)
        fileUploadArea.addEventListener('click', (e) => {
            // Only trigger if not clicking on the button
            if (e.target !== chooseFileBtn && !chooseFileBtn.contains(e.target)) {
                console.log('Upload area clicked, triggering file input');
                fileInput.click();
            }
        });
        
        // Handle click on choose file button
        chooseFileBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering the upload area click
            console.log('Choose file button clicked, triggering file input');
            fileInput.click();
        });
        
        fileUploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        fileUploadArea.addEventListener('drop', (e) => this.handleDrop(e));

        // PDB fetch
        document.getElementById('fetch-pdb').addEventListener('click', () => this.fetchPDB());

        // Missing residues analysis
        const detectMissingBtn = document.getElementById('detect-missing-residues');
        if (detectMissingBtn) {
            detectMissingBtn.addEventListener('click', () => this.detectMissingResidues());
        }
        const buildCompleteBtn = document.getElementById('build-complete-structure');
        if (buildCompleteBtn) {
            buildCompleteBtn.addEventListener('click', () => this.buildCompletedStructure());
        }
        const applyTrimBtn = document.getElementById('apply-trim');
        if (applyTrimBtn) {
            applyTrimBtn.addEventListener('click', () => this.applyTrimming());
        }
        const previewCompletedBtn = document.getElementById('preview-completed-structure');
        if (previewCompletedBtn) {
            previewCompletedBtn.addEventListener('click', () => this.previewCompletedStructure());
        }
        const previewSuperimposedBtn = document.getElementById('preview-superimposed-structure');
        if (previewSuperimposedBtn) {
            previewSuperimposedBtn.addEventListener('click', () => this.previewSuperimposedStructure());
        }
        const viewSequencesBtn = document.getElementById('view-protein-sequences');
        if (viewSequencesBtn) {
            viewSequencesBtn.addEventListener('click', () => this.toggleSequenceViewer());
        }
        const downloadCompletedBtn = document.getElementById('download-completed-structure');
        if (downloadCompletedBtn) {
            downloadCompletedBtn.addEventListener('click', () => this.downloadCompletedStructure());
        }

        // File generation
        document.getElementById('generate-files').addEventListener('click', () => this.generateAllFiles());
        document.getElementById('preview-files').addEventListener('click', () => this.previewFiles());
        document.getElementById('add-simulation-file').addEventListener('click', () => this.showAddFileModal());
        document.getElementById('preview-solvated').addEventListener('click', () => this.previewSolvatedProtein());
        document.getElementById('download-solvated').addEventListener('click', () => this.downloadSolvatedProtein());
        document.getElementById('download-zip').addEventListener('click', () => this.downloadZip());
        

        // Structure preparation
        document.getElementById('prepare-structure').addEventListener('click', () => this.prepareStructure());
        document.getElementById('preview-prepared').addEventListener('click', () => this.previewPreparedStructure());
        document.getElementById('download-prepared').addEventListener('click', () => this.downloadPreparedStructure());
        
        // Ligand download button
        const downloadLigandBtn = document.getElementById('download-ligand');
        if (downloadLigandBtn) {
            downloadLigandBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.downloadLigandFile();
            });
        }

        // Docking section
        const runDockingBtn = document.getElementById('run-docking');
        if (runDockingBtn) {
            runDockingBtn.addEventListener('click', () => this.runDocking());
        }
        const applyDockingPosesBtn = document.getElementById('apply-docking-poses');
        if (applyDockingPosesBtn) {
            applyDockingPosesBtn.addEventListener('click', () => this.applyDockingPoses());
        }

        // Navigation buttons
        document.getElementById('prev-tab').addEventListener('click', () => this.previousTab());
        document.getElementById('next-tab').addEventListener('click', () => this.nextTab());

        // Parameter changes
        document.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', () => this.updateSimulationParams());
        });

        // Render chain and ligand choices when structure tab becomes visible
        document.querySelector('[data-tab="structure-prep"]').addEventListener('click', () => {
            this.renderChainAndLigandSelections();
        });

        // Separate ligands checkbox change
        document.getElementById('separate-ligands').addEventListener('change', (e) => {
            const downloadBtn = document.getElementById('download-ligand');
            
            if (e.target.checked && this.preparedProtein && this.preparedProtein.ligand_present && this.preparedProtein.ligand_content) {
                downloadBtn.disabled = false;
                downloadBtn.classList.remove('btn-outline-secondary');
                downloadBtn.classList.add('btn-outline-primary');
            } else {
                downloadBtn.disabled = true;
                downloadBtn.classList.remove('btn-outline-primary');
                downloadBtn.classList.add('btn-outline-secondary');
            }
        });

        // Preserve ligands checkbox change
        document.getElementById('preserve-ligands').addEventListener('change', (e) => {
            this.toggleLigandForceFieldGroup(e.target.checked);
        });
    }

    initializeTabs() {
        const tabs = document.querySelectorAll('.tab-content');
        tabs.forEach(tab => {
            if (!tab.classList.contains('active')) {
                tab.style.display = 'none';
            }
        });
    }

    initializeStepToggles() {
        document.querySelectorAll('.step-header').forEach(header => {
            header.addEventListener('click', () => {
                const stepItem = header.parentElement;
                const content = stepItem.querySelector('.step-content');
                const isActive = content.classList.contains('active');
                
                // Close all other step contents
                document.querySelectorAll('.step-content').forEach(c => c.classList.remove('active'));
                
                // Toggle current step
                if (!isActive) {
                    content.classList.add('active');
                }
            });
        });
    }

    loadDefaultParams() {
        this.simulationParams = {
            boxType: 'cubic',
            boxSize: 1.0,
            boxMargin: 1.0,
            forceField: 'amber99sb-ildn',
            waterModel: 'tip3p',
            ionConcentration: 150,
            temperature: 300,
            pressure: 1.0,
            couplingType: 'berendsen',
            timestep: 0.002,
            cutoff: 1.0,
            pmeOrder: 4,
            steps: {
                restrainedMin: { enabled: true, steps: 1000, force: 1000 },
                minimization: { enabled: true, steps: 5000, algorithm: 'steep' },
                nvt: { enabled: true, steps: 50000, temperature: 300 },
                npt: { enabled: true, steps: 100000, temperature: 300, pressure: 1.0 },
                production: { enabled: true, steps: 1000000, temperature: 300, pressure: 1.0 }
            }
        };
    }

    switchTab(tabName) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
            tab.style.display = 'none';
        });

        // Remove active class from all tab buttons
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('active');
        });

        // Show selected tab
        document.getElementById(tabName).classList.add('active');
        document.getElementById(tabName).style.display = 'block';
        
        // Add active class to clicked button
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update current tab index and navigation state
        this.currentTabIndex = this.tabOrder.indexOf(tabName);
        this.updateNavigationState();
    }

    previousTab() {
        if (this.currentTabIndex > 0) {
            const prevTab = this.tabOrder[this.currentTabIndex - 1];
            this.switchTab(prevTab);
        }
    }

    nextTab() {
        if (this.currentTabIndex < this.tabOrder.length - 1) {
            const nextTab = this.tabOrder[this.currentTabIndex + 1];
            this.switchTab(nextTab);
        }
    }

    updateNavigationState() {
        const prevBtn = document.getElementById('prev-tab');
        const nextBtn = document.getElementById('next-tab');
        const currentStepSpan = document.getElementById('current-step');
        const totalStepsSpan = document.getElementById('total-steps');

        // Update button states
        prevBtn.disabled = this.currentTabIndex === 0;
        nextBtn.disabled = this.currentTabIndex === this.tabOrder.length - 1;

        // Update step indicator
        if (currentStepSpan) {
            currentStepSpan.textContent = this.currentTabIndex + 1;
        }
        if (totalStepsSpan) {
            totalStepsSpan.textContent = this.tabOrder.length;
        }

        // Update next button text based on current tab
        if (this.currentTabIndex === this.tabOrder.length - 1) {
            nextBtn.innerHTML = 'Complete <i class="fas fa-check"></i>';
        } else {
            nextBtn.innerHTML = 'Next <i class="fas fa-chevron-right"></i>';
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.style.background = '#e3f2fd';
    }

    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.style.background = '#f8f9fa';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileUpload(e) {
        console.log('File upload triggered');
        console.log('Files:', e.target.files);
        const file = e.target.files[0];
        if (file) {
            console.log('File selected:', file.name, file.size, file.type);
            this.processFile(file);
        } else {
            console.log('No file selected');
        }
    }

    processFile(file) {
        console.log('Processing file:', file.name, file.size, file.type);
        
        if (!file.name.toLowerCase().endsWith('.pdb') && !file.name.toLowerCase().endsWith('.ent')) {
            console.log('Invalid file type:', file.name);
            this.showStatus('error', 'Please upload a valid PDB file (.pdb or .ent)');
            return;
        }

        console.log('File validation passed, reading file...');
        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('File read successfully, content length:', e.target.result.length);
            const content = e.target.result;
            this.parsePDBFile(content, file.name);
        };
        reader.onerror = (e) => {
            console.error('Error reading file:', e);
            this.showStatus('error', 'Error reading file');
        };
        reader.readAsText(file);
    }

    async parsePDBFile(content, filename) {
        return this._parsePDBFileInternal(content, filename, true);
    }

    async _parsePDBFileInternal(content, filename, cleanOutput = false) {
        try {
            // Clean output folder when new PDB is loaded (only if requested)
            if (cleanOutput) {
                try {
                    await this.apiFetch('/api/clean-output', { method: 'POST' });
                } catch (error) {
                    console.log('Could not clean output folder:', error);
                }
            }
            
            // Save the PDB file to output directory for backend processing
            try {
                await this.apiFetch('/api/save-pdb-file', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        pdb_content: content,
                        filename: filename
                    })
                });
            } catch (error) {
                console.log('Could not save PDB file to output directory:', error);
            }

            const lines = content.split('\n');
            let atomCount = 0;
            let chains = new Set();
            let residues = new Set();
            let waterMolecules = 0;
            let ions = 0;
            let ligands = new Set();
            let ligandDetailsMap = new Map(); // key: resn_chain_resi -> { resn, chain, resi } (one per residue)
            let hetatoms = 0;
            let structureId = filename.replace(/\.(pdb|ent)$/i, '').toUpperCase();
            
            // Common water molecule names
            const waterNames = new Set(['HOH', 'WAT', 'TIP3', 'TIP4', 'SPC', 'SPCE']);
            
            // Common ion names (expanded to include more ions)
            const ionNames = new Set(['NA', 'CL', 'K', 'MG', 'CA', 'ZN', 'FE', 'MN', 'CU', 'NI', 'CO', 
                'CD', 'HG', 'PB', 'SR', 'BA', 'RB', 'CS', 'LI', 'F', 'BR', 'I', 'SO4', 'PO4', 'CO3', 'NO3', 'NH4']);
            
            // Modified protein residues in HETATM (count as protein residues, not ligands)
            const modifiedResidueNames = new Set(['MSE', 'HYP', 'PTR', 'SEC', 'LLP', 'TYS', 'KCX', 'SAC', 'CME', 'CSO', 'CSD', 'OCS', 'MDO', 'PAQ', 'FME', 'M3L', 'SMC', 'MLY', 'STY']);
            
            // Track unique water molecules by residue
            const uniqueWaterResidues = new Set();

            lines.forEach(line => {
                if (line.startsWith('ATOM')) {
                    atomCount++;
                    const chainId = line.substring(21, 22).trim();
                    if (chainId) chains.add(chainId);
                    
                    const resName = line.substring(17, 20).trim();
                    const resNum = line.substring(22, 26).trim();
                    // Include chain ID in residue key to count residues across all chains
                    const residueKey = chainId ? `${chainId}_${resName}${resNum}` : `${resName}${resNum}`;
                    residues.add(residueKey);
                } else if (line.startsWith('HETATM')) {
                    hetatoms++;
                    const resName = line.substring(17, 20).trim();
                    const resNum = line.substring(22, 26).trim();
                    const chainId = line.substring(21, 22).trim();
                    const entityKey = `${resName}_${resNum}_${chainId}`;
                    
                    if (waterNames.has(resName)) {
                        waterMolecules++;
                        uniqueWaterResidues.add(entityKey);
                    } else if (ionNames.has(resName)) {
                        ions++;
                    } else if (modifiedResidueNames.has(resName)) {
                        // Modified protein residues (MSE, HYP, etc.): count as protein
                        atomCount++;
                        const residueKey = chainId ? `${chainId}_${resName}${resNum}` : `${resName}${resNum}`;
                        residues.add(residueKey);
                    } else {
                        // Everything else is treated as ligand
                        ligands.add(resName);
                        const residueKey = `${resName}_${chainId}_${resNum}`;
                        if (!ligandDetailsMap.has(residueKey)) {
                            ligandDetailsMap.set(residueKey, { resn: resName, chain: chainId, resi: resNum });
                        }
                    }
                }
            });

            // Count unique water molecules
            const uniqueWaterCount = uniqueWaterResidues.size;
            
            // Get unique ligand names
            const uniqueLigandNames = Array.from(ligands);
            
            // Build ligandDetails (one per residue) and ligandGroups for UI with display labels
            const ligandDetails = Array.from(ligandDetailsMap.values());
            // Group by (resn, chain) and assign instance numbers: GOL-A-1, GOL-A-2 when duplicates
            const byResnChain = new Map();
            ligandDetails.forEach(d => {
                const k = `${d.resn}-${d.chain}`;
                if (!byResnChain.has(k)) byResnChain.set(k, []);
                byResnChain.get(k).push(d);
            });
            const ligandGroups = [];
            byResnChain.forEach((list, resnChain) => {
                list.sort((a, b) => String(a.resi).localeCompare(String(b.resi)));
                list.forEach((d, i) => {
                    const instance = i + 1;
                    const displayLabel = list.length > 1 ? `${d.resn}-${d.chain}-${instance}` : `${d.resn}-${d.chain}`;
                    ligandGroups.push({ resn: d.resn, chain: d.chain, resi: d.resi, displayLabel });
                });
            });
            
            // Ligand entity count = number of ligand molecules (one per residue), not unique resnames
            const ligandEntityCount = ligandGroups.length;
            
            // Create ligand info string using display labels (GOL-A-1, GOL-A-2, LZ1-A)
            let ligandInfo = 'None';
            if (ligandGroups.length > 0) {
                if (ligandGroups.length > 1) {
                    ligandInfo = `${ligandEntityCount} entities: ${ligandGroups.map(g => g.displayLabel).join(', ')}`;
                } else {
                    ligandInfo = ligandGroups[0].displayLabel;
                }
            }

            this.currentProtein = {
                filename: filename,
                structureId: structureId,
                atomCount: atomCount,
                chains: Array.from(chains),
                residueCount: residues.size,
                waterMolecules: uniqueWaterCount,
                ions: ions,
                ligands: uniqueLigandNames,
                ligandDetails: ligandDetails,
                ligandGroups: ligandGroups, // one per instance; displayLabel e.g. GOL-A or GOL-A-1, GOL-A-2
                ligandEntities: ligandEntityCount,
                ligandInfo: ligandInfo,
                hetatoms: hetatoms,
                content: content
            };

            this.displayProteinInfo();
            this.showStatus('success', `Successfully loaded ${filename}`);
        } catch (error) {
            this.showStatus('error', 'Error parsing PDB file: ' + error.message);
        }
    }

    displayProteinInfo() {
        if (!this.currentProtein) return;

        document.getElementById('structure-id').textContent = this.currentProtein.structureId;
        document.getElementById('atom-count').textContent = this.currentProtein.atomCount.toLocaleString();
        document.getElementById('chain-info').textContent = this.currentProtein.chains.join(', ');
        document.getElementById('residue-count').textContent = this.currentProtein.residueCount.toLocaleString();
        document.getElementById('water-count').textContent = this.currentProtein.waterMolecules.toLocaleString();
        document.getElementById('ion-count').textContent = this.currentProtein.ions.toLocaleString();
        document.getElementById('ligand-info').textContent = this.currentProtein.ligandInfo;
        document.getElementById('hetatm-count').textContent = this.currentProtein.hetatoms.toLocaleString();

        // Build consistent chain color mapping based on chain IDs from Step 1
        this.buildChainColorMap(this.currentProtein.chains);

        document.getElementById('protein-preview').style.display = 'block';
        
        // Load 3D visualization
        this.load3DVisualization();

        // Also refresh chain/ligand lists when protein info is displayed
        this.renderChainAndLigandSelections();
    }

    buildChainColorMap(chains) {
        // Create a consistent mapping of chain IDs to colors
        // Sort chains to ensure consistent ordering
        const sortedChains = [...chains].sort();
        this.chainColorMap = {};
        sortedChains.forEach((chain, index) => {
            this.chainColorMap[chain] = this.chainColorPalette[index % this.chainColorPalette.length];
        });
        console.log('Chain color map built:', this.chainColorMap);
    }

    async fetchPDB() {
        const pdbId = document.getElementById('pdb-id').value.trim().toUpperCase();
        if (!pdbId) {
            this.showStatus('error', 'Please enter a PDB ID');
            return;
        }

        if (!/^[0-9A-Z]{4}$/.test(pdbId)) {
            this.showStatus('error', 'Please enter a valid 4-character PDB ID');
            return;
        }

        this.showStatus('info', 'Fetching PDB structure...');
        
        try {
            // Use backend proxy to fetch PDB (avoids CORS issues)
            const response = await this.apiFetch(`/api/proxy-pdb/${pdbId}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `PDB ID ${pdbId} not found`);
            }
            
            const content = await response.text();
            this.parsePDBFile(content, `${pdbId}.pdb`);
            this.showStatus('success', `Successfully fetched PDB structure ${pdbId}`);
        } catch (error) {
            this.showStatus('error', `Error fetching PDB: ${error.message}`);
        }
    }

    showStatus(type, message) {
        const statusDiv = document.getElementById('pdb-status');
        statusDiv.className = `status-message ${type}`;
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';

        // Auto-hide after 5 seconds for success messages
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 5000);
        }
    }

    updateSimulationParams() {
        // Update basic parameters
        this.simulationParams.boxType = document.getElementById('box-type').value;
        this.simulationParams.boxSize = parseFloat(document.getElementById('box-size').value);
        this.simulationParams.forceField = document.getElementById('force-field').value;
        this.simulationParams.waterModel = document.getElementById('water-model').value;
        this.simulationParams.addIons = document.getElementById('add-ions').value;
        this.simulationParams.temperature = parseInt(document.getElementById('temperature').value);
        this.simulationParams.pressure = parseFloat(document.getElementById('pressure').value);
        this.simulationParams.couplingType = document.getElementById('coupling-type').value;
        this.simulationParams.timestep = parseFloat(document.getElementById('timestep').value);
        this.simulationParams.cutoff = parseFloat(document.getElementById('cutoff').value);
        this.simulationParams.electrostatic = document.getElementById('electrostatic').value;
        this.simulationParams.ligandForceField = document.getElementById('ligand-forcefield').value;

        // Update step parameters
        this.simulationParams.steps.restrainedMin = {
            enabled: document.getElementById('enable-restrained-min').checked,
            steps: parseInt(document.getElementById('restrained-steps').value),
            force: parseInt(document.getElementById('restrained-force').value)
        };

        this.simulationParams.steps.minimization = {
            enabled: document.getElementById('enable-minimization').checked,
            steps: parseInt(document.getElementById('min-steps').value),
            algorithm: document.getElementById('min-algorithm').value
        };

        this.simulationParams.steps.nvt = {
            enabled: document.getElementById('enable-nvt').checked,
            steps: parseInt(document.getElementById('nvt-steps').value),
            temperature: parseInt(document.getElementById('nvt-temp').value)
        };

        this.simulationParams.steps.npt = {
            enabled: document.getElementById('enable-npt').checked,
            steps: parseInt(document.getElementById('npt-steps').value),
            temperature: parseInt(document.getElementById('npt-temp').value),
            pressure: parseFloat(document.getElementById('npt-pressure').value)
        };

        this.simulationParams.steps.production = {
            enabled: document.getElementById('enable-production').checked,
            steps: parseInt(document.getElementById('prod-steps').value),
            temperature: parseInt(document.getElementById('prod-temp').value),
            pressure: parseFloat(document.getElementById('prod-pressure').value)
        };
    }

    toggleLigandForceFieldGroup(show) {
        const section = document.getElementById('ligand-forcefield-section');
        if (show) {
            section.style.display = 'block';
            section.classList.remove('disabled');
        } else {
            section.style.display = 'none';
            section.classList.add('disabled');
        }
    }

    async calculateNetCharge(event) {
        console.log('calculateNetCharge called'); // Debug log
        if (!this.preparedProtein) {
            alert('Please prepare structure first before calculating net charge.');
            return;
        }

        // Show loading state
        const button = event ? event.target : document.querySelector('button[onclick*="calculateNetCharge"]');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating...';
        button.disabled = true;

        try {
            // Get the selected force field
            const selectedForceField = document.getElementById('force-field').value;
            
            const response = await this.apiFetch('/api/calculate-net-charge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    force_field: selectedForceField
                })
            });

            const result = await response.json();

            if (result.success) {
                // Update the Add Ions dropdown based on suggestion
                const addIonsSelect = document.getElementById('add-ions');
                if (result.ion_type === 'Cl-') {
                    addIonsSelect.value = 'Cl-';
                } else if (result.ion_type === 'Na+') {
                    addIonsSelect.value = 'Na+';
                } else {
                    addIonsSelect.value = 'None';
                }

                // Show results in plain language (no raw decimal like 3.999)
                const chargeDesc = result.net_charge > 0 ? 'Positive' : result.net_charge < 0 ? 'Negative' : 'Neutral';
                alert(`✅ System Charge\n\n` +
                      `Charge: ${chargeDesc}\n` +
                      `${result.suggestion}`);
            } else {
                alert(`❌ Error: ${result.error}`);
            }
        } catch (error) {
            console.error('Error calculating net charge:', error);
            alert(`❌ Error: Failed to calculate net charge. ${error.message}`);
        } finally {
            // Restore button state
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }

    async generateLigandFF(event) {
        console.log('generateLigandFF called'); // Debug log
        if (!this.preparedProtein || !this.preparedProtein.ligand_present) {
            alert('No ligand found. Please ensure ligands are preserved during structure preparation.');
            return;
        }

        const selectedFF = document.getElementById('ligand-forcefield').value;
        
        // Show loading state
        const button = event ? event.target : document.querySelector('button[onclick*="generateLigandFF"]');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        button.disabled = true;

        // Initialize log storage if not exists
        if (!this.ligandFFLogs) {
            this.ligandFFLogs = [];
        }
        this.ligandFFLogs = []; // Clear previous logs
        this.ligandFFGenerating = true; // Flag to track if generation is in progress

        // Create or get log modal
        let logModal = document.getElementById('ligand-ff-log-modal');
        if (!logModal) {
            logModal = this.createLogModal();
            document.body.appendChild(logModal);
        }

        // Show modal and render stored logs
        const logContent = logModal.querySelector('.log-content');
        const logContainer = logModal.querySelector('.log-container');
        this.renderLogs(logContent);
        logModal.style.display = 'block';
        logContainer.scrollTop = logContainer.scrollHeight;

        // Add "View Logs" button next to the generate button
        this.addViewLogsButton(button);

        // Use EventSource for SSE (but we need POST, so use fetch with streaming)
        try {
            const response = await this.apiFetch('/api/generate-ligand-ff', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    force_field: selectedFF
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            
                            if (data.type === 'complete') {
                                // Final result
                                this.ligandFFGenerating = false;
                                if (data.success) {
                                    this.ligandFFLogs.push({ type: 'result', data: data });
                                    this.displayFinalResult(data, logContent);
                                } else {
                                    this.ligandFFLogs.push({ type: 'error', message: `❌ Error: ${data.error}` });
                                    this.addLogLine(logContent, `❌ Error: ${data.error}`, 'error');
                                }
                                button.innerHTML = originalText;
                                button.disabled = false;
                                this.removeViewLogsButton();
                            } else {
                                // Log message - store and display
                                this.ligandFFLogs.push({ type: data.type || 'info', message: data.message, timestamp: new Date().toISOString() });
                                // Only add to DOM if modal is visible
                                const currentLogModal = document.getElementById('ligand-ff-log-modal');
                                if (currentLogModal && currentLogModal.style.display === 'block') {
                                    const currentLogContent = currentLogModal.querySelector('.log-content');
                                    if (currentLogContent) {
                                        this.addLogLine(currentLogContent, data.message, data.type || 'info');
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing SSE data:', e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error generating ligand force field:', error);
            this.ligandFFGenerating = false;
            const errorMsg = `❌ Error: Failed to generate force field parameters. ${error.message}`;
            this.ligandFFLogs.push({ type: 'error', message: errorMsg });
            this.addLogLine(logContent, errorMsg, 'error');
            button.innerHTML = originalText;
            button.disabled = false;
            this.removeViewLogsButton();
        }
    }

    addViewLogsButton(button) {
        // Remove existing button if any
        this.removeViewLogsButton();
        
        // Create view logs button
        const viewLogsBtn = document.createElement('button');
        viewLogsBtn.id = 'view-ligand-ff-logs-btn';
        viewLogsBtn.className = 'btn btn-info';
        viewLogsBtn.style.marginLeft = '10px';
        viewLogsBtn.innerHTML = '<i class="fas fa-terminal"></i> View Logs';
        viewLogsBtn.onclick = () => this.showLogModal();
        
        // Insert after the generate button
        button.parentNode.insertBefore(viewLogsBtn, button.nextSibling);
    }

    removeViewLogsButton() {
        const btn = document.getElementById('view-ligand-ff-logs-btn');
        if (btn) {
            btn.remove();
        }
    }

    showLogModal() {
        let logModal = document.getElementById('ligand-ff-log-modal');
        if (!logModal) {
            logModal = this.createLogModal();
            document.body.appendChild(logModal);
        }

        const logContent = logModal.querySelector('.log-content');
        const logContainer = logModal.querySelector('.log-container');
        
        // Re-render all logs to ensure we have the latest
        this.renderLogs(logContent);
        
        logModal.style.display = 'block';
        // Scroll to bottom after a brief delay to ensure content is rendered
        setTimeout(() => {
            logContainer.scrollTop = logContainer.scrollHeight;
        }, 100);
    }

    renderLogs(logContent) {
        // Store current scroll position if modal is visible
        const logModal = document.getElementById('ligand-ff-log-modal');
        const wasAtBottom = logModal && logModal.style.display === 'block' && 
                           logContent.parentElement && 
                           (logContent.parentElement.scrollTop + logContent.parentElement.clientHeight >= logContent.parentElement.scrollHeight - 10);
        
        logContent.innerHTML = '';
        if (this.ligandFFLogs && this.ligandFFLogs.length > 0) {
            this.ligandFFLogs.forEach(logEntry => {
                if (logEntry.type === 'result') {
                    this.displayFinalResult(logEntry.data, logContent);
                } else {
                    this.addLogLine(logContent, logEntry.message, logEntry.type || 'info', false);
                }
            });
        }
        
        // Restore scroll position or scroll to bottom
        if (logModal && logModal.style.display === 'block' && logContent.parentElement) {
            if (wasAtBottom) {
                logContent.parentElement.scrollTop = logContent.parentElement.scrollHeight;
            }
        }
    }

    createLogModal() {
        const modal = document.createElement('div');
        modal.id = 'ligand-ff-log-modal';
        modal.className = 'log-modal';
        const self = this;
        modal.innerHTML = `
            <div class="log-modal-content">
                <div class="log-modal-header">
                    <h3><i class="fas fa-cogs"></i> Generating Ligand Force Field - Live Logs</h3>
                    <button class="log-modal-close" onclick="this.closest('.log-modal').style.display='none'">&times;</button>
                </div>
                <div class="log-container">
                    <div class="log-content"></div>
                </div>
            </div>
        `;
        // Add click handler to modal background to close
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        return modal;
    }

    addLogLine(container, message, type = 'info', autoScroll = true) {
        const line = document.createElement('div');
        line.className = `log-line log-${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
        
        line.innerHTML = `<span class="log-time">[${timestamp}]</span> <span class="log-icon">${icon}</span> <span class="log-message">${this.escapeHtml(message)}</span>`;
        container.appendChild(line);
        
        // Auto-scroll to bottom only if modal is visible and autoScroll is enabled
        if (autoScroll) {
            // Check both ligand-ff and docking log modals
            const logModal = document.getElementById('ligand-ff-log-modal') || document.getElementById('docking-log-modal');
            if (logModal && logModal.style.display === 'block' && container.parentElement) {
                // Check if user is near bottom before auto-scrolling
                const isNearBottom = container.parentElement.scrollTop + container.parentElement.clientHeight >= 
                                   container.parentElement.scrollHeight - 50;
                if (isNearBottom) {
                    container.parentElement.scrollTop = container.parentElement.scrollHeight;
                }
            }
        }
    }

    displayFinalResult(data, container) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'log-result';
        resultDiv.innerHTML = '<h4>📊 Final Results:</h4>';
        
        if (data.ligands && data.ligands.length > 0) {
            let resultHtml = `<p><strong>✅ ${data.message}</strong></p><ul>`;
            data.ligands.forEach(ligand => {
                resultHtml += `<li><strong>Ligand ${ligand.ligand_num}:</strong><br>`;
                resultHtml += `&nbsp;&nbsp;Net charge: ${ligand.net_charge}<br>`;
                resultHtml += `&nbsp;&nbsp;Files:<br>`;
                resultHtml += `&nbsp;&nbsp;&nbsp;&nbsp;- ${ligand.files.mol2}<br>`;
                resultHtml += `&nbsp;&nbsp;&nbsp;&nbsp;- ${ligand.files.frcmod}</li>`;
            });
            resultHtml += '</ul>';
            
            if (data.errors && data.errors.length > 0) {
                resultHtml += '<p><strong>⚠️ Warnings:</strong></p><ul>';
                data.errors.forEach(err => {
                    resultHtml += `<li>${this.escapeHtml(err)}</li>`;
                });
                resultHtml += '</ul>';
            }
            
            resultDiv.innerHTML += resultHtml;
        }
        
        container.appendChild(resultDiv);
        container.parentElement.scrollTop = container.parentElement.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    createDockingLogModal() {
        const modal = document.createElement('div');
        modal.id = 'docking-log-modal';
        modal.className = 'log-modal';
        const self = this;
        modal.innerHTML = `
            <div class="log-modal-content">
                <div class="log-modal-header">
                    <h3><i class="fas fa-vial"></i> Running Docking - Live Logs</h3>
                    <button class="log-modal-close" onclick="this.closest('.log-modal').style.display='none'">&times;</button>
                </div>
                <div class="log-container">
                    <div class="log-content"></div>
                </div>
            </div>
        `;
        // Add click handler to modal background to close
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        return modal;
    }

    renderDockingLogs(logContent) {
        // Store current scroll position if modal is visible
        const logModal = document.getElementById('docking-log-modal');
        const wasAtBottom = logModal && logModal.style.display === 'block' && 
                           logContent.parentElement && 
                           (logContent.parentElement.scrollTop + logContent.parentElement.clientHeight >= logContent.parentElement.scrollHeight - 10);
        
        logContent.innerHTML = '';
        if (this.dockingLogs && this.dockingLogs.length > 0) {
            this.dockingLogs.forEach(logEntry => {
                if (logEntry.type === 'result') {
                    this.displayDockingFinalResult(logEntry.data, logContent);
                } else {
                    this.addLogLine(logContent, logEntry.message, logEntry.type || 'info', false);
                }
            });
        }
        
        // Restore scroll position or scroll to bottom
        if (logModal && logModal.style.display === 'block' && logContent.parentElement) {
            if (wasAtBottom) {
                logContent.parentElement.scrollTop = logContent.parentElement.scrollHeight;
            }
        }
    }

    displayDockingFinalResult(data, container) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'log-result';
        resultDiv.innerHTML = '<h4>📊 Docking Results:</h4>';
        
        if (data.ligands && data.ligands.length > 0) {
            let resultHtml = `<p><strong>✅ Successfully docked ${data.ligands.length} ligand(s)</strong></p><ul>`;
            data.ligands.forEach(ligand => {
                const ligName = ligand.displayLabel || ligand.name || `Ligand ${ligand.index}`;
                resultHtml += `<li><strong>${ligName}:</strong><br>`;
                resultHtml += `&nbsp;&nbsp;Original: ${ligand.original_file}<br>`;
                resultHtml += `&nbsp;&nbsp;Poses: ${ligand.poses.length}<br>`;
                if (ligand.poses.length > 0) {
                    resultHtml += `&nbsp;&nbsp;Binding energies:<br>`;
                    ligand.poses.forEach(pose => {
                        const energy = pose.energy !== null && pose.energy !== undefined ? pose.energy.toFixed(2) : 'N/A';
                        resultHtml += `&nbsp;&nbsp;&nbsp;&nbsp;- Mode ${pose.mode_index}: ${energy} kcal/mol<br>`;
                    });
                }
                resultHtml += `</li>`;
            });
            resultHtml += '</ul>';
            
            if (data.warnings && data.warnings.length > 0) {
                resultHtml += '<p><strong>⚠️ Warnings:</strong></p><ul>';
                data.warnings.forEach(warn => {
                    resultHtml += `<li>${this.escapeHtml(warn)}</li>`;
                });
                resultHtml += '</ul>';
            }
            
            if (data.errors && data.errors.length > 0) {
                resultHtml += '<p><strong>❌ Errors:</strong></p><ul>';
                data.errors.forEach(err => {
                    resultHtml += `<li>${this.escapeHtml(err)}</li>`;
                });
                resultHtml += '</ul>';
            }
            
            resultDiv.innerHTML += resultHtml;
        } else {
            resultDiv.innerHTML += '<p>No ligands were docked.</p>';
        }
        
        container.appendChild(resultDiv);
        container.parentElement.scrollTop = container.parentElement.scrollHeight;
    }

    addViewDockingLogsButton(button) {
        // Remove existing button if any
        this.removeViewDockingLogsButton();
        
        // Create view logs button
        const viewLogsBtn = document.createElement('button');
        viewLogsBtn.id = 'view-docking-logs-btn';
        viewLogsBtn.className = 'btn btn-info';
        viewLogsBtn.style.marginLeft = '10px';
        viewLogsBtn.innerHTML = '<i class="fas fa-terminal"></i> View Logs';
        viewLogsBtn.onclick = () => this.showDockingLogModal();
        
        // Insert after the run button
        if (button && button.parentNode) {
            button.parentNode.insertBefore(viewLogsBtn, button.nextSibling);
        }
    }

    removeViewDockingLogsButton() {
        const btn = document.getElementById('view-docking-logs-btn');
        if (btn) {
            btn.remove();
        }
    }

    showDockingLogModal() {
        let logModal = document.getElementById('docking-log-modal');
        if (!logModal) {
            logModal = this.createDockingLogModal();
            document.body.appendChild(logModal);
        }

        const logContent = logModal.querySelector('.log-content');
        const logContainer = logModal.querySelector('.log-container');
        
        // Re-render all logs to ensure we have the latest
        this.renderDockingLogs(logContent);
        
        logModal.style.display = 'block';
        // Scroll to bottom after a brief delay to ensure content is rendered
        setTimeout(() => {
            logContainer.scrollTop = logContainer.scrollHeight;
        }, 100);
    }

    showESMFoldLogModal() {
        let logModal = document.getElementById('esmfold-log-modal');
        if (!logModal) {
            logModal = this.createESMFoldLogModal();
            document.body.appendChild(logModal);
        }

        const logContent = logModal.querySelector('.log-content');
        const logContainer = logModal.querySelector('.log-container');
        
        logModal.style.display = 'block';
        // Scroll to bottom after a brief delay
        setTimeout(() => {
            if (logContainer) {
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        }, 100);
    }

    createESMFoldLogModal() {
        const modal = document.createElement('div');
        modal.id = 'esmfold-log-modal';
        modal.className = 'log-modal';
        modal.style.display = 'none';
        
        modal.innerHTML = `
            <div class="log-modal-content" style="max-width: 900px;">
                <div class="log-modal-header">
                    <h3><i class="fas fa-terminal"></i> ESMFold & Minimization Logs</h3>
                    <button class="log-modal-close" onclick="this.closest('.log-modal').style.display='none'">&times;</button>
                </div>
                <div class="log-container" style="max-height: 600px; overflow-y: auto;">
                    <div class="log-content" id="esmfold-log-content" style="font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; background: #1e1e1e; color: #d4d4d4; white-space: pre-wrap; word-wrap: break-word;"></div>
                </div>
            </div>
        `;
        
        // Add click handler to modal background to close
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        return modal;
    }

    addESMFoldLogLine(message, type = 'info') {
        const container = document.getElementById('esmfold-log-content');
        if (!container) return;
        
        const line = document.createElement('div');
        line.style.marginBottom = '2px';
        
        // Color coding based on type
        if (type === 'error') {
            line.style.color = '#f48771';
        } else if (type === 'warning') {
            line.style.color = '#dcdcaa';
        } else if (type === 'success') {
            line.style.color = '#4ec9b0';
        } else {
            line.style.color = '#d4d4d4';
        }
        
        line.textContent = message;
        container.appendChild(line);
        
        // Auto-scroll to bottom
        const logContainer = container.parentElement;
        if (logContainer) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    async openVinaConfigEditor(ligandIndex) {
        try {
            // First, get current GUI values
            const currentValues = this.getCurrentBoxValues(ligandIndex);
            
            // Fetch config file
            const response = await this.apiFetch(`/api/docking/get-config?ligand_index=${ligandIndex}`);
            const result = await response.json();
            
            if (!result.success) {
                alert(`Error loading config: ${result.error}`);
                return;
            }
            
            // Update config content with current GUI values
            let configContent = result.content;
            configContent = this.updateConfigWithGUIValues(configContent, currentValues);
            
            // Create or get modal
            let modal = document.getElementById('vina-config-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'vina-config-modal';
                modal.className = 'log-modal';
                modal.innerHTML = `
                    <div class="log-modal-content" style="max-width: 800px;">
                        <div class="log-modal-header">
                            <h3><i class="fas fa-cog"></i> Vina Configuration - Ligand <span id="config-ligand-index"></span></h3>
                            <button class="log-modal-close" onclick="document.getElementById('vina-config-modal').style.display='none'">&times;</button>
                        </div>
                        <div style="padding: 20px;">
                            <p style="margin-bottom: 15px; color: #6c757d;">
                                Edit the Vina configuration file. Changes will be saved automatically when you click "Save Config".
                            </p>
                            <textarea id="vina-config-editor" style="width: 100%; height: 400px; font-family: 'Courier New', monospace; font-size: 13px; padding: 10px; border: 1px solid #ced4da; border-radius: 5px; background: #f8f9fa;"></textarea>
                            <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end;">
                                <button class="btn btn-secondary" onclick="document.getElementById('vina-config-modal').style.display='none'">Cancel</button>
                                <button class="btn btn-primary" id="save-vina-config-btn">
                                    <i class="fas fa-save"></i> Save Config
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                
                // Add click handler to modal background to close
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) {
                        modal.style.display = 'none';
                    }
                });
                
                // Add save handler
                const self = this;
                document.getElementById('save-vina-config-btn').addEventListener('click', function() {
                    const currentLigandIndex = parseInt(modal.dataset.ligandIndex || ligandIndex);
                    self.saveVinaConfig(currentLigandIndex);
                });
            }
            
            // Update modal content (even if modal already existed)
            // Get ligand name from dockingBoxDefaults or use index as fallback
            const ligandInfo = this.dockingBoxDefaults && this.dockingBoxDefaults[ligandIndex];
            const ligandName = ligandInfo ? (ligandInfo.name || `Ligand ${ligandIndex}`) : `Ligand ${ligandIndex}`;
            document.getElementById('config-ligand-index').textContent = ligandName;
            const editor = document.getElementById('vina-config-editor');
            if (editor) {
                editor.value = configContent;
            }
            
            // Store current ligand index
            modal.dataset.ligandIndex = ligandIndex;
            
            modal.style.display = 'block';
            if (editor) {
                editor.focus();
            }
        } catch (error) {
            console.error('Error opening config editor:', error);
            alert(`Error opening config editor: ${error.message}`);
        }
    }

    getCurrentBoxValues(ligandIndex) {
        // Get current values from GUI inputs
        const cxEl = document.getElementById(`dock-lig${ligandIndex}-center-x`);
        const cyEl = document.getElementById(`dock-lig${ligandIndex}-center-y`);
        const czEl = document.getElementById(`dock-lig${ligandIndex}-center-z`);
        const sxEl = document.getElementById(`dock-lig${ligandIndex}-size-x`);
        const syEl = document.getElementById(`dock-lig${ligandIndex}-size-y`);
        const szEl = document.getElementById(`dock-lig${ligandIndex}-size-z`);
        
        return {
            center_x: cxEl ? parseFloat(cxEl.value) || 0 : 0,
            center_y: cyEl ? parseFloat(cyEl.value) || 0 : 0,
            center_z: czEl ? parseFloat(czEl.value) || 0 : 0,
            size_x: sxEl ? parseFloat(sxEl.value) || 18 : 18,
            size_y: syEl ? parseFloat(syEl.value) || 18 : 18,
            size_z: szEl ? parseFloat(szEl.value) || 18 : 18
        };
    }

    updateConfigWithGUIValues(configContent, values) {
        // Update config content with current GUI values
        // Replace existing values or add if they don't exist
        let lines = configContent.split('\n');
        const keys = ['center_x', 'center_y', 'center_z', 'size_x', 'size_y', 'size_z'];
        const updatedKeys = new Set();
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('#')) {
                for (const key of keys) {
                    if (line.startsWith(key + ' =')) {
                        const newValue = key.startsWith('center') ? 
                            values[key].toFixed(2) : 
                            values[key].toFixed(1);
                        lines[i] = `${key} = ${newValue}`;
                        updatedKeys.add(key);
                        break;
                    }
                }
            }
        }
        
        // If we didn't find some keys, add them after the comment section
        const missingKeys = keys.filter(k => !updatedKeys.has(k));
        if (missingKeys.length > 0) {
            // Find where to insert (after comments, before other parameters)
            let insertIndex = 0;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith('#')) {
                    insertIndex = i + 1;
                } else if (lines[i].trim() && !lines[i].trim().startsWith('#')) {
                    break;
                }
            }
            
            // Insert missing values
            const newLines = [];
            for (const key of missingKeys) {
                const value = key.startsWith('center') ? 
                    values[key].toFixed(2) : 
                    values[key].toFixed(1);
                newLines.push(`${key} = ${value}`);
            }
            if (newLines.length > 0) {
                lines.splice(insertIndex, 0, ...newLines);
            }
        }
        
        return lines.join('\n');
    }

    async updateConfigFileFromGUI(ligandIndex) {
        // Silently update the config file with current GUI values
        try {
            const currentValues = this.getCurrentBoxValues(ligandIndex);
            
            // Fetch current config
            const response = await this.apiFetch(`/api/docking/get-config?ligand_index=${ligandIndex}`);
            const result = await response.json();
            
            if (!result.success) {
                return; // Silently fail
            }
            
            // Update config content
            const updatedContent = this.updateConfigWithGUIValues(result.content, currentValues);
            
            // Save updated config
            await this.apiFetch('/api/docking/save-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ligand_index: ligandIndex,
                    content: updatedContent
                })
            });
        } catch (error) {
            // Silently fail - don't interrupt user workflow
            console.debug('Error updating config file:', error);
        }
    }

    async saveVinaConfig(ligandIndex) {
        const editor = document.getElementById('vina-config-editor');
        if (!editor) return;
        
        const content = editor.value;
        if (!content.trim()) {
            alert('Config file cannot be empty');
            return;
        }
        
        try {
            const response = await this.apiFetch('/api/docking/save-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ligand_index: ligandIndex,
                    content: content
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Show success message
                const saveBtn = document.getElementById('save-vina-config-btn');
                const originalText = saveBtn.innerHTML;
                saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
                saveBtn.classList.remove('btn-primary');
                saveBtn.classList.add('btn-success');
                saveBtn.disabled = true;
                
                setTimeout(() => {
                    saveBtn.innerHTML = originalText;
                    saveBtn.classList.remove('btn-success');
                    saveBtn.classList.add('btn-primary');
                    saveBtn.disabled = false;
                }, 2000);
            } else {
                alert(`Error saving config: ${result.error}`);
            }
        } catch (error) {
            console.error('Error saving config:', error);
            alert(`Error saving config: ${error.message}`);
        }
    }

    countAtomsInPDB(pdbContent) {
        const lines = pdbContent.split('\n');
        return lines.filter(line => line.startsWith('ATOM') || line.startsWith('HETATM')).length;
    }

    async generateAllFiles() {
        if (!this.preparedProtein) {
            alert('Please prepare structure first');
            return;
        }

        // Show loading state
        const button = document.getElementById('generate-files');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        button.disabled = true;

        try {
               // Collect all simulation parameters
               const params = {
                   cutoff_distance: parseFloat(document.getElementById('cutoff').value),
                   temperature: parseFloat(document.getElementById('temperature').value),
                   pressure: parseFloat(document.getElementById('pressure').value),
                   restrained_steps: parseInt(document.getElementById('restrained-steps').value),
                   restrained_force: parseFloat(document.getElementById('restrained-force').value),
                   min_steps: parseInt(document.getElementById('min-steps').value),
                   npt_heating_steps: parseInt(document.getElementById('nvt-steps').value),
                   npt_equilibration_steps: parseInt(document.getElementById('npt-steps').value),
                   production_steps: parseInt(document.getElementById('prod-steps').value),
                   timestep: parseFloat(document.getElementById('timestep').value),
                   // Force field parameters
                   force_field: document.getElementById('force-field').value,
                   water_model: document.getElementById('water-model').value,
                   add_ions: document.getElementById('add-ions').value,
                   distance: parseFloat(document.getElementById('box-size').value)
               };

            const response = await this.apiFetch('/api/generate-all-files', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params)
            });

            const result = await response.json();

            if (result.success) {
                let message = `✅ ${result.message}\n\nGenerated files:\n`;
                result.files_generated.forEach(file => {
                    message += `- ${file}\n`;
                });
                
                if (result.warnings && result.warnings.length > 0) {
                    message += `\n⚠️ Warnings:\n`;
                    result.warnings.forEach(warning => {
                        message += `- ${warning}\n`;
                    });
                }
                
                alert(message);

                // Reveal the download section
                const downloadSection = document.getElementById('download-section');
                if (downloadSection) {
                    downloadSection.style.display = 'block';
                }
            } else {
                alert(`❌ Error: ${result.error}`);
            }
        } catch (error) {
            console.error('Error generating files:', error);
            alert(`❌ Error: Failed to generate simulation files. ${error.message}`);
        } finally {
            // Restore button state
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }

    createSimulationFiles() {
        const files = {};
        const proteinName = this.currentProtein.structureId.toLowerCase();
        
        // Generate GROMACS input files
        files[`${proteinName}.mdp`] = this.generateMDPFile();
        files[`${proteinName}_restrained.mdp`] = this.generateRestrainedMDPFile();
        files[`${proteinName}_min.mdp`] = this.generateMinimizationMDPFile();
        files[`${proteinName}_nvt.mdp`] = this.generateNVTMDPFile();
        files[`${proteinName}_npt.mdp`] = this.generateNPTMDPFile();
        files[`${proteinName}_prod.mdp`] = this.generateProductionMDPFile();
        
        // Generate PBS script
        files[`${proteinName}_simulation.pbs`] = this.generatePBSScript();
        
        // Generate setup script
        files[`setup_${proteinName}.sh`] = this.generateSetupScript();
        
        // Generate analysis script
        files[`analyze_${proteinName}.sh`] = this.generateAnalysisScript();

        return files;
    }

    generateMDPFile() {
        const params = this.simulationParams;
        return `; MD Simulation Parameters
; Generated by MD Simulation Pipeline

; Run parameters
integrator = md
dt = ${params.timestep}
nsteps = ${params.steps.production.steps}

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
rlist = ${params.cutoff}

; Electrostatics
coulombtype = PME
rcoulomb = ${params.cutoff}
pme_order = ${params.pmeOrder}
fourierspacing = 0.16

; Van der Waals
vdwtype = Cut-off
rvdw = ${params.cutoff}

; Temperature coupling
tcoupl = ${params.couplingType}
tc-grps = Protein Non-Protein
tau_t = 0.1 0.1
ref_t = ${params.temperature} ${params.temperature}

; Pressure coupling
pcoupl = ${params.couplingType}
pcoupltype = isotropic
tau_p = 2.0
ref_p = ${params.pressure}
compressibility = 4.5e-5

; Dispersion correction
DispCorr = EnerPres

; Velocity generation
gen_vel = yes
gen_temp = ${params.temperature}
gen_seed = -1
`;
    }

    generateRestrainedMDPFile() {
        const params = this.simulationParams;
        return `; Restrained Minimization Parameters
integrator = steep
nsteps = ${params.steps.restrainedMin.steps}
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
rlist = ${params.cutoff}

; Electrostatics
coulombtype = PME
rcoulomb = ${params.cutoff}
pme_order = ${params.pme_order}

; Van der Waals
vdwtype = Cut-off
rvdw = ${params.cutoff}
`;
    }

    generateMinimizationMDPFile() {
        const params = this.simulationParams;
        return `; Minimization Parameters
integrator = ${params.steps.minimization.algorithm}
nsteps = ${params.steps.minimization.steps}
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
rlist = ${params.cutoff}

; Electrostatics
coulombtype = PME
rcoulomb = ${params.cutoff}
pme_order = ${params.pme_order}

; Van der Waals
vdwtype = Cut-off
rvdw = ${params.cutoff}
`;
    }

    generateNVTMDPFile() {
        const params = this.simulationParams;
        return `; NVT Equilibration Parameters
integrator = md
dt = ${params.timestep}
nsteps = ${params.steps.nvt.steps}

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
rlist = ${params.cutoff}

; Electrostatics
coulombtype = PME
rcoulomb = ${params.cutoff}
pme_order = ${params.pme_order}

; Van der Waals
vdwtype = Cut-off
rvdw = ${params.cutoff}

; Temperature coupling
tcoupl = ${params.couplingType}
tc-grps = Protein Non-Protein
tau_t = 0.1 0.1
ref_t = ${params.steps.nvt.temperature} ${params.steps.nvt.temperature}

; Pressure coupling (disabled for NVT)
pcoupl = no

; Velocity generation
gen_vel = yes
gen_temp = ${params.steps.nvt.temperature}
gen_seed = -1
`;
    }

    generateNPTMDPFile() {
        const params = this.simulationParams;
        return `; NPT Equilibration Parameters
integrator = md
dt = ${params.timestep}
nsteps = ${params.steps.npt.steps}

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
rlist = ${params.cutoff}

; Electrostatics
coulombtype = PME
rcoulomb = ${params.cutoff}
pme_order = ${params.pme_order}

; Van der Waals
vdwtype = Cut-off
rvdw = ${params.cutoff}

; Temperature coupling
tcoupl = ${params.couplingType}
tc-grps = Protein Non-Protein
tau_t = 0.1 0.1
ref_t = ${params.steps.npt.temperature} ${params.steps.npt.temperature}

; Pressure coupling
pcoupl = ${params.couplingType}
pcoupltype = isotropic
tau_p = 2.0
ref_p = ${params.steps.npt.pressure}
compressibility = 4.5e-5

; Velocity generation
gen_vel = no
`;
    }

    generateProductionMDPFile() {
        return this.generateMDPFile(); // Same as main MDP file
    }

    generatePBSScript() {
        const proteinName = this.currentProtein.structureId.toLowerCase();
        const totalSteps = this.simulationParams.steps.production.steps;
        const timeInNs = (totalSteps * this.simulationParams.timestep) / 1000;
        
        return `#!/bin/bash
#PBS -N ${proteinName}_md
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
PROTEIN=${proteinName}
STEPS=${totalSteps}
TIME_NS=${timeInNs.toFixed(2)}

echo "Starting MD simulation for $PROTEIN"
echo "Total simulation time: $TIME_NS ns"
echo "Job started at: $(date)"

# Run the simulation
./run_simulation.sh $PROTEIN

echo "Simulation completed at: $(date)"
echo "Results saved in output directory"
`;
    }

    generateSetupScript() {
        const proteinName = this.currentProtein.structureId.toLowerCase();
        return `#!/bin/bash
# Setup script for ${proteinName} MD simulation
# Generated by MD Simulation Pipeline

set -e

PROTEIN=${proteinName}
FORCE_FIELD=${this.simulationParams.forceField}
WATER_MODEL=${this.simulationParams.waterModel}

echo "Setting up MD simulation for $PROTEIN"

# Create output directory
mkdir -p output

# 1. Prepare protein structure
echo "Preparing protein structure..."
gmx pdb2gmx -f ${PROTEIN}.pdb -o ${PROTEIN}_processed.gro -p ${PROTEIN}.top -ff ${FORCE_FIELD} -water ${WATER_MODEL}

# 2. Define simulation box
echo "Defining simulation box..."
gmx editconf -f ${PROTEIN}_processed.gro -o ${PROTEIN}_box.gro -c -d ${this.simulationParams.boxMargin} -bt ${this.simulationParams.boxType}

# 3. Add solvent
echo "Adding solvent..."
gmx solvate -cp ${PROTEIN}_box.gro -cs spc216.gro -o ${PROTEIN}_solv.gro -p ${PROTEIN}.top

# 4. Add ions
echo "Adding ions..."
gmx grompp -f ${PROTEIN}_restrained.mdp -c ${PROTEIN}_solv.gro -p ${PROTEIN}.top -o ${PROTEIN}_ions.tpr
echo "SOL" | gmx genion -s ${PROTEIN}_ions.tpr -o ${PROTEIN}_final.gro -p ${PROTEIN}.top -pname NA -nname CL -neutral

echo "Setup completed successfully!"
echo "Ready to run simulation with: ./run_simulation.sh $PROTEIN"
`;
    }

    generateAnalysisScript() {
        const proteinName = this.currentProtein.structureId.toLowerCase();
        return `#!/bin/bash
# Analysis script for ${proteinName} MD simulation
# Generated by MD Simulation Pipeline

PROTEIN=${proteinName}

echo "Analyzing MD simulation results for $PROTEIN"

# Create analysis directory
mkdir -p analysis

# 1. RMSD analysis
echo "Calculating RMSD..."
echo "Protein" | gmx rms -s ${PROTEIN}_final.tpr -f ${PROTEIN}_prod.xtc -o analysis/${PROTEIN}_rmsd.xvg -tu ns

# 2. RMSF analysis
echo "Calculating RMSF..."
echo "Protein" | gmx rmsf -s ${PROTEIN}_final.tpr -f ${PROTEIN}_prod.xtc -o analysis/${PROTEIN}_rmsf.xvg -res

# 3. Radius of gyration
echo "Calculating radius of gyration..."
echo "Protein" | gmx gyrate -s ${PROTEIN}_final.tpr -f ${PROTEIN}_prod.xtc -o analysis/${PROTEIN}_gyrate.xvg

# 4. Hydrogen bonds
echo "Analyzing hydrogen bonds..."
echo "Protein" | gmx hbond -s ${PROTEIN}_final.tpr -f ${PROTEIN}_prod.xtc -num analysis/${PROTEIN}_hbonds.xvg

# 5. Energy analysis
echo "Analyzing energies..."
gmx energy -f ${PROTEIN}_prod.edr -o analysis/${PROTEIN}_energy.xvg

# 6. Generate plots
echo "Generating analysis plots..."
python3 plot_analysis.py ${PROTEIN}

echo "Analysis completed! Results saved in analysis/ directory"
`;
    }

    displayGeneratedFiles() {
        const filesList = document.getElementById('files-list');
        filesList.innerHTML = '';

        Object.entries(this.generatedFiles).forEach(([filename, content]) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            
            const fileType = this.getFileType(filename);
            const fileSize = this.formatFileSize(content.length);
            
            fileItem.innerHTML = `
                <h4><i class="fas ${this.getFileIcon(filename)}"></i> ${filename}</h4>
                <p><strong>Type:</strong> ${fileType}</p>
                <p><strong>Size:</strong> ${fileSize}</p>
                <button class="btn btn-secondary btn-sm" onclick="mdPipeline.previewFile('${filename}')">
                    <i class="fas fa-eye"></i> Preview
                </button>
                <button class="btn btn-primary btn-sm" onclick="mdPipeline.downloadFile('${filename}')">
                    <i class="fas fa-download"></i> Download
                </button>
            `;
            
            filesList.appendChild(fileItem);
        });
    }

    getFileType(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        const types = {
            'mdp': 'GROMACS MDP',
            'pbs': 'PBS Script',
            'sh': 'Shell Script',
            'gro': 'GROMACS Structure',
            'top': 'GROMACS Topology',
            'xvg': 'GROMACS Data'
        };
        return types[extension] || 'Text File';
    }

    getFileIcon(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        const icons = {
            'mdp': 'fa-cogs',
            'pbs': 'fa-tasks',
            'sh': 'fa-terminal',
            'gro': 'fa-cube',
            'top': 'fa-sitemap',
            'xvg': 'fa-chart-line'
        };
        return icons[extension] || 'fa-file';
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    previewFile(filename) {
        const content = this.generatedFiles[filename];
        const previewWindow = window.open('', '_blank', 'width=800,height=600');
        previewWindow.document.write(`
            <html>
                <head>
                    <title>Preview: ${filename}</title>
                    <style>
                        body { font-family: monospace; margin: 20px; background: #f5f5f5; }
                        pre { background: white; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                        h1 { color: #333; }
                    </style>
                </head>
                <body>
                    <h1>${filename}</h1>
                    <pre>${content}</pre>
                </body>
            </html>
        `);
    }

    downloadFile(filename) {
        const content = this.generatedFiles[filename];
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async previewFiles() {
        try {
            const resp = await this.apiFetch('/api/get-generated-files');
            const data = await resp.json();
            if (!data.success) {
                alert('❌ Error: ' + (data.error || 'Unable to load files'));
                return;
            }
            const filesList = document.getElementById('files-list');
            if (!filesList) return;
            filesList.innerHTML = '';
            
            // Store file contents for modal display
            this.fileContents = data.files;
            
            Object.entries(data.files).forEach(([name, content]) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.style.cssText = 'padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 5px; cursor: pointer; background: #f9f9f9;';
                fileItem.innerHTML = `<strong>${name}</strong>`;
                // Use cache at click time so we show saved edits; closure over `content` would stay stale after save
                fileItem.onclick = () => this.showFileContent(name, this.fileContents?.[name] ?? content);
                filesList.appendChild(fileItem);
            });
            
            // Reveal preview and download areas
            const preview = document.getElementById('files-preview');
            if (preview) preview.style.display = 'block';
            const dl = document.getElementById('download-section');
            if (dl) dl.style.display = 'block';
            this.switchTab('file-generation');
        } catch (e) {
            console.error('Preview error:', e);
            alert('❌ Failed to preview files: ' + e.message);
        }
    }

    showFileContent(filename, content) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('file-content-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'file-content-modal';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0,0,0,0.5); z-index: 1000; display: none; 
                align-items: center; justify-content: center;
            `;
            modal.innerHTML = `
                <div id="modal-content-container" style="background: white; border-radius: 10px; padding: 20px; max-width: 95%; min-width: 800px; max-height: 90%;
                           overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); display: flex; flex-direction: column; 
                           opacity: 0; transition: opacity 0.2s ease-in-out;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-shrink: 0;">
                        <h3 id="modal-filename" style="margin: 0; color: #333;"></h3>
                        <div style="display: flex; gap: 10px;">
                            <button id="edit-file-btn" style="background: #007bff; color: white; border: none; 
                                    border-radius: 5px; padding: 8px 15px; cursor: pointer;">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button id="save-file-btn" style="background: #28a745; color: white; border: none; 
                                    border-radius: 5px; padding: 8px 15px; cursor: pointer; display: none;">
                                <i class="fas fa-save"></i> Save
                            </button>
                            <button id="cancel-edit-btn" style="background: #6c757d; color: white; border: none; 
                                    border-radius: 5px; padding: 8px 15px; cursor: pointer; display: none;">
                                Cancel
                            </button>
                            <button id="close-modal" style="background: #dc3545; color: white; border: none; 
                                    border-radius: 5px; padding: 8px 15px; cursor: pointer;">
                                Close
                            </button>
                        </div>
                    </div>
                    <div style="flex: 1; overflow: auto; min-height: 0;">
                        <pre id="modal-content" style="background: #f8f9fa; padding: 15px; border-radius: 5px; 
                             overflow: auto; max-height: 70vh; white-space: pre-wrap; font-family: monospace; margin: 0;"></pre>
                        <textarea id="modal-content-edit" style="width: 100%; height: 70vh; padding: 15px; border-radius: 5px; 
                                border: 2px solid #007bff; font-family: monospace; font-size: 14px; resize: vertical; 
                                display: none; box-sizing: border-box;"></textarea>
                    </div>
                    <div id="save-status" style="margin-top: 10px; padding: 10px; border-radius: 5px; display: none; flex-shrink: 0;"></div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Close modal handlers
            document.getElementById('close-modal').onclick = () => {
                this.exitEditMode(modal);
                modal.style.display = 'none';
            };
            modal.onclick = (e) => {
                if (e.target === modal) {
                    this.exitEditMode(modal);
                    modal.style.display = 'none';
                }
            };
            
            // Edit button handler
            document.getElementById('edit-file-btn').onclick = () => {
                this.enterEditMode(modal);
            };
            
            // Save button handler
            document.getElementById('save-file-btn').onclick = () => {
                this.saveFileContent(modal);
            };
            
            // Cancel button handler
            document.getElementById('cancel-edit-btn').onclick = () => {
                this.exitEditMode(modal, true); // Restore original content
            };
        }
        
        // Use cached content when available (e.g. after a save in this session) so the UI shows
        // the latest version; the file list's onclick may still pass stale content from its closure.
        if (this.fileContents && this.fileContents[filename] !== undefined) {
            content = this.fileContents[filename];
        }
        
        // Store current filename and original content
        modal.dataset.filename = filename;
        modal.dataset.originalContent = content;
        
        // Adjust width for PBS files (they tend to be wider) BEFORE showing
        const modalContainer = document.getElementById('modal-content-container');
        if (filename.endsWith('.pbs')) {
            modalContainer.style.minWidth = '1000px';
            modalContainer.style.maxWidth = '95%';
        } else {
            modalContainer.style.minWidth = '800px';
            modalContainer.style.maxWidth = '95%';
        }
        
        // Populate content BEFORE showing modal to prevent visual glitch
        document.getElementById('modal-filename').textContent = filename;
        document.getElementById('modal-content').textContent = content;
        document.getElementById('modal-content-edit').value = content;
        
        // Reset to view mode
        this.exitEditMode(modal);
        
        // Force a reflow to ensure dimensions are calculated
        void modalContainer.offsetHeight;
        
        // Show modal with flexbox centering - it will appear centered immediately
        modal.style.display = 'flex';
        
        // Fade in the content container
        requestAnimationFrame(() => {
            modalContainer.style.opacity = '1';
        });
    }

    enterEditMode(modal) {
        const pre = document.getElementById('modal-content');
        const textarea = document.getElementById('modal-content-edit');
        const editBtn = document.getElementById('edit-file-btn');
        const saveBtn = document.getElementById('save-file-btn');
        const cancelBtn = document.getElementById('cancel-edit-btn');
        
        pre.style.display = 'none';
        textarea.style.display = 'block';
        editBtn.style.display = 'none';
        saveBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'inline-block';
        
        // Focus textarea
        textarea.focus();
    }

    exitEditMode(modal, restoreOriginal = false) {
        const pre = document.getElementById('modal-content');
        const textarea = document.getElementById('modal-content-edit');
        const editBtn = document.getElementById('edit-file-btn');
        const saveBtn = document.getElementById('save-file-btn');
        const cancelBtn = document.getElementById('cancel-edit-btn');
        
        // Restore original content if canceling
        if (restoreOriginal && modal.dataset.originalContent) {
            textarea.value = modal.dataset.originalContent;
        }
        
        pre.style.display = 'block';
        textarea.style.display = 'none';
        editBtn.style.display = 'inline-block';
        saveBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        
        // Update pre content to match textarea
        pre.textContent = textarea.value;
    }

    async saveFileContent(modal) {
        const filename = modal.dataset.filename;
        const textarea = document.getElementById('modal-content-edit');
        const content = textarea.value;
        const statusDiv = document.getElementById('save-status');
        
        try {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#fff3cd';
            statusDiv.style.color = '#856404';
            statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            
            const response = await this.apiFetch('/api/save-file', {
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
                // Update original content
                modal.dataset.originalContent = content;
                
                // Update pre content
                document.getElementById('modal-content').textContent = content;
                
                // Update fileContents if it exists
                if (this.fileContents) {
                    this.fileContents[filename] = content;
                }
                
                statusDiv.style.background = '#d4edda';
                statusDiv.style.color = '#155724';
                statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> File saved successfully!';
                
                // Exit edit mode
                this.exitEditMode(modal);
                
                // Hide status after 3 seconds
                setTimeout(() => {
                    statusDiv.style.display = 'none';
                }, 3000);
            } else {
                throw new Error(result.error || 'Failed to save file');
            }
        } catch (error) {
            console.error('Error saving file:', error);
            statusDiv.style.background = '#f8d7da';
            statusDiv.style.color = '#721c24';
            statusDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error: ${error.message}`;
        }
    }

    showAddFileModal() {
        // Create modal if it doesn't exist
        let modal = document.getElementById('add-file-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'add-file-modal';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0,0,0,0.5); z-index: 1000; display: none;
            `;
            modal.innerHTML = `
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                           background: white; border-radius: 10px; padding: 20px; max-width: 90%; max-height: 90%;
                           overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); display: flex; flex-direction: column;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-shrink: 0;">
                        <h3 style="margin: 0; color: #333;"><i class="fas fa-plus-circle"></i> Add New Simulation File</h3>
                        <button id="close-add-modal" style="background: #dc3545; color: white; border: none; 
                                border-radius: 5px; padding: 8px 15px; cursor: pointer;">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                    <div style="flex: 1; overflow: auto; min-height: 0; margin-bottom: 15px;">
                        <div style="margin-bottom: 15px;">
                            <label for="new-filename" style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">
                                File Name (e.g., nvt_heating.in):
                            </label>
                            <input type="text" id="new-filename" placeholder="nvt_heating.in" 
                                   style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 5px; font-size: 14px; box-sizing: border-box;">
                            <small style="color: #6c757d; display: block; margin-top: 5px;">
                                File will be saved in the output directory. Make sure to include .in extension.
                            </small>
                        </div>
                        <div style="flex: 1; min-height: 300px;">
                            <label for="new-file-content" style="display: block; margin-bottom: 5px; font-weight: 600; color: #333;">
                                File Content:
                            </label>
                            <textarea id="new-file-content" placeholder="Enter file content here..." 
                                      style="width: 100%; height: 400px; padding: 15px; border: 2px solid #007bff; 
                                      border-radius: 5px; font-family: monospace; font-size: 14px; resize: vertical; 
                                      box-sizing: border-box;"></textarea>
                        </div>
                    </div>
                    <div id="add-file-status" style="margin-bottom: 10px; padding: 10px; border-radius: 5px; display: none; flex-shrink: 0;"></div>
                    <div style="display: flex; gap: 10px; flex-shrink: 0;">
                        <button id="save-new-file" style="background: #28a745; color: white; border: none; 
                                border-radius: 5px; padding: 10px 20px; cursor: pointer; flex: 1;">
                            <i class="fas fa-save"></i> Save File
                        </button>
                        <button id="cancel-add-file" style="background: #6c757d; color: white; border: none; 
                                border-radius: 5px; padding: 10px 20px; cursor: pointer;">
                            Cancel
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Close modal handlers
            document.getElementById('close-add-modal').onclick = () => {
                this.closeAddFileModal(modal);
            };
            document.getElementById('cancel-add-file').onclick = () => {
                this.closeAddFileModal(modal);
            };
            modal.onclick = (e) => {
                if (e.target === modal) {
                    this.closeAddFileModal(modal);
                }
            };
            
            // Save button handler
            document.getElementById('save-new-file').onclick = () => {
                this.saveNewFile(modal);
            };
        }
        
        // Clear previous content
        document.getElementById('new-filename').value = '';
        document.getElementById('new-file-content').value = '';
        document.getElementById('add-file-status').style.display = 'none';
        
        // Show modal
        modal.style.display = 'block';
        document.getElementById('new-filename').focus();
    }

    closeAddFileModal(modal) {
        modal.style.display = 'none';
        document.getElementById('new-filename').value = '';
        document.getElementById('new-file-content').value = '';
        document.getElementById('add-file-status').style.display = 'none';
    }

    async saveNewFile(modal) {
        const filename = document.getElementById('new-filename').value.trim();
        const content = document.getElementById('new-file-content').value;
        const statusDiv = document.getElementById('add-file-status');
        
        // Validation
        if (!filename) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#f8d7da';
            statusDiv.style.color = '#721c24';
            statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Please enter a file name.';
            return;
        }
        
        if (!content) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#fff3cd';
            statusDiv.style.color = '#856404';
            statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> File content cannot be empty.';
            return;
        }
        
        // Validate filename (must end with .in)
        if (!filename.endsWith('.in')) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#fff3cd';
            statusDiv.style.color = '#856404';
            statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> File name must end with .in extension.';
            return;
        }
        
        // Prevent directory traversal
        if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#f8d7da';
            statusDiv.style.color = '#721c24';
            statusDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Invalid file name.';
            return;
        }
        
        try {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#fff3cd';
            statusDiv.style.color = '#856404';
            statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving file...';
            
            const response = await this.apiFetch('/api/save-new-file', {
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
                statusDiv.style.background = '#d4edda';
                statusDiv.style.color = '#155724';
                statusDiv.innerHTML = `
                    <i class="fas fa-check-circle"></i> File saved successfully!<br>
                    <small style="display: block; margin-top: 5px;">
                        <strong>⚠️ Important:</strong> Please update the <code>submit_job.pbs</code> file to include this new simulation step.
                    </small>
                `;
                
                // Update fileContents if it exists
                if (this.fileContents) {
                    this.fileContents[filename] = content;
                }
                
                // Refresh the files list
                setTimeout(() => {
                    this.previewFiles();
                    this.closeAddFileModal(modal);
                    // Show a persistent message
                    alert(`✅ File "${filename}" saved successfully!\n\n⚠️ Please remember to update the submit_job.pbs file to include this new simulation step.`);
                }, 1500);
            } else {
                throw new Error(result.error || 'Failed to save file');
            }
        } catch (error) {
            console.error('Error saving new file:', error);
            statusDiv.style.background = '#f8d7da';
            statusDiv.style.color = '#721c24';
            statusDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error: ${error.message}`;
        }
    }

    async downloadZip() {
        try {
            const resp = await this.apiFetch('/api/download-output-zip');
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(text || 'Failed to create ZIP');
            }
            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'output.zip';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Download error:', e);
            alert('❌ Failed to download ZIP: ' + e.message);
        }
    }

    async previewSolvatedProtein() {
        try {
            // Show loading state
            const button = document.getElementById('preview-solvated');
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            button.disabled = true;

            // Fetch a single viewer PDB that marks ligands as HETATM within protein_solvated frame
            const response = await this.apiFetch('/api/get-viewer-pdb');
            if (!response.ok) {
                throw new Error('Viewer PDB not available. Please generate files first.');
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to load viewer PDB');
            }

            // Open the dedicated viewer page (bypasses CSP issues)
            await this.getSessionId();
            window.open('/viewer/viewer_protein_with_ligand.pdb?session_id=' + encodeURIComponent(this.sessionId), '_blank');

        } catch (error) {
            console.error('Error previewing solvated protein:', error);
            alert('❌ Error: ' + error.message);
        } finally {
            // Restore button state
            const button = document.getElementById('preview-solvated');
            button.innerHTML = '<i class="fas fa-tint"></i> Preview Solvated Protein';
            button.disabled = false;
        }
    }

    async downloadSolvatedProtein() {
        try {
            // Show loading state
            const button = document.getElementById('download-solvated');
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
            button.disabled = true;

            // Check if file exists by trying to fetch it
            await this.getSessionId();
            const response = await fetch(this.getOutputUrl('protein_solvated.pdb'), { method: 'HEAD' });
            
            if (!response.ok) {
                throw new Error('Solvated protein file not found. Please generate files first.');
            }

            // Create download link
            const downloadUrl = this.getOutputUrl('protein_solvated.pdb');
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = 'protein_solvated.pdb';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Show success feedback
            button.innerHTML = '<i class="fas fa-check"></i> Downloaded!';
            setTimeout(() => {
                button.innerHTML = originalText;
                button.disabled = false;
            }, 2000);

        } catch (error) {
            console.error('Error downloading solvated protein:', error);
            alert('❌ Error: ' + error.message);
            
            // Restore button state
            const button = document.getElementById('download-solvated');
            button.innerHTML = '<i class="fas fa-download"></i> Download Solvated Protein';
            button.disabled = false;
        }
    }

    displaySimulationSummary() {
        const summaryContent = document.getElementById('summary-content');
        const params = this.simulationParams;
        const protein = this.currentProtein;
        
        const totalTime = (params.steps.production.steps * params.timestep) / 1000; // Convert to ns
        
        summaryContent.innerHTML = `
            <div class="summary-item">
                <h4>Protein Information</h4>
                <p><strong>Structure ID:</strong> ${protein.structureId}</p>
                <p><strong>Atoms:</strong> ${protein.atomCount.toLocaleString()}</p>
                <p><strong>Chains:</strong> ${protein.chains.join(', ')}</p>
                <p><strong>Residues:</strong> ${protein.residueCount.toLocaleString()}</p>
            </div>
            <div class="summary-item">
                <h4>System Components</h4>
                <p><strong>Water molecules:</strong> ${protein.waterMolecules.toLocaleString()}</p>
                <p><strong>Ions:</strong> ${protein.ions.toLocaleString()}</p>
                <p><strong>Ligands:</strong> ${protein.ligands.length > 0 ? protein.ligands.join(', ') : 'None'}</p>
                <p><strong>HETATM entries:</strong> ${protein.hetatoms.toLocaleString()}</p>
            </div>
            <div class="summary-item">
                <h4>Simulation Box</h4>
                <p><strong>Type:</strong> ${params.boxType}</p>
                <p><strong>Size:</strong> ${params.boxSize} nm</p>
                <p><strong>Margin:</strong> ${params.boxMargin} nm</p>
            </div>
            <div class="summary-item">
                <h4>Force Field & Water</h4>
                <p><strong>Force Field:</strong> ${params.forceField}</p>
                <p><strong>Water Model:</strong> ${params.waterModel}</p>
                <p><strong>Ion Conc.:</strong> ${params.ionConcentration} mM</p>
            </div>
            <div class="summary-item">
                <h4>Simulation Parameters</h4>
                <p><strong>Temperature:</strong> ${params.temperature} K</p>
                <p><strong>Pressure:</strong> ${params.pressure} bar</p>
                <p><strong>Time Step:</strong> ${params.timestep} ps</p>
            </div>
            <div class="summary-item">
                <h4>Simulation Time</h4>
                <p><strong>Total Time:</strong> ${totalTime.toFixed(2)} ns</p>
                <p><strong>Steps:</strong> ${params.steps.production.steps.toLocaleString()}</p>
                <p><strong>Output Freq:</strong> Every 5 ps</p>
            </div>
            <div class="summary-item">
                <h4>Generated Files</h4>
                <p><strong>MDP Files:</strong> 6</p>
                <p><strong>Scripts:</strong> 3</p>
                <p><strong>Total Size:</strong> ${this.formatFileSize(Object.values(this.generatedFiles).join('').length)}</p>
            </div>
        `;
    }

    // 3D Visualization Methods
    async load3DVisualization() {
        if (!this.currentProtein) return;

        try {
            // Initialize NGL stage if not already done
            if (!this.nglStage) {
                this.nglStage = new NGL.Stage("ngl-viewer", {
                    backgroundColor: "white",
                    quality: "medium"
                });
            }

            // Clear existing components
            this.nglStage.removeAllComponents();

            // Create a blob from PDB content
            const blob = new Blob([this.currentProtein.content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            // Load the structure
            const component = await this.nglStage.loadFile(url, {
                ext: "pdb",
                defaultRepresentation: false
            });

            // Add cartoon representation for each chain with consistent colors
            // This ensures each chain gets the same color as in Step 1
            // Use chains from parsed protein data (more reliable than structure API)
            const structureChains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                // Add representation for each chain that exists in the structure
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        component.addRepresentation("cartoon", {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.9
                        });
                    }
                });
            } else {
                // Fallback: use chainid if color map not available
                component.addRepresentation("cartoon", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.9
                });
            }
            
            // Apply consistent chain colors after representation is added (backup)
            setTimeout(() => {
                this.applyConsistentChainColors(component);
            }, 500);

            // Add ball and stick for water molecules
            if (this.currentProtein.waterMolecules > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "water",
                    color: "cyan",
                    colorScheme: "uniform",
                    radius: 0.1
                });
            }

            // Add ball and stick for ions
            if (this.currentProtein.ions > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "ion",
                    color: "element",
                    radius: 0.2
                });
            }

            // Add ball and stick for ligands
            if (this.currentProtein.ligands.length > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "hetero",
                    color: "element",
                    radius: 0.15
                });
            }

            // Auto-fit the view
            this.nglStage.autoView();

            // Show controls
            document.getElementById('viewer-controls').style.display = 'flex';

            // Clean up the blob URL
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error loading 3D visualization:', error);
            this.showStatus('error', 'Error loading 3D visualization: ' + error.message);
        }
    }

    resetView() {
        if (this.nglStage) {
            this.nglStage.autoView();
        }
    }

    toggleRepresentation() {
        if (!this.nglStage) return;

        const components = this.nglStage.compList;
        if (components.length === 0) return;

        const component = components[0];
        component.removeAllRepresentations();

        if (this.currentRepresentation === 'cartoon') {
            // Switch to ball and stick for everything
            component.addRepresentation("ball+stick", {
                color: "element",
                radius: 0.15
            });
            this.currentRepresentation = 'ball+stick';
            document.getElementById('style-text').textContent = 'Ball & Stick';
        } else if (this.currentRepresentation === 'ball+stick') {
            // Switch to surface (protein only; excludes hetero so ligands are not buried) + ball&stick for others
            const structureChains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        component.addRepresentation("surface", {
                            sele: `protein and :${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.7
                        });
                    }
                });
            } else {
                component.addRepresentation("surface", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.7
                });
            }

            // Add ball and stick for water molecules
            if (this.currentProtein.waterMolecules > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "water",
                    color: "cyan",
                    colorScheme: "uniform",
                    radius: 0.1
                });
            }

            // Add ball and stick for ions
            if (this.currentProtein.ions > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "ion",
                    color: "element",
                    radius: 0.2
                });
            }

            // Add ball and stick for ligands
            if (this.currentProtein.ligands.length > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "hetero",
                    color: "element",
                    radius: 0.15
                });
            }

            this.currentRepresentation = 'surface';
            document.getElementById('style-text').textContent = 'Surface';
        } else {
            // Switch back to mixed representation (protein ribbon + others ball&stick)
            component.addRepresentation("cartoon", {
                sele: "protein",
                colorScheme: "chainname",
                opacity: 0.8
            });

            // Add ball and stick for water molecules
            if (this.currentProtein.waterMolecules > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "water",
                    color: "cyan",
                    colorScheme: "uniform",
                    radius: 0.1
                });
            }

            // Add ball and stick for ions
            if (this.currentProtein.ions > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "ion",
                    color: "element",
                    radius: 0.2
                });
            }

            // Add ball and stick for ligands
            if (this.currentProtein.ligands.length > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "hetero",
                    color: "element",
                    radius: 0.15
                });
            }

            this.currentRepresentation = 'cartoon';
            document.getElementById('style-text').textContent = 'Mixed View';
        }
    }

    toggleSpin() {
        if (!this.nglStage) return;

        this.isSpinning = !this.isSpinning;
        this.nglStage.setSpin(this.isSpinning);
    }

    // Structure Preparation Methods
    async prepareStructure() {
        if (!this.currentProtein) {
            alert('Please load a protein structure first');
            return;
        }

        // Get selected chains first and validate
        const selectedChains = this.getSelectedChains();
        if (!selectedChains || selectedChains.length === 0) {
            alert('Please select at least one chain for structure preparation.');
            return;
        }

        // Get preparation options
        const options = {
            remove_water: document.getElementById('remove-water').checked,
            remove_ions: document.getElementById('remove-ions').checked,
            remove_hydrogens: document.getElementById('remove-hydrogens').checked,
            add_nme: document.getElementById('add-nme').checked,
            add_ace: document.getElementById('add-ace').checked,
            preserve_ligands: document.getElementById('preserve-ligands').checked,
            separate_ligands: document.getElementById('separate-ligands').checked,
            selected_chains: selectedChains,
            selected_ligands: this.getSelectedLigands()
        };

        // Show status
        document.getElementById('prep-status').style.display = 'block';
        document.getElementById('prep-status-content').innerHTML = `
            <p><i class="fas fa-spinner fa-spin"></i> Preparing structure...</p>
        `;

        try {
            // Call Python backend
            const response = await this.apiFetch('/api/prepare-structure', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pdb_content: this.currentProtein.content,
                    options: options
                })
            });

            const result = await response.json();

            if (result.success) {
                // Display ligand name changes if any
                if (result.ligand_name_changes && result.ligand_name_changes.length > 0) {
                    const changesList = result.ligand_name_changes.map(change => {
                        const [oldName, newName, filename] = change;
                        return `• Ligand "${oldName}" renamed to "${newName}" (in ${filename})`;
                    }).join('\n');
                    
                    alert(
                        `⚠️ Ligand Name Changes Detected\n\n` +
                        `The following ligand names were changed because they were pure numeric:\n\n` +
                        `${changesList}\n\n` +
                        `tleap won't accept pure numeric names while loading ligand mol2 files. ` +
                        `They have been converted to 3-letter codes (e.g., "478" → "L78"). ` +
                        `The PDB files have been updated automatically.`
                    );
                }
                
                // Store prepared structure
                this.preparedProtein = {
                    content: result.prepared_structure,
                    original_atoms: result.original_atoms,
                    prepared_atoms: result.prepared_atoms,
                    removed_components: result.removed_components,
                    added_capping: result.added_capping,
                    preserved_ligands: result.preserved_ligands,
                    ligand_present: result.ligand_present,
                    separate_ligands: result.separate_ligands,
                    ligand_content: result.ligand_content || ''
                };

                // Format removed components
                const removedText = result.removed_components ? 
                    Object.entries(result.removed_components)
                        .filter(([key, value]) => value > 0)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ') || 'None' : 'None';
                
                // Format added capping
                const addedText = result.added_capping ? 
                    Object.entries(result.added_capping)
                        .filter(([key, value]) => value > 0)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ') || 'None' : 'None';

                // Update status
                document.getElementById('prep-status-content').innerHTML = `
                    <p><i class="fas fa-check-circle"></i> Structure preparation completed!</p>
                    <p><strong>Original atoms:</strong> ${result.original_atoms.toLocaleString()} <span style="font-size:0.9em; color:#6c757d;">(protein without H, before capping)</span></p>
                    <p><strong>Prepared atoms:</strong> ${result.prepared_atoms.toLocaleString()} <span style="font-size:0.9em; color:#6c757d;">(protein without H, after capping)</span></p>
                    <p><strong>Removed:</strong> ${removedText}</p>
                    <p><strong>Added:</strong> ${addedText}</p>
                    <p><strong>Ligands:</strong> ${result.preserved_ligands}</p>
                    <p>Ready for AMBER force field generation!</p>
                `;

                // Enable preview and download buttons
                document.getElementById('preview-prepared').disabled = false;
                document.getElementById('download-prepared').disabled = false;
                
                // Enable ligand download button if ligands are present and separate ligands is checked
                const separateLigandsChecked = document.getElementById('separate-ligands').checked;
                const downloadLigandBtn = document.getElementById('download-ligand');
                if (result.ligand_present && separateLigandsChecked && result.ligand_content) {
                    downloadLigandBtn.disabled = false;
                    downloadLigandBtn.classList.remove('btn-outline-secondary');
                    downloadLigandBtn.classList.add('btn-outline-primary');
                } else {
                    downloadLigandBtn.disabled = true;
                    downloadLigandBtn.classList.remove('btn-outline-primary');
                    downloadLigandBtn.classList.add('btn-outline-secondary');
                }

                // Show ligand force field group if preserve ligands is checked
                const preserveLigandsChecked = document.getElementById('preserve-ligands').checked;
                const dockingSection = document.getElementById('docking-section');
                if (preserveLigandsChecked && result.ligand_present) {
                    this.toggleLigandForceFieldGroup(true);
                    if (dockingSection) {
                        dockingSection.style.display = 'block';
                        this.initializeDockingSetup(result.preserved_ligands || 0);
                        // Store ligand info for selection
                        this.dockingLigandCount = result.preserved_ligands || 0;
                    }
                } else if (dockingSection) {
                    dockingSection.style.display = 'none';
                }
            } else {
                throw new Error(result.error || 'Structure preparation failed');
            }
        } catch (error) {
            console.error('Error preparing structure:', error);
            document.getElementById('prep-status-content').innerHTML = `
                <p><i class="fas fa-exclamation-triangle"></i> Error preparing structure</p>
                <p>${error.message}</p>
            `;
        }
    }

    initializeDockingSetup(ligandCount) {
        if (!ligandCount || ligandCount <= 0) return;

        // Setup collapsible toggle only once (idempotent)
        if (!this.dockingToggleSetupDone) {
            this.setupDockingToggle();
            this.dockingToggleSetupDone = true;
        }

        // Render ligand selection checkboxes
        this.renderDockingLigandSelection(ligandCount);

        const setupList = document.getElementById('docking-setup-list');
        if (!setupList) return;

        setupList.innerHTML = '';

        // Use currently selected chains from structure-prep as the protein context
        const chains = this.getSelectedChains();
        const chainLabel = chains && chains.length > 0 ? chains.join(', ') : 'All selected chains';

        for (let i = 1; i <= ligandCount; i++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'docking-setup-entry';
            wrapper.innerHTML = `
                <div class="docking-setup-header">
                    <label>
                        <input type="checkbox" id="dock-lig${i}-enabled" checked>
                        <strong>Ligand ${i}</strong>
                    </label>
                    <span class="docking-setup-chains">
                        <i class="fas fa-link"></i> Protein chains used: ${chainLabel}
                    </span>
                </div>
                <div class="docking-setup-body">
                    <div class="docking-box-row">
                        <div class="form-group">
                            <label for="dock-lig${i}-center-x">Center X (Å):</label>
                            <input type="number" id="dock-lig${i}-center-x" step="0.1">
                        </div>
                        <div class="form-group">
                            <label for="dock-lig${i}-center-y">Center Y (Å):</label>
                            <input type="number" id="dock-lig${i}-center-y" step="0.1">
                        </div>
                        <div class="form-group">
                            <label for="dock-lig${i}-center-z">Center Z (Å):</label>
                            <input type="number" id="dock-lig${i}-center-z" step="0.1">
                        </div>
                    </div>
                    <div class="docking-box-row">
                        <div class="form-group">
                            <label for="dock-lig${i}-size-x">Size X (Å):</label>
                            <input type="number" id="dock-lig${i}-size-x" value="10" step="0.5" min="1">
                        </div>
                        <div class="form-group">
                            <label for="dock-lig${i}-size-y">Size Y (Å):</label>
                            <input type="number" id="dock-lig${i}-size-y" value="10" step="0.5" min="1">
                        </div>
                        <div class="form-group">
                            <label for="dock-lig${i}-size-z">Size Z (Å):</label>
                            <input type="number" id="dock-lig${i}-size-z" value="10" step="0.5" min="1">
                        </div>
                    </div>
                    <small class="form-help">
                        Leave center fields empty to use the automatically computed center of the ligand.
                    </small>
                </div>
            `;

            setupList.appendChild(wrapper);
        }

        this.dockingSetupInitialized = true;

        // Initialize docking visualization and fetch default boxes from backend
        this.initializeDockingVisualization();
        this.fetchInitialDockingBoxes(ligandCount);
    }

    setupDockingToggle() {
        const toggleHeader = document.getElementById('docking-toggle-header');
        const toggleIcon = document.getElementById('docking-toggle-icon');
        const card = document.getElementById('docking-section');

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
        
        // Setup inner collapsible for "Docking Search Space Setup"
        this.setupDockingSetupCollapsible();
    }
    
    setupDockingSetupCollapsible() {
        const setupToggle = document.getElementById('docking-setup-toggle');
        const setupContent = document.getElementById('docking-setup-content');
        const setupIcon = document.getElementById('docking-setup-toggle-icon');
        
        if (!setupToggle || !setupContent) return;
        
        // Remove any existing listener to prevent duplicates
        const newToggle = setupToggle.cloneNode(true);
        setupToggle.parentNode.replaceChild(newToggle, setupToggle);
        
        // Get the new icon reference
        const newIcon = document.getElementById('docking-setup-toggle-icon');
        
        let isExpanded = true; // Start expanded
        
        newToggle.addEventListener('click', () => {
            isExpanded = !isExpanded;
            
            if (isExpanded) {
                setupContent.style.display = 'block';
                setupContent.style.maxHeight = 'none';
                if (newIcon) {
                    newIcon.style.transform = 'rotate(0deg)';
                    newIcon.classList.remove('fa-chevron-down');
                    newIcon.classList.add('fa-chevron-up');
                }
            } else {
                setupContent.style.display = 'none';
                if (newIcon) {
                    newIcon.style.transform = 'rotate(180deg)';
                    newIcon.classList.remove('fa-chevron-up');
                    newIcon.classList.add('fa-chevron-down');
                }
            }
        });
    }

    renderDockingLigandSelection(ligandCount) {
        // This will be called again with full ligand info after API response
        // For now, just show a loading message or placeholder
        const container = document.getElementById('docking-ligand-selection');
        if (!container) return;
        
        container.innerHTML = '<p style="color: #6c757d;"><i class="fas fa-spinner fa-spin"></i> Loading ligand information...</p>';
    }
    
    renderDockingLigandSelectionWithInfo(ligands, chains) {
        const container = document.getElementById('docking-ligand-selection');
        if (!container) return;

        container.innerHTML = '';
        
        // Store chains for later use
        this.availableChains = chains || ['A'];

        // Render each ligand with its name and chain selection
        ligands.forEach((lig, idx) => {
            const ligIndex = lig.index || (idx + 1);
            const ligName = lig.name || `LIG${ligIndex}`;
            const ligChain = lig.chain || 'A';
            const fullLigandName = lig.displayLabel || `${ligName}-${ligChain}`; // Match prep: GOL-A-1, LIZ-A
            
            const wrapper = document.createElement('div');
            wrapper.className = 'docking-ligand-row';
            wrapper.style.cssText = 'display: flex; align-items: center; gap: 15px; margin-bottom: 10px; padding: 10px; background: #f8f9fa; border-radius: 5px; border: 1px solid #dee2e6;';
            
            // Ligand selection checkbox with full name (RESNAME-CHAIN format)
            let html = `
                <div style="flex: 0 0 120px;">
                    <label class="checkbox-container" style="margin: 0; display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="dock-select-lig${ligIndex}" data-ligand-index="${ligIndex}" checked>
                        <span class="checkmark"></span>
                        <strong style="color: #6f42c1;">${fullLigandName}</strong>
                    </label>
                </div>
                <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
                    <span style="color: #495057; font-size: 0.9em; margin-right: 5px;"><i class="fas fa-link"></i> Dock with:</span>
            `;
            
            // Chain selection checkboxes - compact inline style
            // Pre-check the chain that the ligand belongs to
            this.availableChains.forEach(chain => {
                const isSameChain = chain === ligChain; // Pre-check the ligand's own chain
                html += `
                    <label style="display: inline-flex; align-items: center; gap: 3px; margin-right: 10px; cursor: pointer; font-size: 0.9em;">
                        <input type="checkbox" id="dock-lig${ligIndex}-chain-${chain}" data-ligand="${ligIndex}" data-chain="${chain}" ${isSameChain ? 'checked' : ''} style="width: 14px; height: 14px; cursor: pointer;">
                        <span style="color: #495057;">${chain}</span>
                    </label>
                `;
            });
            
            html += '</div>';
            wrapper.innerHTML = html;
            container.appendChild(wrapper);
        });

        // Add listener to show/hide box controls based on selection
        container.querySelectorAll('input[id^="dock-select-lig"]').forEach(cb => {
            cb.addEventListener('change', () => {
                this.updateDockingBoxControlsVisibility();
                setTimeout(() => this.updateDockingVisualizationFromInputs(), 100);
            });
        });
    }
    
    renderDockingBoxControls(ligands) {
        const setupList = document.getElementById('docking-setup-list');
        if (!setupList) return;
        
        setupList.innerHTML = '';
        
        // Box colors matching the 3D visualization (CSS format)
        const boxColorsCss = [
            '#ff0000',    // Red
            '#00cc00',    // Green
            '#0000ff',    // Blue
            '#ff8000',    // Orange
            '#cc00cc',    // Magenta
            '#00cccc',    // Cyan
        ];
        
        ligands.forEach((lig, idx) => {
            const i = lig.index || (idx + 1);
            const ligName = lig.name || `LIG${i}`;
            const ligChain = lig.chain || 'A';
            const fullLigandName = lig.displayLabel || `${ligName}-${ligChain}`; // Match prep: GOL-A-1, LIZ-A
            const center = lig.center || { x: 0, y: 0, z: 0 };
            const size = lig.size || { x: 10, y: 10, z: 10 };
            const boxColor = boxColorsCss[idx % boxColorsCss.length];
            
            const entry = document.createElement('div');
            entry.className = 'docking-setup-entry';
            entry.style.cssText = 'flex: 0 0 calc(50% - 10px); min-width: 280px; background: white; padding: 12px; border-radius: 5px; border: 1px solid #dee2e6;';
            
            entry.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                    <strong style="color: ${boxColor};"><i class="fas fa-cube"></i> ${fullLigandName}</strong>
                    <label class="toggle-switch" style="margin: 0;">
                        <input type="checkbox" id="dock-lig${i}-enabled" checked>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.85em;">
                    <div>
                        <label style="color: #6c757d; font-size: 0.8em; display: block; margin-bottom: 2px;">Center X (Å)</label>
                        <input type="number" step="0.1" id="dock-lig${i}-center-x" value="${center.x?.toFixed(2) || 0}" 
                               style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px; font-size: 0.9em;">
                    </div>
                    <div>
                        <label style="color: #6c757d; font-size: 0.8em; display: block; margin-bottom: 2px;">Size X (Å)</label>
                        <input type="number" step="0.5" min="1" id="dock-lig${i}-size-x" value="${size.x || 10}" 
                               style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px; font-size: 0.9em;">
                    </div>
                    <div>
                        <label style="color: #6c757d; font-size: 0.8em; display: block; margin-bottom: 2px;">Center Y (Å)</label>
                        <input type="number" step="0.1" id="dock-lig${i}-center-y" value="${center.y?.toFixed(2) || 0}" 
                               style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px; font-size: 0.9em;">
                    </div>
                    <div>
                        <label style="color: #6c757d; font-size: 0.8em; display: block; margin-bottom: 2px;">Size Y (Å)</label>
                        <input type="number" step="0.5" min="1" id="dock-lig${i}-size-y" value="${size.y || 10}" 
                               style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px; font-size: 0.9em;">
                    </div>
                    <div>
                        <label style="color: #6c757d; font-size: 0.8em; display: block; margin-bottom: 2px;">Center Z (Å)</label>
                        <input type="number" step="0.1" id="dock-lig${i}-center-z" value="${center.z?.toFixed(2) || 0}" 
                               style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px; font-size: 0.9em;">
                    </div>
                    <div>
                        <label style="color: #6c757d; font-size: 0.8em; display: block; margin-bottom: 2px;">Size Z (Å)</label>
                        <input type="number" step="0.5" min="1" id="dock-lig${i}-size-z" value="${size.z || 10}" 
                               style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px; font-size: 0.9em;">
                    </div>
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
                        <button type="button" class="btn btn-sm btn-outline-primary" onclick="mdPipeline.openVinaConfigEditor(${i})" style="width: 100%; font-size: 0.85em;">
                            <i class="fas fa-cog"></i> Edit Vina Config File
                        </button>
                    </div>
                </div>
            `;
            
            setupList.appendChild(entry);
        });
        
        // Attach listeners for live updates
        ligands.forEach((lig, idx) => {
            const i = lig.index || (idx + 1);
            ['center-x', 'center-y', 'center-z', 'size-x', 'size-y', 'size-z', 'enabled'].forEach(suffix => {
                const el = document.getElementById(`dock-lig${i}-${suffix}`);
                if (el) {
                    el.addEventListener('input', () => {
                        setTimeout(() => {
                            this.updateDockingVisualizationFromInputs();
                            // Update config file if it's a size or center change
                            if (suffix.includes('size') || suffix.includes('center')) {
                                this.updateConfigFileFromGUI(i);
                            }
                        }, 50);
                    });
                    el.addEventListener('change', () => {
                        setTimeout(() => {
                            this.updateDockingVisualizationFromInputs();
                            // Update config file if it's a size or center change
                            if (suffix.includes('size') || suffix.includes('center')) {
                                this.updateConfigFileFromGUI(i);
                            }
                        }, 50);
                    });
                }
            });
        });
        
        // Update visibility based on ligand selection
        this.updateDockingBoxControlsVisibility();
    }

    updateDockingBoxControlsVisibility() {
        const setupList = document.getElementById('docking-setup-list');
        if (!setupList) return;

        const entries = setupList.querySelectorAll('.docking-setup-entry');
        entries.forEach(entry => {
            const enabledInput = entry.querySelector('input[id^="dock-lig"][id$="-enabled"]');
            if (!enabledInput) return;
            
            const ligIndex = enabledInput.id.match(/\d+/)?.[0];
            if (!ligIndex) return;

            const selectCheckbox = document.getElementById(`dock-select-lig${ligIndex}`);
            if (selectCheckbox) {
                // Use flex display when visible to maintain horizontal layout
                entry.style.display = selectCheckbox.checked ? 'block' : 'none';
            }
        });
    }

    async initializeDockingVisualization() {
        if (!this.preparedProtein) return;

        try {
            // Initialize docking-specific NGL stage if not already done
            if (!this.dockingStage) {
                this.dockingStage = new NGL.Stage("docking-ngl-viewer", {
                    backgroundColor: "white",
                    quality: "medium"
                });
            }

            // Clear existing components
            this.dockingStage.removeAllComponents();

            // Create a blob from prepared PDB content (tleap_ready.pdb)
            const blob = new Blob([this.preparedProtein.content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            // Load the structure
            const component = await this.dockingStage.loadFile(url, {
                ext: "pdb",
                defaultRepresentation: false
            });
            
            // Store reference to the structure component for box attachment
            this.dockingStructureComponent = component;

            // Protein cartoon with consistent chain colors
            const structureChains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                // Use consistent chain colors from chainColorMap
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        component.addRepresentation("cartoon", {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.8
                        });
                    }
                });
            } else {
                // Fallback: use chainid if color map not available
                component.addRepresentation("cartoon", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.8
                });
            }

            // Ligands as ball+stick
            component.addRepresentation("ball+stick", {
                sele: "hetero",
                radius: 0.2,
                color: "element"
            });

            this.dockingStage.autoView();

            URL.revokeObjectURL(url);
            
            // After structure is loaded, render boxes if we have defaults
            setTimeout(() => {
                if (this.dockingBoxDefaults) {
                    this.updateDockingVisualizationFromInputs();
                }
            }, 500);
        } catch (err) {
            console.error('Error initializing docking visualization:', err);
        }
    }

    async fetchInitialDockingBoxes(ligandCount) {
        try {
            const response = await this.apiFetch('/api/docking/get-ligand-boxes');
            const result = await response.json();
            if (!result.success) {
                console.warn('Failed to fetch default ligand boxes:', result.error);
                return;
            }

            // Store defaults and ligand info for later use
            this.dockingBoxDefaults = {};
            this.dockingLigandInfo = result.ligands || [];
            this.availableChains = result.chains || ['A'];
            
            (result.ligands || []).forEach(lig => {
                this.dockingBoxDefaults[lig.index] = lig;
            });

            // Render ligand selection with actual names and chain options
            this.renderDockingLigandSelectionWithInfo(result.ligands || [], result.chains || []);
            
            // Render box controls for each ligand (compact horizontal layout)
            this.renderDockingBoxControls(result.ligands || []);
            
            // Wait a bit for DOM to update and stage to be ready, then render boxes
            setTimeout(() => {
                console.log('Rendering docking boxes after fetching defaults...');
                this.updateDockingVisualizationFromInputs();
            }, 300);
        } catch (err) {
            console.error('Error fetching initial docking boxes:', err);
        }
    }

    updateDockingVisualizationFromInputs() {
        if (!this.dockingStage) {
            console.warn('Docking stage not initialized');
            return;
        }

        // Remove previous THREE.js box objects (groups with cylinders and spheres)
        if (this.dockingBoxObjects && this.dockingBoxObjects.length > 0) {
            this.dockingBoxObjects.forEach(obj => {
                try {
                    // Remove from parent (modelGroup, rotationGroup, component, or scene)
                    if (obj.parent) {
                        obj.parent.remove(obj);
                    }
                    // Dispose of all children's geometries and materials
                    if (obj.children) {
                        obj.children.forEach(child => {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) child.material.dispose();
                        });
                    }
                    // Also dispose if it's a single object
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) obj.material.dispose();
                } catch (e) {
                    console.warn('Could not remove previous box object:', e);
                }
            });
        }
        this.dockingBoxObjects = [];
        
        // Get the structure component's THREE.js object for proper rotation
        // Boxes attached to this will rotate with the molecule
        const structureObject = this.dockingStructureComponent ? 
            this.dockingStructureComponent.object : null;
            
        // Debug: Check all relevant positions in NGL's hierarchy
        let structureCenter = { x: 0, y: 0, z: 0 };
        const viewer = this.dockingStage.viewer;
        
        if (this.dockingStructureComponent && this.dockingStructureComponent.structure) {
            const center = this.dockingStructureComponent.structure.center;
            if (center) {
                structureCenter = { x: center.x, y: center.y, z: center.z };
                console.log(`Structure center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
            }
        }
        
        // Log positions of NGL viewer groups
        if (viewer.rotationGroup) {
            const rg = viewer.rotationGroup;
            console.log(`rotationGroup position: (${rg.position.x.toFixed(2)}, ${rg.position.y.toFixed(2)}, ${rg.position.z.toFixed(2)})`);
        }
        if (viewer.translationGroup) {
            const tg = viewer.translationGroup;
            console.log(`translationGroup position: (${tg.position.x.toFixed(2)}, ${tg.position.y.toFixed(2)}, ${tg.position.z.toFixed(2)})`);
        }
        if (viewer.modelGroup) {
            const mg = viewer.modelGroup;
            console.log(`modelGroup position: (${mg.position.x.toFixed(2)}, ${mg.position.y.toFixed(2)}, ${mg.position.z.toFixed(2)})`);
        }

        const setupList = document.getElementById('docking-setup-list');
        if (!setupList) {
            console.warn('Docking setup list not found');
            return;
        }

        const entries = setupList.querySelectorAll('.docking-setup-entry');
        if (entries.length === 0) {
            console.warn('No docking setup entries found');
            return;
        }

        let boxCount = 0;
        
        // Colors for different ligands (hex values)
        const boxColors = [
            0xff0000,    // Red
            0x00cc00,    // Green
            0x0000ff,    // Blue
            0xff8000,    // Orange
            0xcc00cc,    // Magenta
            0x00cccc,    // Cyan
        ];

        // Get THREE.js - NGL bundles it internally
        // Access through the viewer's scene constructor or global
        let THREE = window.THREE;
        if (!THREE) {
            // Try to get THREE from NGL's internal references
            const scene = this.dockingStage.viewer.scene;
            if (scene && scene.constructor) {
                // Get THREE from the scene's constructor context
                THREE = {
                    BoxGeometry: scene.constructor.prototype.constructor.BoxGeometry || window.BoxGeometry,
                    EdgesGeometry: scene.constructor.prototype.constructor.EdgesGeometry || window.EdgesGeometry,
                    LineSegments: scene.constructor.prototype.constructor.LineSegments || window.LineSegments,
                    LineBasicMaterial: scene.constructor.prototype.constructor.LineBasicMaterial || window.LineBasicMaterial,
                    BufferGeometry: scene.constructor.prototype.constructor.BufferGeometry || window.BufferGeometry,
                    Float32BufferAttribute: scene.constructor.prototype.constructor.Float32BufferAttribute || window.Float32BufferAttribute,
                    Line: scene.constructor.prototype.constructor.Line || window.Line
                };
            }
        }
        
        // If THREE still not available, try to load it dynamically or use fallback
        if (!THREE || !THREE.BoxGeometry) {
            console.warn('THREE.js not fully available, using manual line drawing fallback');
            this.renderDockingBoxesFallback(entries, boxColors);
            return;
        }

        entries.forEach((entry, idx) => {
            const ligIndex = idx + 1;
            
            // Check if this ligand is selected for docking
            const selectCheckbox = document.getElementById(`dock-select-lig${ligIndex}`);
            if (selectCheckbox && !selectCheckbox.checked) {
                console.log(`Ligand ${ligIndex} not selected, skipping box`);
                return;
            }

            const enabledEl = entry.querySelector(`#dock-lig${ligIndex}-enabled`);
            if (enabledEl && !enabledEl.checked) {
                console.log(`Ligand ${ligIndex} disabled, skipping box`);
                return;
            }

            const cxEl = entry.querySelector(`#dock-lig${ligIndex}-center-x`);
            const cyEl = entry.querySelector(`#dock-lig${ligIndex}-center-y`);
            const czEl = entry.querySelector(`#dock-lig${ligIndex}-center-z`);
            const sxEl = entry.querySelector(`#dock-lig${ligIndex}-size-x`);
            const syEl = entry.querySelector(`#dock-lig${ligIndex}-size-y`);
            const szEl = entry.querySelector(`#dock-lig${ligIndex}-size-z`);

            let cx = cxEl && cxEl.value !== '' ? parseFloat(cxEl.value) : null;
            let cy = cyEl && cyEl.value !== '' ? parseFloat(cyEl.value) : null;
            let cz = czEl && czEl.value !== '' ? parseFloat(czEl.value) : null;

            let sx = sxEl && sxEl.value !== '' ? parseFloat(sxEl.value) : 10.0;
            let sy = syEl && syEl.value !== '' ? parseFloat(syEl.value) : 10.0;
            let sz = szEl && szEl.value !== '' ? parseFloat(szEl.value) : 10.0;

            // If center is not specified, try to get from backend defaults
            if (cx == null || cy == null || cz == null) {
                if (this.dockingBoxDefaults && this.dockingBoxDefaults[ligIndex]) {
                    const def = this.dockingBoxDefaults[ligIndex];
                    cx = def.center?.x || null;
                    cy = def.center?.y || null;
                    cz = def.center?.z || null;
                    console.log(`Using default center for ligand ${ligIndex}:`, {cx, cy, cz});
                }
                if (cx == null || cy == null || cz == null) {
                    console.warn(`No center available for ligand ${ligIndex}, skipping box`);
                    return;
                }
            }

            // Ensure all values are numbers
            if (isNaN(cx) || isNaN(cy) || isNaN(cz) || isNaN(sx) || isNaN(sy) || isNaN(sz)) {
                console.warn(`Invalid box parameters for ligand ${ligIndex}:`, {cx, cy, cz, sx, sy, sz});
                return;
            }

            const color = boxColors[(ligIndex - 1) % boxColors.length];
            
            // Debug: Log the coordinates being used
            console.log(`Box ${ligIndex} params: center=(${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}), size=(${sx}, ${sy}, ${sz})`);

            try {
                // Create thick wireframe box using cylinders for each edge
                // This works in all browsers (unlike linewidth which only works in WebGL1)
                
                const tubeRadius = 0.15; // Thickness of the box edges
                const radialSegments = 6; // Segments for cylinder smoothness
                
                // Calculate box corners
                const halfX = sx / 2;
                const halfY = sy / 2;
                const halfZ = sz / 2;
                
                // Define 8 corners of the box (relative to center)
                const corners = [
                    new THREE.Vector3(-halfX, -halfY, -halfZ), // 0
                    new THREE.Vector3(+halfX, -halfY, -halfZ), // 1
                    new THREE.Vector3(+halfX, +halfY, -halfZ), // 2
                    new THREE.Vector3(-halfX, +halfY, -halfZ), // 3
                    new THREE.Vector3(-halfX, -halfY, +halfZ), // 4
                    new THREE.Vector3(+halfX, -halfY, +halfZ), // 5
                    new THREE.Vector3(+halfX, +halfY, +halfZ), // 6
                    new THREE.Vector3(-halfX, +halfY, +halfZ)  // 7
                ];
                
                // Define 12 edges as pairs of corner indices
                const edgePairs = [
                    [0, 1], [1, 2], [2, 3], [3, 0], // bottom face
                    [4, 5], [5, 6], [6, 7], [7, 4], // top face
                    [0, 4], [1, 5], [2, 6], [3, 7]  // vertical edges
                ];
                
                // Material for the tubes
                const tubeMaterial = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.9
                });
                
                // Create a group to hold all edge cylinders
                const boxGroup = new THREE.Group();
                boxGroup.position.set(cx, cy, cz);
                
                // Create cylinder for each edge
                edgePairs.forEach(([i1, i2]) => {
                    const start = corners[i1];
                    const end = corners[i2];
                    
                    // Calculate edge properties
                    const direction = new THREE.Vector3().subVectors(end, start);
                    const length = direction.length();
                    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                    
                    // Create cylinder geometry (default orientation is along Y-axis)
                    const cylinderGeom = new THREE.CylinderGeometry(tubeRadius, tubeRadius, length, radialSegments);
                    const cylinder = new THREE.Mesh(cylinderGeom, tubeMaterial.clone());
                    
                    // Position at midpoint
                    cylinder.position.copy(midpoint);
                    
                    // Orient cylinder along the edge direction
                    // Default cylinder is along Y-axis, so we need to rotate it to align with edge
                    const yAxis = new THREE.Vector3(0, 1, 0);
                    const edgeDir = direction.clone().normalize();
                    
                    // Calculate quaternion to rotate from Y-axis to edge direction
                    const quaternion = new THREE.Quaternion();
                    quaternion.setFromUnitVectors(yAxis, edgeDir);
                    cylinder.setRotationFromQuaternion(quaternion);
                    
                    boxGroup.add(cylinder);
                });
                
                // Add corner spheres for a nicer look
                const sphereGeom = new THREE.SphereGeometry(tubeRadius * 1.2, 8, 8);
                corners.forEach(corner => {
                    const sphere = new THREE.Mesh(sphereGeom, tubeMaterial);
                    sphere.position.copy(corner);
                    boxGroup.add(sphere);
                });
                
                // Add to NGL's modelGroup - this is where structures are actually placed
                // This ensures boxes are in the same coordinate space as the molecule
                const modelGroup = this.dockingStage.viewer.modelGroup;
                const rotationGroup = this.dockingStage.viewer.rotationGroup;
                
                if (modelGroup) {
                    modelGroup.add(boxGroup);
                    console.log(`Added box ${ligIndex} to modelGroup at (${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)})`);
                } else if (rotationGroup) {
                    rotationGroup.add(boxGroup);
                    console.log(`Added box ${ligIndex} to rotationGroup`);
                } else if (structureObject) {
                    structureObject.add(boxGroup);
                    console.log(`Added box ${ligIndex} to structureObject`);
                } else {
                    this.dockingStage.viewer.scene.add(boxGroup);
                    console.log(`Added box ${ligIndex} to scene`);
                }
                this.dockingBoxObjects.push(boxGroup);
                
                boxCount++;
                console.log(`✅ Added thick box for ligand ${ligIndex} at (${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}) with size (${sx}, ${sy}, ${sz})`);
                
            } catch (e) {
                console.error(`Error creating wireframe for ligand ${ligIndex}:`, e);
            }
        });

        // Request render update to show the boxes
        if (boxCount > 0) {
            this.dockingStage.viewer.requestRender();
            console.log(`✅ Rendered ${boxCount} docking box(es) in visualization`);
        } else {
            console.warn('⚠️ No boxes to render - check ligand selection and center values');
        }
    }

    // Fallback method for rendering docking boxes when THREE.js isn't directly accessible
    renderDockingBoxesFallback(entries, boxColors) {
        console.log('Using fallback docking box visualization');
        let boxCount = 0;
        
        // Try to access THREE through different paths
        const viewer = this.dockingStage.viewer;
        const scene = viewer.scene;
        
        // Check various ways THREE might be available
        let ThreeLib = null;
        
        // Method 1: Check if it's on window after NGL loaded
        if (typeof THREE !== 'undefined') {
            ThreeLib = THREE;
        }
        // Method 2: Check NGL's internal module system
        else if (typeof NGL !== 'undefined' && NGL.Stage) {
            // NGL exports some THREE objects
            // Try to construct THREE objects using scene's prototype chain
            const sceneProto = Object.getPrototypeOf(scene);
            if (sceneProto && sceneProto.constructor) {
                const mod = sceneProto.constructor;
                // Check if we can find THREE in the module's scope
                console.log('Scene constructor:', mod.name);
            }
        }
        
        // If we still can't get THREE, create a simple HTML overlay as fallback
        if (!ThreeLib) {
            console.log('Creating HTML overlay for docking boxes');
            entries.forEach((entry, idx) => {
                const ligIndex = idx + 1;
                
                const selectCheckbox = document.getElementById(`dock-select-lig${ligIndex}`);
                if (selectCheckbox && !selectCheckbox.checked) return;

                const cxEl = entry.querySelector(`#dock-lig${ligIndex}-center-x`);
                const cyEl = entry.querySelector(`#dock-lig${ligIndex}-center-y`);
                const czEl = entry.querySelector(`#dock-lig${ligIndex}-center-z`);
                const sxEl = entry.querySelector(`#dock-lig${ligIndex}-size-x`);
                const syEl = entry.querySelector(`#dock-lig${ligIndex}-size-y`);
                const szEl = entry.querySelector(`#dock-lig${ligIndex}-size-z`);

                let cx = cxEl && cxEl.value !== '' ? parseFloat(cxEl.value) : null;
                let cy = cyEl && cyEl.value !== '' ? parseFloat(cyEl.value) : null;
                let cz = czEl && czEl.value !== '' ? parseFloat(czEl.value) : null;
                let sx = sxEl && sxEl.value !== '' ? parseFloat(sxEl.value) : 10.0;
                let sy = syEl && syEl.value !== '' ? parseFloat(syEl.value) : 10.0;
                let sz = szEl && szEl.value !== '' ? parseFloat(szEl.value) : 10.0;

                if (cx == null || cy == null || cz == null) {
                    if (this.dockingBoxDefaults && this.dockingBoxDefaults[ligIndex]) {
                        const def = this.dockingBoxDefaults[ligIndex];
                        cx = def.center?.x || 0;
                        cy = def.center?.y || 0;
                        cz = def.center?.z || 0;
                    }
                }

                if (cx != null && cy != null && cz != null) {
                    boxCount++;
                    console.log(`📦 Docking box ${ligIndex}: center (${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}), size (${sx}×${sy}×${sz}) Å`);
                }
            });
            
            // Update status to show box info since we can't render visually
            const statusEl = document.getElementById('docking-status');
            if (statusEl && boxCount > 0) {
                statusEl.innerHTML = `<span style="color: #28a745;">✓ ${boxCount} docking box(es) configured (visual preview not available)</span>`;
            }
            return;
        }
        
        // If ThreeLib is available, use it
        entries.forEach((entry, idx) => {
            const ligIndex = idx + 1;
            
            const selectCheckbox = document.getElementById(`dock-select-lig${ligIndex}`);
            if (selectCheckbox && !selectCheckbox.checked) return;

            const cxEl = entry.querySelector(`#dock-lig${ligIndex}-center-x`);
            const cyEl = entry.querySelector(`#dock-lig${ligIndex}-center-y`);
            const czEl = entry.querySelector(`#dock-lig${ligIndex}-center-z`);
            const sxEl = entry.querySelector(`#dock-lig${ligIndex}-size-x`);
            const syEl = entry.querySelector(`#dock-lig${ligIndex}-size-y`);
            const szEl = entry.querySelector(`#dock-lig${ligIndex}-size-z`);

            let cx = cxEl && cxEl.value !== '' ? parseFloat(cxEl.value) : null;
            let cy = cyEl && cyEl.value !== '' ? parseFloat(cyEl.value) : null;
            let cz = czEl && czEl.value !== '' ? parseFloat(czEl.value) : null;
            let sx = sxEl && sxEl.value !== '' ? parseFloat(sxEl.value) : 10.0;
            let sy = syEl && syEl.value !== '' ? parseFloat(syEl.value) : 10.0;
            let sz = szEl && szEl.value !== '' ? parseFloat(szEl.value) : 10.0;

            if (cx == null || cy == null || cz == null) {
                if (this.dockingBoxDefaults && this.dockingBoxDefaults[ligIndex]) {
                    const def = this.dockingBoxDefaults[ligIndex];
                    cx = def.center?.x || 0;
                    cy = def.center?.y || 0;
                    cz = def.center?.z || 0;
                }
            }

            if (cx == null || cy == null || cz == null) return;
            
            const color = boxColors[(ligIndex - 1) % boxColors.length];
            
            try {
                const geometry = new ThreeLib.BoxGeometry(sx, sy, sz);
                const edges = new ThreeLib.EdgesGeometry(geometry);
                const material = new ThreeLib.LineBasicMaterial({ color: color });
                const wireframe = new ThreeLib.LineSegments(edges, material);
                wireframe.position.set(cx, cy, cz);
                scene.add(wireframe);
                this.dockingBoxObjects.push(wireframe);
                geometry.dispose();
                boxCount++;
            } catch (e) {
                console.error(`Fallback: Error creating box for ligand ${ligIndex}:`, e);
            }
        });
        
        if (boxCount > 0) {
            viewer.requestRender();
            console.log(`✅ Fallback rendered ${boxCount} docking box(es)`);
        }
    }

    async runDocking() {
        if (!this.preparedProtein || !this.preparedProtein.ligand_present) {
            alert('Please prepare a structure with preserved ligands before running docking.');
            return;
        }

        // Get selected ligands for docking
        const selectedLigands = [];
        const selectionContainer = document.getElementById('docking-ligand-selection');
        if (selectionContainer) {
            selectionContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                const ligIndex = parseInt(cb.getAttribute('data-ligand-index'));
                if (ligIndex) selectedLigands.push(ligIndex);
            });
        }

        if (selectedLigands.length === 0) {
            alert('Please select at least one ligand to dock.');
            return;
        }

        const setupList = document.getElementById('docking-setup-list');
        const statusEl = document.getElementById('docking-status');
        const posesContainer = document.getElementById('docking-poses-container');
        const posesList = document.getElementById('docking-poses-list');

        // Build per-ligand configuration from setup rows, only for selected ligands
        const ligandConfigs = [];
        if (setupList) {
            const entries = setupList.querySelectorAll('.docking-setup-entry');
            entries.forEach((entry, idx) => {
                const ligIndex = idx + 1;
                
                // Check if this ligand is selected for docking
                const selectCheckbox = document.getElementById(`dock-select-lig${ligIndex}`);
                if (!selectCheckbox || !selectCheckbox.checked) return;

                const enabledEl = entry.querySelector(`#dock-lig${ligIndex}-enabled`);
                const cxEl = entry.querySelector(`#dock-lig${ligIndex}-center-x`);
                const cyEl = entry.querySelector(`#dock-lig${ligIndex}-center-y`);
                const czEl = entry.querySelector(`#dock-lig${ligIndex}-center-z`);
                const sxEl = entry.querySelector(`#dock-lig${ligIndex}-size-x`);
                const syEl = entry.querySelector(`#dock-lig${ligIndex}-size-y`);
                const szEl = entry.querySelector(`#dock-lig${ligIndex}-size-z`);

                const enabled = enabledEl ? enabledEl.checked : true;
                const center = {};
                const size = {};

                if (cxEl && cxEl.value !== '') center.x = parseFloat(cxEl.value);
                if (cyEl && cyEl.value !== '') center.y = parseFloat(cyEl.value);
                if (czEl && czEl.value !== '') center.z = parseFloat(czEl.value);

                if (sxEl && sxEl.value !== '') size.x = parseFloat(sxEl.value);
                if (syEl && syEl.value !== '') size.y = parseFloat(syEl.value);
                if (szEl && szEl.value !== '') size.z = parseFloat(szEl.value);

                ligandConfigs.push({
                    index: ligIndex,
                    enabled,
                    center,
                    size,
                });
            });
        }

        // Show loading state
        const runDockingBtn = document.getElementById('run-docking');
        const originalText = runDockingBtn ? runDockingBtn.innerHTML : '';
        if (runDockingBtn) {
            runDockingBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
            runDockingBtn.disabled = true;
        }

        // Initialize log storage if not exists
        if (!this.dockingLogs) {
            this.dockingLogs = [];
        }
        this.dockingLogs = []; // Clear previous logs
        this.dockingRunning = true; // Flag to track if docking is in progress

        // Create or get log modal
        let logModal = document.getElementById('docking-log-modal');
        if (!logModal) {
            logModal = this.createDockingLogModal();
            document.body.appendChild(logModal);
        }

        // Show modal and render stored logs
        const logContent = logModal.querySelector('.log-content');
        const logContainer = logModal.querySelector('.log-container');
        this.renderDockingLogs(logContent);
        logModal.style.display = 'block';
        logContainer.scrollTop = logContainer.scrollHeight;

        // Add "View Logs" button next to the run button
        this.addViewDockingLogsButton(runDockingBtn);

        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Running docking for preserved ligands...`;
        }
        if (posesContainer) {
            posesContainer.style.display = 'none';
        }

        try {
            const response = await this.apiFetch('/api/docking/run', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ligands: ligandConfigs }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            
                            if (data.type === 'complete') {
                                // Final result
                                this.dockingRunning = false;
                                if (data.success) {
                                    this.dockingLogs.push({ type: 'result', data: data });
                                    this.displayDockingFinalResult(data, logContent);
                                    this.dockingResults = data;
                                    
                                    if (statusEl) {
                                        const warnings = (data.warnings || []).filter(w => w && w.length > 0);
                                        const errors = (data.errors || []).filter(e => e && e.length > 0);
                                        const parts = ['<i class="fas fa-check-circle"></i> Docking completed.'];
                                        if (warnings.length > 0) {
                                            parts.push(`<br><strong>Warnings:</strong><br>${warnings.join('<br>')}`);
                                        }
                                        if (errors.length > 0) {
                                            parts.push(`<br><strong>Errors:</strong><br>${errors.join('<br>')}`);
                                        }
                                        statusEl.innerHTML = parts.join('');
                                    }

                                    if (posesContainer && posesList) {
                                        const ligands = data.ligands || [];
                                        console.log('Docking completed, ligands:', ligands);
                                        
                                        // IMPORTANT: Show the container FIRST so NGL viewer has dimensions
                                        posesContainer.style.display = 'block';
                                        
                                        if (ligands.length === 0) {
                                            posesList.innerHTML = '<small>No docking poses were generated.</small>';
                                        } else {
                                            // Small delay to ensure DOM has updated with visible dimensions
                                            await new Promise(resolve => setTimeout(resolve, 100));
                                            // Initialize the poses viewer
                                            await this.initializePosesViewer(ligands);
                                        }
                                    }
                                } else {
                                    this.dockingLogs.push({ type: 'error', message: `❌ Error: ${data.error}` });
                                    this.addLogLine(logContent, `❌ Error: ${data.error}`, 'error');
                                    if (statusEl) {
                                        statusEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error: ${data.error}`;
                                    }
                                }
                                if (runDockingBtn) {
                                    runDockingBtn.innerHTML = originalText;
                                    runDockingBtn.disabled = false;
                                }
                                this.removeViewDockingLogsButton();
                            } else {
                                // Log message - store and display
                                this.dockingLogs.push({ type: data.type || 'info', message: data.message, timestamp: new Date().toISOString() });
                                // Only add to DOM if modal is visible
                                const currentLogModal = document.getElementById('docking-log-modal');
                                if (currentLogModal && currentLogModal.style.display === 'block') {
                                    const currentLogContent = currentLogModal.querySelector('.log-content');
                                    if (currentLogContent) {
                                        this.addLogLine(currentLogContent, data.message, data.type || 'info');
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing SSE data:', e);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error running docking:', err);
            this.dockingRunning = false;
            const errorMsg = `❌ Error: Failed to run docking. ${err.message}`;
            this.dockingLogs.push({ type: 'error', message: errorMsg });
            this.addLogLine(logContent, errorMsg, 'error');
            if (statusEl) {
                statusEl.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    Error running docking: ${err.message}
                `;
            }
            if (runDockingBtn) {
                runDockingBtn.innerHTML = originalText;
                runDockingBtn.disabled = false;
            }
            this.removeViewDockingLogsButton();
        }
    }

    async initializePosesViewer(ligands) {
        console.log('Initializing poses viewer with ligands:', ligands);
        
        // Store ligands data for navigation
        this.posesViewerLigands = ligands;
        this.currentPoseLigandIndex = 0;
        this.currentPoseIndex = 0; // 0 = original, 1+ = docked poses
        
        // Ligand colors for tabs
        const ligandColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9'];
        
        // Render ligand tabs
        const tabsContainer = document.getElementById('docking-ligand-tabs');
        if (tabsContainer) {
            tabsContainer.innerHTML = ligands.map((lig, idx) => {
                const color = ligandColors[idx % ligandColors.length];
                const ligName = lig.displayLabel || lig.name || `Ligand ${lig.index}`;
                return `
                    <div class="docking-ligand-tab ${idx === 0 ? 'active' : ''}" 
                         data-ligand-idx="${idx}" 
                         style="--tab-color: ${color}">
                        <span class="ligand-color-dot" style="background: ${color}"></span>
                        ${ligName}
                    </div>
                `;
            }).join('');
            
            // Tab click handlers
            tabsContainer.querySelectorAll('.docking-ligand-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const ligIdx = parseInt(tab.getAttribute('data-ligand-idx'));
                    this.switchPosesLigand(ligIdx);
                });
            });
        }
        
        // Render selection radio buttons
        const posesList = document.getElementById('docking-poses-list');
        if (posesList) {
            posesList.innerHTML = `
                <h5><i class="fas fa-check-circle"></i> Select Pose for Each Ligand</h5>
                ${ligands.map((lig, idx) => {
                    const poses = lig.poses || [];
                    const ligName = lig.name || `Ligand ${lig.index}`;
                    const color = ligandColors[idx % ligandColors.length];
                    return `
                        <div class="pose-selection-row" data-ligand-idx="${idx}">
                            <span class="pose-selection-label" style="color: ${color}; font-weight: 600;">
                                ${ligName}
                            </span>
                            <div class="pose-selection-options">
                                <label class="pose-selection-option">
                                    <input type="radio" name="ligand-${lig.index}-pose" value="original" 
                                           data-ligand-index="${lig.index}" checked>
                                    Original
                                </label>
                                ${poses.map(p => {
                                    const energy = p.energy;
                                    const energyStr = (energy != null && !isNaN(energy) && energy !== 0) 
                                        ? `<span class="pose-selection-energy">(${energy.toFixed(1)} kcal/mol)</span>` 
                                        : '';
                                    return `
                                        <label class="pose-selection-option">
                                            <input type="radio" name="ligand-${lig.index}-pose" 
                                                   value="${p.mode_index}" data-ligand-index="${lig.index}">
                                            Mode ${p.mode_index} ${energyStr}
                                        </label>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            `;

            // When user clicks a pose/mode option, jump directly to that pose in the viewer
            posesList.querySelectorAll('.pose-selection-row').forEach((row) => {
                const ligandIdx = parseInt(row.getAttribute('data-ligand-idx'), 10);
                const radios = row.querySelectorAll('input[type="radio"]');
                radios.forEach((radio) => {
                    radio.addEventListener('change', async () => {
                        const value = radio.value;
                        const ligand = this.posesViewerLigands[ligandIdx];
                        if (!ligand) return;
                        const poses = ligand.poses || [];
                        const newPoseIndex = value === 'original' ? 0
                            : (() => { const i = poses.findIndex(p => String(p.mode_index) === String(value)); return i >= 0 ? i + 1 : 0; })();

                        if (ligandIdx !== this.currentPoseLigandIndex) {
                            this.currentPoseLigandIndex = ligandIdx;
                            document.querySelectorAll('.docking-ligand-tab').forEach((t, i) => t.classList.toggle('active', i === ligandIdx));
                            if (this.posesDockedComponent) {
                                this.posesStage.removeComponent(this.posesDockedComponent);
                                this.posesDockedComponent = null;
                            }
                            await this.loadOriginalLigandForPoses();
                            if (this.posesStage) this.posesStage.autoView(500);
                        }
                        this.currentPoseIndex = newPoseIndex;
                        await this.loadCurrentPose();
                    });
                });
            });
        }
        
        // Setup navigation buttons
        const prevBtn = document.getElementById('pose-prev-btn');
        const nextBtn = document.getElementById('pose-next-btn');
        
        if (prevBtn) {
            prevBtn.onclick = () => this.navigatePose(-1);
        }
        if (nextBtn) {
            nextBtn.onclick = () => this.navigatePose(1);
        }
        
        // Initialize the 3D viewer and wait for it to be ready
        await this.initializePosesNGLStage();
        
        // Load the first ligand's original pose after stage is ready
        await this.loadCurrentPose();
    }
    
    async initializePosesNGLStage() {
        console.log('Initializing poses NGL stage...');
        const viewerEl = document.getElementById('docking-poses-viewer');
        if (!viewerEl) {
            console.error('Poses viewer element not found!');
            return;
        }
        
        console.log('Viewer element found:', viewerEl, 'Size:', viewerEl.offsetWidth, 'x', viewerEl.offsetHeight);
        
        // Dispose existing stage if any
        if (this.posesStage) {
            this.posesStage.dispose();
            this.posesStage = null;
        }
        
        // Create new NGL stage
        this.posesStage = new NGL.Stage(viewerEl, {
            backgroundColor: 'white',
            quality: 'medium'
        });
        console.log('NGL stage created');
        
        // Load the protein structure via API
        try {
            console.log('Fetching protein structure...');
            const response = await this.apiFetch('/api/docking/get-protein');
            const result = await response.json();
            
            if (!result.success) {
                console.error('Failed to load protein:', result.error);
                return;
            }
            
            console.log('Protein content length:', result.content.length);
            
            // Create blob from PDB content
            const blob = new Blob([result.content], { type: 'text/plain' });
            const proteinComponent = await this.posesStage.loadFile(blob, { ext: 'pdb' });
            console.log('Protein loaded into NGL');
            
            // Show protein as cartoon with consistent chain colors
            const structureChains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                // Use consistent chain colors from chainColorMap
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        proteinComponent.addRepresentation('cartoon', {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.9
                        });
                    }
                });
            } else {
                // Fallback: use chainid if color map not available
                proteinComponent.addRepresentation('cartoon', {
                    colorScheme: 'chainid',
                    opacity: 0.9
                });
            }
            
            this.posesProteinComponent = proteinComponent;
            
            // Load the original ligand (always visible in green)
            await this.loadOriginalLigandForPoses();
            
            this.posesStage.autoView();
            console.log('Protein and original ligand loaded, autoView called');
        } catch (err) {
            console.error('Error loading protein for poses viewer:', err);
        }
    }
    
    async loadOriginalLigandForPoses() {
        const ligand = this.posesViewerLigands[this.currentPoseLigandIndex];
        if (!ligand) return;
        
        try {
            // Remove previous original ligand if switching ligands
            if (this.posesOriginalLigandComponent) {
                this.posesStage.removeComponent(this.posesOriginalLigandComponent);
                this.posesOriginalLigandComponent = null;
            }
            
            // Fetch the original ligand
            const params = new URLSearchParams();
            params.set('ligand_index', ligand.index);
            params.set('type', 'original');
            
            const response = await this.apiFetch(`/api/docking/get-structure?${params.toString()}`);
            const result = await response.json();
            
            if (!result.success) {
                console.error('Failed to load original ligand:', result.error);
                return;
            }
            
            // Load the original ligand (green, always visible)
            const blob = new Blob([result.content], { type: 'text/plain' });
            const ligandComponent = await this.posesStage.loadFile(blob, { ext: 'pdb' });
            
            ligandComponent.addRepresentation('ball+stick', {
                colorValue: 0x00ff00, // Green for original
                multipleBond: 'symmetric',
                opacity: 0.8
            });
            
            this.posesOriginalLigandComponent = ligandComponent;
            console.log('Original ligand loaded (green)');
        } catch (err) {
            console.error('Error loading original ligand:', err);
        }
    }
    
    async switchPosesLigand(ligandIdx) {
        this.currentPoseLigandIndex = ligandIdx;
        this.currentPoseIndex = 0; // Reset to original
        
        // Update tab active state
        const tabs = document.querySelectorAll('.docking-ligand-tab');
        tabs.forEach((tab, idx) => {
            tab.classList.toggle('active', idx === ligandIdx);
        });
        
        // Remove previous docked pose overlay
        if (this.posesDockedComponent) {
            this.posesStage.removeComponent(this.posesDockedComponent);
            this.posesDockedComponent = null;
        }
        
        // Reload original ligand for the new ligand
        await this.loadOriginalLigandForPoses();
        
        // AutoView when switching ligands to center on new ligand
        this.posesStage.autoView(500);
        
        // Load current pose state
        await this.loadCurrentPose();
    }
    
    navigatePose(direction) {
        const ligand = this.posesViewerLigands[this.currentPoseLigandIndex];
        if (!ligand) return;
        
        const poses = ligand.poses || [];
        const totalPoses = 1 + poses.length; // original + docked poses
        
        this.currentPoseIndex += direction;
        
        // Wrap around
        if (this.currentPoseIndex < 0) {
            this.currentPoseIndex = totalPoses - 1;
        } else if (this.currentPoseIndex >= totalPoses) {
            this.currentPoseIndex = 0;
        }
        
        this.loadCurrentPose();
    }
    
    async loadCurrentPose() {
        const ligand = this.posesViewerLigands[this.currentPoseLigandIndex];
        if (!ligand) return;
        
        const poses = ligand.poses || [];
        const isOriginal = this.currentPoseIndex === 0;
        
        // Update info display
        const modeLabel = document.getElementById('pose-mode-label');
        const energyLabel = document.getElementById('pose-energy-label');
        
        if (isOriginal) {
            if (modeLabel) modeLabel.textContent = 'Original Ligand Only';
            if (energyLabel) energyLabel.textContent = '(No docked pose overlay)';
        } else {
            const pose = poses[this.currentPoseIndex - 1];
            if (pose) {
                if (modeLabel) modeLabel.textContent = `Binding Mode ${pose.mode_index}`;
                if (energyLabel) {
                    const energy = pose.energy;
                    energyLabel.textContent = (energy != null && !isNaN(energy) && energy !== 0) 
                        ? `ΔG = ${energy.toFixed(2)} kcal/mol` 
                        : '';
                }
            }
        }
        
        // Update navigation button states
        const prevBtn = document.getElementById('pose-prev-btn');
        const nextBtn = document.getElementById('pose-next-btn');
        const totalPoses = 1 + poses.length;
        
        // Enable/disable based on available poses (but allow wrap-around)
        if (prevBtn) prevBtn.disabled = totalPoses <= 1;
        if (nextBtn) nextBtn.disabled = totalPoses <= 1;
        
        // Remove previous docked pose overlay (original ligand stays)
        if (this.posesDockedComponent) {
            this.posesStage.removeComponent(this.posesDockedComponent);
            this.posesDockedComponent = null;
        }
        
        // If showing original only, no overlay needed
        if (isOriginal) {
            // Update the radio button selection
            this.syncPoseSelectionRadio();
            return;
        }
        
        // Load the docked pose overlay
        try {
            const pose = poses[this.currentPoseIndex - 1];
            
            // Fetch the docked pose PDB content
            const params = new URLSearchParams();
            params.set('ligand_index', ligand.index);
            params.set('type', 'pose');
            params.set('mode_index', pose.mode_index);
            
            const response = await this.apiFetch(`/api/docking/get-structure?${params.toString()}`);
            const result = await response.json();
            
            if (!result.success) {
                console.error('Failed to load pose:', result.error);
                return;
            }
            
            // Load the docked pose into the viewer (coral/red color)
            const blob = new Blob([result.content], { type: 'text/plain' });
            const dockedComponent = await this.posesStage.loadFile(blob, { ext: 'pdb' });
            
            dockedComponent.addRepresentation('ball+stick', {
                colorValue: 0xff6b6b, // Coral for docked poses
                multipleBond: 'symmetric'
            });
            
            this.posesDockedComponent = dockedComponent;
            
            // DON'T call autoView() - preserve user's camera position/zoom
            
            // Update the radio button selection
            this.syncPoseSelectionRadio();
            
        } catch (err) {
            console.error('Error loading docked pose:', err);
        }
    }
    
    syncPoseSelectionRadio() {
        const ligand = this.posesViewerLigands[this.currentPoseLigandIndex];
        if (!ligand) return;
        
        const poses = ligand.poses || [];
        const isOriginal = this.currentPoseIndex === 0;
        
        // Find and check the corresponding radio button
        const value = isOriginal ? 'original' : poses[this.currentPoseIndex - 1]?.mode_index;
        const radio = document.querySelector(`input[name="ligand-${ligand.index}-pose"][value="${value}"]`);
        
        if (radio) {
            radio.checked = true;
        }
    }

    async applyDockingPoses() {
        if (!this.dockingResults || !Array.isArray(this.dockingResults.ligands)) {
            alert('Please run docking first.');
            return;
        }

        const posesList = document.getElementById('docking-poses-list');
        if (!posesList) return;

        const selections = [];
        this.dockingResults.ligands.forEach(lig => {
            const ligId = lig.index;
            const selected = posesList.querySelector(`input[name="ligand-${ligId}-pose"]:checked`);
            if (!selected) return;
            const value = selected.value;
            if (value === 'original') {
                selections.push({
                    ligand_index: ligId,
                    choice: 'original',
                });
            } else {
                const modeIndex = parseInt(value, 10);
                if (modeIndex > 0) {
                    selections.push({
                        ligand_index: ligId,
                        choice: 'mode',
                        mode_index: modeIndex,
                    });
                }
            }
        });

        if (selections.length === 0) {
            alert('No docking pose selections found.');
            return;
        }

        const applyBtn = document.getElementById('apply-docking-poses');
        const originalBtnContent = applyBtn ? applyBtn.innerHTML : '';
        
        // Show spinner on button
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';
        }

        const statusEl = document.getElementById('docking-status');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Applying selected docking poses...`;
        }

        try {
            const response = await this.apiFetch('/api/docking/apply', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ selections }),
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to apply docking poses');
            }

            // Restore button
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.innerHTML = originalBtnContent;
            }

            if (statusEl) {
                statusEl.innerHTML = `
                    <i class="fas fa-check-circle"></i>
                    Docking poses applied successfully. Updated ligands: ${
                        (result.updated_ligands || []).join(', ') || 'none'
                    }.
                `;
            }
        } catch (err) {
            console.error('Error applying docking poses:', err);
            
            // Restore button on error
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.innerHTML = originalBtnContent;
            }
            
            if (statusEl) {
                statusEl.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    Error applying docking poses: ${err.message}
                `;
            }
        }
    }

    renderChainAndLigandSelections() {
        if (!this.currentProtein) return;
        // Render chains
        const chainContainer = document.getElementById('chain-selection');
        if (chainContainer) {
            chainContainer.innerHTML = '';
            this.currentProtein.chains.forEach(chainId => {
                const id = `chain-${chainId}`;
                const wrapper = document.createElement('div');
                wrapper.className = 'checkbox-inline';
                wrapper.innerHTML = `
                    <label class="checkbox-container">
                        <input type="checkbox" id="${id}" data-chain="${chainId}">
                        <span class="checkmark"></span>
                        Chain ${chainId}
                    </label>`;
                chainContainer.appendChild(wrapper);
            });
        }

        // Render ligands (one per instance; displayLabel e.g. GOL-A or GOL-A-1, GOL-A-2 for duplicates in same chain)
        const ligandContainer = document.getElementById('ligand-selection');
        if (ligandContainer) {
            ligandContainer.innerHTML = '';
            if (Array.isArray(this.currentProtein.ligandGroups) && this.currentProtein.ligandGroups.length > 0) {
                this.currentProtein.ligandGroups.forEach((l, idx) => {
                    const label = l.displayLabel || `${l.resn}-${l.chain}`;
                    const id = `lig-${idx}`;
                    const resi = (l.resi != null && l.resi !== '') ? String(l.resi) : '';
                    const wrapper = document.createElement('div');
                    wrapper.className = 'checkbox-inline';
                    wrapper.innerHTML = `
                        <label class="checkbox-container">
                            <input type="checkbox" id="${id}" data-resn="${(l.resn || '').replace(/"/g, '&quot;')}" data-chain="${(l.chain || '').replace(/"/g, '&quot;')}" data-resi="${resi.replace(/"/g, '&quot;')}">
                            <span class="checkmark"></span>
                            ${label}
                        </label>`;
                    ligandContainer.appendChild(wrapper);
                    
                    // Add event listener to automatically check "Preserve ligands" when ligand is clicked
                    const checkbox = document.getElementById(id);
                    if (checkbox) {
                        checkbox.addEventListener('change', (e) => {
                            if (e.target.checked) {
                                const preserveLigandsCheckbox = document.getElementById('preserve-ligands');
                                if (preserveLigandsCheckbox && !preserveLigandsCheckbox.checked) {
                                    preserveLigandsCheckbox.checked = true;
                                    preserveLigandsCheckbox.dispatchEvent(new Event('change'));
                                }
                            }
                        });
                    }
                });
            } else {
                // Fallback: show unique ligand names if detailed positions not parsed
                if (Array.isArray(this.currentProtein.ligands) && this.currentProtein.ligands.length > 0) {
                    this.currentProtein.ligands.forEach(resn => {
                        const id = `lig-${resn}`;
                        const wrapper = document.createElement('div');
                        wrapper.className = 'checkbox-inline';
                        wrapper.innerHTML = `
                            <label class="checkbox-container">
                                <input type="checkbox" id="${id}" data-resn="${resn}">
                                <span class="checkmark"></span>
                                ${resn}
                            </label>`;
                        ligandContainer.appendChild(wrapper);
                        
                        // Add event listener to automatically check "Preserve ligands" when ligand is clicked
                        const checkbox = document.getElementById(id);
                        if (checkbox) {
                            checkbox.addEventListener('change', (e) => {
                                if (e.target.checked) {
                                    const preserveLigandsCheckbox = document.getElementById('preserve-ligands');
                                    if (preserveLigandsCheckbox && !preserveLigandsCheckbox.checked) {
                                        preserveLigandsCheckbox.checked = true;
                                        preserveLigandsCheckbox.dispatchEvent(new Event('change'));
                                    }
                                }
                            });
                        }
                    });
                } else {
                    ligandContainer.innerHTML = '<small>No ligands detected</small>';
                }
            }
        }
    }

    getSelectedChains() {
        const container = document.getElementById('chain-selection');
        if (!container) return [];
        return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.getAttribute('data-chain'));
    }

    getSelectedLigands() {
        const container = document.getElementById('ligand-selection');
        if (!container) return [];
        return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => ({
            resn: cb.getAttribute('data-resn') || '',
            chain: cb.getAttribute('data-chain') || '',
            resi: cb.getAttribute('data-resi') || ''
        }));
    }

    previewPreparedStructure() {
        if (!this.preparedProtein) {
            alert('Please prepare a protein structure first');
            return;
        }

        // Show prepared structure preview
        document.getElementById('prepared-structure-preview').style.display = 'block';
        
        // Format removed components
        const removedText = this.preparedProtein.removed_components ? 
            Object.entries(this.preparedProtein.removed_components)
                .filter(([key, value]) => value > 0)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ') || 'None' : 'None';
        
        // Format added capping
        const addedText = this.preparedProtein.added_capping ? 
            Object.entries(this.preparedProtein.added_capping)
                .filter(([key, value]) => value > 0)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ') || 'None' : 'None';
        
        // Update structure info
        document.getElementById('original-atoms').textContent = this.preparedProtein.original_atoms.toLocaleString();
        document.getElementById('prepared-atoms').textContent = this.preparedProtein.prepared_atoms.toLocaleString();
        document.getElementById('removed-components').textContent = removedText;
        document.getElementById('added-capping').textContent = addedText;
        document.getElementById('preserved-ligands').textContent = this.preparedProtein.preserved_ligands;

        // Load 3D visualization of prepared structure
        this.loadPrepared3DVisualization();
    }

    downloadPreparedStructure() {
        if (!this.preparedProtein) {
            alert('Please prepare a structure first');
            return;
        }

        // Download prepared structure
        const blob = new Blob([this.preparedProtein.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tleap_ready.pdb`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadLigandFile() {
        if (!this.preparedProtein || !this.preparedProtein.ligand_present || !this.preparedProtein.ligand_content) {
            alert('No ligand file available. Please prepare structure with separate ligands enabled.');
            return;
        }

        // Download ligand file
        const ligandBlob = new Blob([this.preparedProtein.ligand_content], { type: 'text/plain' });
        const ligandUrl = URL.createObjectURL(ligandBlob);
        const ligandA = document.createElement('a');
        ligandA.href = ligandUrl;
        ligandA.download = `4_ligands_corrected.pdb`;
        document.body.appendChild(ligandA);
        ligandA.click();
        document.body.removeChild(ligandA);
        URL.revokeObjectURL(ligandUrl);
    }

    // 3D Visualization for prepared structure
    async loadPrepared3DVisualization() {
        if (!this.preparedProtein) return;

        try {
            // Initialize NGL stage for prepared structure if not already done
            if (!this.preparedNglStage) {
                this.preparedNglStage = new NGL.Stage("prepared-ngl-viewer", {
                    backgroundColor: "white",
                    quality: "medium"
                });
            }

            // Clear existing components
            this.preparedNglStage.removeAllComponents();

            // Create a blob from prepared PDB content
            const blob = new Blob([this.preparedProtein.content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            // Load the prepared structure
            const component = await this.preparedNglStage.loadFile(url, {
                ext: "pdb",
                defaultRepresentation: false
            });

            // Add cartoon representation for each chain with consistent colors
            // This ensures each chain gets the same color as in Step 1
            // Use chains from parsed protein data (more reliable than structure API)
            const structureChains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                // Add representation for each chain that exists in the structure
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        component.addRepresentation("cartoon", {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.9
                        });
                    }
                });
            } else {
                // Fallback: use chainid if color map not available
                component.addRepresentation("cartoon", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.9
                });
            }
            
            // Apply consistent chain colors after representation is added (backup)
            setTimeout(() => {
                this.applyConsistentChainColors(component);
            }, 500);

            // Add ball and stick for ligands (if any) - check for HETATM records
            component.addRepresentation("ball+stick", {
                sele: "hetero",
                color: "element",
                radius: 0.2,
                opacity: 0.8
            });

            // Set initial representation state for toggle cycle
            this.preparedRepresentation = 'cartoon';

            // Auto-fit the view
            this.preparedNglStage.autoView();

            // Show controls
            document.getElementById('prepared-viewer-controls').style.display = 'flex';

            // Clean up the blob URL
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error loading prepared 3D visualization:', error);
        }
    }

    resetPreparedView() {
        if (this.preparedNglStage) {
            this.preparedNglStage.autoView();
        }
    }

    togglePreparedRepresentation() {
        if (!this.preparedNglStage) return;

        const components = this.preparedNglStage.compList;
        if (components.length === 0) return;

        const component = components[0];
        component.removeAllRepresentations();

        if (this.preparedRepresentation === 'cartoon') {
            // Switch to ball and stick
            component.addRepresentation("ball+stick", {
                color: "element",
                radius: 0.15
            });
            this.preparedRepresentation = 'ball+stick';
            document.getElementById('prepared-style-text').textContent = 'Ball & Stick';
        } else if (this.preparedRepresentation === 'ball+stick') {
            // Switch to surface with consistent chain colors
            // Use chains from parsed protein data (more reliable than structure API)
            const structureChains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        // protein and :A = only protein atoms in chain; excludes hetero so surface is not drawn around ligands
                        component.addRepresentation("surface", {
                            sele: `protein and :${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.7
                        });
                    }
                });
            } else {
                // protein only: excludes hetero/ligands from surface
                component.addRepresentation("surface", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.7
                });
            }
            // Add ball and stick for ligands so they remain visible in Surface mode (on top of protein-only surface)
            component.addRepresentation("ball+stick", {
                sele: "hetero",
                color: "element",
                radius: 0.2,
                opacity: 0.8
            });
            this.preparedRepresentation = 'surface';
            document.getElementById('prepared-style-text').textContent = 'Surface';
        } else {
            // Switch back to cartoon (from surface): use per-chain cartoon like load, avoid getChainColorScheme
            const structureChains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        component.addRepresentation("cartoon", {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.9
                        });
                    }
                });
            } else {
                component.addRepresentation("cartoon", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.9
                });
            }
            // Add ball and stick for ligands
            component.addRepresentation("ball+stick", {
                sele: "hetero",
                color: "element",
                radius: 0.2,
                opacity: 0.8
            });
            this.preparedRepresentation = 'cartoon';
            document.getElementById('prepared-style-text').textContent = 'Mixed View';
        }
    }

    togglePreparedSpin() {
        if (!this.preparedNglStage) return;

        this.preparedIsSpinning = !this.preparedIsSpinning;
        this.preparedNglStage.setSpin(this.preparedIsSpinning);
    }

    // Missing Residues Methods
    async detectMissingResidues() {
        if (!this.currentProtein) {
            this.showMissingStatus('error', 'Please load a protein structure first');
            return;
        }

        const statusDiv = document.getElementById('missing-status');
        statusDiv.className = 'status-message info';
        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting missing residues...';
        statusDiv.style.display = 'block';

        try {
            const response = await this.apiFetch('/api/detect-missing-residues', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();

            if (result.success) {
                this.missingResiduesInfo = result.missing_residues;
                this.missingResiduesPdbId = result.pdb_id;
                this.chainSequences = result.chain_sequences || {};
                this.chainSequenceStart = result.chain_sequence_start || {};
                this.chainFirstResidue = result.chain_first_residue || {};
                
                // Parse PDB content to get last residue numbers for each chain
                this.chainLastResidue = this.parseLastResidueNumbers();

                if (Object.keys(result.missing_residues).length === 0) {
                    this.showMissingStatus('success', 'No missing residues detected in this structure!');
                    document.getElementById('missing-chains-section').style.display = 'none';
                    document.getElementById('trim-residues-section').style.display = 'none';
                    document.getElementById('build-complete-structure').disabled = true;
                    document.getElementById('missing-summary').style.display = 'none';
                } else {
                    this.showMissingStatus('success', `Found missing residues in ${Object.keys(result.missing_residues).length} chain(s)`);
                    this.renderMissingChains(result.chains_with_missing, result.missing_residues);
                    document.getElementById('missing-chains-section').style.display = 'block';
                    document.getElementById('missing-summary').style.display = 'block';
                    this.displayMissingSummary(result.missing_residues);
                    this.renderTrimControls(result.chains_with_missing);
                    this.renderSequenceViewer(result.chain_sequences, result.missing_residues);
                }
            } else {
                throw new Error(result.error || 'Failed to detect missing residues');
            }
        } catch (error) {
            console.error('Error detecting missing residues:', error);
            this.showMissingStatus('error', `Error: ${error.message}`);
        }
    }

    renderMissingChains(chainsWithMissing, missingResidues) {
        const container = document.getElementById('missing-chains-list');
        container.innerHTML = '';

        chainsWithMissing.forEach(chain => {
            const missingCount = missingResidues[chain]?.count || 0;
            const wrapper = document.createElement('div');
            wrapper.className = 'checkbox-inline';
            wrapper.innerHTML = `
                <label class="checkbox-container">
                    <input type="checkbox" id="missing-chain-${chain}" data-chain="${chain}" checked>
                    <span class="checkmark"></span>
                    Chain ${chain} (${missingCount} missing residues)
                </label>
            `;
            container.appendChild(wrapper);
        });

        // Show and populate minimization section
        const minSection = document.getElementById('chain-minimization-section');
        const minChainsList = document.getElementById('minimization-chains-list');
        const minCheckboxes = document.getElementById('minimization-chains-checkboxes');
        
        if (minSection && minChainsList && minCheckboxes) {
            minSection.style.display = 'block';
            minCheckboxes.innerHTML = '';
            
            chainsWithMissing.forEach(chain => {
                const wrapper = document.createElement('div');
                wrapper.className = 'checkbox-inline';
                wrapper.innerHTML = `
                    <label class="checkbox-container">
                        <input type="checkbox" id="min-chain-${chain}" data-chain="${chain}" checked>
                        <span class="checkmark"></span>
                        Chain ${chain}
                    </label>
                `;
                minCheckboxes.appendChild(wrapper);
            });
            
            // Show chain selection when minimize checkbox is checked
            const minimizeCheckbox = document.getElementById('minimize-chains-checkbox');
            if (minimizeCheckbox) {
                minimizeCheckbox.addEventListener('change', (e) => {
                    minChainsList.style.display = e.target.checked ? 'block' : 'none';
                });
            }
        }

        // Update button state based on selections
        this.updateBuildButtonState();
        
        // Add event listeners to checkboxes
        container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateBuildButtonState());
        });
    }

    updateBuildButtonState() {
        const container = document.getElementById('missing-chains-list');
        const selectedChains = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
        const buildBtn = document.getElementById('build-complete-structure');
        const previewBtn = document.getElementById('preview-completed-structure');
        const downloadBtn = document.getElementById('download-completed-structure');

        if (selectedChains.length > 0) {
            buildBtn.disabled = false;
        } else {
            buildBtn.disabled = true;
            previewBtn.disabled = true;
            document.getElementById('preview-superimposed-structure').disabled = true;
            downloadBtn.disabled = true;
        }
    }

    displayMissingSummary(missingResidues) {
        const summaryContent = document.getElementById('missing-summary-content');
        let html = '';

        Object.entries(missingResidues).forEach(([chain, info]) => {
            html += `<div class="chain-missing-info">`;
            html += `<h4>Chain ${chain}: ${info.count} missing residues</h4>`;
            if (info.residues && info.residues.length > 0) {
                // Display all residues horizontally directly on green background
                // Format negative numbers as GLY(-3) instead of GLY -3
                const residueStrings = info.residues.map(
                    ([resname, resnum]) => {
                        if (resnum < 0) {
                            return `${resname}(${resnum})`;
                        } else {
                            return `${resname}${resnum}`;
                        }
                    }
                );
                html += '<p class="missing-residues-horizontal">';
                html += residueStrings.join(', ');
                html += '</p>';
            }
            html += `</div>`;
        });

        summaryContent.innerHTML = html;
    }

    renderSequenceViewer(chainSequences, missingResidues) {
        if (!chainSequences || Object.keys(chainSequences).length === 0) {
            return;
        }

        // Store sequences and missing residues for later use
        this.sequenceViewerData = {
            chainSequences: chainSequences,
            missingResidues: missingResidues,
            chainSequenceStart: this.chainSequenceStart || {}
        };
        
        // Show the button to view sequences
        document.getElementById('sequence-viewer-actions').style.display = 'flex';
        
        // Don't show the viewer by default - user clicks button to view
        document.getElementById('sequence-viewer-section').style.display = 'none';
    }

    toggleSequenceViewer() {
        const viewerSection = document.getElementById('sequence-viewer-section');
        const viewBtn = document.getElementById('view-protein-sequences');
        
        if (!this.sequenceViewerData) {
            alert('No sequence data available. Please detect missing residues first.');
            return;
        }
        
        if (viewerSection.style.display === 'none' || viewerSection.style.display === '') {
            // Show the viewer
            this.displaySequenceViewer(
                this.sequenceViewerData.chainSequences,
                this.sequenceViewerData.missingResidues,
                this.sequenceViewerData.chainSequenceStart
            );
            viewerSection.style.display = 'block';
            viewBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Protein Sequences';
            viewBtn.classList.remove('btn-secondary');
            viewBtn.classList.add('btn-outline-secondary');
        } else {
            // Hide the viewer
            viewerSection.style.display = 'none';
            viewBtn.innerHTML = '<i class="fas fa-dna"></i> View Protein Sequences';
            viewBtn.classList.remove('btn-outline-secondary');
            viewBtn.classList.add('btn-secondary');
        }
    }

    getThreeLetterCode(oneLetterCode) {
        // Map one-letter amino acid codes to three-letter codes
        const aaMap = {
            'A': 'ALA', 'R': 'ARG', 'N': 'ASN', 'D': 'ASP', 'C': 'CYS',
            'Q': 'GLN', 'E': 'GLU', 'G': 'GLY', 'H': 'HIS', 'I': 'ILE',
            'L': 'LEU', 'K': 'LYS', 'M': 'MET', 'F': 'PHE', 'P': 'PRO',
            'S': 'SER', 'T': 'THR', 'W': 'TRP', 'Y': 'TYR', 'V': 'VAL',
            'B': 'ASX', 'Z': 'GLX', 'X': 'XXX', 'U': 'SEC', 'O': 'PYL'
        };
        return aaMap[oneLetterCode.toUpperCase()] || oneLetterCode;
    }

    displaySequenceViewer(chainSequences, missingResidues, chainSequenceStart = {}) {
        const container = document.getElementById('sequence-viewer-content');
        if (!container || !chainSequences || Object.keys(chainSequences).length === 0) {
            return;
        }

        container.innerHTML = '';

        Object.keys(chainSequences).sort().forEach(chain => {
            const sequence = chainSequences[chain];
            const missingInfo = missingResidues[chain];
            // Store missing residues as PDB residue numbers (1-indexed) for direct comparison
            // We'll compare these with the calculated residueNum (sequenceStart + pos)
            const missingResNums = missingInfo && missingInfo.residues 
                ? new Set(missingInfo.residues.map(([resname, resnum]) => resnum))
                : new Set();
            
            // Get the starting residue number for sequence display
            // This is the first residue number that should be displayed in the viewer
            // e.g., if PDB starts at 189 but residues 173-188 are missing,
            // sequenceStart = 173 (the first missing residue before PDB start)
            // Can be negative (e.g., -3) if PDB starts with negative residue numbers
            const sequenceStart = chainSequenceStart[chain] !== undefined ? chainSequenceStart[chain] : 1;
            
            // The canonical sequence from RCSB always starts at residue 1
            // So sequence position 0 = residue 1, position 172 = residue 173, etc.
            // To display starting from residue 173, we calculate: residueNum = sequenceStart + pos
            // But we need to account for the offset: if sequenceStart = 173, and pos = 0, residueNum = 173
            // This means: residueNum = sequenceStart + pos - (sequenceStart - 1) = pos + 1
            // Actually, if we want pos 0 to show residue 173, then: residueNum = sequenceStart + pos
            // But sequence position 0 corresponds to residue 1 in canonical sequence
            // So we need: residueNum = sequenceStart + pos - (sequenceStart - 1) = pos + 1? No...
            
            // Actually, the simplest approach: if sequenceStart = 173, it means we want to show
            // residue numbers starting from 173. Since canonical sequence pos 0 = residue 1,
            // we need: residueNum = (sequenceStart - 1) + pos + 1 = sequenceStart + pos
            // Wait, that's what we have. Let me verify:
            // - If sequenceStart = 173, pos = 0: residueNum = 173 + 0 = 173 ✓
            // - If sequenceStart = 173, pos = 1: residueNum = 173 + 1 = 174 ✓
            // This seems correct!
            // But the canonical sequence includes all residues, so we use canonical numbering (position + 1)

            // Get chain color from chainColorMap, fallback to default
            const chainColor = this.chainColorMap && this.chainColorMap[chain] 
                ? this.chainColorMap[chain] 
                : '#6c757d'; // Default grey if no color map

            const chainDiv = document.createElement('div');
            chainDiv.className = 'sequence-chain-container';
            
            const header = document.createElement('div');
            header.className = 'sequence-chain-header';
            header.innerHTML = `
                <h4 style="color: ${chainColor};">
                    <i class="fas fa-link"></i> Chain ${chain} 
                    <span style="font-size: 0.85em; font-weight: normal; color: #6c757d;">
                        (${sequence.length} residues${missingInfo ? `, ${missingInfo.count} missing` : ''})
                    </span>
                </h4>
            `;
            chainDiv.appendChild(header);

            const sequenceDiv = document.createElement('div');
            sequenceDiv.className = 'sequence-display';
            
            // Split sequence into chunks of 80 characters for display (more characters per line for better width utilization)
            const chunkSize = 80;
            for (let i = 0; i < sequence.length; i += chunkSize) {
                const chunk = sequence.substring(i, i + chunkSize);
                const chunkDiv = document.createElement('div');
                chunkDiv.className = 'sequence-line';
                
                // Add line number using actual residue numbering (accounting for missing residues)
                const lineNum = document.createElement('span');
                lineNum.className = 'sequence-line-number';
                // Calculate residue number: sequenceStart + position in sequence
                const residueNum = sequenceStart + i;
                // Format with proper padding (handle negative numbers)
                // For negative numbers, pad the absolute value and add sign
                if (residueNum < 0) {
                    lineNum.textContent = '-' + String(Math.abs(residueNum)).padStart(4, ' ');
                } else {
                    lineNum.textContent = String(residueNum).padStart(5, ' ');
                }
                chunkDiv.appendChild(lineNum);

                // Add sequence characters
                const seqSpan = document.createElement('span');
                seqSpan.className = 'sequence-characters';
                
                for (let j = 0; j < chunk.length; j++) {
                    const char = chunk[j];
                    const pos = i + j;
                    // Calculate actual residue number: sequenceStart + position
                    const residueNum = sequenceStart + pos;
                    const charSpan = document.createElement('span');
                    charSpan.className = 'sequence-char';
                    
                    // Get three-letter code for tooltip
                    const threeLetterCode = this.getThreeLetterCode(char);
                    
                    // Check if this residue number is missing (using PDB residue numbers)
                    if (missingResNums.has(residueNum)) {
                        charSpan.style.color = '#6c757d'; // Grey for missing
                        charSpan.style.backgroundColor = '#f0f0f0';
                        charSpan.style.fontWeight = 'bold';
                        charSpan.title = `Missing residue ${threeLetterCode} at position ${residueNum}`;
                    } else {
                        charSpan.style.color = chainColor; // Chain color for present residues
                        charSpan.title = `Residue ${threeLetterCode} at position ${residueNum}`;
                    }
                    
                    charSpan.textContent = char;
                    seqSpan.appendChild(charSpan);
                }
                
                chunkDiv.appendChild(seqSpan);
                sequenceDiv.appendChild(chunkDiv);
            }
            
            chainDiv.appendChild(sequenceDiv);
            container.appendChild(chainDiv);
        });
    }

    parseLastResidueNumbers() {
        /**
         * Parse PDB content to extract the last residue number for each chain
         * Returns: { chainId: lastResidueNumber }
         */
        const chainLastResidue = {};
        
        if (!this.currentProtein || !this.currentProtein.content) {
            return chainLastResidue;
        }
        
        const lines = this.currentProtein.content.split('\n');
        const chainResidues = {}; // { chainId: Set of residue numbers }
        
        for (const line of lines) {
            // Only look at ATOM records for protein chains (not HETATM for ligands/water)
            if (line.startsWith('ATOM')) {
                const chainId = line.substring(21, 22).trim();
                if (!chainId) continue;
                
                // Extract residue number (columns 22-26, handling insertion codes and negative numbers)
                const residueStr = line.substring(22, 26).trim();
                const match = residueStr.match(/^(-?\d+)/);
                if (match) {
                    const residueNum = parseInt(match[1], 10);
                    
                    if (!chainResidues[chainId]) {
                        chainResidues[chainId] = new Set();
                    }
                    chainResidues[chainId].add(residueNum);
                }
            }
        }
        
        // Find the maximum residue number for each chain
        for (const [chainId, residueSet] of Object.entries(chainResidues)) {
            if (residueSet.size > 0) {
                chainLastResidue[chainId] = Math.max(...Array.from(residueSet));
            }
        }
        
        return chainLastResidue;
    }

    analyzeEdgeResidues(chain, missingResidues) {
        /**
         * Analyze missing residues to determine which ones are at edges
         * Returns: { n_terminal: {start, end, count}, c_terminal: {start, end, count} }
         * 
         * A missing residue is at the edge ONLY if:
         * - N-terminal: There are NO residues present in the sequence BEFORE the first missing residue
         * - C-terminal: There are NO residues present in the sequence AFTER the last missing residue
         * 
         * This ensures we only trim residues that are truly at the edges, not internal missing residues
         * that have sequence residues before/after them.
         */
        if (!missingResidues || !missingResidues[chain] || !missingResidues[chain].residues) {
            return { n_terminal: null, c_terminal: null };
        }

        const residues = missingResidues[chain].residues;
        if (residues.length === 0) {
            return { n_terminal: null, c_terminal: null };
        }

        // Get the chain sequence to check for residues present before/after missing residues
        const sequence = this.chainSequences && this.chainSequences[chain];
        // sequenceStart tells us what residue number corresponds to position 0 in the sequence
        // If not set, default to 1 (canonical sequence starting at residue 1)
        const sequenceStart = this.chainSequenceStart && this.chainSequenceStart[chain] !== undefined 
            ? this.chainSequenceStart[chain] 
            : 1;
        
        // If we don't have the sequence, we can't check for residues before/after
        if (!sequence) {
            console.warn(`No sequence available for chain ${chain}, cannot check edge residues`);
            return { n_terminal: null, c_terminal: null };
        }
        
        // Get actual first and last residue numbers from PDB
        const firstPdbResidue = this.chainFirstResidue && this.chainFirstResidue[chain];
        const lastPdbResidue = this.chainLastResidue && this.chainLastResidue[chain];
        
        // If we don't have PDB residue info, fall back to old logic (but this shouldn't happen)
        if (firstPdbResidue === undefined || lastPdbResidue === undefined) {
            console.warn(`Missing PDB residue info for chain ${chain}, using fallback logic`);
            console.warn(`chainFirstResidue:`, this.chainFirstResidue);
            console.warn(`chainLastResidue:`, this.chainLastResidue);
            return { n_terminal: null, c_terminal: null };
        }

        // Extract residue numbers and sort
        const resNums = residues.map(([resname, resnum]) => resnum).sort((a, b) => a - b);
        
        // Create a set of missing residue numbers for quick lookup
        const missingResNums = new Set(resNums);
        
        // Debug logging (after resNums is declared)
        console.log(`Chain ${chain} edge detection:`, {
            firstPdbResidue,
            lastPdbResidue,
            missingResidueCount: residues.length,
            firstMissing: resNums.length > 0 ? resNums[0] : null,
            lastMissing: resNums.length > 0 ? resNums[resNums.length - 1] : null,
            sequenceLength: sequence ? sequence.length : 0,
            sequenceStart: sequenceStart
        });
        
        // Find all consecutive ranges
        const ranges = [];
        if (resNums.length > 0) {
            let rangeStart = resNums[0];
            let rangeEnd = resNums[0];
            
            for (let i = 1; i < resNums.length; i++) {
                if (resNums[i] === rangeEnd + 1) {
                    // Consecutive, extend range
                    rangeEnd = resNums[i];
                } else {
                    // Gap found, save current range and start new one
                    ranges.push({ start: rangeStart, end: rangeEnd });
                    rangeStart = resNums[i];
                    rangeEnd = resNums[i];
                }
            }
            // Don't forget the last range
            ranges.push({ start: rangeStart, end: rangeEnd });
        }

        // Identify N-terminal edge
        // A missing residue is N-terminal ONLY if:
        // 1. The first missing residue is at or before the first PDB residue (no PDB residues before it)
        // 2. AND there are NO sequence residues present BEFORE the first missing residue in the sequence
        let nTerminal = null;
        if (ranges.length > 0 && sequence) {
            const firstRange = ranges[0];
            // Check if the first missing residue is at or before the first PDB residue
            if (firstRange.start <= firstPdbResidue) {
                // Map the first missing residue number to sequence position
                // sequenceStart maps position 0 to a residue number, so: position = residueNum - sequenceStart
                const firstMissingPos = firstRange.start - sequenceStart;
                
                // Check if there are any non-missing residues in the sequence BEFORE this position
                let hasResiduesBefore = false;
                for (let pos = 0; pos < firstMissingPos && pos < sequence.length; pos++) {
                    const residueNum = sequenceStart + pos; // Map position to residue number
                    // If this residue is not missing, then we have residues before the missing ones
                    if (!missingResNums.has(residueNum)) {
                        hasResiduesBefore = true;
                        break;
                    }
                }
                
                // Only mark as N-terminal edge if there are NO residues before the missing ones
                if (!hasResiduesBefore) {
                    nTerminal = {
                        start: firstRange.start,
                        end: firstRange.end,
                        count: firstRange.end - firstRange.start + 1
                    };
                }
            }
        }

        // Identify C-terminal edge
        // A missing residue is C-terminal ONLY if:
        // 1. The missing residues extend beyond the last PDB residue (no PDB residues after them)
        // 2. AND there are NO sequence residues present AFTER the last missing residue in the sequence
        let cTerminal = null;
        if (ranges.length > 0 && sequence) {
            const lastRange = ranges[ranges.length - 1];
            // Check if the missing residues extend beyond the last PDB residue
            const extendsBeyond = lastRange.end > lastPdbResidue;
            const noGap = lastRange.start <= lastPdbResidue + 1;
            
            if (extendsBeyond && noGap) {
                // Map the last missing residue number to sequence position
                // sequenceStart maps position 0 to a residue number, so: position = residueNum - sequenceStart
                const lastMissingPos = lastRange.end - sequenceStart;
                
                // Check if there are any non-missing residues in the sequence AFTER this position
                let hasResiduesAfter = false;
                for (let pos = lastMissingPos + 1; pos < sequence.length; pos++) {
                    const residueNum = sequenceStart + pos; // Map position to residue number
                    // If this residue is not missing, then we have residues after the missing ones
                    if (!missingResNums.has(residueNum)) {
                        hasResiduesAfter = true;
                        break;
                    }
                }
                
                // Only mark as C-terminal edge if there are NO residues after the missing ones
                if (!hasResiduesAfter) {
                    cTerminal = {
                        start: lastRange.start,
                        end: lastRange.end,
                        count: lastRange.end - lastRange.start + 1
                    };
                }
            }
        }

        return {
            n_terminal: nTerminal,
            c_terminal: cTerminal
        };
    }

    updateTrimInfoBox(chainsWithMissing) {
        const infoBox = document.getElementById('trim-info-box-content');
        if (!infoBox || !this.missingResiduesInfo) {
            return;
        }

        let html = '<i class="fas fa-info-circle"></i> <strong>Note:</strong> ';
        
        const edgeInfo = [];
        chainsWithMissing.forEach(chain => {
            const edges = this.analyzeEdgeResidues(chain, this.missingResiduesInfo);
            const chainInfo = [];
            
            if (edges.n_terminal) {
                chainInfo.push(`residues ${edges.n_terminal.start}-${edges.n_terminal.end} from N-terminal`);
            }
            if (edges.c_terminal) {
                chainInfo.push(`residues ${edges.c_terminal.start}-${edges.c_terminal.end} from C-terminal`);
            }
            
            if (chainInfo.length > 0) {
                edgeInfo.push(`Chain ${chain}: ${chainInfo.join(' and ')}`);
            }
        });

        if (edgeInfo.length > 0) {
            html += 'Only missing residues at the edges can be trimmed. ';
            html += edgeInfo.join('; ') + '. ';
            html += 'Missing residues in internal loops (discontinuities in the middle) cannot be trimmed and will be filled by ESMFold.';
        } else {
            html += 'Only missing residues at the N-terminal edge (beginning) and C-terminal edge (end) can be trimmed. ';
            html += 'Missing residues in internal loops (discontinuities in the middle of the sequence) cannot be trimmed using this tool and will be filled by ESMFold.';
        }

        infoBox.innerHTML = html;
    }

    renderTrimControls(chainsWithMissing) {
        const container = document.getElementById('trim-residues-list');
        container.innerHTML = '';

        if (!this.chainSequences || Object.keys(this.chainSequences).length === 0) {
            return;
        }

        // Update the info box with dynamic information
        this.updateTrimInfoBox(chainsWithMissing);

        chainsWithMissing.forEach(chain => {
            const sequence = this.chainSequences[chain] || '';
            const seqLength = sequence.length;
            
            // Get edge residue information for this chain
            const edges = this.analyzeEdgeResidues(chain, this.missingResiduesInfo);
            
            // Calculate max values based on detected edge residues
            const nTerminalMax = edges.n_terminal ? edges.n_terminal.count : 0;
            const cTerminalMax = edges.c_terminal ? edges.c_terminal.count : 0;
            
            // Build N-terminal label with limit info
            let nTerminalLabel = 'N-terminal:';
            if (edges.n_terminal) {
                nTerminalLabel += ` <span class="trim-limit">(max: ${nTerminalMax})</span>`;
            } else {
                nTerminalLabel += ` <span class="trim-limit" style="color: #6c757d; font-style: italic;">(no missing residues)</span>`;
            }
            
            // Build C-terminal label with limit info
            let cTerminalLabel = 'C-terminal:';
            if (edges.c_terminal) {
                cTerminalLabel += ` <span class="trim-limit">(max: ${cTerminalMax})</span>`;
            } else {
                cTerminalLabel += ` <span class="trim-limit" style="color: #6c757d; font-style: italic;">(no missing residues)</span>`;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'trim-chain-controls';
            wrapper.innerHTML = `
                <h5>Chain ${chain} (${seqLength} residues)</h5>
                <div class="trim-inputs">
                    <div class="trim-input-group">
                        <label>${nTerminalLabel}</label>
                        <input type="number" 
                               id="trim-n-${chain}" 
                               data-chain="${chain}" 
                               min="0" 
                               max="${nTerminalMax}" 
                               value="0"
                               class="trim-n-input"
                               ${nTerminalMax > 0 ? `data-max-edge="${nTerminalMax}"` : 'disabled'}
                               ${nTerminalMax === 0 ? 'style="background-color: #e9ecef; cursor: not-allowed;"' : ''}>
                        <span>residues</span>
                    </div>
                    <div class="trim-input-group">
                        <label>${cTerminalLabel}</label>
                        <input type="number" 
                               id="trim-c-${chain}" 
                               data-chain="${chain}" 
                               min="0" 
                               max="${cTerminalMax}" 
                               value="0"
                               class="trim-c-input"
                               ${cTerminalMax > 0 ? `data-max-edge="${cTerminalMax}"` : 'disabled'}
                               ${cTerminalMax === 0 ? 'style="background-color: #e9ecef; cursor: not-allowed;"' : ''}>
                        <span>residues</span>
                    </div>
                </div>
                <div class="trim-info" id="trim-info-${chain}">
                    Original length: ${seqLength} residues
                </div>
            `;
            container.appendChild(wrapper);

            // Add event listeners to update info and enforce limits
            const nInput = wrapper.querySelector(`#trim-n-${chain}`);
            const cInput = wrapper.querySelector(`#trim-c-${chain}`);
            const infoDiv = wrapper.querySelector(`#trim-info-${chain}`);

            // Enforce max limits based on edge residues (only if there are edge residues)
            if (nTerminalMax > 0) {
                nInput.addEventListener('input', () => {
                    const value = parseInt(nInput.value) || 0;
                    if (value > nTerminalMax) {
                        nInput.value = nTerminalMax;
                    }
                });
            } else {
                // Disable input if no edge residues
                nInput.disabled = true;
            }
            
            if (cTerminalMax > 0) {
                cInput.addEventListener('input', () => {
                    const value = parseInt(cInput.value) || 0;
                    if (value > cTerminalMax) {
                        cInput.value = cTerminalMax;
                    }
                });
            } else {
                // Disable input if no edge residues
                cInput.disabled = true;
            }

            const updateInfo = () => {
                const nTrim = parseInt(nInput.value) || 0;
                const cTrim = parseInt(cInput.value) || 0;
                const totalTrim = nTrim + cTrim;
                const newLength = seqLength - totalTrim;
                
                // Check if values exceed edge limits
                let warningMsg = '';
                if (nTerminalMax > 0 && nTrim > nTerminalMax) {
                    warningMsg = `<span style="color: #dc3545;">Warning: N-terminal trim (${nTrim}) exceeds edge limit (${nTerminalMax})</span>`;
                } else if (cTerminalMax > 0 && cTrim > cTerminalMax) {
                    warningMsg = `<span style="color: #dc3545;">Warning: C-terminal trim (${cTrim}) exceeds edge limit (${cTerminalMax})</span>`;
                } else if (nTerminalMax === 0 && nTrim > 0) {
                    warningMsg = `<span style="color: #dc3545;">Warning: No N-terminal edge residues to trim</span>`;
                } else if (cTerminalMax === 0 && cTrim > 0) {
                    warningMsg = `<span style="color: #dc3545;">Warning: No C-terminal edge residues to trim</span>`;
                } else if (totalTrim >= seqLength) {
                    warningMsg = `<span style="color: #dc3545;">Error: Total trim (${totalTrim}) exceeds sequence length (${seqLength})</span>`;
                } else if (newLength <= 0) {
                    warningMsg = `<span style="color: #dc3545;">Error: Resulting sequence would be empty</span>`;
                } else {
                    let infoText = `Original: ${seqLength} residues → Trimmed: ${newLength} residues (removing ${nTrim} from N-term, ${cTrim} from C-term)`;
                    if (nTerminalMax > 0 || cTerminalMax > 0) {
                        infoText += `<br><small style="color: #6c757d;">Edge limits: N-term max ${nTerminalMax}, C-term max ${cTerminalMax}</small>`;
                    } else {
                        infoText += `<br><small style="color: #6c757d;">No edge residues available for trimming</small>`;
                    }
                    infoDiv.innerHTML = infoText;
                }
                
                if (warningMsg) {
                    infoDiv.innerHTML = warningMsg;
                }
            };

            nInput.addEventListener('input', updateInfo);
            cInput.addEventListener('input', updateInfo);
            updateInfo(); // Initial update
        });

        // Show the trim section
        document.getElementById('trim-residues-section').style.display = 'block';
    }

    async applyTrimming() {
        if (!this.chainSequences || !this.missingResiduesPdbId) {
            this.showTrimStatus('error', 'No chain sequences available. Please detect missing residues first.');
            return;
        }

        const trimStatusDiv = document.getElementById('trim-status');
        trimStatusDiv.className = 'status-message info';
        trimStatusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying trimming...';
        trimStatusDiv.style.display = 'block';

        try {
            // Collect trim specifications from inputs
            const trimSpecs = {};
            const nInputs = document.querySelectorAll('.trim-n-input');
            const cInputs = document.querySelectorAll('.trim-c-input');

            nInputs.forEach(nInput => {
                const chain = nInput.getAttribute('data-chain');
                const nTrim = parseInt(nInput.value) || 0;
                const cInput = document.querySelector(`#trim-c-${chain}`);
                const cTrim = parseInt(cInput.value) || 0;

                if (nTrim > 0 || cTrim > 0) {
                    trimSpecs[chain] = {
                        n_terminal: nTrim,
                        c_terminal: cTrim
                    };
                }
            });

            if (Object.keys(trimSpecs).length === 0) {
                this.showTrimStatus('info', 'No trimming specified. Enter values > 0 to trim residues.');
                return;
            }

            // Call API to apply trimming
            const response = await this.apiFetch('/api/trim-residues', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pdb_id: this.missingResiduesPdbId,
                    chain_sequences: this.chainSequences,
                    trim_specs: trimSpecs
                })
            });

            const result = await response.json();

            if (result.success) {
                // Update stored sequences with trimmed versions
                this.chainSequences = result.trimmed_sequences;
                
                // Update trim info displays
                Object.entries(result.trim_info).forEach(([chain, info]) => {
                    const infoDiv = document.getElementById(`trim-info-${chain}`);
                    if (infoDiv) {
                        infoDiv.innerHTML = `
                            <strong>Trimmed!</strong> Original: ${info.original_length} → 
                            Trimmed: ${info.trimmed_length} residues 
                            (removed ${info.n_terminal_trimmed} from N-term, ${info.c_terminal_trimmed} from C-term)
                        `;
                        infoDiv.style.color = '#155724';
                    }
                });

                this.showTrimStatus('success', result.message);
            } else {
                throw new Error(result.error || 'Failed to apply trimming');
            }
        } catch (error) {
            console.error('Error applying trimming:', error);
            this.showTrimStatus('error', `Error: ${error.message}`);
        }
    }

    showTrimStatus(type, message) {
        const statusDiv = document.getElementById('trim-status');
        statusDiv.className = `status-message ${type}`;
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';

        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 5000);
        }
    }

    async buildCompletedStructure() {
        const container = document.getElementById('missing-chains-list');
        const selectedChains = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.getAttribute('data-chain'));

        if (selectedChains.length === 0) {
            this.showMissingStatus('error', 'Please select at least one chain to complete');
            return;
        }

        // Get minimization preference
        const minimizeCheckbox = document.getElementById('minimize-chains-checkbox');
        const minimizeChains = minimizeCheckbox ? minimizeCheckbox.checked : false;
        let chainsToMinimize = [];
        
        if (minimizeChains) {
            // Get selected chains for minimization
            const minContainer = document.getElementById('minimization-chains-checkboxes');
            if (minContainer) {
                chainsToMinimize = Array.from(minContainer.querySelectorAll('input[type="checkbox"]:checked'))
                    .map(cb => cb.getAttribute('data-chain'));
            }
            // If no specific chains selected, minimize all
            if (chainsToMinimize.length === 0) {
                chainsToMinimize = selectedChains;
            }
        }

        const buildBtn = document.getElementById('build-complete-structure');
        const originalText = buildBtn.innerHTML;
        buildBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building...';
        buildBtn.disabled = true;

        try {
            // Prepare request body with optional trimmed sequences
            const requestBody = {
                selected_chains: selectedChains,
                minimize_chains: minimizeChains,
                chains_to_minimize: chainsToMinimize
            };
            
            // Include trimmed sequences if available (they may have been trimmed)
            if (this.chainSequences && Object.keys(this.chainSequences).length > 0) {
                // Only include sequences for selected chains
                const selectedSequences = {};
                selectedChains.forEach(chain => {
                    if (this.chainSequences[chain]) {
                        selectedSequences[chain] = this.chainSequences[chain];
                    }
                });
                if (Object.keys(selectedSequences).length > 0) {
                    requestBody.chain_sequences = selectedSequences;
                }
            }

            // Show log modal for ESMFold/minimization
            this.showESMFoldLogModal();
            
            const response = await this.apiFetch('/api/build-completed-structure', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            // Handle streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalResult = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            
                            if (data.type === 'complete') {
                                finalResult = data;
                            } else if (data.message) {
                                // Add log line
                                this.addESMFoldLogLine(data.message, data.type || 'info');
                            }
                        } catch (e) {
                            console.error('Error parsing SSE data:', e);
                        }
                    }
                }
            }

            // Handle final result
            if (finalResult) {
                if (finalResult.success) {
                    this.completedProtein = {
                        content: finalResult.completed_structure,
                        completed_chains: finalResult.completed_chains
                    };

                    this.showMissingStatus('success', finalResult.message);
                    document.getElementById('preview-completed-structure').disabled = false;
                    document.getElementById('preview-superimposed-structure').disabled = false;
                    document.getElementById('download-completed-structure').disabled = false;
                    
                    // Automatically set preference to use completed structure since user selected these chains
                    await this.saveUseCompletedStructurePreference(true, finalResult.completed_chains);
                } else {
                    throw new Error(finalResult.error || 'Failed to build completed structure');
                }
            }
        } catch (error) {
            console.error('Error building completed structure:', error);
            this.showMissingStatus('error', `Error: ${error.message}`);
        } finally {
            buildBtn.innerHTML = originalText;
            buildBtn.disabled = false;
        }
    }

    async saveUseCompletedStructurePreference(useCompleted, completedChains = null) {
        try {
            const response = await this.apiFetch('/api/set-use-completed-structure', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    use_completed: useCompleted
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                const chainsList = completedChains ? completedChains.join(', ') : '';
                if (useCompleted && chainsList) {
                    console.log(`ESMFold-completed chain(s) (${chainsList}) will be used in structure preparation and docking.`);
                }
            } else {
                console.error('Error setting use completed structure preference:', result.error);
            }
        } catch (error) {
            console.error('Error setting use completed structure preference:', error);
        }
    }

    async previewCompletedStructure() {
        if (!this.completedProtein) {
            // Try to fetch from server
            try {
                const response = await this.apiFetch('/api/get-completed-structure');
                const result = await response.json();
                
                if (result.success && result.exists) {
                    this.completedProtein = {
                        content: result.content
                    };
                } else {
                    alert('Completed structure not found. Please build it first.');
                    return;
                }
            } catch (error) {
                alert('Error loading completed structure: ' + error.message);
                return;
            }
        }

        // Get original structure
        if (!this.currentProtein) {
            alert('Original structure not found. Please load a PDB file first.');
            return;
        }

        // Show preview in the same tab
        const previewDiv = document.getElementById('completed-structure-preview');
        previewDiv.style.display = 'block';

        // Load both structures side by side
        try {
            // Load original structure
            await this.loadOriginalStructureViewer();
            
            // Load completed structure
            await this.loadCompletedStructureViewer();
        } catch (error) {
            console.error('Error previewing structures:', error);
            alert('Error loading 3D visualization: ' + error.message);
        }
    }

    async loadOriginalStructureViewer() {
        try {
            // Initialize NGL stage for original structure if not already done
            if (!this.originalNglStage) {
                this.originalNglStage = new NGL.Stage("original-ngl-viewer", {
                    backgroundColor: "white",
                    quality: "medium"
                });
            }

            // Clear existing components
            this.originalNglStage.removeAllComponents();

            // Create a blob from original PDB content
            const blob = new Blob([this.currentProtein.content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            // Load the original structure
            const component = await this.originalNglStage.loadFile(url, {
                ext: "pdb",
                defaultRepresentation: false
            });

            // Add cartoon representation for each chain with consistent colors
            // This ensures each chain gets the same color as in Step 1
            // Use chains from parsed protein data (more reliable than structure API)
            const structureChains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                // Add representation for each chain that exists in the structure
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        component.addRepresentation("cartoon", {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.9
                        });
                    }
                });
            } else {
                // Fallback: use chainid if color map not available
                component.addRepresentation("cartoon", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.9
                });
            }
            
            // Apply consistent chain colors after representation is added (backup)
            setTimeout(() => {
                this.applyConsistentChainColors(component);
            }, 500);

            // Add ball and stick for ligands if present
            if (this.currentProtein.ligands && this.currentProtein.ligands.length > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "hetero",
                    color: "element",
                    radius: 0.15
                });
            }

            // Auto-fit the view
            this.originalNglStage.autoView();

            // Show controls
            document.getElementById('original-viewer-controls').style.display = 'flex';

            // Clean up the blob URL
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error loading original structure viewer:', error);
            throw error;
        }
    }

    async previewSuperimposedStructure() {
        // Show preview section
        const previewDiv = document.getElementById('superimposed-structure-preview');
        previewDiv.style.display = 'block';

        try {
            // Try to use in-memory data first (faster)
            let originalText, completedText;
            
            if (this.currentProtein && this.currentProtein.content) {
                // Use already loaded original structure
                originalText = this.currentProtein.content;
            } else {
                // Fallback: fetch from server
                const originalResponse = await this.apiFetch('/api/get-file?filename=0_original_input.pdb');
                if (!originalResponse.ok) {
                    throw new Error('Failed to load original structure file.');
                }
                originalText = await originalResponse.text();
            }
            
            if (this.completedProtein && this.completedProtein.content) {
                // Use already loaded completed structure
                completedText = this.completedProtein.content;
            } else {
                // Fallback: fetch from server
                const completedResponse = await this.apiFetch('/api/get-file?filename=0_complete_structure.pdb');
                if (!completedResponse.ok) {
                    throw new Error('Failed to load completed structure file.');
                }
                completedText = await completedResponse.text();
            }

            // Initialize NGL stage for superimposed view if not already done
            if (!this.superimposedNglStage) {
                this.superimposedNglStage = new NGL.Stage("superimposed-ngl-viewer", {
                    backgroundColor: "white",
                    quality: "medium"
                });
            }

            // Clear existing components
            this.superimposedNglStage.removeAllComponents();

            // Create blobs from PDB content
            const originalBlob = new Blob([originalText], { type: 'text/plain' });
            const completedBlob = new Blob([completedText], { type: 'text/plain' });
            const originalUrl = URL.createObjectURL(originalBlob);
            const completedUrl = URL.createObjectURL(completedBlob);

            // Load original structure with original colors
            const originalComponent = await this.superimposedNglStage.loadFile(originalUrl, {
                ext: "pdb",
                defaultRepresentation: false
            });

            // Apply original chain colors if available
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                const structureChains = this.currentProtein && this.currentProtein.chains ? this.currentProtein.chains : [];
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        originalComponent.addRepresentation("cartoon", {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.8
                        });
                    }
                });
            } else {
                // Fallback: use chainid
                originalComponent.addRepresentation("cartoon", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.8
                });
            }

            // Load completed structure with different colors
            const completedComponent = await this.superimposedNglStage.loadFile(completedUrl, {
                ext: "pdb",
                defaultRepresentation: false
            });

            // Get chains from completed structure for toggle fallback
            const completedChains = [];
            const chainSet = new Set();
            const lines = completedText.split('\n');
            for (const line of lines) {
                if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
                    const chainId = line.charAt(21);
                    if (chainId && chainId.trim() !== '') chainSet.add(chainId);
                }
            }
            completedChains.push(...Array.from(chainSet).sort());
            if (completedChains.length === 0 && this.currentProtein && this.currentProtein.chains) {
                completedChains.push(...this.currentProtein.chains);
            }
            this.completedChains = completedChains;

            // Use a single color for Completed Structure (matches "Completed Structure" label #28a745)
            completedComponent.addRepresentation("cartoon", {
                sele: "protein",
                color: "#28a745",
                opacity: 0.7
            });

            // Auto-fit the view
            this.superimposedNglStage.autoView();

            // Show controls
            document.getElementById('superimposed-viewer-controls').style.display = 'flex';

            // Clean up blob URLs
            URL.revokeObjectURL(originalUrl);
            URL.revokeObjectURL(completedUrl);

            // Store components for control functions
            this.superimposedOriginalComponent = originalComponent;
            this.superimposedCompletedComponent = completedComponent;
            this.superimposedRepresentationType = 'cartoon';
            this.superimposedIsSpinning = false;

        } catch (error) {
            console.error('Error loading superimposed structures:', error);
            alert('Error loading superimposed visualization: ' + error.message);
        }
    }

    resetSuperimposedView() {
        if (this.superimposedNglStage) {
            this.superimposedNglStage.autoView();
        }
    }

    toggleSuperimposedRepresentation() {
        if (!this.superimposedOriginalComponent || !this.superimposedCompletedComponent) {
            return;
        }

        // Remove existing representations
        this.superimposedOriginalComponent.removeAllRepresentations();
        this.superimposedCompletedComponent.removeAllRepresentations();

        const styleText = document.getElementById('superimposed-style-text');
        
        if (this.superimposedRepresentationType === 'cartoon') {
            // Switch to surface
            this.superimposedRepresentationType = 'surface';
            styleText.textContent = 'Surface';
            
            // Original structure
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                const structureChains = this.currentProtein && this.currentProtein.chains ? this.currentProtein.chains : [];
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        this.superimposedOriginalComponent.addRepresentation("surface", {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.6
                        });
                    }
                });
            } else {
                this.superimposedOriginalComponent.addRepresentation("surface", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.6
                });
            }

            // Completed structure: single color (matches "Completed Structure" label #28a745)
            this.superimposedCompletedComponent.addRepresentation("surface", {
                sele: "protein",
                color: "#28a745",
                opacity: 0.5
            });
        } else {
            // Switch to cartoon
            this.superimposedRepresentationType = 'cartoon';
            styleText.textContent = 'Cartoon';
            
            // Original structure
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                const structureChains = this.currentProtein && this.currentProtein.chains ? this.currentProtein.chains : [];
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        this.superimposedOriginalComponent.addRepresentation("cartoon", {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.8
                        });
                    }
                });
            } else {
                this.superimposedOriginalComponent.addRepresentation("cartoon", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.8
                });
            }

            // Completed structure: single color (matches "Completed Structure" label #28a745)
            this.superimposedCompletedComponent.addRepresentation("cartoon", {
                sele: "protein",
                color: "#28a745",
                opacity: 0.7
            });
        }
    }

    toggleSuperimposedSpin() {
        if (!this.superimposedNglStage) {
            return;
        }
        this.superimposedIsSpinning = !this.superimposedIsSpinning;
        this.superimposedNglStage.setSpin(this.superimposedIsSpinning);
    }

    async loadCompletedStructureViewer() {
        try {
            // Initialize NGL stage for completed structure if not already done
            if (!this.completedNglStage) {
                this.completedNglStage = new NGL.Stage("completed-ngl-viewer", {
                    backgroundColor: "white",
                    quality: "medium"
                });
            }

            // Clear existing components
            this.completedNglStage.removeAllComponents();

            // Create a blob from completed PDB content
            const blob = new Blob([this.completedProtein.content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            // Load the completed structure
            const component = await this.completedNglStage.loadFile(url, {
                ext: "pdb",
                defaultRepresentation: false
            });

            // Add cartoon representation for each chain with consistent colors
            // This ensures each chain gets the same color as in Step 1
            // Use chains from parsed protein data (more reliable than structure API)
            const structureChains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                // Add representation for each chain that exists in the structure
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        component.addRepresentation("cartoon", {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.9
                        });
                    }
                });
            } else {
                // Fallback: use chainid if color map not available
                component.addRepresentation("cartoon", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.9
                });
            }
            
            // Apply consistent chain colors after representation is added (backup)
            setTimeout(() => {
                this.applyConsistentChainColors(component);
            }, 500);

            // Add ball and stick for ligands if present
            if (this.currentProtein.ligands && this.currentProtein.ligands.length > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "hetero",
                    color: "element",
                    radius: 0.15
                });
            }

            // Auto-fit the view
            this.completedNglStage.autoView();

            // Show controls
            document.getElementById('completed-viewer-controls').style.display = 'flex';

            // Clean up the blob URL
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error loading completed structure viewer:', error);
            throw error;
        }
    }

    resetCompletedView() {
        if (this.completedNglStage) {
            this.completedNglStage.autoView();
        }
    }

    toggleCompletedRepresentation() {
        if (!this.completedNglStage) return;

        const components = this.completedNglStage.compList;
        if (components.length === 0) return;

        const component = components[0];
        component.removeAllRepresentations();

        if (this.completedRepresentation === 'cartoon') {
            // Switch to ball and stick
            component.addRepresentation("ball+stick", {
                color: "element",
                radius: 0.15
            });
            this.completedRepresentation = 'ball+stick';
            document.getElementById('completed-style-text').textContent = 'Ball & Stick';
        } else if (this.completedRepresentation === 'ball+stick') {
            // Switch to surface with consistent chain colors
            // Use chains from parsed protein data (more reliable than structure API)
            const structureChains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        component.addRepresentation("surface", {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.7
                        });
                    }
                });
            } else {
                component.addRepresentation("surface", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.7
                });
            }
            this.completedRepresentation = 'surface';
            document.getElementById('completed-style-text').textContent = 'Surface';
        } else {
            // Switch back to cartoon
            const chainColorFunc = this.getChainColorScheme(component);
            component.addRepresentation("cartoon", {
                sele: "protein",
                colorScheme: chainColorFunc,
                opacity: 0.8
            });
            // Add ligands if present
            if (this.currentProtein && this.currentProtein.ligands && this.currentProtein.ligands.length > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "hetero",
                    color: "element",
                    radius: 0.15
                });
            }
            this.completedRepresentation = 'cartoon';
            document.getElementById('completed-style-text').textContent = 'Mixed';
        }
    }

    toggleCompletedSpin() {
        if (!this.completedNglStage) return;

        this.completedIsSpinning = !this.completedIsSpinning;
        this.completedNglStage.setSpin(this.completedIsSpinning);
    }

    // Original structure viewer controls
    resetOriginalView() {
        if (this.originalNglStage) {
            this.originalNglStage.autoView();
        }
    }

    toggleOriginalRepresentation() {
        if (!this.originalNglStage) return;

        const components = this.originalNglStage.compList;
        if (components.length === 0) return;

        const component = components[0];
        component.removeAllRepresentations();

        if (this.originalRepresentation === 'cartoon') {
            // Switch to ball and stick
            component.addRepresentation("ball+stick", {
                color: "element",
                radius: 0.15
            });
            this.originalRepresentation = 'ball+stick';
            document.getElementById('original-style-text').textContent = 'Ball & Stick';
        } else if (this.originalRepresentation === 'ball+stick') {
            // Switch to surface with consistent chain colors
            // Use chains from parsed protein data (more reliable than structure API)
            const structureChains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            if (this.chainColorMap && Object.keys(this.chainColorMap).length > 0) {
                structureChains.forEach((chain) => {
                    if (this.chainColorMap[chain]) {
                        component.addRepresentation("surface", {
                            sele: `:${chain}`,
                            color: this.chainColorMap[chain],
                            opacity: 0.7
                        });
                    }
                });
            } else {
                component.addRepresentation("surface", {
                    sele: "protein",
                    colorScheme: "chainid",
                    opacity: 0.7
                });
            }
            this.originalRepresentation = 'surface';
            document.getElementById('original-style-text').textContent = 'Surface';
        } else {
            // Switch back to cartoon
            const chainColorFunc = this.getChainColorScheme(component);
            component.addRepresentation("cartoon", {
                sele: "protein",
                colorScheme: chainColorFunc,
                opacity: 0.8
            });
            if (this.currentProtein.ligands && this.currentProtein.ligands.length > 0) {
                component.addRepresentation("ball+stick", {
                    sele: "hetero",
                    color: "element",
                    radius: 0.15
                });
            }
            this.originalRepresentation = 'cartoon';
            document.getElementById('original-style-text').textContent = 'Mixed';
        }
    }

    toggleOriginalSpin() {
        if (!this.originalNglStage) return;

        this.originalIsSpinning = !this.originalIsSpinning;
        this.originalNglStage.setSpin(this.originalIsSpinning);
    }


    downloadCompletedStructure() {
        if (!this.completedProtein) {
            alert('Completed structure not found. Please build it first.');
            return;
        }

        const blob = new Blob([this.completedProtein.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '0_complete_structure.pdb';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    showMissingStatus(type, message) {
        const statusDiv = document.getElementById('missing-status');
        statusDiv.className = `status-message ${type}`;
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';

        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 5000);
        }
    }

    applyConsistentChainColors(component) {
        // Apply consistent colors to chains using NGL's API
        if (!component || !component.structure || !this.chainColorMap || Object.keys(this.chainColorMap).length === 0) {
            console.warn('Cannot apply chain colors: missing component, structure, or color map');
            return;
        }
        
        try {
            // Get all chains - use parsed protein data (more reliable than structure API)
            const chains = (this.currentProtein && this.currentProtein.chains) ? this.currentProtein.chains : [];
            console.log('Applying colors to chains:', chains, 'Color map:', this.chainColorMap);
            
            // Apply colors to each representation using setColorByChain
            component.reprList.forEach((repr) => {
                if (repr.type === 'cartoon' || repr.type === 'surface') {
                    chains.forEach((chain) => {
                        if (this.chainColorMap[chain]) {
                            try {
                                const color = this.chainColorMap[chain];
                                // Use setColorByChain if available, otherwise use setColor
                                if (repr.setColorByChain) {
                                    repr.setColorByChain(color, chain);
                                } else {
                                    // Fallback: use setColor with chain selection
                                    repr.setColor(color, `chain ${chain}`);
                                }
                                console.log(`Applied color ${color} to chain ${chain}`);
                            } catch (err) {
                                console.warn(`Could not set color for chain ${chain}:`, err);
                            }
                        }
                    });
                }
            });
        } catch (error) {
            console.warn('Could not apply consistent chain colors:', error);
        }
    }
}

// Tell server to delete this session's output folder when user closes the tab (no need for periodic cleanup).
function discardSessionOnClose() {
    if (window.mdPipeline && window.mdPipeline.sessionId) {
        const url = '/api/discard-session?session_id=' + encodeURIComponent(window.mdPipeline.sessionId);
        navigator.sendBeacon(url);
    }
}

// Initialize the application when the page loads
function initializeApp() {
    console.log('Initializing mdPipeline...'); // Debug log
    window.mdPipeline = new MDSimulationPipeline();
    console.log('mdPipeline initialized:', window.mdPipeline); // Debug log

    window.addEventListener('beforeunload', discardSessionOnClose);
    window.addEventListener('pagehide', discardSessionOnClose);
}

// Try to initialize immediately if DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM is already loaded
    initializeApp();
}

// Add some utility functions for better UX
function formatNumber(num) {
    return num.toLocaleString();
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
}

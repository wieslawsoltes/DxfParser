    class App {
      
      constructor() {
        // Initialize state manager
        this.stateManager = new StateManager();
        
        // Define column widths – these will be passed into the TreeDataGrid constructor.
        this.columnWidths = {
          line: 130,
          code: 100,
          type: "*", // Star sizing: takes up remaining space.
          objectCount: 130,
          dataSize: 130
        };
        this.dxfParser = new DxfParser();
        // Left panel DOM
        this.treeViewContainer = document.getElementById("treeViewContainerLeft");
        this.treeViewContent = document.getElementById("treeViewContentLeft");
        // Left panel state
        this.tabs = [];
        this.activeTabId = null;
        // Right panel DOM
        this.treeViewContainerRight = document.getElementById("treeViewContainerRight");
        this.treeViewContentRight = document.getElementById("treeViewContentRight");
        // Right panel state
        this.tabsRight = [];
        this.activeTabIdRight = null;
        this.currentBinaryData = null;
        this.currentDetectedType = null;
        this.selectedNodeId = null;
            // We'll cache the measured hex line height here.
    this.hexLineHeight = null;
        // Create the TreeDataGrid instances and pass columnWidths via the constructor.
        this.myTreeGrid = new TreeDataGrid(this.treeViewContainer, this.treeViewContent, {
          itemHeight: 24,
          copyCallback: (nodeId) => this.handleCopy(nodeId),
          openCallback: (nodeId) => this.handleOpen(nodeId),  // <-- new callback for "Open" button
          onToggleExpand: (nodeId) => this.handleToggleExpand(nodeId),
          onHandleClick: (handle) => this.handleLinkToHandle(handle),
          onRowSelect: (nodeId) => { this.selectedNodeId = nodeId; },
          columnWidths: this.columnWidths,
          headerRootId: "treeGridHeaderLeft",
          hexViewerCallback: (combinedHexString) => this.showHexViewer(combinedHexString)
        });
        this.myTreeGridLeft = this.myTreeGrid; // alias for clarity
        this.myTreeGridRight = new TreeDataGrid(this.treeViewContainerRight, this.treeViewContentRight, {
          itemHeight: 24,
          // Enable expand in right panel
          onToggleExpand: (nodeId) => this.handleToggleExpandRight(nodeId),
          onHandleClick: (handle) => this.handleLinkToHandle(handle),
          columnWidths: { ...this.columnWidths },
          headerRootId: "treeGridHeaderRight",
        });
        this.batchDataGrid = new BatchDataGrid(
          document.getElementById("batchResultsTabHeaders"),
          document.getElementById("batchResultsTabContents")
        );
        // Side-by-side diff state
        this.sideBySideDiffEnabled = false;
        this.currentDiffMap = null; // { leftRowClasses: Map(index->class), rightRowClasses: Map(index->class), totalRows }
        this.initEventListeners();
        this.initializeRuleSystem();
        
        // Initialize state management
        this.initializeStateManagement();
      }
      
      // Initialize state management and restore saved state
      initializeStateManagement() {
        // Attempt to restore state on app startup
        setTimeout(() => {
          this.restoreAppState();
        }, 100); // Small delay to ensure DOM is ready
        
        // Auto-save state periodically
        setInterval(() => {
          this.saveCurrentState();
        }, 5000); // Save every 5 seconds
        
        // Save state before page unload
        window.addEventListener('beforeunload', () => {
          this.saveCurrentState();
        });
      }
      
      // Save current state to localStorage
      saveCurrentState() {
        if (this.tabs.length > 0) {
          this.stateManager.saveAppState(this.tabs, this.tabsRight, this.activeTabId, this.activeTabIdRight, this.columnWidths);
        }
      }
      
      // Restore application state from localStorage
      restoreAppState() {
        try {
          const appState = this.stateManager.loadAppState();
          if (!appState) {
            console.log('No saved state found');
            return;
          }
          
          console.log('Restoring app state...');
          
          // Restore column widths
          if (appState.columnWidths) {
            this.columnWidths = { ...this.columnWidths, ...appState.columnWidths };
          }
          
          // Restore tabs (left)
          const restoredTabs = [];
          const tabIdsLeft = appState.tabIdsLeft || appState.tabIds || [];
          for (const tabId of tabIdsLeft) {
            const tabState = this.stateManager.loadTabState(tabId);
            if (tabState && tabState.originalTreeData) {
              // Restore expanded state
              if (tabState.expandedNodeIds && tabState.expandedNodeIds.length > 0) {
                this.stateManager.restoreExpandedState(tabState.originalTreeData, tabState.expandedNodeIds);
              }
              
              // Create the restored tab
              const restoredTab = {
                id: tabState.id,
                name: tabState.name,
                originalTreeData: tabState.originalTreeData,
                currentTreeData: tabState.originalTreeData, // Will be re-filtered
                codeSearchTerms: tabState.codeSearchTerms || [],
                dataSearchTerms: tabState.dataSearchTerms || [],
                currentSortField: tabState.currentSortField || 'line',
                currentSortAscending: tabState.currentSortAscending !== undefined ? tabState.currentSortAscending : true,
                minLine: tabState.minLine,
                maxLine: tabState.maxLine,
                dataExact: tabState.dataExact || false,
                dataCase: tabState.dataCase || false,
                selectedObjectTypes: tabState.selectedObjectTypes || [],
                navigationHistory: tabState.navigationHistory || [],
                currentHistoryIndex: tabState.currentHistoryIndex || -1,
                classIdToName: tabState.classIdToName || {}
              };
              
              restoredTabs.push(restoredTab);
            }
          }
          // Restore tabs (right)
          const restoredTabsRight = [];
          const tabIdsRight = appState.tabIdsRight || [];
          for (const tabId of tabIdsRight) {
            const tabState = this.stateManager.loadTabState(tabId);
            if (tabState && tabState.originalTreeData) {
              if (tabState.expandedNodeIds && tabState.expandedNodeIds.length > 0) {
                this.stateManager.restoreExpandedState(tabState.originalTreeData, tabState.expandedNodeIds);
              }
              const restoredTab = {
                id: tabState.id,
                name: tabState.name,
                originalTreeData: tabState.originalTreeData,
                currentTreeData: tabState.originalTreeData,
                codeSearchTerms: tabState.codeSearchTerms || [],
                dataSearchTerms: tabState.dataSearchTerms || [],
                currentSortField: tabState.currentSortField || 'line',
                currentSortAscending: tabState.currentSortAscending !== undefined ? tabState.currentSortAscending : true,
                minLine: tabState.minLine,
                maxLine: tabState.maxLine,
                dataExact: tabState.dataExact || false,
                dataCase: tabState.dataCase || false,
                selectedObjectTypes: tabState.selectedObjectTypes || [],
                navigationHistory: tabState.navigationHistory || [],
                currentHistoryIndex: tabState.currentHistoryIndex || -1,
                classIdToName: tabState.classIdToName || {}
              };
              restoredTabsRight.push(restoredTab);
            }
          }
          
          // Update the app with restored tabs
          this.tabs = restoredTabs;
          this.tabsRight = restoredTabsRight;
          this.activeTabId = appState.activeTabIdLeft || appState.activeTabId || (this.tabs[0] && this.tabs[0].id) || null;
          this.activeTabIdRight = appState.activeTabIdRight || (this.tabsRight[0] && this.tabsRight[0].id) || null;
          
          // Ensure we have a valid active tab
          // Update UI
          this.updateTabUI();
          // Apply filters and update both trees if present
          const activeLeft = this.getActiveTab();
          if (activeLeft) {
            this.applyTabFilters(activeLeft);
          }
          const activeRight = this.getActiveTabRight();
          if (activeRight && this.myTreeGridRight) {
            // Recompute right currentTreeData with its saved filters
            if (activeRight.currentSortField) {
              this.sortTreeNodes(activeRight.originalTreeData, activeRight.currentSortField, activeRight.currentSortAscending);
            }
            activeRight.currentTreeData = this.filterTree(
              activeRight.originalTreeData,
              activeRight.codeSearchTerms || [],
              activeRight.dataSearchTerms || [],
              activeRight.dataExact || false,
              activeRight.dataCase || false,
              activeRight.minLine || null,
              activeRight.maxLine || null,
              activeRight.selectedObjectTypes || []
            );
            this.myTreeGridRight.setData(activeRight.currentTreeData);
          }
          
          console.log(`Restored ${restoredTabs.length} tabs`);
          
        } catch (error) {
          console.error('Failed to restore app state:', error);
          // Clear corrupted state
          this.stateManager.clearAllState();
        }
      }
      
      // Apply filters to a tab and update tree display (left panel by default)
      applyTabFilters(tab) {
        // Apply sorting if needed
        if (tab.currentSortField) {
          this.sortTreeNodes(tab.originalTreeData, tab.currentSortField, tab.currentSortAscending);
        }
        // Apply filters
        tab.currentTreeData = this.filterTree(
          tab.originalTreeData,
          tab.codeSearchTerms,
          tab.dataSearchTerms,
          tab.dataExact,
          tab.dataCase,
          tab.minLine,
          tab.maxLine,
          tab.selectedObjectTypes
        );
        // Update left tree display
        if (this.myTreeGrid) {
          this.myTreeGrid.setData(tab.currentTreeData);
        }
        // Refresh filter indicators on buttons
        this.updateFiltersButtonIndicators();
      }
      
      initEventListeners() {
        const parseLeftBtn = document.getElementById("parseLeftBtn");
        const parseRightBtn = document.getElementById("parseRightBtn");
        if (parseLeftBtn) {
          parseLeftBtn.addEventListener("click", () => {
            const fileInput = document.getElementById("fileInputLeft");
            this.handleFiles(fileInput.files, 'left');
          });
        }
        if (parseRightBtn) {
          parseRightBtn.addEventListener("click", () => {
            const fileInput = document.getElementById("fileInputRight");
            this.handleFiles(fileInput.files, 'right');
          });
        }
        const createNewBtn = document.getElementById("createNewDxfBtn");
        if (createNewBtn) createNewBtn.addEventListener("click", () => this.handleCreateNewDxf());
        const expandAllBtn = document.getElementById("expandAllBtn");
        if (expandAllBtn) expandAllBtn.addEventListener("click", () => this.handleExpandAll());
        const collapseAllBtn = document.getElementById("collapseAllBtn");
        if (collapseAllBtn) collapseAllBtn.addEventListener("click", () => this.handleCollapseAll());
        const resetStateBtn = document.getElementById("resetStateBtn");
        if (resetStateBtn) resetStateBtn.addEventListener("click", () => this.handleResetState());
        document.getElementById("addRowBtn").addEventListener("click", () => this.handleAddRow());
        document.getElementById("removeRowBtn").addEventListener("click", () => this.handleRemoveRow());
        document.getElementById("downloadDxfBtn").addEventListener("click", () => this.handleDownloadDxf());
        // Toggle right panel visibility
        const toggleRightBtn = document.getElementById('toggleRightPanelBtn');
        if (toggleRightBtn) {
          toggleRightBtn.addEventListener('click', () => this.toggleRightPanel());
        }
        const toggleSxSBtn = document.getElementById('toggleSideBySideDiffBtn');
        if (toggleSxSBtn) {
          toggleSxSBtn.addEventListener('click', () => this.toggleSideBySideDiff());
        }
        // Per-panel expand/collapse
        const expandLeftBtn = document.getElementById('expandAllLeftBtn');
        const collapseLeftBtn = document.getElementById('collapseAllLeftBtn');
        const expandRightBtn = document.getElementById('expandAllRightBtn');
        const collapseRightBtn = document.getElementById('collapseAllRightBtn');
        if (expandLeftBtn) expandLeftBtn.addEventListener('click', () => this.handleExpandAllSide('left'));
        if (collapseLeftBtn) collapseLeftBtn.addEventListener('click', () => this.handleCollapseAllSide('left'));
        if (expandRightBtn) expandRightBtn.addEventListener('click', () => this.handleExpandAllSide('right'));
        if (collapseRightBtn) collapseRightBtn.addEventListener('click', () => this.handleCollapseAllSide('right'));
        // Scope header click sorting to LEFT header only
        document.querySelectorAll('#treeGridHeaderLeft .header-cell').forEach(headerCell => {
          headerCell.addEventListener('click', (e) => {
            if (e.target.classList.contains('resizer')) return;
            this.handleHeaderClick(headerCell);
          });
        });
        document.querySelectorAll('#treeGridHeaderLeft .header-cell .resizer').forEach(resizer => {
          resizer.addEventListener('mousedown', (e) => this.handleResizerMouseDown(e));
        });
        // Add right header sort/resizer wiring
        document.querySelectorAll('#treeGridHeaderRight .header-cell').forEach(headerCell => {
          headerCell.addEventListener('click', (e) => {
            if (e.target.classList.contains('resizer')) return;
            this.handleHeaderClickRight(headerCell);
          });
        });
        document.querySelectorAll('#treeGridHeaderRight .header-cell .resizer').forEach(resizer => {
          resizer.addEventListener('mousedown', (e) => this.handleResizerMouseDownRight(e));
        });
        // Add Filters buttons and overlays
        const filtersLeftBtn = document.getElementById('filtersLeftBtn');
        const filtersRightBtn = document.getElementById('filtersRightBtn');
        if (filtersLeftBtn) {
          if (!filtersLeftBtn.querySelector('.active-indicator')) {
            const dot = document.createElement('span');
            dot.className = 'active-indicator';
            filtersLeftBtn.appendChild(dot);
          }
          filtersLeftBtn.addEventListener('click', () => this.openFiltersOverlay('left'));
        }
        if (filtersRightBtn) {
          if (!filtersRightBtn.querySelector('.active-indicator')) {
            const dot = document.createElement('span');
            dot.className = 'active-indicator';
            filtersRightBtn.appendChild(dot);
          }
          filtersRightBtn.addEventListener('click', () => this.openFiltersOverlay('right'));
        }
        const closeLeft = document.getElementById('closeFiltersOverlayLeft');
        const closeRight = document.getElementById('closeFiltersOverlayRight');
        if (closeLeft) closeLeft.addEventListener('click', () => this.closeFiltersOverlay('left'));
        if (closeRight) closeRight.addEventListener('click', () => this.closeFiltersOverlay('right'));

        // Per-panel filter inputs
        if (document.getElementById('codeSearchInputLeft')) this.setupTagInput('codeSearchInputLeft', 'code', 'left');
        if (document.getElementById('dataSearchInputLeft')) this.setupTagInput('dataSearchInputLeft', 'data', 'left');
        if (document.getElementById('codeSearchInputRight')) this.setupTagInput('codeSearchInputRight', 'code', 'right');
        if (document.getElementById('dataSearchInputRight')) this.setupTagInput('dataSearchInputRight', 'data', 'right');
        const searchLeft = document.getElementById('searchBtnLeft');
        const clearLeft = document.getElementById('clearSearchBtnLeft');
        const searchRight = document.getElementById('searchBtnRight');
        const clearRight = document.getElementById('clearSearchBtnRight');
        if (searchLeft) searchLeft.addEventListener('click', () => this.handleSearch('left'));
        if (clearLeft) clearLeft.addEventListener('click', () => this.handleClearSearch('left'));
        if (searchRight) searchRight.addEventListener('click', () => this.handleSearch('right'));
        if (clearRight) clearRight.addEventListener('click', () => this.handleClearSearch('right'));

        // Options and range inputs per side
        const optionSets = [
          { side: 'left', exact: 'dataExactCheckboxLeft', case: 'dataCaseCheckboxLeft', min: 'minLineInputLeft', max: 'maxLineInputLeft' },
          { side: 'right', exact: 'dataExactCheckboxRight', case: 'dataCaseCheckboxRight', min: 'minLineInputRight', max: 'maxLineInputRight' }
        ];
        optionSets.forEach(set => {
          const exactEl = document.getElementById(set.exact);
          const caseEl = document.getElementById(set.case);
          const minEl = document.getElementById(set.min);
          const maxEl = document.getElementById(set.max);
          if (exactEl) exactEl.addEventListener('change', () => this.updateEffectiveSearchTerms(set.side));
          if (caseEl) caseEl.addEventListener('change', () => this.updateEffectiveSearchTerms(set.side));
          if (minEl) minEl.addEventListener('input', () => this.updateEffectiveSearchTerms(set.side));
          if (maxEl) maxEl.addEventListener('input', () => this.updateEffectiveSearchTerms(set.side));
        });

        // Dropdown toggles (per side)
        const dropdowns = [
          { side: 'left', wrap: 'objectTypeDropdownLeft', button: 'objectTypeDropdownButtonLeft', content: 'objectTypeDropdownContentLeft' },
          { side: 'right', wrap: 'objectTypeDropdownRight', button: 'objectTypeDropdownButtonRight', content: 'objectTypeDropdownContentRight' }
        ];
        dropdowns.forEach(d => {
          const wrap = document.getElementById(d.wrap);
          const btn = document.getElementById(d.button);
          const content = document.getElementById(d.content);
          if (!wrap || !btn || !content) return;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            content.style.display = (content.style.display === 'block') ? 'none' : 'block';
          });
          document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) content.style.display = 'none';
          });
        });

        // Legacy sidebar filters (guarded if present)
        if (document.getElementById("codeSearchInput")) this.setupTagInput("codeSearchInput", "code", 'left');
        if (document.getElementById("dataSearchInput")) this.setupTagInput("dataSearchInput", "data", 'left');
        const legacySearchBtn = document.getElementById("searchBtn");
        if (legacySearchBtn) legacySearchBtn.addEventListener("click", () => this.handleSearch('left'));
        const legacyClearBtn = document.getElementById("clearSearchBtn");
        if (legacyClearBtn) legacyClearBtn.addEventListener("click", () => this.handleClearSearch('left'));
        // Remove dependency on filter target radios (migrated to per-panel popups)
        document.getElementById("showCloudOverlayBtn").addEventListener("click", () => {
          this.updateClouds();
          document.getElementById("cloudOverlay").style.display = "block";
        });
        document.getElementById("closeCloudOverlay").addEventListener("click", () => {
          document.getElementById("cloudOverlay").style.display = "none";
        });
        document.getElementById("showStatsOverlayBtn").addEventListener("click", () => {
          this.updateStats();
          document.getElementById("statsOverlay").style.display = "block";
        });
        document.getElementById("closeStatsOverlay").addEventListener("click", () => {
          document.getElementById("statsOverlay").style.display = "none";
        });
        document.getElementById("showDepsOverlayBtn").addEventListener("click", () => {
          this.updateDependencies();
          document.getElementById("depsOverlay").style.display = "block";
        });
        document.getElementById("closeDepsOverlay").addEventListener("click", () => {
          document.getElementById("depsOverlay").style.display = "none";
        });
        document.getElementById("showBinaryObjectsOverlayBtn").addEventListener("click", () => {
          this.showBinaryObjectsOverlay();
        });
        document.getElementById("closeBinaryObjectsOverlay").addEventListener("click", () => {
          document.getElementById("binaryObjectsOverlay").style.display = "none";
        });
        document.getElementById("showHandleMapOverlayBtn").addEventListener("click", () => {
          this.updateHandleMap();
          document.getElementById("handleMapOverlay").style.display = "block";
        });
        document.getElementById("closeHandleMapOverlay").addEventListener("click", () => {
          document.getElementById("handleMapOverlay").style.display = "none";
        });
        document.getElementById("showProxyObjectsOverlayBtn").addEventListener("click", () => {
          this.showProxyObjectsOverlay();
        });
        document.getElementById("closeProxyObjectsOverlay").addEventListener("click", () => {
          document.getElementById("proxyObjectsOverlay").style.display = "none";
        });
        document.getElementById("showFontsOverlayBtn").addEventListener("click", () => {
          this.updateFonts();
          document.getElementById("fontsOverlay").style.display = "block";
        });
        document.getElementById("closeFontsOverlay").addEventListener("click", () => {
          document.getElementById("fontsOverlay").style.display = "none";
        });
        document.getElementById("showClassesOverlayBtn").addEventListener("click", () => {
          this.updateClasses();
          document.getElementById("classesOverlay").style.display = "block";
        });
        document.getElementById("closeClassesOverlay").addEventListener("click", () => {
          document.getElementById("classesOverlay").style.display = "none";
        });
        document.getElementById("showObjectSizeOverlayBtn").addEventListener("click", () => {
          this.showObjectSizeDialog();
        });
        document.getElementById("closeObjectSizeOverlay").addEventListener("click", () => {
          document.getElementById("objectSizeOverlay").style.display = "none";
        });
        document.getElementById("showBlocksOverlayBtn").addEventListener("click", () => {
          this.updateBlocksOverlay();
          document.getElementById("blocksOverlay").style.display = "block";
        });
        document.getElementById("closeBlocksOverlay").addEventListener("click", () => {
          document.getElementById("blocksOverlay").style.display = "none";
        });
        document.getElementById("showLineTypesOverlayBtn").addEventListener("click", () => {
          this.updateLineTypes();
          document.getElementById("lineTypesOverlay").style.display = "block";
        });
        document.getElementById("closeLineTypesOverlay").addEventListener("click", () => {
          document.getElementById("lineTypesOverlay").style.display = "none";
        });
        document.getElementById("showTextsOverlayBtn").addEventListener("click", () => {
          this.updateTexts();
          document.getElementById("textsOverlay").style.display = "block";
        });
        document.getElementById("closeTextsOverlay").addEventListener("click", () => {
          document.getElementById("textsOverlay").style.display = "none";
        });
        document.getElementById("showDiagnosticsOverlayBtn").addEventListener("click", () => {
          this.showDiagnosticsOverlay();
        });
        document.getElementById("closeDiagnosticsOverlay").addEventListener("click", () => {
          document.getElementById("diagnosticsOverlay").style.display = "none";
        });
        document.getElementById("runDiagnosticsBtn").addEventListener("click", () => {
          this.runDiagnostics();
        });
        document.getElementById("exportDiagnosticsBtn").addEventListener("click", () => {
          this.exportDiagnosticsReport();
        });
        
        // Rule configuration event listeners
        document.getElementById("configureRulesBtn").addEventListener("click", () => {
          this.showRuleConfigDialog();
        });
        document.getElementById("closeRuleConfigBtn").addEventListener("click", () => {
          this.hideRuleConfigDialog();
        });
        document.getElementById("selectAllRulesBtn").addEventListener("click", () => {
          this.selectAllRules(true);
        });
        document.getElementById("deselectAllRulesBtn").addEventListener("click", () => {
          this.selectAllRules(false);
        });
        document.getElementById("resetToDefaultRulesBtn").addEventListener("click", () => {
          this.resetToDefaultRules();
        });
        document.getElementById("saveRuleProfileBtn").addEventListener("click", () => {
          this.saveRuleProfile();
        });
        document.getElementById("loadRuleProfileBtn").addEventListener("click", () => {
          this.loadRuleProfile();
        });
        document.getElementById("deleteRuleProfileBtn").addEventListener("click", () => {
          this.deleteRuleProfile();
        });
        document.getElementById("clearAllProfilesBtn").addEventListener("click", () => {
          this.clearAllProfiles();
        });
        document.getElementById("saveProfileToFileBtn").addEventListener("click", () => {
          this.saveProfileToFile();
        });
        document.getElementById("loadProfileFromFileBtn").addEventListener("click", () => {
          document.getElementById("profileFileInput").click();
        });
        document.getElementById("profileFileInput").addEventListener("change", (e) => {
          this.loadProfileFromFile(e.target.files[0]);
        });
        document.getElementById("applyRuleConfigBtn").addEventListener("click", () => {
          this.applyRuleConfiguration();
        });
        document.getElementById("cancelRuleConfigBtn").addEventListener("click", () => {
          this.hideRuleConfigDialog();
        });
        document.getElementById("ruleSearchInput").addEventListener("input", () => {
          this.filterRules();
        });
        
        // Advanced filtering event listeners
        document.getElementById("diagnosticsSearchInput").addEventListener("input", () => {
          this.applyDiagnosticsFilters();
        });
        document.getElementById("clearDiagnosticsSearch").addEventListener("click", () => {
          document.getElementById("diagnosticsSearchInput").value = "";
          this.applyDiagnosticsFilters();
        });
        document.getElementById("diagnosticsCategoryFilter").addEventListener("change", () => {
          this.applyDiagnosticsFilters();
        });
        
        // Severity filter checkboxes
        ["Critical", "Error", "Warning", "Info", "Suggestion"].forEach(severity => {
          document.getElementById(`filter${severity}`).addEventListener("change", () => {
            this.applyDiagnosticsFilters();
          });
        });
        
        // Keyboard shortcuts for diagnostics
        document.addEventListener("keydown", (e) => {
          // Only apply shortcuts when diagnostics overlay is open
          if (document.getElementById("diagnosticsOverlay").style.display === "block") {
            if (e.ctrlKey || e.metaKey) {
              switch (e.key) {
                case 'f':
                case 'F':
                  e.preventDefault();
                  document.getElementById("diagnosticsSearchInput").focus();
                  break;
                case 'e':
                case 'E':
                  e.preventDefault();
                  this.exportDiagnosticsReport();
                  break;
              }
            }
            
            // Number keys for quick severity filtering
            if (e.key >= '1' && e.key <= '5') {
              e.preventDefault();
              const severities = ['critical', 'error', 'warning', 'info', 'suggestion'];
              this.filterDiagnosticsBySeverity(severities[parseInt(e.key) - 1]);
            }
            
            // Escape to clear search
            if (e.key === 'Escape') {
              const searchInput = document.getElementById("diagnosticsSearchInput");
              if (searchInput.value) {
                searchInput.value = "";
                this.applyDiagnosticsFilters();
              }
            }
          }
        });
        // Diagnostics tab switching
        document.querySelectorAll('.diagnostics-tab').forEach(tab => {
          tab.addEventListener('click', (e) => {
            const targetTab = e.target.dataset.tab;
            this.switchDiagnosticsTab(targetTab);
          });
        });
        // Diagnostics category collapsing
        document.addEventListener('click', (e) => {
          if (e.target.classList.contains('diagnostics-category-header')) {
            const content = e.target.nextElementSibling;
            const isExpanded = content.classList.contains('expanded');
            if (isExpanded) {
              content.classList.remove('expanded');
              e.target.querySelector('.category-toggle').textContent = '▶';
            } else {
              content.classList.add('expanded');
              e.target.querySelector('.category-toggle').textContent = '▼';
            }
          }
        });
        document.getElementById("showBatchProcessOverlayBtn").addEventListener("click", () => {
        document.getElementById("batchProcessingOverlay").style.display = "block";
        });
        document.getElementById("closeBatchOverlay").addEventListener("click", () => {
          document.getElementById("batchProcessingOverlay").style.display = "none";
        });
        document.getElementById("startBatchProcess").addEventListener("click", () => this.handleBatchProcess());
        document.getElementById("batchPredefinedQuery").addEventListener("change", function() {
          document.getElementById("batchJsQuery").value = this.value;
        });
        document.getElementById("downloadExcelBtn").addEventListener("click", () => this.downloadBatchResultsAsExcel());
        document.getElementById("downloadTreeExcelBtn").addEventListener("click", () => this.downloadTreeAsExcel());
        document.getElementById("showDiffOverlayBtn").addEventListener("click", () => {
        document.getElementById("diffOverlay").style.display = "block";
        });
        document.getElementById("closeDiffOverlay").addEventListener("click", () => {
          document.getElementById("diffOverlay").style.display = "none";
        });
        document.getElementById("runDiffBtn").addEventListener("click", () => this.handleDiff());
        document.getElementById("goToHandleBtn").addEventListener("click", () => this.handleGoToHandle());
        document.getElementById("backBtn").addEventListener("click", () => this.navigateBack());
        document.getElementById("forwardBtn").addEventListener("click", () => this.navigateForward());
        document.getElementById("clearHistoryBtn").addEventListener("click", () => this.clearNavigationHistory());
        this.treeViewContainer.addEventListener("scroll", (e) => {
          const scrollLeft = e.target.scrollLeft;
          const hdr = document.getElementById("treeGridHeaderLeft");
          if (hdr) hdr.style.transform = "translateX(-" + scrollLeft + "px)";
        });
        this.treeViewContainerRight.addEventListener("scroll", (e) => {
          const scrollLeft = e.target.scrollLeft;
          const hdr = document.getElementById("treeGridHeaderRight");
          if (hdr) hdr.style.transform = "translateX(-" + scrollLeft + "px)";
        });
        window.addEventListener("resize", () => { 
          this.myTreeGrid.updateVisibleNodes();
          this.myTreeGridRight.updateVisibleNodes();
        });
        document.getElementById("closeHexViewerOverlay").addEventListener("click", () => {
          document.getElementById("hexViewerOverlay").style.display = "none";
          document.getElementById("imagePreviewContainer").innerHTML = "";
          document.getElementById("zipContentsContainer").innerHTML = "";
        });
        document.getElementById("saveBinaryBtn").addEventListener("click", () => {
          if (this.currentBinaryData) {
            const typeExtensions = {
              "PNG Image": "png",
              "GIF Image": "gif",
              "JPEG Image": "jpg",
              "BMP Image": "bmp",
              "PDF Document": "pdf",
              "ZIP Archive": "zip"
            };
            let ext = "bin";
            if (this.currentDetectedType && typeExtensions[this.currentDetectedType]) {
              ext = typeExtensions[this.currentDetectedType];
            }
            const blob = new Blob([this.currentBinaryData], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "binary_data." + ext;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        });
        document.getElementById("previewImageBtn").addEventListener("click", () => { this.previewImage(); });
        document.querySelectorAll(".backToTreeBtn").forEach(btn => {
          btn.addEventListener("click", (e) => {
            const overlayId = btn.getAttribute("data-overlay");
            document.getElementById(overlayId).style.display = "none";
            this.treeViewContainer.focus();
          });
        });
        const resizer = document.querySelector('.pane-resizer');
        const sidebar = document.querySelector('.sidebar');
        const contentWrapper = document.querySelector('.content-wrapper');
        resizer.addEventListener('mousedown', (e) => {
          e.preventDefault();
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
          function onMouseMove(e) {
            const newWidth = e.clientX - contentWrapper.getBoundingClientRect().left;
            if(newWidth > 150 && newWidth < contentWrapper.clientWidth - 100) {
              sidebar.style.width = newWidth + 'px';
            }
          }
          function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          }
        });
        
        // Context menu functionality
        this.initContextMenu();

        // Compare splitter drag between left and right panels
        this.initCompareSplitter();
      }

      toggleSideBySideDiff() {
        this.sideBySideDiffEnabled = !this.sideBySideDiffEnabled;
        if (this.sideBySideDiffEnabled) {
          this.computeAndApplySideBySideDiff();
        } else {
          this.clearSideBySideDiff();
        }
        this.updateDiffIndicator();
      }

      clearSideBySideDiff() {
        this.currentDiffMap = null;
        // 1) Clear all diff-related providers and alignment on both grids
        if (this.myTreeGrid) {
          if (this.myTreeGrid.setRowClassProvider) this.myTreeGrid.setRowClassProvider(null);
          if (this.myTreeGrid.setCellClassProvider) this.myTreeGrid.setCellClassProvider(null);
          if (this.myTreeGrid.setOverrideTotalRows) this.myTreeGrid.setOverrideTotalRows(null);
          if (this.myTreeGrid.setIndexMap) this.myTreeGrid.setIndexMap(null);
        }
        if (this.myTreeGridRight) {
          if (this.myTreeGridRight.setRowClassProvider) this.myTreeGridRight.setRowClassProvider(null);
          if (this.myTreeGridRight.setCellClassProvider) this.myTreeGridRight.setCellClassProvider(null);
          if (this.myTreeGridRight.setOverrideTotalRows) this.myTreeGridRight.setOverrideTotalRows(null);
          if (this.myTreeGridRight.setIndexMap) this.myTreeGridRight.setIndexMap(null);
        }

        // 2) Restore each panel's view to its own filtered/sorted state
        const leftTab = this.getActiveTab();
        const rightTab = this.getActiveTabRight();

        if (leftTab) {
          // Re-apply the saved filters/sort on left and update grid
          this.applyTabFilters(leftTab);
        } else if (this.myTreeGrid) {
          this.myTreeGrid.setData([]);
        }

        if (rightTab) {
          // Manually filter/sort right side without touching left UI controls
          if (rightTab.currentSortField) {
            this.sortTreeNodes(rightTab.originalTreeData, rightTab.currentSortField, rightTab.currentSortAscending);
          }
          rightTab.currentTreeData = this.filterTree(
            rightTab.originalTreeData,
            rightTab.codeSearchTerms || [],
            rightTab.dataSearchTerms || [],
            rightTab.dataExact || false,
            rightTab.dataCase || false,
            rightTab.minLine || null,
            rightTab.maxLine || null,
            rightTab.selectedObjectTypes || []
          );
          if (this.myTreeGridRight) this.myTreeGridRight.setData(rightTab.currentTreeData);
        } else if (this.myTreeGridRight) {
          this.myTreeGridRight.setData([]);
        }

        // 3) Force re-render
        if (this.myTreeGrid) this.myTreeGrid.updateVisibleNodes();
        if (this.myTreeGridRight) this.myTreeGridRight.updateVisibleNodes();
        this.updateDiffIndicator();
      }

      computeAndApplySideBySideDiff() {
        const leftTab = this.getActiveTab();
        const rightTab = this.getActiveTabRight();
        if (!leftTab || !rightTab) {
          // If one side is missing, skip compute but keep the toggle state as-is.
          // Indicator will hide automatically until both sides are present.
          this.updateDiffIndicator();
          return;
        }
        // 1) Reset both grids to a clean state (clear any previous diff overlays)
        if (this.myTreeGrid) {
          if (this.myTreeGrid.setRowClassProvider) this.myTreeGrid.setRowClassProvider(null);
          if (this.myTreeGrid.setCellClassProvider) this.myTreeGrid.setCellClassProvider(null);
          if (this.myTreeGrid.setOverrideTotalRows) this.myTreeGrid.setOverrideTotalRows(null);
          if (this.myTreeGrid.setIndexMap) this.myTreeGrid.setIndexMap(null);
        }
        if (this.myTreeGridRight) {
          if (this.myTreeGridRight.setRowClassProvider) this.myTreeGridRight.setRowClassProvider(null);
          if (this.myTreeGridRight.setCellClassProvider) this.myTreeGridRight.setCellClassProvider(null);
          if (this.myTreeGridRight.setOverrideTotalRows) this.myTreeGridRight.setOverrideTotalRows(null);
          if (this.myTreeGridRight.setIndexMap) this.myTreeGridRight.setIndexMap(null);
        }

        // 2) Expand all nodes and ignore filters to ensure full-structure diff
        this.expandAllNodes(leftTab.originalTreeData);
        this.expandAllNodes(rightTab.originalTreeData);
        leftTab.currentTreeData = leftTab.originalTreeData;
        rightTab.currentTreeData = rightTab.originalTreeData;
        if (this.myTreeGrid) this.myTreeGrid.setData(leftTab.currentTreeData);
        if (this.myTreeGridRight) this.myTreeGridRight.setData(rightTab.currentTreeData);
        // Build flattened lists of display strings per row using current flat data generation
        const leftFlat = window.TreeDiffEngine.flattenTreeWithKeys(leftTab.currentTreeData);
        const rightFlat = window.TreeDiffEngine.flattenTreeWithKeys(rightTab.currentTreeData);
        const keysLeft = leftFlat.map(r => r.key);
        const keysRight = rightFlat.map(r => r.key);
        const aligned = window.TreeDiffEngine.alignByKeysSmart(keysLeft, keysRight);
        // Determine row and cell classes by comparing values for aligned pairs
        const leftClasses = new Map();
        const rightClasses = new Map();
        const leftCellClasses = new Map(); // index -> {colKey: class}
        const rightCellClasses = new Map();
        const totalRows = aligned.length;
        const caches = { objectCount: new Map(), dataSize: new Map() };
        for (let idx = 0; idx < aligned.length; idx++) {
          const pair = aligned[idx];
          const lIdx = pair.leftIndex;
          const rIdx = pair.rightIndex;
          if (lIdx != null && rIdx != null) {
            const l = leftFlat[lIdx];
            const r = rightFlat[rIdx];
            if (l.value !== r.value) {
              leftClasses.set(idx, 'diff-changed');
              rightClasses.set(idx, 'diff-changed');
            }
            // cell-level diffs
            const lParts = window.TreeDiffEngine.splitValueIntoCellsWithCache(l, caches);
            const rParts = window.TreeDiffEngine.splitValueIntoCellsWithCache(r, caches);
            const cols = ['line','code','type','objectCount','dataSize'];
            const lMap = {}; const rMap = {};
            // Compare line
            if (lParts.line !== rParts.line) { lMap.line = 'cell-changed'; rMap.line = 'cell-changed'; }
            // Compare code (properties and end markers show code)
            if (lParts.code !== rParts.code) { lMap.code = 'cell-changed'; rMap.code = 'cell-changed'; }
            // Compare type/data display
            if (lParts.type !== rParts.type) { lMap.type = 'cell-changed'; rMap.type = 'cell-changed'; }
            // Object count
            if (lParts.objectCount !== rParts.objectCount) { lMap.objectCount = 'cell-changed'; rMap.objectCount = 'cell-changed'; }
            // Data size
            if (lParts.dataSize !== rParts.dataSize) { lMap.dataSize = 'cell-changed'; rMap.dataSize = 'cell-changed'; }
            if (Object.keys(lMap).length) leftCellClasses.set(idx, lMap);
            if (Object.keys(rMap).length) rightCellClasses.set(idx, rMap);
          } else if (lIdx != null) {
            leftClasses.set(idx, 'diff-removed');
            leftCellClasses.set(idx, { line: 'cell-removed', code: 'cell-removed', type: 'cell-removed', objectCount: 'cell-removed', dataSize: 'cell-removed' });
          } else if (rIdx != null) {
            rightClasses.set(idx, 'diff-added');
            rightCellClasses.set(idx, { line: 'cell-added', code: 'cell-added', type: 'cell-added', objectCount: 'cell-added', dataSize: 'cell-added' });
          }
        }
        this.currentDiffMap = { leftRowClasses: leftClasses, rightRowClasses: rightClasses, leftCellClasses, rightCellClasses, totalRows };
        this.myTreeGrid.setRowClassProvider((index, item) => this.currentDiffMap.leftRowClasses.get(index) || null);
        this.myTreeGridRight.setRowClassProvider((index, item) => this.currentDiffMap.rightRowClasses.get(index) || null);
        this.myTreeGrid.setCellClassProvider((index, item, key) => {
          const map = this.currentDiffMap.leftCellClasses.get(index);
          return map ? map[key] || null : null;
        });
        this.myTreeGridRight.setCellClassProvider((index, item, key) => {
          const map = this.currentDiffMap.rightCellClasses.get(index);
          return map ? map[key] || null : null;
        });
        this.myTreeGrid.setOverrideTotalRows(totalRows);
        this.myTreeGridRight.setOverrideTotalRows(totalRows);
        // Build index maps so placeholders are rendered at unmatched positions
        const leftIndexMap = new Array(totalRows).fill(null);
        const rightIndexMap = new Array(totalRows).fill(null);
        for (let idx = 0; idx < totalRows; idx++) {
          const pair = aligned[idx];
          if (pair) {
            if (pair.leftIndex != null) leftIndexMap[idx] = pair.leftIndex;
            if (pair.rightIndex != null) rightIndexMap[idx] = pair.rightIndex;
          }
        }
        if (this.myTreeGrid.setIndexMap) this.myTreeGrid.setIndexMap(leftIndexMap);
        if (this.myTreeGridRight.setIndexMap) this.myTreeGridRight.setIndexMap(rightIndexMap);
        this.syncVerticalScroll();
        // 4) Force re-render and reset scroll for consistent visuals
        if (this.myTreeGrid) { this.myTreeGrid.updateVisibleNodes(); this.treeViewContainer.scrollTop = 0; }
        if (this.myTreeGridRight) { this.myTreeGridRight.updateVisibleNodes(); this.treeViewContainerRight.scrollTop = 0; }
        this.updateDiffIndicator();
      }

      updateDiffIndicator() {
        const indicator = document.getElementById('diffIndicator');
        if (!indicator) return;
        const hasLeft = !!this.getActiveTab();
        const hasRight = !!this.getActiveTabRight();
        const on = !!this.sideBySideDiffEnabled && hasLeft && hasRight;
        indicator.style.display = on ? 'inline-block' : 'none';
      }

      // splitValueIntoCells moved to TreeDiffEngine

      expandAllForTab(tab) {
        if (!tab) return;
        this.expandAllNodes(tab.originalTreeData);
        if (tab.currentSortField) {
          this.sortTreeNodes(tab.originalTreeData, tab.currentSortField, tab.currentSortAscending);
        }
        tab.currentTreeData = this.filterTree(
          tab.originalTreeData,
          tab.codeSearchTerms || [],
          tab.dataSearchTerms || [],
          tab.dataExact || false,
          tab.dataCase || false,
          tab.minLine || null,
          tab.maxLine || null,
          tab.selectedObjectTypes || []
        );
      }


      syncVerticalScroll() {
        if (this._scrollSyncAttached) return;
        const leftC = this.treeViewContainer;
        const rightC = this.treeViewContainerRight;
        if (!leftC || !rightC) return;
        let syncing = false;
        const onLeft = () => {
          if (syncing) return; syncing = true;
          rightC.scrollTop = leftC.scrollTop;
          syncing = false;
        };
        const onRight = () => {
          if (syncing) return; syncing = true;
          leftC.scrollTop = rightC.scrollTop;
          syncing = false;
        };
        leftC.addEventListener('scroll', onLeft);
        rightC.addEventListener('scroll', onRight);
        this._scrollSyncAttached = true;
      }

      toggleRightPanel() {
        const right = document.getElementById('panelRight');
        const splitter = document.getElementById('compareSplitter');
        if (!right || !splitter) return;
        const hidden = right.style.display === 'none';
        if (hidden) {
          right.style.display = 'flex';
          splitter.style.display = 'block';
        } else {
          right.style.display = 'none';
          splitter.style.display = 'none';
        }
        // Relayout grids
        setTimeout(() => {
          this.myTreeGrid.updateVisibleNodes();
          if (this.myTreeGridRight) this.myTreeGridRight.updateVisibleNodes();
        }, 0);
      }

      initCompareSplitter() {
        const splitter = document.getElementById('compareSplitter');
        const left = document.getElementById('panelLeft');
        const right = document.getElementById('panelRight');
        const container = document.getElementById('compareContainer');
        if (!splitter || !left || !right || !container) return;

        let isDragging = false;
        let startX = 0;
        let startLeftWidth = 0;
        splitter.addEventListener('mousedown', (e) => {
          e.preventDefault();
          isDragging = true;
          startX = e.clientX;
          startLeftWidth = left.getBoundingClientRect().width;
          document.body.style.cursor = 'ew-resize';
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        });
        const onMouseMove = (e) => {
          if (!isDragging) return;
          const dx = e.clientX - startX;
          const containerWidth = container.getBoundingClientRect().width;
          let newLeftWidth = startLeftWidth + dx;
          const min = 150;
          const max = containerWidth - 150;
          if (newLeftWidth < min) newLeftWidth = min;
          if (newLeftWidth > max) newLeftWidth = max;
          left.style.flex = 'none';
          right.style.flex = 'none';
          left.style.width = newLeftWidth + 'px';
          right.style.width = (containerWidth - newLeftWidth - splitter.getBoundingClientRect().width - 8 /*gap approx*/) + 'px';
          // Update grids during drag for responsiveness
          this.myTreeGrid.updateVisibleNodes();
          if (this.myTreeGridRight) this.myTreeGridRight.updateVisibleNodes();
        };
        const onMouseUp = () => {
          isDragging = false;
          document.body.style.cursor = '';
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          // Final relayout
          this.myTreeGrid.updateVisibleNodes();
          if (this.myTreeGridRight) this.myTreeGridRight.updateVisibleNodes();
        };
      }
      
      // Initialize context menu functionality
      initContextMenu() {
        const contextMenu = document.getElementById('contextMenu');
        let currentContextTarget = null;
        
        // Right-click on tree rows to show context menu
        this.treeViewContainer.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const row = e.target.closest('.tree-row');
          if (row) {
            currentContextTarget = row;
            this.showContextMenu(e.clientX, e.clientY);
          }
        });
        
        // Handle context menu item clicks
        contextMenu.addEventListener('click', (e) => {
          const item = e.target.closest('.context-menu-item');
          if (item && currentContextTarget) {
            const action = item.getAttribute('data-action');
            const type = item.getAttribute('data-type');
            
            if (action) {
              this.handleContextMenuAction(action, type, currentContextTarget);
              this.hideContextMenu();
            }
          }
        });
        
        // Hide context menu when clicking elsewhere
        document.addEventListener('click', (e) => {
          if (!contextMenu.contains(e.target)) {
            this.hideContextMenu();
          }
        });
        
        // Hide context menu on escape key
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            this.hideContextMenu();
          }
        });
      }
      
      // Show context menu at specified position
      showContextMenu(x, y) {
        const contextMenu = document.getElementById('contextMenu');
        contextMenu.style.display = 'block';
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        
        // Adjust position if menu goes off screen
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          contextMenu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
          contextMenu.style.top = (window.innerHeight - rect.height - 10) + 'px';
        }
      }
      
      // Hide context menu
      hideContextMenu() {
        document.getElementById('contextMenu').style.display = 'none';
      }
      
      // Handle context menu actions
      handleContextMenuAction(action, type, targetRow) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        
        const nodeId = targetRow.dataset.id;
        const node = this.dxfParser.findNodeByIdIterative(activeTab.originalTreeData, nodeId);
        if (!node) return;
        
        switch (action) {
          case 'add-above':
            this.addRowAbove(node);
            break;
          case 'add-below':
            this.addRowBelow(node);
            break;
          case 'add-child':
            this.addChildRow(node);
            break;
          case 'remove':
            this.removeRow(node);
            break;
          case 'add-section':
            this.addDxfSection(node, type);
            break;
          case 'add-entity':
            this.addDxfEntity(node, type);
            break;
          case 'add-table':
            this.addTableEntry(node, type);
            break;
          case 'add-object':
            this.addDxfObject(node, type);
            break;
        }
        
        // Refresh tree and save state (left by default)
        this.updateEffectiveSearchTerms('left');
        this.saveCurrentState();
      }
      
      // Add row above the selected node
      addRowAbove(targetNode) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        
        if (targetNode.isProperty) {
          // Add property above current property
          const parent = targetNode.parentNode;
          if (parent) {
            const index = parent.properties.findIndex(p => p === targetNode.propRef);
            const newProp = { line: '', code: 0, value: '' };
            parent.properties.splice(index, 0, newProp);
          }
        } else {
          // Add node above current node
          const parent = this.dxfParser.findParentByIdIterative(activeTab.originalTreeData, targetNode.id);
          const newNode = this.createNewNode('NEW');
          
          if (parent) {
            const index = parent.children.indexOf(targetNode);
            parent.children.splice(index, 0, newNode);
          } else {
            const index = activeTab.originalTreeData.indexOf(targetNode);
            activeTab.originalTreeData.splice(index, 0, newNode);
          }
        }
      }
      
      // Add row below the selected node
      addRowBelow(targetNode) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        
        if (targetNode.isProperty) {
          // Add property below current property
          const parent = targetNode.parentNode;
          if (parent) {
            const index = parent.properties.findIndex(p => p === targetNode.propRef);
            const newProp = { line: '', code: 0, value: '' };
            parent.properties.splice(index + 1, 0, newProp);
          }
        } else {
          // Add node below current node
          const parent = this.dxfParser.findParentByIdIterative(activeTab.originalTreeData, targetNode.id);
          const newNode = this.createNewNode('NEW');
          
          if (parent) {
            const index = parent.children.indexOf(targetNode);
            parent.children.splice(index + 1, 0, newNode);
          } else {
            const index = activeTab.originalTreeData.indexOf(targetNode);
            activeTab.originalTreeData.splice(index + 1, 0, newNode);
          }
        }
      }
      
      // Add child row to the selected node
      addChildRow(targetNode) {
        if (targetNode.isProperty) return; // Can't add children to properties
        
        const newNode = this.createNewNode('NEW');
        if (!targetNode.children) {
          targetNode.children = [];
        }
        targetNode.children.push(newNode);
        targetNode.expanded = true; // Expand to show new child
      }
      
      // Remove the selected row
      removeRow(targetNode) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        
        if (targetNode.isProperty) {
          // Remove property
          const parent = targetNode.parentNode;
          if (parent) {
            const index = parent.properties.findIndex(p => p === targetNode.propRef);
            if (index >= 0) parent.properties.splice(index, 1);
          }
        } else {
          // Remove node
          const parent = this.dxfParser.findParentByIdIterative(activeTab.originalTreeData, targetNode.id);
          if (parent) {
            const index = parent.children.indexOf(targetNode);
            if (index >= 0) parent.children.splice(index, 1);
          } else {
            const index = activeTab.originalTreeData.indexOf(targetNode);
            if (index >= 0) activeTab.originalTreeData.splice(index, 1);
          }
        }
      }
      
      // Create a new node with default properties
      createNewNode(type) {
        return {
          id: this.dxfParser.nextId++,
          type: type,
          line: '',
          code: 0,
          properties: [],
          children: [],
          expanded: false
        };
      }
      
      // Add DXF Section
      addDxfSection(targetNode, sectionType) {
        const newSection = this.createNewNode('SECTION');
        newSection.properties = [
          { line: '', code: 2, value: sectionType }
        ];
        newSection.children = [
          this.createNewNode('ENDSEC')
        ];
        
        this.addRowBelow(targetNode);
        // Replace the generic 'NEW' node with our section
        const activeTab = this.getActiveTab();
        const parent = this.dxfParser.findParentByIdIterative(activeTab.originalTreeData, targetNode.id);
        if (parent) {
          const index = parent.children.indexOf(targetNode) + 1;
          parent.children[index] = newSection;
        } else {
          const index = activeTab.originalTreeData.indexOf(targetNode) + 1;
          activeTab.originalTreeData[index] = newSection;
        }
      }
      
      // Add DXF Entity
      addDxfEntity(targetNode, entityType) {
        const templates = this.getDxfEntityTemplates();
        const template = templates[entityType] || templates['LINE']; // Default to LINE
        
        const newEntity = this.createNewNode(entityType);
        newEntity.properties = template.map(prop => ({ ...prop })); // Clone properties
        
        this.addRowBelow(targetNode);
        // Replace the generic 'NEW' node with our entity
        const activeTab = this.getActiveTab();
        const parent = this.dxfParser.findParentByIdIterative(activeTab.originalTreeData, targetNode.id);
        if (parent) {
          const index = parent.children.indexOf(targetNode) + 1;
          parent.children[index] = newEntity;
        } else {
          const index = activeTab.originalTreeData.indexOf(targetNode) + 1;
          activeTab.originalTreeData[index] = newEntity;
        }
      }
      
      // Add Table Entry
      addTableEntry(targetNode, tableType) {
        const templates = this.getDxfTableTemplates();
        const template = templates[tableType] || templates['LAYER']; // Default to LAYER
        
        const newEntry = this.createNewNode(tableType);
        newEntry.properties = template.map(prop => ({ ...prop })); // Clone properties
        
        this.addRowBelow(targetNode);
        // Replace the generic 'NEW' node with our table entry
        const activeTab = this.getActiveTab();
        const parent = this.dxfParser.findParentByIdIterative(activeTab.originalTreeData, targetNode.id);
        if (parent) {
          const index = parent.children.indexOf(targetNode) + 1;
          parent.children[index] = newEntry;
        } else {
          const index = activeTab.originalTreeData.indexOf(targetNode) + 1;
          activeTab.originalTreeData[index] = newEntry;
        }
      }
      
      // Add DXF Object
      addDxfObject(targetNode, objectType) {
        const templates = this.getDxfObjectTemplates();
        const template = templates[objectType] || templates['DICTIONARY']; // Default to DICTIONARY
        
        const newObject = this.createNewNode(objectType);
        newObject.properties = template.map(prop => ({ ...prop })); // Clone properties
        
        this.addRowBelow(targetNode);
        // Replace the generic 'NEW' node with our object
        const activeTab = this.getActiveTab();
        const parent = this.dxfParser.findParentByIdIterative(activeTab.originalTreeData, targetNode.id);
        if (parent) {
          const index = parent.children.indexOf(targetNode) + 1;
          parent.children[index] = newObject;
        } else {
          const index = activeTab.originalTreeData.indexOf(targetNode) + 1;
          activeTab.originalTreeData[index] = newObject;
        }
      }
      
      // Get DXF Entity templates with common properties
      getDxfEntityTemplates() {
        return {
          'LINE': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 10, value: '0.0' }, // Start X
            { line: '', code: 20, value: '0.0' }, // Start Y
            { line: '', code: 30, value: '0.0' }, // Start Z
            { line: '', code: 11, value: '1.0' }, // End X
            { line: '', code: 21, value: '0.0' }, // End Y
            { line: '', code: 31, value: '0.0' }  // End Z
          ],
          'CIRCLE': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 10, value: '0.0' }, // Center X
            { line: '', code: 20, value: '0.0' }, // Center Y
            { line: '', code: 30, value: '0.0' }, // Center Z
            { line: '', code: 40, value: '1.0' }  // Radius
          ],
          'ARC': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 10, value: '0.0' }, // Center X
            { line: '', code: 20, value: '0.0' }, // Center Y
            { line: '', code: 30, value: '0.0' }, // Center Z
            { line: '', code: 40, value: '1.0' }, // Radius
            { line: '', code: 50, value: '0.0' }, // Start angle
            { line: '', code: 51, value: '90.0' } // End angle
          ],
          'POINT': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 10, value: '0.0' }, // X
            { line: '', code: 20, value: '0.0' }, // Y
            { line: '', code: 30, value: '0.0' }  // Z
          ],
          'TEXT': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 10, value: '0.0' }, // Insertion X
            { line: '', code: 20, value: '0.0' }, // Insertion Y
            { line: '', code: 30, value: '0.0' }, // Insertion Z
            { line: '', code: 40, value: '1.0' }, // Height
            { line: '', code: 1, value: 'Sample Text' }, // Text value
            { line: '', code: 7, value: 'Standard' } // Text style
          ],
          'MTEXT': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 10, value: '0.0' }, // Insertion X
            { line: '', code: 20, value: '0.0' }, // Insertion Y
            { line: '', code: 30, value: '0.0' }, // Insertion Z
            { line: '', code: 40, value: '1.0' }, // Height
            { line: '', code: 41, value: '10.0' }, // Reference width
            { line: '', code: 1, value: 'Sample Multi-line Text' }, // Text value
            { line: '', code: 7, value: 'Standard' } // Text style
          ],
          'INSERT': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 2, value: 'BLOCK_NAME' }, // Block name
            { line: '', code: 10, value: '0.0' }, // Insertion X
            { line: '', code: 20, value: '0.0' }, // Insertion Y
            { line: '', code: 30, value: '0.0' }, // Insertion Z
            { line: '', code: 41, value: '1.0' }, // X scale
            { line: '', code: 42, value: '1.0' }, // Y scale
            { line: '', code: 43, value: '1.0' }, // Z scale
            { line: '', code: 50, value: '0.0' }  // Rotation angle
          ],
          'POLYLINE': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 66, value: '1' }, // Vertices follow flag
            { line: '', code: 10, value: '0.0' }, // Default X
            { line: '', code: 20, value: '0.0' }, // Default Y
            { line: '', code: 30, value: '0.0' }, // Default Z
            { line: '', code: 70, value: '0' }   // Polyline flag
          ],
          'LWPOLYLINE': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 90, value: '3' }, // Number of vertices
            { line: '', code: 70, value: '0' }, // Polyline flag
            { line: '', code: 10, value: '0.0' }, // X1
            { line: '', code: 20, value: '0.0' }, // Y1
            { line: '', code: 10, value: '1.0' }, // X2
            { line: '', code: 20, value: '0.0' }, // Y2
            { line: '', code: 10, value: '1.0' }, // X3
            { line: '', code: 20, value: '1.0' }  // Y3
          ],
          'ELLIPSE': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 10, value: '0.0' }, // Center X
            { line: '', code: 20, value: '0.0' }, // Center Y
            { line: '', code: 30, value: '0.0' }, // Center Z
            { line: '', code: 11, value: '1.0' }, // Major axis X
            { line: '', code: 21, value: '0.0' }, // Major axis Y
            { line: '', code: 31, value: '0.0' }, // Major axis Z
            { line: '', code: 40, value: '0.5' }, // Ratio of minor to major
            { line: '', code: 41, value: '0.0' }, // Start parameter
            { line: '', code: 42, value: '6.283185307179586' } // End parameter (2*PI)
          ],
          'HATCH': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 2, value: 'SOLID' }, // Pattern name
            { line: '', code: 70, value: '1' }, // Solid fill flag
            { line: '', code: 71, value: '0' }, // Associativity flag
            { line: '', code: 91, value: '1' }, // Number of boundary paths
            { line: '', code: 92, value: '1' }, // Boundary path type flag
            { line: '', code: 93, value: '4' }  // Number of edges
          ],
          'SPLINE': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 70, value: '8' }, // Spline flag
            { line: '', code: 71, value: '3' }, // Degree
            { line: '', code: 72, value: '8' }, // Number of knots
            { line: '', code: 73, value: '5' }, // Number of control points
            { line: '', code: 74, value: '0' }  // Number of fit points
          ],
          '3DFACE': [
            { line: '', code: 8, value: '0' }, // Layer
            { line: '', code: 10, value: '0.0' }, // 1st corner X
            { line: '', code: 20, value: '0.0' }, // 1st corner Y
            { line: '', code: 30, value: '0.0' }, // 1st corner Z
            { line: '', code: 11, value: '1.0' }, // 2nd corner X
            { line: '', code: 21, value: '0.0' }, // 2nd corner Y
            { line: '', code: 31, value: '0.0' }, // 2nd corner Z
            { line: '', code: 12, value: '1.0' }, // 3rd corner X
            { line: '', code: 22, value: '1.0' }, // 3rd corner Y
            { line: '', code: 32, value: '0.0' }, // 3rd corner Z
            { line: '', code: 13, value: '0.0' }, // 4th corner X
            { line: '', code: 23, value: '1.0' }, // 4th corner Y
            { line: '', code: 33, value: '0.0' }  // 4th corner Z
          ]
        };
      }
      
      // Get DXF Table entry templates
      getDxfTableTemplates() {
        return {
          'LAYER': [
            { line: '', code: 5, value: '10' }, // Handle
            { line: '', code: 330, value: '2' }, // Owner handle
            { line: '', code: 100, value: 'AcDbSymbolTableRecord' },
            { line: '', code: 100, value: 'AcDbLayerTableRecord' },
            { line: '', code: 2, value: 'NewLayer' }, // Layer name
            { line: '', code: 70, value: '0' }, // Layer flags
            { line: '', code: 62, value: '7' }, // Color number
            { line: '', code: 6, value: 'Continuous' }, // Linetype name
            { line: '', code: 370, value: '-3' } // Line weight
          ],
          'LTYPE': [
            { line: '', code: 5, value: '14' }, // Handle
            { line: '', code: 330, value: '5' }, // Owner handle
            { line: '', code: 100, value: 'AcDbSymbolTableRecord' },
            { line: '', code: 100, value: 'AcDbLinetypeTableRecord' },
            { line: '', code: 2, value: 'NewLinetype' }, // Linetype name
            { line: '', code: 70, value: '0' }, // Linetype flags
            { line: '', code: 3, value: 'New linetype description' }, // Description
            { line: '', code: 72, value: '65' }, // Alignment
            { line: '', code: 73, value: '0' }, // Number of dash items
            { line: '', code: 40, value: '0.0' } // Total pattern length
          ],
          'STYLE': [
            { line: '', code: 5, value: '11' }, // Handle
            { line: '', code: 330, value: '3' }, // Owner handle
            { line: '', code: 100, value: 'AcDbSymbolTableRecord' },
            { line: '', code: 100, value: 'AcDbTextStyleTableRecord' },
            { line: '', code: 2, value: 'NewStyle' }, // Style name
            { line: '', code: 70, value: '0' }, // Style flags
            { line: '', code: 40, value: '0.0' }, // Fixed text height
            { line: '', code: 41, value: '1.0' }, // Width factor
            { line: '', code: 50, value: '0.0' }, // Oblique angle
            { line: '', code: 71, value: '0' }, // Text generation flags
            { line: '', code: 42, value: '2.5' }, // Last height used
            { line: '', code: 3, value: 'txt' }, // Primary font file name
            { line: '', code: 4, value: '' } // Big font file name
          ],
          'VPORT': [
            { line: '', code: 5, value: '29' }, // Handle
            { line: '', code: 330, value: '8' }, // Owner handle
            { line: '', code: 100, value: 'AcDbSymbolTableRecord' },
            { line: '', code: 100, value: 'AcDbViewportTableRecord' },
            { line: '', code: 2, value: 'NewViewport' }, // Viewport name
            { line: '', code: 70, value: '0' }, // Viewport flags
            { line: '', code: 10, value: '0.0' }, // Lower left corner X
            { line: '', code: 20, value: '0.0' }, // Lower left corner Y
            { line: '', code: 11, value: '1.0' }, // Upper right corner X
            { line: '', code: 21, value: '1.0' } // Upper right corner Y
          ],
          'DIMSTYLE': [
            { line: '', code: 105, value: '27' }, // Handle
            { line: '', code: 330, value: 'A' }, // Owner handle
            { line: '', code: 100, value: 'AcDbSymbolTableRecord' },
            { line: '', code: 100, value: 'AcDbDimStyleTableRecord' },
            { line: '', code: 2, value: 'NewDimStyle' }, // Dimension style name
            { line: '', code: 70, value: '0' } // Dimension style flags
          ]
        };
      }
      
      // Get DXF Object templates
      getDxfObjectTemplates() {
        return {
          'DICTIONARY': [
            { line: '', code: 5, value: 'C' }, // Handle
            { line: '', code: 330, value: '0' }, // Owner handle
            { line: '', code: 100, value: 'AcDbDictionary' },
            { line: '', code: 281, value: '1' } // Hard owner flag
          ],
          'LAYOUT': [
            { line: '', code: 5, value: '1E' }, // Handle
            { line: '', code: 330, value: '1A' }, // Owner handle
            { line: '', code: 100, value: 'AcDbPlotSettings' },
            { line: '', code: 1, value: 'NewLayout' }, // Layout name
            { line: '', code: 2, value: 'none_device' }, // Printer/plotter name
            { line: '', code: 4, value: '' }, // Paper size
            { line: '', code: 6, value: '' }, // Plot view name
            { line: '', code: 40, value: '0.0' }, // Left margin
            { line: '', code: 41, value: '0.0' }, // Bottom margin
            { line: '', code: 42, value: '0.0' }, // Right margin
            { line: '', code: 43, value: '0.0' } // Top margin
          ],
          'GROUP': [
            { line: '', code: 5, value: 'A0' }, // Handle
            { line: '', code: 330, value: 'D' }, // Owner handle
            { line: '', code: 100, value: 'AcDbGroup' },
            { line: '', code: 300, value: 'NewGroup' }, // Group description
            { line: '', code: 70, value: '1' }, // Unnamed flag
            { line: '', code: 71, value: '1' } // Selectable flag
          ],
          'XRECORD': [
            { line: '', code: 5, value: 'A1' }, // Handle
            { line: '', code: 330, value: '0' }, // Owner handle
            { line: '', code: 100, value: 'AcDbXrecord' },
            { line: '', code: 280, value: '1' } // Duplicate record cloning flag
          ],
          'MATERIAL': [
            { line: '', code: 5, value: 'A2' }, // Handle
            { line: '', code: 330, value: '0' }, // Owner handle
            { line: '', code: 100, value: 'AcDbMaterial' },
            { line: '', code: 1, value: 'NewMaterial' }, // Material name
            { line: '', code: 2, value: 'Material description' }, // Description
            { line: '', code: 70, value: '1' } // Material type
          ]
        };
      }

      updateEffectiveSearchTerms(side = 'left') {
        const useRight = side === 'right';
        const getTab = () => useRight ? this.getActiveTabRight() : this.getActiveTab();
        const setData = (data) => useRight ? this.myTreeGridRight.setData(data) : this.myTreeGrid.setData(data);
        const setScrollTop = () => { if (useRight) this.treeViewContainerRight.scrollTop = 0; else this.treeViewContainer.scrollTop = 0; };
        const activeTab = getTab();
        if (!activeTab) return;
        const codeInput = document.getElementById(useRight ? 'codeSearchInputRight' : 'codeSearchInputLeft') || { value: '' };
        const dataInput = document.getElementById(useRight ? 'dataSearchInputRight' : 'dataSearchInputLeft') || { value: '' };
        const codeText = codeInput.value.trim();
        const dataText = dataInput.value.trim();
        const effectiveCodeSearchTerms = activeTab.codeSearchTerms.slice();
        const effectiveDataSearchTerms = activeTab.dataSearchTerms.slice();
        if (codeText !== "" && !effectiveCodeSearchTerms.includes(codeText)) {
          effectiveCodeSearchTerms.push(codeText);
        }
        if (dataText !== "" && !effectiveDataSearchTerms.includes(dataText)) {
          effectiveDataSearchTerms.push(dataText);
        }
        const minEl = document.getElementById(useRight ? 'minLineInputRight' : 'minLineInputLeft');
        const maxEl = document.getElementById(useRight ? 'maxLineInputRight' : 'maxLineInputLeft');
        const minLine = minEl && minEl.value.trim() !== ""
          ? parseInt(minEl.value.trim(), 10)
          : null;
        const maxLine = maxEl && maxEl.value.trim() !== ""
          ? parseInt(maxEl.value.trim(), 10)
          : null;
        activeTab.minLine = minLine;
        activeTab.maxLine = maxLine;
        const exactEl = document.getElementById(useRight ? 'dataExactCheckboxRight' : 'dataExactCheckboxLeft');
        const caseEl = document.getElementById(useRight ? 'dataCaseCheckboxRight' : 'dataCaseCheckboxLeft');
        activeTab.dataExact = !!(exactEl && exactEl.checked);
        activeTab.dataCase = !!(caseEl && caseEl.checked);

        // Get the selected object types from the dropdown checkboxes.
        const container = document.getElementById(useRight ? 'objectTypeDropdownContentRight' : 'objectTypeDropdownContentLeft');
        if (!container) return;
        const checkboxes = container.querySelectorAll("input[type='checkbox']");
        const selectedTypes = [];
        checkboxes.forEach(cb => {
          if (cb.checked) {
            selectedTypes.push(cb.value);
          }
        });
        activeTab.selectedObjectTypes = selectedTypes;

        activeTab.currentTreeData = this.filterTree(
          activeTab.originalTreeData,
          activeTab.codeSearchTerms,
          activeTab.dataSearchTerms,
          activeTab.dataExact,
          activeTab.dataCase,
          activeTab.minLine,
          activeTab.maxLine,
          selectedTypes // Pass selected types into the filter
        );
        setData(activeTab.currentTreeData);
        setScrollTop();
        this.saveCurrentState();
        this.updateFiltersButtonIndicators();
      }
      
      handleSearchOptionChange(side = 'left') { this.updateEffectiveSearchTerms(side); }
      
      getActiveTab() { return this.tabs.find(t => t.id === this.activeTabId); }

      populateObjectTypeDropdown() {
        const leftTab = this.getActiveTab();
        const rightTab = this.getActiveTabRight();
        const buildCounts = (tab) => {
          if (!tab) return {};
          const counts = {};
          const traverse = (nodes) => {
            nodes.forEach(node => {
              if (!node.isProperty && node.type) {
                counts[node.type] = (counts[node.type] || 0) + 1;
              }
              if (node.children && node.children.length > 0) traverse(node.children);
            });
          };
          tab.originalTreeData.forEach(node => traverse([node]));
          return counts;
        };
        const leftCounts = buildCounts(leftTab);
        const rightCounts = buildCounts(rightTab);
        const buildSide = (counts, contentId, side) => {
          const container = document.getElementById(contentId);
          if (!container) return;
          container.innerHTML = "";
          const selectAllLabel = document.createElement("label");
          selectAllLabel.style.fontWeight = "bold";
          const selectAllCheckbox = document.createElement("input");
          selectAllCheckbox.type = "checkbox";
          selectAllCheckbox.checked = true;
          selectAllCheckbox.addEventListener("change", () => {
            container.querySelectorAll("input[type='checkbox']").forEach((cb, index) => { if (index > 0) cb.checked = selectAllCheckbox.checked; });
            this.updateEffectiveSearchTerms(side);
            this.updateObjectTypeDropdownButton(side);
          });
          selectAllLabel.appendChild(selectAllCheckbox);
          selectAllLabel.appendChild(document.createTextNode(" Select All"));
          container.appendChild(selectAllLabel);
          const sorted = Object.keys(counts).sort();
          sorted.forEach(type => {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = type;
            checkbox.checked = true;
            checkbox.addEventListener("change", () => {
              const allTypeCheckboxes = Array.from(container.querySelectorAll("input[type='checkbox']")).slice(1);
              selectAllCheckbox.checked = allTypeCheckboxes.every(cb => cb.checked);
              this.updateEffectiveSearchTerms(side);
              this.updateObjectTypeDropdownButton(side);
            });
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(" " + type + " (" + counts[type] + ")"));
            container.appendChild(label);
          });
          this.updateObjectTypeDropdownButton(side);
        };
        buildSide(leftCounts, 'objectTypeDropdownContentLeft', 'left');
        buildSide(rightCounts, 'objectTypeDropdownContentRight', 'right');
      }

      updateObjectTypeDropdownButton(side = 'left') {
        const container = document.getElementById(side === 'right' ? 'objectTypeDropdownContentRight' : 'objectTypeDropdownContentLeft');
        const button = document.getElementById(side === 'right' ? 'objectTypeDropdownButtonRight' : 'objectTypeDropdownButtonLeft');
        if (!container || !button) return;
        const checkboxes = container.querySelectorAll("input[type='checkbox']");
        const selected = [];
        checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); });
        if (selected.length === checkboxes.length || checkboxes.length === 0) button.textContent = 'All Types';
        else if (selected.length === 0) button.textContent = 'None Selected';
        else button.textContent = selected.join(', ');
      }

      openFiltersOverlay(side = 'left') {
        const overlay = document.getElementById(side === 'right' ? 'filtersOverlayRight' : 'filtersOverlayLeft');
        const tab = side === 'right' ? this.getActiveTabRight() : this.getActiveTab();
        if (!overlay || !tab) return;
        // Ensure dropdowns populated
        this.populateObjectTypeDropdown();
        // Sync tags
        this.updateTagContainer(side === 'right' ? 'codeSearchTagsRight' : 'codeSearchTagsLeft', tab.codeSearchTerms || [], 'code');
        this.updateTagContainer(side === 'right' ? 'dataSearchTagsRight' : 'dataSearchTagsLeft', tab.dataSearchTerms || [], 'data');
        // Sync inputs
        const minEl = document.getElementById(side === 'right' ? 'minLineInputRight' : 'minLineInputLeft');
        const maxEl = document.getElementById(side === 'right' ? 'maxLineInputRight' : 'maxLineInputLeft');
        const exactEl = document.getElementById(side === 'right' ? 'dataExactCheckboxRight' : 'dataExactCheckboxLeft');
        const caseEl = document.getElementById(side === 'right' ? 'dataCaseCheckboxRight' : 'dataCaseCheckboxLeft');
        if (minEl) minEl.value = tab.minLine ?? '';
        if (maxEl) maxEl.value = tab.maxLine ?? '';
        if (exactEl) exactEl.checked = !!tab.dataExact;
        if (caseEl) caseEl.checked = !!tab.dataCase;
        // Sync object type checks to saved selection (if any)
        const contentId = side === 'right' ? 'objectTypeDropdownContentRight' : 'objectTypeDropdownContentLeft';
        const container = document.getElementById(contentId);
        if (container) {
          const allTypeCheckboxes = Array.from(container.querySelectorAll("input[type='checkbox']")).slice(1); // skip Select All
          if (tab.selectedObjectTypes && tab.selectedObjectTypes.length > 0) {
            allTypeCheckboxes.forEach(cb => { cb.checked = tab.selectedObjectTypes.includes(cb.value); });
          } else {
            allTypeCheckboxes.forEach(cb => { cb.checked = true; });
          }
          // Update select-all and button text
          const selectAllCb = container.querySelector("label input[type='checkbox']");
          if (selectAllCb) selectAllCb.checked = allTypeCheckboxes.every(cb => cb.checked);
          this.updateObjectTypeDropdownButton(side);
        }
        overlay.style.display = 'block';
      }

      closeFiltersOverlay(side = 'left') {
        const overlay = document.getElementById(side === 'right' ? 'filtersOverlayRight' : 'filtersOverlayLeft');
        if (overlay) overlay.style.display = 'none';
      }

      updateFiltersButtonIndicators() {
        const updateForSide = (side) => {
          const tab = side === 'right' ? this.getActiveTabRight() : this.getActiveTab();
          const btn = document.getElementById(side === 'right' ? 'filtersRightBtn' : 'filtersLeftBtn');
          if (!btn) return;
          if (!tab) { btn.classList.remove('has-active'); return; }
          const hasTextFilters = (tab.codeSearchTerms && tab.codeSearchTerms.length > 0) || (tab.dataSearchTerms && tab.dataSearchTerms.length > 0);
          const hasRangeOrFlags = (tab.minLine != null) || (tab.maxLine != null) || !!tab.dataExact || !!tab.dataCase;
          // Object type selection: active only if not all selected
          let hasTypeFilter = false;
          const container = document.getElementById(side === 'right' ? 'objectTypeDropdownContentRight' : 'objectTypeDropdownContentLeft');
          if (container) {
            const typeBoxes = Array.from(container.querySelectorAll("input[type='checkbox']")).slice(1);
            const totalTypes = typeBoxes.length;
            const selectedTypesCount = tab.selectedObjectTypes ? tab.selectedObjectTypes.length : totalTypes;
            hasTypeFilter = totalTypes > 0 && selectedTypesCount > 0 && selectedTypesCount < totalTypes;
          } else if (tab.selectedObjectTypes && tab.selectedObjectTypes.length > 0) {
            hasTypeFilter = true;
          }
          const hasActive = hasTextFilters || hasRangeOrFlags || hasTypeFilter;
          if (hasActive) btn.classList.add('has-active'); else btn.classList.remove('has-active');
        };
        updateForSide('left');
        updateForSide('right');
      }
 
      updateTabUI() {
        // Left panel tabs
        this.renderTabsInto('tabContainerLeft', this.tabs, this.activeTabId, true);
        // Right panel tabs
        this.renderTabsInto('tabContainerRight', this.tabsRight, this.activeTabIdRight, false);
        this.populateObjectTypeDropdown();
        this.updateNavHistoryUI();
        this.updateNavButtons();
        this.updateFiltersButtonIndicators();
      }

      renderTabsInto(containerId, tabsArr, activeId, isLeftPanel) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";
        tabsArr.forEach(tab => {
          const tabElem = document.createElement("div");
          tabElem.className = "tab" + (tab.id === activeId ? " active" : "");
          tabElem.textContent = tab.name;
          tabElem.dataset.tabId = tab.id;
          tabElem.addEventListener("click", () => {
            if (isLeftPanel) {
              this.activeTabId = tab.id;
              // Sync filter UI for left popup (if open)
              this.updateTagContainer("codeSearchTagsLeft", tab.codeSearchTerms, "code");
              this.updateTagContainer("dataSearchTagsLeft", tab.dataSearchTerms, "data");
              const minL = document.getElementById("minLineInputLeft");
              const maxL = document.getElementById("maxLineInputLeft");
              const exactL = document.getElementById("dataExactCheckboxLeft");
              const caseL = document.getElementById("dataCaseCheckboxLeft");
              if (minL) minL.value = tab.minLine ?? "";
              if (maxL) maxL.value = tab.maxLine ?? "";
              if (exactL) exactL.checked = !!tab.dataExact;
              if (caseL) caseL.checked = !!tab.dataCase;
              this.myTreeGrid.setData(tab.currentTreeData);
              this.treeViewContainer.scrollTop = 0;
              // Update left header sort indicators to reflect active tab if needed
              // (optional; not strictly required for diff)
            } else {
              this.activeTabIdRight = tab.id;
              if (this.myTreeGridRight) this.myTreeGridRight.setData(tab.currentTreeData);
              this.treeViewContainerRight.scrollTop = 0;
            }
            this.updateTabUI();
            if (this.sideBySideDiffEnabled) {
              this.computeAndApplySideBySideDiff();
            }
          });
          const closeBtn = document.createElement("span");
          closeBtn.className = "close-tab";
          closeBtn.textContent = "×";
          closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isLeftPanel) {
              this.stateManager.removeTabState(tab.id);
              this.tabs = this.tabs.filter(t => t.id !== tab.id);
              if (this.activeTabId === tab.id) { this.activeTabId = this.tabs.length ? this.tabs[0].id : null; }
              this.updateTabUI();
              if (this.activeTabId) {
                this.myTreeGrid.setData(this.getActiveTab().currentTreeData);
                this.applyTabFilters(this.getActiveTab());
              } else {
                this.myTreeGrid.setData([]);
              }
              this.saveCurrentState();
              if (this.sideBySideDiffEnabled) {
                const hasLeft = !!this.getActiveTab();
                const hasRight = !!this.getActiveTabRight();
                if (hasLeft && hasRight) {
                  this.computeAndApplySideBySideDiff();
                } else {
                  this.clearSideBySideDiff();
                }
              }
            } else {
              this.tabsRight = this.tabsRight.filter(t => t.id !== tab.id);
              if (this.activeTabIdRight === tab.id) { this.activeTabIdRight = this.tabsRight.length ? this.tabsRight[0].id : null; }
              this.updateTabUI();
              if (this.activeTabIdRight) {
                const t = this.tabsRight.find(t => t.id === this.activeTabIdRight);
                if (this.myTreeGridRight) this.myTreeGridRight.setData(t ? t.currentTreeData : []);
              } else {
                if (this.myTreeGridRight) this.myTreeGridRight.setData([]);
              }
              if (this.sideBySideDiffEnabled) {
                const hasLeft = !!this.getActiveTab();
                const hasRight = !!this.getActiveTabRight();
                if (hasLeft && hasRight) {
                  this.computeAndApplySideBySideDiff();
                } else {
                  this.clearSideBySideDiff();
                }
              }
            }
          });
          tabElem.appendChild(closeBtn);
          container.appendChild(tabElem);
        });
      }
      
      expandAllNodes(nodes) {
        nodes.forEach(node => {
          if ((node.properties && node.properties.length) || (node.children && node.children.length)) {
            node.expanded = true;
            this.expandAllNodes(node.children);
          }
        });
      }
      
      collapseAllNodes(nodes) {
        nodes.forEach(node => {
          node.expanded = false;
          this.collapseAllNodes(node.children);
        });
      }
      
      handleExpandAll() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        this.expandAllNodes(activeTab.originalTreeData);
        if (activeTab.currentSortField) {
          this.sortTreeNodes(activeTab.originalTreeData, activeTab.currentSortField, activeTab.currentSortAscending);
        }
        activeTab.currentTreeData = this.filterTree(
          activeTab.originalTreeData,
          activeTab.codeSearchTerms,
          activeTab.dataSearchTerms,
          activeTab.dataExact,
          activeTab.dataCase,
          activeTab.minLine,
          activeTab.maxLine,
          activeTab.selectedObjectTypes
        );
        this.myTreeGrid.setData(activeTab.currentTreeData);
        this.treeViewContainer.scrollTop = 0;
        // Save state after expanding/collapsing
        this.saveCurrentState();
      }
      
      handleExpandAllSide(side = 'left') {
        const tab = side === 'right' ? this.getActiveTabRight() : this.getActiveTab();
        if (!tab) return;
        this.expandAllNodes(tab.originalTreeData);
        if (tab.currentSortField) {
          this.sortTreeNodes(tab.originalTreeData, tab.currentSortField, tab.currentSortAscending);
        }
        tab.currentTreeData = this.filterTree(
          tab.originalTreeData,
          tab.codeSearchTerms,
          tab.dataSearchTerms,
          tab.dataExact,
          tab.dataCase,
          tab.minLine,
          tab.maxLine,
          tab.selectedObjectTypes
        );
        if (side === 'right') {
          if (this.myTreeGridRight) this.myTreeGridRight.setData(tab.currentTreeData);
          if (this.treeViewContainerRight) this.treeViewContainerRight.scrollTop = 0;
        } else {
          this.myTreeGrid.setData(tab.currentTreeData);
          this.treeViewContainer.scrollTop = 0;
        }
        this.saveCurrentState();
      }

      handleCollapseAll() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        this.collapseAllNodes(activeTab.originalTreeData);
        if (activeTab.currentSortField) {
          this.sortTreeNodes(activeTab.originalTreeData, activeTab.currentSortField, activeTab.currentSortAscending);
        }
        activeTab.currentTreeData = this.filterTree(
          activeTab.originalTreeData,
          activeTab.codeSearchTerms,
          activeTab.dataSearchTerms,
          activeTab.dataExact,
          activeTab.dataCase,
          activeTab.minLine,
          activeTab.maxLine,
          activeTab.selectedObjectTypes
        );
        this.myTreeGrid.setData(activeTab.currentTreeData);
        this.treeViewContainer.scrollTop = 0;
        // Save state after expanding/collapsing
        this.saveCurrentState();
      }

      handleCollapseAllSide(side = 'left') {
        const tab = side === 'right' ? this.getActiveTabRight() : this.getActiveTab();
        if (!tab) return;
        this.collapseAllNodes(tab.originalTreeData);
        if (tab.currentSortField) {
          this.sortTreeNodes(tab.originalTreeData, tab.currentSortField, tab.currentSortAscending);
        }
        tab.currentTreeData = this.filterTree(
          tab.originalTreeData,
          tab.codeSearchTerms,
          tab.dataSearchTerms,
          tab.dataExact,
          tab.dataCase,
          tab.minLine,
          tab.maxLine,
          tab.selectedObjectTypes
        );
        if (side === 'right') {
          if (this.myTreeGridRight) this.myTreeGridRight.setData(tab.currentTreeData);
          if (this.treeViewContainerRight) this.treeViewContainerRight.scrollTop = 0;
        } else {
          this.myTreeGrid.setData(tab.currentTreeData);
          this.treeViewContainer.scrollTop = 0;
        }
        this.saveCurrentState();
      }
      
      // Handle reset state button click
      handleResetState() {
        if (confirm('Are you sure you want to reset all state and close all tabs? This action cannot be undone.')) {
          // Clear all state from localStorage
          this.stateManager.clearAllState();
          
          // Clear current app state
          this.tabs = [];
          this.activeTabId = null;
          
          // Clear UI
          this.updateTabUI();
          this.myTreeGrid.setData([]);
          
          // Clear sidebar legacy inputs if present
          const legCode = document.getElementById("codeSearchInput");
          const legData = document.getElementById("dataSearchInput");
          const legMin = document.getElementById("minLineInput");
          const legMax = document.getElementById("maxLineInput");
          const legExact = document.getElementById("dataExactCheckbox");
          const legCase = document.getElementById("dataCaseCheckbox");
          if (legCode) legCode.value = "";
          if (legData) legData.value = "";
          if (legMin) legMin.value = "";
          if (legMax) legMax.value = "";
          if (legExact) legExact.checked = false;
          if (legCase) legCase.checked = false;
          
          // Clear tag containers (legacy sidebar if present)
          const legacyCodeTags = document.getElementById("codeSearchTags");
          const legacyDataTags = document.getElementById("dataSearchTags");
          if (legacyCodeTags) this.updateTagContainer("codeSearchTags", [], "code");
          if (legacyDataTags) this.updateTagContainer("dataSearchTags", [], "data");
          
          console.log('All state has been reset');
        }
      }
      
      handleToggleExpand(nodeId) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        const node = this.dxfParser.findNodeByIdIterative(activeTab.originalTreeData, nodeId);
        if (node) {
          node.expanded = !node.expanded;
          if (activeTab.currentSortField) {
            this.sortTreeNodes(activeTab.originalTreeData, activeTab.currentSortField, activeTab.currentSortAscending);
          }
          activeTab.currentTreeData = this.filterTree(
            activeTab.originalTreeData,
            activeTab.codeSearchTerms,
            activeTab.dataSearchTerms,
            activeTab.dataExact,
            activeTab.dataCase,
            activeTab.minLine,
            activeTab.maxLine,
            activeTab.selectedObjectTypes
          );
          this.myTreeGrid.setData(activeTab.currentTreeData);
          // Save state after node expansion change
          this.saveCurrentState();
        }
      }

      getActiveTabRight() { return this.tabsRight.find(t => t.id === this.activeTabIdRight); }

      handleToggleExpandRight(nodeId) {
        const activeTab = this.getActiveTabRight();
        if (!activeTab) return;
        const node = this.dxfParser.findNodeByIdIterative(activeTab.originalTreeData, nodeId);
        if (node) {
          node.expanded = !node.expanded;
          if (activeTab.currentSortField) {
            this.sortTreeNodes(activeTab.originalTreeData, activeTab.currentSortField, activeTab.currentSortAscending);
          }
          activeTab.currentTreeData = this.filterTree(
            activeTab.originalTreeData,
            activeTab.codeSearchTerms || [],
            activeTab.dataSearchTerms || [],
            activeTab.dataExact || false,
            activeTab.dataCase || false,
            activeTab.minLine || null,
            activeTab.maxLine || null,
            activeTab.selectedObjectTypes || []
          );
          this.myTreeGridRight.setData(activeTab.currentTreeData);
        }
      }
      
      getSortValue(node, field) {
        if (field === "line") { return node.line ? Number(node.line) : 0; }
        else if (field === "code") {
          if (node.isProperty) {
            const c = parseInt(node.code, 10);
            return isNaN(c) ? Number.MAX_SAFE_INTEGER : c;
          }
          return 0;
        } else if (field === "type") { return node.isProperty ? (node.data || "") : (node.type || ""); }
        else if (field === "objectCount") {
          if (node.isProperty) return 0;
          function countDescendants(n) {
            if (!n.children || n.children.length === 0) return 0;
            let count = 0;
            for (let child of n.children) {
              if (!child.isProperty) {
                count++;
                if (child.children && child.children.length) { count += countDescendants(child); }
              }
            }
            return count;
          }
          return countDescendants(node);
        } else if (field === "dataSize") {
          function computeSize(n) {
            if (n.isProperty) { return n.data ? n.data.length : 0; }
            else {
              let size = n.type ? n.type.length : 0;
              if (n.properties && n.properties.length) {
                for (let prop of n.properties) { size += prop.value ? prop.value.length : 0; }
              }
              if (n.children && n.children.length) {
                for (let child of n.children) { size += computeSize(child); }
              }
              return size;
            }
          }
          return computeSize(node);
        }
        return "";
      }
      
      sortTreeNodes(nodes, field, ascending) {
        nodes.sort((a, b) => {
          const aVal = this.getSortValue(a, field);
          const bVal = this.getSortValue(b, field);
          if (field === "code" || field === "line" || field === "objectCount" || field === "dataSize") {
            return (aVal - bVal) * (ascending ? 1 : -1);
          } else { return aVal.localeCompare(bVal) * (ascending ? 1 : -1); }
        });
        nodes.forEach(node => {
          if (node.properties && node.properties.length) {
            node.properties.sort((aProp, bProp) => {
              if (field === "code") {
                const aC = parseInt(aProp.code, 10) || 0;
                const bC = parseInt(bProp.code, 10) || 0;
                return (aC - bC) * (ascending ? 1 : -1);
              } else if (field === "line") {
                const aL = aProp.line || 0;
                const bL = bProp.line || 0;
                return (aL - bL) * (ascending ? 1 : -1);
              } else if (field === "type") {
                const aV = aProp.value || "";
                const bV = bProp.value || "";
                return aV.localeCompare(bV) * (ascending ? 1 : -1);
              }
              return 0;
            });
          }
          if (node.children && node.children.length) { this.sortTreeNodes(node.children, field, ascending); }
        });
      }
      
      handleHeaderClick(headerCell) {
        const field = headerCell.getAttribute('data-field');
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        let currentSort = headerCell.getAttribute('data-sort');
        let ascending = true;
        if (currentSort === 'asc') {
          ascending = false;
          headerCell.setAttribute('data-sort', 'desc');
          headerCell.querySelector('.sort-indicator').textContent = ' ▼';
        } else {
          ascending = true;
          headerCell.setAttribute('data-sort', 'asc');
          headerCell.querySelector('.sort-indicator').textContent = ' ▲';
        }
        activeTab.currentSortField = field;
        activeTab.currentSortAscending = ascending;
        document.querySelectorAll('.header-cell').forEach(cell => {
          if (cell !== headerCell) {
            cell.setAttribute('data-sort', 'none');
            cell.querySelector('.sort-indicator').textContent = '';
          }
        });
        this.sortTreeNodes(activeTab.originalTreeData, field, ascending);
        activeTab.currentTreeData = this.filterTree(
          activeTab.originalTreeData,
          activeTab.codeSearchTerms,
          activeTab.dataSearchTerms,
          activeTab.dataExact,
          activeTab.dataCase,
          activeTab.minLine,
          activeTab.maxLine,
          activeTab.selectedObjectTypes
        );
        this.myTreeGrid.setData(activeTab.currentTreeData);
      }

      handleHeaderClickRight(headerCell) {
        const field = headerCell.getAttribute('data-field');
        const activeTab = this.getActiveTabRight();
        if (!activeTab) return;
        let currentSort = headerCell.getAttribute('data-sort');
        let ascending = true;
        if (currentSort === 'asc') {
          ascending = false;
          headerCell.setAttribute('data-sort', 'desc');
          headerCell.querySelector('.sort-indicator').textContent = ' ▼';
        } else {
          ascending = true;
          headerCell.setAttribute('data-sort', 'asc');
          headerCell.querySelector('.sort-indicator').textContent = ' ▲';
        }
        activeTab.currentSortField = field;
        activeTab.currentSortAscending = ascending;
        document.querySelectorAll('#treeGridHeaderRight .header-cell').forEach(cell => {
          if (cell !== headerCell) {
            cell.setAttribute('data-sort', 'none');
            const si = cell.querySelector('.sort-indicator');
            if (si) si.textContent = '';
          }
        });
        this.sortTreeNodes(activeTab.originalTreeData, field, ascending);
        activeTab.currentTreeData = this.filterTree(
          activeTab.originalTreeData,
          activeTab.codeSearchTerms || [],
          activeTab.dataSearchTerms || [],
          activeTab.dataExact || false,
          activeTab.dataCase || false,
          activeTab.minLine || null,
          activeTab.maxLine || null,
          activeTab.selectedObjectTypes || []
        );
        this.myTreeGridRight.setData(activeTab.currentTreeData);
      }
      
      handleResizerMouseDown(e) {
        e.stopPropagation();
        const headerCell = e.target.parentElement;
        const field = headerCell.getAttribute('data-field');
        const startX = e.clientX;
        const startWidth = headerCell.offsetWidth;
        const onMouseMove = (eMove) => {
          const newWidth = startWidth + (eMove.clientX - startX);
          this.columnWidths[field] = newWidth;
          headerCell.style.width = newWidth + "px";
          headerCell.style.flex = "none";
          this.myTreeGrid.updateVisibleNodes();
        };
        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      }

      handleResizerMouseDownRight(e) {
        e.stopPropagation();
        const headerCell = e.target.parentElement;
        const field = headerCell.getAttribute('data-field');
        const startX = e.clientX;
        const startWidth = headerCell.offsetWidth;
        const onMouseMove = (eMove) => {
          const newWidth = startWidth + (eMove.clientX - startX);
          this.columnWidths[field] = newWidth;
          headerCell.style.width = newWidth + "px";
          headerCell.style.flex = "none";
          this.myTreeGridRight.updateVisibleNodes();
        };
        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      }

      filterTree(objects, codeTerms, dataTerms, dataExact, dataCase, minLine, maxLine, objectTypes) {
        const filtered = [];
        objects.forEach(obj => {
          const filteredObj = this.filterObject(obj, codeTerms, dataTerms, dataExact, dataCase, minLine, maxLine, objectTypes);
          if (filteredObj !== null) { filtered.push(filteredObj); }
        });
        return filtered;
      }

      filterObject(obj, codeTerms, dataTerms, dataExact, dataCase, minLine, maxLine, objectTypes) {
        // Determine if this node’s line number falls within the min/max range.
        let nodeLine = parseInt(obj.line, 10);
        let lineMatches = true;
        if (minLine != null && !isNaN(minLine)) {
          if (isNaN(nodeLine) || nodeLine < minLine) lineMatches = false;
        }
        if (maxLine != null && !isNaN(maxLine)) {
          if (isNaN(nodeLine) || nodeLine > maxLine) lineMatches = false;
        }

        // Filter properties based on min/max and code/data filters.
        const filteredProperties = obj.properties.filter(prop => {
          let propLine = parseInt(prop.line, 10);
          if (minLine != null && !isNaN(minLine)) {
            if (isNaN(propLine) || propLine < minLine) return false;
          }
          if (maxLine != null && !isNaN(maxLine)) {
            if (isNaN(propLine) || propLine > maxLine) return false;
          }
          const codeMatch = (codeTerms.length === 0) ||
            codeTerms.some(term => String(prop.code) === term);
          let dataMatch = true;
          if (dataTerms.length > 0) {
            if (dataExact) {
              dataMatch = dataTerms.some(term =>
                dataCase ? (prop.value === term)
                         : (prop.value.toLowerCase() === term.toLowerCase())
              );
            } else {
              dataMatch = dataTerms.some(term =>
                dataCase ? prop.value.includes(term)
                         : prop.value.toLowerCase().includes(term.toLowerCase())
              );
            }
          }
          return codeMatch && dataMatch;
        });

        // Recursively filter children.
        const filteredChildren = (obj.children || [])
          .map(child => this.filterObject(child, codeTerms, dataTerms, dataExact, dataCase, minLine, maxLine, objectTypes))
          .filter(child => child !== null);

        // For data filtering: if any data search terms are active, check whether the node’s type matches.
        const dataFilterActive = dataTerms.length > 0;
        let typeMatchesData = false;
        if (dataFilterActive) {
          if (dataExact) {
            typeMatchesData = dataTerms.some(term =>
              dataCase ? (obj.type === term)
                       : (obj.type.toLowerCase() === term.toLowerCase())
            );
          } else {
            typeMatchesData = dataTerms.some(term =>
              dataCase ? obj.type.includes(term)
                       : obj.type.toLowerCase().includes(term.toLowerCase())
            );
          }
        }

        // Check if the node’s type matches any of the selected object types.
        let typeMatchesFilter = true;
        if (objectTypes && objectTypes.length > 0) {
          typeMatchesFilter = objectTypes.some(filterType =>
            obj.type.toLowerCase() === filterType.toLowerCase()
          );
        }

        // NEW: If an object type filter is active, drop this node if:
        //   • It does not match the filter (i.e. typeMatchesFilter is false)
        //   • And it has no children that survive filtering.
        if (objectTypes && objectTypes.length > 0) {
          if (!typeMatchesFilter && filteredChildren.length === 0) {
            return null;
          }
        }

        // If a data filter is active but nothing in the node (or its children/properties) matches, drop it.
        if (dataFilterActive && !(typeMatchesData || filteredProperties.length > 0 || filteredChildren.length > 0)) {
          return null;
        }

        // If the node’s own line is out of range and there are no matching children or properties, drop it.
        if (!lineMatches && filteredProperties.length === 0 && filteredChildren.length === 0) {
          return null;
        }

        // Otherwise, return the node (with filtered properties and children).
        return {
          ...obj,
          expanded: obj.expanded,
          properties: filteredProperties,
          children: filteredChildren
        };
      }

      handleCopy(nodeId) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        const node = this.dxfParser.findNodeByIdIterative(activeTab.originalTreeData, nodeId);
        if (!node) { alert("Node not found in original data."); return; }
        const serialized = this.dxfParser.serializeNode(node);
        navigator.clipboard.writeText(serialized).then(() => {
          alert("Copied node to clipboard as valid DXF tags.");
        }, () => {
          alert("Failed to copy to clipboard.");
        });
      }
      
      handleOpen(nodeId) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        // Find the node in the current (original) tree data.
        const node = this.dxfParser.findNodeByIdIterative(activeTab.originalTreeData, nodeId);
        if (!node) {
          alert("Node not found.");
          return;
        }
        // Create a new tab object that displays only this node.
        const newTab = {
          id: Date.now() + Math.random(),
          name: node.type + (node.handle ? " (" + node.handle + ")" : ""),
          originalTreeData: [node],    // only this node will be shown in the tree
          currentTreeData: [node],
          codeSearchTerms: [],
          dataSearchTerms: [],
          currentSortField: "line",
          currentSortAscending: true,
          minLine: null,
          maxLine: null,
          dataExact: false,
          dataCase: false,
          navigationHistory: [],
          currentHistoryIndex: -1
        };
        this.tabs.push(newTab);
        this.activeTabId = newTab.id;
        this.updateTabUI();
        this.myTreeGrid.setData(newTab.currentTreeData);
      }

      handleAddRow() {
        const activeTab = this.getActiveTab();
        if (!activeTab || !this.selectedNodeId) return;
        const selected = this.dxfParser.findNodeByIdIterative(activeTab.originalTreeData, this.selectedNodeId);
        if (!selected) return;
        if (selected.isProperty) {
          const parent = selected.parentNode;
          if (!parent) return;
          const index = parent.properties.indexOf(selected.propRef);
          const newProp = { line: '', code: '', value: '' };
          parent.properties.splice(index + 1, 0, newProp);
        } else {
          const parent = this.dxfParser.findParentByIdIterative(activeTab.originalTreeData, selected.id);
          const newNode = { id: this.dxfParser.nextId++, type: 'NEW', line: '', code: 0, properties: [], children: [], expanded: false };
          if (parent) {
            const idx = parent.children.indexOf(selected);
            parent.children.splice(idx + 1, 0, newNode);
          } else {
            const idx = activeTab.originalTreeData.indexOf(selected);
            activeTab.originalTreeData.splice(idx + 1, 0, newNode);
          }
        }
        this.updateEffectiveSearchTerms('left');
      }

      handleRemoveRow() {
        const activeTab = this.getActiveTab();
        if (!activeTab || !this.selectedNodeId) return;
        const node = this.dxfParser.findNodeByIdIterative(activeTab.originalTreeData, this.selectedNodeId);
        if (!node) return;
        if (node.isProperty) {
          const parent = node.parentNode;
          if (!parent) return;
          const idx = parent.properties.indexOf(node.propRef);
          if (idx >= 0) parent.properties.splice(idx, 1);
        } else {
          const parent = this.dxfParser.findParentByIdIterative(activeTab.originalTreeData, node.id);
          if (parent) {
            const idx = parent.children.indexOf(node);
            if (idx >= 0) parent.children.splice(idx, 1);
          } else {
            const idx = activeTab.originalTreeData.indexOf(node);
            if (idx >= 0) activeTab.originalTreeData.splice(idx, 1);
          }
        }
        this.selectedNodeId = null;
        this.updateEffectiveSearchTerms('left');
      }

      handleDownloadDxf() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        const dxfText = this.dxfParser.serializeTree(activeTab.originalTreeData);
        const blob = new Blob([dxfText], { type: "application/dxf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = activeTab.name || "download.dxf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      async parseFileStream(file) {
        const reader = file.stream().getReader();
        const decoder = new TextDecoder("ascii");
        let leftover = "";
        const lines = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunkText = decoder.decode(value, { stream: true });
          const text = leftover + chunkText;
          const parts = text.split(/\r?\n/);
          leftover = parts.pop();
          // Use a loop instead of the spread operator to avoid call stack issues:
          for (const part of parts) {
            lines.push(part);
          }
        }
        if (leftover) { lines.push(leftover); }
        const tags = this.dxfParser.parseDxfLines(lines);
        const grouped = this.dxfParser.groupObjectsIterative(tags, 0);
        return grouped.objects;
      }
      
      handleFiles(files, panel = 'left') {
        const useStream = document.getElementById("useStreamCheckbox").checked;
        if (!files || files.length === 0) {
          alert("Please select (or drop) at least one DXF file.");
          return;
        }
        Array.from(files).forEach(file => {
          if (!file.name.toLowerCase().endsWith(".dxf")) {
            alert("Only DXF files are supported. Skipping: " + file.name);
            return;
          }
          if (useStream && file.stream) {
            this.parseFileStream(file)
                .then(objects => {
                  const newTab = {
                    id: Date.now() + Math.random(),
                    name: file.name,
                    originalTreeData: objects,
                    currentTreeData: objects,
                    codeSearchTerms: [],
                    dataSearchTerms: [],
                    currentSortField: "line",
                    currentSortAscending: true,
                    minLine: null,
                    maxLine: null,
                    dataExact: false,
                    dataCase: false,
                    navigationHistory: [],
                    currentHistoryIndex: -1,
                    classIdToName: {}
                  };
              if (panel === 'right') {
                    this.tabsRight.push(newTab);
                    this.activeTabIdRight = newTab.id;
                    this.updateTabUI();
                    this.myTreeGridRight.setData(newTab.currentTreeData);
                if (this.sideBySideDiffEnabled) {
                  // recompute diff when new right file is loaded
                  this.computeAndApplySideBySideDiff();
                }
                  } else {
                    this.tabs.push(newTab);
                    this.activeTabId = newTab.id;
                    // Initialize class mapping before displaying data
                    this.updateClasses();
                    this.updateTabUI();
                    this.myTreeGrid.setData(newTab.currentTreeData);
                    // Save state after new tab creation
                    this.saveCurrentState();
                if (this.sideBySideDiffEnabled) {
                  // recompute diff when new left file is loaded
                  this.computeAndApplySideBySideDiff();
                }
                  }
                })
              .catch(err => {
                console.error("Error during streamed parsing:", err);
                alert("Error during streamed parsing.");
              });
          } else {
            const reader = new FileReader();
            reader.onload = (event) => {
              const text = event.target.result;
              const objects = this.dxfParser.parse(text);
                const newTab = {
                  id: Date.now() + Math.random(),
                  name: file.name,
                  originalTreeData: objects,
                  currentTreeData: objects,
                  codeSearchTerms: [],
                  dataSearchTerms: [],
                  currentSortField: "line",
                  currentSortAscending: true,
                  minLine: null,
                  maxLine: null,
                  dataExact: false,
                  dataCase: false,
                  navigationHistory: [],
                  currentHistoryIndex: -1,
                  classIdToName: {}
                };
              if (panel === 'right') {
                this.tabsRight.push(newTab);
                this.activeTabIdRight = newTab.id;
                this.updateTabUI();
                this.myTreeGridRight.setData(newTab.currentTreeData);
              } else {
                this.tabs.push(newTab);
                this.activeTabId = newTab.id;
                // Call updateClasses() now so that CLASS nodes get their classId set.
                this.updateClasses();
                this.updateTabUI();
                this.myTreeGrid.setData(newTab.currentTreeData);
                // Save state after new tab creation
                this.saveCurrentState();
              }
            };
            reader.readAsText(file, "ascii");
          }
        });
      }
      
      handleParse() { /* removed global parser; per-panel parsers are used */ }
      
      // Create a new empty DXF file with minimum valid structure
      handleCreateNewDxf() {
        const emptyDxfContent = this.generateEmptyDxfTemplate();
        const objects = this.dxfParser.parse(emptyDxfContent);
        
        const newTab = {
          id: Date.now() + Math.random(),
          name: "New DXF File",
          originalTreeData: objects,
          currentTreeData: objects,
          codeSearchTerms: [],
          dataSearchTerms: [],
          currentSortField: "line",
          currentSortAscending: true,
          minLine: null,
          maxLine: null,
          dataExact: false,
          dataCase: false,
          navigationHistory: [],
          currentHistoryIndex: -1,
          classIdToName: {}
        };
        
        this.tabs.push(newTab);
        this.activeTabId = newTab.id;
        this.updateClasses();
        this.updateTabUI();
        this.myTreeGrid.setData(newTab.currentTreeData);
        // Save state after new tab creation
        this.saveCurrentState();
        if (this.sideBySideDiffEnabled) {
          this.computeAndApplySideBySideDiff();
        }
      }
      
      // Generate a minimal valid DXF file template
      generateEmptyDxfTemplate() {
        return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1024
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
1
0
LAYER
2
0
70
0
62
7
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
BLOCKS
0
ENDSEC
0
SECTION
2
ENTITIES
0
ENDSEC
0
EOF`;
      }
      
      createTagElement(text, type, containerId = "codeSearchTagsLeft") {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = text;
        const removeBtn = document.createElement("span");
        removeBtn.className = "remove";
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const isRight = /Right$/.test(containerId);
          const activeTab = isRight ? this.getActiveTabRight() : this.getActiveTab();
          if (!activeTab) return;
          if (type === "code") {
            activeTab.codeSearchTerms = activeTab.codeSearchTerms.filter(term => term !== text);
            this.updateTagContainer(containerId, activeTab.codeSearchTerms, "code");
          } else if (type === "data") {
            activeTab.dataSearchTerms = activeTab.dataSearchTerms.filter(term => term !== text);
            this.updateTagContainer(containerId, activeTab.dataSearchTerms, "data");
          }
          activeTab.currentTreeData = this.filterTree(
            activeTab.originalTreeData,
            activeTab.codeSearchTerms,
            activeTab.dataSearchTerms,
            activeTab.dataExact,
            activeTab.dataCase,
            activeTab.minLine,
            activeTab.maxLine,
            activeTab.selectedObjectTypes
          );
          if (isRight) {
            if (this.myTreeGridRight) this.myTreeGridRight.setData(activeTab.currentTreeData);
            if (this.treeViewContainerRight) this.treeViewContainerRight.scrollTop = 0;
          } else {
            this.myTreeGrid.setData(activeTab.currentTreeData);
            this.treeViewContainer.scrollTop = 0;
          }
          this.updateFiltersButtonIndicators();
        });
        tag.appendChild(removeBtn);
        return tag;
      }
      
      updateTagContainer(containerId, termsArray, type) {
        const container = document.getElementById(containerId);
        if (!container) return;
        Array.from(container.querySelectorAll(".tag")).forEach(tag => tag.remove());
        termsArray.forEach(term => {
          const tagElem = this.createTagElement(term, type, containerId);
          container.insertBefore(tagElem, container.querySelector("input"));
        });
      }
      
      setupTagInput(inputId, type, side = 'left') {
        const input = document.getElementById(inputId);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const text = input.value.trim();
            if (text !== "") {
              const activeTab = side === 'right' ? this.getActiveTabRight() : this.getActiveTab();
              if (!activeTab) return;
              if (type === "code") {
                if (!activeTab.codeSearchTerms.includes(text)) {
                  activeTab.codeSearchTerms.push(text);
                }
                this.updateTagContainer(side === 'right' ? "codeSearchTagsRight" : "codeSearchTagsLeft", activeTab.codeSearchTerms, "code");
              } else {
                if (!activeTab.dataSearchTerms.includes(text)) {
                  activeTab.dataSearchTerms.push(text);
                }
                this.updateTagContainer(side === 'right' ? "dataSearchTagsRight" : "dataSearchTagsLeft", activeTab.dataSearchTerms, "data");
              }
              input.value = "";
              this.updateEffectiveSearchTerms(side);
            }
          }
        });
        input.addEventListener("blur", () => {
          const text = input.value.trim();
          if (text !== "") {
            const activeTab = side === 'right' ? this.getActiveTabRight() : this.getActiveTab();
            if (!activeTab) return;
            if (type === "code") {
              if (!activeTab.codeSearchTerms.includes(text)) {
                activeTab.codeSearchTerms.push(text);
              }
              this.updateTagContainer(side === 'right' ? "codeSearchTagsRight" : "codeSearchTagsLeft", activeTab.codeSearchTerms, "code");
            } else {
              if (!activeTab.dataSearchTerms.includes(text)) {
                activeTab.dataSearchTerms.push(text);
              }
              this.updateTagContainer(side === 'right' ? "dataSearchTagsRight" : "dataSearchTagsLeft", activeTab.dataSearchTerms, "data");
            }
            input.value = "";
            this.updateEffectiveSearchTerms(side);
          }
        });
      }
      
      handleSearch(side = 'left') {
        const useRight = side === 'right';
        const activeTab = useRight ? this.getActiveTabRight() : this.getActiveTab();
        if (!activeTab) return;
        const codeInput = document.getElementById(useRight ? "codeSearchInputRight" : "codeSearchInputLeft");
        const dataInput = document.getElementById(useRight ? "dataSearchInputRight" : "dataSearchInputLeft");
        if (codeInput.value.trim() !== "") {
          const text = codeInput.value.trim();
          if (!activeTab.codeSearchTerms.includes(text)) {
            activeTab.codeSearchTerms.push(text);
          }
          this.updateTagContainer(useRight ? "codeSearchTagsRight" : "codeSearchTagsLeft", activeTab.codeSearchTerms, "code");
          codeInput.value = "";
        }
        if (dataInput.value.trim() !== "") {
          const text = dataInput.value.trim();
          if (!activeTab.dataSearchTerms.includes(text)) {
            activeTab.dataSearchTerms.push(text);
          }
          this.updateTagContainer(useRight ? "dataSearchTagsRight" : "dataSearchTagsLeft", activeTab.dataSearchTerms, "data");
          dataInput.value = "";
        }
        this.updateEffectiveSearchTerms(side);
      }
      
      handleClearSearch(side = 'left') {
        const useRight = side === 'right';
        const activeTab = useRight ? this.getActiveTabRight() : this.getActiveTab();
        if (!activeTab) return;

        // Clear search-related terms
        activeTab.codeSearchTerms = [];
        activeTab.dataSearchTerms = [];
        activeTab.minLine = null;
        activeTab.maxLine = null;

        // Reset the object type filter:
        // Get the container holding the checkboxes and set them all to checked.
        const objectTypeContainer = document.getElementById(useRight ? "objectTypeDropdownContentRight" : "objectTypeDropdownContentLeft");
        const checkboxes = objectTypeContainer.querySelectorAll("input[type='checkbox']");
        checkboxes.forEach(cb => cb.checked = true);

        // Update the active tab to include all types.
        activeTab.selectedObjectTypes = Array.from(checkboxes).map(cb => cb.value);

        // Update the UI for the tag containers and dropdown button.
        this.updateTagContainer(useRight ? "codeSearchTagsRight" : "codeSearchTagsLeft", activeTab.codeSearchTerms, "code");
        this.updateTagContainer(useRight ? "dataSearchTagsRight" : "dataSearchTagsLeft", activeTab.dataSearchTerms, "data");
        const codeInput = document.getElementById(useRight ? "codeSearchInputRight" : "codeSearchInputLeft");
        const dataInput = document.getElementById(useRight ? "dataSearchInputRight" : "dataSearchInputLeft");
        const exactEl = document.getElementById(useRight ? "dataExactCheckboxRight" : "dataExactCheckboxLeft");
        const caseEl = document.getElementById(useRight ? "dataCaseCheckboxRight" : "dataCaseCheckboxLeft");
        const minEl = document.getElementById(useRight ? "minLineInputRight" : "minLineInputLeft");
        const maxEl = document.getElementById(useRight ? "maxLineInputRight" : "maxLineInputLeft");
        if (codeInput) codeInput.value = "";
        if (dataInput) dataInput.value = "";
        if (exactEl) exactEl.checked = false;
        if (caseEl) caseEl.checked = false;
        if (minEl) minEl.value = "";
        if (maxEl) maxEl.value = "";
        this.updateObjectTypeDropdownButton(side);

        // Re-filter the tree including the reset object type filter.
        activeTab.currentTreeData = this.filterTree(
          activeTab.originalTreeData,
          activeTab.codeSearchTerms,
          activeTab.dataSearchTerms,
          false,
          false,
          null,
          null,
          activeTab.selectedObjectTypes
        );
        if (useRight) {
          this.myTreeGridRight.setData(activeTab.currentTreeData);
          this.treeViewContainerRight.scrollTop = 0;
        } else {
          this.myTreeGrid.setData(activeTab.currentTreeData);
          this.treeViewContainer.scrollTop = 0;
        }
        this.updateFiltersButtonIndicators();
      }
      
      findPathByHandle(nodes, handle) {
        for (const node of nodes) {
          if (node.handle && node.handle.toUpperCase() === handle.toUpperCase()) {
            return [node];
          }
          if (node.children && node.children.length) {
            const subPath = this.findPathByHandle(node.children, handle);
            if (subPath) { return [node, ...subPath]; }
          }
        }
        return null;
      }
      
      findPathByLine(nodes, targetLine) {
        for (const node of nodes) {
          // First check the node itself
          if (Number(node.line) === Number(targetLine)) {
            return [node];
          }
          // Check if any property has the matching line.
          if (node.properties && node.properties.length) {
            for (const prop of node.properties) {
              if (Number(prop.line) === Number(targetLine)) {
                // Create a pseudo-node for the property.
                // (Make sure the id matches how your flattenTree renders property nodes.)
                const pseudoNode = {
                  id: "prop-" + node.id + "-" + prop.line + "-" + prop.code,
                  line: prop.line,
                  isProperty: true,
                  code: prop.code,
                  data: prop.value
                };
                return [node, pseudoNode];
              }
            }
          }
          // Otherwise, check the children.
          if (node.children && node.children.length) {
            const subPath = this.findPathByLine(node.children, targetLine);
            if (subPath) {
              return [node, ...subPath];
            }
          }
        }
        return null;
      }
      scrollToLineAfterTabOpen(targetLine, attempt = 1) {
        const activeTab = this.getActiveTab();
        const path = this.findPathByLine(activeTab.originalTreeData, targetLine);
        if (!path) {
          // If not found yet, try again a few times.
          if (attempt < 5) {
            setTimeout(() => {
              this.scrollToLineAfterTabOpen(targetLine, attempt + 1);
            }, 200);
          } else {
            console.warn("Could not locate a node with line " + targetLine);
          }
          return;
        }
        // Expand all nodes in the path (ignore the last pseudo node if present).
        // We only need to expand real entity nodes.
        for (let i = 0; i < path.length; i++) {
          if (!path[i].isProperty) {
            path[i].expanded = true;
          }
        }
        // Update the current tree data so that the expanded state takes effect.
        activeTab.currentTreeData = activeTab.originalTreeData;
        this.myTreeGrid.setData(activeTab.currentTreeData);

        // Allow the tree view to re-render, then scroll.
        setTimeout(() => {
          // Use the id of the last node in the path.
          const targetNodeId = path[path.length - 1].id;
          const flatData = this.myTreeGrid.flatData;
          const targetIndex = flatData.findIndex(item => String(item.node.id) === String(targetNodeId));
          if (targetIndex >= 0) {
            this.treeViewContainer.scrollTop = targetIndex * this.myTreeGrid.itemHeight;
            const element = this.treeViewContent.querySelector(`[data-id="${targetNodeId}"]`);
            if (element) {
              element.style.backgroundColor = "yellow";
              setTimeout(() => { element.style.backgroundColor = ""; }, 2000);
            }
          }
        }, 300);
      }
      
      navigateToHandle(handle, addHistory = true) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        const path = this.findPathByHandle(activeTab.originalTreeData, handle);
        if (!path) { alert("Definition not found for handle: " + handle); return; }
        path.forEach(node => node.expanded = true);
        activeTab.currentTreeData = activeTab.originalTreeData;
        this.myTreeGrid.setData(activeTab.currentTreeData);
        setTimeout(() => {
          const targetNodeId = path[path.length - 1].id;
          const flatData = this.myTreeGrid.flatData;
          const targetIndex = flatData.findIndex(item => String(item.node.id) === String(targetNodeId));
          if (targetIndex >= 0) {
            this.treeViewContainer.scrollTop = targetIndex * this.myTreeGrid.itemHeight;
            const element = this.treeViewContent.querySelector(`[data-id="${targetNodeId}"]`);
            if (element) {
              element.style.backgroundColor = "yellow";
              setTimeout(() => { element.style.backgroundColor = ""; }, 2000);
            }
          }
        }, 300);
        if (addHistory) {
          if (activeTab.currentHistoryIndex < activeTab.navigationHistory.length - 1) {
            activeTab.navigationHistory.splice(activeTab.currentHistoryIndex + 1);
          }
          activeTab.navigationHistory.push(handle);
          activeTab.currentHistoryIndex = activeTab.navigationHistory.length - 1;
          this.updateNavHistoryUI();
          this.updateNavButtons();
        }
      }
      
      handleGoToHandle() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        const handleValue = document.getElementById("handleSearchInput").value.trim();
        if (!handleValue) return;
        this.navigateToHandle(handleValue, true);
      }
      
      handleLinkToHandle(handle) { this.navigateToHandle(handle, true); }
      
      updateNavHistoryUI() {
        const activeTab = this.getActiveTab();
        const listContainer = document.getElementById("navHistoryList");
        listContainer.innerHTML = "";
        if (!activeTab) return;
        activeTab.navigationHistory.forEach((handle, index) => {
          const span = document.createElement("span");
          span.textContent = handle;
          span.style.cursor = "pointer";
          span.style.marginRight = "8px";
          if (index === activeTab.currentHistoryIndex) {
            span.style.fontWeight = "bold";
            span.style.textDecoration = "underline";
          }
          span.addEventListener("click", () => {
            activeTab.currentHistoryIndex = index;
            this.navigateToHandle(handle, false);
            this.updateNavHistoryUI();
            this.updateNavButtons();
          });
          listContainer.appendChild(span);
        });
      }
      
      updateNavButtons() {
        const activeTab = this.getActiveTab();
        const backBtn = document.getElementById("backBtn");
        const forwardBtn = document.getElementById("forwardBtn");
        if (!activeTab) { backBtn.disabled = true; forwardBtn.disabled = true; return; }
        backBtn.disabled = activeTab.currentHistoryIndex <= 0;
        forwardBtn.disabled = activeTab.currentHistoryIndex >= activeTab.navigationHistory.length - 1;
      }
      
      navigateBack() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        if (activeTab.currentHistoryIndex > 0) {
          activeTab.currentHistoryIndex--;
          const handle = activeTab.navigationHistory[activeTab.currentHistoryIndex];
          this.navigateToHandle(handle, false);
          this.updateNavHistoryUI();
          this.updateNavButtons();
        }
      }
      
      navigateForward() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        if (activeTab.currentHistoryIndex < activeTab.navigationHistory.length - 1) {
          activeTab.currentHistoryIndex++;
          const handle = activeTab.navigationHistory[activeTab.currentHistoryIndex];
          this.navigateToHandle(handle, false);
          this.updateNavHistoryUI();
          this.updateNavButtons();
        }
      }
      
      clearNavigationHistory() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        activeTab.navigationHistory = [];
        activeTab.currentHistoryIndex = -1;
        this.updateNavHistoryUI();
        this.updateNavButtons();
      }
      
      updateClouds() {
        const activeTab = this.getActiveTab();
        if (!activeTab) {
          document.getElementById("overlayObjectCloud").innerHTML = "";
          document.getElementById("overlayCodeCloud").innerHTML = "";
          return;
        }
        const objectCounts = {};
        const codeCounts = {};
        function traverse(nodes) {
          nodes.forEach(node => {
            if (!node.isProperty) {
              objectCounts[node.type] = (objectCounts[node.type] || 0) + 1;
              node.properties.forEach(prop => {
                codeCounts[prop.code] = (codeCounts[prop.code] || 0) + 1;
              });
              if (node.children && node.children.length > 0) { traverse(node.children); }
            }
          });
        }
        traverse(activeTab.originalTreeData);
        const populateCloud = (element, counts, minFont, maxFont, cloudType) => {
          element.innerHTML = "";
          const maxCount = Math.max(...Object.values(counts), 1);
          for (const key in counts) {
            const count = counts[key];
            const fontSize = minFont + ((count / maxCount) * (maxFont - minFont));
            const span = document.createElement("span");
            span.className = "cloud-tag";
            span.style.fontSize = fontSize + "px";
            span.textContent = `${key} (${count})`;
            span.style.cursor = "pointer";
            span.addEventListener("click", () => {
              document.getElementById("cloudOverlay").style.display = "none";
              this.handleCloudTagClick(cloudType, key);
            });
            element.appendChild(span);
          }
        };
        const minFont = 12, maxFont = 36;
        const overlayObjectCloudElem = document.getElementById("overlayObjectCloud");
        const overlayCodeCloudElem = document.getElementById("overlayCodeCloud");
        populateCloud(overlayObjectCloudElem, objectCounts, minFont, maxFont, "object");
        populateCloud(overlayCodeCloudElem, codeCounts, minFont, maxFont, "code");
      }
      
      handleCloudTagClick(cloudType, key) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        if (cloudType === "object") {
          function search(nodes) {
            for (const node of nodes) {
              if (node.type && node.type.toLowerCase().includes(key.toLowerCase())) {
                return node;
              }
              if (node.children && node.children.length) {
                const result = search(node.children);
                if (result) return result;
              }
            }
            return null;
          }
          const found = search(activeTab.originalTreeData);
          if (found && found.handle) {
            this.handleLinkToHandle(found.handle);
          } else {
            alert("No matching object found for type: " + key);
          }
        } else if (cloudType === "code") {
          function search(nodes) {
            for (const node of nodes) {
              if (node.properties && node.properties.length) {
                for (const prop of node.properties) {
                  if (String(prop.code) === key) {
                    return node;
                  }
                }
              }
              if (node.children && node.children.length) {
                const result = search(node.children);
                if (result) return result;
              }
            }
            return null;
          }
          const found = search(activeTab.originalTreeData);
          if (found && found.handle) {
            this.handleLinkToHandle(found.handle);
          } else {
            alert("No matching object found for code: " + key);
          }
        }
      }
      
      updateStats() {
        const activeTab = this.getActiveTab();
        if (!activeTab) {
          document.getElementById("overlayStatsContent").innerHTML = "No DXF data loaded.";
          return;
        }
        function computeStats(nodes, depth = 1) {
          let stats = {
            totalObjects: 0,
            totalProperties: 0,
            maxDepth: depth,
            totalDataSize: 0,
            countByType: {}
          };
          nodes.forEach(node => {
            if (!node.isProperty) {
              stats.totalObjects++;
              stats.countByType[node.type] = (stats.countByType[node.type] || 0) + 1;
              let nodeDataSize = node.type ? node.type.length : 0;
              if (node.properties && node.properties.length) {
                stats.totalProperties += node.properties.length;
                node.properties.forEach(prop => { nodeDataSize += prop.value ? prop.value.length : 0; });
              }
              stats.totalDataSize += nodeDataSize;
              if (node.children && node.children.length) {
                const childStats = computeStats(node.children, depth + 1);
                stats.totalObjects += childStats.totalObjects;
                stats.totalProperties += childStats.totalProperties;
                stats.totalDataSize += childStats.totalDataSize;
                for (let type in childStats.countByType) {
                  stats.countByType[type] = (stats.countByType[type] || 0) + childStats.countByType[type];
                }
                if (childStats.maxDepth > stats.maxDepth) { stats.maxDepth = childStats.maxDepth; }
              }
            }
          });
          return stats;
        }
        const stats = computeStats(activeTab.originalTreeData);
        const avgProps = stats.totalObjects > 0 ? (stats.totalProperties / stats.totalObjects).toFixed(2) : 0;
        const statsHtml = `
          <ul>
            <li><strong>Total Objects:</strong> ${stats.totalObjects}</li>
            <li><strong>Total Properties:</strong> ${stats.totalProperties}</li>
            <li><strong>Maximum Nesting Depth:</strong> ${stats.maxDepth}</li>
            <li><strong>Total Data Size:</strong> ${stats.totalDataSize} characters</li>
            <li><strong>Average Properties per Object:</strong> ${avgProps}</li>
            <li><strong>Object Type Counts:</strong>
              <ul>
                ${Object.entries(stats.countByType)
                  .map(([type, count]) => `<li><a href="#" class="stats-type" data-type="${type}">${type}: ${count}</a></li>`)
                  .join('')}
              </ul>
            </li>
          </ul>
        `;
        document.getElementById("overlayStatsContent").innerHTML = statsHtml;
        document.querySelectorAll(".stats-type").forEach(link => {
          link.addEventListener("click", (e) => {
            e.preventDefault();
            const type = link.getAttribute("data-type");
            document.getElementById("statsOverlay").style.display = "none";
            this.handleCloudTagClick("object", type);
          });
        });
      }
      
      updateDependencies() {
        const activeTab = this.getActiveTab();
        if (!activeTab) {
          document.getElementById("overlayDepsContent").innerHTML = "No DXF data loaded.";
          return;
        }
        const dependencyTypes = ["LTYPE", "STYLE", "APPID", "LAYER", "DIMSTYLE", "VPORT", "XREF", "SHAPE"];
        const dependencies = {};
        dependencyTypes.forEach(type => dependencies[type] = []);
        function traverse(nodes) {
          nodes.forEach(node => {
            if (!node.isProperty) {
              const type = node.type.toUpperCase();
              if (dependencyTypes.includes(type)) { dependencies[type].push(node); }
              if (node.children && node.children.length) { traverse(node.children); }
            }
          });
        }
        traverse(activeTab.originalTreeData);
        let html = "";
        dependencyTypes.forEach(depType => {
          if (dependencies[depType].length > 0) {
            html += `<h3>${depType} (${dependencies[depType].length})</h3><ul>`;
            dependencies[depType].forEach(dep => {
              let depInfo = `${dep.type} (Line ${dep.line})`;
              if (dep.properties && dep.properties.length) {
                const propSummary = dep.properties.map(p => `${p.code}:${p.value}`).join(", ");
                depInfo += ` [${propSummary}]`;
              }
              if (dep.handle) {
                html += `<li><a href="#" class="dep-link" data-handle="${dep.handle}">${depInfo}</a></li>`;
              } else {
                html += `<li>${depInfo}</li>`;
              }
            });
            html += "</ul>";
          }
        });
        if (!html) { html = "No external dependency objects found."; }
        document.getElementById("overlayDepsContent").innerHTML = html;
        const self = this;
        document.querySelectorAll(".dep-link").forEach(link => {
          link.addEventListener("click", function(e) {
            e.preventDefault();
            document.getElementById("depsOverlay").style.display = "none";
            const handle = this.getAttribute("data-handle");
            self.handleLinkToHandle(handle);
          });
        });
      }
      
      renderHexLine(lineNumber, binaryArray) {
  const bytesPerLine = 16;
  const offset = lineNumber * bytesPerLine;
  const lineBytes = binaryArray.slice(offset, offset + bytesPerLine);
  let hex = '';
  let ascii = '';
  for (let i = 0; i < lineBytes.length; i++) {
    const byte = lineBytes[i];
    // Convert the byte to a two-digit hexadecimal value.
    hex += byte.toString(16).padStart(2, '0') + ' ';
    // Build the ASCII representation.
    ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
  }
  // Pad the hex section if the last line is shorter than bytesPerLine.
  hex = hex.padEnd(bytesPerLine * 3, ' ');
  // Return a string that shows the offset, the hex values, and the ASCII characters.
  return offset.toString(16).padStart(8, '0') + '  ' + hex + '  ' + ascii;
}
      
      virtualizeHexViewer(binaryArray) {
        const container = document.getElementById("hexContent");

        // Check that we have data to display.
        if (!binaryArray || binaryArray.length === 0) {
          container.textContent = "No data to display.";
          return;
        }

        // Measure one hex line’s height (only once).
        if (!this.hexLineHeight) {
          const tempDiv = document.createElement("div");
          tempDiv.style.position = "absolute";
          tempDiv.style.visibility = "hidden";
          tempDiv.style.whiteSpace = "pre";
          tempDiv.textContent = this.renderHexLine(0, binaryArray);
          container.appendChild(tempDiv);
          this.hexLineHeight = tempDiv.offsetHeight || 18; // Fallback if measurement fails.
          container.removeChild(tempDiv);

        }
        const lineHeight = this.hexLineHeight;
        const bytesPerLine = 16;
        const totalLines = Math.ceil(binaryArray.length / bytesPerLine);

        // This function renders only the visible lines.
        const updateView = () => {
          const scrollTop = container.scrollTop;
          const containerHeight = container.clientHeight;
          const startLine = Math.floor(scrollTop / lineHeight);
          const visibleLines = Math.ceil(containerHeight / lineHeight) + 1;
          const endLine = Math.min(startLine + visibleLines, totalLines);

          // Create an outer div with the full height of all lines.
          const contentDiv = document.createElement("div");
          contentDiv.style.position = "relative";
          contentDiv.style.height = (totalLines * lineHeight) + "px";

          // Create an inner container positioned at the correct offset.
          const visibleContainer = document.createElement("div");
          visibleContainer.style.position = "absolute";
          visibleContainer.style.top = (startLine * lineHeight) + "px";
          visibleContainer.style.left = "0";
          visibleContainer.style.right = "0";
          visibleContainer.style.whiteSpace = "pre"; // Preserve formatting

          // Render each visible line.
          for (let i = startLine; i < endLine; i++) {
            const lineDiv = document.createElement("div");
            lineDiv.style.height = lineHeight + "px";
            lineDiv.textContent = this.renderHexLine(i, binaryArray);
            visibleContainer.appendChild(lineDiv);
          }

          contentDiv.appendChild(visibleContainer);
          container.innerHTML = "";
          container.appendChild(contentDiv);
        };

        // Attach the scroll event.
        container.onscroll = updateView;
        // Render the initial view.
        updateView();
      }
      
      showHexViewer(combinedHexString) {
        const binaryArray = hexStringToByteArray(combinedHexString);
        const detectedType = detectHeader(binaryArray);
        document.getElementById("headerInfo").textContent =
          detectedType ? "Detected file type: " + detectedType : "Unknown file type";
        this.currentBinaryData = binaryArray;
        this.currentDetectedType = detectedType;
        document.getElementById("hexViewerOverlay").style.display = "block";

        // Use virtualization instead of rendering the full dump at once.
        this.virtualizeHexViewer(binaryArray);

        // (Optional) Continue handling ZIP/image previews as before.
        if (detectedType === "ZIP Archive") {
          document.getElementById("imagePreviewContainer").innerHTML = "";
          this.browseZip(binaryArray);
        } else if (detectedType === "PNG Image" || detectedType === "GIF Image" ||
                   detectedType === "JPEG Image" || detectedType === "BMP Image") {
          this.previewImage();
          document.getElementById("zipContentsContainer").innerHTML = "";
        } else {
          document.getElementById("imagePreviewContainer").innerHTML = "";
          document.getElementById("zipContentsContainer").innerHTML = "";
        }
      }
      
      previewImage() {
        if (!this.currentBinaryData) { alert("No binary data available."); return; }
        const imageTypes = {
          "PNG Image": "image/png",
          "GIF Image": "image/gif",
          "JPEG Image": "image/jpeg",
          "BMP Image": "image/bmp"
        };
        if (!this.currentDetectedType || !imageTypes[this.currentDetectedType]) {
          alert("Preview not available for this file type.");
          return;
        }
        const mimeType = imageTypes[this.currentDetectedType];
        const blob = new Blob([this.currentBinaryData], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const container = document.getElementById("imagePreviewContainer");
        container.innerHTML = "";
        const img = document.createElement("img");
        img.src = url;
        img.style.maxWidth = "100%";
        img.style.maxHeight = "300px";
        container.appendChild(img);
      }
      
      browseZip(binaryArray) {
        const blob = new Blob([binaryArray], { type: "application/zip" });
        JSZip.loadAsync(blob).then(zip => {
          const container = document.getElementById("zipContentsContainer");
          container.innerHTML = "<h3>ZIP Contents</h3>";
          Object.keys(zip.files).forEach(filename => {
            const file = zip.files[filename];
            const fileDiv = document.createElement("div");
            fileDiv.style.borderBottom = "1px solid #ccc";
            fileDiv.style.padding = "5px";
            fileDiv.innerHTML = `<strong>${filename}</strong> (${file._data.uncompressedSize || 0} bytes) `;
            if (!file.dir) {
              const previewBtn = document.createElement("button");
              previewBtn.textContent = "Preview";
              previewBtn.addEventListener("click", () => {
                const lowerName = filename.toLowerCase();
                if (lowerName.endsWith(".png") || lowerName.endsWith(".jpg") ||
                    lowerName.endsWith(".jpeg") || lowerName.endsWith(".gif") ||
                    lowerName.endsWith(".bmp")) {
                  file.async("base64").then(content => {
                    const img = document.createElement("img");
                    let mimeType = "image/png";
                    if(lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) mimeType = "image/jpeg";
                    else if(lowerName.endsWith(".gif")) mimeType = "image/gif";
                    else if(lowerName.endsWith(".bmp")) mimeType = "image/bmp";
                    img.src = `data:${mimeType};base64,${content}`;
                    const previewContainer = document.createElement("div");
                    previewContainer.style.marginTop = "10px";
                    previewContainer.appendChild(img);
                    fileDiv.appendChild(previewContainer);
                  });
                } else {
                  file.async("string").then(content => {
                    const pre = document.createElement("pre");
                    pre.textContent = content;
                    pre.style.maxHeight = "200px";
                    pre.style.overflow = "auto";
                    fileDiv.appendChild(pre);
                  });
                }
              });
              fileDiv.appendChild(previewBtn);
              const downloadBtn = document.createElement("button");
              downloadBtn.textContent = "Download";
              downloadBtn.addEventListener("click", () => {
                file.async("blob").then(blobContent => {
                  const url = URL.createObjectURL(blobContent);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                });
              });
              fileDiv.appendChild(downloadBtn);
            }
            container.appendChild(fileDiv);
          });
        }).catch(err => {
          alert("Failed to load ZIP file: " + err);
        });
      }
      
      updateHandleMap() {
        const activeTab = this.getActiveTab();
        if (!activeTab) {
          document.getElementById("overlayHandleMapContent").innerHTML = "No DXF data loaded.";
          return;
        }
        const nodesByHandle = {};
        function traverse(nodes) {
          nodes.forEach(node => {
            if (node.handle) {
              nodesByHandle[node.handle] = { handle: node.handle, type: node.type, line: node.line, children: [] };
            }
            if (node.children && node.children.length > 0) { traverse(node.children); }
          });
        }
        traverse(activeTab.originalTreeData);
        const roots = [];
        function assignOwner(nodes) {
          nodes.forEach(node => {
            const current = node.handle ? nodesByHandle[node.handle] : null;
            const ownerProp = node.properties.find(prop => Number(prop.code) === 330);
            if (ownerProp && ownerProp.value && nodesByHandle[ownerProp.value]) {
              const parent = nodesByHandle[ownerProp.value];
              if (current) { parent.children.push(current); }
            } else {
              if (current) { roots.push(current); }
            }
            if (node.children && node.children.length > 0) { assignOwner(node.children); }
          });
        }
        assignOwner(activeTab.originalTreeData);
        const uniqueRoots = Array.from(new Set(roots));
        function buildList(items) {
          const ul = document.createElement("ul");
          items.forEach(item => {
            const li = document.createElement("li");
            if (item.handle) {
              const a = document.createElement("a");
              a.href = "#";
              a.textContent = `Handle: ${item.handle} | Type: ${item.type} | Line: ${item.line}`;
              a.addEventListener("click", (e) => {
                e.preventDefault();
                document.getElementById("handleMapOverlay").style.display = "none";
                this.handleLinkToHandle(item.handle);
              });
              li.appendChild(a);
            } else {
              li.textContent = `Type: ${item.type} | Line: ${item.line}`;
            }
            if (item.children && item.children.length > 0) {
              li.appendChild(buildList.call(this, item.children));
            }
            ul.appendChild(li);
          });
          return ul;
        }
        const container = document.getElementById("overlayHandleMapContent");
        container.innerHTML = "";
        if (uniqueRoots.length === 0) {
          container.textContent = "No owner relationships (code 330) found.";
        } else {
          container.appendChild(buildList.call(this, uniqueRoots));
        }
      }
      
      showBinaryObjectsOverlay() {
        const activeTab = this.getActiveTab();
        const listContainer = document.getElementById("binaryObjectsList");
        listContainer.innerHTML = "";
        if (!activeTab) {
          listContainer.textContent = "No DXF data loaded.";
          document.getElementById("binaryObjectsOverlay").style.display = "block";
          return;
        }
        let binaryNodes = [];
        function findBinaryNodes(nodes) {
          nodes.forEach(node => {
            if (!node.isProperty && node.properties) {
              const binaryProps = node.properties.filter(prop => Number(prop.code) === 310);
              if (binaryProps.length > 0) { binaryNodes.push(node); }
            }
            if (node.children && node.children.length > 0) { findBinaryNodes(node.children); }
          });
        }
        findBinaryNodes(activeTab.originalTreeData);
        if (binaryNodes.length === 0) {
          listContainer.textContent = "No binary data objects found.";
        } else {
          binaryNodes.forEach(node => {
            const div = document.createElement("div");
            div.style.borderBottom = "1px solid #ccc";
            div.style.padding = "5px";
            let info = `Type: ${node.type} | Line: ${node.line}`;
            if (node.handle) { info += ` | Handle: ${node.handle}`; }
            const infoSpan = document.createElement("span");
            infoSpan.textContent = info + " ";
            div.appendChild(infoSpan);
            const binaryProps = node.properties.filter(prop => Number(prop.code) === 310);
            const combinedData = binaryProps.map(prop => prop.value).join("");
            const hexBtn = document.createElement("button");
            hexBtn.textContent = "Hex Viewer";
            hexBtn.addEventListener("click", () => { this.showHexViewer(combinedData); });
            div.appendChild(hexBtn);
            if (node.handle) {
              const showLink = document.createElement("a");
              showLink.href = "#";
              showLink.textContent = "Show in Tree";
              showLink.style.marginLeft = "10px";
              showLink.addEventListener("click", (e) => {
                e.preventDefault();
                document.getElementById("binaryObjectsOverlay").style.display = "none";
                this.handleLinkToHandle(node.handle);
              });
              div.appendChild(showLink);
            }
            listContainer.appendChild(div);
          });
        }
        document.getElementById("binaryObjectsOverlay").style.display = "block";
      }
      
      analyzeProxyObject(node) {
        let html = `<h3>Proxy Object Analysis</h3>`;
        html += `<p><strong>Total Properties:</strong> ${node.properties.length}. `;
        html += `<strong>Total Child Objects:</strong> ${node.children ? node.children.length : 0}.</p>`;
        html += `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse: collapse; width: 100%;">`;
        html += `<tr><th>DXF Code</th><th>Value</th></tr>`;
        node.properties.forEach(prop => {
          if (Number(prop.code) === 330) {
            html += `<tr><td>${prop.code}</td><td><a href="#" onclick="window.app.handleLinkToHandle('${prop.value}'); return false;">${prop.value}</a></td></tr>`;
          } else if (Number(prop.code) === 310) {
            html += `<tr><td>${prop.code}</td><td>Binary Data (length: ${prop.value.length})</td></tr>`;
          } else {
            html += `<tr><td>${prop.code}</td><td>${prop.value}</td></tr>`;
          }
        });
        html += `</table>`;
        const binaryProps = node.properties.filter(p => Number(p.code) === 310);
        if (binaryProps.length > 0) {
          const combinedData = binaryProps.map(p => p.value).join("");
          html += `<p><strong>Combined Binary Data:</strong> ${combinedData.length} characters. <a href="#" onclick="window.app.showHexViewer('${combinedData}'); return false;">View Hex</a></p>`;
        }
        if (node.children && node.children.length > 0) {
          html += `<h4>Child Objects:</h4>`;
          html += `<ul>`;
          node.children.forEach(child => {
            html += `<li>`;
            html += `Type: ${child.type} (Line: ${child.line}`;
            if (child.handle) {
              html += `, Handle: <a href="#" onclick="window.app.handleLinkToHandle('${child.handle}'); return false;">${child.handle}</a>`;
            }
            html += `)`;
            html += window.app.analyzeProxyObject(child);
            html += `</li>`;
          });
          html += `</ul>`;
        }
        return html;
      }
      
      showProxyObjectsOverlay() {
        const activeTab = this.getActiveTab();
        const listContainer = document.getElementById("proxyObjectsList");
        listContainer.innerHTML = "";

        if (!activeTab) {
          listContainer.textContent = "No DXF data loaded.";
          document.getElementById("proxyObjectsOverlay").style.display = "block";
          return;
        }

        // 1. Map classId → CLASS node
        const classIdToNode = new Map();
        function findClassNodes(nodes) {
          for (const node of nodes) {
            if (node.type?.toUpperCase() === "CLASS" && node.classId !== undefined) {
              classIdToNode.set(node.classId, node);
            }
            if (node.children?.length) findClassNodes(node.children);
          }
        }

        // 2. Find proxy objects
        const proxyNodes = [];
        function findProxies(nodes) {
          for (const node of nodes) {
            if (node.type?.toUpperCase() === "ACAD_PROXY_OBJECT") {
              proxyNodes.push(node);
            }
            if (node.children?.length) findProxies(node.children);
          }
        }

        // 3. Build handle → referencing nodes map
        const handleToUsers = new Map();
        function collectUsages(nodes) {
          for (const node of nodes) {
            for (const prop of node.properties || []) {
              if (isHandleCode(Number(prop.code))) {
                if (!handleToUsers.has(prop.value)) {
                  handleToUsers.set(prop.value, []);
                }
                handleToUsers.get(prop.value).push({ node, prop });
              }
            }
            if (node.children?.length) collectUsages(node.children);
          }
        }

        // ─ Run scans
        findClassNodes(activeTab.originalTreeData);
        findProxies(activeTab.originalTreeData);
        collectUsages(activeTab.originalTreeData);

        if (proxyNodes.length === 0) {
          listContainer.textContent = "No proxy objects found.";
          document.getElementById("proxyObjectsOverlay").style.display = "block";
          return;
        }

        for (const proxy of proxyNodes) {
          const div = document.createElement("div");
          div.style.borderBottom = "1px solid #ccc";
          div.style.padding = "6px";

          const classIdProp = proxy.properties.find(p => Number(p.code) === 91);
          const classId = classIdProp?.value;
          const handle = proxy.handle;

          const classNode = classIdToNode.get(Number(classId));
          const className = classNode
            ? (classNode.properties.find(p => Number(p.code) === 1)?.value || "(Unnamed CLASS)")
            : "(Unknown CLASS)";

          // Header
          div.innerHTML = `
            <strong>Proxy Object</strong><br/>
            Line: ${proxy.line}<br/>
            Handle: <code>${handle || "N/A"}</code><br/>
            Class ID: ${classId || "N/A"}<br/>
            Class Name: ${className}
            ${classNode ? ` - <a href="#" onclick="window.app.navigateToClassById('${classId}'); document.getElementById('proxyObjectsOverlay').style.display='none'; return false;">Show Class</a>` : ""}
          `;

          // Show in Tree
          if (handle) {
            const showBtn = document.createElement("button");
            showBtn.textContent = "Show In Tree";
            showBtn.onclick = () => {
              document.getElementById("proxyObjectsOverlay").style.display = "none";
              this.handleLinkToHandle(handle);
            };
            div.appendChild(showBtn);
          }

          // Copy DXF
          const copyBtn = document.createElement("button");
          copyBtn.textContent = "Copy DXF";
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(this.dxfParser.serializeNode(proxy));
          };
          div.appendChild(copyBtn);

          // Raw Details
          const detailsBtn = document.createElement("button");
          detailsBtn.textContent = "Details";
          const pre = document.createElement("pre");
          pre.style.display = "none";
          pre.style.background = "#f9f9f9";
          pre.style.padding = "5px";
          pre.textContent = this.dxfParser.serializeNode(proxy);
          detailsBtn.onclick = () => {
            pre.style.display = pre.style.display === "none" ? "block" : "none";
          };
          div.appendChild(detailsBtn);
          div.appendChild(pre);

          // Usages
          const usages = handle ? handleToUsers.get(handle) || [] : [];
          const usageTitle = document.createElement("p");
          usageTitle.innerHTML = `<strong>Usages:</strong> ${usages.length}`;
          div.appendChild(usageTitle);
          if (usages.length > 0) {
            const ul = document.createElement("ul");
            for (const ref of usages) {
              const li = document.createElement("li");
              li.innerHTML = `${ref.node.type} at line ${ref.node.line} (code ${ref.prop.code}) `;

              const showLink = document.createElement("a");
              showLink.href = "#";
              showLink.textContent = "Show";
              showLink.onclick = (e) => {
                e.preventDefault();
                document.getElementById("proxyObjectsOverlay").style.display = "none";
                if (ref.node.handle) {
                  window.app.handleLinkToHandle(ref.node.handle);
                } else {
                  window.app.scrollToLineAfterTabOpen(ref.node.line);
                }
              };
              li.appendChild(showLink);
              ul.appendChild(li);
            }
            div.appendChild(ul);
          }

          listContainer.appendChild(div);
        }

        document.getElementById("proxyObjectsOverlay").style.display = "block";
      }

      updateFonts() {
        const activeTab = this.getActiveTab();
        if (!activeTab) {
          document.getElementById("overlayFontsContent").innerHTML = "<p>No DXF data loaded.</p>";
          return;
        }
        // Create a mapping: font identifier => array of reference objects { desc, handle }
        let fonts = {};
        function traverse(node) {
          // For STYLE entities, check for a font file (group code 3) and style name (group code 2)
          if (node.type.toUpperCase() === "STYLE") {
            let styleName = "";
            let fontFile = "";
            node.properties.forEach(prop => {
              if (prop.code == 2) { styleName = prop.value; }
              if (prop.code == 3) { fontFile = prop.value; }
            });
            if (fontFile) {
              if (!fonts[fontFile]) {
                fonts[fontFile] = [];
              }
              fonts[fontFile].push({
                desc: `STYLE: ${styleName} (Line: ${node.line}${node.handle ? ", Handle: " + node.handle : ""})`,
                handle: node.handle
              });
            }
          }
          // For TEXT or MTEXT entities, check for text style (group code 7)
          if (node.type.toUpperCase() === "TEXT" || node.type.toUpperCase() === "MTEXT") {
            let textStyle = "";
            node.properties.forEach(prop => {
              if (prop.code == 7) { textStyle = prop.value; }
            });
            if (textStyle) {
              if (!fonts[textStyle]) {
                fonts[textStyle] = [];
              }
              fonts[textStyle].push({
                desc: `${node.type} (Line: ${node.line}${node.handle ? ", Handle: " + node.handle : ""})`,
                handle: node.handle
              });
            }
          }
          // Recurse through children
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child));
          }
        }
        activeTab.originalTreeData.forEach(node => traverse(node));
  
        // Build the HTML list from the fonts mapping.
        let html = "";
        if (Object.keys(fonts).length === 0) {
          html = "<p>No fonts found in the DXF data.</p>";
        } else {
          html = "<ul>";
          for (let font in fonts) {
            html += `<li><strong>${font}</strong><ul>`;
            fonts[font].forEach(entry => {
              html += `<li>${entry.desc}`;
              if (entry.handle) {
                html += ` <a href="#" onclick="window.app.handleLinkToHandle('${entry.handle}'); document.getElementById('fontsOverlay').style.display = 'none'; return false;">Show in Tree</a>`;
              }
              html += `</li>`;
            });
            html += "</ul></li>";
          }
          html += "</ul>";
        }
        document.getElementById("overlayFontsContent").innerHTML = html;
      }

      navigateToClassById(classId) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        // Search for a CLASS node with the matching classId.
        function search(nodes) {
          for (const node of nodes) {
            if (node.type && node.type.toUpperCase() === "CLASS" && node.classId == classId) {
              return node;
            }
            if (node.children && node.children.length > 0) {
              const found = search(node.children);
              if (found) return found;
            }
          }
          return null;
        }
        const targetClass = search(activeTab.originalTreeData);
        if (targetClass) {
          // You can now use your handleLinkToHandle (if the CLASS node has a handle)
          // or implement your own scrolling/highlighting logic.
          if (targetClass.handle) {
            this.handleLinkToHandle(targetClass.handle);
          } else {
            // Fallback: scroll to the node using its line number.
            this.scrollToLineAfterTabOpen(targetClass.line);
          }
        } else {
          alert("CLASS definition not found for class ID " + classId);
        }
      }

      getClassNameById(classId) {
        const activeTab = this.getActiveTab();
        if (!activeTab || !activeTab.classIdToName) return "";
        return activeTab.classIdToName[classId] || "";
      }

      updateClasses() {
        const activeTab = this.getActiveTab();
        if (!activeTab) {
          document.getElementById("overlayClassesContent").innerHTML =
            "<p>No DXF data loaded.</p>";
          return;
        }

        // Traverse the original tree data to collect CLASS nodes.
        let classes = [];
        function traverse(node) {
          if (!node.isProperty && node.type && node.type.toUpperCase() === "CLASS") {
            classes.push(node);
          }
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child));
          }
        }
        activeTab.originalTreeData.forEach(node => traverse(node));

        let html = "";

        // Build a cloud of Application Names from the CLASS nodes.
        let appNameCounts = {};
        classes.forEach(cls => {
          let appName = "";
          if (cls.properties && cls.properties.length) {
            cls.properties.forEach(prop => {
              if (Number(prop.code) === 3) {
                appName = prop.value;
              }
            });
          }
          if (appName) {
            appNameCounts[appName] = (appNameCounts[appName] || 0) + 1;
          }
        });

        if (Object.keys(appNameCounts).length > 0) {
          let maxCount = Math.max(...Object.values(appNameCounts));
          html += `<div class="app-cloud" style="padding:8px; margin:8px; border:1px dashed #aaa;">
                   <h4>Application Name Cloud</h4>`;
          for (let app in appNameCounts) {
            let count = appNameCounts[app];
            let fontSize = 12 + ((count / maxCount) * 12);
            html += `<span class="cloud-tag" style="font-size:${fontSize}px; cursor:pointer;"
                        onclick="window.app.filterClassesByAppName('${app.replace(/'/g, "\\'")}')">
                        ${app} (${count})
                     </span>`;
          }
          html += `</div>`;
        }

        if (classes.length === 0) {
          html += "<p>No classes found in the DXF data.</p>";
        } else {
          activeTab.classIdToName = {};
          // Initialize the class ID counter to 500.
          let classId = 500;
          classes.forEach(cls => {
            // Save the computed classId into the node.
            cls.classId = classId;

            // Extract key properties for display.
            let recordName = "", cppClass = "", appName = "";
            if (cls.properties && cls.properties.length) {
              cls.properties.forEach(prop => {
                switch (Number(prop.code)) {
                  case 1:
                    recordName = prop.value;
                    break;
                  case 2:
                    cppClass = prop.value;
                    break;
                  case 3:
                    appName = prop.value;
                    break;
                  default:
                    break;
                }
              });
            }
            // Render the CLASS record with the assigned ID.
            cls.className = recordName;
            activeTab.classIdToName[classId] = recordName;

            html += `<div class="class-record" style="border:1px solid #ddd; border-radius:4px; margin:8px; padding:8px;">
                      <h3 style="margin-top:0;">${recordName || "Unnamed Class"} (ID=${classId})</h3>
                      <p><strong>C++ Class:</strong> ${cppClass || "N/A"}</p>
                      <p><strong>Application Name:</strong> ${appName || "N/A"}</p>`;
            if (cls.handle) {
              html += `<p><a class="show-in-tree" href="#"
                              onclick="window.app.handleLinkToHandle('${cls.handle}');
                                       document.getElementById('classesOverlay').style.display='none'; return false;">
                              Show in Tree</a></p>`;
            }
            html += `<button class="toggle-details" style="margin-bottom:8px;" 
                          onclick="var details=this.nextElementSibling; 
                                   if(details.style.display==='none'){ details.style.display='block'; this.textContent='Hide Details'; } 
                                   else { details.style.display='none'; this.textContent='Show Details'; }">
                          Show Details</button>
                   <pre class="class-details" style="display:none; background:#f8f8f8; border:1px solid #eee; padding:8px; overflow:auto;">
      ${window.app.dxfParser.serializeNode(cls)}</pre>
                  </div>`;
            classId++;
          });
        }
        document.getElementById("overlayClassesContent").innerHTML = html;
      }

      filterClassesByAppName(appName) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;

        // Traverse CLASS nodes and select those whose Application Name matches.
        let filteredClasses = [];
        function traverse(node) {
          if (!node.isProperty && node.type && node.type.toUpperCase() === "CLASS") {
            let foundApp = "";
            if (node.properties && node.properties.length) {
              node.properties.forEach(prop => {
                if (Number(prop.code) === 3) {
                  foundApp = prop.value;
                }
              });
            }
            if (foundApp === appName) {
              filteredClasses.push(node);
            }
          }
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child));
          }
        }
        activeTab.originalTreeData.forEach(node => traverse(node));

        let html = `<h4>Classes with Application Name: ${appName}</h4>`;
        if (filteredClasses.length === 0) {
          html += `<p>No classes found with this Application Name.</p>`;
        } else {
          filteredClasses.forEach(cls => {
            let recordName = "", cppClass = "", appNameVal = "";
            if (cls.properties && cls.properties.length) {
              cls.properties.forEach(prop => {
                switch (Number(prop.code)) {
                  case 1:
                    recordName = prop.value;
                    break;
                  case 2:
                    cppClass = prop.value;
                    break;
                  case 3:
                    appNameVal = prop.value;
                    break;
                  default:
                    break;
                }
              });
            }
            html += `<div class="class-record" style="border:1px solid #ddd; border-radius:4px; margin:8px; padding:8px;">
                      <h3 style="margin-top:0;">${recordName || "Unnamed Class"}</h3>
                      <p><strong>C++ Class:</strong> ${cppClass || "N/A"}</p>
                      <p><strong>Application Name:</strong> ${appNameVal || "N/A"}</p>`;
            if (cls.handle) {
              html += `<p><a class="show-in-tree" href="#"
                              onclick="window.app.handleLinkToHandle('${cls.handle}'); 
                                       document.getElementById('classesOverlay').style.display='none'; return false;">
                              Show in Tree</a></p>`;
            }
            html += `<button class="toggle-details" style="margin-bottom:8px;" 
                            onclick="var details=this.nextElementSibling; 
                                     if(details.style.display==='none'){ details.style.display='block'; this.textContent='Hide Details'; } 
                                     else { details.style.display='none'; this.textContent='Show Details'; }">
                            Show Details</button>
                     <pre class="class-details" style="display:none; background:#f8f8f8; border:1px solid #eee; padding:8px; overflow:auto;">
      ${window.app.dxfParser.serializeNode(cls)}</pre>
                    </div>`;
          });
        }
        // Provide a back button to return to the full view.
        html += `<button onclick="window.app.updateClasses();" style="margin:8px;">Show All Classes</button>`;
        document.getElementById("overlayClassesContent").innerHTML = html;
      }
      
      showObjectSizeDialog() {
        const activeTab = this.getActiveTab();
        if (!activeTab) {
          alert("No DXF data loaded.");
          return;
        }
        // Collect all non‑property objects from the original tree.
        const nodes = [];
        function collectNodes(nodelist) {
          nodelist.forEach(node => {
            if (!node.isProperty) {
              nodes.push(node);
            }
            if (node.children && node.children.length > 0) {
              collectNodes(node.children);
            }
          });
        }
        collectNodes(activeTab.originalTreeData);
        // Sort by data size (largest first). (Uses the same computeDataSize method from the TreeDataGrid.)
        nodes.sort((a, b) => {
          return this.myTreeGrid.computeDataSize(b) - this.myTreeGrid.computeDataSize(a);
        });
        // Save sorted nodes so the virtualized renderer can use them.
        this.sortedNodesByDataSize = nodes;
        // Open the overlay and render the list.
        document.getElementById("objectSizeOverlay").style.display = "block";
        this.renderObjectSizeList();
      }
      
      renderObjectSizeList() {
        const container = document.getElementById("objectSizeList");
        const nodes = this.sortedNodesByDataSize || [];
        const rowHeight = 30; // fixed row height for each item
        const totalRows = nodes.length;
        container.innerHTML = ""; // clear previous content

        // Create an outer container with the full height
        const outerDiv = document.createElement("div");
        outerDiv.style.position = "relative";
        outerDiv.style.height = (totalRows * rowHeight) + "px";
        container.appendChild(outerDiv);

        // Function to render only the visible rows.
        const updateView = () => {
          const scrollTop = container.scrollTop;
          const containerHeight = container.clientHeight;
          const startIndex = Math.floor(scrollTop / rowHeight);
          const visibleCount = Math.ceil(containerHeight / rowHeight) + 1;
          const endIndex = Math.min(startIndex + visibleCount, totalRows);

          // Use an inner container for visible rows.
          let visibleContainer = outerDiv.querySelector(".visible-container");
          if (!visibleContainer) {
            visibleContainer = document.createElement("div");
            visibleContainer.className = "visible-container";
            visibleContainer.style.position = "absolute";
            visibleContainer.style.left = "0";
            visibleContainer.style.right = "0";
            outerDiv.appendChild(visibleContainer);
          }
          visibleContainer.style.top = (startIndex * rowHeight) + "px";
          visibleContainer.innerHTML = ""; // clear current content

          // Render each visible row.
          for (let i = startIndex; i < endIndex; i++) {
            const node = nodes[i];
            const row = document.createElement("div");
            row.style.height = rowHeight + "px";
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.borderBottom = "1px solid #ccc";
            row.style.padding = "0 8px";

            // Object tag (e.g. BLOCK, LINE, SECTION etc.)
            const typeSpan = document.createElement("span");
            typeSpan.textContent = node.type || "";
            typeSpan.style.flex = "1";

            // Data size (computed via computeDataSize)
            const dataSizeSpan = document.createElement("span");
            dataSizeSpan.textContent = this.myTreeGrid.computeDataSize(node);
            dataSizeSpan.style.width = "80px";
            dataSizeSpan.style.textAlign = "right";
            dataSizeSpan.style.marginRight = "8px";

            // "Show In Tree" button
            const showButton = document.createElement("button");
            showButton.textContent = "Show In Tree";
            showButton.addEventListener("click", () => {
              // Close the Object Size dialog.
              document.getElementById("objectSizeOverlay").style.display = "none";

              if (node.handle) {
                // Navigate using the handle if available.
                this.handleLinkToHandle(node.handle);
              } else {
                // Use the starting line number to locate the item.
                const targetLine = node.line;
                const flatData = this.myTreeGrid.flatData;
                const targetItem = flatData.find(item => Number(item.node.line) === Number(targetLine));

                if (targetItem) {
                  // Determine the row index.
                  const targetIndex = flatData.indexOf(targetItem);
                  const itemHeight = this.myTreeGrid.itemHeight;

                  // Calculate the row's top and bottom positions.
                  const rowTop = targetIndex * itemHeight;
                  const rowBottom = rowTop + itemHeight;

                  // Get current scroll position and container height.
                  const containerScrollTop = this.treeViewContainer.scrollTop;
                  const containerHeight = this.treeViewContainer.clientHeight;

                  // If the target row is not completely visible, adjust the scroll position.
                  if (rowTop < containerScrollTop || rowBottom > containerScrollTop + containerHeight) {
                    this.treeViewContainer.scrollTop = rowTop;
                  }

                  // Optionally, highlight the row.
                  const element = this.treeViewContent.querySelector(`[data-id="${targetItem.node.id}"]`);
                  if (element) {
                    element.style.backgroundColor = "yellow";
                    setTimeout(() => { element.style.backgroundColor = ""; }, 2000);
                  }
                } else {
                  alert("Could not locate an object starting at line " + targetLine);
                }
              }
            });


            row.appendChild(typeSpan);
            row.appendChild(dataSizeSpan);
            row.appendChild(showButton);
            visibleContainer.appendChild(row);
          }
        };

        // Attach scroll event for virtualization.
        container.onscroll = updateView;
        updateView();
      }
      
      updateBlocksOverlay() {
        const activeTab = this.getActiveTab();
        if (!activeTab) {
          document.getElementById("overlayBlocksContent").innerHTML = "No DXF data loaded.";
          return;
        }

        // Build a dictionary of block definitions using BLOCK nodes (group code 2 for block name)
        let blocksDict = {};
        function traverseForBlocks(nodes) {
          nodes.forEach(node => {
            if (!node.isProperty && node.type && node.type.toUpperCase() === "BLOCK") {
              let blockName = "";
              if (node.properties && node.properties.length) {
                node.properties.forEach(prop => {
                  if (Number(prop.code) === 2) {
                    blockName = prop.value;
                  }
                });
              }
              if (blockName) {
                blocksDict[blockName] = { block: node, inserts: [] };
              }
            }
            if (node.children && node.children.length > 0) {
              traverseForBlocks(node.children);
            }
          });
        }
        activeTab.originalTreeData.forEach(node => traverseForBlocks([node]));

        // Traverse the tree to collect all INSERT nodes
        function traverseForInserts(nodes) {
          nodes.forEach(node => {
            if (!node.isProperty && node.type && node.type.toUpperCase() === "INSERT") {
              let insertBlockName = "";
              let layer = "";
              if (node.properties && node.properties.length) {
                node.properties.forEach(prop => {
                  if (Number(prop.code) === 2) {
                    insertBlockName = prop.value;
                  }
                  if (Number(prop.code) === 8) {
                    layer = prop.value;
                  }
                });
              }
              if (insertBlockName) {
                if (!blocksDict[insertBlockName]) {
                  blocksDict[insertBlockName] = { block: null, inserts: [] };
                }
                blocksDict[insertBlockName].inserts.push({ insert: node, layer: layer });
              }
            }
            if (node.children && node.children.length > 0) {
              traverseForInserts(node.children);
            }
          });
        }
        activeTab.originalTreeData.forEach(node => traverseForInserts([node]));

        // Helper function to render nested INSERTs (if an INSERT node contains its own INSERT children)
        function renderNestedInserts(node) {
          let nestedHtml = "";
          if (node.children && node.children.length > 0) {
            let childInserts = node.children.filter(child => child.type && child.type.toUpperCase() === "INSERT");
            if (childInserts.length > 0) {
              nestedHtml += `<ul>`;
              childInserts.forEach(child => {
                let childLayer = "";
                if (child.properties && child.properties.length) {
                  child.properties.forEach(prop => {
                    if (Number(prop.code) === 8) {
                      childLayer = prop.value;
                    }
                  });
                }
                nestedHtml += `<li>Nested Insert at line: ${child.line} on layer: ${childLayer}`;
                if (child.handle) {
                  nestedHtml += ` <a href="#" onclick="window.app.handleLinkToHandle('${child.handle}'); document.getElementById('blocksOverlay').style.display='none'; return false;">Show In Tree</a>`;
                }
                nestedHtml += renderNestedInserts(child);
                nestedHtml += `</li>`;
              });
              nestedHtml += `</ul>`;
            }
          }
          return nestedHtml;
        }

        // Build the HTML output
        let html = "";
        for (let blockName in blocksDict) {
          let entry = blocksDict[blockName];
          html += `<h3>Block: ${blockName}</h3>`;
          if (entry.block) {
            html += `<p>Defined at line: ${entry.block.line}`;
            if (entry.block.handle) {
              html += ` <a href="#" onclick="window.app.handleLinkToHandle('${entry.block.handle}'); document.getElementById('blocksOverlay').style.display='none'; return false;">Show In Tree</a>`;
            }
            html += `</p>`;
          } else {
            html += `<p>Block definition not found.</p>`;
          }
          if (entry.inserts.length > 0) {
            html += `<ul>`;
            entry.inserts.forEach(ins => {
              html += `<li>Insert at line: ${ins.insert.line} on layer: ${ins.layer}`;
              if (ins.insert.handle) {
                html += ` <a href="#" onclick="window.app.handleLinkToHandle('${ins.insert.handle}'); document.getElementById('blocksOverlay').style.display='none'; return false;">Show In Tree</a>`;
              }
              html += renderNestedInserts(ins.insert);
              html += `</li>`;
            });
            html += `</ul>`;
          } else {
            html += `<p>No inserts found for this block.</p>`;
          }
        }
        document.getElementById("overlayBlocksContent").innerHTML = html;
      }
      
      showInTree(node) {
        if (node.handle) {
          // Navigate using the handle if available.
          this.handleLinkToHandle(node.handle);
        } else {
          // Use the starting line number to locate the item.
          const targetLine = node.line;
          const flatData = this.myTreeGrid.flatData;
          const targetItem = flatData.find(item => Number(item.node.line) === Number(targetLine));
          if (targetItem) {
            // Determine the row index.
            const targetIndex = flatData.indexOf(targetItem);
            const itemHeight = this.myTreeGrid.itemHeight;
            // Calculate the row's top and bottom positions.
            const rowTop = targetIndex * itemHeight;
            const rowBottom = rowTop + itemHeight;
            // Get current scroll position and container height.
            const containerScrollTop = this.treeViewContainer.scrollTop;
            const containerHeight = this.treeViewContainer.clientHeight;
            // If the target row is not completely visible, adjust the scroll position.
            if (rowTop < containerScrollTop || rowBottom > containerScrollTop + containerHeight) {
              this.treeViewContainer.scrollTop = rowTop;
            }
            // Highlight the row.
            const element = this.treeViewContent.querySelector(`[data-id="${targetItem.node.id}"]`);
            if (element) {
              element.style.backgroundColor = "yellow";
              setTimeout(() => { element.style.backgroundColor = ""; }, 2000);
            }
          } else {
            alert("Could not locate an object starting at line " + targetLine);
          }
        }
      }
      
      showInTreeById(nodeId, nodeLine) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        const node = this.dxfParser.findNodeByIdIterative(activeTab.originalTreeData, nodeId);
        if (node) {
          // Close the overlays that initiated this action.
          document.getElementById("lineTypesOverlay").style.display = "none";
          document.getElementById("textsOverlay").style.display = "none";
          // Navigate to and highlight the node.
          this.showInTree(node);
        } else {
          alert("Node not found");
        }
      }
      
      updateLineTypes() {
        const activeTab = this.getActiveTab();
        if (!activeTab) {
          document.getElementById("overlayLineTypesContent").innerHTML = "<p>No DXF data loaded.</p>";
          return;
        }
        let defined = {};
        let used = {};

        function traverse(nodes) {
          nodes.forEach(node => {
            if (node.type && node.type.toUpperCase() === "LTYPE") {
              let ltName = "";
              if (node.properties) {
                node.properties.forEach(prop => {
                  if (Number(prop.code) === 2) {
                    ltName = prop.value;
                  }
                });
              }
              if (ltName) {
                if (!defined[ltName]) {
                  defined[ltName] = node;
                }
              }
            } else {
              if (node.properties) {
                node.properties.forEach(prop => {
                  if (Number(prop.code) === 6) {
                    let lt = prop.value;
                    if (lt && !used[lt]) {
                      used[lt] = node;
                    }
                  }
                });
              }
            }
            if (node.children && node.children.length > 0) {
              traverse(node.children);
            }
          });
        }
        traverse(activeTab.originalTreeData);

        let allTypes = new Set([...Object.keys(defined), ...Object.keys(used)]);
        let html = "";
        if (allTypes.size === 0) {
          html = "<p>No linetypes found.</p>";
        } else {
          html += "<ul>";
          allTypes.forEach(lt => {
            let node = defined[lt] ? defined[lt] : used[lt];
            let origin = defined[lt] ? "Defined" : "Used Only";
            html += `<li>${lt} (${origin}) - 
                     <button onclick="window.app.showInTreeById('${node.id}', ${node.line})">Show In Tree</button>
                     </li>`;
          });
          html += "</ul>";
        }
        document.getElementById("overlayLineTypesContent").innerHTML = html;
      }
      
      /**
       * Deciphers an MTEXT string by replacing DXF formatting codes with HTML
       * and also returns a detailed breakdown of each code encountered.
       *
       * Supported MTEXT codes in this example:
       *   • \P  : Paragraph break (inserts a new paragraph)
       *   • \~  : Non‑breaking space
       *   • \\  : Literal backslash (protected)
       *   • \L  : Begin underline
       *   • \l  : End underline
       *   • \O  : Begin overline
       *   • \o  : End overline
       *   • \T  : Text style toggle (ignored)
       *   • \H<number>x : Set text height (e.g. \H12.5x means height 12.5)
       *   • \W<number>x : Set width factor (e.g. \W0.8x means width factor 0.8)
       *   • \A<number>; : Set text angle in degrees (e.g. \A45; means 45° rotation)
       *   • \S<numerator>;<denom>; : Fraction formatting (replaced with a fraction display)
       *
       * @param {string} mtext - The raw MTEXT string from the DXF.
       * @returns {string} A combined string that shows the deciphered (HTML-formatted)
       *                   text and a breakdown of each formatting code.
       */
      decipherMTextFormatting(mtext) {
        if (!mtext) return "";

        // Save the original text for reference.
        const originalText = mtext;

        // Protect any literal backslashes (i.e. "\\" becomes a placeholder).
        mtext = mtext.replace(/\\\\/g, "%%BACKSLASH%%");

        // Array to collect breakdown info for each formatting code encountered.
        let breakdown = [];

        // Replace paragraph breaks (\P) with two <br/> tags.
        mtext = mtext.replace(/\\P/g, function(match) {
          breakdown.push({
            code: "\\P",
            description: "Paragraph break – starts a new paragraph",
            replacement: "<br/><br/>",
            original: match
          });
          return "<br/><br/>";
        });

        // Replace non-breaking space (\~) with HTML non‑breaking space.
        mtext = mtext.replace(/\\~/g, function(match) {
          breakdown.push({
            code: "\\~",
            description: "Non‑breaking space",
            replacement: "&nbsp;",
            original: match
          });
          return "&nbsp;";
        });

        // Underline on (\L) and off (\l)
        mtext = mtext.replace(/\\L/g, function(match) {
          breakdown.push({
            code: "\\L",
            description: "Turn on underline formatting",
            replacement: "<u>",
            original: match
          });
          return "<u>";
        });
        mtext = mtext.replace(/\\l/g, function(match) {
          breakdown.push({
            code: "\\l",
            description: "Turn off underline formatting",
            replacement: "</u>",
            original: match
          });
          return "</u>";
        });

        // Overline on (\O) and off (\o)
        mtext = mtext.replace(/\\O/g, function(match) {
          breakdown.push({
            code: "\\O",
            description: "Turn on overline formatting",
            replacement: "<span style='text-decoration: overline;'>",
            original: match
          });
          return "<span style='text-decoration: overline;'>";
        });
        mtext = mtext.replace(/\\o/g, function(match) {
          breakdown.push({
            code: "\\o",
            description: "Turn off overline formatting",
            replacement: "</span>",
            original: match
          });
          return "</span>";
        });

        // Text style toggle (\T) is not rendered (ignored).
        mtext = mtext.replace(/\\T/g, function(match) {
          breakdown.push({
            code: "\\T",
            description: "Text style toggle (ignored in this implementation)",
            replacement: "",
            original: match
          });
          return "";
        });

        // Text height (\H<number>x) – the numeric value sets the text height.
        mtext = mtext.replace(/\\H([\d\.]+)x?/g, function(match, p1) {
          breakdown.push({
            code: "\\H" + p1 + "x",
            description: "Set text height to " + p1,
            replacement: "",
            original: match
          });
          // In the formatted text output we simply remove the height command.
          return "";
        });

        // Width factor (\W<number>x) – the numeric value sets the width factor.
        mtext = mtext.replace(/\\W([\d\.]+)x?/g, function(match, p1) {
          breakdown.push({
            code: "\\W" + p1 + "x",
            description: "Set width factor to " + p1,
            replacement: "",
            original: match
          });
          return "";
        });

        // Text angle (\A<number>;) – sets the rotation angle in degrees.
        mtext = mtext.replace(/\\A(-?[\d\.]+);/g, function(match, p1) {
          breakdown.push({
            code: "\\A" + p1 + ";",
            description: "Set text angle to " + p1 + " degrees",
            replacement: "",
            original: match
          });
          return "";
        });

        // Fraction formatting (\S<numerator>;<denom>;) – display as a fraction.
        mtext = mtext.replace(/\\S([^;]+);([^;]+);/g, function(match, num, den) {
          breakdown.push({
            code: "\\S" + num + ";" + den + ";",
            description: "Fraction formatting – numerator: " + num + ", denominator: " + den,
            replacement: "<sup>" + num + "</sup>&frasl;<sub>" + den + "</sub>",
            original: match
          });
          return "<sup>" + num + "</sup>&frasl;<sub>" + den + "</sub>";
        });

        // Restore literal backslashes.
        mtext = mtext.replace(/%%BACKSLASH%%/g, "\\");

        // Build a formatted breakdown string.
        let breakdownText = "MTEXT Formatting Breakdown:\n";
        breakdown.forEach(item => {
          breakdownText += `${item.code} : ${item.description}\n`;
        });

        // Combine the deciphered (formatted) text with the breakdown.
        let result =
          "Original MTEXT Value:\n" + originalText + "\n\n" +
          "Deciphered Text (HTML):\n" + mtext + "\n\n" +
          breakdownText;

        return result;
      }
      
      decipherMText(nodeId) {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        const node = this.dxfParser.findNodeByIdIterative(activeTab.originalTreeData, nodeId);
        if (!node) {
          alert("MTEXT node not found");
          return;
        }
        // Assume that group code 1 holds the raw MTEXT string.
        let rawText = "";
        node.properties.forEach(prop => {
          if (Number(prop.code) === 1) {
            rawText = prop.value;
          }
        });
        // Call the helper function to decipher the MTEXT formatting.
        const deciphered = decipherMTextFormatting(rawText);
        // You might want to show the deciphered details in a dialog.
        // For simplicity, we use alert here.
        alert("Deciphered MTEXT:\n\n" + deciphered);
      }
      
      toggleDecipherDetails(nodeId) {
        const detailsElem = document.getElementById(`deciphered-${nodeId}`);
        if (detailsElem) {
          detailsElem.style.display = (detailsElem.style.display === "none") ? "block" : "none";
        }
      }
      
      updateTexts() {
        const activeTab = this.getActiveTab();
        if (!activeTab) {
          document.getElementById("overlayTextsContent").innerHTML = "<p>No DXF data loaded.</p>";
          return;
        }
        let texts = [];
        function traverse(nodes) {
          nodes.forEach(node => {
            if (node.type && (node.type.toUpperCase() === "TEXT" || node.type.toUpperCase() === "MTEXT")) {
              texts.push(node);
            }
            if (node.children && node.children.length > 0) {
              traverse(node.children);
            }
          });
        }
        traverse(activeTab.originalTreeData);

        let html = "";
        if (texts.length === 0) {
          html = "<p>No text objects found.</p>";
        } else {
          html += "<ul>";
          texts.forEach(node => {
            let txt = "";
            if (node.properties) {
              node.properties.forEach(prop => {
                if (Number(prop.code) === 1) {
                  txt = prop.value;
                }
              });
            }
            html += `<li>${node.type} (Line ${node.line}) - Text: ${txt} 
                     <button onclick="window.app.showInTreeById('${node.id}', ${node.line})">Show In Tree</button>`;
            // For MTEXT entities, add a toggle button and hidden details area.
            if (node.type.toUpperCase() === "MTEXT") {
              html += ` <button class="toggle-details" onclick="window.app.toggleDecipherDetails('${node.id}')">
                          Show Deciphered Details
                        </button>
                        <pre id="deciphered-${node.id}" style="display:none; background:#f9f9f9; border:1px solid #eee; padding:8px;">
            Deciphered Text:
            ${window.app.decipherMTextFormatting(txt)}
                        </pre>`;
            }
            html += `</li>`;
          });
          html += "</ul>";
        }
        document.getElementById("overlayTextsContent").innerHTML = html;
      }

      searchDxfTree(nodes, objectType, searchText, exact, searchCode) {
        let results = [];
        nodes.forEach(node => {
          // If an object type is provided, only consider nodes of that type.
          if (objectType) {
            if (node.type && node.type.toLowerCase() === objectType.toLowerCase()) {
              // If no code or data is provided, return the object itself.
              if (!searchCode && !searchText) {
                results.push({ line: node.line, data: node.type });
              } else if (node.properties && node.properties.length > 0) {
                node.properties.forEach(prop => {
                  // If a code is provided, only consider properties with that code.
                  if (searchCode) {
                    if (String(prop.code) === searchCode) {
                      if (searchText) {
                        // When both code and data are provided, check data only on properties with the matching code.
                        const isMatch = exact
                          ? prop.value === searchText
                          : prop.value.toLowerCase().includes(searchText.toLowerCase());
                        if (isMatch) {
                          results.push({ line: prop.line, data: prop.value });
                        }
                      } else {
                        // If only code is provided, add the property.
                        results.push({ line: prop.line, data: prop.value });
                      }
                    }
                  } else if (searchText) {
                    // If no code is provided but data is, check all properties.
                    const isMatch = exact
                      ? prop.value === searchText
                      : prop.value.toLowerCase().includes(searchText.toLowerCase());
                    if (isMatch) {
                      results.push({ line: prop.line, data: prop.value });
                    }
                  }
                });
              }
            }
          } else {
            // If no object type is provided, you can implement similar logic for all nodes.
            if (node.properties && node.properties.length > 0) {
              node.properties.forEach(prop => {
                if (searchCode) {
                  if (String(prop.code) === searchCode) {
                    if (searchText) {
                      const isMatch = exact
                        ? prop.value === searchText
                        : prop.value.toLowerCase().includes(searchText.toLowerCase());
                      if (isMatch) {
                        results.push({ line: prop.line, data: prop.value });
                      }
                    } else {
                      results.push({ line: prop.line, data: prop.value });
                    }
                  }
                } else if (searchText) {
                  const isMatch = exact
                    ? prop.value === searchText
                    : prop.value.toLowerCase().includes(searchText.toLowerCase());
                  if (isMatch) {
                    results.push({ line: prop.line, data: prop.value });
                  }
                }
              });
            }
          }
          if (node.children && node.children.length > 0) {
            results = results.concat(
              this.searchDxfTree(node.children, objectType, searchText, exact, searchCode)
            );
          }
        });
        return results;
      }

      openFileTab(file, targetLine) {
        // Close the batch results overlay.
        document.getElementById("batchProcessingOverlay").style.display = "none";

        // Check if a tab for this file already exists (using file.name as the identifier).
        let existingTab = this.tabs.find(tab => tab.name === file.name);
        if (existingTab) {
          // Switch to that tab.
          this.activeTabId = existingTab.id;
          this.updateTabUI();
          this.myTreeGrid.setData(existingTab.currentTreeData);
          // Delay scrolling until after the tab is rendered.
          setTimeout(() => {
            this.scrollToLineAfterTabOpen(targetLine);
          }, 300);
        } else {
          // File not loaded yet: load it as with manual file parsing.
          const reader = new FileReader();
          reader.onload = (event) => {
            const text = event.target.result;
            const objects = this.dxfParser.parse(text);
            const newTab = {
              id: Date.now() + Math.random(),
              name: file.name,
              originalTreeData: objects,
              currentTreeData: objects,
              codeSearchTerms: [],
              dataSearchTerms: [],
              currentSortField: "line",
              currentSortAscending: true,
              minLine: null,
              maxLine: null,
              dataExact: false,
              dataCase: false,
              navigationHistory: [],
              currentHistoryIndex: -1
            };
            this.tabs.push(newTab);
            this.activeTabId = newTab.id;
            this.updateTabUI();
            this.myTreeGrid.setData(newTab.currentTreeData);
            // Delay scrolling until after the new tab is rendered.
            setTimeout(() => {
              this.scrollToLineAfterTabOpen(targetLine);
            }, 300);
          };
          reader.readAsText(file, "ascii");
        }
      }

      handleBatchProcess() {
        const directoryInput = document.getElementById("directoryInput");
        const files = directoryInput.files;
        if (!files || files.length === 0) {
          alert("Please select a directory containing DXF files.");
          return;
        }

        // Existing search inputs (if any)
        const objectType = document.getElementById("batchObjectType").value.trim();
        const searchText = document.getElementById("batchSearchText").value.trim();
        const searchCode = document.getElementById("batchSearchCode").value.trim();
        const searchMode = document.querySelector('input[name="batchSearchMode"]:checked').value;
        const exact = (searchMode === "exact");

        // Get JS query (populated from the predefined template dropdown or manually entered)
        const jsQuery = document.getElementById("batchJsQuery").value.trim();
        if (!objectType && !searchText && !searchCode && !jsQuery) {
          alert("Please enter search text, a DXF code, or a JS query.");
          return;
        }

        const now = new Date();
        const tabTitle = "Search " + now.toLocaleTimeString();
        const tabId = this.batchDataGrid.addTab(tabTitle);
        const filesArray = Array.from(files);
        const progressBar = document.getElementById("batchProgress");
        progressBar.style.display = "block";

        // Pre-compile the JS query once if provided.
        let queryFn = null;
        if (jsQuery) {
          try {
            queryFn = new Function("return (" + jsQuery + ");")();
          } catch (e) {
            console.error("Error compiling JS query:", e);
            alert("Invalid JS query: " + e.message);
            progressBar.style.display = "none";
            return;
          }
        }

        const processFile = async (file) => {
          if (!file.name.toLowerCase().endsWith(".dxf")) return;
          try {
            const dxfObjects = await this.parseFileStream(file);
            let matches = [];
            if (queryFn) {
              // Use the pre-compiled function in the hot loop.
              const searchJs = (nodes) => {
                nodes.forEach((node) => {
                  if (queryFn(node)) {
                    matches.push({ line: node.line, data: node.type });
                  }
                  if (node.children && node.children.length > 0) {
                    searchJs(node.children);
                  }
                });
              };
              searchJs(dxfObjects);
            } else {
              // Fallback to your existing simple search logic.
              matches = this.searchDxfTree(dxfObjects, objectType, searchText, exact, searchCode);
            }
            matches.forEach(match => {
              this.batchDataGrid.addRow(tabId, {
                file: file.webkitRelativePath || file.name,
                fileObject: file,
                line: match.line,
                data: match.data
              });
            });
          } catch (err) {
            console.error("Error processing file: " + file.name, err);
          }
        };

        const processAllFiles = async () => {
          for (let i = 0; i < filesArray.length; i++) {
            await processFile(filesArray[i]);
            progressBar.value = ((i + 1) / filesArray.length) * 100;
          }
          progressBar.value = 0;
          progressBar.style.display = "none";
        };

        processAllFiles();
      }

      downloadBatchResultsAsExcel() {
        const workbook = XLSX.utils.book_new();
        const tabs = this.batchDataGrid.getAllTabs();
        Object.keys(tabs).forEach((tabId, idx) => {
          const tabData = tabs[tabId];
          const ws_data = [
            ["#", "File (Relative Path)", "Line", "Data"]
          ];
          tabData.rows.forEach((row, index) => {
            ws_data.push([index + 1, row.file, row.line, row.data]);
          });
          const worksheet = XLSX.utils.aoa_to_sheet(ws_data);
          const numCols = ws_data[0].length;
          const range = "A1:" + XLSX.utils.encode_col(numCols - 1) + ws_data.length;
          worksheet["!autofilter"] = { ref: range };
          const sheetName = `Results ${idx + 1}`;
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        });
        XLSX.writeFile(workbook, "batch_results.xlsx");
      }

      downloadTreeAsExcel() {
        const workbook = XLSX.utils.book_new();
        const ws_data = [["Line", "Code", "Data", "Object Count", "Data Size"]];
        this.myTreeGrid.flatData.forEach(({ node, level }) => {
          const line = node.line || "";
          let codeVal = "";
          if (node.isProperty || node.isEndMarker) {
            codeVal = node.code;
          } else if ((node.properties && node.properties.length) || (node.children && node.children.length)) {
            codeVal = "0";
          } else {
            codeVal = "";
          }
          let dataVal = "";
          if (node.isProperty) {
            dataVal = node.data;
          } else {
            dataVal = node.type || "";
          }
          dataVal = " ".repeat(level * 2) + dataVal;
          let objectCount = "";
          if (!node.isProperty && node.children && node.children.length) {
            objectCount = this.myTreeGrid.computeObjectCount(node);
          }
          const dataSize = this.myTreeGrid.computeDataSize(node);
          ws_data.push([line, codeVal, dataVal, objectCount, dataSize]);
        });
        const worksheet = XLSX.utils.aoa_to_sheet(ws_data);
        const numCols = ws_data[0].length;
        const range = "A1:" + XLSX.utils.encode_col(numCols - 1) + ws_data.length;
        worksheet["!autofilter"] = { ref: range };
        XLSX.utils.book_append_sheet(workbook, worksheet, "Tree");
        XLSX.writeFile(workbook, "tree_data.xlsx");
      }
 
      // Create a simple hash from an array of properties.
      hashProps(props = []) {
        return props.map(p => `${p.code}:${p.value}`).join("|");
      }

      // Compute a unique key for a node. Use the node’s handle if available.
      makeKey(node) {
        if (node.handle) return node.handle;
        return `${node.type}_${node.line}_${this.hashProps(node.properties)}`;
      }

      // Diff two arrays of DXF properties.
      // Returns an object with added, removed, and modified properties (or null if no differences).
      diffProperties(oldProps = [], newProps = []) {
        const diffs = { added: [], removed: [], modified: [] };
        const oldMap = new Map();
        oldProps.forEach(prop => oldMap.set(prop.code, prop.value));
        const newMap = new Map();
        newProps.forEach(prop => newMap.set(prop.code, prop.value));
        // Check for removed or modified properties.
        oldMap.forEach((oldVal, code) => {
          if (!newMap.has(code)) {
            diffs.removed.push({ code, oldVal });
          } else {
            const newVal = newMap.get(code);
            if (oldVal !== newVal) {
              diffs.modified.push({ code, oldVal, newVal });
            }
          }
        });
        // Check for added properties.
        newMap.forEach((newVal, code) => {
          if (!oldMap.has(code)) {
            diffs.added.push({ code, newVal });
          }
        });
        return (diffs.added.length || diffs.removed.length || diffs.modified.length)
          ? diffs
          : null;
      }

      // Helper to check if a child diff object has any differences.
      hasAnyDiff(childDiff) {
        return childDiff.added.length > 0 ||
               childDiff.removed.length > 0 ||
               childDiff.modified.length > 0;
      }

      // Recursively diff two arrays of DXF nodes.
      // Returns an object with arrays: added, removed, and modified nodes.
      diffDxfTrees(oldNodes, newNodes) {
        const diff = { added: [], removed: [], modified: [] };

        // Build maps for fast lookup.
        const oldMap = new Map();
        oldNodes.forEach(node => {
          oldMap.set(this.makeKey(node), node);
        });
        const newMap = new Map();
        newNodes.forEach(node => {
          newMap.set(this.makeKey(node), node);
        });

        // Process nodes in the old set.
        oldMap.forEach((oldNode, key) => {
          if (!newMap.has(key)) {
            diff.removed.push(oldNode);
          } else {
            const newNode = newMap.get(key);
            const propDiff = this.diffProperties(oldNode.properties, newNode.properties);
            const childDiff = this.diffDxfTrees(oldNode.children || [], newNode.children || []);
            if (propDiff || this.hasAnyDiff(childDiff)) {
              diff.modified.push({ key, old: oldNode, new: newNode, propDiff, childDiff });
            }
          }
        });

        // Process nodes that appear only in newNodes.
        newMap.forEach((newNode, key) => {
          if (!oldMap.has(key)) {
            diff.added.push(newNode);
          }
        });

        return diff;
      }

      // -------------------------------
      // Diff Visualization Methods
      // -------------------------------

      // Render a table showing differences in properties.
      renderPropDiff(propDiff) {
        let html = `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th>DXF Code</th>
              <th>Old Value</th>
              <th>New Value</th>
            </tr>
          </thead>
          <tbody>`;
        propDiff.removed.forEach(item => {
          html += `<tr style="background-color:#ffe6e6;">
            <td>${item.code}</td>
            <td>${item.oldVal}</td>
            <td>--</td>
          </tr>`;
        });
        propDiff.added.forEach(item => {
          html += `<tr style="background-color:#e6ffe6;">
            <td>${item.code}</td>
            <td>--</td>
            <td>${item.newVal}</td>
          </tr>`;
        });
        propDiff.modified.forEach(item => {
          html += `<tr style="background-color:#ffffe6;">
            <td>${item.code}</td>
            <td>${item.oldVal}</td>
            <td>${item.newVal}</td>
          </tr>`;
        });
        html += `</tbody></table>`;
        return html;
      }

      /**
       * Compute a diff between oldText and newText.
       * If full is false then unchanged blocks longer than 2*context lines
       * are collapsed to only show the first and last 'context' lines.
       * A collapsed marker is rendered that calls expandDiffView() when clicked.
       */
      computeLineDiff(oldText, newText, context = 3, full = false) {
        // Save texts globally so we can re‑render when the user expands.
        gOldText = oldText;
        gNewText = newText;

        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        const n = oldLines.length, m = newLines.length;

        // Build a DP table for the longest common subsequence.
        const dp = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
        for (let i = n - 1; i >= 0; i--) {
          for (let j = m - 1; j >= 0; j--) {
            if (oldLines[i] === newLines[j]) {
              dp[i][j] = dp[i + 1][j + 1] + 1;
            } else {
              dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
          }
        }

        // Generate the full diff as an array of diff objects.
        let i = 0, j = 0;
        const diffLines = [];
        while (i < n && j < m) {
          if (oldLines[i] === newLines[j]) {
            diffLines.push({ type: 'equal', text: oldLines[i] });
            i++; j++;
          } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            diffLines.push({ type: 'delete', text: oldLines[i] });
            i++;
          } else {
            diffLines.push({ type: 'insert', text: newLines[j] });
            j++;
          }
        }
        while (i < n) {
          diffLines.push({ type: 'delete', text: oldLines[i] });
          i++;
        }
        while (j < m) {
          diffLines.push({ type: 'insert', text: newLines[j] });
          j++;
        }

        // If we want the collapsed view, process the diffLines to collapse long blocks.
        let displayLines = [];
        if (full) {
          displayLines = diffLines;
        } else {
          let idx = 0;
          while (idx < diffLines.length) {
            if (diffLines[idx].type === 'equal') {
              let start = idx;
              while (idx < diffLines.length && diffLines[idx].type === 'equal') {
                idx++;
              }
              let end = idx;
              // If there are more than 2*context equal lines, collapse the middle.
              if (end - start > 2 * context) {
                // Show first context lines.
                for (let k = start; k < start + context; k++) {
                  displayLines.push(diffLines[k]);
                }
                const hiddenCount = end - start - 2 * context;
                // Add a collapsed marker.
                displayLines.push({
                  type: 'collapsed',
                  text: `... ${hiddenCount} unchanged lines ... (click to expand)`
                });
                // Show last context lines.
                for (let k = end - context; k < end; k++) {
                  displayLines.push(diffLines[k]);
                }
              } else {
                for (let k = start; k < end; k++) {
                  displayLines.push(diffLines[k]);
                }
              }
            } else {
              displayLines.push(diffLines[idx]);
              idx++;
            }
          }
        }

        // Build the HTML string.
        let html = '<pre style="font-family: monospace;">';
        displayLines.forEach(line => {
          if (line.type === 'equal') {
            html += '  ' + line.text + '\n';
          } else if (line.type === 'delete') {
            html += '<span style="background-color: #ffe6e6;">- ' + line.text + '</span>\n';
          } else if (line.type === 'insert') {
            html += '<span style="background-color: #e6ffe6;">+ ' + line.text + '</span>\n';
          } else if (line.type === 'collapsed') {
            // The collapsed marker is clickable; clicking it will expand the diff.
            html += `<span style="background-color: #f0f0f0; cursor: pointer;"
                      onclick="window.app.expandDiffView()">${line.text}</span>\n`;
          }
        });
        html += '</pre>';
        return html;
      }

      /**
       * When the user clicks a collapsed marker, re-render the diff with full context.
       */
      expandDiffView() {
        // Recompute the diff with full=true.
        const fullHtml = this.computeLineDiff(gOldText, gNewText, 3, true);
        document.getElementById("diffContent").innerHTML = fullHtml;
      }

      // Recursively render the diff object as HTML.
      // Added nodes appear in green, removed nodes in red, and modified nodes in yellow.
      renderDiffHtml(diff) {
        let html = `<h3>DXF Diff Results</h3>`;

        // Added nodes section.
        html += `<div class="diff-section added" style="background-color:#e6ffe6; padding:10px; margin:10px 0;">
          <h4>Added Nodes</h4>`;
        if (diff.added.length === 0) {
          html += `<p>None</p>`;
        } else {
          html += `<ul>`;
          diff.added.forEach(node => {
            html += `<li><strong>${node.type}</strong> (Line ${node.line})</li>`;
          });
          html += `</ul>`;
        }
        html += `</div>`;

        // Removed nodes section.
        html += `<div class="diff-section removed" style="background-color:#ffe6e6; padding:10px; margin:10px 0;">
          <h4>Removed Nodes</h4>`;
        if (diff.removed.length === 0) {
          html += `<p>None</p>`;
        } else {
          html += `<ul>`;
          diff.removed.forEach(node => {
            html += `<li><strong>${node.type}</strong> (Line ${node.line})</li>`;
          });
          html += `</ul>`;
        }
        html += `</div>`;

        // Modified nodes section.
        html += `<div class="diff-section modified" style="background-color:#ffffe6; padding:10px; margin:10px 0;">
          <h4>Modified Nodes</h4>`;
        if (diff.modified.length === 0) {
          html += `<p>None</p>`;
        } else {
          html += `<ul>`;
          diff.modified.forEach(mod => {
            html += `<li>
              <div><strong>${mod.old.type}</strong> (Line ${mod.old.line}) was modified.</div>`;
            if (mod.old.handle) {
              html += `<div><strong>Handle:</strong> ${mod.old.handle}</div>`;
            }
            if (mod.propDiff) {
              html += `<div><em>Property differences:</em>${this.renderPropDiff(mod.propDiff)}</div>`;
            }
            {
              // Generate a line‑by‑line diff of the DXF text for the node.
              const oldSerial = this.dxfParser.serializeNode(mod.old);
              const newSerial = this.dxfParser.serializeNode(mod.new);
              const lineDiffHtml = this.computeLineDiff(oldSerial, newSerial);
              html += `<div><em>Line‑by‑line Diff:</em>${lineDiffHtml}</div>`;
            }
            if (mod.childDiff && (mod.childDiff.added.length || mod.childDiff.removed.length || mod.childDiff.modified.length)) {
              html += `<div><em>Child differences:</em>${this.renderDiffHtml(mod.childDiff)}</div>`;
            }
            html += `</li>`;
          });
          html += `</ul>`;
        }
        html += `</div>`;

        return html;
      }

      // -------------------------------
      // Updated Diff Handler Method
      // -------------------------------

      // Helper to read a file as text.
      readFile(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.onerror = err => reject(err);
          reader.readAsText(file, "ascii");
        });
      }

      // New diff handler. Reads two DXF files, computes the diff,
      // and displays the results in the #diffContent container.
      handleDiff() {
        const oldFile = document.getElementById("oldDxfInput").files[0];
        const newFile = document.getElementById("newDxfInput").files[0];
        if (!oldFile || !newFile) {
          alert("Please select both an old and a new DXF file.");
          return;
        }
        Promise.all([this.readFile(oldFile), this.readFile(newFile)])
          .then(([oldText, newText]) => {
            // Parse the DXF texts (using your existing dxfParser instance).
            const oldObjects = this.dxfParser.parse(oldText);
            const newObjects = this.dxfParser.parse(newText);
            // Compute the diff.
            const diffResult = this.diffDxfTrees(oldObjects, newObjects);
            // Render the diff HTML.
            const diffHtml = this.renderDiffHtml(diffResult);
            document.getElementById("diffContent").innerHTML = diffHtml;
          })
          .catch(err => {
            alert("Error reading files: " + err);
          });
      }

      // ====================================
      // COMPREHENSIVE DXF DIAGNOSTICS ENGINE
      // ====================================

      showDiagnosticsOverlay() {
        document.getElementById("diagnosticsOverlay").style.display = "block";
        // Reset to overview tab
        this.switchDiagnosticsTab('overview');
      }

      switchDiagnosticsTab(tabName) {
        // Update tab appearance
        document.querySelectorAll('.diagnostics-tab').forEach(tab => {
          tab.classList.remove('active');
        });
        document.querySelectorAll('.diagnostics-content').forEach(content => {
          content.classList.remove('active');
        });
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`diagnostics-${tabName}`).classList.add('active');
      }

      async runDiagnostics() {
        const activeTab = this.getActiveTab();
        if (!activeTab || !activeTab.originalTreeData || activeTab.originalTreeData.length === 0) {
          alert("Please load a DXF file first.");
          return;
        }

        // Show progress
        this.showDiagnosticsProgress();
        
        try {
          const diagnosticsEngine = new DXFDiagnosticsEngine(activeTab.originalTreeData, activeTab.fileName, this.ruleConfiguration);
          const results = await diagnosticsEngine.runFullDiagnostics((progress, message) => {
            this.updateDiagnosticsProgress(progress, message);
          });
          
          this.displayDiagnosticsResults(results);
          this.hideDiagnosticsProgress();
          
        } catch (error) {
          console.error("Diagnostics error:", error);
          console.error("Error stack:", error.stack);
          alert("Error running diagnostics: " + error.message + "\n\nCheck the browser console for detailed error information.");
          this.hideDiagnosticsProgress();
        }
      }

      showDiagnosticsProgress() {
        document.getElementById("diagnosticsProgress").style.display = "block";
        document.getElementById("diagnosticsSummary").style.display = "none";
        document.getElementById("diagnosticsTabContent").style.display = "none";
      }

      updateDiagnosticsProgress(progress, message) {
        document.getElementById("diagnosticsProgressFill").style.width = progress + "%";
        document.getElementById("diagnosticsProgressText").textContent = message;
      }

      hideDiagnosticsProgress() {
        document.getElementById("diagnosticsProgress").style.display = "none";
        document.getElementById("diagnosticsSummary").style.display = "block";
        document.getElementById("diagnosticsTabContent").style.display = "block";
      }



      updateDiagnosticsStats(stats) {
        const statsContainer = document.getElementById("diagnosticsStats");
        statsContainer.innerHTML = `
          <div class="diagnostics-stat" data-filter="all" title="Click to show all issues">
            <div class="diagnostics-stat-number">${stats.totalIssues}</div>
            <div class="diagnostics-stat-label">Total Issues</div>
          </div>
          <div class="diagnostics-stat" data-filter="critical" title="Click to filter critical issues">
            <div class="diagnostics-stat-number">${stats.criticalIssues}</div>
            <div class="diagnostics-stat-label">Critical</div>
          </div>
          <div class="diagnostics-stat" data-filter="error" title="Click to filter error issues">
            <div class="diagnostics-stat-number">${stats.errorIssues}</div>
            <div class="diagnostics-stat-label">Errors</div>
          </div>
          <div class="diagnostics-stat" data-filter="warning" title="Click to filter warning issues">
            <div class="diagnostics-stat-number">${stats.warningIssues}</div>
            <div class="diagnostics-stat-label">Warnings</div>
          </div>
          <div class="diagnostics-stat" data-filter="info" title="Click to filter info issues">
            <div class="diagnostics-stat-number">${stats.infoIssues}</div>
            <div class="diagnostics-stat-label">Info</div>
          </div>
          <div class="diagnostics-stat" data-filter="suggestion" title="Click to filter suggestions">
            <div class="diagnostics-stat-number">${stats.suggestions}</div>
            <div class="diagnostics-stat-label">Suggestions</div>
          </div>
        `;
        
        // Add click handlers for filtering
        statsContainer.querySelectorAll('.diagnostics-stat').forEach(stat => {
          stat.addEventListener('click', (e) => {
            const filterType = stat.dataset.filter;
            this.filterDiagnosticsBySeverity(filterType);
            
            // Update visual state
            statsContainer.querySelectorAll('.diagnostics-stat').forEach(s => s.classList.remove('active'));
            stat.classList.add('active');
          });
        });
      }

      updateDiagnosticsOverview(results) {
        const content = document.getElementById("diagnosticsOverviewContent");
        const summary = this.generateOverviewSummary(results);
        content.innerHTML = summary;
      }

      generateOverviewSummary(results) {
        const criticalIssues = this.getAllIssuesByType(results, 'critical');
        const errorIssues = this.getAllIssuesByType(results, 'error');
        
        let html = `<h3>Diagnostics Summary</h3>`;
        
        if (criticalIssues.length > 0) {
          html += `<div class="diagnostics-category">
            <div class="diagnostics-category-header">
              <span>Critical Issues Found (${criticalIssues.length})</span>
              <span class="category-toggle">▼</span>
            </div>
            <div class="diagnostics-category-content expanded">
              ${criticalIssues.map(issue => this.renderDiagnosticItem(issue)).join('')}
            </div>
          </div>`;
        }
        
        if (errorIssues.length > 0) {
          html += `<div class="diagnostics-category">
            <div class="diagnostics-category-header">
              <span>Error Issues Found (${errorIssues.length})</span>
              <span class="category-toggle">▼</span>
            </div>
            <div class="diagnostics-category-content expanded">
              ${errorIssues.map(issue => this.renderDiagnosticItem(issue)).join('')}
            </div>
          </div>`;
        }
        
        if (criticalIssues.length === 0 && errorIssues.length === 0) {
          html += `<div class="diagnostics-summary">
            <h4 style="color: green;">✓ No Critical or Error Issues Found</h4>
            <p>Your DXF file appears to be structurally sound. Check other tabs for warnings and suggestions.</p>
          </div>`;
        }
        
        return html;
      }

      getAllIssuesByType(results, type) {
        const allIssues = [];
        Object.values(results).forEach(category => {
          if (Array.isArray(category)) {
            allIssues.push(...category.filter(issue => issue.severity === type));
          }
        });
        return allIssues;
      }

      updateDiagnosticsStructural(issues) {
        this.updateDiagnosticsTabContent('diagnosticsStructuralContent', issues, 'Structural Issues');
      }

      updateDiagnosticsIntegrity(issues) {
        this.updateDiagnosticsTabContent('diagnosticsIntegrityContent', issues, 'Data Integrity Issues');
      }

      updateDiagnosticsRendering(issues) {
        this.updateDiagnosticsTabContent('diagnosticsRenderingContent', issues, 'Rendering Issues');
      }

      updateDiagnosticsText(issues) {
        this.updateDiagnosticsTabContent('diagnosticsTextContent', issues, 'Text Issues');
      }

      updateDiagnosticsPerformance(issues) {
        this.updateDiagnosticsTabContent('diagnosticsPerformanceContent', issues, 'Performance Issues');
      }

      updateDiagnosticsCompliance(issues) {
        this.updateDiagnosticsTabContent('diagnosticsComplianceContent', issues, 'DXF Compliance Issues');
      }

      updateDiagnosticsBestPractices(issues) {
        this.updateDiagnosticsTabContent('diagnosticsBestPracticesContent', issues, 'Best Practices');
      }

      updateDiagnosticsSecurity(issues) {
        this.updateDiagnosticsTabContent('diagnosticsSecurityContent', issues, 'Security Issues');
      }

      updateDiagnosticsTabContent(elementId, issues, title) {
        const content = document.getElementById(elementId);
        if (!issues || issues.length === 0) {
          content.innerHTML = `<div class="diagnostics-summary">
            <h4 style="color: green;">✓ No ${title} Found</h4>
            <p>No issues found in this category.</p>
          </div>`;
          return;
        }

        const categorizedIssues = this.categorizeIssues(issues);
        let html = '';
        
        Object.entries(categorizedIssues).forEach(([category, categoryIssues]) => {
          html += `<div class="diagnostics-category">
            <div class="diagnostics-category-header">
              <span>${category} (${categoryIssues.length})</span>
              <span class="category-toggle">▼</span>
            </div>
            <div class="diagnostics-category-content expanded">
              ${categoryIssues.map(issue => this.renderDiagnosticItem(issue)).join('')}
            </div>
          </div>`;
        });
        
        content.innerHTML = html;
      }

      categorizeIssues(issues) {
        const categories = {};
        issues.forEach(issue => {
          const category = issue.category || 'General';
          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push(issue);
        });
        return categories;
      }

      renderDiagnosticItem(issue) {
        const actions = issue.actions ? issue.actions.map(action => 
          `<button class="diagnostic-action-btn" onclick="window.app.handleDiagnosticAction('${action.type}', '${action.data}')">${action.label}</button>`
        ).join('') : '';

        return `<div class="diagnostic-item">
          <div class="diagnostic-severity ${issue.severity}">${issue.severity.toUpperCase()}</div>
          <div class="diagnostic-details">
            <div class="diagnostic-title">${issue.title}</div>
            <div class="diagnostic-description">${issue.description}</div>
            ${issue.location ? `<div class="diagnostic-location">Location: ${issue.location}</div>` : ''}
            ${actions ? `<div class="diagnostic-actions">${actions}</div>` : ''}
          </div>
        </div>`;
      }

      handleDiagnosticAction(actionType, actionData) {
        switch (actionType) {
          case 'navigate':
            this.navigateToNode(actionData);
            break;
          case 'highlight':
            this.highlightNode(actionData);
            break;
          case 'fix':
            this.fixIssue(actionData);
            break;
          default:
            console.log('Unknown diagnostic action:', actionType, actionData);
        }
      }

      navigateToNode(nodeId) {
        // Close diagnostics overlay and navigate to the node
        document.getElementById("diagnosticsOverlay").style.display = "none";
        
        // Find and expand the node in the tree
        const activeTab = this.getActiveTab();
        if (activeTab && activeTab.originalTreeData) {
          const node = this.dxfParser.findNodeByIdIterative(activeTab.originalTreeData, nodeId);
          if (node) {
            // Expand the path to this node
            this.expandPathToNode(activeTab.originalTreeData, nodeId);
            
            // Refresh the tree view
            activeTab.currentTreeData = activeTab.originalTreeData;
            this.myTreeGrid.setData(activeTab.currentTreeData);
            
            // Scroll to and highlight the node
            this.scrollToNode(nodeId);
          }
        }
      }

      expandPathToNode(tree, targetNodeId) {
        const findAndExpandPath = (nodes, path = []) => {
          for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const currentPath = [...path, i];
            
            if (String(node.id) === String(targetNodeId)) {
              // Found target, expand all parents in the path
              let current = tree;
              for (const index of path) {
                if (current[index]) {
                  current[index].expanded = true;
                  current = current[index].children || [];
                }
              }
              return true;
            }
            
            if (node.children && node.children.length > 0) {
              if (findAndExpandPath(node.children, currentPath)) {
                node.expanded = true;
                return true;
              }
            }
          }
          return false;
        };
        
        findAndExpandPath(tree);
      }

      scrollToNode(nodeId) {
        // Wait for the tree to render, then scroll to the node
        setTimeout(() => {
          const targetRow = document.querySelector(`[data-id="${nodeId}"]`);
          if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetRow.style.backgroundColor = '#ffeb3b';
            setTimeout(() => {
              targetRow.style.backgroundColor = '';
            }, 2000);
          }
        }, 100);
      }



      filterDiagnosticsBySeverity(severityType) {
        // Reset all checkboxes first
        ["Critical", "Error", "Warning", "Info", "Suggestion"].forEach(severity => {
          document.getElementById(`filter${severity}`).checked = false;
        });
        
        if (severityType === 'all') {
          // Check all boxes
          ["Critical", "Error", "Warning", "Info", "Suggestion"].forEach(severity => {
            document.getElementById(`filter${severity}`).checked = true;
          });
        } else {
          // Check only the selected severity
          const capitalizedType = severityType.charAt(0).toUpperCase() + severityType.slice(1);
          document.getElementById(`filter${capitalizedType}`).checked = true;
        }
        
        this.applyDiagnosticsFilters();
      }

      applyDiagnosticsFilters() {
        const searchTerm = document.getElementById("diagnosticsSearchInput").value.toLowerCase();
        const categoryFilter = document.getElementById("diagnosticsCategoryFilter").value;
        
        const severityFilters = {
          critical: document.getElementById("filterCritical").checked,
          error: document.getElementById("filterError").checked,
          warning: document.getElementById("filterWarning").checked,
          info: document.getElementById("filterInfo").checked,
          suggestion: document.getElementById("filterSuggestion").checked
        };
        
        // Apply filters to all diagnostic items
        const allItems = document.querySelectorAll('.diagnostic-item');
        let visibleCount = 0;
        
        allItems.forEach(item => {
          const severityEl = item.querySelector('.diagnostic-severity');
          const titleEl = item.querySelector('.diagnostic-title');
          const descriptionEl = item.querySelector('.diagnostic-description');
          const categoryEl = item.closest('.diagnostics-category');
          
          if (!severityEl || !titleEl || !descriptionEl) return;
          
          const severity = severityEl.textContent.toLowerCase();
          const title = titleEl.textContent.toLowerCase();
          const description = descriptionEl.textContent.toLowerCase();
          const category = categoryEl ? categoryEl.querySelector('.diagnostics-category-header span').textContent.toLowerCase() : '';
          
          // Check severity filter
          const severityMatch = severityFilters[severity];
          
          // Check search term
          const searchMatch = !searchTerm || 
            title.includes(searchTerm) || 
            description.includes(searchTerm);
          
          // Check category filter
          const categoryMatch = !categoryFilter || category.includes(categoryFilter.toLowerCase());
          
          const shouldShow = severityMatch && searchMatch && categoryMatch;
          
          if (shouldShow) {
            item.classList.remove('hidden');
            visibleCount++;
          } else {
            item.classList.add('hidden');
          }
        });
        
        // Show/hide categories based on visible items
        const categories = document.querySelectorAll('.diagnostics-category');
        categories.forEach(category => {
          const visibleItems = category.querySelectorAll('.diagnostic-item:not(.hidden)');
          if (visibleItems.length === 0) {
            category.style.display = 'none';
          } else {
            category.style.display = 'block';
          }
        });
        
        // Show "no results" message if needed
        this.updateNoResultsMessage(visibleCount);
      }

      updateNoResultsMessage(visibleCount) {
        const tabContents = document.querySelectorAll('.diagnostics-content.active');
        tabContents.forEach(content => {
          let noResultsEl = content.querySelector('.diagnostics-no-results');
          
          if (visibleCount === 0) {
            if (!noResultsEl) {
              noResultsEl = document.createElement('div');
              noResultsEl.className = 'diagnostics-no-results';
              noResultsEl.textContent = 'No issues match the current filters.';
              content.appendChild(noResultsEl);
            }
            noResultsEl.style.display = 'block';
          } else if (noResultsEl) {
            noResultsEl.style.display = 'none';
          }
        });
      }

      async exportDiagnosticsReport() {
        const activeTab = this.getActiveTab();
        if (!activeTab || !this.lastDiagnosticsResults) {
          alert("No diagnostics data available to export.");
          return;
        }

        try {
          // Create workbook
          const wb = XLSX.utils.book_new();
          
          // Summary sheet
          this.addSummarySheet(wb, this.lastDiagnosticsResults);
          
          // Individual category sheets
          const categories = [
            { key: 'structural', name: 'Structural Issues' },
            { key: 'integrity', name: 'Data Integrity' },
            { key: 'rendering', name: 'Rendering' },
            { key: 'text', name: 'Text' },
            { key: 'performance', name: 'Performance' },
            { key: 'compliance', name: 'DXF Compliance' },
            { key: 'bestPractices', name: 'Best Practices' },
            { key: 'security', name: 'Security' }
          ];
          
          categories.forEach(category => {
            if (this.lastDiagnosticsResults[category.key] && this.lastDiagnosticsResults[category.key].length > 0) {
              this.addCategorySheet(wb, category.name, this.lastDiagnosticsResults[category.key]);
            }
          });
          
          // Generate and download
          const fileName = `${activeTab.fileName || 'dxf'}_diagnostics_${new Date().toISOString().slice(0,10)}.xlsx`;
          XLSX.writeFile(wb, fileName);
          
        } catch (error) {
          console.error("Error exporting diagnostics:", error);
          alert("Error exporting diagnostics report: " + error.message);
        }
      }

      addSummarySheet(wb, results) {
        const stats = results.stats;
        const summaryData = [
          ['DXF Comprehensive Diagnostics Report'],
          ['Generated on:', new Date().toISOString()],
          ['File:', this.getActiveTab()?.fileName || 'Unknown'],
          [],
          ['Summary Statistics'],
          ['Severity Level', 'Count'],
          ['Total Issues', stats.totalIssues],
          ['Critical', stats.criticalIssues],
          ['Error', stats.errorIssues],
          ['Warning', stats.warningIssues],
          ['Info', stats.infoIssues],
          ['Suggestions', stats.suggestions],
          [],
          ['Issues by Category'],
          ['Category', 'Count']
        ];
        
        // Add category counts
        const categories = ['structural', 'integrity', 'rendering', 'text', 'performance', 'compliance', 'bestPractices', 'security'];
        categories.forEach(category => {
          const issues = results[category] || [];
          const categoryName = category.charAt(0).toUpperCase() + category.slice(1).replace(/([A-Z])/g, ' $1');
          summaryData.push([categoryName, issues.length]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(summaryData);
        
        // Style the header
        if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 16 } };
        if (ws['A5']) ws['A5'].s = { font: { bold: true, sz: 14 } };
        if (ws['A14']) ws['A14'].s = { font: { bold: true, sz: 14 } };
        
        XLSX.utils.book_append_sheet(wb, ws, 'Summary');
      }

      addCategorySheet(wb, categoryName, issues) {
        const data = [
          ['Severity', 'Title', 'Description', 'Category', 'Location']
        ];
        
        issues.forEach(issue => {
          data.push([
            issue.severity,
            issue.title,
            issue.description,
            issue.category || '',
            issue.location || ''
          ]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // Auto-width columns
        const colWidths = [
          { wch: 12 }, // Severity
          { wch: 40 }, // Title
          { wch: 60 }, // Description
          { wch: 20 }, // Category
          { wch: 20 }  // Location
        ];
        ws['!cols'] = colWidths;
        
        // Style header row
        const headerRange = XLSX.utils.decode_range(ws['!ref']);
        for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
          const cellAddr = XLSX.utils.encode_cell({ r: 0, c: col });
          if (ws[cellAddr]) {
            ws[cellAddr].s = { font: { bold: true }, fill: { fgColor: { rgb: "E0E0E0" } } };
          }
        }
        
        XLSX.utils.book_append_sheet(wb, ws, categoryName.substring(0, 31)); // Excel sheet name limit
      }

      displayDiagnosticsResults(results) {
        // Store results for export
        this.lastDiagnosticsResults = results;
        
        // Update statistics
        this.updateDiagnosticsStats(results.stats);
        
        // Update each tab with results
        this.updateDiagnosticsOverview(results);
        this.updateDiagnosticsStructural(results.structural);
        this.updateDiagnosticsIntegrity(results.integrity);
        this.updateDiagnosticsRendering(results.rendering);
        this.updateDiagnosticsText(results.text);
        this.updateDiagnosticsPerformance(results.performance);
        this.updateDiagnosticsCompliance(results.compliance);
        this.updateDiagnosticsBestPractices(results.bestPractices);
        this.updateDiagnosticsSecurity(results.security);
        
        // Apply initial filters
        setTimeout(() => this.applyDiagnosticsFilters(), 100);
      }

      generateDiagnosticsReport() {
        if (!this.lastDiagnosticsResults) {
          return "No diagnostics data available.";
        }
        
        const results = this.lastDiagnosticsResults;
        const stats = results.stats;
        
        let report = "DXF Comprehensive Diagnostics Report\n";
        report += "====================================\n\n";
        report += `Generated on: ${new Date().toISOString()}\n`;
        report += `File: ${this.getActiveTab()?.fileName || 'Unknown'}\n\n`;
        
        report += "SUMMARY STATISTICS\n";
        report += "------------------\n";
        report += `Total Issues: ${stats.totalIssues}\n`;
        report += `Critical: ${stats.criticalIssues}\n`;
        report += `Errors: ${stats.errorIssues}\n`;
        report += `Warnings: ${stats.warningIssues}\n`;
        report += `Info: ${stats.infoIssues}\n`;
        report += `Suggestions: ${stats.suggestions}\n\n`;
        
        // Add detailed issues by category
        const categories = [
          { key: 'structural', name: 'STRUCTURAL ISSUES' },
          { key: 'integrity', name: 'DATA INTEGRITY' },
          { key: 'rendering', name: 'RENDERING ISSUES' },
          { key: 'text', name: 'TEXT ISSUES' },
          { key: 'performance', name: 'PERFORMANCE' },
          { key: 'compliance', name: 'DXF COMPLIANCE' },
          { key: 'bestPractices', name: 'BEST PRACTICES' },
          { key: 'security', name: 'SECURITY' }
        ];
        
        categories.forEach(category => {
          const issues = results[category.key] || [];
          if (issues.length > 0) {
            report += `${category.name}\n`;
            report += "=".repeat(category.name.length) + "\n\n";
            
            issues.forEach((issue, index) => {
              report += `${index + 1}. [${issue.severity.toUpperCase()}] ${issue.title}\n`;
              report += `   ${issue.description}\n`;
              if (issue.location) report += `   Location: ${issue.location}\n`;
              if (issue.category) report += `   Category: ${issue.category}\n`;
              report += "\n";
            });
            report += "\n";
          }
        });
        
        return report;
      }

      // ===== RULE CONFIGURATION SYSTEM =====
      
      initializeRuleSystem() {
        this.diagnosticRules = this.getComprehensiveRuleDefinitions();
        this.ruleConfiguration = this.loadRuleConfiguration();
        this.loadProfileList();
      }

      getComprehensiveRuleDefinitions() {
        return {
          structural: {
            name: "Structural Issues",
            description: "Critical structural problems that can cause file corruption or prevent proper loading",
            rules: {
              requiredSections: {
                name: "Required Sections Check",
                description: "Verifies that essential DXF sections (HEADER, TABLES, ENTITIES) are present",
                severity: "critical",
                enabled: true,
                method: "checkRequiredSections"
              },
              sectionStructure: {
                name: "Section Structure Validation",
                description: "Checks proper section start/end markers and nesting",
                severity: "error",
                enabled: true,
                method: "checkSectionStructure"
              },
              endMarkers: {
                name: "End Markers Validation",
                description: "Ensures all sections have proper ending markers",
                severity: "error",
                enabled: true,
                method: "checkEndMarkers"
              },
              blockDefinitions: {
                name: "Block Definition Integrity",
                description: "Validates block start/end markers and structure",
                severity: "error",
                enabled: true,
                method: "checkBlockDefinitions"
              },
              tableStructure: {
                name: "Table Structure Check",
                description: "Verifies proper table definitions and entries",
                severity: "warning",
                enabled: true,
                method: "checkTableStructure"
              }
            }
          },
          integrity: {
            name: "Data Integrity",
            description: "Data corruption, invalid values, and reference problems",
            rules: {
              handleReferences: {
                name: "Handle Reference Validation",
                description: "Checks for broken or circular handle references",
                severity: "error",
                enabled: true,
                method: "checkHandleReferences"
              },
              groupCodes: {
                name: "Group Code Validation",
                description: "Validates group codes are within acceptable ranges",
                severity: "warning",
                enabled: true,
                method: "checkGroupCodes"
              },
              coordinateValues: {
                name: "Coordinate Value Check",
                description: "Detects invalid coordinate values (NaN, infinity)",
                severity: "error",
                enabled: true,
                method: "checkCoordinateValues"
              },
              textEncoding: {
                name: "Text Encoding Validation",
                description: "Checks for invalid text encoding and characters",
                severity: "warning",
                enabled: true,
                method: "checkTextEncoding"
              },
              binaryData: {
                name: "Binary Data Integrity",
                description: "Validates embedded binary data and checksums",
                severity: "warning",
                enabled: true,
                method: "checkBinaryData"
              }
            }
          },
          rendering: {
            name: "Rendering Issues",
            description: "Problems that affect visual rendering and display quality",
            rules: {
              geometryValidity: {
                name: "Geometry Validity Check",
                description: "Validates geometric entities for rendering issues",
                severity: "error",
                enabled: true,
                method: "checkGeometryValidity"
              },
              colorAndVisibility: {
                name: "Color and Visibility Check",
                description: "Detects invisible or problematic color assignments",
                severity: "warning",
                enabled: true,
                method: "checkColorAndVisibility"
              },
              viewportSettings: {
                name: "Viewport Configuration",
                description: "Validates viewport settings and scale factors",
                severity: "warning",
                enabled: true,
                method: "checkViewportSettings"
              },
              layerRendering: {
                name: "Layer Rendering Issues",
                description: "Checks layer properties affecting rendering",
                severity: "warning",
                enabled: true,
                method: "checkLayerRenderingIssues"
              },
              blockRendering: {
                name: "Block Rendering Problems",
                description: "Validates block references and insertion parameters",
                severity: "warning",
                enabled: true,
                method: "checkBlockRenderingIssues"
              },
              lineTypeRendering: {
                name: "Line Type Rendering",
                description: "Checks line type definitions and scaling",
                severity: "info",
                enabled: true,
                method: "checkLineTypeRendering"
              },
              hatchPatterns: {
                name: "Hatch Pattern Validation",
                description: "Validates hatch patterns and boundaries",
                severity: "warning",
                enabled: true,
                method: "checkHatchPatterns"
              },
              dimensionRendering: {
                name: "Dimension Rendering Check",
                description: "Checks dimension display and arrow rendering",
                severity: "warning",
                enabled: true,
                method: "checkDimensionRendering"
              },
              splineValidity: {
                name: "Spline Geometry Validation",
                description: "Validates spline control points and curves",
                severity: "warning",
                enabled: true,
                method: "checkSplineValidity"
              },
              extrusionDirections: {
                name: "Extrusion Direction Check",
                description: "Validates 3D extrusion directions and normals",
                severity: "info",
                enabled: true,
                method: "checkExtrusionDirections"
              },
              zOrderIssues: {
                name: "Z-Order and Depth Issues",
                description: "Detects overlapping entities and depth conflicts",
                severity: "info",
                enabled: true,
                method: "checkZOrderIssues"
              },
              scaleFactors: {
                name: "Scale Factor Problems",
                description: "Checks for extreme or invalid scale factors",
                severity: "warning",
                enabled: true,
                method: "checkScaleFactors"
              },
              materialProperties: {
                name: "Material and Rendering Properties",
                description: "Validates material assignments and properties",
                severity: "info",
                enabled: true,
                method: "checkMaterialProperties"
              },
              lightingIssues: {
                name: "Lighting Configuration",
                description: "Checks lighting setup and shadows",
                severity: "info",
                enabled: true,
                method: "checkLightingIssues"
              },
              transparency: {
                name: "Transparency and Alpha Issues",
                description: "Validates transparency settings and alpha values",
                severity: "info",
                enabled: true,
                method: "checkTransparencyIssues"
              }
            }
          },
          text: {
            name: "Text Issues",
            description: "Text rendering, formatting, and font-related problems",
            rules: {
              textGeometry: {
                name: "Text Geometry Validation",
                description: "Checks text positioning and size parameters",
                severity: "warning",
                enabled: true,
                method: "checkTextGeometry"
              },
              textStyles: {
                name: "Text Style Validation",
                description: "Validates text style definitions and references",
                severity: "warning",
                enabled: true,
                method: "checkTextStyles"
              },
              textFormatting: {
                name: "Text Formatting Check",
                description: "Validates basic text formatting and properties",
                severity: "warning",
                enabled: true,
                method: "checkTextFormatting"
              },
              mtextFormatting: {
                name: "MTEXT Formatting Validation",
                description: "Checks multi-line text formatting codes",
                severity: "warning",
                enabled: true,
                method: "checkMTextFormatting"
              },
              fontAvailability: {
                name: "Font Availability Check",
                description: "Validates font file references and availability",
                severity: "info",
                enabled: true,
                method: "checkFontAvailability"
              },
              textAlignment: {
                name: "Text Alignment Validation",
                description: "Checks text alignment and justification settings",
                severity: "warning",
                enabled: true,
                method: "checkTextAlignment"
              },
              textUnicode: {
                name: "Unicode and Encoding Check",
                description: "Validates Unicode characters and encoding",
                severity: "info",
                enabled: true,
                method: "checkTextUnicode"
              },
              textVisibility: {
                name: "Text Visibility Issues",
                description: "Detects invisible or hard-to-read text",
                severity: "info",
                enabled: true,
                method: "checkTextVisibility"
              },
              dimensionText: {
                name: "Dimension Text Validation",
                description: "Checks dimension text formatting and display",
                severity: "warning",
                enabled: true,
                method: "checkDimensionText"
              },
              textOverlap: {
                name: "Text Overlap Detection",
                description: "Identifies overlapping text entities",
                severity: "suggestion",
                enabled: true,
                method: "checkTextOverlap"
              },
              textReadability: {
                name: "Text Readability Analysis",
                description: "Checks text size relative to drawing scale",
                severity: "suggestion",
                enabled: true,
                method: "checkTextReadability"
              }
            }
          },
          performance: {
            name: "Performance Issues",
            description: "Problems that can affect file loading speed and memory usage",
            rules: {
              fileSize: {
                name: "File Size Analysis",
                description: "Warns about large files that may cause performance issues",
                severity: "info",
                enabled: true,
                method: "checkFileSize"
              },
              entityCount: {
                name: "Entity Count Check",
                description: "Detects excessive entity counts",
                severity: "warning",
                enabled: true,
                method: "checkEntityCount"
              },
              nestingDepth: {
                name: "Nesting Depth Analysis",
                description: "Checks for excessive nesting in blocks and groups",
                severity: "warning",
                enabled: true,
                method: "checkNestingDepth"
              },
              duplicateData: {
                name: "Duplicate Data Detection",
                description: "Identifies redundant or duplicate entities",
                severity: "suggestion",
                enabled: true,
                method: "checkDuplicateData"
              },
              unusedDefinitions: {
                name: "Unused Definition Check",
                description: "Finds unused layers, blocks, and styles",
                severity: "suggestion",
                enabled: true,
                method: "checkUnusedDefinitions"
              },
              complexGeometry: {
                name: "Complex Geometry Analysis",
                description: "Identifies overly complex geometric entities",
                severity: "info",
                enabled: true,
                method: "checkComplexGeometry"
              },
              memoryUsage: {
                name: "Memory Usage Estimation",
                description: "Estimates memory requirements for loading",
                severity: "info",
                enabled: true,
                method: "checkMemoryUsage"
              }
            }
          },
          compliance: {
            name: "DXF Compliance",
            description: "Compliance with DXF format specifications and standards",
            rules: {
              dxfVersion: {
                name: "DXF Version Compliance",
                description: "Validates DXF version and format compliance",
                severity: "warning",
                enabled: true,
                method: "checkDXFVersion"
              },
              requiredVariables: {
                name: "Required Variables Check",
                description: "Ensures essential header variables are present",
                severity: "warning",
                enabled: true,
                method: "checkRequiredVariables"
              },
              entityTypes: {
                name: "Entity Type Validation",
                description: "Validates entity types against DXF specifications",
                severity: "error",
                enabled: true,
                method: "checkEntityTypes"
              },
              propertyValues: {
                name: "Property Value Compliance",
                description: "Checks property values against valid ranges",
                severity: "warning",
                enabled: true,
                method: "checkPropertyValues"
              },
              units: {
                name: "Units and Measurement Check",
                description: "Validates unit definitions and consistency",
                severity: "info",
                enabled: true,
                method: "checkUnits"
              }
            }
          },
          bestPractices: {
            name: "Best Practices",
            description: "Recommendations for optimal DXF file organization and structure",
            rules: {
              layerUsage: {
                name: "Layer Organization",
                description: "Evaluates layer naming and organization practices",
                severity: "suggestion",
                enabled: true,
                method: "checkLayerUsage"
              },
              blockUsage: {
                name: "Block Usage Optimization",
                description: "Checks for efficient block usage and organization",
                severity: "suggestion",
                enabled: true,
                method: "checkBlockUsage"
              },
              textStyleUsage: {
                name: "Text Style Management",
                description: "Evaluates text style usage and standardization",
                severity: "suggestion",
                enabled: true,
                method: "checkTextStyles"
              },
              lineTypeUsage: {
                name: "Line Type Organization",
                description: "Checks line type definitions and usage patterns",
                severity: "suggestion",
                enabled: true,
                method: "checkLineTypes"
              },
              namingConventions: {
                name: "Naming Convention Analysis",
                description: "Evaluates naming conventions for consistency",
                severity: "suggestion",
                enabled: true,
                method: "checkNamingConventions"
              },
              drawingOrganization: {
                name: "Drawing Organization",
                description: "Analyzes overall drawing structure and organization",
                severity: "suggestion",
                enabled: true,
                method: "checkDrawingOrganization"
              }
            }
          },
          security: {
            name: "Security Issues",
            description: "Potential security risks and malicious content detection",
            rules: {
              externalReferences: {
                name: "External Reference Check",
                description: "Identifies potentially unsafe external references",
                severity: "warning",
                enabled: true,
                method: "checkExternalReferences"
              },
              scriptContent: {
                name: "Script Content Detection",
                description: "Detects embedded scripts or executable content",
                severity: "critical",
                enabled: true,
                method: "checkScriptContent"
              },
              binaryContent: {
                name: "Binary Content Analysis",
                description: "Analyzes embedded binary content for threats",
                severity: "warning",
                enabled: true,
                method: "checkBinaryContent"
              },
              suspiciousPatterns: {
                name: "Suspicious Pattern Detection",
                description: "Identifies potentially malicious patterns in data",
                severity: "warning",
                enabled: true,
                method: "checkSuspiciousPatterns"
              }
            }
          }
        };
      }

      // Rule Configuration Management
      showRuleConfigDialog() {
        this.populateRuleConfigDialog();
        document.getElementById("ruleConfigOverlay").style.display = "block";
      }

      hideRuleConfigDialog() {
        document.getElementById("ruleConfigOverlay").style.display = "none";
      }

      selectAllRules(selectAll) {
        const checkboxes = document.querySelectorAll('#ruleConfigContent input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
          checkbox.checked = selectAll;
          const ruleId = checkbox.dataset.ruleId;
          const categoryId = checkbox.dataset.categoryId;
          if (ruleId && categoryId && this.ruleConfiguration[categoryId] && this.ruleConfiguration[categoryId][ruleId]) {
            this.ruleConfiguration[categoryId][ruleId].enabled = selectAll;
          }
        });
      }

      populateRuleConfigDialog() {
        const content = document.getElementById("ruleConfigContent");
        content.innerHTML = "";
        
        Object.keys(this.diagnosticRules).forEach(categoryKey => {
          const category = this.diagnosticRules[categoryKey];
          const categoryDiv = document.createElement("div");
          categoryDiv.className = "rule-category";
          categoryDiv.dataset.category = categoryKey;
          
          const headerDiv = document.createElement("div");
          headerDiv.className = "rule-category-header";
          headerDiv.innerHTML = `
            <span><strong>${category.name}</strong> - ${category.description}</span>
            <span id="categoryToggle_${categoryKey}">▼</span>
          `;
          
          const bodyDiv = document.createElement("div");
          bodyDiv.className = "rule-category-body expanded";
          bodyDiv.id = `categoryBody_${categoryKey}`;
          
          // Category controls
          const controlsDiv = document.createElement("div");
          controlsDiv.className = "rule-category-controls";
          controlsDiv.innerHTML = `
            <button onclick="app.selectCategoryRules('${categoryKey}', true)">Select All</button>
            <button onclick="app.selectCategoryRules('${categoryKey}', false)">Deselect All</button>
          `;
          bodyDiv.appendChild(controlsDiv);
          
          // Rules
          Object.keys(category.rules).forEach(ruleKey => {
            const rule = category.rules[ruleKey];
            const isEnabled = this.ruleConfiguration[categoryKey]?.[ruleKey] !== false;
            
            const ruleDiv = document.createElement("div");
            ruleDiv.className = `rule-item ${isEnabled ? '' : 'disabled'}`;
            ruleDiv.dataset.rule = ruleKey;
            ruleDiv.dataset.category = categoryKey;
            
            ruleDiv.innerHTML = `
              <input type="checkbox" class="rule-checkbox" 
                     id="rule_${categoryKey}_${ruleKey}" 
                     ${isEnabled ? 'checked' : ''}>
              <div class="rule-info">
                <div class="rule-title">${rule.name}</div>
                <div class="rule-description">${rule.description}</div>
                <div class="rule-severity ${rule.severity}">${rule.severity.toUpperCase()}</div>
              </div>
            `;
            
            bodyDiv.appendChild(ruleDiv);
          });
          
          categoryDiv.appendChild(headerDiv);
          categoryDiv.appendChild(bodyDiv);
          content.appendChild(categoryDiv);
          
          // Add toggle functionality
          headerDiv.addEventListener("click", () => {
            bodyDiv.classList.toggle("expanded");
            const toggle = document.getElementById(`categoryToggle_${categoryKey}`);
            toggle.textContent = bodyDiv.classList.contains("expanded") ? "▼" : "▶";
          });
        });
        
        // Add event listeners to checkboxes
        content.querySelectorAll('.rule-checkbox').forEach(checkbox => {
          checkbox.addEventListener('change', () => {
            const ruleItem = checkbox.closest('.rule-item');
            if (checkbox.checked) {
              ruleItem.classList.remove('disabled');
            } else {
              ruleItem.classList.add('disabled');
            }
          });
        });
      }

      selectAllRules(enabled) {
        document.querySelectorAll('.rule-checkbox').forEach(checkbox => {
          checkbox.checked = enabled;
          const ruleItem = checkbox.closest('.rule-item');
          if (enabled) {
            ruleItem.classList.remove('disabled');
          } else {
            ruleItem.classList.add('disabled');
          }
        });
      }

      selectCategoryRules(categoryKey, enabled) {
        document.querySelectorAll(`[data-category="${categoryKey}"] .rule-checkbox`).forEach(checkbox => {
          checkbox.checked = enabled;
          const ruleItem = checkbox.closest('.rule-item');
          if (enabled) {
            ruleItem.classList.remove('disabled');
          } else {
            ruleItem.classList.add('disabled');
          }
        });
      }

      resetToDefaultRules() {
        Object.keys(this.diagnosticRules).forEach(categoryKey => {
          const category = this.diagnosticRules[categoryKey];
          Object.keys(category.rules).forEach(ruleKey => {
            const checkbox = document.getElementById(`rule_${categoryKey}_${ruleKey}`);
            if (checkbox) {
              checkbox.checked = category.rules[ruleKey].enabled;
              const ruleItem = checkbox.closest('.rule-item');
              if (checkbox.checked) {
                ruleItem.classList.remove('disabled');
              } else {
                ruleItem.classList.add('disabled');
              }
            }
          });
        });
      }

      filterRules() {
        const searchTerm = document.getElementById("ruleSearchInput").value.toLowerCase();
        document.querySelectorAll('.rule-item').forEach(item => {
          const title = item.querySelector('.rule-title').textContent.toLowerCase();
          const description = item.querySelector('.rule-description').textContent.toLowerCase();
          const matches = title.includes(searchTerm) || description.includes(searchTerm);
          
          if (matches) {
            item.classList.remove('hidden');
          } else {
            item.classList.add('hidden');
          }
        });
        
        // Hide empty categories
        document.querySelectorAll('.rule-category').forEach(category => {
          const visibleRules = category.querySelectorAll('.rule-item:not(.hidden)');
          if (visibleRules.length === 0 && searchTerm) {
            category.style.display = 'none';
          } else {
            category.style.display = 'block';
          }
        });
      }

      applyRuleConfiguration() {
        const config = {};
        
        document.querySelectorAll('.rule-item').forEach(item => {
          const categoryKey = item.dataset.category;
          const ruleKey = item.dataset.rule;
          const checkbox = item.querySelector('.rule-checkbox');
          
          if (!config[categoryKey]) {
            config[categoryKey] = {};
          }
          
          config[categoryKey][ruleKey] = checkbox.checked;
        });
        
        this.ruleConfiguration = config;
        this.saveRuleConfiguration();
        this.hideRuleConfigDialog();
        alert("Rule configuration applied successfully!");
      }

      // Profile Management
      saveRuleProfile() {
        const profileName = prompt("Enter profile name:");
        if (!profileName || profileName.trim() === "") {
          alert("Profile name cannot be empty.");
          return;
        }
        
        const config = {};
        document.querySelectorAll('.rule-item').forEach(item => {
          const categoryKey = item.dataset.category;
          const ruleKey = item.dataset.rule;
          const checkbox = item.querySelector('.rule-checkbox');
          
          if (!config[categoryKey]) {
            config[categoryKey] = {};
          }
          
          config[categoryKey][ruleKey] = checkbox.checked;
        });
        
        const profiles = this.getRuleProfiles();
        profiles[profileName.trim()] = {
          name: profileName.trim(),
          config: config,
          created: new Date().toISOString()
        };
        
        localStorage.setItem("dxfDiagnosticProfiles", JSON.stringify(profiles));
        this.loadProfileList();
        alert(`Profile "${profileName}" saved successfully!`);
      }

      loadRuleProfile() {
        const select = document.getElementById("ruleProfileSelect");
        const profileName = select.value;
        
        if (!profileName) {
          alert("Please select a profile to load.");
          return;
        }
        
        const profiles = this.getRuleProfiles();
        const profile = profiles[profileName];
        
        if (!profile) {
          alert("Profile not found.");
          return;
        }
        
        // Apply the profile configuration to checkboxes
        Object.keys(profile.config).forEach(categoryKey => {
          Object.keys(profile.config[categoryKey]).forEach(ruleKey => {
            const checkbox = document.getElementById(`rule_${categoryKey}_${ruleKey}`);
            if (checkbox) {
              checkbox.checked = profile.config[categoryKey][ruleKey];
              const ruleItem = checkbox.closest('.rule-item');
              if (checkbox.checked) {
                ruleItem.classList.remove('disabled');
              } else {
                ruleItem.classList.add('disabled');
              }
            }
          });
        });
        
        alert(`Profile "${profileName}" loaded successfully!`);
      }

      deleteRuleProfile() {
        const select = document.getElementById("ruleProfileSelect");
        const profileName = select.value;
        
        if (!profileName) {
          alert("Please select a profile to delete.");
          return;
        }
        
        if (!confirm(`Are you sure you want to delete profile "${profileName}"?`)) {
          return;
        }
        
        const profiles = this.getRuleProfiles();
        delete profiles[profileName];
        
        localStorage.setItem("dxfDiagnosticProfiles", JSON.stringify(profiles));
        this.loadProfileList();
        alert(`Profile "${profileName}" deleted successfully!`);
      }

      clearAllProfiles() {
        if (!confirm("Are you sure you want to delete ALL saved profiles? This cannot be undone.")) {
          return;
        }
        
        localStorage.removeItem("dxfDiagnosticProfiles");
        this.loadProfileList();
        alert("All profiles cleared successfully!");
      }

      getRuleProfiles() {
        const stored = localStorage.getItem("dxfDiagnosticProfiles");
        return stored ? JSON.parse(stored) : {};
      }

      loadProfileList() {
        const select = document.getElementById("ruleProfileSelect");
        const profiles = this.getRuleProfiles();
        
        select.innerHTML = '<option value="">Select Profile...</option>';
        
        Object.keys(profiles).forEach(profileName => {
          const option = document.createElement("option");
          option.value = profileName;
          option.textContent = `${profileName} (${new Date(profiles[profileName].created).toLocaleDateString()})`;
          select.appendChild(option);
        });
      }

      // Configuration Storage
      loadRuleConfiguration() {
        const stored = localStorage.getItem("dxfDiagnosticRuleConfig");
        if (stored) {
          return JSON.parse(stored);
        }
        
        // Default configuration - all rules enabled
        const defaultConfig = {};
        Object.keys(this.diagnosticRules).forEach(categoryKey => {
          defaultConfig[categoryKey] = {};
          Object.keys(this.diagnosticRules[categoryKey].rules).forEach(ruleKey => {
            defaultConfig[categoryKey][ruleKey] = this.diagnosticRules[categoryKey].rules[ruleKey].enabled;
          });
        });
        
        return defaultConfig;
      }

      saveRuleConfiguration() {
        localStorage.setItem("dxfDiagnosticRuleConfig", JSON.stringify(this.ruleConfiguration));
      }

      // File-based profile save/load functionality
      saveProfileToFile() {
        const select = document.getElementById("ruleProfileSelect");
        const profileName = select.value;
        
        if (!profileName) {
          alert("Please select a profile to save to file.");
          return;
        }
        
        const profiles = this.getRuleProfiles();
        const profile = profiles[profileName];
        
        if (!profile) {
          alert("Profile not found.");
          return;
        }
        
        // Create the file content
        const fileContent = JSON.stringify(profile, null, 2);
        const blob = new Blob([fileContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = `${profileName.replace(/[^a-z0-9]/gi, '_')}_diagnostic_profile.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`Profile "${profileName}" saved to file successfully!`);
      }

      loadProfileFromFile(file) {
        if (!file) {
          return;
        }
        
        if (!file.name.toLowerCase().endsWith('.json')) {
          alert("Please select a JSON file.");
          return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const profileData = JSON.parse(e.target.result);
            
            // Validate profile structure
            if (!profileData.name || !profileData.config) {
              alert("Invalid profile file format. Expected properties: name, config");
              return;
            }
            
            // Check if profile already exists
            const profiles = this.getRuleProfiles();
            const profileName = profileData.name;
            
            if (profiles[profileName]) {
              if (!confirm(`Profile "${profileName}" already exists. Do you want to overwrite it?`)) {
                return;
              }
            }
            
            // Save the profile
            profiles[profileName] = {
              name: profileName,
              config: profileData.config,
              created: profileData.created || new Date().toISOString(),
              importedFrom: file.name
            };
            
            localStorage.setItem("dxfDiagnosticProfiles", JSON.stringify(profiles));
            this.loadProfileList();
            
            // Select the loaded profile
            const select = document.getElementById("ruleProfileSelect");
            select.value = profileName;
            
            alert(`Profile "${profileName}" loaded from file successfully!`);
            
          } catch (error) {
            alert("Error parsing profile file: " + error.message);
          }
        };
        
        reader.readAsText(file);
        
        // Clear the file input
        document.getElementById("profileFileInput").value = '';
      }
    }

    // ============================================
    // DXF DIAGNOSTICS ENGINE - COMPREHENSIVE ANALYSIS
    // ============================================
    

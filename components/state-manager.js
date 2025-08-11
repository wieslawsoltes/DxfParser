    class StateManager {
      constructor() {
        this.storageKey = 'dxf_parser_state';
        this.tabStatePrefix = 'dxf_tab_';
      }

      // Save the complete application state (both panels)
      saveAppState(tabsLeft, tabsRight, activeTabIdLeft, activeTabIdRight, columnWidths) {
        try {
      const appState = {
            // New multi-panel layout
            activeTabIdLeft: activeTabIdLeft,
            activeTabIdRight: activeTabIdRight,
            columnWidths: columnWidths,
            tabIdsLeft: (tabsLeft || []).map(tab => tab.id),
            tabIdsRight: (tabsRight || []).map(tab => tab.id),
        // UI toggles persisted outside of App to also export
        sidebarCollapsed: (function(){ try { return localStorage.getItem('sidebarCollapsed') === 'true'; } catch(e) { return false; } })(),
        rightPanelHidden: (function(){ try { return localStorage.getItem('rightPanelHidden') === 'true'; } catch(e) { return false; } })(),
        sideBySideDiffEnabled: (typeof window !== 'undefined' && window.app) ? !!window.app.sideBySideDiffEnabled : false,
        timestamp: Date.now()
          };
          localStorage.setItem(this.storageKey, JSON.stringify(appState));
          
          // Save each tab's state separately for efficiency
          (tabsLeft || []).forEach(tab => { this.saveTabState(tab); });
          (tabsRight || []).forEach(tab => { this.saveTabState(tab); });
        } catch (error) {
          console.warn('Failed to save app state:', error);
        }
  }

  // Build a single JSON snapshot of the entire app state for file export
  buildExportSnapshot(tabsLeft, tabsRight, activeTabIdLeft, activeTabIdRight, columnWidths) {
    const app = (typeof window !== 'undefined') ? window.app : null;
    const safe = (fn, fallback) => { try { return fn(); } catch(e) { return fallback; } };
    const snapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      app: {
        activeTabIdLeft,
        activeTabIdRight,
        columnWidths,
        sidebarCollapsed: safe(() => localStorage.getItem('sidebarCollapsed') === 'true', false),
        rightPanelHidden: safe(() => localStorage.getItem('rightPanelHidden') === 'true', false),
        sideBySideDiffEnabled: app ? !!app.sideBySideDiffEnabled : false
      },
      leftTabs: (tabsLeft || []).map(t => this._serializeTabForExport(t)),
      rightTabs: (tabsRight || []).map(t => this._serializeTabForExport(t))
    };
    return snapshot;
  }

  _serializeTabForExport(tab) {
    return {
      id: tab.id,
      name: tab.name,
      codeSearchTerms: tab.codeSearchTerms || [],
      dataSearchTerms: tab.dataSearchTerms || [],
      currentSortField: tab.currentSortField || 'line',
      currentSortAscending: tab.currentSortAscending !== undefined ? tab.currentSortAscending : true,
      minLine: tab.minLine ?? null,
      maxLine: tab.maxLine ?? null,
      dataExact: !!tab.dataExact,
      dataCase: !!tab.dataCase,
      selectedObjectTypes: tab.selectedObjectTypes || [],
      navigationHistory: tab.navigationHistory || [],
      currentHistoryIndex: tab.currentHistoryIndex ?? -1,
      classIdToName: tab.classIdToName || {},
      expandedNodeIds: tab.originalTreeData ? this.getExpandedNodeIds(tab.originalTreeData) : [],
      originalTreeData: tab.originalTreeData || null
    };
  }

  // Restore from a snapshot object (not reading/writing localStorage by itself)
  // Returns { app, leftTabs, rightTabs }
  restoreFromSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const app = snapshot.app || {};
    const left = Array.isArray(snapshot.leftTabs) ? snapshot.leftTabs : [];
    const right = Array.isArray(snapshot.rightTabs) ? snapshot.rightTabs : [];
    // Ensure tree nodes have expanded flags per expandedNodeIds
    const applyExpanded = (tabsArr) => {
      for (const t of tabsArr) {
        if (t.originalTreeData && t.expandedNodeIds && t.expandedNodeIds.length) {
          try { this.restoreExpandedState(t.originalTreeData, t.expandedNodeIds); } catch(e) {}
        }
      }
    };
    applyExpanded(left);
    applyExpanded(right);
    return {
      app: {
        activeTabIdLeft: app.activeTabIdLeft || null,
        activeTabIdRight: app.activeTabIdRight || null,
        columnWidths: app.columnWidths || null,
        sidebarCollapsed: !!app.sidebarCollapsed,
        rightPanelHidden: !!app.rightPanelHidden,
        sideBySideDiffEnabled: !!app.sideBySideDiffEnabled
      },
      leftTabs: left,
      rightTabs: right
    };
  }


      // Save individual tab state
      saveTabState(tab) {
        try {
          // Create a serializable version of the tab state
          const tabState = {
            id: tab.id,
            name: tab.name,
            codeSearchTerms: tab.codeSearchTerms || [],
            dataSearchTerms: tab.dataSearchTerms || [],
            currentSortField: tab.currentSortField || 'line',
            currentSortAscending: tab.currentSortAscending !== undefined ? tab.currentSortAscending : true,
            minLine: tab.minLine,
            maxLine: tab.maxLine,
            dataExact: tab.dataExact || false,
            dataCase: tab.dataCase || false,
            selectedObjectTypes: tab.selectedObjectTypes || [],
            navigationHistory: tab.navigationHistory || [],
            currentHistoryIndex: tab.currentHistoryIndex || -1,
            classIdToName: tab.classIdToName || {},
            // Store the original file content for reconstruction
            originalTreeDataSerialized: tab.originalTreeData ? this.serializeTreeData(tab.originalTreeData) : null,
            expandedNodeIds: tab.originalTreeData ? this.getExpandedNodeIds(tab.originalTreeData) : [],
            timestamp: Date.now()
          };
          
          localStorage.setItem(this.tabStatePrefix + tab.id, JSON.stringify(tabState));
        } catch (error) {
          console.warn('Failed to save tab state:', error);
        }
      }

      // Serialize tree data to a compact format
      serializeTreeData(treeData) {
        try {
          return JSON.stringify(treeData, (key, value) => {
            // Skip large or redundant properties for serialization
            if (key === 'expanded' || key === 'currentTreeData') {
              return undefined;
            }
            return value;
          });
        } catch (error) {
          console.warn('Failed to serialize tree data:', error);
          return null;
        }
      }

      // Get list of expanded node IDs for state restoration
      getExpandedNodeIds(nodes) {
        const expandedIds = [];
        const traverse = (nodeList) => {
          nodeList.forEach(node => {
            if (node.expanded) {
              expandedIds.push(node.id);
            }
            if (node.children && node.children.length > 0) {
              traverse(node.children);
            }
          });
        };
        traverse(nodes);
        return expandedIds;
      }

      // Restore expanded state from saved IDs
      restoreExpandedState(nodes, expandedIds) {
        const traverse = (nodeList) => {
          nodeList.forEach(node => {
            node.expanded = expandedIds.includes(node.id);
            if (node.children && node.children.length > 0) {
              traverse(node.children);
            }
          });
        };
        traverse(nodes);
      }

      // Load the complete application state
      loadAppState() {
        try {
          const appStateJson = localStorage.getItem(this.storageKey);
          if (!appStateJson) return null;
          
          const appState = JSON.parse(appStateJson);
          
          // Check if state is not too old (older than 7 days)
          const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
          if (Date.now() - appState.timestamp > maxAge) {
            console.log('App state expired, clearing...');
            this.clearAllState();
            return null;
          }

          return appState;
        } catch (error) {
          console.warn('Failed to load app state:', error);
          return null;
        }
      }

      // Load individual tab state
      loadTabState(tabId) {
        try {
          const tabStateJson = localStorage.getItem(this.tabStatePrefix + tabId);
          if (!tabStateJson) return null;
          
          const tabState = JSON.parse(tabStateJson);
          
          // Deserialize tree data if present
          if (tabState.originalTreeDataSerialized) {
            tabState.originalTreeData = JSON.parse(tabState.originalTreeDataSerialized);
            delete tabState.originalTreeDataSerialized; // Clean up
          }

          return tabState;
        } catch (error) {
          console.warn('Failed to load tab state:', error);
          return null;
        }
      }

      // Remove tab state when tab is closed
      removeTabState(tabId) {
        try {
          localStorage.removeItem(this.tabStatePrefix + tabId);
        } catch (error) {
          console.warn('Failed to remove tab state:', error);
        }
      }

      // Clear all state
      clearAllState() {
        try {
          // Remove main app state
          localStorage.removeItem(this.storageKey);
          
          // Remove all tab states
          const keys = Object.keys(localStorage);
          keys.forEach(key => {
            if (key.startsWith(this.tabStatePrefix)) {
              localStorage.removeItem(key);
            }
          });
          
          console.log('All state cleared');
        } catch (error) {
          console.warn('Failed to clear state:', error);
        }
      }

      

      // Check if we have saved state
      hasSavedState() {
        return localStorage.getItem(this.storageKey) !== null;
      }
    }


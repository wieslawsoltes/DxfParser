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


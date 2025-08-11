    class DXFDiagnosticsEngine {
      constructor(dxfTree, fileName, ruleConfiguration = null) {
        this.dxfTree = dxfTree;
        this.fileName = fileName;
        this.ruleConfiguration = ruleConfiguration || {};
        this.issues = {
          structural: [],
          integrity: [],
          rendering: [],
          text: [],
          performance: [],
          compliance: [],
          bestPractices: [],
          security: []
        };
        this.stats = {
          totalIssues: 0,
          criticalIssues: 0,
          errorIssues: 0,
          warningIssues: 0,
          infoIssues: 0,
          suggestions: 0
        };
        this.nodeMap = new Map();
        this.handleMap = new Map();
        this.objectTypeStats = new Map();
      }

      // Helper method to check if a rule is enabled
      isRuleEnabled(category, ruleId) {
        if (!this.ruleConfiguration || !this.ruleConfiguration[category]) {
          return true; // Default to enabled if no configuration
        }
        return this.ruleConfiguration[category][ruleId] !== false;
      }

      async runFullDiagnostics(progressCallback) {
        const steps = [
          { name: "Indexing DXF structure", weight: 8 },
          { name: "Analyzing structural integrity", weight: 12 },
          { name: "Validating data integrity", weight: 12 },
          { name: "Checking rendering issues", weight: 14 },
          { name: "Analyzing text issues", weight: 14 },
          { name: "Performance analysis", weight: 12 },
          { name: "DXF compliance checks", weight: 16 },
          { name: "Best practices analysis", weight: 8 },
          { name: "Security assessment", weight: 4 }
        ];

        let currentProgress = 0;
        
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          progressCallback(currentProgress, step.name);
          
          switch (i) {
            case 0: await this.indexDXFStructure(); break;
            case 1: await this.analyzeStructuralIntegrity(); break;
            case 2: await this.validateDataIntegrity(); break;
            case 3: await this.analyzeRenderingIssues(); break;
            case 4: await this.analyzeTextIssues(); break;
            case 5: await this.performanceAnalysis(); break;
            case 6: await this.dxfComplianceChecks(); break;
            case 7: await this.bestPracticesAnalysis(); break;
            case 8: await this.securityAssessment(); break;
          }
          
          currentProgress += step.weight;
          
          // Add small delay to show progress
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        progressCallback(100, "Analysis complete");
        
        this.calculateStatistics();
        
        return {
          stats: this.stats,
          structural: this.issues.structural,
          integrity: this.issues.integrity,
          rendering: this.issues.rendering,
          text: this.issues.text,
          performance: this.issues.performance,
          compliance: this.issues.compliance,
          bestPractices: this.issues.bestPractices,
          security: this.issues.security
        };
      }

      async indexDXFStructure() {
        this.traverseTree(this.dxfTree, (node, path) => {
          // Index all nodes for quick lookup
          this.nodeMap.set(node.id, { node, path });
          
          // Index handles
          if (node.handle) {
            this.handleMap.set(node.handle, node);
          }
          
          // Count object types
          if (node.type) {
            const count = this.objectTypeStats.get(node.type) || 0;
            this.objectTypeStats.set(node.type, count + 1);
          }
        });
      }

      async analyzeStructuralIntegrity() {
        // Check for missing required sections
        this.checkRequiredSections();
        
        // Check section structure
        this.checkSectionStructure();
        
        // Check for orphaned end markers
        this.checkEndMarkers();
        
        // Check block definitions
        this.checkBlockDefinitions();
        
        // Check table structure
        this.checkTableStructure();
      }

      checkRequiredSections() {
        if (!this.isRuleEnabled('structural', 'requiredSections')) return;
        
        const requiredSections = ['HEADER', 'TABLES', 'ENTITIES'];
        const foundSections = new Set();
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type === 'SECTION') {
            const nameProperty = node.properties?.find(p => p.code === 2);
            if (nameProperty) {
              foundSections.add(nameProperty.value);
            }
          }
        });
        
        requiredSections.forEach(section => {
          if (!foundSections.has(section)) {
            this.addIssue('structural', {
              severity: 'critical',
              title: `Missing Required Section: ${section}`,
              description: `The DXF file is missing the required ${section} section, which may cause compatibility issues.`,
              category: 'Section Structure',
              location: 'File structure'
            });
          }
        });
      }

      checkSectionStructure() {
        if (!this.isRuleEnabled('structural', 'sectionStructure')) return;
        
        let currentSection = null;
        let sectionDepth = 0;
        
        this.traverseTree(this.dxfTree, (node, path) => {
          if (node.type === 'SECTION') {
            sectionDepth++;
            if (sectionDepth > 1) {
              this.addIssue('structural', {
                severity: 'error',
                title: 'Nested SECTION Found',
                description: 'SECTION blocks cannot be nested within other SECTION blocks.',
                category: 'Section Structure',
                location: `Line ${node.line}`,
                actions: [{ type: 'navigate', data: node.id, label: 'Go to Section' }]
              });
            }
            currentSection = node;
          } else if (node.type === 'ENDSEC') {
            sectionDepth--;
            if (sectionDepth < 0) {
              this.addIssue('structural', {
                severity: 'error',
                title: 'Unmatched ENDSEC',
                description: 'Found ENDSEC without a corresponding SECTION.',
                category: 'Section Structure',
                location: `Line ${node.line}`,
                actions: [{ type: 'navigate', data: node.id, label: 'Go to ENDSEC' }]
              });
            }
          }
        });
        
        if (sectionDepth !== 0) {
          this.addIssue('structural', {
            severity: 'error',
            title: 'Unclosed SECTION',
            description: 'One or more SECTION blocks are not properly closed with ENDSEC.',
            category: 'Section Structure',
            location: currentSection ? `Line ${currentSection.line}` : 'Unknown'
          });
        }
      }

      checkEndMarkers() {
        if (!this.isRuleEnabled('structural', 'endMarkers')) return;
        
        const containerTypes = ['SECTION', 'BLOCK', 'TABLE', 'POLYLINE'];
        const endMarkers = ['ENDSEC', 'ENDBLK', 'ENDTAB', 'SEQEND'];
        
        this.traverseTree(this.dxfTree, (node) => {
          if (endMarkers.includes(node.type) && node.synthetic) {
            this.addIssue('structural', {
              severity: 'warning',
              title: `Missing ${node.type}`,
              description: `Expected ${node.type} marker was not found and had to be synthesized.`,
              category: 'End Markers',
              location: `Line ${node.line}`,
              actions: [{ type: 'navigate', data: node.id, label: 'Go to Location' }]
            });
          }
        });
      }

      checkBlockDefinitions() {
        if (!this.isRuleEnabled('structural', 'blockDefinitions')) return;
        
        const blockNames = new Set();
        const referencedBlocks = new Set();
        
        // Collect block definitions
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type === 'BLOCK') {
            const nameProperty = node.properties?.find(p => p.code === 2);
            if (nameProperty) {
              const blockName = nameProperty.value;
              if (blockNames.has(blockName)) {
                this.addIssue('structural', {
                  severity: 'error',
                  title: `Duplicate Block Definition: ${blockName}`,
                  description: `Block "${blockName}" is defined multiple times.`,
                  category: 'Block Definitions',
                  location: `Line ${node.line}`,
                  actions: [{ type: 'navigate', data: node.id, label: 'Go to Block' }]
                });
              }
              blockNames.add(blockName);
            }
          } else if (node.type === 'INSERT') {
            const nameProperty = node.properties?.find(p => p.code === 2);
            if (nameProperty) {
              referencedBlocks.add(nameProperty.value);
            }
          }
        });
        
        // Check for missing block definitions
        referencedBlocks.forEach(blockName => {
          if (!blockNames.has(blockName)) {
            this.addIssue('structural', {
              severity: 'error',
              title: `Missing Block Definition: ${blockName}`,
              description: `Block "${blockName}" is referenced but not defined.`,
              category: 'Block References',
              location: 'INSERT entities'
            });
          }
        });
      }

      checkTableStructure() {
        if (!this.isRuleEnabled('structural', 'tableStructure')) return;
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type === 'TABLE') {
            const nameProperty = node.properties?.find(p => p.code === 2);
            if (!nameProperty) {
              this.addIssue('structural', {
                severity: 'error',
                title: 'TABLE Missing Name',
                description: 'TABLE entity is missing required name property (code 2).',
                category: 'Table Structure',
                location: `Line ${node.line}`,
                actions: [{ type: 'navigate', data: node.id, label: 'Go to Table' }]
              });
            }
          }
        });
      }

      async validateDataIntegrity() {
        this.checkHandleReferences();
        this.checkGroupCodes();
        this.checkCoordinateValues();
        this.checkTextEncoding();
        this.checkBinaryData();
      }

      async analyzeRenderingIssues() {
        this.checkGeometryValidity();
        this.checkColorAndVisibility();
        this.checkViewportSettings();
        this.checkLayerRenderingIssues();
        this.checkBlockRenderingIssues();
        this.checkLineTypeRendering();
        this.checkHatchPatterns();
        this.checkDimensionRendering();
        this.checkSplineValidity();
        this.checkExtrusionDirections();
        this.checkZOrderIssues();
        this.checkScaleFactors();
        this.checkMaterialProperties();
        this.checkLightingIssues();
        this.checkTransparencyIssues();
      }

      async analyzeTextIssues() {
        this.checkTextGeometry();
        this.checkTextStyles();
        this.checkTextFormatting();
        this.checkMTextFormatting();
        this.checkFontAvailability();
        this.checkTextAlignment();
        this.checkTextUnicode();
        this.checkTextVisibility();
        this.checkDimensionText();
        this.checkTextOverlap();
        this.checkTextReadability();
      }

      checkHandleReferences() {
        if (!this.isRuleEnabled('integrity', 'handleReferences')) return;
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.properties) {
            node.properties.forEach(prop => {
              if (isHandleCode(prop.code) && prop.value && prop.value !== '0') {
                if (!this.handleMap.has(prop.value)) {
                  this.addIssue('integrity', {
                    severity: 'error',
                    title: `Invalid Handle Reference: ${prop.value}`,
                    description: `Handle "${prop.value}" is referenced but does not exist in the file.`,
                    category: 'Handle References',
                    location: `Line ${prop.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: 'Go to Reference' }]
                  });
                }
              }
            });
          }
        });
      }

      checkGroupCodes() {
        if (!this.isRuleEnabled('integrity', 'groupCodes')) return;
        
        const validGroupCodes = new Set([
          // Add comprehensive list of valid DXF group codes
          0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
          20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
          40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
          60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
          90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 105,
          210, 220, 230, 310, 320, 330, 340, 350, 360, 370, 380, 390,
          999, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009,
          1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019,
          1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029,
          1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039,
          1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049,
          1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059,
          1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071
        ]);
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.properties) {
            node.properties.forEach(prop => {
              if (!validGroupCodes.has(parseInt(prop.code))) {
                this.addIssue('integrity', {
                  severity: 'warning',
                  title: `Unknown Group Code: ${prop.code}`,
                  description: `Group code ${prop.code} is not in the standard DXF specification.`,
                  category: 'Group Codes',
                  location: `Line ${prop.line}`,
                  actions: [{ type: 'navigate', data: node.id, label: 'Go to Property' }]
                });
              }
            });
          }
        });
      }

      checkCoordinateValues() {
        if (!this.isRuleEnabled('integrity', 'coordinateValues')) return;
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.properties) {
            node.properties.forEach(prop => {
              const code = parseInt(prop.code);
              // Coordinate group codes (10-39, 210-239)
              if ((code >= 10 && code <= 39) || (code >= 210 && code <= 239)) {
                const value = parseFloat(prop.value);
                if (isNaN(value)) {
                  this.addIssue('integrity', {
                    severity: 'error',
                    title: `Invalid Coordinate Value: ${prop.value}`,
                    description: `Coordinate group code ${prop.code} contains non-numeric value "${prop.value}".`,
                    category: 'Coordinate Values',
                    location: `Line ${prop.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: 'Go to Property' }]
                  });
                } else if (Math.abs(value) > 1e14) {
                  this.addIssue('integrity', {
                    severity: 'warning',
                    title: `Extreme Coordinate Value: ${prop.value}`,
                    description: `Coordinate value ${prop.value} is extremely large and may cause precision issues.`,
                    category: 'Coordinate Values',
                    location: `Line ${prop.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: 'Go to Property' }]
                  });
                }
              }
            });
          }
        });
      }

      checkTextEncoding() {
        if (!this.isRuleEnabled('integrity', 'textEncoding')) return;
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.properties) {
            node.properties.forEach(prop => {
              const code = parseInt(prop.code);
              // Text group codes (1, 3, 7, etc.)
              if ([1, 2, 3, 4, 5, 6, 7, 8, 9].includes(code) && prop.value) {
                // Check for null characters or other problematic characters
                if (prop.value.includes('\0')) {
                  this.addIssue('integrity', {
                    severity: 'warning',
                    title: 'Text Contains Null Characters',
                    description: 'Text value contains null characters which may cause display issues.',
                    category: 'Text Encoding',
                    location: `Line ${prop.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: 'Go to Property' }]
                  });
                }
                
                // Check for very long text values
                if (prop.value.length > 2048) {
                  this.addIssue('integrity', {
                    severity: 'info',
                    title: 'Very Long Text Value',
                    description: `Text value is ${prop.value.length} characters long, which may impact performance.`,
                    category: 'Text Encoding',
                    location: `Line ${prop.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: 'Go to Property' }]
                  });
                }
              }
            });
          }
        });
      }

      checkBinaryData() {
        if (!this.isRuleEnabled('integrity', 'binaryData')) return;
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.properties) {
            const binaryProps = node.properties.filter(prop => prop.code === 310);
            if (binaryProps.length > 0) {
              const totalBinarySize = binaryProps.reduce((sum, prop) => sum + prop.value.length, 0);
              
              if (totalBinarySize > 1024 * 1024) { // 1MB
                this.addIssue('integrity', {
                  severity: 'info',
                  title: 'Large Binary Data Object',
                  description: `Entity contains ${Math.round(totalBinarySize / 1024)} KB of binary data, which may impact performance.`,
                  category: 'Binary Data',
                  location: `Line ${node.line}`,
                  actions: [{ type: 'navigate', data: node.id, label: 'Go to Entity' }]
                });
              }
              
              // Check binary data integrity
              binaryProps.forEach(prop => {
                if (prop.value.length % 2 !== 0) {
                  this.addIssue('integrity', {
                    severity: 'error',
                    title: 'Invalid Binary Data Length',
                    description: 'Binary data (group code 310) has odd number of characters, expected even.',
                    category: 'Binary Data',
                    location: `Line ${prop.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: 'Go to Property' }]
                  });
                }
                
                // Check for invalid hex characters
                if (!/^[0-9A-Fa-f]*$/.test(prop.value)) {
                  this.addIssue('integrity', {
                    severity: 'error',
                    title: 'Invalid Binary Data Format',
                    description: 'Binary data contains non-hexadecimal characters.',
                    category: 'Binary Data',
                    location: `Line ${prop.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: 'Go to Property' }]
                  });
                }
              });
            }
          }
        });
             }

       // ====================================
       // RENDERING ISSUES ANALYSIS
       // ====================================

       checkGeometryValidity() {
         if (!this.isRuleEnabled('rendering', 'geometryValidity')) return;
         
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'LINE') {
             this.checkLineValidity(node);
           } else if (node.type === 'CIRCLE') {
             this.checkCircleValidity(node);
           } else if (node.type === 'ARC') {
             this.checkArcValidity(node);
           } else if (['POLYLINE', 'LWPOLYLINE'].includes(node.type)) {
             this.checkPolylineValidity(node);
           } else if (node.type === 'ELLIPSE') {
             this.checkEllipseValidity(node);
           }
         });
       }

       checkLineValidity(node) {
         const startX = this.getPropertyValue(node, 10);
         const startY = this.getPropertyValue(node, 20);
         const endX = this.getPropertyValue(node, 11);
         const endY = this.getPropertyValue(node, 21);
         
         if (startX !== null && startY !== null && endX !== null && endY !== null) {
           const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
           
           if (length < 1e-10) {
             this.addIssue('rendering', {
               severity: 'warning',
               title: 'Zero-Length Line',
               description: 'Line entity has zero length and will not be visible when rendered.',
               category: 'Geometry Validity',
               location: `Line ${node.line}`,
               actions: [{ type: 'navigate', data: node.id, label: 'Go to Line' }]
             });
           }
           
           if (length > 1e12) {
             this.addIssue('rendering', {
               severity: 'warning',
               title: 'Extremely Long Line',
               description: `Line length (${length.toExponential(2)}) may cause rendering precision issues.`,
               category: 'Geometry Validity',
               location: `Line ${node.line}`,
               actions: [{ type: 'navigate', data: node.id, label: 'Go to Line' }]
             });
           }
         }
       }

       checkCircleValidity(node) {
         const radius = this.getPropertyValue(node, 40);
         
         if (radius !== null) {
           if (radius <= 0) {
             this.addIssue('rendering', {
               severity: 'error',
               title: 'Invalid Circle Radius',
               description: `Circle has invalid radius: ${radius}. Radius must be positive.`,
               category: 'Geometry Validity',
               location: `Line ${node.line}`,
               actions: [{ type: 'navigate', data: node.id, label: 'Go to Circle' }]
             });
           }
           
           if (radius > 1e12) {
             this.addIssue('rendering', {
               severity: 'warning',
               title: 'Extremely Large Circle',
               description: `Circle radius (${radius.toExponential(2)}) may cause rendering issues.`,
               category: 'Geometry Validity',
               location: `Line ${node.line}`,
               actions: [{ type: 'navigate', data: node.id, label: 'Go to Circle' }]
             });
           }
         }
       }

       checkArcValidity(node) {
         const radius = this.getPropertyValue(node, 40);
         const startAngle = this.getPropertyValue(node, 50);
         const endAngle = this.getPropertyValue(node, 51);
         
         if (radius !== null && radius <= 0) {
           this.addIssue('rendering', {
             severity: 'error',
             title: 'Invalid Arc Radius',
             description: `Arc has invalid radius: ${radius}. Radius must be positive.`,
             category: 'Geometry Validity',
             location: `Line ${node.line}`,
             actions: [{ type: 'navigate', data: node.id, label: 'Go to Arc' }]
           });
         }
         
         if (startAngle !== null && endAngle !== null && Math.abs(startAngle - endAngle) < 1e-6) {
           this.addIssue('rendering', {
             severity: 'warning',
             title: 'Zero-Angle Arc',
             description: 'Arc has zero sweep angle and may not render properly.',
             category: 'Geometry Validity',
             location: `Line ${node.line}`,
             actions: [{ type: 'navigate', data: node.id, label: 'Go to Arc' }]
           });
         }
       }

       checkPolylineValidity(node) {
         let vertexCount = 0;
         
         if (node.children) {
           vertexCount = node.children.filter(child => child.type === 'VERTEX').length;
         }
         
         if (vertexCount < 2) {
           this.addIssue('rendering', {
             severity: 'warning',
             title: 'Polyline with Few Vertices',
             description: `Polyline has only ${vertexCount} vertices. Minimum 2 required for proper rendering.`,
             category: 'Geometry Validity',
             location: `Line ${node.line}`,
             actions: [{ type: 'navigate', data: node.id, label: 'Go to Polyline' }]
           });
         }
       }

       checkEllipseValidity(node) {
         const majorAxisX = this.getPropertyValue(node, 11);
         const majorAxisY = this.getPropertyValue(node, 21);
         const ratio = this.getPropertyValue(node, 40);
         
         if (majorAxisX !== null && majorAxisY !== null) {
           const majorAxisLength = Math.sqrt(majorAxisX * majorAxisX + majorAxisY * majorAxisY);
           
           if (majorAxisLength < 1e-10) {
             this.addIssue('rendering', {
               severity: 'error',
               title: 'Invalid Ellipse Major Axis',
               description: 'Ellipse has zero-length major axis.',
               category: 'Geometry Validity',
               location: `Line ${node.line}`,
               actions: [{ type: 'navigate', data: node.id, label: 'Go to Ellipse' }]
             });
           }
         }
         
         if (ratio !== null && (ratio <= 0 || ratio > 1)) {
           this.addIssue('rendering', {
             severity: 'error',
             title: 'Invalid Ellipse Ratio',
             description: `Ellipse ratio (${ratio}) must be between 0 and 1.`,
             category: 'Geometry Validity',
             location: `Line ${node.line}`,
             actions: [{ type: 'navigate', data: node.id, label: 'Go to Ellipse' }]
           });
         }
       }

       checkColorAndVisibility() {
         if (!this.isRuleEnabled('rendering', 'colorAndVisibility')) return;
         
         this.traverseTree(this.dxfTree, (node) => {
           if (node.properties) {
             const colorCode = this.getPropertyValue(node, 62);
             const transparency = this.getPropertyValue(node, 440);
             
             if (colorCode !== null && (colorCode < 0 || colorCode > 256)) {
               this.addIssue('rendering', {
                 severity: 'error',
                 title: 'Invalid Color Code',
                 description: `Color code ${colorCode} is outside valid range (0-256).`,
                 category: 'Color and Visibility',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Entity' }]
               });
             }
             
             if (transparency !== null && (transparency < 0 || transparency > 100)) {
               this.addIssue('rendering', {
                 severity: 'warning',
                 title: 'Invalid Transparency Value',
                 description: `Transparency value ${transparency} is outside valid range (0-100).`,
                 category: 'Color and Visibility',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Entity' }]
               });
             }
           }
         });
       }

       checkViewportSettings() {
         if (!this.isRuleEnabled('rendering', 'viewportSettings')) return;
         
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'VIEWPORT') {
             const width = this.getPropertyValue(node, 40);
             const height = this.getPropertyValue(node, 41);
             const viewHeight = this.getPropertyValue(node, 45);
             
             if (width !== null && width <= 0) {
               this.addIssue('rendering', {
                 severity: 'error',
                 title: 'Invalid Viewport Width',
                 description: `Viewport width (${width}) must be positive.`,
                 category: 'Viewport Settings',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Viewport' }]
               });
             }
             
             if (height !== null && height <= 0) {
               this.addIssue('rendering', {
                 severity: 'error',
                 title: 'Invalid Viewport Height',
                 description: `Viewport height (${height}) must be positive.`,
                 category: 'Viewport Settings',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Viewport' }]
               });
             }
             
             if (viewHeight !== null && viewHeight <= 0) {
               this.addIssue('rendering', {
                 severity: 'error',
                 title: 'Invalid Viewport View Height',
                 description: `Viewport view height (${viewHeight}) must be positive.`,
                 category: 'Viewport Settings',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Viewport' }]
               });
             }
           }
         });
       }

       checkLayerRenderingIssues() {
         if (!this.isRuleEnabled('rendering', 'layerRenderingIssues')) return;
         
         const layers = new Map();
         
         // Collect layer definitions
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'LAYER') {
             const name = this.getPropertyValue(node, 2);
             const flags = this.getPropertyValue(node, 70);
             const color = this.getPropertyValue(node, 62);
             
             if (name) {
               layers.set(name, { node, flags, color });
               
               if (flags !== null && (flags & 1)) { // Frozen layer
                 this.addIssue('rendering', {
                   severity: 'info',
                   title: `Frozen Layer: ${name}`,
                   description: 'Layer is frozen and entities on it will not be visible.',
                   category: 'Layer Rendering',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Layer' }]
                 });
               }
               
               if (color !== null && color < 0) {
                 this.addIssue('rendering', {
                   severity: 'info',
                   title: `Layer Off: ${name}`,
                   description: 'Layer is turned off and entities on it will not be visible.',
                   category: 'Layer Rendering',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Layer' }]
                 });
               }
             }
           }
         });
       }

       checkBlockRenderingIssues() {
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'INSERT') {
             const scaleX = this.getPropertyValue(node, 41) || 1;
             const scaleY = this.getPropertyValue(node, 42) || 1;
             const scaleZ = this.getPropertyValue(node, 43) || 1;
             
             if (Math.abs(scaleX) < 1e-10 || Math.abs(scaleY) < 1e-10 || Math.abs(scaleZ) < 1e-10) {
               this.addIssue('rendering', {
                 severity: 'warning',
                 title: 'Block Insert with Zero Scale',
                 description: 'Block insert has zero scale factor and will not be visible.',
                 category: 'Block Rendering',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Insert' }]
               });
             }
             
             if (Math.abs(scaleX) > 1000 || Math.abs(scaleY) > 1000 || Math.abs(scaleZ) > 1000) {
               this.addIssue('rendering', {
                 severity: 'warning',
                 title: 'Block Insert with Extreme Scale',
                 description: `Block insert has very large scale factors (${scaleX}, ${scaleY}, ${scaleZ}) which may cause rendering issues.`,
                 category: 'Block Rendering',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Insert' }]
               });
             }
           }
         });
       }

       checkLineTypeRendering() {
         const definedLineTypes = new Set();
         const usedLineTypes = new Set();
         
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'LTYPE') {
             const name = this.getPropertyValue(node, 2);
             if (name) {
               definedLineTypes.add(name);
             }
           }
           
           const lineType = this.getPropertyValue(node, 6);
           if (lineType && lineType !== 'BYLAYER' && lineType !== 'BYBLOCK') {
             usedLineTypes.add(lineType);
           }
         });
         
         usedLineTypes.forEach(lineType => {
           if (!definedLineTypes.has(lineType)) {
             this.addIssue('rendering', {
               severity: 'warning',
               title: `Undefined Line Type: ${lineType}`,
               description: `Line type "${lineType}" is used but not defined, may render as continuous.`,
               category: 'Line Type Rendering',
               location: 'Entities using this line type'
             });
           }
         });
       }

       checkHatchPatterns() {
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'HATCH') {
             const patternName = this.getPropertyValue(node, 2);
             const patternType = this.getPropertyValue(node, 76);
             const boundaryCount = this.getPropertyValue(node, 91);
             
             if (patternType === 1 && (!patternName || patternName === '')) {
               this.addIssue('rendering', {
                 severity: 'error',
                 title: 'Missing Hatch Pattern Name',
                 description: 'Predefined hatch pattern is missing pattern name.',
                 category: 'Hatch Patterns',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Hatch' }]
               });
             }
             
             if (boundaryCount !== null && boundaryCount === 0) {
               this.addIssue('rendering', {
                 severity: 'error',
                 title: 'Hatch with No Boundaries',
                 description: 'Hatch entity has no boundary paths and will not render.',
                 category: 'Hatch Patterns',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Hatch' }]
               });
             }
           }
         });
       }

       checkDimensionRendering() {
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type && node.type.startsWith('DIMENSION')) {
             const dimStyle = this.getPropertyValue(node, 3);
             const textHeight = this.getPropertyValue(node, 140);
             
             if (!dimStyle || dimStyle === '') {
               this.addIssue('rendering', {
                 severity: 'warning',
                 title: 'Dimension Missing Style',
                 description: 'Dimension entity is missing dimension style reference.',
                 category: 'Dimension Rendering',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Dimension' }]
               });
             }
             
             if (textHeight !== null && textHeight <= 0) {
               this.addIssue('rendering', {
                 severity: 'warning',
                 title: 'Invalid Dimension Text Height',
                 description: `Dimension text height (${textHeight}) is invalid, text may not be visible.`,
                 category: 'Dimension Rendering',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Dimension' }]
               });
             }
           }
         });
       }

       checkSplineValidity() {
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'SPLINE') {
             const degree = this.getPropertyValue(node, 71);
             const knotCount = this.getPropertyValue(node, 72);
             const controlPointCount = this.getPropertyValue(node, 73);
             
             if (degree !== null && (degree < 1 || degree > 11)) {
               this.addIssue('rendering', {
                 severity: 'error',
                 title: 'Invalid Spline Degree',
                 description: `Spline degree (${degree}) must be between 1 and 11.`,
                 category: 'Spline Validity',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Spline' }]
               });
             }
             
             if (controlPointCount !== null && controlPointCount < 2) {
               this.addIssue('rendering', {
                 severity: 'error',
                 title: 'Insufficient Spline Control Points',
                 description: `Spline has only ${controlPointCount} control points, minimum 2 required.`,
                 category: 'Spline Validity',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Spline' }]
               });
             }
             
             if (degree !== null && controlPointCount !== null && controlPointCount <= degree) {
               this.addIssue('rendering', {
                 severity: 'warning',
                 title: 'Spline Control Point Degree Mismatch',
                 description: `Spline should have more control points (${controlPointCount}) than degree (${degree}).`,
                 category: 'Spline Validity',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Spline' }]
               });
             }
           }
         });
       }

       checkExtrusionDirections() {
         this.traverseTree(this.dxfTree, (node) => {
           if (node.properties) {
             const extrusionX = this.getPropertyValue(node, 210);
             const extrusionY = this.getPropertyValue(node, 220);
             const extrusionZ = this.getPropertyValue(node, 230);
             
             if (extrusionX !== null && extrusionY !== null && extrusionZ !== null) {
               const length = Math.sqrt(extrusionX * extrusionX + extrusionY * extrusionY + extrusionZ * extrusionZ);
               
               if (length < 1e-10) {
                 this.addIssue('rendering', {
                   severity: 'error',
                   title: 'Zero Extrusion Direction',
                   description: 'Entity has zero-length extrusion direction vector.',
                   category: 'Extrusion Directions',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Entity' }]
                 });
               }
               
               if (Math.abs(length - 1.0) > 1e-6) {
                 this.addIssue('rendering', {
                   severity: 'warning',
                   title: 'Non-Normalized Extrusion Direction',
                   description: `Extrusion direction should be normalized (length=${length.toFixed(6)}).`,
                   category: 'Extrusion Directions',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Entity' }]
                 });
               }
             }
           }
         });
       }

       // Additional Rendering Analysis Methods
       checkZOrderIssues() {
         if (!this.isRuleEnabled('rendering', 'zOrderIssues')) return;
         
         const entities = [];
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type && ['LINE', 'CIRCLE', 'ARC', 'POLYLINE', 'LWPOLYLINE', 'SPLINE', 'ELLIPSE'].includes(node.type)) {
             const z = this.getPropertyValue(node, 30) || 0;
             const layer = this.getPropertyValue(node, 8);
             entities.push({ node, z, layer });
           }
         });
         
         // Check for overlapping entities at same Z level
         for (let i = 0; i < entities.length; i++) {
           let overlappingCount = 0;
           for (let j = i + 1; j < entities.length; j++) {
             if (Math.abs(entities[i].z - entities[j].z) < 1e-6 && entities[i].layer === entities[j].layer) {
               overlappingCount++;
             }
           }
           
           if (overlappingCount > 10) {
             this.addIssue('rendering', {
               severity: 'info',
               title: 'Many Overlapping Entities',
               description: `${overlappingCount} entities overlap at Z=${entities[i].z} on layer ${entities[i].layer}, may cause Z-fighting.`,
               category: 'Z-Order Issues',
               location: `Line ${entities[i].node.line}`,
               actions: [{ type: 'navigate', data: entities[i].node.id, label: 'Go to Entity' }]
             });
           }
         }
       }

       checkScaleFactors() {
         if (!this.isRuleEnabled('rendering', 'scaleFactors')) return;
         
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'INSERT') {
             const xScale = this.getPropertyValue(node, 41) || 1;
             const yScale = this.getPropertyValue(node, 42) || 1;
             const zScale = this.getPropertyValue(node, 43) || 1;
             
             if (xScale <= 0 || yScale <= 0 || zScale <= 0) {
               this.addIssue('rendering', {
                 severity: 'error',
                 title: 'Invalid Scale Factor',
                 description: `Block insert has invalid scale factors: X=${xScale}, Y=${yScale}, Z=${zScale}`,
                 category: 'Scale Factors',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Insert' }]
               });
             }
             
             if (xScale > 1000 || yScale > 1000 || zScale > 1000) {
               this.addIssue('rendering', {
                 severity: 'warning',
                 title: 'Extreme Scale Factor',
                 description: `Block insert has very large scale factors: X=${xScale}, Y=${yScale}, Z=${zScale}`,
                 category: 'Scale Factors',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Insert' }]
               });
             }
             
             if (xScale < 0.001 || yScale < 0.001 || zScale < 0.001) {
               this.addIssue('rendering', {
                 severity: 'warning',
                 title: 'Very Small Scale Factor',
                 description: `Block insert has very small scale factors: X=${xScale}, Y=${yScale}, Z=${zScale}`,
                 category: 'Scale Factors',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Insert' }]
               });
             }
           }
         });
       }

       checkMaterialProperties() {
         if (!this.isRuleEnabled('rendering', 'materialProperties')) return;
         
         const materials = new Set();
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'MATERIAL') {
             const name = this.getPropertyValue(node, 1);
             if (name) materials.add(name);
           }
           
           const materialHandle = this.getPropertyValue(node, 347);
           if (materialHandle && !this.handleMap.has(materialHandle)) {
             this.addIssue('rendering', {
               severity: 'warning',
               title: 'Broken Material Reference',
               description: `Entity references non-existent material handle: ${materialHandle}`,
               category: 'Material Properties',
               location: `Line ${node.line}`,
               actions: [{ type: 'navigate', data: node.id, label: 'Go to Entity' }]
             });
           }
         });
         
         if (materials.size > 50) {
           this.addIssue('rendering', {
             severity: 'suggestion',
             title: 'Many Materials Defined',
             description: `Drawing defines ${materials.size} materials, consider consolidating for better performance.`,
             category: 'Material Properties',
             location: 'OBJECTS section'
           });
         }
       }

       checkLightingIssues() {
         if (!this.isRuleEnabled('rendering', 'lightingIssues')) return;
         
         let lightCount = 0;
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'LIGHT') {
             lightCount++;
             const intensity = this.getPropertyValue(node, 40);
             const attenuation = this.getPropertyValue(node, 50);
             
             if (intensity !== null && intensity <= 0) {
               this.addIssue('rendering', {
                 severity: 'warning',
                 title: 'Zero Light Intensity',
                 description: 'Light has zero or negative intensity and will not illuminate.',
                 category: 'Lighting',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Light' }]
               });
             }
             
             if (intensity !== null && intensity > 10000) {
               this.addIssue('rendering', {
                 severity: 'warning',
                 title: 'Very High Light Intensity',
                 description: `Light intensity (${intensity}) is very high and may cause rendering issues.`,
                 category: 'Lighting',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Light' }]
               });
             }
           }
         });
         
         if (lightCount > 100) {
           this.addIssue('rendering', {
             severity: 'warning',
             title: 'Excessive Light Count',
             description: `Drawing contains ${lightCount} lights, which may impact rendering performance.`,
             category: 'Lighting',
             location: 'Overall lighting'
           });
         }
       }

       checkTransparencyIssues() {
         if (!this.isRuleEnabled('rendering', 'transparency')) return;
         
         this.traverseTree(this.dxfTree, (node) => {
           const transparency = this.getPropertyValue(node, 440);
           const alpha = this.getPropertyValue(node, 440);
           
           if (transparency !== null) {
             if (transparency < 0 || transparency > 255) {
               this.addIssue('rendering', {
                 severity: 'error',
                 title: 'Invalid Transparency Value',
                 description: `Transparency value (${transparency}) must be between 0-255.`,
                 category: 'Transparency',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Entity' }]
               });
             }
           }
           
           // Check for very high transparency that makes entities invisible
           if (transparency !== null && transparency > 240) {
             this.addIssue('rendering', {
               severity: 'info',
               title: 'Nearly Invisible Entity',
               description: `Entity has very high transparency (${transparency}) and may be difficult to see.`,
               category: 'Transparency',
               location: `Line ${node.line}`,
               actions: [{ type: 'navigate', data: node.id, label: 'Go to Entity' }]
             });
           }
         });
       }

       // Additional Performance Analysis Methods
       checkComplexGeometry() {
         if (!this.isRuleEnabled('performance', 'complexGeometry')) return;
         
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'POLYLINE' || node.type === 'LWPOLYLINE') {
             let vertexCount = 0;
             if (node.children) {
               vertexCount = node.children.filter(child => child.type === 'VERTEX').length;
             }
             
             if (vertexCount > 10000) {
               this.addIssue('performance', {
                 severity: 'warning',
                 title: 'Very Complex Polyline',
                 description: `Polyline has ${vertexCount} vertices, which may impact performance.`,
                 category: 'Complex Geometry',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Polyline' }]
               });
             }
           }
           
           if (node.type === 'SPLINE') {
             const degreeValue = this.getPropertyValue(node, 71);
             const controlPointCount = this.getPropertyValue(node, 73);
             const knotCount = this.getPropertyValue(node, 74);
             
             if (controlPointCount > 1000) {
               this.addIssue('performance', {
                 severity: 'warning',
                 title: 'Very Complex Spline',
                 description: `Spline has ${controlPointCount} control points, which may impact performance.`,
                 category: 'Complex Geometry',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Spline' }]
               });
             }
           }
         });
       }

       checkMemoryUsage() {
         if (!this.isRuleEnabled('performance', 'memoryUsage')) return;
         
         let totalEntities = 0;
         let totalProperties = 0;
         let estimatedSize = 0;
         
         this.traverseTree(this.dxfTree, (node) => {
           totalEntities++;
           if (node.properties) {
             totalProperties += node.properties.length;
             node.properties.forEach(prop => {
               if (prop.value) {
                 estimatedSize += prop.value.toString().length * 2; // Rough UTF-16 estimate
               }
             });
           }
         });
         
         const estimatedMB = estimatedSize / (1024 * 1024);
         
         if (estimatedMB > 100) {
           this.addIssue('performance', {
             severity: 'warning',
             title: 'High Memory Usage',
             description: `Estimated memory usage is ${estimatedMB.toFixed(1)} MB, which may cause performance issues.`,
             category: 'Memory Usage',
             location: 'Overall file'
           });
         }
         
         if (totalEntities > 100000) {
           this.addIssue('performance', {
             severity: 'info',
             title: 'Very Large Entity Count',
             description: `Drawing contains ${totalEntities} entities, consider optimizing for better performance.`,
             category: 'Memory Usage',
             location: 'Overall file'
           });
         }
       }

       // Additional Text Analysis Methods
       checkTextOverlap() {
         if (!this.isRuleEnabled('text', 'textOverlap')) return;
         
         const textEntities = [];
         this.traverseTree(this.dxfTree, (node) => {
           if (['TEXT', 'MTEXT'].includes(node.type)) {
             const x = this.getPropertyValue(node, 10);
             const y = this.getPropertyValue(node, 20);
             const height = this.getPropertyValue(node, 40);
             const text = this.getPropertyValue(node, 1);
             
             if (x !== null && y !== null && height !== null && text) {
               textEntities.push({ node, x, y, height, text });
             }
           }
         });
         
         for (let i = 0; i < textEntities.length; i++) {
           for (let j = i + 1; j < textEntities.length; j++) {
             const text1 = textEntities[i];
             const text2 = textEntities[j];
             
             const distance = Math.sqrt(
               Math.pow(text1.x - text2.x, 2) + Math.pow(text1.y - text2.y, 2)
             );
             
             const avgHeight = (text1.height + text2.height) / 2;
             
             if (distance < avgHeight) {
               this.addIssue('text', {
                 severity: 'suggestion',
                 title: 'Overlapping Text Entities',
                 description: `Text entities may overlap (distance: ${distance.toFixed(2)}, avg height: ${avgHeight.toFixed(2)}).`,
                 category: 'Text Overlap',
                 location: `Line ${text1.node.line}`,
                 actions: [{ type: 'navigate', data: text1.node.id, label: 'Go to Text' }]
               });
               break; // Only report once per text entity
             }
           }
         }
       }

       checkTextReadability() {
         if (!this.isRuleEnabled('text', 'textReadability')) return;
         
         this.traverseTree(this.dxfTree, (node) => {
           if (['TEXT', 'MTEXT'].includes(node.type)) {
             const height = this.getPropertyValue(node, 40);
             
             if (height !== null) {
               if (height < 0.1) {
                 this.addIssue('text', {
                   severity: 'warning',
                   title: 'Very Small Text',
                   description: `Text height (${height}) may be too small to read when printed.`,
                   category: 'Text Readability',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
                 });
               }
               
               if (height > 1000) {
                 this.addIssue('text', {
                   severity: 'warning',
                   title: 'Very Large Text',
                   description: `Text height (${height}) is extremely large and may cause display issues.`,
                   category: 'Text Readability',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
                 });
               }
             }
           }
         });
       }

       // Additional Security Analysis Methods
       checkSuspiciousPatterns() {
         if (!this.isRuleEnabled('security', 'suspiciousPatterns')) return;
         
         const suspiciousPatterns = [
           /javascript:/i,
           /vbscript:/i,
           /data:text\/html/i,
           /data:application\/octet-stream/i,
           /<script/i,
           /eval\(/i,
           /document\.write/i,
           /\.exe$/i,
           /\.bat$/i,
           /\.cmd$/i,
           /\.scr$/i,
           /\.pif$/i
         ];
         
         this.traverseTree(this.dxfTree, (node) => {
           if (node.properties) {
             node.properties.forEach(prop => {
               if (prop.value && typeof prop.value === 'string') {
                 suspiciousPatterns.forEach(pattern => {
                   if (pattern.test(prop.value)) {
                     this.addIssue('security', {
                       severity: 'warning',
                       title: 'Suspicious Content Pattern',
                       description: `Potentially suspicious content found: "${prop.value.substring(0, 100)}..."`,
                       category: 'Suspicious Patterns',
                       location: `Line ${node.line}`,
                       actions: [{ type: 'navigate', data: node.id, label: 'Go to Entity' }]
                     });
                   }
                 });
               }
             });
           }
         });
       }

       // Additional Best Practices Analysis
       checkDrawingOrganization() {
         if (!this.isRuleEnabled('bestPractices', 'drawingOrganization')) return;
         
         let entitiesInModelSpace = 0;
         let entitiesInPaperSpace = 0;
         let entitiesOnLayer0 = 0;
         
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type && ['LINE', 'CIRCLE', 'ARC', 'POLYLINE', 'TEXT', 'MTEXT'].includes(node.type)) {
             const layer = this.getPropertyValue(node, 8);
             const paperSpace = this.getPropertyValue(node, 67);
             
             if (paperSpace === 1) {
               entitiesInPaperSpace++;
             } else {
               entitiesInModelSpace++;
             }
             
             if (layer === '0') {
               entitiesOnLayer0++;
             }
           }
         });
         
         if (entitiesOnLayer0 > entitiesInModelSpace * 0.5) {
           this.addIssue('bestPractices', {
             severity: 'suggestion',
             title: 'Too Many Entities on Layer 0',
             description: `${entitiesOnLayer0} entities are on layer 0. Consider organizing entities onto meaningful layers.`,
             category: 'Drawing Organization',
             location: 'Layer organization'
           });
         }
         
         if (entitiesInModelSpace > 0 && entitiesInPaperSpace > 0) {
           this.addIssue('bestPractices', {
             severity: 'info',
             title: 'Mixed Model and Paper Space Usage',
             description: 'Drawing contains entities in both model space and paper space.',
             category: 'Drawing Organization',
             location: 'Space organization'
           });
         }
       }

              // ====================================
       // TEXT ISSUES ANALYSIS
       // ====================================

       checkTextGeometry() {
         this.traverseTree(this.dxfTree, (node) => {
           if (['TEXT', 'MTEXT', 'ATTDEF', 'ATTRIB'].includes(node.type)) {
             const height = this.getPropertyValue(node, 40);
             const insertionX = this.getPropertyValue(node, 10);
             const insertionY = this.getPropertyValue(node, 20);
             const rotation = this.getPropertyValue(node, 50);
             const widthFactor = this.getPropertyValue(node, 41);
             const obliqueAngle = this.getPropertyValue(node, 51);
             
             if (height !== null && height <= 0) {
               this.addIssue('text', {
                 severity: 'error',
                 title: 'Invalid Text Height',
                 description: `Text height (${height}) must be positive for text to be visible.`,
                 category: 'Text Geometry',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
               });
             }
             
             if (height !== null && height > 1000) {
               this.addIssue('text', {
                 severity: 'warning',
                 title: 'Very Large Text Height',
                 description: `Text height (${height}) is unusually large and may cause rendering issues.`,
                 category: 'Text Geometry',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
               });
             }
             
             if (insertionX !== null && insertionY !== null) {
               if (Math.abs(insertionX) > 1e12 || Math.abs(insertionY) > 1e12) {
                 this.addIssue('text', {
                   severity: 'warning',
                   title: 'Text at Extreme Coordinates',
                   description: `Text insertion point (${insertionX}, ${insertionY}) is at extreme coordinates.`,
                   category: 'Text Geometry',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
                 });
               }
             }
             
             if (widthFactor !== null && widthFactor <= 0) {
               this.addIssue('text', {
                 severity: 'error',
                 title: 'Invalid Text Width Factor',
                 description: `Text width factor (${widthFactor}) must be positive.`,
                 category: 'Text Geometry',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
               });
             }
             
             if (obliqueAngle !== null && Math.abs(obliqueAngle) > 85) {
               this.addIssue('text', {
                 severity: 'warning',
                 title: 'Extreme Text Oblique Angle',
                 description: `Text oblique angle (${obliqueAngle}°) is very steep and may be difficult to read.`,
                 category: 'Text Geometry',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
               });
             }
           }
         });
       }

       checkTextStyles() {
         const definedStyles = new Set();
         const usedStyles = new Set();
         
         // Collect style definitions
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'STYLE') {
             const styleName = this.getPropertyValue(node, 2);
             const fontFile = this.getPropertyValue(node, 3);
             const bigFontFile = this.getPropertyValue(node, 4);
             const fixedHeight = this.getPropertyValue(node, 40);
             const widthFactor = this.getPropertyValue(node, 41);
             const obliqueAngle = this.getPropertyValue(node, 50);
             
             if (styleName) {
               definedStyles.add(styleName);
               
               if (!fontFile || fontFile === '') {
                 this.addIssue('text', {
                   severity: 'error',
                   title: `Missing Font File in Style: ${styleName}`,
                   description: 'Text style is missing font file specification.',
                   category: 'Text Styles',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Style' }]
                 });
               }
               
               if (fixedHeight !== null && fixedHeight < 0) {
                 this.addIssue('text', {
                   severity: 'error',
                   title: `Invalid Fixed Height in Style: ${styleName}`,
                   description: `Text style fixed height (${fixedHeight}) cannot be negative.`,
                   category: 'Text Styles',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Style' }]
                 });
               }
               
               if (widthFactor !== null && widthFactor <= 0) {
                 this.addIssue('text', {
                   severity: 'error',
                   title: `Invalid Width Factor in Style: ${styleName}`,
                   description: `Text style width factor (${widthFactor}) must be positive.`,
                   category: 'Text Styles',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Style' }]
                 });
               }
             }
           }
           
           // Collect style usage
           if (['TEXT', 'MTEXT', 'ATTDEF', 'ATTRIB'].includes(node.type)) {
             const styleName = this.getPropertyValue(node, 7);
             if (styleName && styleName !== 'BYLAYER' && styleName !== 'BYBLOCK') {
               usedStyles.add(styleName);
             }
           }
         });
         
         // Check for missing style definitions
         usedStyles.forEach(styleName => {
           if (!definedStyles.has(styleName)) {
             this.addIssue('text', {
               severity: 'error',
               title: `Undefined Text Style: ${styleName}`,
               description: `Text style "${styleName}" is used but not defined.`,
               category: 'Text Styles',
               location: 'Text entities using this style'
             });
           }
         });
       }

       checkTextFormatting() {
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'TEXT') {
             const text = this.getPropertyValue(node, 1);
             const alignment = this.getPropertyValue(node, 72);
             const verticalAlignment = this.getPropertyValue(node, 73);
             
             if (!text || text === '') {
               this.addIssue('text', {
                 severity: 'warning',
                 title: 'Empty Text Entity',
                 description: 'Text entity has no content and will not be visible.',
                 category: 'Text Formatting',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
               });
             }
             
             if (text && text.length > 256) {
               this.addIssue('text', {
                 severity: 'warning',
                 title: 'Very Long Text Content',
                 description: `Text content is ${text.length} characters long, which may cause display issues.`,
                 category: 'Text Formatting',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
               });
             }
             
             if (alignment !== null && (alignment < 0 || alignment > 5)) {
               this.addIssue('text', {
                 severity: 'error',
                 title: 'Invalid Text Alignment',
                 description: `Text horizontal alignment (${alignment}) must be between 0 and 5.`,
                 category: 'Text Formatting',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
               });
             }
             
             if (verticalAlignment !== null && (verticalAlignment < 0 || verticalAlignment > 3)) {
               this.addIssue('text', {
                 severity: 'error',
                 title: 'Invalid Text Vertical Alignment',
                 description: `Text vertical alignment (${verticalAlignment}) must be between 0 and 3.`,
                 category: 'Text Formatting',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
               });
             }
           }
         });
       }

       checkMTextFormatting() {
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'MTEXT') {
             const text = this.getPropertyValue(node, 1);
             const additionalText = node.properties?.filter(p => p.code === 3).map(p => p.value).join('') || '';
             const fullText = (text || '') + additionalText;
             const width = this.getPropertyValue(node, 41);
             const lineSpacing = this.getPropertyValue(node, 44);
             const attachment = this.getPropertyValue(node, 71);
             
             if (!fullText || fullText === '') {
               this.addIssue('text', {
                 severity: 'warning',
                 title: 'Empty MTEXT Entity',
                 description: 'MTEXT entity has no content and will not be visible.',
                 category: 'MTEXT Formatting',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to MTEXT' }]
               });
             }
             
             if (width !== null && width <= 0) {
               this.addIssue('text', {
                 severity: 'error',
                 title: 'Invalid MTEXT Width',
                 description: `MTEXT width (${width}) must be positive.`,
                 category: 'MTEXT Formatting',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to MTEXT' }]
               });
             }
             
             if (lineSpacing !== null && lineSpacing <= 0) {
               this.addIssue('text', {
                 severity: 'warning',
                 title: 'Invalid MTEXT Line Spacing',
                 description: `MTEXT line spacing (${lineSpacing}) should be positive.`,
                 category: 'MTEXT Formatting',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to MTEXT' }]
               });
             }
             
             if (attachment !== null && (attachment < 1 || attachment > 9)) {
               this.addIssue('text', {
                 severity: 'error',
                 title: 'Invalid MTEXT Attachment Point',
                 description: `MTEXT attachment point (${attachment}) must be between 1 and 9.`,
                 category: 'MTEXT Formatting',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to MTEXT' }]
               });
             }
             
             // Check for malformed formatting codes
             if (fullText) {
               this.checkMTextFormattingCodes(node, fullText);
             }
           }
         });
       }

       checkMTextFormattingCodes(node, text) {
         // Ensure text is a string
         if (!text || typeof text !== 'string') {
           return;
         }
         
         const formatPatterns = [
           { pattern: /\\[Pp];/g, name: 'paragraph break' },
           { pattern: /\\[Ll]/g, name: 'underline' },
           { pattern: /\\[Oo]/g, name: 'overline' },
           { pattern: /\\[Kk]/g, name: 'strikethrough' },
           { pattern: /\\[Ff][^;]*;/g, name: 'font change' },
           { pattern: /\\[Hh][^;]*;/g, name: 'height change' },
           { pattern: /\\[Cc][^;]*;/g, name: 'color change' },
           { pattern: /\\[Tt][^;]*;/g, name: 'tracking' },
           { pattern: /\\[Qq][^;]*;/g, name: 'oblique angle' }
         ];
         
         // Check for unclosed formatting codes
         const openCodes = text.match(/\\[A-Za-z][^;\\]*$/);
         if (openCodes) {
           this.addIssue('text', {
             severity: 'warning',
             title: 'Unclosed MTEXT Formatting Code',
             description: `MTEXT contains unclosed formatting code: "${openCodes[0]}"`,
             category: 'MTEXT Formatting',
             location: `Line ${node.line}`,
             actions: [{ type: 'navigate', data: node.id, label: 'Go to MTEXT' }]
           });
         }
         
         // Check for malformed stacking
         const stackPattern = /\\S[^;]*\\;/g;
         const stackMatches = text.match(stackPattern);
         if (stackMatches) {
           stackMatches.forEach(match => {
             if (!match.includes('#') && !match.includes('^') && !match.includes('/')) {
               this.addIssue('text', {
                 severity: 'warning',
                 title: 'Malformed MTEXT Stack Code',
                 description: `MTEXT contains malformed stack code: "${match}"`,
                 category: 'MTEXT Formatting',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to MTEXT' }]
               });
             }
           });
         }
       }

       checkFontAvailability() {
         const fontFiles = new Set();
         
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type === 'STYLE') {
             const fontFile = this.getPropertyValue(node, 3);
             const bigFontFile = this.getPropertyValue(node, 4);
             
             if (fontFile && fontFile !== '') {
               fontFiles.add(fontFile);
               
               // Check for common font file issues
               if (!fontFile.toLowerCase().endsWith('.shx') && !fontFile.toLowerCase().endsWith('.ttf')) {
                 this.addIssue('text', {
                   severity: 'warning',
                   title: `Unusual Font File Extension: ${fontFile}`,
                   description: 'Font file should typically have .shx or .ttf extension.',
                   category: 'Font Availability',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Style' }]
                 });
               }
               
               if (fontFile.includes(' ')) {
                 this.addIssue('text', {
                   severity: 'warning',
                   title: `Font File with Spaces: ${fontFile}`,
                   description: 'Font file name contains spaces which may cause loading issues.',
                   category: 'Font Availability',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Style' }]
                 });
               }
             }
             
             if (bigFontFile && bigFontFile !== '') {
               fontFiles.add(bigFontFile);
             }
           }
         });
         
         if (fontFiles.size > 20) {
           this.addIssue('text', {
             severity: 'suggestion',
             title: 'Many Font Files Referenced',
             description: `Drawing references ${fontFiles.size} different font files, consider consolidating.`,
             category: 'Font Availability',
             location: 'STYLE table'
           });
         }
       }

       checkTextAlignment() {
         this.traverseTree(this.dxfTree, (node) => {
           if (['TEXT', 'MTEXT'].includes(node.type)) {
             const justification = this.getPropertyValue(node, 72);
             const secondAlignX = this.getPropertyValue(node, 11);
             const secondAlignY = this.getPropertyValue(node, 21);
             
             if (justification !== null && justification > 0) {
               // If justification is not "left", check for second alignment point
               if (secondAlignX === null && secondAlignY === null) {
                 this.addIssue('text', {
                   severity: 'warning',
                   title: 'Missing Second Alignment Point',
                   description: `Text with justification ${justification} is missing second alignment point (codes 11, 21).`,
                   category: 'Text Alignment',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
                 });
               }
             }
           }
         });
       }

       checkTextUnicode() {
         this.traverseTree(this.dxfTree, (node) => {
           if (['TEXT', 'MTEXT', 'ATTDEF', 'ATTRIB'].includes(node.type)) {
             const text = this.getPropertyValue(node, 1);
             
             if (text && typeof text === 'string') {
               // Check for Unicode escape sequences
               const unicodePattern = /\\U\+[0-9A-Fa-f]{4}/g;
               const unicodeMatches = text.match(unicodePattern);
               
               if (unicodeMatches) {
                 this.addIssue('text', {
                   severity: 'info',
                   title: 'Text Contains Unicode Characters',
                   description: `Text contains ${unicodeMatches.length} Unicode escape sequence(s), ensure proper font support.`,
                   category: 'Text Unicode',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
                 });
               }
               
               // Check for non-ASCII characters
               const nonAsciiPattern = /[^\x00-\x7F]/g;
               const nonAsciiMatches = text.match(nonAsciiPattern);
               
               if (nonAsciiMatches && nonAsciiMatches.length > 0) {
                 this.addIssue('text', {
                   severity: 'info',
                   title: 'Text Contains Non-ASCII Characters',
                   description: `Text contains ${nonAsciiMatches.length} non-ASCII character(s), verify encoding compatibility.`,
                   category: 'Text Unicode',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
                 });
               }
               
               // Check for control characters
               const controlPattern = /[\x00-\x1F\x7F]/g;
               const controlMatches = text.match(controlPattern);
               
               if (controlMatches && controlMatches.length > 0) {
                 this.addIssue('text', {
                   severity: 'warning',
                   title: 'Text Contains Control Characters',
                   description: 'Text contains control characters which may cause display issues.',
                   category: 'Text Unicode',
                   location: `Line ${node.line}`,
                   actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
                 });
               }
             }
           }
         });
       }

       checkTextVisibility() {
         this.traverseTree(this.dxfTree, (node) => {
           if (['TEXT', 'MTEXT', 'ATTDEF', 'ATTRIB'].includes(node.type)) {
             const layer = this.getPropertyValue(node, 8);
             const color = this.getPropertyValue(node, 62);
             
             // Check if text is on a frozen or off layer
             if (layer && layer !== '0') {
               // This would require cross-referencing with layer definitions
               // For now, we'll check if the text entity itself has visibility issues
             }
             
             // Check for invisible text (color 0 or negative)
             if (color !== null && color <= 0) {
               this.addIssue('text', {
                 severity: 'info',
                 title: 'Text with Invisible Color',
                 description: `Text color (${color}) may make text invisible or follow layer color.`,
                 category: 'Text Visibility',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Text' }]
               });
             }
           }
         });
       }

       checkDimensionText() {
         this.traverseTree(this.dxfTree, (node) => {
           if (node.type && node.type.includes('DIMENSION')) {
             const dimText = this.getPropertyValue(node, 1);
             const textHeight = this.getPropertyValue(node, 140);
             const textStyle = this.getPropertyValue(node, 7);
             
             if (dimText === '<>') {
               // This is the default measured text, which is normal
             } else if (dimText === '') {
               this.addIssue('text', {
                 severity: 'info',
                 title: 'Dimension with Suppressed Text',
                 description: 'Dimension text is suppressed and will not display measurement.',
                 category: 'Dimension Text',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Dimension' }]
               });
             }
             
             if (textHeight !== null && textHeight <= 0) {
               this.addIssue('text', {
                 severity: 'error',
                 title: 'Invalid Dimension Text Height',
                 description: `Dimension text height (${textHeight}) must be positive.`,
                 category: 'Dimension Text',
                 location: `Line ${node.line}`,
                 actions: [{ type: 'navigate', data: node.id, label: 'Go to Dimension' }]
               });
             }
           }
         });
       }

       // Helper method to get property value by code
       getPropertyValue(node, code) {
         if (!node.properties) return null;
         const prop = node.properties.find(p => parseInt(p.code) === code);
         if (!prop || prop.value === undefined || prop.value === null) return null;
         
         // For certain group codes that should always be strings, don't parse as numbers
         const stringCodes = [1, 2, 3, 6, 7, 8, 100]; // Text, name, additional text, linetype, style, layer, subclass
         if (stringCodes.includes(parseInt(code))) {
           return String(prop.value);
         }
         
         // Try to parse as number, but return string if it fails
         const numValue = parseFloat(prop.value);
         return isNaN(numValue) ? String(prop.value) : numValue;
       }

       async performanceAnalysis() {
         this.checkFileSize();
         this.checkEntityCount();
         this.checkNestingDepth();
         this.checkDuplicateData();
         this.checkUnusedDefinitions();
         this.checkComplexGeometry();
         this.checkMemoryUsage();
       }

      checkFileSize() {
        // Estimate file size based on content
        let estimatedSize = 0;
        this.traverseTree(this.dxfTree, (node) => {
          estimatedSize += node.type ? node.type.length : 0;
          if (node.properties) {
            node.properties.forEach(prop => {
              estimatedSize += prop.value ? prop.value.length : 0;
            });
          }
        });
        
        if (estimatedSize > 50 * 1024 * 1024) { // 50MB
          this.addIssue('performance', {
            severity: 'warning',
            title: 'Large File Size',
            description: `DXF file is approximately ${Math.round(estimatedSize / (1024 * 1024))} MB, which may cause performance issues.`,
            category: 'File Size',
            location: 'Overall file'
          });
        }
      }

      checkEntityCount() {
        let entityCount = 0;
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type && !['SECTION', 'ENDSEC', 'TABLE', 'ENDTAB'].includes(node.type)) {
            entityCount++;
          }
        });
        
        if (entityCount > 100000) {
          this.addIssue('performance', {
            severity: 'warning',
            title: 'High Entity Count',
            description: `File contains ${entityCount.toLocaleString()} entities, which may impact rendering performance.`,
            category: 'Entity Count',
            location: 'Overall file'
          });
        }
      }

      checkNestingDepth() {
        let maxDepth = 0;
        
        const checkDepth = (nodes, depth = 0) => {
          maxDepth = Math.max(maxDepth, depth);
          nodes.forEach(node => {
            if (node.children && node.children.length > 0) {
              checkDepth(node.children, depth + 1);
            }
          });
        };
        
        checkDepth(this.dxfTree);
        
        if (maxDepth > 10) {
          this.addIssue('performance', {
            severity: 'warning',
            title: 'Deep Nesting Structure',
            description: `DXF structure has ${maxDepth} levels of nesting, which may impact parsing performance.`,
            category: 'Structure Complexity',
            location: 'Overall file'
          });
        }
      }

      checkDuplicateData() {
        const stringValues = new Map();
        let duplicateCount = 0;
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.properties) {
            node.properties.forEach(prop => {
              if (prop.value && prop.value.length > 10) {
                const existing = stringValues.get(prop.value);
                if (existing) {
                  duplicateCount++;
                } else {
                  stringValues.set(prop.value, [{ node, prop }]);
                }
              }
            });
          }
        });
        
        if (duplicateCount > 100) {
          this.addIssue('performance', {
            severity: 'suggestion',
            title: 'Potential Data Duplication',
            description: `Found ${duplicateCount} duplicate string values, consider using blocks or references to reduce redundancy.`,
            category: 'Data Optimization',
            location: 'Overall file'
          });
        }
      }

      checkUnusedDefinitions() {
        const definitions = new Map();
        const references = new Set();
        
        // Collect definitions
        this.traverseTree(this.dxfTree, (node) => {
          if (['BLOCK', 'LTYPE', 'LAYER', 'STYLE', 'DIMSTYLE'].includes(node.type)) {
            const nameProperty = node.properties?.find(p => p.code === 2);
            if (nameProperty) {
              definitions.set(nameProperty.value, node);
            }
          }
          
          // Collect references
          if (node.properties) {
            node.properties.forEach(prop => {
              if ([2, 6, 7, 8].includes(parseInt(prop.code)) && prop.value) {
                references.add(prop.value);
              }
            });
          }
        });
        
        // Check for unused definitions
        definitions.forEach((node, name) => {
          if (!references.has(name) && !['0', 'STANDARD', 'CONTINUOUS'].includes(name)) {
            this.addIssue('performance', {
              severity: 'suggestion',
              title: `Unused Definition: ${name}`,
              description: `${node.type} "${name}" is defined but never used.`,
              category: 'Unused Definitions',
              location: `Line ${node.line}`,
              actions: [{ type: 'navigate', data: node.id, label: 'Go to Definition' }]
            });
          }
        });
      }

      async dxfComplianceChecks() {
        this.checkDXFVersion();
        this.checkRequiredVariables();
        this.checkEntityTypes();
        this.checkPropertyValues();
        this.checkUnits();
      }

      checkDXFVersion() {
        if (!this.isRuleEnabled('compliance', 'dxfVersion')) return;
        
        let versionFound = false;
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type === 'HEADER') {
            const versionVar = this.findVariableInHeader(node, '$ACADVER');
            if (versionVar) {
              versionFound = true;
              // Check if version is supported
              const supportedVersions = ['AC1009', 'AC1012', 'AC1014', 'AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'];
              if (!supportedVersions.includes(versionVar.value)) {
                this.addIssue('compliance', {
                  severity: 'warning',
                  title: `Unsupported DXF Version: ${versionVar.value}`,
                  description: 'This DXF version may not be fully supported by all applications.',
                  category: 'DXF Version',
                  location: 'HEADER section'
                });
              }
            }
          }
        });
        
        if (!versionFound) {
          this.addIssue('compliance', {
            severity: 'error',
            title: 'Missing DXF Version',
            description: 'DXF file does not specify version ($ACADVER variable).',
            category: 'DXF Version',
            location: 'HEADER section'
          });
        }
      }

      findVariableInHeader(headerNode, varName) {
        if (!headerNode.children) return null;
        
        for (let i = 0; i < headerNode.children.length; i++) {
          const child = headerNode.children[i];
          if (child.type === varName) {
            const valueProperty = child.properties?.find(p => [1, 10, 40, 70].includes(parseInt(p.code)));
            return valueProperty;
          }
        }
        return null;
      }

      checkRequiredVariables() {
        if (!this.isRuleEnabled('compliance', 'requiredVariables')) return;
        
        const requiredVars = ['$ACADVER', '$HANDSEED', '$DWGCODEPAGE'];
        const foundVars = new Set();
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type === 'HEADER' && node.children) {
            node.children.forEach(child => {
              if (requiredVars.includes(child.type)) {
                foundVars.add(child.type);
              }
            });
          }
        });
        
        requiredVars.forEach(varName => {
          if (!foundVars.has(varName)) {
            this.addIssue('compliance', {
              severity: 'error',
              title: `Missing Required Variable: ${varName}`,
              description: `Header variable ${varName} is required for DXF compliance.`,
              category: 'Header Variables',
              location: 'HEADER section'
            });
          }
        });
      }

      checkEntityTypes() {
        if (!this.isRuleEnabled('compliance', 'entityTypes')) return;
        
        const validEntityTypes = new Set([
          'LINE', 'POINT', 'CIRCLE', 'ARC', 'ELLIPSE', 'POLYLINE', 'LWPOLYLINE',
          'SPLINE', 'TEXT', 'MTEXT', 'INSERT', 'BLOCK', 'SOLID', 'FACE3D',
          'HATCH', 'DIMENSION', 'LEADER', 'TOLERANCE', 'MLINE', 'RAY', 'XLINE',
          'REGION', '3DFACE', '3DSOLID', 'BODY', 'SURFACE', 'PLANESURFACE',
          'ACAD_PROXY_ENTITY', 'VIEWPORT', 'MESH', 'LIGHT', 'SUN'
        ]);
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type && !['SECTION', 'ENDSEC', 'TABLE', 'ENDTAB', 'ENDBLK', 'SEQEND', 'EOF'].includes(node.type)
              && !node.type.startsWith('$') && !validEntityTypes.has(node.type)) {
            this.addIssue('compliance', {
              severity: 'warning',
              title: `Unknown Entity Type: ${node.type}`,
              description: `Entity type "${node.type}" is not in the standard DXF specification.`,
              category: 'Entity Types',
              location: `Line ${node.line}`,
              actions: [{ type: 'navigate', data: node.id, label: 'Go to Entity' }]
            });
          }
        });
      }

      checkPropertyValues() {
        if (!this.isRuleEnabled('compliance', 'propertyValues')) return;
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.properties) {
            node.properties.forEach(prop => {
              const code = parseInt(prop.code);
              
              // Check color codes (62)
              if (code === 62) {
                const colorValue = parseInt(prop.value);
                if (isNaN(colorValue) || colorValue < 0 || colorValue > 256) {
                  this.addIssue('compliance', {
                    severity: 'error',
                    title: `Invalid Color Code: ${prop.value}`,
                    description: 'Color codes must be integers between 0 and 256.',
                    category: 'Property Values',
                    location: `Line ${prop.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: 'Go to Property' }]
                  });
                }
              }
              
              // Check line type scale (48)
              if (code === 48) {
                const scaleValue = parseFloat(prop.value);
                if (isNaN(scaleValue) || scaleValue <= 0) {
                  this.addIssue('compliance', {
                    severity: 'error',
                    title: `Invalid Line Type Scale: ${prop.value}`,
                    description: 'Line type scale must be a positive number.',
                    category: 'Property Values',
                    location: `Line ${prop.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: 'Go to Property' }]
                  });
                }
              }
            });
          }
        });
      }

      checkUnits() {
        let unitsFound = false;
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type === 'HEADER') {
            const unitsVar = this.findVariableInHeader(node, '$INSUNITS');
            if (unitsVar) {
              unitsFound = true;
              const unitsValue = parseInt(unitsVar.value);
              if (unitsValue === 0) {
                this.addIssue('compliance', {
                  severity: 'warning',
                  title: 'Units Not Specified',
                  description: 'Drawing units are set to "Unitless" which may cause scaling issues.',
                  category: 'Units',
                  location: 'HEADER section'
                });
              }
            }
          }
        });
        
        if (!unitsFound) {
          this.addIssue('compliance', {
            severity: 'suggestion',
            title: 'No Units Variable',
            description: 'Consider specifying drawing units ($INSUNITS) for better compatibility.',
            category: 'Units',
            location: 'HEADER section'
          });
        }
      }

      async bestPracticesAnalysis() {
        this.checkLayerUsage();
        this.checkBlockUsage();
        this.checkTextStyles();
        this.checkLineTypes();
        this.checkNamingConventions();
        this.checkDrawingOrganization();
      }

      checkLayerUsage() {
        const layers = new Set();
        const usedLayers = new Set();
        
        // Collect layer definitions
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type === 'LAYER') {
            const nameProperty = node.properties?.find(p => p.code === 2);
            if (nameProperty) {
              layers.add(nameProperty.value);
            }
          }
          
          // Check layer usage
          if (node.properties) {
            const layerProperty = node.properties.find(p => p.code === 8);
            if (layerProperty) {
              usedLayers.add(layerProperty.value);
            }
          }
        });
        
        // Check for entities on layer 0
        let entitiesOnLayer0 = 0;
        this.traverseTree(this.dxfTree, (node) => {
          if (node.properties) {
            const layerProperty = node.properties.find(p => p.code === 8);
            if (layerProperty && layerProperty.value === '0') {
              entitiesOnLayer0++;
            }
          }
        });
        
        if (entitiesOnLayer0 > 10) {
          this.addIssue('bestPractices', {
            severity: 'suggestion',
            title: 'Many Entities on Layer 0',
            description: `${entitiesOnLayer0} entities are on layer 0. Consider organizing content on named layers.`,
            category: 'Layer Organization',
            location: 'Overall file'
          });
        }
        
        // Check for unused layers
        layers.forEach(layerName => {
          if (!usedLayers.has(layerName) && layerName !== '0') {
            this.addIssue('bestPractices', {
              severity: 'suggestion',
              title: `Unused Layer: ${layerName}`,
              description: `Layer "${layerName}" is defined but contains no entities.`,
              category: 'Layer Organization',
              location: 'LAYER table'
            });
          }
        });
      }

      checkBlockUsage() {
        const blockDefinitions = new Map();
        const blockUsage = new Map();
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type === 'BLOCK') {
            const nameProperty = node.properties?.find(p => p.code === 2);
            if (nameProperty) {
              blockDefinitions.set(nameProperty.value, 0);
            }
          } else if (node.type === 'INSERT') {
            const nameProperty = node.properties?.find(p => p.code === 2);
            if (nameProperty) {
              const count = blockUsage.get(nameProperty.value) || 0;
              blockUsage.set(nameProperty.value, count + 1);
            }
          }
        });
        
        // Check for blocks that could benefit from more usage
        blockUsage.forEach((count, blockName) => {
          if (count === 1) {
            this.addIssue('bestPractices', {
              severity: 'suggestion',
              title: `Single-Use Block: ${blockName}`,
              description: `Block "${blockName}" is only used once. Consider if it adds value over a simple group.`,
              category: 'Block Optimization',
              location: 'Block usage'
            });
          }
        });
      }

      checkTextStyles() {
        const textStyles = new Set();
        const usedStyles = new Set();
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type === 'STYLE') {
            const nameProperty = node.properties?.find(p => p.code === 2);
            if (nameProperty) {
              textStyles.add(nameProperty.value);
            }
          } else if (['TEXT', 'MTEXT'].includes(node.type)) {
            const styleProperty = node.properties?.find(p => p.code === 7);
            if (styleProperty) {
              usedStyles.add(styleProperty.value);
            }
          }
        });
        
        if (textStyles.size > 10) {
          this.addIssue('bestPractices', {
            severity: 'suggestion',
            title: 'Many Text Styles',
            description: `File contains ${textStyles.size} text styles. Consider standardizing to fewer styles.`,
            category: 'Style Management',
            location: 'STYLE table'
          });
        }
      }

      checkLineTypes() {
        const lineTypes = new Set();
        const usedLineTypes = new Set();
        
        this.traverseTree(this.dxfTree, (node) => {
          if (node.type === 'LTYPE') {
            const nameProperty = node.properties?.find(p => p.code === 2);
            if (nameProperty) {
              lineTypes.add(nameProperty.value);
            }
          }
          
          if (node.properties) {
            const ltypeProperty = node.properties.find(p => p.code === 6);
            if (ltypeProperty) {
              usedLineTypes.add(ltypeProperty.value);
            }
          }
        });
        
        if (lineTypes.size > 20) {
          this.addIssue('bestPractices', {
            severity: 'suggestion',
            title: 'Many Line Types',
            description: `File contains ${lineTypes.size} line types. Consider using fewer, standard line types.`,
            category: 'Style Management',
            location: 'LTYPE table'
          });
        }
      }

      checkNamingConventions() {
        const checkNames = (nodeType, nameCode) => {
          this.traverseTree(this.dxfTree, (node) => {
            if (node.type === nodeType) {
              const nameProperty = node.properties?.find(p => p.code === nameCode);
              if (nameProperty) {
                const name = nameProperty.value;
                
                // Check for special characters
                if (/[<>:"/\\|?*]/.test(name)) {
                  this.addIssue('bestPractices', {
                    severity: 'warning',
                    title: `Invalid Characters in ${nodeType} Name`,
                    description: `${nodeType} name "${name}" contains special characters that may cause issues.`,
                    category: 'Naming Conventions',
                    location: `Line ${node.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: `Go to ${nodeType}` }]
                  });
                }
                
                // Check for very long names
                if (name.length > 255) {
                  this.addIssue('bestPractices', {
                    severity: 'warning',
                    title: `Very Long ${nodeType} Name`,
                    description: `${nodeType} name "${name}" is ${name.length} characters long, which may cause compatibility issues.`,
                    category: 'Naming Conventions',
                    location: `Line ${node.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: `Go to ${nodeType}` }]
                  });
                }
              }
            }
          });
        };
        
        checkNames('LAYER', 2);
        checkNames('BLOCK', 2);
        checkNames('STYLE', 2);
        checkNames('LTYPE', 2);
      }

      async securityAssessment() {
        this.checkExternalReferences();
        this.checkScriptContent();
        this.checkBinaryContent();
        this.checkSuspiciousPatterns();
      }

      checkExternalReferences() {
        this.traverseTree(this.dxfTree, (node) => {
          if (node.properties) {
            node.properties.forEach(prop => {
              if ([1, 3, 4].includes(parseInt(prop.code)) && prop.value) {
                // Check for file paths
                if (/[a-zA-Z]:\\|\/[a-zA-Z]/.test(prop.value)) {
                  this.addIssue('security', {
                    severity: 'warning',
                    title: 'External File Reference',
                    description: `Property contains file path: "${prop.value}". Verify this is safe.`,
                    category: 'External References',
                    location: `Line ${prop.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: 'Go to Reference' }]
                  });
                }
                
                // Check for URLs
                if (/https?:\/\/|ftp:\/\//.test(prop.value)) {
                  this.addIssue('security', {
                    severity: 'warning',
                    title: 'URL Reference',
                    description: `Property contains URL: "${prop.value}". Verify this is safe.`,
                    category: 'External References',
                    location: `Line ${prop.line}`,
                    actions: [{ type: 'navigate', data: node.id, label: 'Go to Reference' }]
                  });
                }
              }
            });
          }
        });
      }

      checkScriptContent() {
        this.traverseTree(this.dxfTree, (node) => {
          if (node.properties) {
            node.properties.forEach(prop => {
              if (prop.value && prop.value.length > 20) {
                // Check for potential script commands
                const suspiciousPatterns = [
                  /\bexec\b/i, /\beval\b/i, /\bshell\b/i, /\bcmd\b/i,
                  /\bpowershell\b/i, /\bbash\b/i, /\bjavascript\b/i
                ];
                
                suspiciousPatterns.forEach(pattern => {
                  if (pattern.test(prop.value)) {
                    this.addIssue('security', {
                      severity: 'warning',
                      title: 'Suspicious Script Content',
                      description: 'Property contains text that resembles script commands.',
                      category: 'Script Content',
                      location: `Line ${prop.line}`,
                      actions: [{ type: 'navigate', data: node.id, label: 'Go to Property' }]
                    });
                  }
                });
              }
            });
          }
        });
      }

      checkBinaryContent() {
        this.traverseTree(this.dxfTree, (node) => {
          if (node.properties) {
            const binaryProps = node.properties.filter(prop => prop.code === 310);
            if (binaryProps.length > 0) {
              const totalBinarySize = binaryProps.reduce((sum, prop) => sum + prop.value.length, 0);
              
              if (totalBinarySize > 10 * 1024 * 1024) { // 10MB
                this.addIssue('security', {
                  severity: 'warning',
                  title: 'Large Binary Data',
                  description: `Entity contains ${Math.round(totalBinarySize / (1024 * 1024))} MB of binary data. Verify content is safe.`,
                  category: 'Binary Content',
                  location: `Line ${node.line}`,
                  actions: [{ type: 'navigate', data: node.id, label: 'Go to Entity' }]
                });
              }
            }
          }
        });
      }

      // Utility methods
      traverseTree(nodes, callback, path = []) {
        nodes.forEach((node, index) => {
          const currentPath = [...path, index];
          callback(node, currentPath);
          
          if (node.children && node.children.length > 0) {
            this.traverseTree(node.children, callback, currentPath);
          }
        });
      }

      addIssue(category, issue) {
        if (!this.issues[category]) {
          this.issues[category] = [];
        }
        this.issues[category].push(issue);
      }

      calculateStatistics() {
        let totalIssues = 0;
        let criticalIssues = 0;
        let errorIssues = 0;
        let warningIssues = 0;
        let infoIssues = 0;
        let suggestions = 0;
        
        Object.values(this.issues).forEach(categoryIssues => {
          categoryIssues.forEach(issue => {
            totalIssues++;
            switch (issue.severity) {
              case 'critical': criticalIssues++; break;
              case 'error': errorIssues++; break;
              case 'warning': warningIssues++; break;
              case 'info': infoIssues++; break;
              case 'suggestion': suggestions++; break;
            }
          });
        });
        
        this.stats = {
          totalIssues,
          criticalIssues,
          errorIssues,
          warningIssues,
          infoIssues,
          suggestions
        };
      }
    }

    document.addEventListener("DOMContentLoaded", () => { 
      window.app = new App();

      // Legacy single dropdown support (guarded). New UI uses Left/Right IDs.
      const legacyBtn = document.getElementById("objectTypeDropdownButton");
      const legacyContent = document.getElementById("objectTypeDropdownContent");
      if (legacyBtn && legacyContent) {
        legacyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          legacyContent.style.display = (legacyContent.style.display === "block") ? "none" : "block";
        });
        document.addEventListener("click", () => {
          legacyContent.style.display = "none";
        });
      }
      
      // DRAG & DROP SUPPORT:
      // Prevent default drag behaviors on document
      document.addEventListener("dragover", function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      }, false);
      document.addEventListener("dragenter", function(e) {
        e.preventDefault();
        e.stopPropagation();
      }, false);
      document.addEventListener("dragleave", function(e) {
        e.preventDefault();
        e.stopPropagation();
      }, false);
      // Handle file drops on the entire document body
      document.addEventListener("drop", function(e) {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          // Drop files into the LEFT panel by default
          window.app.handleFiles(files);
        }
      }, false);
    });

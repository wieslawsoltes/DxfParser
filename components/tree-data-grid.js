    class TreeDataGrid {
      constructor(container, content, options = {}) {
        this.container = container;
        this.content = content;
        this.itemHeight = options.itemHeight || 24;
        this.copyCallback = options.copyCallback || null;
        this.openCallback = options.openCallback || null;
        this.onToggleExpand = options.onToggleExpand || null;
        this.onHandleClick = options.onHandleClick || null;
        this.hexViewerCallback = options.hexViewerCallback || null;
        this.onRowSelect = options.onRowSelect || null;
        // Optional: ID of the header root element this grid should sync with
        this.headerRootId = options.headerRootId || null;
        // Optional: per-row class provider for diff highlighting
        this.rowClassProvider = options.rowClassProvider || null;
        // Optional: per-cell class provider, signature (rowIndex, flatItem|null, columnKey) -> className|string|null
        this.cellClassProvider = options.cellClassProvider || null;
        // Optional: override total rows for virtualization (e.g., diff alignment)
        this.overrideTotalRows = null;
        // Optional: index map aligning virtual index -> flatData index (null for placeholder)
        this.indexMap = null;
        this.columnWidths = options.columnWidths || {
          line: 100,
          code: 100,
          type: "*",
          objectCount: 100,
          dataSize: 100
        };
        this.flatData = [];
        this.treeData = [];
        this.selectedRowId = null;
        this.container.addEventListener("scroll", () => { 
          requestAnimationFrame(() => this.updateVisibleNodes());
        });
        this.attachHeaderResizerEvents();
        // Diff overview (minimap) UI
        this._overviewNeedsRebuild = false;
        this._lastOverviewTotalRows = null;
        this._lastOverviewColors = null;
        this._overview = document.createElement("div");
        this._overview.className = "diff-overview";
        this._overviewMarkers = document.createElement("div");
        this._overviewMarkers.className = "markers";
        this._overviewViewport = document.createElement("div");
        this._overviewViewport.className = "viewport";
        this._overview.appendChild(this._overviewMarkers);
        this._overview.appendChild(this._overviewViewport);
        // Insert as the first child to avoid being pushed by scrollable content
        if (this.container.firstChild) {
          this.container.insertBefore(this._overview, this.container.firstChild);
        } else {
          this.container.appendChild(this._overview);
        }
        this._overview.addEventListener("click", (e) => this.handleOverviewClick(e));
        // Drag to scroll
        this._overview.addEventListener("mousedown", (e) => this.handleOverviewDragStart(e));
        this._overview.addEventListener("touchstart", (e) => this.handleOverviewDragStart(e), { passive: false });
        // Keep rail positioned left of the scrollbar
        const onResize = () => { this.positionOverviewRail(); this.updateOverview(); this.updateOverviewViewport(); };
        window.addEventListener('resize', onResize);
        // Initial layout
        this.positionOverviewRail();
        this.updateOverview();
        this.updateOverviewViewport();
        this.content.addEventListener("click", (e) => {
          if (e.target.classList.contains("toggle")) {
            e.stopPropagation();
            const row = e.target.closest(".tree-row");
            if (row) {
              const nodeId = row.dataset.id;
              if (this.onToggleExpand) { this.onToggleExpand(nodeId); }
            }
          }
        });
      }

      setRowClassProvider(provider) {
        this.rowClassProvider = provider;
        this._overviewNeedsRebuild = true;
        this.updateVisibleNodes();
        this.updateOverview(true);
      }

      setCellClassProvider(provider) {
        this.cellClassProvider = provider;
        this.updateVisibleNodes();
      }

      setOverrideTotalRows(totalRows) {
        this.overrideTotalRows = (typeof totalRows === 'number') ? totalRows : null;
        this._overviewNeedsRebuild = true;
        this.updateVisibleNodes();
        this.updateOverview(true);
      }

      setIndexMap(map) {
        this.indexMap = Array.isArray(map) ? map : null;
        this.updateVisibleNodes();
        // Index map doesn't affect diff classification, no need to rebuild markers,
        // but we should refresh the rail and viewport to reflect any size changes immediately.
        this.updateOverview();
        this.updateOverviewViewport();
      }
      
      attachHeaderResizerEvents() {
        const scopeSelector = this.headerRootId ? `#${this.headerRootId}` : '#treeGridHeader';
        const headerResizers = document.querySelectorAll(`${scopeSelector} .header-cell .resizer`);
        headerResizers.forEach(resizer => {
          resizer.addEventListener("mousedown", (e) => this.handleResizerMouseDown(e));
        });
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
          this.updateVisibleNodes();
        };
        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      }
      
      computeColumnFinalWidths() {
        const containerWidth = this.container.clientWidth;
        const columns = ["line", "code", "type", "objectCount", "dataSize"];
        let fixedTotal = 0;
        let starTotal = 0;
        let finalWidths = {};
        columns.forEach(col => {
          let def = this.columnWidths[col];
          if (typeof def === "number") {
            finalWidths[col] = def;
            fixedTotal += def;
          } else if (typeof def === "string") {
            if (def.toLowerCase() === "auto") {
              const headerCell = document.querySelector(`#treeGridHeader .tree-${col}`);
              let autoWidth = headerCell ? headerCell.scrollWidth : 100;
              finalWidths[col] = autoWidth;
              fixedTotal += autoWidth;
            } else if (def.trim().endsWith("*")) {
              let multiplier = parseFloat(def.trim().slice(0, -1));
              if (isNaN(multiplier)) multiplier = 1;
              starTotal += multiplier;
              finalWidths[col] = { star: multiplier };
            } else {
              let pixels = parseFloat(def);
              if (!isNaN(pixels)) {
                finalWidths[col] = pixels;
                fixedTotal += pixels;
              } else {
                finalWidths[col] = 100;
                fixedTotal += 100;
              }
            }
          } else {
            starTotal += 1;
            finalWidths[col] = { star: 1 };
          }
        });
        let remaining = containerWidth - fixedTotal;
        if (remaining < 0) remaining = 0;
        columns.forEach(col => {
          if (typeof finalWidths[col] === "object" && finalWidths[col].star) {
            let multiplier = finalWidths[col].star;
            let width = (multiplier / starTotal) * remaining;
            finalWidths[col] = width;
          }
        });
        return finalWidths;
      }
      
      syncHeaderWidths() {
        const header = this.headerRootId ? document.getElementById(this.headerRootId) : document.getElementById("treeGridHeader");
        if (!header) return;
        const colWidths = this.computeColumnFinalWidths();
        const lineCell = header.querySelector('.tree-line');
        if (lineCell) lineCell.style.width = colWidths.line + "px";
        const codeCell = header.querySelector('.tree-code');
        if (codeCell) codeCell.style.width = colWidths.code + "px";
        const typeCell = header.querySelector('.tree-data');
        if (typeCell) {
          typeCell.style.width = colWidths.type + "px";
          typeCell.style.flex = "0 0 auto";
        }
        const objectCountCell = header.querySelector('.tree-object-count');
        if (objectCountCell) objectCountCell.style.width = colWidths.objectCount + "px";
        const dataSizeCell = header.querySelector('.tree-data-size');
        if (dataSizeCell) dataSizeCell.style.width = colWidths.dataSize + "px";
      }
      
      setData(treeData) {
        this.treeData = treeData || [];
        this.refresh();
      }
      
      refresh() {
        this.flatData = this.flattenTree(this.treeData);
        this.updateVisibleNodes();
      }

      /*
      flattenTree(nodes, level = 0) {
        let flat = [];
        for (let node of nodes) {
          flat.push({ node, level });
          if (node.expanded) {
            if (node.properties && node.properties.length) {
              for (let prop of node.properties) {
                flat.push({
                  node: {
                    id: `prop-${node.id}-${prop.line}-${prop.code}`,
                    isProperty: true,
                    line: prop.line,
                    code: prop.code,
                    data: prop.value
                  },
                  level: level + 1
                });
              }
            }
            if (node.children && node.children.length) {
              flat = flat.concat(this.flattenTree(node.children, level + 1));
            }
          }
        }
        return flat;
      }
      */

      flattenTree(nodes, initialLevel = 0) {
        const flat = [];
        const stack = [];
        // Push the initial nodes in reverse order so that the first node is processed first.
        for (let i = nodes.length - 1; i >= 0; i--) {
          stack.push({ node: nodes[i], level: initialLevel });
        }

        while (stack.length > 0) {
          const { node, level } = stack.pop();
          flat.push({ node, level });

          if (node.expanded) {
            // We want properties to appear immediately after the node.
            // To achieve that with a LIFO stack, we push the children first...
            if (node.children && node.children.length > 0) {
              for (let i = node.children.length - 1; i >= 0; i--) {
                stack.push({ node: node.children[i], level: level + 1 });
              }
            }
            // ...and then push the properties so they come off the stack before the children.
            if (node.properties && node.properties.length > 0) {
              // Push properties in reverse order so that when popped, they appear in the original order.
              for (let i = node.properties.length - 1; i >= 0; i--) {
                const prop = node.properties[i];
                stack.push({
                  node: {
                    id: `prop-${node.id}-${prop.line}-${prop.code}`,
                    isProperty: true,
                    line: prop.line,
                    code: prop.code,
                    data: prop.value,
                    propRef: prop,
                    parentNode: node
                  },
                  level: level + 1
                });
              }
            }
          }
        }

        return flat;
      }

      computeObjectCount(node) {
        if (!node.children || node.children.length === 0) return 0;
        let count = 0;
        for (let child of node.children) {
          if (!child.isProperty) {
            count++;
            if (child.children && child.children.length) { 
              count += this.computeObjectCount(child);
            }
          }
        }
        return count;
      }
      
      computeDataSize(node) {
        let size = 0;
        if (node.isProperty) {
          size += node.data ? node.data.length : 0;
        } else {
          size += node.type ? node.type.length : 0;
          if (node.properties && node.properties.length) {
            for (let prop of node.properties) {
              size += prop.value ? prop.value.length : 0;
            }
          }
          if (node.children && node.children.length) {
            for (let child of node.children) { size += this.computeDataSize(child); }
          }
        }
        return size;
      }

      makeDataEditable(dataDiv, node) {
        const originalValue = node.data || "";
        const input = document.createElement("input");
        input.type = "text";
        input.value = originalValue;
        input.style.width = "100%";
        dataDiv.innerHTML = "";
        dataDiv.appendChild(input);
        input.focus();

        const finishEdit = (commit) => {
          if (commit) {
            const newValue = input.value;
            node.data = newValue;
            if (node.propRef) node.propRef.value = newValue;
          }
          dataDiv.innerHTML = "";
          dataDiv.textContent = node.data;
          this.updateVisibleNodes();
        };

        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            finishEdit(true);
          } else if (e.key === "Escape") {
            finishEdit(false);
          }
        });
        input.addEventListener("blur", () => finishEdit(true));
      }

      makeCodeEditable(codeDiv, node) {
        const originalValue = node.code != null ? node.code : "";
        const input = document.createElement("input");
        input.type = "text";
        input.value = originalValue;
        input.style.width = "100%";
        codeDiv.innerHTML = "";
        codeDiv.appendChild(input);
        input.focus();

        const finishEdit = (commit) => {
          if (commit) {
            const newValue = input.value;
            node.code = newValue;
            if (node.propRef) node.propRef.code = newValue;
          }
          codeDiv.innerHTML = "";
          codeDiv.textContent = node.code;
          this.updateVisibleNodes();
        };

        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            finishEdit(true);
          } else if (e.key === "Escape") {
            finishEdit(false);
          }
        });
        input.addEventListener("blur", () => finishEdit(true));
      }

      updateVisibleNodes() {
        const scrollTop = this.container.scrollTop;
        const containerHeight = this.container.clientHeight;
        const totalRows = (typeof this.overrideTotalRows === 'number' && this.overrideTotalRows > 0)
          ? this.overrideTotalRows
          : this.flatData.length;
        const fullHeight = totalRows * this.itemHeight;
        this.content.style.height = fullHeight + "px";

        const colWidths = this.computeColumnFinalWidths();
        const lineWidth = colWidths.line;
        const codeWidth = colWidths.code;
        const dataWidth = colWidths.type;
        const objectCountWidth = colWidths.objectCount;
        const dataSizeWidth = colWidths.dataSize;
        const totalWidth = lineWidth + codeWidth + dataWidth + objectCountWidth + dataSizeWidth;

        const containerElem = document.createElement("div");
        containerElem.style.width = totalWidth + "px";

        const startIndex = Math.floor(scrollTop / this.itemHeight);
        const visibleCount = Math.ceil(containerHeight / this.itemHeight) + 1;
        const endIndex = Math.min(startIndex + visibleCount, totalRows);

        const topSpacer = document.createElement("div");
        topSpacer.style.height = (startIndex * this.itemHeight) + "px";
        containerElem.appendChild(topSpacer);

        const fragment = document.createDocumentFragment();
        for (let i = startIndex; i < endIndex; i++) {
          const row = document.createElement("div");
          row.className = "tree-row tree-node";
          row.style.display = "flex";
          row.style.position = "relative";
          row.style.height = this.itemHeight + "px";
          const mappedIndex = (this.indexMap && i < this.indexMap.length) ? this.indexMap[i] : i;
          const hasItem = (mappedIndex != null) && (mappedIndex >= 0) && (mappedIndex < this.flatData.length);
          let node = null;
          let level = 0;
          if (hasItem) {
            ({ node, level } = this.flatData[mappedIndex]);
            row.dataset.id = node.id;
            // Keep a direct reference to the rendered node for context actions
            row._nodeRef = node;
            if (String(node.id) === String(this.selectedRowId)) {
              row.classList.add("selected");
            }
            row.addEventListener("click", (e) => {
              if (window.getSelection().toString().length > 0) {
                return;
              }
              this.selectedRowId = node.id;
              this.updateVisibleNodes();
              if (this.onRowSelect) {
                this.onRowSelect(node.id);
              }
            });
          } else {
            row.classList.add("placeholder");
          }
          // Apply per-row class if provided (e.g., diff coloring)
          if (this.rowClassProvider) {
            try {
              const extraClass = this.rowClassProvider(i, hasItem ? this.flatData[mappedIndex] : null);
              if (extraClass) row.classList.add(extraClass);
            } catch (e) {}
          }

          // Line column.
          const lineDiv = document.createElement("div");
          lineDiv.className = "tree-line";
          lineDiv.style.width = lineWidth + "px";
          const lineContent = document.createElement("div");
          lineContent.style.display = "flex";
          lineContent.style.alignItems = "center";
          lineContent.style.marginLeft = (level * 20) + "px";
          if (hasItem && !node.isProperty && ((node.properties && node.properties.length) || (node.children && node.children.length))) {
            const toggleSpan = document.createElement("span");
            toggleSpan.className = "toggle";
            toggleSpan.textContent = node.expanded ? "▼" : "►";
            toggleSpan.addEventListener("click", (e) => {
              e.stopPropagation();
              if (this.onToggleExpand) { this.onToggleExpand(node.id); }
            });
            lineContent.appendChild(toggleSpan);
          } else {
            const spacer = document.createElement("span");
            spacer.style.width = "16px";
            spacer.style.display = "inline-block";
            lineContent.appendChild(spacer);
          }
          const lineNumberSpan = document.createElement("span");
          lineNumberSpan.textContent = hasItem ? (node.line || "") : "";
          lineContent.appendChild(lineNumberSpan);
          lineDiv.appendChild(lineContent);
          row.appendChild(lineDiv);

          // Code column.
          const codeDiv = document.createElement("div");
          codeDiv.className = "tree-code";
          codeDiv.style.width = codeWidth + "px";
          codeDiv.style.textAlign = "left";
          if (hasItem && node.isProperty) {
            codeDiv.addEventListener("dblclick", (e) => {
              e.stopPropagation();
              this.makeCodeEditable(codeDiv, node);
            });
          }
          // For properties or end markers we normally display the code.
          if (hasItem && (node.isProperty || node.isEndMarker)) {
            codeDiv.textContent = node.code;
          } else {
            codeDiv.textContent = hasItem ? (((node.properties && node.properties.length) || (node.children && node.children.length)) ? "0" : "") : "";
          }
          row.appendChild(codeDiv);

          // Data column.
          const dataDiv = document.createElement("div");
          dataDiv.className = "tree-data";
          dataDiv.style.width = dataWidth + "px";
          dataDiv.style.flex = "0 0 auto";
          if (hasItem && node.isProperty) {
            dataDiv.addEventListener("dblclick", (e) => {
              e.stopPropagation();
              this.makeDataEditable(dataDiv, node);
            });
          }
          // When rendering a row…
          if (hasItem && node.isProperty) {
            // If this property’s code is one of the handle codes,
            // create a clickable span instead of plain text.
            if (isHandleCode(Number(node.code))) {
              const spanHandle = document.createElement("span");
              spanHandle.textContent = node.data;
              spanHandle.style.textDecoration = "underline";
              spanHandle.style.color = "blue";
              spanHandle.style.cursor = "pointer";
              spanHandle.addEventListener("click", (e) => {
                e.preventDefault();
                if (this.onHandleClick) { 
                  this.onHandleClick(node.data);
                }
              });
              dataDiv.appendChild(spanHandle);
            } else {
              // Otherwise, simply display the property data.
              dataDiv.textContent = node.data;
            }
          } else if (hasItem) {
            // For non‑property nodes, show the node type.
            // If the node is a CLASS, append the (ID=…) text.
            if (node.type) {
              if (node.type.toUpperCase() === "CLASS" && node.classId !== undefined) {
                let className = "";
                if (node.properties) {
                  for (const prop of node.properties) {
                    if (Number(prop.code) === 1) {
                      className = prop.value;
                      break;
                    }
                  }
                }
                dataDiv.textContent = node.type + " (" + className + ") " + " (ID=" + node.classId + ")";
              } else {
                // For other node types, just show the type (and any section name for SECTION nodes).
                if (node.type.toUpperCase() === "SECTION" || node.type.toUpperCase() === "BLOCK" || node.type.toUpperCase() === "TABLE" ||
                    node.parentType?.toUpperCase() === "TABLE") {
                  let nameValue = "";
                  if (node.properties) {
                    for (const prop of node.properties) {
                      if (Number(prop.code) === 2) {
                        nameValue = prop.value;
                        break;
                      }
                    }
                  }
                  dataDiv.textContent = nameValue ? node.type + " (" + nameValue + ")" : node.type;
                } else {
                  dataDiv.textContent = node.type || "";
                }
              }
            }

            // *** New code for ACAD_PROXY_OBJECTs ***
            // If the node is an ACAD_PROXY_OBJECT, check if it has a property with code 91
            // and add a clickable link (similar to handle navigation).
            if (node.type && node.type.toUpperCase() === "ACAD_PROXY_OBJECT") {
              const classProp = node.properties.find(prop => Number(prop.code) === 91);
              if (classProp) {
                const spanClass = document.createElement("span");
                const clsName = window.app.getClassNameById(Number(classProp.value));
                spanClass.textContent =
                  " (CLASS ID=" +
                  classProp.value +
                  (clsName ? " (" + clsName + ")" : "") +
                  ") ";
                spanClass.style.textDecoration = "underline";
                spanClass.style.color = "blue";
                spanClass.style.cursor = "pointer";
                spanClass.addEventListener("click", (e) => {
                  e.preventDefault();
                  // Call a function to navigate to the CLASS definition.
                  window.app.navigateToClassById(classProp.value);
                });
                dataDiv.appendChild(spanClass);
              }
            }
            
            // Append the handle (if any) as a clickable link.
            if (node.handle) {
              const spanHandle = document.createElement("span");
              spanHandle.textContent = " (" + node.handle + ")";
              spanHandle.style.textDecoration = "underline";
              spanHandle.style.color = "blue";
              spanHandle.style.cursor = "pointer";
              spanHandle.addEventListener("click", (e) => {
                e.preventDefault();
                if (this.onHandleClick) { 
                  this.onHandleClick(node.handle);
                }
              });
              dataDiv.appendChild(spanHandle);
            }
            

            // Retain the copy, open, and hex viewer buttons as before.
            if (this.copyCallback && !node.isProperty) {
              const copyButton = document.createElement("button");
              copyButton.textContent = "Copy";
              copyButton.className = "copy-button";
              copyButton.addEventListener("click", (e) => {
                e.stopPropagation();
                this.copyCallback(node.id);
              });
              dataDiv.appendChild(copyButton);
            }
            if (!node.isProperty) {
              const openButton = document.createElement("button");
              openButton.textContent = "Open";
              openButton.className = "open-button";
              openButton.addEventListener("click", (e) => {
                e.stopPropagation();
                if (this.openCallback) { 
                  this.openCallback(node.id);
                }
              });
              dataDiv.appendChild(openButton);
            }
            if (!node.isProperty && node.properties) {
              const binaryProps = node.properties.filter(prop => Number(prop.code) === 310);
              if (binaryProps.length > 0) {
                const combinedData = binaryProps.map(prop => prop.value).join("");
                const hexButton = document.createElement("button");
                hexButton.textContent = "Hex Viewer";
                hexButton.className = "hex-button";
                hexButton.addEventListener("click", (e) => {
                  e.stopPropagation();
                  if (this.hexViewerCallback) { 
                    this.hexViewerCallback(combinedData);
                  }
                });
                dataDiv.appendChild(hexButton);
              }
            }
          }

          row.appendChild(dataDiv);

          // Object Count column.
          const objectCountDiv = document.createElement("div");
          objectCountDiv.className = "tree-object-count";
          objectCountDiv.style.width = objectCountWidth + "px";
          objectCountDiv.style.textAlign = "right";
          if (hasItem && !node.isProperty && node.children && node.children.length) {
            objectCountDiv.textContent = this.computeObjectCount(node);
          } else {
            objectCountDiv.textContent = "";
          }
          row.appendChild(objectCountDiv);

          // Data Size column.
          const dataSizeDiv = document.createElement("div");
          dataSizeDiv.className = "tree-data-size";
          dataSizeDiv.style.width = dataSizeWidth + "px";
          dataSizeDiv.style.textAlign = "right";
          dataSizeDiv.textContent = hasItem ? this.computeDataSize(node) : "";
          row.appendChild(dataSizeDiv);

          // ★ If this node represents an EOF marker, adjust its display.
          if (hasItem && node.isEOF) {
            codeDiv.textContent = node.code;      // Should show "0"
            dataDiv.textContent = node.type;        // Will show "EOF"
          }

          // Apply per-cell classes if provided
          if (this.cellClassProvider) {
            try {
              const applyCell = (elem, key) => {
                const cls = this.cellClassProvider(i, hasItem ? this.flatData[mappedIndex] : null, key);
                if (cls) elem.classList.add(cls);
              };
              applyCell(lineDiv, 'line');
              applyCell(codeDiv, 'code');
              applyCell(dataDiv, 'type');
              applyCell(objectCountDiv, 'objectCount');
              applyCell(dataSizeDiv, 'dataSize');
            } catch (e) {}
          }

          fragment.appendChild(row);
        }
        containerElem.appendChild(fragment);
        const bottomSpacer = document.createElement("div");
        const bottomHeight = Math.max(0, fullHeight - (startIndex + visibleCount) * this.itemHeight);
        bottomSpacer.style.height = bottomHeight + "px";
        containerElem.appendChild(bottomSpacer);
        this.content.innerHTML = "";
        this.content.appendChild(containerElem);
        this.syncHeaderWidths();
        // Keep overview viewport in sync on scroll/render
        this.positionOverviewRail();
        this.updateOverview();
        this.updateOverviewViewport();
      }

      // --- Diff overview (minimap) ---
      getOverviewEnabled() {
        // Show when diff alignment is active
        return (typeof this.overrideTotalRows === 'number' && this.overrideTotalRows > 0);
      }

      handleOverviewClick(e) {
        if (!this.getOverviewEnabled()) return;
        const rect = this._overview.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height || 1;
        const totalRows = this.overrideTotalRows || this.flatData.length || 1;
        const fullHeight = totalRows * this.itemHeight;
        const targetRatio = Math.min(Math.max(y / height, 0), 1);
        const targetTop = targetRatio * (fullHeight - this.container.clientHeight);
        this.container.scrollTop = Math.max(0, Math.min(fullHeight - this.container.clientHeight, targetTop));
      }

      handleOverviewDragStart(e) {
        if (!this.getOverviewEnabled()) return;
        e.preventDefault();
        this._overviewDragging = true;
        const move = (ev) => this.handleOverviewDragMove(ev);
        const up = () => {
          this._overviewDragging = false;
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          window.removeEventListener('touchmove', move);
          window.removeEventListener('touchend', up);
          window.removeEventListener('touchcancel', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', up);
        window.addEventListener('touchcancel', up);
        // apply immediately
        this.handleOverviewDragMove(e);
      }

      handleOverviewDragMove(e) {
        if (!this._overviewDragging) return;
        e.preventDefault();
        const pointY = (e.touches && e.touches.length) ? e.touches[0].clientY : e.clientY;
        const rect = this._overview.getBoundingClientRect();
        const y = Math.min(Math.max(pointY - rect.top, 0), rect.height || 1);
        const height = rect.height || 1;
        const totalRows = this.overrideTotalRows || this.flatData.length || 1;
        const fullHeight = totalRows * this.itemHeight;
        const targetRatio = height > 0 ? (y / height) : 0;
        const targetTop = targetRatio * (fullHeight - this.container.clientHeight);
        this.container.scrollTop = Math.max(0, Math.min(fullHeight - this.container.clientHeight, targetTop));
        this.updateOverviewViewport();
      }

      rebuildOverviewMarkers() {
        // Clear
        this._overviewMarkers.innerHTML = "";
        if (!this.getOverviewEnabled()) return;
        const totalRows = this.overrideTotalRows || 0;
        if (totalRows <= 0) return;
        // Colors consistent with CSS row colors
        // Distinguish between data changes (type cell differs) and line-only changes
        const colorByClass = {
          'diff-added': '#baf7c6',          // green
          'diff-removed': '#ffc8ce',        // red
          'diff-changed-data': '#ffe28a',   // yellow (data changed)
          'diff-changed-line': '#d7dbe0'    // neutral gray (line/code-only change)
        };

        // Helper to classify the overview marker type for a given virtual row index
        const classifyRow = (i) => {
          let cls = null;
          try { cls = this.rowClassProvider ? this.rowClassProvider(i, null) : null; } catch (_) { cls = null; }
          if (!cls) return null;
          if (cls === 'diff-added' || cls === 'diff-removed') return cls;
          if (cls === 'diff-changed') {
            // Determine whether this is a data change (type cell differs) or only line/code/etc.
            let typeChanged = false;
            try {
              if (this.cellClassProvider) {
                const typeCls = this.cellClassProvider(i, null, 'type');
                typeChanged = typeCls === 'cell-changed';
              }
            } catch (_) { /* ignore */ }
            return typeChanged ? 'diff-changed-data' : 'diff-changed-line';
          }
          return null;
        };
        const ranges = [];
        let i = 0;
        while (i < totalRows) {
          const cls = classifyRow(i);
          if (!cls) {
            i++;
            continue;
          }
          const start = i;
          const type = cls;
          i++;
          while (i < totalRows) {
            const c = classifyRow(i);
            if (c !== type) break;
            i++;
          }
          const end = i - 1;
          ranges.push({ start, end, type });
        }
        // Render ranges as absolute positioned markers
        for (const r of ranges) {
          const topRatio = r.start / totalRows;
          const endRatio = (r.end + 1) / totalRows;
          const marker = document.createElement('div');
          marker.className = 'marker';
          marker.style.top = (topRatio * 100) + '%';
          marker.style.height = ((endRatio - topRatio) * 100) + '%';
          marker.style.backgroundColor = colorByClass[r.type] || '#ddd';
          this._overviewMarkers.appendChild(marker);
        }
        this._lastOverviewTotalRows = totalRows;
        this._overviewNeedsRebuild = false;
      }

      updateOverview(force = false) {
        const enabled = this.getOverviewEnabled();
        this._overview.style.display = enabled ? 'block' : 'none';
        if (!enabled) return;
        this.positionOverviewRail();
        const totalRows = this.overrideTotalRows || 0;
        if (force || this._overviewNeedsRebuild || this._lastOverviewTotalRows !== totalRows) {
          this.rebuildOverviewMarkers();
        }
      }

      updateOverviewViewport() {
        if (!this.getOverviewEnabled()) return;
        const totalRows = this.overrideTotalRows || this.flatData.length || 1;
        const fullHeight = totalRows * this.itemHeight;
        const containerHeight = this.container.clientHeight || 1;
        const scrollTop = this.container.scrollTop || 0;
        const ovHeight = this.container.clientHeight || 1;
        const topRatio = fullHeight > 0 ? (scrollTop / fullHeight) : 0;
        const heightRatio = fullHeight > 0 ? (containerHeight / fullHeight) : 1;
        const viewportTop = Math.max(0, Math.floor(topRatio * ovHeight));
        const viewportHeight = Math.max(6, Math.floor(heightRatio * ovHeight));
        this._overviewViewport.style.top = viewportTop + 'px';
        this._overviewViewport.style.height = viewportHeight + 'px';
      }

      positionOverviewRail() {
        if (!this._overview) return;
        // Align rail flush to the scrollbar edge and keep it anchored vertically
        this._overview.style.right = '0px';
        // Ensure the rail height matches the viewport height of the container
        const ch = this.container.clientHeight;
        this._overview.style.height = ch + 'px';
        // Counter-scroll by positioning top equal to scrollTop so it stays in place
        const st = this.container.scrollTop || 0;
        this._overview.style.top = st + 'px';
      }
    }

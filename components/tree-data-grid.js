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
      
      attachHeaderResizerEvents() {
        const headerResizers = document.querySelectorAll('#treeGridHeader .header-cell .resizer');
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
        const header = document.getElementById("treeGridHeader");
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
        const totalRows = this.flatData.length;
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
          const { node, level } = this.flatData[i];
          const row = document.createElement("div");
          row.className = "tree-row tree-node";
          row.style.display = "flex";
          row.style.position = "relative";
          row.style.height = this.itemHeight + "px";
          row.dataset.id = node.id;
          if (String(node.id) === String(this.selectedRowId)) {
            row.classList.add("selected");
          }
         row.addEventListener("click", (e) => {
          // If the user is in the middle of selecting text, do nothing.
          if (window.getSelection().toString().length > 0) {
            return;
          }
          // Otherwise, proceed with row selection.
          this.selectedRowId = node.id;
          this.updateVisibleNodes();
          if (this.onRowSelect) {
            this.onRowSelect(node.id);
          }
        });

          // Line column.
          const lineDiv = document.createElement("div");
          lineDiv.className = "tree-line";
          lineDiv.style.width = lineWidth + "px";
          const lineContent = document.createElement("div");
          lineContent.style.display = "flex";
          lineContent.style.alignItems = "center";
          lineContent.style.marginLeft = (level * 20) + "px";
          if (!node.isProperty && ((node.properties && node.properties.length) || (node.children && node.children.length))) {
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
          lineNumberSpan.textContent = node.line || "";
          lineContent.appendChild(lineNumberSpan);
          lineDiv.appendChild(lineContent);
          row.appendChild(lineDiv);

          // Code column.
          const codeDiv = document.createElement("div");
          codeDiv.className = "tree-code";
          codeDiv.style.width = codeWidth + "px";
          codeDiv.style.textAlign = "left";
          if (node.isProperty) {
            codeDiv.addEventListener("dblclick", (e) => {
              e.stopPropagation();
              this.makeCodeEditable(codeDiv, node);
            });
          }
          // For properties or end markers we normally display the code.
          if (node.isProperty || node.isEndMarker) {
            codeDiv.textContent = node.code;
          } else {
            codeDiv.textContent = ((node.properties && node.properties.length) || (node.children && node.children.length)) ? "0" : "";
          }
          row.appendChild(codeDiv);

          // Data column.
          const dataDiv = document.createElement("div");
          dataDiv.className = "tree-data";
          dataDiv.style.width = dataWidth + "px";
          dataDiv.style.flex = "0 0 auto";
          if (node.isProperty) {
            dataDiv.addEventListener("dblclick", (e) => {
              e.stopPropagation();
              this.makeDataEditable(dataDiv, node);
            });
          }
          // When rendering a row…
          if (node.isProperty) {
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
          } else {
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
          if (!node.isProperty && node.children && node.children.length) {
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
          dataSizeDiv.textContent = this.computeDataSize(node);
          row.appendChild(dataSizeDiv);

          // ★ If this node represents an EOF marker, adjust its display.
          if (node.isEOF) {
            codeDiv.textContent = node.code;      // Should show "0"
            dataDiv.textContent = node.type;        // Will show "EOF"
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
      }

    }

    class BatchDataGrid {
      constructor(tabHeadersContainer, tabContentsContainer) {
        this.tabHeadersContainer = tabHeadersContainer;
        this.tabContentsContainer = tabContentsContainer;
        this.tabs = {}; // each key is a tabId with its data
        this.activeTabId = null;
        // Define default column widths for the batch grid.
        // Columns: "#" (row number), "file" (file path), "line", "data"
        // Use numbers for fixed widths and "*" for star sizing.
        this.columnWidths = {
          "#": 40,
          "file": "*",
          "line": 100,
          "data": "*"
        };
      }

      // Compute the final pixel widths for each column based on the available container width.
      // This method mimics TreeDataGrid’s computeColumnFinalWidths.
      computeColumnFinalWidths(containerWidth) {
        const columns = ["#", "file", "line", "data"];
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
              // (For simplicity we default auto to 100px.)
              finalWidths[col] = 100;
              fixedTotal += 100;
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

      // Update the header table’s columns so that the header cells and underlying colgroup reflect the computed widths.
      syncHeaderWidths(tabId) {
        const tabData = this.tabs[tabId];
        if (!tabData) return;
        const headerTable = tabData.headerTable;
        // Use the virtualized container’s width as the available width.
        const containerWidth = tabData.virtualizedContainer.clientWidth;
        const colWidths = this.computeColumnFinalWidths(containerWidth);
        const columns = ["#", "file", "line", "data"];
        const headerRow = headerTable.querySelector("thead tr");
        if (headerRow) {
          const ths = headerRow.children;
          const colGroup = headerTable.querySelector("colgroup");
          for (let i = 0; i < columns.length; i++) {
            const colName = columns[i];
            const width = colWidths[colName];
            if (ths[i]) {
              ths[i].style.width = width + "px";
            }
            if (colGroup && colGroup.children[i]) {
              colGroup.children[i].style.width = width + "px";
            }
          }
        }
      }

      // Attach resizer events to header cells so that dragging adjusts the widths.
      attachHeaderResizerEvents(tabId) {
        const tabData = this.tabs[tabId];
        if (!tabData) return;
        const headerTable = tabData.headerTable;
        const resizers = headerTable.querySelectorAll(".resizer");
        resizers.forEach(resizer => {
          resizer.addEventListener("mousedown", (e) => this.handleResizerMouseDown(e, tabId));
        });
      }

      // Handle the mousedown on a resizer element.
      // This method mimics TreeDataGrid’s handleResizerMouseDown.
      handleResizerMouseDown(e, tabId) {
        e.stopPropagation();
        const th = e.target.parentElement; // the header cell (th)
        const field = th.getAttribute("data-field");
        const startX = e.clientX;
        const startWidth = th.offsetWidth;
        const onMouseMove = (eMove) => {
          const newWidth = startWidth + (eMove.clientX - startX);
          if (newWidth > 30) { // enforce a minimum width
            this.columnWidths[field] = newWidth;
            th.style.width = newWidth + "px";
            const tabData = this.tabs[tabId];
            const colGroup = tabData.headerTable.querySelector("colgroup");
            if (colGroup) {
              const ths = Array.from(th.parentElement.children);
              const index = ths.indexOf(th);
              if (index >= 0 && colGroup.children[index]) {
                colGroup.children[index].style.width = newWidth + "px";
              }
            }
            this.updateVirtualizedResults(tabId);
          }
        };
        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      }

      addTab(fileName) {
        const tabId = "batch-tab-" + Date.now() + Math.random();
        // Create the header for the tab (for switching tabs)
        const header = document.createElement("div");
        header.className = "batch-tab-header";
        header.dataset.tabId = tabId;
        header.style.padding = "0.5em 1em";
        header.style.cursor = "pointer";
        header.style.border = "1px solid #ccc";
        header.style.borderBottom = "none";
        header.style.backgroundColor = "#eee";
        header.textContent = fileName;
        // Add a close button to the tab header.
        const closeBtn = document.createElement("span");
        closeBtn.textContent = "×";
        closeBtn.style.marginLeft = "0.5em";
        closeBtn.style.cursor = "pointer";
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.removeTab(tabId);
        });
        header.appendChild(closeBtn);
        header.addEventListener("click", () => this.switchTab(tabId));
        this.tabHeadersContainer.appendChild(header);

        // Create the content container for the tab.
        const content = document.createElement("div");
        content.className = "batch-tab-content";
        content.dataset.tabId = tabId;
        content.style.display = "none";
        content.style.height = "100%";
        content.style.overflowX = "hidden";

        // Create a static header table for the grid—with resizer handles.
        const headerTable = document.createElement("table");
        headerTable.border = "1";
        headerTable.cellSpacing = "0";
        headerTable.cellPadding = "4";
        headerTable.style.width = "100%";
        headerTable.style.tableLayout = "auto";
        // Create a colgroup for the columns.
        const colgroup = document.createElement("colgroup");
        const columns = ["#", "file", "line", "data"];
        columns.forEach(col => {
          const colElem = document.createElement("col");
          let def = this.columnWidths[col];
          if (typeof def === "number") {
            colElem.style.width = def + "px";
          } else {
            colElem.style.width = "100px";
          }
          colgroup.appendChild(colElem);
        });
        headerTable.appendChild(colgroup);
        // Create the table header row including resizer elements.
        const thead = document.createElement("thead");
        thead.innerHTML = `<tr>
          <th data-field="#" style="position: relative;">#<div class="resizer" style="position: absolute; right: 0; top: 0; width: 5px; cursor: col-resize;"></div></th>
          <th data-field="file" style="position: relative;">File (Relative Path)<div class="resizer" style="position: absolute; right: 0; top: 0; width: 5px; cursor: col-resize;"></div></th>
          <th data-field="line" style="position: relative;">Line<div class="resizer" style="position: absolute; right: 0; top: 0; width: 5px; cursor: col-resize;"></div></th>
          <th data-field="data" style="position: relative;">Data<div class="resizer" style="position: absolute; right: 0; top: 0; width: 5px; cursor: col-resize;"></div></th>
        </tr>`;
        headerTable.appendChild(thead);
        content.appendChild(headerTable);

        // Create the virtualized container for the grid rows.
        const virtualizedContainer = document.createElement("div");
        virtualizedContainer.className = "virtualized-results";
        virtualizedContainer.style.height = "calc(100% - 40px)";
        virtualizedContainer.style.position = "relative";
        virtualizedContainer.style.overflowY = "auto";
        virtualizedContainer.style.overflowX = "auto";
        content.appendChild(virtualizedContainer);

        // Create the inner container where rows are rendered.
        const virtualizedContent = document.createElement("div");
        virtualizedContent.className = "virtualized-content";
        virtualizedContent.style.position = "absolute";
        virtualizedContent.style.left = "0";
        virtualizedContent.style.right = "0";
        virtualizedContainer.appendChild(virtualizedContent);

        // Sync horizontal scrolling so that the header moves opposite the content.
        virtualizedContainer.addEventListener("scroll", () => {
          headerTable.style.transform = `translateX(-${virtualizedContainer.scrollLeft}px)`;
          this.updateVirtualizedResults(tabId);
        });

        this.tabContentsContainer.appendChild(content);

        // Save all elements and state in the new tab data object.
        this.tabs[tabId] = {
          fileName,
          header,
          content,
          headerTable,
          virtualizedContainer,
          virtualizedContent,
          rows: [],
          rowHeight: 30
        };

        // Attach header resizer events and sync the header widths.
        this.attachHeaderResizerEvents(tabId);
        this.syncHeaderWidths(tabId);

        // Switch to the new tab immediately.
        this.switchTab(tabId);
        return tabId;
      }

      addRow(tabId, rowData) {
        if (this.tabs[tabId]) {
          this.tabs[tabId].rows.push(rowData);
          this.updateVirtualizedResults(tabId);
        }
      }

      updateVirtualizedResults(tabId) {
        const tabData = this.tabs[tabId];
        if (!tabData) return;
        const { rows, rowHeight, virtualizedContainer, virtualizedContent, headerTable } = tabData;
        const totalRows = rows.length;
        // Set overall virtualized height to simulate all rows.
        virtualizedContent.style.height = (totalRows * rowHeight) + "px";
        const scrollTop = virtualizedContainer.scrollTop;
        const containerHeight = virtualizedContainer.clientHeight;
        const startIndex = Math.floor(scrollTop / rowHeight);
        const visibleCount = Math.ceil(containerHeight / rowHeight) + 1;
        const endIndex = Math.min(startIndex + visibleCount, totalRows);
        virtualizedContent.innerHTML = "";

        // For fixed layout, we measure the header cells’ widths.
        const headerCells = headerTable.querySelectorAll("th");
        const colWidths = Array.from(headerCells).map(cell => cell.getBoundingClientRect().width);

        // Create a table for the visible rows with fixed layout.
        const table = document.createElement("table");
        table.border = "1";
        table.cellSpacing = "0";
        table.cellPadding = "4";
        table.style.width = "100%";
        table.style.tableLayout = "fixed";
        const colGroup = document.createElement("colgroup");
        colWidths.forEach(width => {
          const col = document.createElement("col");
          col.style.width = width + "px";
          colGroup.appendChild(col);
        });
        table.appendChild(colGroup);
        const tbody = document.createElement("tbody");
        for (let i = startIndex; i < endIndex; i++) {
          const rowData = rows[i];
          const tr = document.createElement("tr");
          // Column: Row number.
          const tdNum = document.createElement("td");
          tdNum.textContent = (i + 1);
          tr.appendChild(tdNum);
          // Column: File name (with clickable link).
          const tdFile = document.createElement("td");
          const link = document.createElement("a");
          link.textContent = rowData.file;
          link.href = "#";
          link.addEventListener("click", (e) => {
            e.preventDefault();
            window.app.openFileTab(rowData.fileObject, rowData.line);
          });
          tdFile.appendChild(link);
          tr.appendChild(tdFile);
          // Column: Line number.
          const tdLine = document.createElement("td");
          tdLine.textContent = rowData.line;
          tr.appendChild(tdLine);
          // Column: Data.
          const tdData = document.createElement("td");
          tdData.textContent = rowData.data;
          tr.appendChild(tdData);

          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        table.style.position = "absolute";
        table.style.top = (startIndex * rowHeight) + "px";
        virtualizedContent.appendChild(table);

        // Adjust the header to account for any vertical scrollbar.
        const scrollbarWidth = virtualizedContainer.offsetWidth - virtualizedContainer.clientWidth;
        headerTable.style.marginRight = scrollbarWidth + "px";
      }

      switchTab(tabId) {
        this.activeTabId = tabId;
        for (let id in this.tabs) {
          const tab = this.tabs[id];
          if (id === tabId) {
            tab.header.style.backgroundColor = "#fff";
            tab.header.style.fontWeight = "bold";
            tab.content.style.display = "block";
          } else {
            tab.header.style.backgroundColor = "#eee";
            tab.header.style.fontWeight = "normal";
            tab.content.style.display = "none";
          }
        }
      }

      removeTab(tabId) {
        if (this.tabs[tabId]) {
          const tab = this.tabs[tabId];
          tab.header.remove();
          tab.content.remove();
          delete this.tabs[tabId];
          // Switch to another tab if available.
          const remaining = Object.keys(this.tabs);
          if (remaining.length > 0) {
            this.switchTab(remaining[0]);
          } else {
            this.activeTabId = null;
          }
        }
      }

      getAllTabs() {
        return this.tabs;
      }
    }

      // Global variables to store the original texts so the expand function can re‐render.
    let gOldText = "";
    let gNewText = "";

    // State Management Class

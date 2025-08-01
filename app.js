    // Convert a concatenated hex string into a Uint8Array.
    function hexStringToByteArray(hexString) {
      hexString = hexString.replace(/\s+/g, "");
      const byteLength = Math.floor(hexString.length / 2);
      const result = new Uint8Array(byteLength);
      for (let i = 0; i < byteLength; i++) {
        result[i] = parseInt(hexString.substr(i * 2, 2), 16);
      }
      return result;
    }
    
    // Produce a hex dump from a Uint8Array.
    function hexDump(buffer) {
      const bytesPerLine = 16;
      let result = "";
      for (let i = 0; i < buffer.length; i += bytesPerLine) {
        const lineBytes = Array.from(buffer.slice(i, i + bytesPerLine));
        const hexBytes = lineBytes.map(byte => byte.toString(16).padStart(2, '0'));
        const asciiChars = lineBytes.map(byte =>
          byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.'
        );
        while (hexBytes.length < bytesPerLine) {
          hexBytes.push("  ");
          asciiChars.push(" ");
        }
        result += i.toString(16).padStart(8, '0') + "  " +
                  hexBytes.join(" ") + "  " +
                  asciiChars.join("") + "\n";
      }
      return result;
    }
    
    // Attempt to detect a common file header from a Uint8Array.
    function detectHeader(buffer) {
      // Define a list of known file signatures.
      // Each signature can be defined as an array of byte values or as a string.
      // (You can add an "offset" property if the signature does not start at 0.)
      const signatures = [
        { type: "BMP Image",    signature: [0x42, 0x4D] },
        { type: "PNG Image",    signature: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
        { type: "GIF Image",    signature: "GIF87a" },
        { type: "GIF Image",    signature: "GIF89a" },
        { type: "JPEG Image",   signature: [0xFF, 0xD8, 0xFF] },
        { type: "PDF Document", signature: "%PDF" },
        { type: "ZIP Archive",  signature: [0x50, 0x4B, 0x03, 0x04] },
        // Additional formats:
        { type: "RAR Archive",  signature: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00] },
        { type: "RAR Archive",  signature: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00] },
        { type: "7z Archive",   signature: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] },
        { type: "ELF Executable", signature: [0x7F, 0x45, 0x4C, 0x46] }
      ];

      // Iterate over the signature definitions.
      for (const sig of signatures) {
        // Determine the starting offset (default is 0)
        const offset = sig.offset || 0;
        // Ensure the buffer is long enough to check this signature.
        const sigLength = (typeof sig.signature === "string")
          ? sig.signature.length
          : sig.signature.length;
        if (buffer.length < offset + sigLength) continue;

        if (typeof sig.signature === "string") {
          // Compare the signature as a text string.
          const header = String.fromCharCode(...buffer.slice(offset, offset + sigLength));
          if (header === sig.signature) return sig.type;
        } else if (Array.isArray(sig.signature)) {
          // Compare the signature byte by byte.
          let match = true;
          for (let i = 0; i < sig.signature.length; i++) {
            if (buffer[offset + i] !== sig.signature[i]) {
              match = false;
              break;
            }
          }
          if (match) return sig.type;
        }
      }
      return null;
    }
    
    function isHandleCode(code) {
      return code === 5 ||
             code === 105 ||
             (code >= 320 && code <= 329) ||
             (code >= 330 && code <= 339) ||
             (code >= 340 && code <= 349) ||
             (code >= 350 && code <= 359) ||
             (code >= 360 && code <= 369) ||
             (code >= 390 && code <= 399) ||
             (code >= 480 && code <= 481) ||
             code === 1005;
    }
    class DxfParser {
      constructor() {
        this.containerMapping = {
          "SECTION": "ENDSEC",
          "BLOCK":   "ENDBLK",
          "TABLE":   "ENDTAB",
          "OBJECT":  "ENDOBJ",
          "POLYLINE": "SEQEND"
        };
        this.nextId = 1;
      }
 
      parse(text) {
        const tags = this.parseDxf(text);
        const grouped = this.groupObjectsIterative(tags, 0);
        return grouped.objects;
      }
      
      parseDxf(text) {
        // Split on CR/LF without discarding blank lines in the value portion.
        const lines = text.split(/\r?\n/);
        const tags = [];
        for (let i = 0; i < lines.length; i++) {
          // Read the code line. (A DXF tag always begins with a numeric code.)
          // We trim the code line to remove extraneous whitespace.
          let codeLine = lines[i].trim();
          // If the code line is empty then it is not valid – skip it.
          if (codeLine === "") continue;
          let code = parseInt(codeLine, 10);
          if (isNaN(code)) continue;
          // For the value line, do not force a non‑empty string.
          // If the line is empty it still counts as valid data.
          let value = "";
          if (i + 1 < lines.length) {
            // If you want to preserve leading/trailing whitespace from the value, omit .trim()
            value = lines[i + 1];
            // Alternatively, if you want to remove extra whitespace, you can use .trim():
            // value = lines[i + 1].trim();
          }
          // Advance one extra line to skip the value that was just processed.
          i++;
          // Record the tag. Note: the "line" property is set to the line number (i.e. the index of the value line)
          // so that it corresponds to the original file numbering.
          tags.push({ line: i, code, value });
        }
        return tags;
      }

      parseDxfLines(lines) {
        const tags = [];
        for (let i = 0; i < lines.length; i++) {
          const codeLine = lines[i].trim();
          if (!codeLine) continue;
          const code = parseInt(codeLine, 10);
          if (isNaN(code)) continue;
          let value = "";
          if (i + 1 < lines.length) { value = lines[i + 1].trim(); }
          i++;
          tags.push({ line: i, code, value });
        }
        return tags;
      }

      groupObjects(tags, startIndex, endMarker = null, containerStartLine = null) {
        const objects = [];
        let i = startIndex;
        // Track the highest non‑empty line number seen so far in this grouping.
        let lastNonEmptyLine = containerStartLine !== null ? containerStartLine : 0;

        while (i < tags.length) {
          // If we encounter the expected end marker…
          if (
            endMarker &&
            tags[i].code === 0 &&
            tags[i].value.toUpperCase() === endMarker
          ) {
            if (tags[i].value.trim() !== "") {
              lastNonEmptyLine = Math.max(lastNonEmptyLine, tags[i].line);
            }
            const endNode = {
              id: this.nextId++,
              type: tags[i].value,
              line: tags[i].line,
              code: tags[i].code, // typically 0
              properties: [],
              children: [],
              isEndMarker: true,
              expanded: false
            };
            lastNonEmptyLine = Math.max(lastNonEmptyLine, tags[i].line);
            i++;
            while (i < tags.length && tags[i].code !== 0) {
              if (tags[i].value.trim() !== "") {
                lastNonEmptyLine = Math.max(lastNonEmptyLine, tags[i].line);
              }
              endNode.properties.push(tags[i]);
              i++;
            }
            objects.push(endNode);
            return { objects, nextIndex: i };
          }

          // Skip any tag that is not the start of an entity.
          if (tags[i].code !== 0) {
            if (tags[i].value.trim() !== "") {
              lastNonEmptyLine = Math.max(lastNonEmptyLine, tags[i].line);
            }
            i++;
            continue;
          }

          // ★ Check for the EOF marker.
          if (tags[i].code === 0 && tags[i].value.toUpperCase() === "EOF") {
            const eofNode = {
              id: this.nextId++,
              type: "EOF",
              line: tags[i].line,
              code: tags[i].code,
              properties: [],
              children: [],
              isEOF: true,    // flag this node as an EOF marker
              expanded: false
            };
            objects.push(eofNode);
            i++;
            continue;
          }

          // Process a new entity (a tag with code 0)
          const entity = {
            id: this.nextId++,
            type: tags[i].value,
            line: tags[i].line,
            code: tags[i].code,
            properties: [],
            children: [],
            isContainer: this.containerMapping.hasOwnProperty(tags[i].value.toUpperCase()),
            expanded: false
          };
          if (tags[i].value.trim() !== "") {
            lastNonEmptyLine = Math.max(lastNonEmptyLine, tags[i].line);
          }
          i++;

          // Collect subsequent property tags (all tags with code !== 0)
          while (i < tags.length && tags[i].code !== 0) {
            if (tags[i].value.trim() !== "") {
              lastNonEmptyLine = Math.max(lastNonEmptyLine, tags[i].line);
            }
            entity.properties.push(tags[i]);
            i++;
          }

          // Check for a handle property.
          const handleProp = entity.properties.find(prop =>
            isHandleCode(Number(prop.code))
          );
          if (handleProp) {
            entity.handle = handleProp.value;
          }

          // If the entity is a container, process its children recursively.
          if (entity.isContainer) {
            const expectedEndMarker = this.containerMapping[entity.type.toUpperCase()];
            const result = this.groupObjects(tags, i, expectedEndMarker, entity.line);
            entity.children = result.objects;
            i = result.nextIndex;
            while (i < tags.length && tags[i].code !== 0) {
              if (tags[i].value.trim() !== "") {
                lastNonEmptyLine = Math.max(lastNonEmptyLine, tags[i].line);
              }
              entity.properties.push(tags[i]);
              i++;
            }
          }

          objects.push(entity);
        }

        // If an expected end marker was not found, create a synthetic one.
        if (endMarker) {
          const syntheticLine = lastNonEmptyLine + 1;
          const syntheticEndNode = {
            id: this.nextId++,
            type: endMarker,
            line: syntheticLine,
            code: 0,
            properties: [],
            children: [],
            isEndMarker: true,
            expanded: false,
            synthetic: true
          };
          objects.push(syntheticEndNode);
        }

        return { objects, nextIndex: i };
      }
      
groupObjectsIterative(tags, startIndex = 0, endMarker = null, containerStartLine = null) {
  const objects = [];
  const stack = [];
  let current = {
    children: objects,
    expectedEndMarker: endMarker,
    lastNonEmptyLine: containerStartLine !== null ? containerStartLine : 0,
    containerNode: null,
    parentType: null
  };

  let i = startIndex;
  while (i < tags.length) {
    const tag = tags[i];
    if (tag.value.trim() !== "") {
      current.lastNonEmptyLine = Math.max(current.lastNonEmptyLine, tag.line);
    }

    if (tag.code !== 0) {
      i++;
      continue;
    }

    const tagValue = tag.value.trim();
    const tagValueU = tagValue.toUpperCase();

    if (current.expectedEndMarker && tagValueU === current.expectedEndMarker) {
      current.lastNonEmptyLine = Math.max(current.lastNonEmptyLine, tag.line);

      const endNode = {
        id: this.nextId++,
        type: tag.value,
        line: tag.line,
        code: tag.code,
        properties: [],
        children: [],
        isEndMarker: true,
        expanded: false
      };

      i++;
      while (i < tags.length && tags[i].code !== 0) {
        const propTag = tags[i];
        if (propTag.value.trim() !== "") {
          current.lastNonEmptyLine = Math.max(current.lastNonEmptyLine, propTag.line);
        }
        endNode.properties.push(propTag);
        i++;
      }

      current.children.push(endNode);

      let finishedContext = current;
      let finishedContainer = finishedContext.containerNode;
      current = stack.length > 0 ? stack.pop() : {
        children: objects,
        expectedEndMarker: null,
        lastNonEmptyLine: finishedContext.lastNonEmptyLine,
        containerNode: null,
        parentType: null
      };

      while (i < tags.length && tags[i].code !== 0) {
        const extraProp = tags[i];
        if (extraProp.value.trim() !== "") {
          current.lastNonEmptyLine = Math.max(current.lastNonEmptyLine, extraProp.line);
        }
        if (finishedContainer) {
          finishedContainer.properties.push(extraProp);
        }
        i++;
      }

      continue;
    }

    if (tagValueU === "EOF") {
      const eofNode = {
        id: this.nextId++,
        type: "EOF",
        line: tag.line,
        code: tag.code,
        properties: [],
        children: [],
        isEOF: true,
        expanded: false
      };
      current.children.push(eofNode);
      i++;
      continue;
    }

    const entity = {
      id: this.nextId++,
      type: tag.value,
      line: tag.line,
      code: tag.code,
      properties: [],
      children: [],
      expanded: false,
      isContainer: !!this.containerMapping[tag.value.toUpperCase()],
      parentType: current.containerNode?.type || null // ⭐ Add parentType reference here
    };
    i++;

    while (i < tags.length && tags[i].code !== 0) {
      const propTag = tags[i];
      if (propTag.value.trim() !== "") {
        current.lastNonEmptyLine = Math.max(current.lastNonEmptyLine, propTag.line);
      }
      entity.properties.push(propTag);
      i++;
    }

    const handleProp = entity.properties.find(prop => isHandleCode(prop.code));
    if (handleProp) {
      entity.handle = handleProp.value;
    }

    if (entity.isContainer) {
      stack.push(current);
      const parentContext = stack[stack.length - 1];
      parentContext.children.push(entity);
      current = {
        children: entity.children,
        expectedEndMarker: this.containerMapping[entity.type.toUpperCase()],
        lastNonEmptyLine: entity.line,
        containerNode: entity,
        parentType: entity.type // Pass down the parent type
      };
    } else {
      current.children.push(entity);
    }
  }

  while (true) {
    if (current.expectedEndMarker) {
      const syntheticLine = current.lastNonEmptyLine + 1;
      const syntheticEndNode = {
        id: this.nextId++,
        type: current.expectedEndMarker,
        line: syntheticLine,
        code: 0,
        properties: [],
        children: [],
        isEndMarker: true,
        expanded: false,
        synthetic: true
      };
      current.children.push(syntheticEndNode);
    }
    if (stack.length === 0) break;
    current = stack.pop();
  }

  return { objects, nextIndex: i };
}

      findNodeById(tree, id) {
        for (const obj of tree) {
          if (String(obj.id) === String(id)) return obj;
          if (obj.children && obj.children.length) {
            const result = this.findNodeById(obj.children, id);
            if (result) return result;
          }
        }
        return null;
      }

      findNodeByIdIterative(tree, id) {
        const stack = [...tree];
        while (stack.length) {
          const node = stack.pop();
          if (String(node.id) === String(id)) {
            return node;
          }
          if (node.children && node.children.length > 0) {
            stack.push(...node.children);
          }
        }
        return null;
      }

      findParentByIdIterative(tree, id) {
        const stack = tree.map(n => ({ node: n, parent: null }));
        while (stack.length) {
          const { node, parent } = stack.pop();
          if (String(node.id) === String(id)) {
            return parent;
          }
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => stack.push({ node: child, parent: node }));
          }
        }
        return null;
      }

      serializeNode(node) {
        let lines = [];
        lines.push("0");
        lines.push(node.type);
        node.properties.forEach(prop => {
          lines.push(prop.code.toString());
          lines.push(prop.value);
        });
        if (node.isContainer && node.children && node.children.length) {
          node.children.forEach(child => {
            lines.push(this.serializeNode(child));
          });
          // Only add an extra end marker if the last child isn’t one already.
          const lastChild = node.children[node.children.length - 1];
          if (!lastChild.isEndMarker) {
            const endMarker = this.containerMapping[node.type.toUpperCase()];
            if (endMarker) {
              lines.push("0");
              lines.push(endMarker);
            }
          }
        }
        return lines.join("\n");
      }

      serializeTree(nodes) {
        return nodes.map(n => this.serializeNode(n)).join("\n");
      }
    }
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
    class StateManager {
      constructor() {
        this.storageKey = 'dxf_parser_state';
        this.tabStatePrefix = 'dxf_tab_';
      }

      // Save the complete application state
      saveAppState(tabs, activeTabId, columnWidths) {
        try {
          const appState = {
            activeTabId: activeTabId,
            columnWidths: columnWidths,
            tabIds: tabs.map(tab => tab.id),
            timestamp: Date.now()
          };
          localStorage.setItem(this.storageKey, JSON.stringify(appState));
          
          // Save each tab's state separately for efficiency
          tabs.forEach(tab => {
            this.saveTabState(tab);
          });
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

      // Get all saved tab IDs
      getSavedTabIds() {
        try {
          const appState = this.loadAppState();
          return appState ? appState.tabIds || [] : [];
        } catch (error) {
          console.warn('Failed to get saved tab IDs:', error);
          return [];
        }
      }

      // Check if we have saved state
      hasSavedState() {
        return localStorage.getItem(this.storageKey) !== null;
      }
    }

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
        this.treeViewContainer = document.getElementById("treeViewContainer");
        this.treeViewContent = document.getElementById("treeViewContent");
        this.tabs = [];
        this.activeTabId = null;
        this.currentBinaryData = null;
        this.currentDetectedType = null;
        this.selectedNodeId = null;
            // We'll cache the measured hex line height here.
    this.hexLineHeight = null;
        // Create the TreeDataGrid instance and pass columnWidths via the constructor.
        this.myTreeGrid = new TreeDataGrid(this.treeViewContainer, this.treeViewContent, {
          itemHeight: 24,
          copyCallback: (nodeId) => this.handleCopy(nodeId),
          openCallback: (nodeId) => this.handleOpen(nodeId),  // <-- new callback for "Open" button
          onToggleExpand: (nodeId) => this.handleToggleExpand(nodeId),
          onHandleClick: (handle) => this.handleLinkToHandle(handle),
          onRowSelect: (nodeId) => { this.selectedNodeId = nodeId; },
          columnWidths: this.columnWidths,
          hexViewerCallback: (combinedHexString) => this.showHexViewer(combinedHexString)
        });
        this.batchDataGrid = new BatchDataGrid(
          document.getElementById("batchResultsTabHeaders"),
          document.getElementById("batchResultsTabContents")
        );
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
          this.stateManager.saveAppState(this.tabs, this.activeTabId, this.columnWidths);
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
          
          // Restore tabs
          const restoredTabs = [];
          for (const tabId of appState.tabIds || []) {
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
          
          // Update the app with restored tabs
          this.tabs = restoredTabs;
          this.activeTabId = appState.activeTabId;
          
          // Ensure we have a valid active tab
          if (this.tabs.length > 0) {
            if (!this.activeTabId || !this.tabs.find(t => t.id === this.activeTabId)) {
              this.activeTabId = this.tabs[0].id;
            }
            
            // Update UI
            this.updateTabUI();
            
            // Apply filters and update tree
            const activeTab = this.getActiveTab();
            if (activeTab) {
              this.applyTabFilters(activeTab);
            }
          }
          
          console.log(`Restored ${restoredTabs.length} tabs`);
          
        } catch (error) {
          console.error('Failed to restore app state:', error);
          // Clear corrupted state
          this.stateManager.clearAllState();
        }
      }
      
      // Apply filters to a tab and update tree display
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
        
        // Update tree display
        this.myTreeGrid.setData(tab.currentTreeData);
        
        // Update UI elements
        this.updateTagContainer("codeSearchTags", tab.codeSearchTerms, "code");
        this.updateTagContainer("dataSearchTags", tab.dataSearchTerms, "data");
        document.getElementById("dataExactCheckbox").checked = tab.dataExact;
        document.getElementById("dataCaseCheckbox").checked = tab.dataCase;
        document.getElementById("minLineInput").value = tab.minLine || "";
        document.getElementById("maxLineInput").value = tab.maxLine || "";
      }
      
      initEventListeners() {
        document.getElementById("parseBtn").addEventListener("click", () => this.handleParse());
        document.getElementById("createNewDxfBtn").addEventListener("click", () => this.handleCreateNewDxf());
        document.getElementById("expandAllBtn").addEventListener("click", () => this.handleExpandAll());
        document.getElementById("collapseAllBtn").addEventListener("click", () => this.handleCollapseAll());
        document.getElementById("resetStateBtn").addEventListener("click", () => this.handleResetState());
        document.getElementById("addRowBtn").addEventListener("click", () => this.handleAddRow());
        document.getElementById("removeRowBtn").addEventListener("click", () => this.handleRemoveRow());
        document.getElementById("downloadDxfBtn").addEventListener("click", () => this.handleDownloadDxf());
        document.querySelectorAll('.header-cell').forEach(headerCell => {
          headerCell.addEventListener('click', (e) => {
            if (e.target.classList.contains('resizer')) return;
            this.handleHeaderClick(headerCell);
          });
        });
        document.querySelectorAll('.header-cell .resizer').forEach(resizer => {
          resizer.addEventListener('mousedown', (e) => this.handleResizerMouseDown(e));
        });
        this.setupTagInput("codeSearchInput", "code");
        this.setupTagInput("dataSearchInput", "data");
        document.getElementById("searchBtn").addEventListener("click", () => this.handleSearch());
        document.getElementById("clearSearchBtn").addEventListener("click", () => this.handleClearSearch());
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
        document.getElementById("dataExactCheckbox").addEventListener("change", () => this.handleSearchOptionChange());
        document.getElementById("dataCaseCheckbox").addEventListener("change", () => this.handleSearchOptionChange());
        document.getElementById("codeSearchInput").addEventListener("input", () => this.updateEffectiveSearchTerms());
        document.getElementById("dataSearchInput").addEventListener("input", () => this.updateEffectiveSearchTerms());
        document.getElementById("minLineInput").addEventListener("input", () => this.updateEffectiveSearchTerms());
        document.getElementById("maxLineInput").addEventListener("input", () => this.updateEffectiveSearchTerms());
        document.getElementById("goToHandleBtn").addEventListener("click", () => this.handleGoToHandle());
        document.getElementById("backBtn").addEventListener("click", () => this.navigateBack());
        document.getElementById("forwardBtn").addEventListener("click", () => this.navigateForward());
        document.getElementById("clearHistoryBtn").addEventListener("click", () => this.clearNavigationHistory());
        this.treeViewContainer.addEventListener("scroll", (e) => {
          const scrollLeft = e.target.scrollLeft;
          document.getElementById("treeGridHeader").style.transform = "translateX(-" + scrollLeft + "px)";
        });
        window.addEventListener("resize", () => { this.myTreeGrid.updateVisibleNodes(); });
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
        
        // Refresh tree and save state
        this.updateEffectiveSearchTerms();
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

      updateEffectiveSearchTerms() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        const codeInput = document.getElementById("codeSearchInput");
        const dataInput = document.getElementById("dataSearchInput");
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
        const minLine = document.getElementById("minLineInput").value.trim() !== ""
          ? parseInt(document.getElementById("minLineInput").value.trim(), 10)
          : null;
        const maxLine = document.getElementById("maxLineInput").value.trim() !== ""
          ? parseInt(document.getElementById("maxLineInput").value.trim(), 10)
          : null;
        activeTab.minLine = minLine;
        activeTab.maxLine = maxLine;
        activeTab.dataExact = document.getElementById("dataExactCheckbox").checked;
        activeTab.dataCase = document.getElementById("dataCaseCheckbox").checked;

        // Get the selected object types from the dropdown checkboxes.
        const container = document.getElementById("objectTypeDropdownContent");
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
        this.myTreeGrid.setData(activeTab.currentTreeData);
        this.treeViewContainer.scrollTop = 0;
        // Save state after search terms change
        this.saveCurrentState();
      }
      
      handleSearchOptionChange() { this.updateEffectiveSearchTerms(); }
      
      getActiveTab() { return this.tabs.find(t => t.id === this.activeTabId); }

      populateObjectTypeDropdown() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;

        // Build a count for each object type.
        let typeCounts = {};
        function traverse(nodes) {
          nodes.forEach(node => {
            if (!node.isProperty && node.type) {
              typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
            }
            if (node.children && node.children.length > 0) {
              traverse(node.children);
            }
          });
        }
        activeTab.originalTreeData.forEach(node => traverse([node]));

        const container = document.getElementById("objectTypeDropdownContent");
        container.innerHTML = ""; // Clear existing options

        // Add a "Select All / Deselect All" header option.
        const selectAllLabel = document.createElement("label");
        selectAllLabel.style.fontWeight = "bold";
        const selectAllCheckbox = document.createElement("input");
        selectAllCheckbox.type = "checkbox";
        selectAllCheckbox.checked = true; // Default: all types are selected.
        selectAllCheckbox.addEventListener("change", () => {
          // When toggled, set every type checkbox to the same state.
          container.querySelectorAll("input[type='checkbox']").forEach((cb, index) => {
            // Skip the first checkbox which is our "Select All"
            if (index > 0) { cb.checked = selectAllCheckbox.checked; }
          });
          this.updateEffectiveSearchTerms();
          this.updateObjectTypeDropdownButton();
        });
        selectAllLabel.appendChild(selectAllCheckbox);
        selectAllLabel.appendChild(document.createTextNode(" Select All"));
        container.appendChild(selectAllLabel);

        // Sort the types alphabetically.
        const sortedTypes = Object.keys(typeCounts).sort();

        // Create a checkbox for each type with its count.
        sortedTypes.forEach(type => {
          const label = document.createElement("label");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = type;
          checkbox.checked = true; // Default to selected.
          checkbox.addEventListener("change", () => {
            // When any type is toggled, update the "Select All" checkbox.
            const allTypeCheckboxes = Array.from(container.querySelectorAll("input[type='checkbox']")).slice(1);
            selectAllCheckbox.checked = allTypeCheckboxes.every(cb => cb.checked);
            this.updateEffectiveSearchTerms();
            this.updateObjectTypeDropdownButton();
          });
          label.appendChild(checkbox);
          // Append the object type with its count, e.g. "LINE (30)"
          label.appendChild(document.createTextNode(" " + type + " (" + typeCounts[type] + ")"));
          container.appendChild(label);
        });
        this.updateObjectTypeDropdownButton();
      }

      updateObjectTypeDropdownButton() {
        const container = document.getElementById("objectTypeDropdownContent");
        const checkboxes = container.querySelectorAll("input[type='checkbox']");
        const selected = [];
        checkboxes.forEach(cb => {
          if (cb.checked) selected.push(cb.value);
        });
        const button = document.getElementById("objectTypeDropdownButton");
        if (selected.length === checkboxes.length) {
          button.textContent = "All Types";
        } else if (selected.length === 0) {
          button.textContent = "None Selected";
        } else {
          button.textContent = selected.join(", ");
        }
      }
 
      updateTabUI() {
        const tabContainer = document.getElementById("tabContainer");
        tabContainer.innerHTML = "";
        this.tabs.forEach(tab => {
          const tabElem = document.createElement("div");
          tabElem.className = "tab" + (tab.id === this.activeTabId ? " active" : "");
          tabElem.textContent = tab.name;
          tabElem.dataset.tabId = tab.id;
          tabElem.addEventListener("click", () => {
            this.activeTabId = tab.id;
            document.getElementById("codeSearchInput").value = "";
            document.getElementById("dataSearchInput").value = "";
            this.updateTagContainer("codeSearchTags", tab.codeSearchTerms, "code");
            this.updateTagContainer("dataSearchTags", tab.dataSearchTerms, "data");
            document.getElementById("minLineInput").value = tab.minLine !== null ? tab.minLine : "";
            document.getElementById("maxLineInput").value = tab.maxLine !== null ? tab.maxLine : "";
            document.getElementById("dataExactCheckbox").checked = tab.dataExact || false;
            document.getElementById("dataCaseCheckbox").checked = tab.dataCase || false;
            this.myTreeGrid.setData(tab.currentTreeData);
            this.updateTabUI();
          });
          const closeBtn = document.createElement("span");
          closeBtn.className = "close-tab";
          closeBtn.textContent = "×";
          closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            // Remove state for the closed tab
            this.stateManager.removeTabState(tab.id);
            
            this.tabs = this.tabs.filter(t => t.id !== tab.id);
            if (this.activeTabId === tab.id) { this.activeTabId = this.tabs.length ? this.tabs[0].id : null; }
            this.updateTabUI();
            if (this.activeTabId) { 
              this.myTreeGrid.setData(this.getActiveTab().currentTreeData); 
              // Apply filters for the new active tab
              this.applyTabFilters(this.getActiveTab());
            }
            else { this.myTreeGrid.setData([]); }
            
            // Save state after tab closure
            this.saveCurrentState();
          });
          tabElem.appendChild(closeBtn);
          tabContainer.appendChild(tabElem);
        });
        this.populateObjectTypeDropdown();
        this.updateNavHistoryUI();
        this.updateNavButtons();
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
          
          // Clear search inputs
          document.getElementById("codeSearchInput").value = "";
          document.getElementById("dataSearchInput").value = "";
          document.getElementById("minLineInput").value = "";
          document.getElementById("maxLineInput").value = "";
          document.getElementById("dataExactCheckbox").checked = false;
          document.getElementById("dataCaseCheckbox").checked = false;
          
          // Clear tag containers
          this.updateTagContainer("codeSearchTags", [], "code");
          this.updateTagContainer("dataSearchTags", [], "data");
          
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
        this.updateEffectiveSearchTerms();
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
        this.updateEffectiveSearchTerms();
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
      
      handleFiles(files) {
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
                  this.tabs.push(newTab);
                  this.activeTabId = newTab.id;
                  // Initialize class mapping before displaying data
                  this.updateClasses();
                  this.updateTabUI();
                  this.myTreeGrid.setData(newTab.currentTreeData);
                  // Save state after new tab creation
                  this.saveCurrentState();
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
              this.tabs.push(newTab);
              this.activeTabId = newTab.id;
              // Call updateClasses() now so that CLASS nodes get their classId set.
              this.updateClasses();
              this.updateTabUI();
              this.myTreeGrid.setData(newTab.currentTreeData);
              // Save state after new tab creation
              this.saveCurrentState();
            };
            reader.readAsText(file, "ascii");
          }
        });
      }
      
      handleParse() {
        const fileInput = document.getElementById("fileInput");
        this.handleFiles(fileInput.files);
      }
      
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
      
      createTagElement(text, type) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = text;
        const removeBtn = document.createElement("span");
        removeBtn.className = "remove";
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const activeTab = this.getActiveTab();
          if (!activeTab) return;
          if (type === "code") {
            activeTab.codeSearchTerms = activeTab.codeSearchTerms.filter(term => term !== text);
            this.updateTagContainer("codeSearchTags", activeTab.codeSearchTerms, "code");
          } else if (type === "data") {
            activeTab.dataSearchTerms = activeTab.dataSearchTerms.filter(term => term !== text);
            this.updateTagContainer("dataSearchTags", activeTab.dataSearchTerms, "data");
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
        });
        tag.appendChild(removeBtn);
        return tag;
      }
      
      updateTagContainer(containerId, termsArray, type) {
        const container = document.getElementById(containerId);
        Array.from(container.querySelectorAll(".tag")).forEach(tag => tag.remove());
        termsArray.forEach(term => {
          const tagElem = this.createTagElement(term, type);
          container.insertBefore(tagElem, container.querySelector("input"));
        });
      }
      
      setupTagInput(inputId, type) {
        const input = document.getElementById(inputId);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const text = input.value.trim();
            if (text !== "") {
              const activeTab = this.getActiveTab();
              if (!activeTab) return;
              if (type === "code") {
                if (!activeTab.codeSearchTerms.includes(text)) {
                  activeTab.codeSearchTerms.push(text);
                }
                this.updateTagContainer("codeSearchTags", activeTab.codeSearchTerms, "code");
              } else {
                if (!activeTab.dataSearchTerms.includes(text)) {
                  activeTab.dataSearchTerms.push(text);
                }
                this.updateTagContainer("dataSearchTags", activeTab.dataSearchTerms, "data");
              }
              input.value = "";
              this.updateEffectiveSearchTerms();
            }
          }
        });
        input.addEventListener("blur", () => {
          const text = input.value.trim();
          if (text !== "") {
            const activeTab = this.getActiveTab();
            if (!activeTab) return;
            if (type === "code") {
              if (!activeTab.codeSearchTerms.includes(text)) {
                activeTab.codeSearchTerms.push(text);
              }
              this.updateTagContainer("codeSearchTags", activeTab.codeSearchTerms, "code");
            } else {
              if (!activeTab.dataSearchTerms.includes(text)) {
                activeTab.dataSearchTerms.push(text);
              }
              this.updateTagContainer("dataSearchTags", activeTab.dataSearchTerms, "data");
            }
            input.value = "";
            this.updateEffectiveSearchTerms();
          }
        });
      }
      
      handleSearch() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;
        const codeInput = document.getElementById("codeSearchInput");
        const dataInput = document.getElementById("dataSearchInput");
        if (codeInput.value.trim() !== "") {
          const text = codeInput.value.trim();
          if (!activeTab.codeSearchTerms.includes(text)) {
            activeTab.codeSearchTerms.push(text);
          }
          this.updateTagContainer("codeSearchTags", activeTab.codeSearchTerms, "code");
          codeInput.value = "";
        }
        if (dataInput.value.trim() !== "") {
          const text = dataInput.value.trim();
          if (!activeTab.dataSearchTerms.includes(text)) {
            activeTab.dataSearchTerms.push(text);
          }
          this.updateTagContainer("dataSearchTags", activeTab.dataSearchTerms, "data");
          dataInput.value = "";
        }
        this.updateEffectiveSearchTerms();
      }
      
      handleClearSearch() {
        const activeTab = this.getActiveTab();
        if (!activeTab) return;

        // Clear search-related terms
        activeTab.codeSearchTerms = [];
        activeTab.dataSearchTerms = [];
        activeTab.minLine = null;
        activeTab.maxLine = null;

        // Reset the object type filter:
        // Get the container holding the checkboxes and set them all to checked.
        const objectTypeContainer = document.getElementById("objectTypeDropdownContent");
        const checkboxes = objectTypeContainer.querySelectorAll("input[type='checkbox']");
        checkboxes.forEach(cb => cb.checked = true);

        // Update the active tab to include all types.
        activeTab.selectedObjectTypes = Array.from(checkboxes).map(cb => cb.value);

        // Update the UI for the tag containers and dropdown button.
        this.updateTagContainer("codeSearchTags", activeTab.codeSearchTerms, "code");
        this.updateTagContainer("dataSearchTags", activeTab.dataSearchTerms, "data");
        document.getElementById("codeSearchInput").value = "";
        document.getElementById("dataSearchInput").value = "";
        document.getElementById("dataExactCheckbox").checked = false;
        document.getElementById("dataCaseCheckbox").checked = false;
        document.getElementById("minLineInput").value = "";
        document.getElementById("maxLineInput").value = "";
        this.updateObjectTypeDropdownButton();

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
        this.myTreeGrid.setData(activeTab.currentTreeData);
        this.treeViewContainer.scrollTop = 0;
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
      
      document.getElementById("objectTypeDropdownButton").addEventListener("click", (e) => {
        e.stopPropagation();
        const dropdownContent = document.getElementById("objectTypeDropdownContent");
        dropdownContent.style.display = (dropdownContent.style.display === "block") ? "none" : "block";
      });
      document.addEventListener("click", () => {
        const dropdownContent = document.getElementById("objectTypeDropdownContent");
        dropdownContent.style.display = "none";
      });
      
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
          window.app.handleFiles(files);
        }
      }, false);
    });

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

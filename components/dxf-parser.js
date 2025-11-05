(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DxfParser = factory();
  }
}(function () {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof self !== "undefined") return self;
  if (typeof window !== "undefined") return window;
  if (typeof global !== "undefined") return global;
  return {};
}(), function () {
  "use strict";

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

  function getSectionName(node) {
    if (!node || !Array.isArray(node.properties)) {
      return null;
    }
    const entry = node.properties.find(prop => Number(prop.code) === 2);
    if (!entry || entry.value == null) {
      return null;
    }
    const trimmed = String(entry.value).trim();
    return trimmed ? trimmed : null;
  }

  class DxfParser {
    constructor() {
      this.containerMapping = {
        "SECTION": "ENDSEC",
        "BLOCK": "ENDBLK",
        "TABLE": "ENDTAB",
        "OBJECT": "ENDOBJ",
        "POLYLINE": "SEQEND"
      };
      this.nextId = 1;
    }

    parse(text) {
      this.nextId = 1;
      const tags = this.parseDxf(text);
      const grouped = this.groupObjectsIterative(tags, 0);
      return grouped.objects;
    }

    parseDxf(text) {
      const lines = text.split(/\r?\n/);
      const tags = [];
      for (let i = 0; i < lines.length; i++) {
        const codeLine = lines[i].trim();
        if (codeLine === "") continue;
        const code = parseInt(codeLine, 10);
        if (isNaN(code)) continue;
        let value = "";
        if (i + 1 < lines.length) {
          value = lines[i + 1];
        }
        i++;
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
        if (i + 1 < lines.length) {
          value = lines[i + 1].trim();
        }
        i++;
        tags.push({ line: i, code, value });
      }
      return tags;
    }

    groupObjects(tags, startIndex, endMarker = null, containerStartLine = null) {
      const objects = [];
      let i = startIndex;
      let lastNonEmptyLine = containerStartLine !== null ? containerStartLine : 0;

      while (i < tags.length) {
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
            code: tags[i].code,
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

        if (tags[i].code !== 0) {
          if (tags[i].value.trim() !== "") {
            lastNonEmptyLine = Math.max(lastNonEmptyLine, tags[i].line);
          }
          i++;
          continue;
        }

        if (tags[i].code === 0 && tags[i].value.toUpperCase() === "EOF") {
          const eofNode = {
            id: this.nextId++,
            type: "EOF",
            line: tags[i].line,
            code: tags[i].code,
            properties: [],
            children: [],
            isEOF: true,
            expanded: false
          };
          objects.push(eofNode);
          i++;
          continue;
        }

        const entity = {
          id: this.nextId++,
          type: tags[i].value,
          line: tags[i].line,
          code: tags[i].code,
          properties: [],
          children: [],
          isContainer: Object.prototype.hasOwnProperty.call(
            this.containerMapping,
            tags[i].value.toUpperCase()
          ),
          expanded: false
        };
        if (tags[i].value.trim() !== "") {
          lastNonEmptyLine = Math.max(lastNonEmptyLine, tags[i].line);
        }
        i++;

        while (i < tags.length && tags[i].code !== 0) {
          if (tags[i].value.trim() !== "") {
            lastNonEmptyLine = Math.max(lastNonEmptyLine, tags[i].line);
          }
          entity.properties.push(tags[i]);
          i++;
        }

        const handleProp = entity.properties.find(prop =>
          isHandleCode(Number(prop.code))
        );
        if (handleProp) {
          entity.handle = handleProp.value;
        }

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
        const tagValueUpper = tagValue.toUpperCase();

        if (current.expectedEndMarker && tagValueUpper === current.expectedEndMarker) {
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
          if (current.containerNode) {
            const parentSection = current.containerNode.sectionName || getSectionName(current.containerNode);
            if (parentSection) {
              endNode.sectionName = parentSection;
            }
          }
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

          const finishedContext = current;
          const finishedContainer = finishedContext.containerNode;
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

        if (tagValueUpper === "EOF") {
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
          parentType: current.containerNode ? current.containerNode.type : null
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

        if (entity.type && entity.type.toUpperCase() === "SECTION") {
          const sectionName = getSectionName(entity);
          if (sectionName) {
            entity.sectionName = sectionName;
          }
        }
        if (!entity.sectionName && current.containerNode) {
          const container = current.containerNode;
          let parentSection = container.sectionName || getSectionName(container);
          if (!parentSection && container.containerNode && container.containerNode.sectionName) {
            parentSection = container.containerNode.sectionName;
          }
          if (parentSection) {
            container.sectionName = container.sectionName || parentSection;
            entity.sectionName = parentSection;
          }
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
            parentType: entity.type
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
          if (current.containerNode) {
            const parentSection = current.containerNode.sectionName || getSectionName(current.containerNode);
            if (parentSection) {
              syntheticEndNode.sectionName = parentSection;
            }
          }
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
      const lines = [];
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

  return DxfParser;
}));

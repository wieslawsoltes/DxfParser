/**
 * A browser-side importer for the documented RibbonX customization vocabulary.
 * No Office code, assets, automation objects, or callback names are evaluated.
 */
const SUPPORTED_NAMESPACES = new Set([
  'http://schemas.microsoft.com/office/2006/01/customui',
  'http://schemas.microsoft.com/office/2009/07/customui',
]);
const CONTROL_TYPES = Object.freeze({
  button: 'button',
  toggleButton: 'toggle',
  checkBox: 'checkbox',
  comboBox: 'combobox',
  dropDown: 'dropdown',
  editBox: 'textbox',
  menu: 'menu',
  splitButton: 'split',
  gallery: 'gallery',
  dynamicMenu: 'menu',
  separator: 'separator',
  labelControl: 'label',
  item: 'button',
});
const TRUE = new Set(['true', '1']);
const FALSE = new Set(['false', '0']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const children = (node) => Array.from(node.children || []).filter((child) => child.nodeType === 1);
const nameOf = (node) => node.localName || node.nodeName.split(':').pop();
const finiteInteger = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;

function compileRibbonXml(xml, callbacks = {}, options = {}) {
  if (typeof xml !== 'string') throw new TypeError('RibbonX XML must be a string.');
  if (xml.length > (options.maxXmlLength ?? 1_000_000))
    throw new RangeError('RibbonX XML exceeds the configured size limit.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error('RibbonX imports do not support document types or entity declarations.');
  const Parser = options.DOMParser || globalThis.DOMParser;
  if (!Parser)
    throw new Error(
      'RibbonX requires a DOMParser. Use it in a browser, or supply options.DOMParser.',
    );
  const warnings = [];
  const warningKeys = new Set();
  function warn(code, message, id = '') {
    const key = `${code}:${id}:${message}`;
    if (warningKeys.has(key)) return;
    warningKeys.add(key);
    const warning = { code, message, ...(id ? { id } : {}) };
    warnings.push(warning);
    if (typeof options.onWarning === 'function') options.onWarning(warning);
  }
  function parse(source) {
    if (source.length > (options.maxXmlLength ?? 1_000_000))
      throw new RangeError('RibbonX XML exceeds the configured size limit.');
    if (/<!DOCTYPE|<!ENTITY/i.test(source))
      throw new Error('RibbonX imports do not support document types or entity declarations.');
    const document = new Parser().parseFromString(source, 'application/xml');
    if (!document.documentElement || document.getElementsByTagName('parsererror').length)
      throw new SyntaxError('Invalid RibbonX XML.');
    return document.documentElement;
  }
  const root = parse(xml);
  if (nameOf(root) !== 'customUI')
    throw new SyntaxError('RibbonX XML must have a customUI root element.');
  if (!SUPPORTED_NAMESPACES.has(root.namespaceURI))
    warn('namespace', `Unrecognized RibbonX namespace: ${root.namespaceURI || '(none)'}.`);
  const index = new Map();
  const bindings = new Map();
  const updates = new Map();
  function changed(target, property) {
    if (!updates.has(target.id)) updates.set(target.id, {});
    updates.get(target.id)[property] = target[property];
  }
  let nextId = 0;
  let disposed = false;
  const model = { tabs: [], quickAccessToolbar: [], backstage: [] };
  const missingCallbacks = new Set();
  const maxItems = options.maxItems ?? 10_000;

  function callback(node, attribute, descriptor) {
    const callbackName = node.getAttribute(attribute);
    if (!callbackName) return null;
    if (own(callbacks, callbackName) && typeof callbacks[callbackName] === 'function')
      return callbacks[callbackName];
    const key = `${attribute}:${callbackName}`;
    if (!missingCallbacks.has(key)) {
      missingCallbacks.add(key);
      warn(
        'missing-callback',
        `${attribute} references an unregistered callback "${callbackName}".`,
        descriptor.id,
      );
    }
    return null;
  }
  function invoke(fn, descriptor, ...args) {
    if (disposed || !fn) return undefined;
    try {
      return fn(descriptor, ...args);
    } catch (error) {
      warn('callback-error', error instanceof Error ? error.message : String(error), descriptor.id);
      options.onError?.(error, descriptor);
      return undefined;
    }
  }
  function synchronous(value, descriptor) {
    if (value && typeof value.then === 'function') {
      // RibbonX value getters are synchronous, just as Office callback return values are.
      Promise.resolve(value).catch((error) => options.onError?.(error, descriptor));
      warn(
        'async-getter',
        'RibbonX value getters must return synchronously. Dynamic getContent supports promises through getItems().',
        descriptor.id,
      );
      return undefined;
    }
    return value;
  }
  function register(node, target, fallback) {
    const id =
      node.getAttribute('id') ||
      node.getAttribute('idQ') ||
      node.getAttribute('idMso') ||
      `${fallback}-${++nextId}`;
    if (index.has(id)) throw new SyntaxError(`Duplicate RibbonX control id: ${id}.`);
    target.id = id;
    const descriptor = Object.freeze({
      id,
      Id: id,
      tag: node.getAttribute('tag') || '',
      ...(node.hasAttribute('idMso') ? { idMso: node.getAttribute('idMso') } : {}),
      ...(node.hasAttribute('idQ') ? { idQ: node.getAttribute('idQ') } : {}),
    });
    index.set(id, target);
    bindings.set(id, []);
    if (descriptor.idMso) {
      target.idMso = descriptor.idMso;
      warn(
        'built-in-control',
        'idMso identifies an Office built-in. Its implementation, label, icon, and command must be supplied by the host.',
        id,
      );
    }
    return descriptor;
  }
  function bind(node, attribute, target, property, descriptor, convert = (value) => value) {
    const fn = callback(node, attribute, descriptor);
    if (!fn) return;
    const refresh = () => {
      const value = synchronous(invoke(fn, descriptor), descriptor);
      if (value !== undefined) {
        target[property] = convert(value);
        changed(target, property);
      }
    };
    bindings.get(descriptor.id).push(refresh);
    refresh();
  }
  function bool(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    const text = String(value).toLowerCase();
    return TRUE.has(text) ? true : FALSE.has(text) ? false : fallback;
  }
  function common(node, target, descriptor) {
    if (node.hasAttribute('label')) target.label = node.getAttribute('label');
    if (node.hasAttribute('enabled')) target.enabled = bool(node.getAttribute('enabled'));
    if (node.hasAttribute('visible')) target.visible = bool(node.getAttribute('visible'));
    if (node.hasAttribute('keytip')) target.keyTip = node.getAttribute('keytip');
    if (node.hasAttribute('screentip')) target.tooltip = node.getAttribute('screentip');
    if (node.hasAttribute('supertip')) target.description = node.getAttribute('supertip');
    if (node.hasAttribute('size'))
      target.size = node.getAttribute('size') === 'large' ? 'large' : 'small';
    if (node.hasAttribute('showLabel')) target.showLabel = bool(node.getAttribute('showLabel'));
    if (node.hasAttribute('showImage')) target.showIcon = bool(node.getAttribute('showImage'));
    if (node.hasAttribute('image')) {
      const source = node.getAttribute('image');
      if (typeof options.resolveImage === 'function')
        target.icon = options.resolveImage(source, descriptor);
      else
        warn(
          'image-resource',
          `Image resource "${source}" needs options.resolveImage to return a web icon.`,
          descriptor.id,
        );
    }
    if (node.hasAttribute('imageMso'))
      warn(
        'built-in-image',
        `Office image "${node.getAttribute('imageMso')}" is not bundled. Supply a web icon with options.resolveImage.`,
        descriptor.id,
      );
    bind(node, 'getEnabled', target, 'enabled', descriptor, bool);
    bind(node, 'getVisible', target, 'visible', descriptor, bool);
    bind(node, 'getLabel', target, 'label', descriptor, String);
    bind(node, 'getKeytip', target, 'keyTip', descriptor, String);
    bind(node, 'getScreentip', target, 'tooltip', descriptor, String);
    bind(node, 'getSupertip', target, 'description', descriptor, String);
    bind(node, 'getShowLabel', target, 'showLabel', descriptor, bool);
    bind(node, 'getShowImage', target, 'showIcon', descriptor, bool);
    bind(node, 'getSize', target, 'size', descriptor, (value) =>
      value === 'large' || value === 1 ? 'large' : 'small',
    );
    bind(node, 'getImage', target, 'icon', descriptor, (value) =>
      typeof options.resolveImage === 'function'
        ? options.resolveImage(value, descriptor)
        : String(value),
    );
    for (const attribute of [
      'insertAfterMso',
      'insertBeforeMso',
      'insertAfterQ',
      'insertBeforeQ',
    ]) {
      if (node.hasAttribute(attribute))
        warn(
          'office-placement',
          `${attribute} is not applied; imported controls retain XML order.`,
          descriptor.id,
        );
    }
    if (node.hasAttribute('sizeString'))
      warn(
        'size-string',
        'sizeString is an Office text-measurement hint. Set a web control width explicitly if needed.',
        descriptor.id,
      );
  }
  function replaceContent(target, newItems) {
    // Remove registrations for former dynamic children before accepting their replacements.
    function forget(item) {
      for (const child of item.items || []) forget(child);
      if (index.get(item.id) === item) {
        index.delete(item.id);
        bindings.delete(item.id);
      }
    }
    for (const item of target.items || []) forget(item);
    target.items = newItems();
    changed(target, 'items');
    return target.items;
  }
  function controls(nodes) {
    return nodes.flatMap((node) => {
      const kind = nameOf(node);
      if (kind === 'box' || kind === 'buttonGroup') {
        warn(
          'flattened-layout',
          `${kind} is flattened into its parent. Office-specific nested layout is not reproduced.`,
          node.getAttribute('id') || '',
        );
        return controls(children(node));
      }
      if (!own(CONTROL_TYPES, kind)) {
        warn(
          'unsupported-element',
          `The RibbonX ${kind} element is not supported.`,
          node.getAttribute('id') || '',
        );
        return [];
      }
      const target = { type: CONTROL_TYPES[kind] };
      const descriptor = register(node, target, kind);
      common(node, target, descriptor);
      if (kind === 'toggleButton' || kind === 'checkBox') {
        target.checked = false;
        bind(node, 'getPressed', target, 'checked', descriptor, bool);
      }
      if (kind === 'editBox' || kind === 'comboBox') {
        target.value = '';
        if (node.hasAttribute('maxLength'))
          target.maxLength = finiteInteger(node.getAttribute('maxLength'));
        bind(node, 'getText', target, 'value', descriptor, String);
      }
      const childNodes = children(node);
      if (childNodes.length) target.items = controls(childNodes);
      if (kind === 'dropDown' || kind === 'comboBox' || kind === 'gallery') {
        target.items ||= [];
        const getItemCount = callback(node, 'getItemCount', descriptor);
        const getItemLabel = callback(node, 'getItemLabel', descriptor);
        const getItemId = callback(node, 'getItemID', descriptor);
        const getItemImage = callback(node, 'getItemImage', descriptor);
        if (getItemCount) {
          const refreshItems = () => {
            const rawCount = synchronous(invoke(getItemCount, descriptor), descriptor);
            if (rawCount === undefined) return;
            const count = finiteInteger(rawCount);
            if (count > maxItems)
              throw new RangeError(`RibbonX item count exceeds ${maxItems} for ${descriptor.id}.`);
            target.items = Array.from({ length: count }, (_, i) => {
              const idValue = synchronous(invoke(getItemId, descriptor, i), descriptor);
              const labelValue = synchronous(invoke(getItemLabel, descriptor, i), descriptor);
              const item = {
                id: String(idValue ?? `${descriptor.id}-item-${i}`),
                label: String(labelValue ?? `Item ${i + 1}`),
              };
              if (getItemImage) {
                const value = synchronous(invoke(getItemImage, descriptor, i), descriptor);
                if (value != null)
                  item.icon =
                    typeof options.resolveImage === 'function'
                      ? options.resolveImage(value, descriptor)
                      : String(value);
              }
              return item;
            });
            changed(target, 'items');
          };
          bindings.get(descriptor.id).push(refreshItems);
          refreshItems();
        }
        const getSelectedItemID = callback(node, 'getSelectedItemID', descriptor);
        const getSelectedItemIndex = callback(node, 'getSelectedItemIndex', descriptor);
        if (getSelectedItemID || getSelectedItemIndex) {
          const refreshSelection = () => {
            const id = synchronous(invoke(getSelectedItemID, descriptor), descriptor);
            const selectedIndex = synchronous(invoke(getSelectedItemIndex, descriptor), descriptor);
            if (id !== undefined) target.value = String(id);
            else if (selectedIndex !== undefined)
              target.value = target.items[finiteInteger(selectedIndex)]?.id ?? '';
            if (id !== undefined || selectedIndex !== undefined) changed(target, 'value');
          };
          bindings.get(descriptor.id).push(refreshSelection);
          refreshSelection();
        }
        if (node.hasAttribute('columns'))
          target.columns = Math.max(1, finiteInteger(node.getAttribute('columns')));
        for (const hint of ['itemWidth', 'itemHeight', 'rows']) {
          if (node.hasAttribute(hint))
            warn(
              'gallery-layout-hint',
              `${hint} is not mapped to an exact Office gallery metric.`,
              descriptor.id,
            );
        }
      }
      if (kind === 'splitButton') {
        const primary = target.items?.find((item) => item.type !== 'menu');
        const menu = target.items?.find((item) => item.type === 'menu');
        if (primary) {
          const inherited = [
            'label',
            'icon',
            'enabled',
            'visible',
            'tooltip',
            'description',
            'keyTip',
          ].filter((key) => target[key] === undefined);
          const refreshPrimary = () => {
            for (const key of inherited)
              if (primary[key] !== undefined) {
                target[key] = primary[key];
                changed(target, key);
              }
            target.command = primary.command;
            target.commandParameter = primary.commandParameter;
          };
          refreshPrimary();
          bindings.get(primary.id)?.push(refreshPrimary);
        }
        target.items = menu?.items || [];
      }
      if (kind === 'dynamicMenu') {
        const getContent = callback(node, 'getContent', descriptor);
        target.items ||= [];
        if (getContent) {
          const applyContent = (content) => {
            if (disposed || content == null) return target.items;
            if (typeof content !== 'string')
              throw new TypeError(`getContent for ${descriptor.id} must return RibbonX menu XML.`);
            const menu = parse(content);
            if (nameOf(menu) !== 'menu')
              throw new SyntaxError('RibbonX getContent must return a menu root element.');
            return replaceContent(target, () => controls(children(menu)));
          };
          const refreshContent = () => {
            const content = synchronous(invoke(getContent, descriptor), descriptor);
            if (content !== undefined) applyContent(content);
          };
          bindings.get(descriptor.id).push(refreshContent);
          target.getItems = async () => applyContent(await invoke(getContent, descriptor));
          if (options.loadDynamicMenus !== false) refreshContent();
        }
      }
      const onAction = callback(node, 'onAction', descriptor);
      if (onAction) {
        const action = (parameter, liveControl = target) => {
          if (kind === 'toggleButton' || kind === 'checkBox') {
            target.checked = !!liveControl.checked;
            return invoke(onAction, descriptor, target.checked);
          }
          if (kind === 'dropDown' || kind === 'gallery') {
            target.value = liveControl.value;
            const items = liveControl.items || target.items || [];
            const selection = Array.from(items).findIndex(
              (item) => item.id === target.value || item.value === target.value,
            );
            return invoke(
              onAction,
              descriptor,
              selection < 0 ? String(target.value ?? '') : items[selection].id,
              selection,
            );
          }
          return invoke(onAction, descriptor);
        };
        action.CanExecute = () => !disposed && target.enabled !== false && target.visible !== false;
        action.Execute = (parameter) => action(parameter);
        target.command = action;
      }
      const onChange = callback(node, 'onChange', descriptor);
      target.onChange = (value) => {
        target[kind === 'toggleButton' || kind === 'checkBox' ? 'checked' : 'value'] = value;
        if (onChange) return invoke(onChange, descriptor, String(value ?? ''));
      };
      return [target];
    });
  }
  function tab(node, contextual = null) {
    const target = { groups: [] };
    const descriptor = register(node, target, 'tab');
    common(node, target, descriptor);
    target.header = target.label || descriptor.id;
    if (contextual) target.contextualGroup = contextual;
    if (node.hasAttribute('getLabel'))
      bindings.get(descriptor.id).push(() => {
        target.header = target.label || descriptor.id;
        changed(target, 'header');
      });
    for (const groupNode of children(node)) {
      if (nameOf(groupNode) !== 'group') {
        warn(
          'unsupported-element',
          `Only groups can be direct children of an imported tab; ${nameOf(groupNode)} was skipped.`,
          descriptor.id,
        );
        continue;
      }
      const group = { items: [] };
      const groupDescriptor = register(groupNode, group, 'group');
      common(groupNode, group, groupDescriptor);
      group.header = group.label || groupDescriptor.id;
      if (groupNode.hasAttribute('getLabel'))
        bindings.get(groupDescriptor.id).push(() => {
          group.header = group.label || groupDescriptor.id;
          changed(group, 'header');
        });
      group.items = controls(
        children(groupNode).filter((child) => nameOf(child) !== 'dialogBoxLauncher'),
      );
      const launcher = children(groupNode).find((child) => nameOf(child) === 'dialogBoxLauncher');
      if (launcher) {
        const launcherItems = controls(children(launcher));
        if (launcherItems.length) {
          group.items.push(...launcherItems);
          warn(
            'dialog-launcher-layout',
            'The dialog launcher is included as a regular group button.',
            group.id,
          );
        }
      }
      target.groups.push(group);
    }
    return target;
  }
  function ribbon(node) {
    if (node.getAttribute('startFromScratch') === 'true')
      warn(
        'host-chrome',
        'startFromScratch concerns Office host chrome and has no additional effect in a standalone ribbon.',
      );
    for (const child of children(node)) {
      switch (nameOf(child)) {
        case 'tabs':
          model.tabs.push(
            ...children(child)
              .filter((item) => nameOf(item) === 'tab')
              .map((item) => tab(item)),
          );
          break;
        case 'qat':
          for (const area of children(child)) {
            if (['sharedControls', 'documentControls'].includes(nameOf(area)))
              model.quickAccessToolbar.push(...controls(children(area)));
            else
              warn(
                'unsupported-element',
                `Unsupported Quick Access Toolbar element: ${nameOf(area)}.`,
              );
          }
          break;
        case 'contextualTabs':
          for (const set of children(child)) {
            const contextId =
              set.getAttribute('id') || set.getAttribute('idMso') || `context-${++nextId}`;
            if (set.hasAttribute('idMso'))
              warn(
                'built-in-context',
                `Context ${contextId} must be activated by the web host using setContext().`,
                contextId,
              );
            model.tabs.push(
              ...children(set)
                .filter((item) => nameOf(item) === 'tab')
                .map((item) => tab(item, contextId)),
            );
          }
          break;
        case 'officeMenu':
          model.backstage.push(...controls(children(child)));
          break;
        default:
          warn('unsupported-element', `Unsupported ribbon element: ${nameOf(child)}.`);
      }
    }
  }
  for (const child of children(root)) {
    switch (nameOf(child)) {
      case 'ribbon':
        ribbon(child);
        break;
      case 'backstage':
        model.backstage.push(...controls(children(child)));
        warn(
          'backstage-layout',
          'Simple Backstage commands are imported. Office Backstage form layouts and host document workflows are not reproduced.',
        );
        break;
      case 'commands':
        warn(
          'command-repurposing',
          'Repurposing built-in Office commands is not supported. Bind a web command explicitly.',
        );
        break;
      case 'contextMenus':
        warn(
          'context-menus',
          'Office host context-menu extensions are not imported into the ribbon.',
        );
        break;
      default:
        warn('unsupported-element', `Unsupported customUI element: ${nameOf(child)}.`);
    }
  }
  if (root.hasAttribute('loadImage'))
    warn(
      'load-image',
      'loadImage is replaced by the explicit options.resolveImage web image resolver.',
    );
  if (root.hasAttribute('onLoad') && options.ignoreOnLoad)
    warn(
      'onload',
      'onLoad is only invoked by createRibbonXAdapter(), where an invalidation API is available.',
    );
  function invalidate(id) {
    if (disposed) return false;
    if (id !== undefined && !bindings.has(id)) return false;
    updates.clear();
    const toRefresh = id === undefined ? Array.from(bindings.entries()) : [[id, bindings.get(id)]];
    for (const [key, refreshes] of toRefresh) {
      if (bindings.get(key) !== refreshes) continue;
      for (const refresh of refreshes) refresh();
    }
    return true;
  }
  return {
    model,
    warnings,
    index,
    invalidate,
    updates,
    onLoad: root.getAttribute('onLoad')
      ? callback(root, 'onLoad', Object.freeze({ id: 'customUI', Id: 'customUI', tag: '' }))
      : null,
    dispose() {
      disposed = true;
      bindings.clear();
      index.clear();
      updates.clear();
    },
  };
}

/** Parse RibbonX into a regular RibbonWeb model. Getter callbacks run synchronously. */
export function parseRibbonXml(xml, callbacks = {}, options = {}) {
  const compiled = compileRibbonXml(xml, callbacks, { ...options, ignoreOnLoad: true });
  // Warnings are explicit data, so callers do not need to scrape console output.
  compiled.model.ribbonX = { warnings: compiled.warnings };
  return compiled.model;
}

/** Import RibbonX with an Office-shaped invalidation API and optional live element attachment. */
export function createRibbonXAdapter(xml, callbacks = {}, options = {}) {
  const compiled = compileRibbonXml(xml, callbacks, options);
  let ribbon = null;
  let disposed = false;
  function syncAttached() {
    if (!ribbon) return;
    const liveModel = ribbon.model;
    for (const [id, changes] of compiled.updates) {
      let live = ribbon.getControl?.(id);
      if (!live) {
        for (const tab of Array.from(liveModel?.tabs || [])) {
          if (tab.id === id) {
            live = tab;
            break;
          }
          live = Array.from(tab.groups || []).find((group) => group.id === id);
          if (live) break;
        }
      }
      if (live) Object.assign(live, changes);
    }
    if (ribbon.invalidate) ribbon.invalidate();
    else if (ribbon.requestRender) ribbon.requestRender();
    else ribbon.model = api.model;
  }
  const api = {
    model: compiled.model,
    warnings: compiled.warnings,
    Invalidate() {
      if (disposed) return false;
      compiled.invalidate();
      syncAttached();
      return true;
    },
    InvalidateControl(id) {
      if (disposed || !compiled.invalidate(id)) return false;
      syncAttached();
      return true;
    },
    ActivateTab(id) {
      if (disposed || !api.model.tabs.some((tab) => tab.id === id)) return false;
      if (ribbon?.selectTab) return ribbon.selectTab(id) !== false;
      api.model.selectedTab = id;
      return true;
    },
    attach(element) {
      if (disposed) throw new Error('This RibbonX adapter has been disposed.');
      if (!element || typeof element !== 'object')
        throw new TypeError('attach() requires a ribbon element.');
      ribbon = element;
      ribbon.model = api.model;
      return api;
    },
    dispose() {
      disposed = true;
      ribbon = null;
      compiled.dispose();
    },
  };
  if (compiled.onLoad) compiled.onLoad(api);
  return api;
}

 (function (root, factory) {
   if (typeof define === "function" && define.amd) {
     define([], function () { return factory(root); });
   } else if (typeof module === "object" && module.exports) {
     module.exports = factory(root);
   } else {
     factory(root);
   }
 }((function () {
   if (typeof globalThis !== "undefined") return globalThis;
   if (typeof self !== "undefined") return self;
   if (typeof window !== "undefined") return window;
   if (typeof global !== "undefined") return global;
   return {};
 }()), function (root) {
   'use strict';

   const namespace = root.DxfRendering = root.DxfRendering || {};

   class RenderingPropertyGrid {
     constructor(container, options = {}) {
       this.container = container;
       this.options = Object.assign({
         emptyMessage: 'No properties available.'
       }, options);
       this.sections = [];
       if (this.container) {
         this.container.classList.add('rendering-property-grid');
       }
     }

     setSections(sections) {
       if (!Array.isArray(sections)) {
         this.sections = [];
       } else {
         this.sections = sections.map((section) => {
           return {
             title: typeof section.title === 'string' ? section.title : '',
             subtitle: typeof section.subtitle === 'string' ? section.subtitle : '',
             properties: Array.isArray(section.properties) ? section.properties.slice() : []
           };
         });
       }
       this.render();
     }

     clear() {
       this.setSections([]);
     }

     render() {
       if (!this.container) {
         return;
       }
       this.container.innerHTML = '';
       if (!this.sections.length) {
         const emptyState = document.createElement('div');
         emptyState.className = 'property-grid-empty';
         emptyState.textContent = this.options.emptyMessage;
         this.container.appendChild(emptyState);
         return;
       }

       this.sections.forEach((section) => {
         const card = document.createElement('section');
         card.className = 'property-grid-section';

         if (section.title) {
           const heading = document.createElement('h4');
           heading.className = 'property-grid-title';
           heading.textContent = section.title;
           card.appendChild(heading);
         }
         if (section.subtitle) {
           const subtitle = document.createElement('div');
           subtitle.className = 'property-grid-subtitle';
           subtitle.textContent = section.subtitle;
           card.appendChild(subtitle);
         }

         const table = document.createElement('table');
         table.className = 'property-grid-table';
         const tbody = document.createElement('tbody');

         if (!section.properties.length) {
           const row = document.createElement('tr');
           const keyCell = document.createElement('th');
           keyCell.textContent = 'Details';
           const valueCell = document.createElement('td');
           valueCell.textContent = 'No properties provided.';
           row.appendChild(keyCell);
           row.appendChild(valueCell);
           tbody.appendChild(row);
         } else {
           section.properties.forEach((prop) => {
             const row = document.createElement('tr');
             row.className = 'property-grid-row';
             const keyCell = document.createElement('th');
             keyCell.className = 'property-grid-key';
             keyCell.textContent = prop.name != null ? String(prop.name) : '';
             const valueCell = document.createElement('td');
             valueCell.className = 'property-grid-value';
             if (prop.value == null || prop.value === '') {
               valueCell.textContent = '';
             } else if (prop.isHtml) {
               valueCell.innerHTML = prop.value;
             } else {
               const valueText = String(prop.value);
               const pre = document.createElement('pre');
               pre.textContent = valueText;
               valueCell.appendChild(pre);
             }
             row.appendChild(keyCell);
             row.appendChild(valueCell);
             tbody.appendChild(row);
           });
         }

         table.appendChild(tbody);
         card.appendChild(table);
         this.container.appendChild(card);
       });
     }
   }

   namespace.RenderingPropertyGrid = RenderingPropertyGrid;

   return {
     RenderingPropertyGrid
   };
 }));

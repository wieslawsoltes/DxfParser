## **DXF Parser & Viewer – User Documentation**

Welcome to the **DXF Parser** application. This tool is designed to help CAD developers, drafters, and DXF power-users inspect and analyze DXF (Drawing Exchange Format) files in great detail. Whether you’re debugging complex AutoCAD files, investigating unusual entities, or simply learning the structure of DXF data, this viewer streamlines the process by providing a powerful tree-based inspection, filtering, searching, and batch processing interface.

Below is a comprehensive guide to using all the features in the application, as implemented in the provided code:

---

## **1. Overview of the Interface**

1. **Main Layout**  
   - **Top Header**: Global controls including sidebar toggle, streamed parsing toggle, right panel toggle, create new DXF, reset/save/load app state, and a Tree Diff indicator with navigation buttons.  
   - **Sidebar (Left)**: Buttons to open analysis overlays (Cloud, Statistics, Dependencies, etc.) and a Tree Diff toggle.  
   - **Two-Panel Compare Layout**: Left and right panels, each with their own tab strip, open button, expand/collapse all, and Filters button. A central splitter lets you resize the panels.  
   - **Pane Resizer**: A draggable vertical bar between the sidebar and the main content lets you resize the sidebar width.

2. **Tabs**  
   - Each panel (Left and Right) supports multiple tabs. Opening files or sub-entities creates new tabs within that panel.  
   - Each tab retains independent search, filter, sort, and expansion state.

3. **Tree View**  
   - Displays the parsed structure of the DXF file in a hierarchical manner.  
   - Columns: Line, Code, Data, Object Count, Data Size. Column widths are resizable via header drag handles.  
   - Properties are shown as nested rows underneath each parent entity when expanded.

4. **Overlays**  
   - The application features numerous overlays (pop-up panels) for advanced analysis:  
     - **Cloud Data**  
     - **Statistics**  
     - **Dependencies**  
     - **Binary Objects**  
     - **Handle Map**  
     - **Proxy Objects**  
     - **Fonts Used**  
     - **Classes**  
     - **Object Sizes**  
     - **Blocks & Inserts**  
     - **Line Types**  
     - **Texts**  
     - **Diagnostics**  
     - **Batch Process**  
   - Overlays can be closed via a “Close” button or by clicking a “Back to Tree” button.

---

## **2. Loading and Parsing DXF Files**

### 2.1. Single/Multiple File Selection
1. Click **Choose File(s)** in the top row of the main content area (the “Parse File(s)” section).  
2. Select one or more `.dxf` files from your file system.  
3. Check “Use Streamed Parsing” if you want to parse very large DXF files using streaming (available in modern browsers).  
4. Click **Parse File(s)** to load and parse the selected file(s).

**Use Case Example**:
- You have multiple small DXF drawings of simple parts that you want to quickly compare. Select all of them at once and click **Parse File(s)**. Each file will open as a new tab.

**How it Helps**:
- Quickly gather and display the structure of multiple DXF files without opening them in a heavy CAD platform.

### 2.2. Drag-and-Drop
- You can also drag `.dxf` files from your file explorer and drop them onto the application window. The parser automatically detects and loads them into new tabs.

**Use Case Example**:
- When you have a single DXF file on your desktop, simply drag it over the browser window to open it—no need to navigate the file picker.

**How it Helps**:
- Enhances user experience by reducing clicks and providing a quick way to open files.

### 2.3. Create a New DXF and Basic Editing
- Click **Create New DXF** in the top header to start with an empty document.  
- Use the row controls above the tree to **Add Row** or **Remove Row** in the current tab.  
- Double-click a property’s Code or Data cell to edit it inline. Press Enter to commit, or Escape to cancel.

### 2.4. Exporting Your Work
- Click **Download DXF** to export the current tab’s tree back to DXF text.  
- Click **Download Tree as Excel** to export a tabular snapshot of the visible tree.

---

## **3. Navigating the Tree View**

### 3.1. Tree Columns
- **Line**: The line number in the DXF file from which this entity or property originated.  
- **Code**: The group code for a given row. (For top-level entities, `0` indicates the start of an entity.)  
- **Data**: The entity type (for entities) or the data string (for properties). For example, `SECTION`, `LINE`, `LTYPE`, etc. For `CLASS` nodes, class name and ID are displayed. For `ACAD_PROXY_OBJECT`, a clickable Class ID link navigates to the corresponding `CLASS`.  
- **Object Count**: If an entity has child objects, the total number of descendant objects is shown.  
- **Data Size**: The total length of all text data within the entity (including properties and nested children).  
- Columns are resizable via the header drag handles.

### 3.2. Row Expansion
- **Arrow Icons (► / ▼)**: Click the small arrow in the “Line” column to expand or collapse child items. Entities like `SECTION`, `BLOCK`, or `TABLE` contain children and can be expanded further.

### 3.3. Selecting Rows
- **Row Highlight**: Click on a row to select it. This highlights the row in a light blue color, helping you keep track of which node you’re focusing on.

### 3.4. Handling Properties
- **Properties** appear as “child rows” of an entity. For example, an entity might list group codes 8 (layer), 10 (X coordinate), 20 (Y coordinate), etc.  
- When you expand an entity, its properties appear directly below in the tree.  
- Handles (codes `5, 105, 330, 350, 360`) appear as clickable links if you hover over them, so you can jump to related entities.

### 3.5. Editing Properties Inline
- Double-click a property’s **Code** or **Data** cell to edit it.  
- Press Enter to apply, or blur the field to commit. Press Escape to cancel.

### 3.6. Expand/Collapse All
- **Expand All**: Button in the left sidebar that recursively expands every entity in the current tab.  
- **Collapse All**: Collapses every entity in the current tab.

**Use Case Example**:
- If you want to see an entire file’s structure at once, use **Expand All**.  
- If you’re overwhelmed by the expanded structure, use **Collapse All** to reset it.

**How it Helps**:
- Quick toggling of the entire tree structure for easier navigation when handling large files.

---

## **4. Searching and Filtering**

### 4.1. Filters Overlay (per panel)
- Open the Filters dialog using the **Filters** button above each panel.  
- **Code Search**: Enter one or multiple group codes you want to filter on.  
- **Data Search**: Enter one or multiple text queries to filter the “Data” portion.  
- **Object Types**: Use the dropdown to restrict to specific entity types (e.g., only `LINE`, `CIRCLE`).  
- **Exact Data Match**: If checked, the data must match exactly (case-sensitive or insensitive, depending on your other setting).  
- **Case Sensitive**: If unchecked, searching is case-insensitive.  
- **Min/Max Line**: Numeric range filters that restrict visible rows by their original DXF line number.  

### 4.2. Tag-Based Searching
1. Type a code or data query into the respective “Search by Code” or “Search by Data” field.  
2. Press **Enter** or **,** (comma) to add it as a “tag.”  
3. Multiple tags can be added. Only nodes matching *all* your filters are shown in the tree.

### 4.3. Search/Clear
- **Search**: Manually triggers the filter logic using the contents of the input fields.  
- **Clear Search**: Resets all tags and line filters, restoring the full tree.

**Use Case Example**:
- You suspect a specific layer (code 8) with a certain name, e.g., “MyLayer,” is problematic. Add a code search for `8` and a data search for `MyLayer` to see only properties with `code=8` and `value=MyLayer`.

**How it Helps**:
- Zero in on the exact group codes or data strings you need to troubleshoot in large, complicated DXFs.

---

## **5. Sorting the Tree**

1. **Clickable Column Headers**: Click on a header cell (e.g., “Line,” “Code,” “Data,” “Object Count,” “Data Size”) to sort the visible tree.  
2. **Ascending/Descending**: Each click toggles the sort order. The small arrow indicator shows the current sort direction.

**Use Case Example**:
- Sorting by “Data Size” can help locate the largest objects (perhaps containing embedded images or large MTEXT blocks).  
- Sorting by “Line” reverts to a near-original ordering.

**How it Helps**:
- Quickly surfaces unusual or large objects by sorting them to the top of the tree.

---

## **6. Navigation Controls**

### 6.1. Go to Handle
- **Handle Search Input**: In the top-right, enter the handle you want to jump to.  
- **Go Button**: If the handle is found, that portion of the tree is expanded, and you’re scrolled to it.

### 6.2. Navigation History
- **Back/Forward**: Moves through previously visited handles.  
- **Clear**: Clears the entire visited handle list.  
- **Clickable History**: Each visited handle is displayed in the history list. Clicking it navigates back to that handle.

**Use Case Example**:
- You open a complicated DXF with many references. Jumping among multiple handles, you can then backtrack to a previously viewed handle for cross-referencing.

**How it Helps**:
- Avoids losing your place in complex cross-references. Acts like a “browser history” for DXF entities.

### 6.3. Panel and Layout Controls
- **Toggle Right Panel**: Quickly collapse/expand the right compare panel from the top header.  
- **Toggle Sidebar**: Show/hide the sidebar; on mobile it behaves as a drawer.

---

## **7. Action Buttons per Entity**

When you hover over a row, you may see these small buttons if it’s an entity row (i.e., not just a property):

- **Copy**: Copies the raw DXF text for that node (including its properties) to the clipboard. This is valid DXF code that can be pasted elsewhere.  
- **Open**: Opens this entity (and only this entity) in a new tab, so you can isolate and inspect it deeply.  
- **Hex Viewer**: Only appears if the entity has binary data (code `310`). Loads that binary data into a specialized Hex Viewer overlay.

**Use Case Example**:
- If you want to share just a specific block definition with a coworker, click **Copy** to get only that data.  
- If you suspect a certain entity is broken, open it in a new, uncluttered tab.

**How it Helps**:
- Precise control for debugging or partial file reconstruction.

---

## **8. Special Overlays**

Below is a summary of each advanced overlay (accessible via sidebar buttons). All overlays can be exited by clicking **Close** or **Back to Tree**.

### 8.1. Cloud Data
- **Object Cloud**: Shows each object type in a word cloud, sized according to frequency.  
- **Code Cloud**: Shows group code frequencies.  
- **Clicking a Tag**: Attempts to jump in the tree to a matching handle or code usage.  

**Use Case Example**:
- Identify the most common entity type in a big file (e.g., 5000 “LINE” entities) or see which group code appears most frequently.

**How it Helps**:
- Provides a quick, visual distribution of your DXF content.

### 8.2. Statistics
- **Totals**: Summaries like total objects, total properties, maximum nesting depth, and total data size.  
- **Object Type Counts**: A breakdown of how many times each entity appears.  
- **Links**: Clicking an entity type tries to navigate to an example of that type in the tree.

**Use Case Example**:
- Checking whether your file is extremely large because it has thousands of blocks or proxies.

**How it Helps**:
- Offers an at-a-glance summary of file complexity.

### 8.3. Dependencies
- **Dependency Types**: Detects references like `LTYPE`, `STYLE`, `APPID`, `LAYER`, `DIMSTYLE`, etc.  
- **Lists**: Each found item is displayed with lines and handles.  
- **Click**: Jump to an entity in the tree if it has a handle.

**Use Case Example**:
- If your file uses a custom line type or shape file, see how many references exist and where.

**How it Helps**:
- Clarifies external references needed by the DXF.

### 8.4. Binary Objects
- **Binary Data (code 310)**: Lists all entities that contain binary data.  
- **Hex Viewer**: Quickly open each binary object in a Hex Viewer.  
- **Show in Tree**: Jumps back to the entity in question.

**Use Case Example**:
- If an embedded image is malfunctioning, you can confirm the correct file signature in the binary data.

**How it Helps**:
- Simplifies extraction and inspection of embedded data, such as images or ZIP-based custom objects.

### 8.5. Handle Map
- **Owner-Child Relationships**: DXF uses handle references for ownership (code `330`). This overlay organizes objects in a hierarchy based on ownership handles.  
- **Click**: Jump to any handle in the tree.

**Use Case Example**:
- If certain objects incorrectly claim the same owner, you can see those relationships at a glance.

**How it Helps**:
- Debugs parent-child or owner-owned relationships (common in advanced objects or custom AutoCAD objects).

### 8.6. Proxy Objects
- **ACAD_PROXY_OBJECT**: Lists all proxy objects (AutoCAD custom objects or third-party objects not recognized natively).  
- **Copy DXF**: Save out the raw tags for further debugging.  
- **Analyze**: Shows property details, potential embedded binary, and references (code `330`).

**Use Case Example**:
- Inspecting data from third-party plugins or older AutoCAD versions that store custom geometry as proxies.

**How it Helps**:
- Surfaces otherwise hidden or unsupported objects for troubleshooting.

### 8.7. Fonts Used
- **STYLE Entities**: Collects font filenames from `STYLE` objects (group code 3).  
- **Text & Mtext**: Also collects text style usage from `TEXT` or `MTEXT` (group code 7).  
- **Click**: Jump to the referencing entity in the tree.

**Use Case Example**:
- Determining which fonts are required to properly render text from a DXF file.

**How it Helps**:
- Avoid missing fonts or incorrectly substituted typefaces.

### 8.8. Classes
- **CLASS Entities**: Collates class definitions (often used internally by AutoCAD).  
- **Application Name**: Show an “app name cloud” if multiple classes are associated with the same app name.  
- **Click**: Jump to the class node in the tree.

**Use Case Example**:
- Understanding or debugging custom classes in specialized AutoCAD vertical solutions.

**How it Helps**:
- Helps see which custom classes or third-party wrappers are present.

### 8.9. Object Sizes
- **Largest Objects First**: Ranks all entities by their “Data Size.”  
- **Show in Tree**: Jump to any large object.  
- **Helps**: Quickly find the biggest embedded images or giant text blocks.

**Use Case Example**:
- If your DXF is unexpectedly large, use Object Sizes to see which object is bloating the file.

### 8.10. Blocks & Inserts
- **BLOCK Definitions**: Gathers all `BLOCK` entities by name.  
- **INSERT** Usage**: Shows each `INSERT` that references a block, including nested inserts.  
- **Click**: Jump to the block or insert in the tree.

**Use Case Example**:
- Determining how many times a certain block is inserted, or verifying references to a missing or incorrectly named block.

**How it Helps**:
- Diagnoses block referencing errors or duplication.

### 8.11. Line Types
- **LTYPE** Definitions**: Lists all linetype definitions found.  
- **Used Linetypes**: Also detects any references in property code `6`.  
- **Show in Tree**: Jump to either the definition or usage.

**Use Case Example**:
- Identifying whether a certain custom linetype is actually used or if it’s simply leftover in the DXF.

**How it Helps**:
- Clears confusion about “missing” or “unused” linetypes.

### 8.12. Texts
- **TEXT & MTEXT**: Collects all text-based entities.  
- **Show in Tree**: Navigate to each.  
- **Deciphering**: For `MTEXT`, the viewer can parse embedded DXF formatting codes (like `\P`, `\~`, `\L`, etc.) and display an interpretation.

**Use Case Example**:
- Searching for incorrectly formatted multi-line text or verifying special text height commands in `MTEXT`.

**How it Helps**:
- Makes it easy to see all textual data and decode special formatting commands.

### 8.13. Diagnostics
- Run comprehensive rule-based analysis across categories: Structural, Data Integrity, Rendering, Text, Performance, DXF Compliance, Best Practices, Security.  
- Use severity filters (Critical, Error, Warning, Info, Suggestion) and category tabs to focus results.  
- Search issues with the inline search box; keyboard shortcuts: Ctrl+F to focus search, 1–5 to toggle severities, Ctrl+E to export.  
- Configure which rules run via the Rule Configuration dialog; save/load rule profiles, and export/import profiles to file.  
- Export diagnostics to a report file.

---

## **9. Batch Processing**

### 9.1. Purpose
- Process multiple `.dxf` files in a folder hierarchy automatically. Searches for a given object type, group code, or data string and gathers matches into a single Excel report.

### 9.2. How to Use
1. **Select Root Directory**: Click the folder icon (or “Choose Directory”) that allows picking a folder of `.dxf` files (via `webkitdirectory`).  
2. **Object Type**: (Optional) e.g., “LINE,” “CIRCLE,” etc. Only matching entity types are included.  
3. **Search Code**: (Optional) e.g., `8` to search layer codes, `1` for text content, etc.  
4. **Search Data**: (Optional) Text to match.  
5. **Search Mode**: **Contains** or **Exact** to control partial or exact matching.  
6. **Start Batch Process**: Parses each DXF in turn, searching for matches.  
7. **View Results**: The results appear in a “batch results” tab. Each row shows file name, line number, and data matched.  
8. **Download as Excel**: One-click generation of an XLSX file containing all result tabs.

### 9.3. Advanced Queries
- **Predefined Query Templates**: Start from common patterns (e.g., nodes with code 310, all LINEs, regex matches).  
- **JavaScript Query**: Provide a predicate like `node => node.type === 'LINE'` to fully customize selection.  
- Click a result entry to open that file and jump directly to the matching line.

**Use Case Example**:
- You have 100 DXF files in a directory, each possibly containing certain `MTEXT` codes or special layers. Enter `MTEXT` as the object type and `8` as the search code with data `MySpecialLayer` to find references across all files.

**How it Helps**:
- Saves enormous time by automating repetitive searches across many files, generating a consolidated report.

---

## **10. Hex Viewer and Embedded Binary Handling**

### 10.1. Hex Viewer
- **Access**: Click “Hex Viewer” on any entity row that has binary data (group code `310`), or within the **Binary Objects** overlay.  
- **Scrolling**: A virtualized list of hex lines makes it efficient even for large binary data.  
- **Detected File Type**: The viewer checks for known file signatures (PNG, GIF, JPEG, ZIP, PDF, etc.).

### 10.2. Binary Export
- **Save Binary**: Exports the binary data as a `.bin` file, or if recognized, with the correct file extension (e.g., `.png`, `.pdf`).  
- **Preview Image**: If recognized as an image, displays a preview.  
- **ZIP Browsing**: If recognized as a ZIP, lists the contents, letting you preview or download individual files from the archive.

**Use Case Example**:
- Inspect embedded images or custom object data to confirm that the internal signature is correct or to fix corrupted data.

**How it Helps**:
- Eliminates guesswork around embedded data, letting you confirm file signatures or extract them entirely for separate analysis.

---

## **11. Tree Diff and Two-Panel Compare**

- Click **Tree Diff** in the sidebar to enable side-by-side alignment between the Left and Right tabs.  
- A diff indicator appears in the top header with navigation buttons for next Addition, Removal, and Change blocks.  
- Rows are aligned using semantic keys (handles, names, and structure) and highlighted: additions, removals, and changes are visually distinguished.  
- Per-cell highlights show differences in Line, Code, Data text, Object Count, and Data Size.

---

## **12. State Management**

- **Auto-Persist**: App and tab state persist in the browser for up to 7 days.  
- **Save State to File**: Export the entire app snapshot (both panels and tabs) to a JSON file.  
- **Load State from File**: Restore a previously saved snapshot.  
- **Reset State**: Clear all saved state and UI preferences.

---

## **13. Additional Tips and Tricks**

1. **Multiple Tabs**: You can open multiple DXF files concurrently. Each tab preserves its own expand/collapse state and filters.  
2. **Copy Node to Clipboard**: If you only want the raw DXF code for an object or a block definition, use the **Copy** button in the tree.  
3. **Drag & Drop**: The simplest way to open a file is by dragging it into the browser window.  
4. **Sorting**: Sorting by “Line” is closest to the original file order. However, note that the actual DXF might have sections out of typical order.  
5. **Case Sensitivity**: By default, data searches are case-insensitive unless you explicitly enable “Case Sensitive.”  
6. **Navigation**: Use the handle-based navigation to jump among cross-referenced entities quickly (layer definitions, block references, etc.).
7. **Resizing Columns**: Drag header dividers to resize columns; widths persist per session.  
8. **Right Panel Toggle**: Hide the right panel when focusing on a single file; re-enable for compare and diff.

---

## **14. Example Workflows**

1. **Finding a Missing Block**  
   - **Load**: Open your file (with “Parse File(s)”).  
   - **Search**: In the **Filters** panel, type `BLOCK` in **Data** to show only blocks.  
   - **Compare**: Expand to see if the block name is present. If not, it may be a missing external reference.  
   - **Switch**: Sort by “Object Count” to see which block is most used.

2. **Inspecting a Corrupted Image**  
   - **Open File** and expand.  
   - In **Binary Objects** overlay, find the entity containing an embedded image (`310` code).  
   - **Hex Viewer**: Confirm the file signature is `PNG`, `GIF`, or `JPEG`. Check if it’s truncated.

3. **Analyzing a Large Text**  
   - **Sort** by “Data Size.” The biggest entity might be a large MTEXT.  
   - Expand the entity, copy the text, or decipher special formatting codes in “Texts” overlay.

4. **Batch Searching Hundred Files**  
   - Use the **Batch Process** overlay, select the root folder, and specify an object type.  
   - Generate an XLSX report of lines where that object (or code/data) is found.  
   - Click entries in the batch results to open and jump to that exact line in a newly opened tab.

---

## **15. Troubleshooting & FAQ**

1. **Why do some “handles” not jump anywhere?**  
   - The handle might not exist or is referencing something outside the scope of the file. Make sure the reference is valid or check if it’s from an external XREF.

2. **Why is the file recognized as “Unknown file type” in the Hex Viewer?**  
   - The application checks only popular signatures (PNG, PDF, ZIP, etc.). Custom or proprietary data won’t be recognized.

3. **Why does the application show “No data loaded” in some overlays?**  
   - You must parse a DXF file first or switch to a tab that actually has loaded data.

4. **Is the tree view the real file order?**  
   - By default, lines are sorted in ascending order. If you sort by another column, the order changes. Switch back or re-click “Line” to restore near-original order.

5. **Can I directly edit or save the entire DXF file here?**  
   - The application is primarily a viewer. You can copy partial data or entire sections, but it does not fully rewrite the entire file.  

---

## **16. Conclusion**

The **DXF Parser** application brings a powerful suite of tools for dissecting, visualizing, and troubleshooting DXF files of all sizes. From single-file debugging to multi-file batch search across directories, it offers detailed insights into everything from high-level structure to raw binary payloads.

**Key Benefits**:
- **Clarity**: Tree-based approach for easily seeing hierarchical structures (sections, blocks, tables, etc.).  
- **Efficiency**: Advanced filtering, sorting, and direct handle navigation significantly reduce the time needed to locate data.  
- **Deep Analysis**: Overlays for fonts, dependencies, stats, object sizes, and more reveal hidden or complicated aspects of the DXF.  
- **Convenient Exports**: Copy partial entities, export embedded data, or compile Excel reports in batch mode.

We hope you find this viewer indispensable in your DXF workflows—whether you are a CAD developer investigating custom objects, a drafter verifying references, or a curious user exploring the internals of DWG-like data. Enjoy exploring your DXF files with more insight than ever before!

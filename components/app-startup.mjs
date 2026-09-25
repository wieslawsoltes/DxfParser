import './docking-parser.js';
import './docking-documents.js';
import './inspection-services.mjs';
import './tree-view.mjs';
import './analysis-services.mjs';
import './office-preview.js';
import './tabular-reports.js';
import './analysis-reports.js';
import './drawing-views.js';
import './ribbon-workspace.mjs';

document.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
  window.DxfWorkspaceStartup?.complete(window.app.dockingWorkspace);

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

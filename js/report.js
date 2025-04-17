import { firebaseCRUD } from "./firebase-crud.js";

document.addEventListener("DOMContentLoaded", function () {
  let db;
  const request = indexedDB.open("SOJTMSDB", 1);
  let currentReportId = null;
  let pendingImageChanges = {
    toAdd: [],
    toDelete: [],
  };
  request.onupgradeneeded = function (event) {
    db = event.target.result;

    // Delete the old object store if it exists
    if (db.objectStoreNames.contains("reportTbl")) {
      db.deleteObjectStore("reportTbl");
    }

    const store = db.createObjectStore("reportTbl", {
      keyPath: "id",
      autoIncrement: true,
    });

    store.createIndex("createdAt", "createdAt", { unique: false });
    store.createIndex("reportId", "reportId", { unique: true });
    store.createIndex("userId", "userId", { unique: false });
  };

  request.onsuccess = function (event) {
    db = event.target.result;
    displayReports();
    setupAddModal();
    setupViewModal();
    setupDateSearch();
    setupUploadButton();
  };

  request.onerror = function (event) {
    console.error("IndexedDB error:", event.target.error);
  };

  function setupUploadButton() {
    const uploadButton = document.getElementById("upload-reports-btn");
    if (!uploadButton) return;

    uploadButton.addEventListener("click", async function () {
      const userId = localStorage.getItem("userId");
      if (!userId) {
        alert("User not authenticated. Please login again.");
        return;
      }

      if (
        !confirm("Are you sure you want to upload all reports to the server?")
      ) {
        return;
      }

      try {
        // Get all reports from IndexedDB
        const transaction = db.transaction(["reportTbl"], "readonly");
        const store = transaction.objectStore("reportTbl");
        const index = store.index("userId");
        const request = index.getAll(userId);

        request.onsuccess = async function (event) {
          const reports = event.target.result;
          if (reports.length === 0) {
            alert("No reports to upload");
            return;
          }

          // Process each report
          for (const report of reports) {
            try {
              // Convert images to base64 strings for Firebase
              const imagesBase64 = [];
              if (report.images && report.images.length > 0) {
                for (const imageBlob of report.images) {
                  const base64String = await blobToBase64(imageBlob);
                  imagesBase64.push(base64String);
                }
              }

              // Prepare data for Firebase
              const firebaseReport = {
                title: report.title,
                content: report.content,
                createdAt: report.createdAt,
                userId: report.userId,
                images: imagesBase64,
                localId: report.id, // Store the local ID for reference
              };

              // Upload to Firebase using firebaseCRUD
              await firebaseCRUD.createData("reports", firebaseReport);

              // Delete from IndexedDB after successful upload
              const deleteTransaction = db.transaction(
                ["reportTbl"],
                "readwrite"
              );
              const deleteStore = deleteTransaction.objectStore("reportTbl");
              deleteStore.delete(report.id);
            } catch (error) {
              console.error(`Error uploading report ${report.id}:`, error);
              // Continue with next report even if one fails
            }
          }

          alert("Reports uploaded successfully!");
          displayReports(); // Refresh the UI
        };

        request.onerror = function (event) {
          console.error(
            "Error fetching reports from IndexedDB:",
            event.target.error
          );
          alert("Error fetching reports from local storage");
        };
      } catch (error) {
        console.error("Upload error:", error);
        alert("Error uploading reports: " + error.message);
      }
    });
  }

  // Helper function to convert Blob to Base64
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ========================
  function setupUploadButton() {
    const uploadButton = document.getElementById("upload-report-button");
    if (!uploadButton) return;

    uploadButton.addEventListener("click", async function () {
      const userId = localStorage.getItem("userId");
      if (!userId) {
        alert("User not authenticated. Please login again.");
        return;
      }

      if (
        !confirm("Are you sure you want to upload all reports to the server?")
      ) {
        return;
      }

      try {
        // Get all reports from IndexedDB
        const transaction = db.transaction(["reportTbl"], "readonly");
        const store = transaction.objectStore("reportTbl");
        const index = store.index("userId");
        const request = index.getAll(userId);

        request.onsuccess = async function (event) {
          const reports = event.target.result;
          if (reports.length === 0) {
            alert("No reports to upload");
            return;
          }

          // Process each report
          for (const report of reports) {
            try {
              console.log(`Processing report ${report.id}`);

              // Create composite document ID
              const reportId = `${userId}_${report.id}`;

              // Create report data
              const firebaseReport = {
                title: report.title,
                content: report.content,
                createdAt: report.createdAt,
                userId: userId,
                localId: report.id,
                hasImages: report.images && report.images.length > 0,
              };

              // Create/update the report document with our composite ID
              await firebaseCRUD.setDataWithId(
                "reports",
                reportId,
                firebaseReport
              );
              console.log(`Created report document with ID: ${reportId}`);

              // If there are images, upload them to the subcollection
              if (report.images && report.images.length > 0) {
                console.log(
                  `Uploading ${report.images.length} images for report ${reportId}`
                );

                // First delete any existing images in the subcollection (optional)
                // await deleteSubcollection(`reports/${reportId}/images`);

                for (const [index, imageBlob] of report.images.entries()) {
                  try {
                    const base64String = await blobToBase64(imageBlob);
                    console.log(
                      `Uploading image ${index + 1} of ${report.images.length}`
                    );

                    // Create image document with auto-generated ID in the subcollection
                    await firebaseCRUD.createData(
                      `reports/${reportId}/images`,
                      {
                        imageData: base64String,
                        uploadedAt: new Date().toISOString(),
                        order: index,
                        originalName: `image_${index + 1}.jpg`,
                        reportId: reportId, // Reference back to parent report
                      }
                    );

                    console.log(`Successfully uploaded image ${index + 1}`);
                  } catch (imageError) {
                    console.error(
                      `Error uploading image ${index + 1}:`,
                      imageError
                    );
                  }
                }
              }

              // Delete from IndexedDB after successful upload
              const deleteTransaction = db.transaction(
                ["reportTbl"],
                "readwrite"
              );
              const deleteStore = deleteTransaction.objectStore("reportTbl");
              deleteStore.delete(report.id);
              console.log(`Deleted local report ${report.id}`);
            } catch (reportError) {
              console.error(
                `Error processing report ${report.id}:`,
                reportError
              );
            }
          }

          alert("Reports uploaded successfully!");
          displayReports();
        };

        request.onerror = function (event) {
          console.error(
            "Error fetching reports from IndexedDB:",
            event.target.error
          );
          alert("Error fetching reports from local storage");
        };
      } catch (error) {
        console.error("Upload error:", error);
        alert("Error uploading reports: " + error.message);
      }
    });
  }

  // Helper function to delete a subcollection (optional)
  // async function deleteSubcollection(path) {
  //   const querySnapshot = await firebase.firestore().collection(path).get();
  //   const batch = firebase.firestore().batch();
  //   querySnapshot.forEach((doc) => {
  //     batch.delete(doc.ref);
  //   });
  //   await batch.commit();
  // }

  // Helper function to convert blob to base64
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]); // remove data URL prefix
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Helper function to convert Blob to Base64
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ========================
  // ADD REPORT MODAL FUNCTIONS
  // ========================
  function setupAddModal() {
    const addImageInput = document.getElementById("add-image-input");
    const addImageContainer = document.getElementById("add-image-container");
    const addReportForm = document.getElementById("add-report-form");
    let addModalImages = [];

    if (addImageInput && addImageContainer) {
      addImageInput.addEventListener("change", function (event) {
        const files = event.target.files;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file.type.match("image.*")) {
            alert(`File ${file.name} is not an image`);
            continue;
          }
          if (file.size > 5000000) {
            alert(`File ${file.name} is too large`);
            continue;
          }

          const reader = new FileReader();
          reader.onload = function (e) {
            const img = document.createElement("img");
            img.src = e.target.result;
            img.className = "img-thumbnail me-2 mb-2";
            img.style.maxWidth = "80px";
            img.style.maxHeight = "80px";
            img.dataset.imageIndex = addModalImages.length;
            addImageContainer.appendChild(img);

            addModalImages.push(file);
          };
          reader.readAsDataURL(file);
        }
      });
    }

    if (addReportForm) {
      addReportForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const title = document.getElementById("add-report-title").value.trim();
        const content = document
          .getElementById("add-report-content")
          .value.trim();
        const userId = localStorage.getItem("userId");

        if (!userId) {
          alert("User not authenticated. Please login again.");
          return;
        }

        if (!title || !content) {
          alert("Please fill in all required fields");
          return;
        }

        const transaction = db.transaction(["reportTbl"], "readwrite");
        const store = transaction.objectStore("reportTbl");

        // Generate a unique reportId
        const reportId = Date.now().toString();

        const reportData = {
          title,
          content,
          createdAt: new Date().toISOString(),
          reportId: reportId,
          userId: userId,
          images: addModalImages,
        };

        const request = store.add(reportData);

        request.onsuccess = function () {
          const modal = bootstrap.Modal.getInstance(
            document.getElementById("addReportModal")
          );
          if (modal) modal.hide();
          alert("Report saved successfully!");

          addReportForm.reset();
          addImageContainer.innerHTML = "";
          addModalImages = [];

          displayReports();
        };

        request.onerror = function (event) {
          console.error("Error storing report:", event.target.error);
          alert("Error saving report to local database.");
        };
      });
    }

    addImageContainer.addEventListener("click", function (e) {
      if (e.target.tagName === "IMG") {
        e.preventDefault();
        const imgSrc = e.target.src;
        const imgIndex = e.target.dataset.imageIndex;

        const viewImageModal = new bootstrap.Modal(
          document.getElementById("viewImageModal")
        );
        document.getElementById("modal-image-view").src = imgSrc;

        document.getElementById("viewImageModal").dataset.imageIndex = imgIndex;
        document.getElementById("viewImageModal").dataset.source = "add";
        viewImageModal.show();
      }
    });
  }

  // ========================
  // VIEW/UPDATE REPORT MODAL FUNCTIONS
  // ========================
  function setupViewModal() {
    const viewImageContainer = document.getElementById("view-image-container");
    const updateReportForm = document.getElementById("update-report-form");
    const viewImageInput = document.getElementById("view-image-input");
    const viewReportModal = document.getElementById("viewReportModal");

    // Reset pending changes when modal is shown
    viewReportModal.addEventListener("show.bs.modal", function () {
      pendingImageChanges = { toAdd: [], toDelete: [] };
    });

    // Reset pending changes when modal is hidden without saving
    viewReportModal.addEventListener("hide.bs.modal", function () {
      pendingImageChanges = { toAdd: [], toDelete: [] };
    });

    if (viewImageInput) {
      viewImageInput.addEventListener("change", function (event) {
        if (!currentReportId) return;

        const files = event.target.files;

        // Add new files to pending changes
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file.type.match("image.*")) {
            alert(`File ${file.name} is not an image`);
            continue;
          }
          if (file.size > 5000000) {
            alert(`File ${file.name} is too large`);
            continue;
          }
          pendingImageChanges.toAdd.push(file);
        }

        // Show preview of pending additions
        refreshViewModalImages(currentReportId, true);
      });
    }

    viewImageContainer.addEventListener("click", function (e) {
      if (e.target.tagName === "IMG") {
        e.preventDefault();
        const imgIndex = parseInt(e.target.dataset.imageIndex);
        const isPendingAddition = e.target.dataset.pending === "true";

        const viewImageModal = new bootstrap.Modal(
          document.getElementById("viewImageModal")
        );
        document.getElementById("modal-image-view").src = e.target.src;

        document.getElementById("viewImageModal").dataset.imageIndex = imgIndex;
        document.getElementById("viewImageModal").dataset.isPending =
          isPendingAddition;
        document.getElementById("viewImageModal").dataset.reportId =
          currentReportId;
        viewImageModal.show();
      }
    });

    if (updateReportForm) {
      updateReportForm.addEventListener("submit", function (e) {
        e.preventDefault();

        if (!currentReportId) return;

        const title = document.getElementById("view-report-title").value.trim();
        const content = document.getElementById("report-content").value.trim();
        const userId = localStorage.getItem("userId");

        if (!userId) {
          alert("User not authenticated. Please login again.");
          return;
        }

        if (!title || !content) {
          alert("Please fill in all required fields");
          return;
        }

        const transaction = db.transaction(["reportTbl"], "readwrite");
        const store = transaction.objectStore("reportTbl");
        const getRequest = store.get(parseInt(currentReportId));

        getRequest.onsuccess = function () {
          const report = getRequest.result;

          // Verify the report belongs to the current user
          if (report.userId !== userId) {
            alert("You are not authorized to edit this report");
            return;
          }

          report.title = title;
          report.content = content;

          // Process image changes only when update is clicked
          if (!report.images) report.images = [];

          // Remove deleted images
          pendingImageChanges.toDelete.sort((a, b) => b - a); // Sort descending to avoid index issues
          pendingImageChanges.toDelete.forEach((index) => {
            report.images.splice(index, 1);
          });

          // Add new images
          pendingImageChanges.toAdd.forEach((file) => {
            report.images.push(file);
          });

          const putRequest = store.put(report);
          putRequest.onsuccess = function () {
            alert("Report updated successfully!");
            displayReports();

            // Reset pending changes
            pendingImageChanges = { toAdd: [], toDelete: [] };

            // Close the modal
            const modal = bootstrap.Modal.getInstance(
              document.getElementById("viewReportModal")
            );
            if (modal) modal.hide();
          };
        };
      });
    }

    document.addEventListener("click", function (e) {
      if (e.target.classList.contains("delete-btn")) {
        e.preventDefault();
        if (!currentReportId) return;

        const userId = localStorage.getItem("userId");
        if (!userId) {
          alert("User not authenticated. Please login again.");
          return;
        }

        const deleteModal = new bootstrap.Modal(
          document.getElementById("deleteConfirmationModal")
        );
        deleteModal.show();

        document.querySelector(
          '#deleteConfirmationModal [name="delete-yes"]'
        ).onclick = function () {
          const transaction = db.transaction(["reportTbl"], "readwrite");
          const store = transaction.objectStore("reportTbl");
          const getRequest = store.get(parseInt(currentReportId));

          getRequest.onsuccess = function () {
            const report = getRequest.result;
            if (report.userId !== userId) {
              alert("You are not authorized to delete this report");
              deleteModal.hide();
              return;
            }

            const deleteRequest = store.delete(parseInt(currentReportId));
            deleteRequest.onsuccess = function () {
              displayReports();
              deleteModal.hide();

              const viewModal = bootstrap.Modal.getInstance(
                document.getElementById("viewReportModal")
              );
              if (viewModal) viewModal.hide();
            };
          };
        };
      }
    });
  }

  // ========================
  // IMAGE VIEW MODAL FUNCTIONS
  // ========================
  document
    .getElementById("delete-image-btn")
    .addEventListener("click", function () {
      const imageIndex = parseInt(
        document.getElementById("viewImageModal").dataset.imageIndex
      );
      const isPending =
        document.getElementById("viewImageModal").dataset.isPending === "true";
      const reportId =
        document.getElementById("viewImageModal").dataset.reportId;

      if (isPending) {
        // Remove from pending additions
        pendingImageChanges.toAdd.splice(imageIndex, 1);
      } else {
        // Add to pending deletions
        pendingImageChanges.toDelete.push(imageIndex);
      }

      // Refresh the view
      refreshViewModalImages(reportId, true);

      // Close the modal
      bootstrap.Modal.getInstance(
        document.getElementById("viewImageModal")
      ).hide();
    });

  // Helper function to refresh view modal images
  function refreshViewModalImages(reportId, showPending = false) {
    const viewImageContainer = document.getElementById("view-image-container");
    viewImageContainer.innerHTML = "";

    const transaction = db.transaction(["reportTbl"], "readonly");
    const store = transaction.objectStore("reportTbl");
    const getRequest = store.get(parseInt(reportId));

    getRequest.onsuccess = function () {
      const report = getRequest.result;
      if (!report) return;

      // Display existing images (excluding pending deletions)
      if (report.images) {
        report.images.forEach((blob, index) => {
          if (!pendingImageChanges.toDelete.includes(index)) {
            const img = document.createElement("img");
            img.src = URL.createObjectURL(blob);
            img.className = "img-thumbnail me-2 mb-2";
            img.style.maxWidth = "80px";
            img.style.maxHeight = "80px";
            img.dataset.imageIndex = index;
            img.dataset.pending = "false";
            viewImageContainer.appendChild(img);
          }
        });
      }

      // Display pending additions
      if (showPending && pendingImageChanges.toAdd.length > 0) {
        pendingImageChanges.toAdd.forEach((file, index) => {
          const reader = new FileReader();
          reader.onload = function (e) {
            const img = document.createElement("img");
            img.src = e.target.result;
            img.className = "img-thumbnail me-2 mb-2";
            img.style.maxWidth = "80px";
            img.style.maxHeight = "80px";
            img.dataset.imageIndex = index;
            img.dataset.pending = "true";
            viewImageContainer.appendChild(img);
          };
          reader.readAsDataURL(file);
        });
      }
    };
  }

  // Close the image modal when clicking the X
  document
    .querySelector("#viewImageModal .bi-x-lg")
    .addEventListener("click", function () {
      bootstrap.Modal.getInstance(
        document.getElementById("viewImageModal")
      ).hide();
    });

  // ========================
  // HELPER FUNCTIONS
  // ========================
  function loadReportDetails(reportId) {
    const transaction = db.transaction(["reportTbl"], "readonly");
    const store = transaction.objectStore("reportTbl");
    const request = store.get(reportId);

    request.onsuccess = function (event) {
      const report = event.target.result;
      if (report) {
        currentReportId = report.id;

        const viewModal = document.getElementById("viewReportModal");
        viewModal.querySelector("#view-report-title").value = report.title;
        viewModal.querySelector("#report-content").value = report.content;

        viewModal.querySelector("#update-report-form").dataset.reportId =
          reportId;

        // Display images
        refreshViewModalImages(reportId);
      }
    };
  }
  function displayReports() {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      console.error("User not authenticated");
      return;
    }

    const transaction = db.transaction(["reportTbl"], "readonly");
    const store = transaction.objectStore("reportTbl");
    const index = store.index("userId");
    const request = index.getAll(userId);

    request.onsuccess = function (event) {
      const reports = event.target.result;
      const cardContainer = document.querySelector(".card-container");

      if (reports.length > 0) {
        cardContainer.innerHTML = "";

        // Sort reports by date (newest first)
        reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        reports.forEach((report) => {
          const date = new Date(report.createdAt);
          const formattedDate = date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          const card = document.createElement("a");
          card.href = "#";
          card.className = "report-card mb-2";
          card.setAttribute("data-bs-toggle", "modal");
          card.setAttribute("data-bs-target", "#viewReportModal");
          card.setAttribute("data-report-id", report.id);

          card.innerHTML = `
            <span id="title" class="text-truncate" style="width: calc(100% - 10px);">${report.title}</span>
            <span id="separator"></span>
            <div class="report-content-container">
                <p class="text-truncate m-0" style="width: calc(100% - 40px);">${report.content}</p>
                <p id="date" class="text-end mt-2">${formattedDate}</p>
            </div>
          `;

          card.addEventListener("click", function () {
            loadReportDetails(report.id);
          });

          cardContainer.appendChild(card);
        });
      } else {
        cardContainer.innerHTML = "<p>No reports found</p>";
      }
    };
  }

  // ========================
  // DATE SEARCH FUNCTIONALITY
  // ========================
  function setupDateSearch() {
    const dateInput = document.getElementById("report-search-input");
    if (dateInput) {
      dateInput.addEventListener("change", function (e) {
        filterReportsByDate(e.target.value);
      });
    }
  }
  function filterReportsByDate(selectedDate) {
    if (!db) {
      console.error("Database not initialized");
      return;
    }

    const userId = localStorage.getItem("userId");
    if (!userId) {
      console.error("User not authenticated");
      return;
    }

    const transaction = db.transaction(["reportTbl"], "readonly");
    const store = transaction.objectStore("reportTbl");

    // First get all reports for the current user using the userId index
    const userIndex = store.index("userId");
    const userRequest = userIndex.getAll(userId);

    userRequest.onsuccess = function (event) {
      const userReports = event.target.result;
      const cardContainer = document.querySelector(".card-container");

      if (!selectedDate) {
        // If no date selected, just display all user reports
        displayReports();
        return;
      }

      // Filter user reports by date
      const filteredReports = userReports.filter((report) => {
        const reportDate = new Date(report.createdAt);
        const searchDate = new Date(selectedDate);

        return (
          reportDate.getFullYear() === searchDate.getFullYear() &&
          reportDate.getMonth() === searchDate.getMonth() &&
          reportDate.getDate() === searchDate.getDate()
        );
      });

      if (filteredReports.length > 0) {
        cardContainer.innerHTML = "";
        filteredReports.forEach((report) => {
          const date = new Date(report.createdAt);
          const formattedDate = date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          const card = document.createElement("a");
          card.href = "#";
          card.className = "report-card mb-2";
          card.setAttribute("data-bs-toggle", "modal");
          card.setAttribute("data-bs-target", "#viewReportModal");
          card.setAttribute("data-report-id", report.id);

          card.innerHTML = `
          <span id="title" class="text-truncate" style="width: calc(100% - 10px);">${report.title}</span>
          <span id="separator"></span>
          <div class="report-content-container">
            <p class="text-truncate m-0" style="width: calc(100% - 40px);">${report.content}</p>
            <p id="date" class="text-end mt-2">${formattedDate}</p>
          </div>
        `;

          card.addEventListener("click", function () {
            loadReportDetails(report.id);
          });

          cardContainer.appendChild(card);
        });
      } else {
        cardContainer.innerHTML = "<p>No reports found for this date</p>";
      }
    };

    userRequest.onerror = function (event) {
      console.error("Error fetching user reports:", event.target.error);
    };
  }
});

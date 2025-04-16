if ("serveiceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => console.log("Service Worker Registered"))
    .catch((err) => console.log("Service Worker Registration Failed", err));
}

window.dbReady = initDB("SOJTMSDB", 1, [
  {
    name: "studentInfoTbl",
    options: { keyPath: "id", autoIncrement: true },
    indexes: [
      { name: "userId", keyPath: "userId", options: { unique: true } },
      { name: "studentId", keyPath: "studentId" },
      { name: "companyName", keyPath: "companyName" },
    ],
  },
  {
    name: "recordTbl",
    options: { keyPath: "id", autoIncrement: true },
    indexes: [
      { name: "userId", keyPath: "userId", options: { unique: true } },
      { name: "recordId", keyPath: "recordId", options: { unique: true } },
      { name: "createdAt", keyPath: "createdAt" },
    ],
  },
]).then(() => {
  console.log("IndexedDB is ready.");
});

function clearAllLocalStorage() {
  localStorage.clear();
  console.log("All local storage has been cleared.");
}

var UPLOAD_FOLDER_ID = "1H3y_VOXOc0G1E19B0CqbLiu8d8Nxtryu";
var ALLOWED_IMAGE_MIME_TYPES = {
  "image/jpeg": true,
  "image/png": true,
  "image/gif": true,
  "image/webp": true
};
var CHECK_FILE_PREFIX = "gas-permission-check";

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No upload payload received.");
    }

    var data = JSON.parse(e.postData.contents);
    var base64Data = String(data.base64 || "").replace(/^data:[^,]+,/, "");
    var fileName = sanitizeFileName(data.fileName || "uploaded-image");
    var mimeType = String(data.mimeType || "").toLowerCase();

    if (!base64Data) {
      throw new Error("Missing image data.");
    }

    if (!ALLOWED_IMAGE_MIME_TYPES[mimeType]) {
      throw new Error("Unsupported image type: " + mimeType);
    }

    var decodedData = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decodedData, mimeType, fileName);

    var folder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);

    var file = folder.createFile(blob);

    var sharingWarning = "";
    try {
      // Make the file publicly viewable.
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingError) {
      // Some Workspace/Drive policies block public sharing even when upload is allowed.
      // The upload should still be treated as successful because the file was created.
      sharingWarning = sharingError.toString();
    }

    var fileId = file.getId();

    // Drive thumbnail URL used by the frontend/backend image display helpers.
    var directUrl = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w4000";
    var webViewLink = "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing";

    return createJsonResponse({
      success: true,
      fileId: fileId,
      url: directUrl,
      webViewLink: webViewLink,
      sharingWarning: sharingWarning
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error.toString()
    });
  }
}

// Browsers convert POST redirects (302) into GET requests.
// If this is missing, the browser can throw a CORS/404 error and cancel the payload.
function doGet(e) {
  var action = e && e.parameter ? String(e.parameter.action || "") : "";
  if (action === "check" || action === "diagnostics") {
    return createJsonResponse(checkConfiguration({
      writeTest: e && e.parameter && String(e.parameter.write || "") === "1"
    }));
  }

  return createJsonResponse({
    success: true,
    message: "Web App is running correctly.",
    diagnosticsUrl: "?action=check",
    writeDiagnosticsUrl: "?action=check&write=1"
  });
}

// Run this function once manually in the Apps Script editor to grant Drive permissions.
function setupPermissions() {
  return checkConfiguration({ writeTest: true });
}

function sanitizeFileName(fileName) {
  return String(fileName)
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "uploaded-image";
}

function createJsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkConfiguration(options) {
  options = options || {};

  var summary = {
    success: false,
    checkedAt: new Date().toISOString(),
    folderId: UPLOAD_FOLDER_ID,
    executeAs: "USER_DEPLOYING",
    access: "ANYONE_ANONYMOUS",
    checks: {
      driveAppAccessible: false,
      folderReadable: false,
      folderWritable: false,
      publicSharingAllowed: false,
      cleanupSucceeded: null
    },
    details: {
      effectiveUserEmail: "",
      activeUserEmail: "",
      folderName: "",
      testFileId: ""
    },
    warnings: [],
    errors: [],
    nextSteps: []
  };

  try {
    summary.details.effectiveUserEmail = Session.getEffectiveUser().getEmail();
  } catch (error) {
    summary.warnings.push("Could not read effective user email: " + error.toString());
  }

  try {
    summary.details.activeUserEmail = Session.getActiveUser().getEmail();
  } catch (error) {
    summary.warnings.push("Could not read active user email: " + error.toString());
  }

  try {
    DriveApp.getRootFolder();
    summary.checks.driveAppAccessible = true;
  } catch (error) {
    summary.errors.push("DriveApp is not accessible: " + error.toString());
  }

  var folder = null;
  try {
    folder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
    summary.details.folderName = folder.getName();
    summary.checks.folderReadable = true;
  } catch (error) {
    summary.errors.push("Upload folder is not readable: " + error.toString());
  }

  if (folder && options.writeTest) {
    var testFile = null;
    try {
      var testName = CHECK_FILE_PREFIX + "-" + Utilities.formatDate(new Date(), "Asia/Manila", "yyyy-MM-dd_HH-mm-ss") + ".txt";
      var testBlob = Utilities.newBlob("permission check", "text/plain", testName);
      testFile = folder.createFile(testBlob);
      summary.details.testFileId = testFile.getId();
      summary.checks.folderWritable = true;
    } catch (error) {
      summary.errors.push("Upload folder is not writable: " + error.toString());
    }

    if (testFile) {
      try {
        testFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        summary.checks.publicSharingAllowed = true;
      } catch (error) {
        summary.warnings.push("Public link sharing is blocked or not allowed: " + error.toString());
      }

      try {
        testFile.setTrashed(true);
        summary.checks.cleanupSucceeded = true;
      } catch (error) {
        summary.checks.cleanupSucceeded = false;
        summary.warnings.push("Could not trash the test file. Delete it manually if needed: " + summary.details.testFileId);
      }
    }
  } else if (folder) {
    summary.nextSteps.push("Run setupPermissions() manually, or open this web app with ?action=check&write=1, to test file creation and public sharing.");
  }

  if (!summary.checks.driveAppAccessible) {
    summary.nextSteps.push("Add the Drive OAuth scope in appsscript.json and reauthorize the deployment.");
  }

  if (!summary.checks.folderReadable) {
    summary.nextSteps.push("Verify UPLOAD_FOLDER_ID and make sure the deploying account can access the folder.");
  }

  if (options.writeTest && !summary.checks.folderWritable) {
    summary.nextSteps.push("Make sure the deploying account has Editor access to the upload folder.");
  }

  if (options.writeTest && summary.checks.folderWritable && !summary.checks.publicSharingAllowed) {
    summary.nextSteps.push("The upload can work, but public image display may fail until folder/file link sharing is allowed by Drive or Workspace policy.");
  }

  summary.success =
    summary.checks.driveAppAccessible &&
    summary.checks.folderReadable &&
    (!options.writeTest || summary.checks.folderWritable);

  if (summary.success && options.writeTest && summary.checks.publicSharingAllowed) {
    summary.nextSteps.push("Everything required for upload and public image display is configured.");
  } else if (summary.success && !options.writeTest) {
    summary.nextSteps.push("Basic Drive access is configured. Run the write diagnostics to confirm upload and sharing.");
  }

  return summary;
}
